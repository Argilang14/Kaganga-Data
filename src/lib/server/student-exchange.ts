import { canAttendance } from '$lib/attendance-access';
import {
	loadPersonalQrMap,
	preparePersonalQr,
	rememberScannedQr,
	type PersonalQr
} from './student-qr';
import { hashQrToken, resolvePrintableQrToken } from './student-qr-token';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { and, asc, eq, isNull } from 'drizzle-orm';
import db from '$lib/server/db';
import {
	tableAlamat,
	tableAsramaKamar,
	tableAsramaPenempatan,
	tableMurid,
	tableQrMurid,
	tableMuridIdentityLink,
	tableMuridLifecycle,
	tableMuridProfilTambahan,
	tableMuridSumberSetara,
	tableSekolah,
	tableSekolahSatuanPendidikan,
	tableSemester,
	tableWaliMurid
} from '$lib/server/db/schema';
import { ensureDataGovernanceSchema } from '$lib/server/db/ensure-data-governance';
import { ensureEducationUnitsSchema } from '$lib/server/db/ensure-education-units';
import { ensureMuridProfileSchema } from '$lib/server/db/ensure-murid-profile';
import { ensureStudentExchangeSchema } from '$lib/server/db/ensure-student-exchange';
import { ensureDormitorySchema } from '$lib/server/db/ensure-dormitory';
import { linkMuridIdentity } from '$lib/server/murid-identity-service';
import { syncMuridGovernance } from '$lib/server/murid-lifecycle';
import { identityIntegrityProblem } from '$lib/server/murid-identity-integrity';
import {
	muridIdentityKey,
	normalizedIdentityText,
	normalizedNisn,
	validNisn
} from '$lib/server/murid-identity';
import { writeAuditLog } from '$lib/server/audit-log';
import {
	canonicalStudentHeader,
	exchangeDate,
	exchangeGender,
	exchangeText,
	setaraStudentHeaders,
	studentExchangeHeaders,
	type StudentExchangeFields,
	type StudentImportPreview
} from '$lib/student-exchange';

type Reader = typeof db | DBTransaction;
type ImportContext = { schoolId: number; semesterId: number; qrManage?: boolean };
type ParsedRow = { row: number; fields: StudentExchangeFields; errors: string[] };
type ParsedFile = { filename: string; hash: string; rows: ParsedRow[] };

// The local ExcelJS declarations do not expose the CSV API or all workbook styling APIs.
type ExchangeSheet = {
	rowCount: number;
	getRow(index: number): { values: unknown[]; height: number; font: object; fill: object };
	addRow(values: string[]): void;
	getColumn(index: number): { width: number; numFmt: string };
	views: object[];
	autoFilter: string;
};
type ExchangeWorkbook = {
	creator: string;
	addWorksheet(name: string): ExchangeSheet;
	worksheets: ExchangeSheet[];
	xlsx: { load(value: Uint8Array): Promise<unknown>; writeBuffer(): Promise<ArrayBuffer> };
	csv: { read(stream: Readable, options: object): Promise<ExchangeSheet> };
};
const workbook = () => new ExcelJS.Workbook() as unknown as ExchangeWorkbook;
const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');

export class StudentExchangeError extends Error {
	constructor(
		message: string,
		public status = 400
	) {
		super(message);
	}
}

export function requireStudentExchangeAccess(locals: App.Locals) {
	if (!locals.user) throw new StudentExchangeError('Silakan masuk terlebih dahulu.', 401);
	if (!locals.sekolah?.id) throw new StudentExchangeError('Pilih sekolah terlebih dahulu.');
	if (locals.user.type !== 'admin' && !locals.user.permissions?.includes('rapor_manage'))
		throw new StudentExchangeError('Anda tidak memiliki izin mengelola data rapor.', 403);
	return locals.sekolah.id;
}

export async function prepareStudentExchange() {
	await preparePersonalQr();
	await ensureDataGovernanceSchema();
	await ensureEducationUnitsSchema();
	await ensureMuridProfileSchema();
	await ensureDormitorySchema();
	await ensureStudentExchangeSchema();
}

