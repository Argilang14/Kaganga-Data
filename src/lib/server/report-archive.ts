import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import db from './db';
import {
	tableMuridRiwayatKelas,
	tableMurid,
	tableMuridLifecycle,
	tableMataPelajaran,
	tableAsesmenSumatif,
	tableAsesmenSumatifTujuan,
	tableAsesmenKokurikuler,
	tableAsesmenEkstrakurikuler,
	tableKeasramaan,
	tableKeasramaanIndikator,
	tableKeasramaanTujuan,
	tableAsesmenKeasramaan
} from './db/schema';
import { ensureReportArchiveSchema } from './db/ensure-report-archive';
import { assertMuridIdentityConsistent } from './murid-identity-service';
import { isAuthorizedUser } from '../../routes/pengguna/permissions';
import { getClassEducationIdentity } from './education-units';
import { getRaporPreviewPayload, raporSubjectApplies } from '../../routes/cetak/rapor/preview-data';
import { getKeasramaanPreviewPayload } from '../../routes/cetak/keasramaan/preview-data';
import { generatePDF } from './pdf/generate';
import { resolveSchoolPdfVariant } from './pdf/school-variant';
import { composeAlamat, fallbackTempat, formatTanggal } from './pdf/preview-utils';
import { uploadsDir } from './data-dirs';
import { valueCoverage } from './report-history-audit';
import { writeAuditLog } from './audit-log';
import { assertStudentAccess } from './student-access';
import { hasSchoolWideOperationalAccess } from '../access-position';
import {
	reportVersions,
	publicReportVersion,
	reportArchiveTables
} from './report-archive-versions';
import { martikulasiArchiveSource, martikulasiArchivePayload } from './report-archive-martikulasi';
import { renderRaportMartikulasiHTML } from './pdf/templates/martikulasi';
import { renderPDF } from './pdf/pagedpdf';
import {
	verifiedReportMetadata,
	reportRevisionReason,
	archiveKinds,
	archivePrintPermission,
	type ArchiveKind,
	type ArchivePeriod,
	type ReportMetadata
} from '../report-archive';