export async function readStudentExchange(file: File): Promise<ParsedFile> {
	if (!file.size || file.size > 2 * 1024 * 1024)
		throw new StudentExchangeError('Pilih file CSV atau XLSX berukuran maksimal 2 MB.');
	const bytes = new Uint8Array(await file.arrayBuffer());
	let sheet: ExchangeSheet | undefined;
	let headerRow = 0;
	let headers: Array<string | undefined> = [];
	const findHeader = (candidate: ExchangeSheet) => {
		for (let index = 1; index <= Math.min(candidate.rowCount, 20); index++) {
			const labels = candidate.getRow(index).values.slice(1).map(canonicalStudentHeader);
			if (labels.includes('Nama Peserta Didik') && labels.includes('Tanggal Lahir')) {
				sheet = candidate;
				headers = labels;
				headerRow = index;
				return true;
			}
		}
		return false;
	};
	if (/\.csv$/i.test(file.name)) {
		let contents: string;
		try {
			contents = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
		} catch {
			throw new StudentExchangeError('CSV harus memakai UTF-8. Ekspor ulang file dari Setara.');
		}
		for (const delimiter of [';', ',']) {
			try {
				const candidate = await workbook().csv.read(Readable.from([contents]), {
					map: (value: string) => value,
					parserOptions: { delimiter, ignoreEmpty: true }
				});
				if (findHeader(candidate)) break;
			} catch {
				/* Try the other supported CSV separator. */
			}
		}
	} else if (/\.xlsx$/i.test(file.name)) {
		try {
			const book = workbook();
			await book.xlsx.load(bytes);
			book.worksheets.some(findHeader);
		} catch {
			throw new StudentExchangeError(
				'File XLSX tidak dapat dibaca. Periksa atau simpan ulang file.'
			);
		}
	} else
		throw new StudentExchangeError(
			'Gunakan CSV Setara atau XLSX. Simpan file XLS lama sebagai XLSX.'
		);
	if (!sheet)
		throw new StudentExchangeError(
			'Header tidak dikenali. Kolom Nama Peserta Didik/Nama dan Tanggal Lahir diperlukan.'
		);
	const recognized = headers.filter(Boolean);
	if (new Set(recognized).size !== recognized.length)
		throw new StudentExchangeError(
			'Ada nama kolom ganda, termasuk alias NIS/NIPD. Periksa header file.'
		);
	if (sheet.rowCount - headerRow > 500)
		throw new StudentExchangeError('Maksimal 500 siswa per file. Pisahkan file sebelum mengimpor.');
	const rows: ParsedRow[] = [];
	for (let index = headerRow + 1; index <= sheet.rowCount; index++) {
		const values = sheet.getRow(index).values.slice(1);
		if (!values.some((value) => exchangeText(value))) continue;
		const fields: StudentExchangeFields = {};
		const errors: string[] = [];
		headers.forEach((header, column) => {
			if (!header) return;
			const value = values[column];
			if (value && typeof value === 'object' && !(value instanceof Date)) {
				errors.push(`${header}: gunakan nilai teks, bukan rumus atau objek Excel.`);
				return;
			}
			if (
				typeof value === 'number' &&
				/NIK|NIS|KK/.test(header) &&
				(!Number.isSafeInteger(value) || Math.abs(value) >= 1e15)
			)
				errors.push(`${header}: angka kehilangan ketelitian; isi ulang sebagai teks.`);
			fields[header] =
				header === 'NISN' ? normalizedNisn(exchangeText(value)) : exchangeText(value);
			if (fields[header].length > 2000) errors.push(`${header}: isi terlalu panjang.`);
		});
		rows.push({ row: index, fields, errors });
	}
	if (!rows.length) throw new StudentExchangeError('File belum berisi data siswa.');
	return { filename: file.name.slice(0, 200), hash: digest(bytes), rows };
}

async function snapshot(context: ImportContext, reader: Reader) {
	const school = await reader.query.tableSekolah.findFirst({
		columns: { id: true, nama: true, npsn: true, jenjangPendidikan: true },
		where: eq(tableSekolah.id, context.schoolId)
	});
	const semester = await reader.query.tableSemester.findFirst({
		where: eq(tableSemester.id, context.semesterId),
		with: { tahunAjaran: true }
	});
	if (!school || !semester || semester.tahunAjaran.sekolahId !== context.schoolId)
		throw new StudentExchangeError('Semester tidak ditemukan untuk sekolah aktif.', 404);
	const students = await reader.query.tableMurid.findMany({
		where: eq(tableMurid.sekolahId, context.schoolId),
		orderBy: asc(tableMurid.id),
		with: { alamat: true, ayah: true, ibu: true, wali: true, kelas: true }
	});
	const links = await reader
		.select()
		.from(tableMuridIdentityLink)
		.where(eq(tableMuridIdentityLink.sekolahId, context.schoolId))
		.orderBy(asc(tableMuridIdentityLink.muridId));
	const lifecycles = await reader
		.select()
		.from(tableMuridLifecycle)
		.where(eq(tableMuridLifecycle.sekolahId, context.schoolId))
		.orderBy(asc(tableMuridLifecycle.id));
	const sources = await reader
		.select()
		.from(tableMuridSumberSetara)
		.where(eq(tableMuridSumberSetara.sekolahId, context.schoolId))
		.orderBy(asc(tableMuridSumberSetara.id));
	const profiles = await reader
		.select()
		.from(tableMuridProfilTambahan)
		.where(eq(tableMuridProfilTambahan.sekolahId, context.schoolId))
		.orderBy(asc(tableMuridProfilTambahan.id));
	const units = await reader
		.select()
		.from(tableSekolahSatuanPendidikan)
		.where(eq(tableSekolahSatuanPendidikan.sekolahId, context.schoolId))
		.orderBy(asc(tableSekolahSatuanPendidikan.id));
	const placements = await reader
		.select({ placement: tableAsramaPenempatan, room: tableAsramaKamar.nama })
		.from(tableAsramaPenempatan)
		.innerJoin(tableAsramaKamar, eq(tableAsramaPenempatan.kamarId, tableAsramaKamar.id))
		.where(
			and(
				eq(tableAsramaPenempatan.sekolahId, context.schoolId),
				isNull(tableAsramaPenempatan.selesai)
			)
		)
		.orderBy(asc(tableAsramaPenempatan.id));
	// Hashes and ownership only: raw codes from other schools never enter an import plan.
	const qrRows = await reader
		.select({
			id: tableQrMurid.id,
			muridId: tableQrMurid.muridId,
			schoolId: tableMurid.sekolahId,
			tokenHash: tableQrMurid.tokenHash,
			tokenVersion: tableQrMurid.tokenVersion,
			revokedAt: tableQrMurid.revokedAt
		})
		.from(tableQrMurid)
		.innerJoin(tableMurid, eq(tableMurid.id, tableQrMurid.muridId))
		.orderBy(asc(tableQrMurid.id));
	const uidOwners = await reader
		.select({ uid: tableMuridIdentityLink.identityUid, schoolId: tableMuridIdentityLink.sekolahId })
		.from(tableMuridIdentityLink)
		.orderBy(asc(tableMuridIdentityLink.muridId));
	return {
		school,
		semester,
		students,
		links,
		lifecycles,
		sources,
		profiles,
		units,
		placements,
		qrRows,
		uidOwners
	};
}
type Snapshot = Awaited<ReturnType<typeof snapshot>>;

function planRows(parsed: ParsedFile, context: ImportContext, state: Snapshot) {
	const uidById = new Map(state.links.map((link) => [link.muridId, link.identityUid]));
	const allowedNpsn = new Set([state.school.npsn, ...state.units.map((unit) => unit.npsn)]);
	const seen = new Map<string, number[]>();
	for (const source of parsed.rows) {
		for (const header of ['NIK', 'NISN', 'NIS', 'UID Kaganga', 'Kode QR Murid']) {
			const value = source.fields[header];
			if (!value) continue;
			const key =
				header + ':' + (header === 'Kode QR Murid' ? value : normalizedIdentityText(value));
			seen.set(key, [...(seen.get(key) ?? []), source.row]);
		}
	}
	const planned = parsed.rows.map((source) => {
		const f = source.fields;
		const errors = [...source.errors];
		const name = f['Nama Peserta Didik'] ?? '';
		const birth = exchangeDate(f['Tanggal Lahir']);
		const gender = exchangeGender(f['Jenis Kelamin']);
		if (!name || !birth || !gender)
			errors.push(
				'Nama, tanggal lahir yang sah, dan jenis kelamin L/P atau Laki-laki/Perempuan wajib diisi.'
			);
		for (const header of ['NIK', 'No. KK', 'NIK Ayah', 'NIK Ibu Kandung', 'NIK Wali'])
			if (f[header] && !/^\d{16}$/.test(f[header]))
				errors.push(`${header} harus 16 digit teks atau dikosongkan.`);
		if (f.NISN && !validNisn(f.NISN)) errors.push('NISN harus 10 digit teks atau dikosongkan.');
		if (f.Desil && !/^(?:[1-9]|10)$/.test(f.Desil)) errors.push('Desil harus 1 sampai 10.');
		if (f['Tanggal Masuk'] && !exchangeDate(f['Tanggal Masuk']))
			errors.push('Tanggal Masuk tidak sah.');
		if (f['NPSN Sekolah'] && !allowedNpsn.has(f['NPSN Sekolah']))
			errors.push('NPSN di luar sekolah atau satuan pendidikan yang terdaftar.');
		for (const header of ['NIK', 'NISN', 'NIS', 'UID Kaganga', 'Kode QR Murid']) {
			const duplicates = seen.get(
				header +
					':' +
					(header === 'Kode QR Murid' ? f[header] : normalizedIdentityText(f[header] ?? ''))
			);
			if (duplicates && duplicates.length > 1)
				errors.push(`${header} ganda pada baris ${duplicates.join(', ')}.`);
		}
		const temporaryNis = `TMP-${digest(
			`${context.schoolId}:${f.NIK || f.NISN || normalizedIdentityText(name) + ':' + birth}`
		)
			.slice(0, 12)
			.toUpperCase()}`;
		const candidates = state.students.filter(
			(student) =>
				(f['UID Kaganga'] && uidById.get(student.id) === f['UID Kaganga']) ||
				(f.NIK && student.nik === f.NIK) ||
				(f.NISN && normalizedNisn(student.nisn) === f.NISN) ||
				(f.NIS && normalizedIdentityText(student.nis) === normalizedIdentityText(f.NIS)) ||
				(student.nis === temporaryNis &&
					state.sources.some(
						(entry) =>
							entry.identityUid === uidById.get(student.id) && entry.temporaryNis === temporaryNis
					))
		);
		const identities = new Set(
			candidates.map((student) => uidById.get(student.id) ?? `unlinked:${student.id}`)
		);
		if (identities.size > 1)
			errors.push('Penanda identitas mengarah ke beberapa murid. Periksa NIS, NISN, NIK, dan UID.');
		let uid = identities.size === 1 ? uidById.get(candidates[0].id) : undefined;
		const suppliedUid = f['UID Kaganga'];
		if (suppliedUid && suppliedUid !== uid) {
			const validUnused =
				!candidates.length &&
				/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(suppliedUid) &&
				!state.uidOwners.some((owner) => owner.uid === suppliedUid);
			if (validUnused) uid = suppliedUid;
			else
				errors.push(
					'UID Kaganga tidak cocok atau sudah digunakan. Periksa identitas di sekolah tujuan.'
				);
		}
		const members = uid
			? state.students.filter((student) => uidById.get(student.id) === uid)
			: candidates;
		const target = members.find((student) => student.semesterId === context.semesterId);
		if (candidates.length && !target)
			errors.push(
				'Murid sudah ada pada semester lain. Salin semester atau proses kenaikan kelas terlebih dahulu.'
			);
		if (target) {
			if (!uid)
				errors.push('Identitas internal murid belum tersedia. Periksa identitas sebelum impor.');
			const problem = identityIntegrityProblem(
				members.map((member) => ({
					...member,
					linkSchoolId: state.links.find((link) => link.muridId === member.id)?.sekolahId ?? 0,
					linkSemesterId: state.links.find((link) => link.muridId === member.id)?.semesterId ?? 0
				})),
				context.schoolId,
				target.id
			);
			if (problem) errors.push(problem);
			if (
				normalizedIdentityText(target.nama) !== normalizedIdentityText(name) ||
				target.tanggalLahir !== birth
			)
				errors.push(
					'Nama atau tanggal lahir berbeda dari murid yang ditemukan. Koreksi identitas melalui Data Murid.'
				);
			if (f.NIK && members.some((member) => member.nik && member.nik !== f.NIK))
				errors.push('NIK berbeda dari data murid yang ditemukan.');
			if (
				f.NISN &&
				members.some(
					(member) => normalizedNisn(member.nisn) && normalizedNisn(member.nisn) !== f.NISN
				)
			)
				errors.push('NISN berbeda dari data murid yang ditemukan.');
			if (f.NIS && f.NIS !== target.nis && members.length > 1)
				errors.push(
					'Perubahan NIS lintas semester harus melalui koreksi identitas agar riwayat tetap terhubung.'
				);
		}
		if (
			!candidates.length &&
			state.students.some(
				(student) =>
					normalizedIdentityText(student.nama) === normalizedIdentityText(name) &&
					student.tanggalLahir === birth
			)
		)
			errors.push(
				'Nama dan tanggal lahir sudah ada, tetapi penanda identitas belum cocok. Periksa agar tidak membuat murid ganda.'
			);
		const lifecycle = uid
			? state.lifecycles.find(
					(entry) => uid && entry.identityKey === muridIdentityKey({ identityUid: uid })
				)
			: undefined;
		if (lifecycle && (lifecycle.status !== 'aktif' || lifecycle.needsIdentityReview))
			errors.push(
				'Murid berstatus pindah, keluar, lulus, atau menunggu pemeriksaan. Impor tidak memulihkan status murid.'
			);
		const prior = state.sources.find((entry) => entry.identityUid === uid);
		const nis = f.NIS || target?.nis || temporaryNis;
		if (
			state.students.some(
				(student) =>
					student.semesterId === context.semesterId &&
					student.id !== target?.id &&
					normalizedIdentityText(student.nis) === normalizedIdentityText(nis)
			)
		)
			errors.push('NIS sudah digunakan murid lain pada semester tujuan.');
		if (
			f['Status Murid'] &&
			!target &&
			!['aktif', 'pasif', 'belum ditempatkan'].includes(f['Status Murid'].toLowerCase())
		)
			errors.push(
				'Siswa baru hanya dapat ditambahkan sebagai Murid Pasif. Status mutasi diproses melalui Data Murid.'
			);
		const qrToken = f['Kode QR Murid'] || '';
		const memberIds = new Set(members.map((member) => member.id));
		const activeQr = state.qrRows.filter((qr) => memberIds.has(qr.muridId) && !qr.revokedAt);
		if (qrToken) {
			if (!context.qrManage)
				errors.push(
					'Izin pengelolaan QR diperlukan untuk mengimpor Kode QR Murid. Kosongkan kolom QR untuk impor biodata saja.'
				);
			if (qrToken.length > 512 || !/^rapkumer-absensi:[A-Za-z0-9_.:+-]+$/.test(qrToken))
				errors.push('Format Kode QR Murid tidak sah. Salin kode utuh dari cadangan Kaganga.');
			const hash = hashQrToken(qrToken);
			const owner = state.qrRows.find((qr) => qr.tokenHash === hash);
			if (owner?.revokedAt)
				errors.push('Kode QR sudah dicabut dan tidak dapat dipulihkan melalui impor.');
			else if (owner && (!memberIds.has(owner.muridId) || owner.schoolId !== context.schoolId))
				errors.push('Kode QR sudah digunakan murid lain.');
			if (activeQr.length > 1)
				errors.push('Ada beberapa QR aktif untuk murid ini. Periksa melalui pengelolaan kartu.');
			else if (activeQr.length === 1 && activeQr[0].tokenHash !== hash)
				errors.push(
					'Kode QR berbeda dari kartu aktif. Impor tidak mengganti atau mencabut QR lama.'
				);
		}
		return {
			row: source.row,
			name,
			nis,
			temporary: target ? prior?.temporaryNis === nis : !f.NIS,
			action: errors.length
				? ('blocked' as const)
				: target
					? ('update' as const)
					: ('new' as const),
			message: errors.length
				? [...new Set(errors)].join(' ')
				: target
					? 'Perbarui biodata; kelas, asrama, wali asuh, status, dan nilai tetap.'
					: 'Tambahkan ke Murid Pasif tanpa kelas dan asrama.',
			target,
			uid,
			source
		};
	});
	for (const row of planned) {
		if (
			planned.some(
				(other) =>
					other !== row &&
					(normalizedIdentityText(other.nis) === normalizedIdentityText(row.nis) ||
						(row.target && row.target.id === other.target?.id))
			)
		) {
			row.action = 'blocked';
			row.message +=
				' Beberapa baris mengarah ke murid atau NIS tujuan yang sama. Sisakan satu baris per murid.';
		}
	}
	return planned;
}