const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export function requireArchiveAccess(locals: App.Locals, kind: ArchiveKind) {
	if (!locals.user) throw error(401, 'Silakan masuk kembali.');
	if (!locals.sekolah?.id) throw error(400, 'Pilih sekolah aktif.');
	if (
		!isAuthorizedUser(['murid_arsip', 'rapor_arsip_lihat'], locals.user) ||
		!isAuthorizedUser([archivePrintPermission(kind)], locals.user)
	)
		throw error(403, 'Akun tidak memiliki izin arsip dan cetak rapor ini.');
	if (locals.user.type !== 'admin' && locals.user.sekolahId !== locals.sekolah.id)
		throw error(403, 'Akun tidak terdaftar pada sekolah ini.');
	if (
		['tim_dapur', 'tim_keamanan', 'wali_murid'].includes(locals.user.type) &&
		!hasSchoolWideOperationalAccess(locals.user)
	)
		throw error(403, 'Role akun tidak memiliki akses arsip rapor.');
}
export function canArchiveAction(locals: App.Locals, action: 'finalisasi' | 'revisi' | 'massal') {
	return isAuthorizedUser([`rapor_arsip_${action}`], locals.user);
}
export function requireArchiveAction(
	locals: App.Locals,
	action: 'finalisasi' | 'revisi' | 'massal'
) {
	if (!canArchiveAction(locals, action))
		throw error(403, 'Izin persetujuan arsip rapor belum diberikan kepada akun ini.');
}
async function historySource(locals: App.Locals, id: number) {
	const school = locals.sekolah!.id;
	const history = await db.query.tableMuridRiwayatKelas.findFirst({
		where: and(eq(tableMuridRiwayatKelas.id, id), eq(tableMuridRiwayatKelas.sekolahId, school))
	});
	if (!history) throw error(404, 'Riwayat tidak ditemukan.');
	if (!history.muridId || !history.identityKey.startsWith('uid:'))
		throw error(409, 'Riwayat hanya berupa snapshot lama. Data sumber belum dapat dipastikan.');
	if (!(await assertStudentAccess(locals.user, school, history.muridId, false, 'assigned')))
		throw error(403, 'Riwayat berada di luar penugasan akun ini.');
	const uid = history.identityKey.slice(4);
	try {
		await assertMuridIdentityConsistent(db, school, uid, history.muridId);
	} catch {
		throw error(409, 'Identitas murid perlu diperiksa sebelum membuka rapor.');
	}
	const lifecycle = await db.query.tableMuridLifecycle.findFirst({
		where: and(
			eq(tableMuridLifecycle.sekolahId, school),
			eq(tableMuridLifecycle.identityKey, history.identityKey)
		)
	});
	if (lifecycle?.needsIdentityReview)
		throw error(409, 'Identitas murid masih menunggu pemeriksaan.');
	const student = await db.query.tableMurid.findFirst({
		where: and(eq(tableMurid.id, history.muridId), eq(tableMurid.sekolahId, school)),
		with: {
			kelas: { with: { semester: true, tahunAjaran: true, waliKelas: true, waliAsrama: true } },
			semester: true
		}
	});
	if (
		!student?.kelas ||
		!student.semester ||
		!student.kelas.tahunAjaran ||
		student.kelas.sekolahId !== school ||
		student.semesterId !== history.semesterId ||
		student.kelasId !== history.kelasId ||
		student.kelas.semesterId !== history.semesterId ||
		student.kelas.tahunAjaranId !== history.tahunAjaranId ||
		student.semester.tahunAjaranId !== history.tahunAjaranId ||
		student.kelas.tahunAjaran.sekolahId !== school
	)
		throw error(
			409,
			'Kelas, semester, dan riwayat tidak cocok. Rapor tidak diambil dari periode lain.'
		);
	return { history, student, uid };
}
export async function historicalReportInfo(
	locals: App.Locals,
	id: number,
	kind: ArchiveKind,
	period: ArchivePeriod,
	live = false
) {
	requireArchiveAccess(locals, kind);
	await ensureReportArchiveSchema();
	const context = await historySource(locals, id);
	const { student, history, uid } = context;
	const versions = await reportVersions(locals.sekolah!.id, id, kind, period);
	const latest = versions.at(-1);
	const baseInfo = {
		historyId: id,
		studentId: student.id,
		uid,
		studentName: history.namaSnapshot,
		kind,
		period,
		year: history.tahunAjaranSnapshot,
		semester: history.semesterSnapshot,
		className: history.kelasSnapshot,
		archived: latest ? publicReportVersion(latest) : null,
		versions: versions.map(publicReportVersion),
		canFinalize: canArchiveAction(locals, 'finalisasi'),
		canRevise: canArchiveAction(locals, 'finalisasi') && canArchiveAction(locals, 'revisi'),
		availableKinds: archiveKinds.filter((k) =>
			isAuthorizedUser([archivePrintPermission(k)], locals.user)
		),
		metadataWarning:
			'Verifikasi identitas dan penandatangan sesuai periode rapor. Referensi yang tersedia saat ini belum tentu merupakan metadata historis.'
	};
	if (latest && !live) {
		const snapshot = JSON.parse(latest.snapshotJson);
		const count =
			kind === 'sekolah'
				? (snapshot.data?.nilaiIntrakurikuler?.length ?? 0)
				: kind === 'asrama'
					? (snapshot.data?.keasramaanRows?.length ?? 0)
					: (snapshot.data?.students?.[0]?.nilai?.length ?? 0);
		return {
			...baseInfo,
			coverage: snapshot.coverage ?? valueCoverage(count, count, count),
			metadata: snapshot.metadata as ReportMetadata
		};
	}
	let expected: number, filled: number, observed: number, relationIssue: boolean;
	if (kind === 'martikulasi') {
		const source = await martikulasiArchiveSource(
			locals.sekolah!.id,
			history.tahunAjaranId!,
			student.kelasId,
			student.id
		);
		({ expected, filled, observed, relationIssue } = source.coverage);
	} else if (kind === 'sekolah') {
		const subjects = await db
			.select({ id: tableMataPelajaran.id, name: tableMataPelajaran.nama })
			.from(tableMataPelajaran)
			.where(eq(tableMataPelajaran.kelasId, student.kelasId));
		const grades = await db
			.select()
			.from(tableAsesmenSumatif)
			.where(eq(tableAsesmenSumatif.muridId, student.id));
		const classIds = new Set(subjects.map((v) => v.id));
		const ids = new Set(
			subjects.filter((v) => raporSubjectApplies(v.name, student.agama)).map((v) => v.id)
		);
		expected = ids.size;
		observed = grades.length;
		relationIssue =
			grades.some((v) => !classIds.has(v.mataPelajaranId)) ||
			new Set(grades.map((v) => v.mataPelajaranId)).size !== grades.length;
		filled = new Set(
			grades
				.filter((v) => {
					const n = period === 'rts' ? v.nilaiAkhirRts : v.nilaiAkhir;
					return (
						ids.has(v.mataPelajaranId) &&
						typeof n === 'number' &&
						Number.isFinite(n) &&
						n >= 0 &&
						n <= 100
					);
				})
				.map((v) => v.mataPelajaranId)
		).size;
	} else {
		const targets = await db
			.select({ id: tableKeasramaanTujuan.id, evaluationId: tableKeasramaan.id })
			.from(tableKeasramaanTujuan)
			.innerJoin(
				tableKeasramaanIndikator,
				eq(tableKeasramaanTujuan.indikatorId, tableKeasramaanIndikator.id)
			)
			.innerJoin(tableKeasramaan, eq(tableKeasramaanIndikator.keasramaanId, tableKeasramaan.id))
			.where(eq(tableKeasramaan.kelasId, student.kelasId));
		const grades = await db
			.select()
			.from(tableAsesmenKeasramaan)
			.where(eq(tableAsesmenKeasramaan.muridId, student.id));
		const ids = new Map(targets.map((v) => [v.id, v.evaluationId]));
		expected = ids.size;
		observed = grades.length;
		relationIssue =
			grades.some((v) => ids.get(v.tujuanId) !== v.keasramaanId) ||
			new Set(grades.map((v) => v.tujuanId)).size !== grades.length;
		filled = new Set(
			grades
				.filter(
					(v) =>
						ids.get(v.tujuanId) === v.keasramaanId &&
						['sangat-baik', 'baik', 'cukup', 'perlu-bimbingan'].includes(v.kategori)
				)
				.map((v) => v.tujuanId)
		).size;
	}
	if (relationIssue)
		throw error(
			409,
			'Ditemukan penilaian di luar kelas atau tujuan periode ini. Periksa relasinya terlebih dahulu.'
		);
	const education =
		observed === 0
			? { nama: '', npsn: '' }
			: await getClassEducationIdentity(locals.sekolah!.id, student.kelasId);
	const teacher = kind === 'asrama' ? student.kelas.waliAsrama : student.kelas.waliKelas;
	const principal = locals.sekolah!.kepalaSekolah;
	const metadata: ReportMetadata = {
		schoolName: education.nama,
		npsn: education.npsn,
		address: composeAlamat(locals.sekolah!),
		principalName: principal?.nama ?? '',
		principalNip: principal?.nip ?? '',
		principalStatus: locals.sekolah!.statusKepalaSekolah ?? 'definitif',
		teacherName: teacher?.nama ?? '',
		teacherNip: teacher?.nip ?? '',
		caregiverName: student.waliAsuhNama ?? '',
		caregiverNip: '',
		place: fallbackTempat(locals.sekolah!),
		date: student.semester.tanggalBagiRaport ?? ''
	};
	return {
		...baseInfo,
		coverage: valueCoverage(expected, filled, observed),
		metadata,
		metadataWarning:
			'Identitas dan penandatangan di bawah adalah referensi data yang tersedia saat ini. Verifikasi kesesuaiannya dengan periode rapor sebelum pratinjau dan finalisasi.'
	};
}
async function capturedReport(
	locals: App.Locals,
	id: number,
	kind: ArchiveKind,
	period: ArchivePeriod,
	metadata: ReportMetadata,
	revision?: { baseId: string; number: number; previousId: string; reason: string }
) {
	const info = await historicalReportInfo(locals, id, kind, period, true);
	if (info.coverage.observed === 0) throw error(409, 'Data rapor belum tersedia pada periode ini.');
	if (kind === 'martikulasi') {
		const { history, student } = await historySource(locals, id);
		const data = await martikulasiArchivePayload(
			locals,
			{
				yearId: history.tahunAjaranId!,
				classId: student.kelasId,
				studentId: student.id,
				year: info.year,
				className: info.className,
				studentName: info.studentName,
				nis: student.nis ?? '',
				nisn: student.nisn ?? ''
			},
			metadata
		);
		const snapshot = {
			version: 1,
			historyId: id,
			identityUid: info.uid,
			kind,
			period,
			variant: 'default' as const,
			metadata,
			coverage: info.coverage,
			revision: revision ?? null,
			data
		};
		const serialized = JSON.stringify(snapshot);
		return { info, snapshot, serialized, hash: digest(serialized) };
	}
	if (kind === 'sekolah') {
		const source = await historySource(locals, id);
		const goals = await db.query.tableAsesmenSumatifTujuan.findMany({
			where: eq(tableAsesmenSumatifTujuan.muridId, info.studentId),
			with: { mataPelajaran: true, tujuanPembelajaran: true }
		});
		const co = await db.query.tableAsesmenKokurikuler.findMany({
			where: eq(tableAsesmenKokurikuler.muridId, info.studentId),
			with: { kokurikuler: true }
		});
		const extra = await db.query.tableAsesmenEkstrakurikuler.findMany({
			where: eq(tableAsesmenEkstrakurikuler.muridId, info.studentId),
			with: { ekstrakurikuler: true, tujuan: true }
		});
		if (
			goals.some(
				(v) =>
					v.mataPelajaran?.kelasId !== source.student.kelasId ||
					v.tujuanPembelajaran?.mataPelajaranId !== v.mataPelajaranId ||
					(v.nilai !== null && (!Number.isFinite(v.nilai) || v.nilai < 0 || v.nilai > 100))
			) ||
			co.some((v) => v.kokurikuler?.kelasId !== source.student.kelasId) ||
			extra.some(
				(v) =>
					v.ekstrakurikuler?.kelasId !== source.student.kelasId ||
					v.tujuan?.ekstrakurikulerId !== v.ekstrakurikulerId
			)
		) {
			throw error(
				409,
				'Sumber capaian, kokurikuler, atau ekstrakurikuler tidak sesuai kelas periode ini.'
			);
		}
	}
	const url = new URL('http://localhost/cetak');
	url.searchParams.set('murid_id', String(info.studentId));
	url.searchParams.set('rapor_periode', period);
	const data =
		kind === 'sekolah'
			? (await getRaporPreviewPayload({ locals, url })).raporData
			: (await getKeasramaanPreviewPayload({ locals, url }))?.keasramaanData;
	if (!data) throw error(409, 'Data rapor tidak tersedia.');
	data.sekolah.nama = metadata.schoolName;
	data.sekolah.alamat = metadata.address;
	data.kepalaSekolah = {
		...data.kepalaSekolah,
		nama: metadata.principalName,
		nip: metadata.principalNip,
		statusKepalaSekolah: metadata.principalStatus
	};
	data.waliKelas = { nama: metadata.teacherName, nip: metadata.teacherNip };
	if ('waliAsrama' in data)
		data.waliAsrama = { nama: metadata.teacherName, nip: metadata.teacherNip };
	if ('waliAsuh' in data)
		data.waliAsuh = { nama: metadata.caregiverName, nip: metadata.caregiverNip };
	data.ttd = { tempat: metadata.place, tanggal: formatTanggal(metadata.date) };
	data.rombel.nama = info.className;
	if ('tahunPelajaran' in data.periode) data.periode.tahunPelajaran = info.year;
	if ('tahunAjaran' in data.periode) data.periode.tahunAjaran = info.year;
	data.periode.semester = info.semester.replace(/^semester\s+/i, '');
	const variant = resolveSchoolPdfVariant(kind === 'sekolah' ? 'rapor' : 'keasramaan', locals);
	const snapshot = {
		version: 1,
		historyId: id,
		identityUid: info.uid,
		kind,
		period,
		variant,
		metadata,
		coverage: info.coverage,
		revision: revision ?? null,
		data
	};
	const serialized = JSON.stringify(snapshot);
	return { info, snapshot, serialized, hash: digest(serialized) };
}
function filePath(key: string) {
	if (!/^sekolah-[1-9][0-9]*\/[0-9a-f-]{36}\.pdf$/.test(key))
		throw error(500, 'Lokasi arsip tidak valid.');
	return path.join(uploadsDir(), 'rapor-arsip', ...key.split('/'));
}
export async function previewOrFinalizeReport(
	locals: App.Locals,
	id: number,
	kind: ArchiveKind,
	period: ArchivePeriod,
	input: Record<string, unknown>,
	request: Request
) {
	requireArchiveAccess(locals, kind);
	const revisionMode = input.action === 'revise-preview' || input.action === 'revise-finalize';
	const final = input.action === 'finalize' || input.action === 'revise-finalize';
	if (final || revisionMode) requireArchiveAction(locals, 'finalisasi');
	if (revisionMode) requireArchiveAction(locals, 'revisi');
	if (input.confirmMetadata !== true)
		throw error(400, 'Konfirmasikan identitas dokumen sesuai periode rapor.');
	let metadata: ReportMetadata;
	try {
		metadata = verifiedReportMetadata(input.metadata);
	} catch (cause) {
		throw error(400, cause instanceof Error ? cause.message : 'Identitas dokumen tidak valid.');
	}
	await ensureReportArchiveSchema();
	let revision: { baseId: string; number: number; previousId: string; reason: string } | undefined;
	if (revisionMode) {
		const versions = await reportVersions(locals.sekolah!.id, id, kind, period);
		const latest = versions.at(-1);
		if (!latest || input.expectedVersionId !== latest.id)
			throw error(409, 'Versi rapor sudah berubah atau belum tersedia. Muat ulang halaman.');
		let reason: string;
		try {
			reason = reportRevisionReason(input.reason);
		} catch (cause) {
			throw error(400, (cause as Error).message);
		}
		revision = { baseId: versions[0].id, number: latest.nomor + 1, previousId: latest.id, reason };
	}
	const capture = await capturedReport(locals, id, kind, period, metadata, revision);
	if (final || input.bulkPreview === true) {
		if (capture.info.archived && !revision)
			throw error(409, 'Rapor final sudah tersimpan. Gunakan dokumen yang tersedia.');
		if (kind === 'asrama' && !metadata.caregiverName)
			throw error(400, 'Nama Wali Asuh pada periode rapor harus diverifikasi sebelum finalisasi.');
		if (capture.info.coverage.status !== 'nilai_inti_lengkap')
			throw error(409, 'Nilai inti belum lengkap. Finalisasi diblokir.');
		if (
			kind === 'sekolah' &&
			'nilaiIntrakurikuler' in capture.snapshot.data &&
			capture.snapshot.data.nilaiIntrakurikuler.length !== capture.info.coverage.expected
		)
			throw error(
				409,
				'Baris nilai pada PDF belum sesuai cakupan kelas. Periksa mapel, agama, dan capaian penilaiannya.'
			);
		if (
			kind === 'asrama' &&
			'keasramaanRows' in capture.snapshot.data &&
			!capture.snapshot.data.keasramaanRows.length
		)
			throw error(409, 'Narasi rapor asrama belum tersedia.');
		if (final && (input.confirmFinal !== true || input.expectedHash !== capture.hash))
			throw error(409, 'Pratinjau belum dikonfirmasi atau data berubah. Periksa ulang dokumen.');
	}
	const bytes =
		kind === 'martikulasi' && 'students' in capture.snapshot.data
			? await renderPDF(renderRaportMartikulasiHTML(capture.snapshot.data))
			: await generatePDF(
					kind === 'sekolah' ? 'rapor' : 'keasramaan',
					capture.snapshot.data as unknown as Record<string, unknown>,
					undefined,
					capture.snapshot.variant
				);
	if (!final) return { bytes, hash: capture.hash, final: false };
	const fresh = await capturedReport(locals, id, kind, period, metadata, revision);
	if (fresh.hash !== capture.hash)
		throw error(409, 'Data berubah selama pembuatan PDF. Ulangi pratinjau.');
	const archiveId = randomUUID(),
		key = `sekolah-${locals.sekolah!.id}/${archiveId}.pdf`,
		filename = filePath(key);
	await mkdir(path.dirname(filename), { recursive: true });
	await writeFile(filename, bytes, { flag: 'wx' });
	try {
		await db.transaction(async (tx) => {
			const snapshotJson = JSON.stringify(
				{ ...capture.snapshot, renderedAssetPolicy: 'embedded-in-pdf' },
				(_key, value) =>
					typeof value === 'string' && value.startsWith('data:image/')
						? `pdf-embedded-image:sha256:${digest(value)}`
						: value
			);
			const stored = {
				id: archiveId,
				snapshotJson,
				sourceHash: capture.hash,
				storageKey: key,
				sha256: digest(bytes),
				sizeBytes: bytes.length,
				finalizedBy: locals.user!.id
			};
			if (revision) {
				const current = await reportVersions(locals.sekolah!.id, id, kind, period, tx);
				if (current.at(-1)?.id !== revision.previousId)
					throw error(409, 'Rapor telah direvisi oleh pengguna lain. Ulangi pemeriksaan.');
				await tx.insert(reportArchiveTables(kind).revisions).values({
					...stored,
					arsipId: revision.baseId,
					nomor: revision.number,
					sebelumnyaId: revision.previousId,
					alasan: revision.reason
				});
			} else
				await tx.insert(reportArchiveTables(kind).base).values({
					id: archiveId,
					sekolahId: locals.sekolah!.id,
					historyId: id,
					muridId: capture.info.studentId,
					identityUid: capture.info.uid,
					jenis: kind,
					periode: period,
					snapshotJson,
					sourceHash: capture.hash,
					storageKey: key,
					sha256: digest(bytes),
					sizeBytes: bytes.length,
					finalizedBy: locals.user!.id
				});
			await writeAuditLog(
				{
					locals,
					request,
					action: 'archive',
					entityType: 'rapor_arsip',
					entityId: archiveId,
					summary: revision
						? `Revisi ${revision.number} rapor ${kind} ${period} riwayat ${id}: ${revision.reason}`
						: `Finalisasi rapor ${kind} ${period} pada riwayat ${id}.`
				},
				tx
			);
		});
	} catch (cause) {
		await unlink(filename).catch(() => undefined);
		const detail = [cause, cause instanceof Error ? cause.cause : null].map(String).join(' ');
		if (/UNIQUE|SQLITE_BUSY|SQLITE_LOCKED/.test(detail))
			throw error(
				409,
				'Arsip sedang berubah atau diproses pengguna lain. Muat ulang dan periksa kembali.'
			);
		throw cause;
	}
	return { bytes, hash: capture.hash, final: true };
}
export async function archivedReportPdf(
	locals: App.Locals,
	id: number,
	kind: ArchiveKind,
	period: ArchivePeriod,
	versionId?: string | null
) {
	requireArchiveAccess(locals, kind);
	await historySource(locals, id);
	await ensureReportArchiveSchema();
	const versions = await reportVersions(locals.sekolah!.id, id, kind, period);
	const row = versionId ? versions.find((v) => v.id === versionId) : versions.at(-1);
	if (!row) throw error(404, 'Rapor final belum tersedia.');
	if (!row.storageKey.startsWith(`sekolah-${locals.sekolah!.id}/`))
		throw error(409, 'Lokasi arsip tidak sesuai sekolah.');
	let bytes: Buffer;
	try {
		bytes = await readFile(filePath(row.storageKey));
	} catch {
		throw error(
			409,
			'Berkas arsip belum tersedia. Periksa atau pulihkan folder unggahan dari backup.'
		);
	}
	if (bytes.length !== row.sizeBytes || digest(bytes) !== row.sha256)
		throw error(409, 'Integritas berkas rapor tidak cocok. Jangan gunakan berkas ini.');
	return bytes;
}