async function makePlan(parsed: ParsedFile, context: ImportContext, reader: Reader) {
	const state = await snapshot(context, reader);
	const rows = planRows(parsed, context, state);
	return {
		state,
		rows,
		token: digest(
			JSON.stringify({
				context,
				file: parsed.hash,
				state,
				rows: rows.map(({ source, target, ...row }) => ({
					...row,
					sourceRow: source.row,
					targetId: target?.id
				}))
			})
		)
	};
}

export async function previewStudentExchange(
	parsed: ParsedFile,
	context: ImportContext
): Promise<StudentImportPreview> {
	await prepareStudentExchange();
	const plan = await makePlan(parsed, context, db);
	return {
		token: plan.token,
		filename: parsed.filename,
		semester: `${plan.state.semester.tahunAjaran.nama} / ${plan.state.semester.nama}`,
		rows: plan.rows.map(({ row, name, nis, temporary, action, message }) => ({
			row,
			name,
			nis,
			temporary,
			action,
			message
		}))
	};
}

export async function commitStudentExchange(
	parsed: ParsedFile,
	context: ImportContext,
	token: string,
	selected: number[],
	actor: { locals: App.Locals; request?: Request }
) {
	await prepareStudentExchange();
	context = { ...context, qrManage: canAttendance(actor.locals.user, 'qr_manage') };
	if (
		!selected.length ||
		selected.some((row) => !Number.isInteger(row)) ||
		new Set(selected).size !== selected.length
	)
		throw new StudentExchangeError('Pilih setidaknya satu baris yang siap disimpan.');
	return db.transaction(async (tx) => {
		const plan = await makePlan(parsed, context, tx);
		if (token !== plan.token)
			throw new StudentExchangeError(
				'Data atau file berubah sejak pratinjau. Buat pratinjau ulang sebelum menyimpan.',
				409
			);
		const rows = plan.rows.filter((row) => selected.includes(row.row));
		if (rows.length !== selected.length || rows.some((row) => row.action === 'blocked'))
			throw new StudentExchangeError(
				'Pilihan berisi baris bermasalah. Periksa pratinjau terlebih dahulu.'
			);
		const ids: number[] = [];
		const now = new Date().toISOString();
		for (const row of rows) {
			const f = row.source.fields;
			const old = row.target;
			const addressFields = {
				jalan: f['Alamat Domisili'] || f['Alamat KK'] || old?.alamat.jalan || '',
				desa: f['Kelurahan/Desa Domisili'] || f['Kelurahan/Desa KK'] || old?.alamat.desa || '',
				kecamatan: f['Kecamatan Domisili'] || f['Kecamatan KK'] || old?.alamat.kecamatan || '',
				kabupaten:
					f['Kabupaten/Kota Domisili'] || f['Kabupaten/Kota KK'] || old?.alamat.kabupaten || '',
				provinsi: f['Provinsi Domisili'] || f['Provinsi KK'] || old?.alamat.provinsi || null,
				kodePos: f['Kode Pos'] || old?.alamat.kodePos || null
			};
			let alamatId = old?.alamatId;
			if (
				!old ||
				Object.entries(addressFields).some(
					([key, value]) => old.alamat[key as keyof typeof addressFields] !== value
				)
			)
				alamatId = (
					await tx.insert(tableAlamat).values(addressFields).returning({ id: tableAlamat.id })
				)[0].id;
			const parentIds: { ayahId?: number | null; ibuId?: number | null; waliId?: number | null } =
				{};
			for (const [kind, nameHeader, jobHeader, contactHeader] of [
				['ayah', 'Nama Ayah', 'Pekerjaan Ayah', 'Kontak Ayah'],
				['ibu', 'Nama Ibu Kandung', 'Pekerjaan Ibu', 'Kontak Ibu'],
				['wali', 'Nama Wali', 'Pekerjaan Wali', 'Kontak Wali']
			] as const) {
				const previous = old?.[kind];
				if (!f[nameHeader] && !f[jobHeader] && !f[contactHeader]) continue;
				const parent = {
					nama: f[nameHeader] || previous?.nama || '',
					pekerjaan: f[jobHeader] || previous?.pekerjaan || '',
					kontak: f[contactHeader] || previous?.kontak || null,
					alamat: previous?.alamat ?? null
				};
				if (
					previous &&
					Object.entries(parent).every(
						([key, value]) => previous[key as keyof typeof parent] === value
					)
				)
					continue;
				parentIds[`${kind}Id`] = (
					await tx.insert(tableWaliMurid).values(parent).returning({ id: tableWaliMurid.id })
				)[0].id;
			}
			const values = {
				nis: row.nis,
				nisn: f.NISN || old?.nisn || '',
				nama: old?.nama ?? row.name,
				tanggalLahir: exchangeDate(f['Tanggal Lahir'])!,
				jenisKelamin: exchangeGender(f['Jenis Kelamin'])!,
				tempatLahir: f['Tempat Lahir'] || old?.tempatLahir || '',
				agama: f.Agama || old?.agama || '',
				pendidikanSebelumnya: f['Sekolah Asal'] || old?.pendidikanSebelumnya || '',
				nik: f.NIK || old?.nik || null,
				anakKe: f['Anak Ke'] && /^\d+$/.test(f['Anak Ke']) ? Number(f['Anak Ke']) : old?.anakKe,
				alamatId: alamatId!,
				...parentIds,
				updatedAt: now
			};
			let id: number;
			if (old) {
				id = old.id;
				await tx
					.update(tableMurid)
					.set(values)
					.where(and(eq(tableMurid.id, id), eq(tableMurid.sekolahId, context.schoolId)));
			} else {
				id = (
					await tx
						.insert(tableMurid)
						.values({
							...values,
							sekolahId: context.schoolId,
							semesterId: context.semesterId,
							kelasId: null,
							tanggalMasuk: exchangeDate(f['Tanggal Masuk']) || now.slice(0, 10)
						})
						.returning({ id: tableMurid.id })
				)[0].id;
			}
			const uid = await linkMuridIdentity(
				tx,
				context.schoolId,
				{ ...values, id, semesterId: context.semesterId },
				row.uid
			);
			const qrToken = f['Kode QR Murid'];
			if (qrToken) {
				const existing = await tx.query.tableQrMurid.findFirst({
					where: eq(tableQrMurid.tokenHash, hashQrToken(qrToken))
				});
				if (existing) await rememberScannedQr(existing, qrToken, tx);
				else
					await tx.insert(tableQrMurid).values({
						muridId: id,
						tokenHash: hashQrToken(qrToken),
						tokenValue: qrToken,
						issuedAt: now,
						createdAt: now,
						updatedAt: now
					});
				await writeAuditLog(
					{
						...actor,
						action: 'import',
						entityType: 'qr_murid',
						entityId: id,
						summary: 'Kode QR murid dipulihkan dari cadangan.',
						after: { restored: !existing }
					},
					tx
				);
			}
			if (old)
				await tx
					.update(tableMuridLifecycle)
					.set({ nis: values.nis, nisn: values.nisn || null, updatedAt: now })
					.where(
						and(
							eq(tableMuridLifecycle.sekolahId, context.schoolId),
							eq(tableMuridLifecycle.identityKey, muridIdentityKey({ identityUid: uid }))
						)
					);
			const prior = plan.state.sources.find((entry) => entry.identityUid === uid);
			const fields = {
				...prior?.fields,
				...Object.fromEntries(
					Object.entries(f).filter(([key, value]) => key !== 'Kode QR Murid' && value !== '')
				)
			};
			const provenance = {
				fields,
				temporaryNis: row.temporary ? row.nis : null,
				sourceFilename: parsed.filename,
				sourceHash: parsed.hash,
				sourceRow: row.row,
				importedBy: actor.locals.user?.id ?? null,
				importedAt: now,
				revision: (prior?.revision ?? 0) + 1
			};
			await tx
				.insert(tableMuridSumberSetara)
				.values({ ...provenance, sekolahId: context.schoolId, identityUid: uid })
				.onConflictDoUpdate({
					target: [tableMuridSumberSetara.sekolahId, tableMuridSumberSetara.identityUid],
					set: provenance
				});
			const profile = plan.state.profiles.find((entry) => entry.identityUid === uid);
			const profilePatch = {
				...(f['No. KK'] ? { nomorKk: f['No. KK'] } : {}),
				...(f.Desil ? { desilDtsen: Number(f.Desil) } : {}),
				...(f['RT Domisili'] || f['RT KK'] ? { rt: f['RT Domisili'] || f['RT KK'] } : {}),
				...(f['RW Domisili'] || f['RW KK'] ? { rw: f['RW Domisili'] || f['RW KK'] } : {})
			};
			if (Object.keys(profilePatch).length) {
				const patch = {
					...profilePatch,
					updatedBy: actor.locals.user?.id ?? null,
					updatedAt: now,
					revisi: (profile?.revisi ?? 0) + 1
				};
				await tx
					.insert(tableMuridProfilTambahan)
					.values({
						...patch,
						sekolahId: context.schoolId,
						identityUid: uid,
						createdBy: actor.locals.user?.id ?? null
					})
					.onConflictDoUpdate({
						target: [tableMuridProfilTambahan.sekolahId, tableMuridProfilTambahan.identityUid],
						set: patch
					});
			}
			ids.push(id);
		}
		// Only new rows need lifecycle initialization; existing placement/history stays untouched.
		const newIds = ids.filter((_, index) => rows[index].action === 'new');
		if (newIds.length) await syncMuridGovernance(context.schoolId, newIds, undefined, {}, tx);
		await writeAuditLog(
			{
				...actor,
				action: 'import',
				entityType: 'murid_setara',
				entityId: context.semesterId,
				summary: `Impor siswa: ${newIds.length} baru, ${rows.length - newIds.length} diperbarui.`,
				after: { fileHash: parsed.hash, semesterId: context.semesterId, muridIds: ids }
			},
			tx
		);
		return { inserted: newIds.length, updated: rows.length - newIds.length };
	});
}

export async function exportStudentExchange(context: ImportContext) {
	await prepareStudentExchange();
	const state = await snapshot(context, db);
	const qrMap = context.qrManage
		? await loadPersonalQrMap(
				context.schoolId,
				state.students
					.filter((student) => student.semesterId === context.semesterId)
					.map((student) => student.id)
			)
		: new Map<number, PersonalQr>();
	for (const [studentId, qr] of qrMap) {
		const token = resolvePrintableQrToken(qr);
		if (!token)
			throw new StudentExchangeError(
				`QR murid ID ${studentId} perlu diperiksa sebelum pencadangan. Pindai kartu lama untuk memulihkan kode atau periksa QR ganda.`,
				409
			);
		await rememberScannedQr(qr, token);
	}
	const records = state.students
		.filter((student) => student.semesterId === context.semesterId)
		.map((student) => {
			const uid = state.links.find((link) => link.muridId === student.id)?.identityUid;
			const source = state.sources.find((entry) => entry.identityUid === uid);
			const profile = state.profiles.find((entry) => entry.identityUid === uid);
			const status =
				state.lifecycles.find(
					(entry) => uid && entry.identityKey === muridIdentityKey({ identityUid: uid })
				)?.status ?? 'aktif';
			const placement = state.placements.find((entry) => entry.placement.identityUid === uid);
			const fields: StudentExchangeFields = { ...source?.fields };
			Object.assign(fields, {
				'Nama Peserta Didik': student.nama,
				NIK: student.nik ?? '',
				NISN: student.nisn,
				'No. KK': profile?.nomorKk ?? fields['No. KK'] ?? '',
				'Jenis Kelamin': student.jenisKelamin === 'L' ? 'Laki-laki' : 'Perempuan',
				'Tempat Lahir': student.tempatLahir,
				'Tanggal Lahir': student.tanggalLahir,
				Agama: student.agama,
				'Anak Ke': student.anakKe == null ? '' : String(student.anakKe),
				'Nama Ayah': student.ayah?.nama ?? '',
				'Pekerjaan Ayah': student.ayah?.pekerjaan ?? '',
				'Nama Ibu Kandung': student.ibu?.nama ?? '',
				'Pekerjaan Ibu': student.ibu?.pekerjaan ?? '',
				'Nama Wali': student.wali?.nama ?? '',
				'Pekerjaan Wali': student.wali?.pekerjaan ?? '',
				'Alamat Domisili': student.alamat.jalan,
				'Kelurahan/Desa Domisili': student.alamat.desa,
				'Kecamatan Domisili': student.alamat.kecamatan,
				'Kabupaten/Kota Domisili': student.alamat.kabupaten,
				'Provinsi Domisili': student.alamat.provinsi ?? '',
				'RT Domisili': profile?.rt ?? fields['RT Domisili'] ?? '',
				'RW Domisili': profile?.rw ?? fields['RW Domisili'] ?? '',
				Sekolah: fields.Sekolah || state.school.nama,
				'NPSN Sekolah': fields['NPSN Sekolah'] || state.school.npsn,
				'Jenjang Pendidikan': fields['Jenjang Pendidikan'] || state.school.jenjangPendidikan,
				'Rombongan Belajar': fields['Rombongan Belajar'] ?? '',
				Desil: profile?.desilDtsen == null ? (fields.Desil ?? '') : String(profile.desilDtsen),
				NIS: student.nis,
				'Jenis NIS': source?.temporaryNis === student.nis ? 'Sementara' : 'Sekolah',
				'UID Kaganga': uid ?? '',
				'Status Murid': status === 'aktif' && (!student.kelasId || !placement) ? 'pasif' : status,
				'Kelas Aktif': student.kelas?.nama ?? '',
				'Asrama Aktif': placement?.room ?? '',
				'Wali Asuh': student.waliAsuhNama ?? '',
				'NIP Wali Asuh': student.waliAsuhNip ?? '',
				'Sekolah Asal': student.pendidikanSebelumnya,
				'Tanggal Masuk': student.tanggalMasuk,
				'Kode Pos': student.alamat.kodePos ?? '',
				'Kontak Ayah': student.ayah?.kontak ?? '',
				'Kontak Ibu': student.ibu?.kontak ?? '',
				'Kontak Wali': student.wali?.kontak ?? '',
				'Kode QR Murid': qrMap.has(student.id)
					? resolvePrintableQrToken(qrMap.get(student.id)!)!
					: ''
			});
			return fields;
		});
	return {
		records,
		semester: `${state.semester.tahunAjaran.nama} / ${state.semester.nama}`,
		school: state.school.nama
	};
}

export async function studentExchangeWorkbook(records: StudentExchangeFields[], info: string) {
	const book = workbook();
	book.creator = 'Kaganga';
	const sheet = book.addWorksheet('Data Siswa');
	sheet.addRow([...studentExchangeHeaders]);
	for (const fields of records)
		sheet.addRow(studentExchangeHeaders.map((header) => fields[header] ?? ''));
	sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
	sheet.getRow(1).height = 40;
	sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
	sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F3D5E' } };
	studentExchangeHeaders.forEach((header, index) => {
		const column = sheet.getColumn(index + 1);
		column.width = Math.min(Math.max(header.length + 3, 16), 32);
		column.numFmt = '@';
	});
	const guide = book.addWorksheet('Petunjuk');
	guide.getColumn(1).width = 30;
	guide.getColumn(2).width = 110;
	for (const values of [
		['Isi file', info],
		[
			'Format',
			`${setaraStudentHeaders.length} kolom Setara + ${studentExchangeHeaders.length - setaraStudentHeaders.length} kolom Kaganga. CSV UTF-8 (; atau ,) dan XLSX diterima.`
		],
		[
			'Wajib',
			'Nama Peserta Didik, Tanggal Lahir, dan Jenis Kelamin. NIK/NISN/NIS membantu mencocokkan siswa lama.'
		],
		[
			'Nomor identitas',
			'Gunakan format teks agar nol di depan tetap tersimpan. NIK/KK: 16 digit; NISN: 10 digit atau kosong.'
		],
		[
			'Tanggal dan gender',
			'Tanggal: dd-MM-yyyy atau yyyy-MM-dd. Gender: L/P atau Laki-laki/Perempuan. Tanda - dibaca kosong.'
		],
		[
			'NIS sementara',
			'NIS siswa baru boleh kosong. Sistem membuat TMP-…; ganti dengan NIS sekolah melalui Data Murid atau impor ulang yang identitasnya cocok.'
		],
		[
			'Penempatan',
			'Siswa baru masuk Murid Pasif. Kelas, asrama, wali asuh, dan status siswa lama tetap.'
		],
		[
			'Kolom informasi',
			'Jenis NIS, UID Kaganga, Status Murid, Kelas Aktif, Asrama Aktif, Wali Asuh, dan NIP Wali Asuh merupakan informasi; bukan perintah penempatan. UID membantu pencocokan.'
		],
		[
			'Rombongan Belajar',
			'Disimpan sebagai informasi sumber Setara, termasuk beberapa rombel. Penempatan dilakukan melalui Murid Kelas atau Murid Asrama.'
		],
		[
			'Sekolah',
			'NPSN harus sekolah aktif atau satuan pendidikan yang sudah terdaftar. Kosongkan jika belum diketahui.'
		],
		[
			'Pembaruan',
			'Isian kosong tidak menghapus data lama. Identitas bentrok harus diperbaiki sebelum disimpan. Murid pindah/keluar/lulus tidak dipulihkan melalui impor.'
		],
		[
			'Kode QR Murid',
			'Kode tetap mengikuti anak lintas kelas, asrama, dan semester. Kosong mempertahankan QR lama; kode berbeda, ganda, milik anak lain, atau dicabut ditolak. Impor/ekspor kode memerlukan izin pengelolaan QR. Simpan file cadangan karena kode dapat digunakan untuk scan.'
		],
		[
			'Privasi',
			'File berisi data pribadi siswa dan keluarga. Simpan sesuai kewenangan pengelolaan data sekolah.'
		]
	])
		guide.addRow(values);
	return new Uint8Array(await book.xlsx.writeBuffer());
}

export function studentExchangeCsv(records: StudentExchangeFields[]) {
	const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
	return (
		'\uFEFF' +
		[
			studentExchangeHeaders,
			...records.map((record) => studentExchangeHeaders.map((header) => record[header] ?? ''))
		]
			.map((row) => row.map(quote).join(';'))
			.join('\r\n') +
		'\r\n'
	);
}
