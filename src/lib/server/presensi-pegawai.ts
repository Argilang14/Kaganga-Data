import { and, asc, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';
import db from '$lib/server/db';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import {
	tableDinasLuarPermohonan,
	tablePegawai,
	tablePresensiPegawai,
	tablePresensiSettings,
	tableSppd,
	tableSppdPegawai
} from '$lib/server/db/schema';
import { buildLiburDates } from '$lib/server/absen/libur';
import { isSaturday, isSunday } from '$lib/server/absen/utils';
import {
	enumerateMonthDates,
	isPresensiPegawaiStatus,
	type PresensiPegawaiStatus
} from '$lib/presensi-pegawai-utils';
import type { PegawaiJenis } from '$lib/presensi-pegawai-utils';

export type PresensiPegawaiRow = {
	pegawaiId: number;
	nama: string;
	nip: string;
	jenis: string;
	status: PresensiPegawaiStatus | null;
	waktuMasuk: string | null;
	waktuPulang: string | null;
	keterangan: string | null;
	tandaTangan: string | null;
	inferredFromDinasLuar: boolean;
};

export async function getPresensiPegawaiSettings(sekolahId: number) {
	const academic = await resolveSekolahAcademicContext(sekolahId);
	if (!academic.activeTahunAjaranId) return null;
	return (
		(await db.query.tablePresensiSettings.findFirst({
			where: and(
				eq(tablePresensiSettings.sekolahId, sekolahId),
				eq(tablePresensiSettings.tahunAjaranId, academic.activeTahunAjaranId)
			)
		})) ?? null
	);
}

export async function isPresensiPegawaiWorkday(sekolahId: number, tanggal: string) {
	const [year, month, day] = tanggal.split('-').map(Number);
	const settings = await getPresensiPegawaiSettings(sekolahId);
	const schoolDays = settings?.hariSekolah ?? 6;
	const weekend =
		schoolDays === 5
			? isSaturday(year, month, day) || isSunday(year, month, day)
			: isSunday(year, month, day);
	return {
		isWorkday: !weekend && !buildLiburDates(settings, year, month).has(tanggal),
		settings
	};
}

async function activeEmployees(sekolahId: number, search = '', jenis: PegawaiJenis | '' = '') {
	const term = search.trim();
	return db.query.tablePegawai.findMany({
		columns: { id: true, nama: true, nip: true, jenis: true },
		where: and(
			eq(tablePegawai.sekolahId, sekolahId),
			eq(tablePegawai.status, 'aktif'),
			jenis ? eq(tablePegawai.jenis, jenis) : undefined,
			term
				? or(
						sql`lower(${tablePegawai.nama}) like ${`%${term.toLowerCase()}%`}`,
						sql`lower(${tablePegawai.nip}) like ${`%${term.toLowerCase()}%`}`
					)
				: undefined
		),
		orderBy: [asc(tablePegawai.nama)]
	});
}

async function dinasLuarEmployeeIds(sekolahId: number, start: string, end: string) {
	const requestRows = await db.query.tableDinasLuarPermohonan.findMany({
		columns: { pegawaiId: true, tanggalBerangkat: true, tanggalKembali: true },
		where: and(
			eq(tableDinasLuarPermohonan.sekolahId, sekolahId),
			inArray(tableDinasLuarPermohonan.status, ['disetujui', 'selesai']),
			lte(tableDinasLuarPermohonan.tanggalBerangkat, end),
			gte(tableDinasLuarPermohonan.tanggalKembali, start)
		)
	});
	const sppdRows = await db
		.select({
			pegawaiId: tableSppdPegawai.pegawaiId,
			tanggalBerangkat: tableSppd.tanggalBerangkat,
			tanggalKembali: tableSppd.tanggalKembali
		})
		.from(tableSppdPegawai)
		.innerJoin(tableSppd, eq(tableSppdPegawai.sppdId, tableSppd.id))
		.where(
			and(
				eq(tableSppd.sekolahId, sekolahId),
				inArray(tableSppd.status, ['terbit', 'selesai']),
				lte(tableSppd.tanggalBerangkat, end),
				gte(tableSppd.tanggalKembali, start)
			)
		);
	const rows = [
		...requestRows,
		...sppdRows.filter((row): row is typeof row & { pegawaiId: number } => row.pegawaiId !== null)
	];
	const byDate = new Map<string, Set<number>>();
	for (const row of rows) {
		for (
			let cursor = new Date(`${row.tanggalBerangkat}T12:00:00`);
			cursor <= new Date(`${row.tanggalKembali}T12:00:00`);
			cursor.setDate(cursor.getDate() + 1)
		) {
			const date = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
			if (date < start || date > end) continue;
			const set = byDate.get(date) ?? new Set<number>();
			set.add(row.pegawaiId);
			byDate.set(date, set);
		}
	}
	return byDate;
}

export async function listPresensiPegawaiHarian(sekolahId: number, tanggal: string, search = '', jenis: PegawaiJenis | '' = '') {
	const employees = await activeEmployees(sekolahId, search, jenis);
	if (!employees.length) return [] as PresensiPegawaiRow[];
	const records = await db.query.tablePresensiPegawai.findMany({
		where: and(
			eq(tablePresensiPegawai.sekolahId, sekolahId),
			eq(tablePresensiPegawai.tanggal, tanggal),
			inArray(
				tablePresensiPegawai.pegawaiId,
				employees.map((employee) => employee.id)
			)
		)
	});
	const byEmployee = new Map(records.map((record) => [record.pegawaiId, record]));
	const dinas =
		(await dinasLuarEmployeeIds(sekolahId, tanggal, tanggal)).get(tanggal) ?? new Set<number>();
	return employees.map((employee) => {
		const record = byEmployee.get(employee.id);
		const inferred = !record && dinas.has(employee.id);
		return {
			pegawaiId: employee.id,
			nama: employee.nama,
			nip: employee.nip,
			jenis: employee.jenis,
			status:
				record?.status && isPresensiPegawaiStatus(record.status)
					? record.status
					: inferred
						? 'dinas_luar'
						: null,
			waktuMasuk: record?.waktuMasuk ?? null,
			waktuPulang: record?.waktuPulang ?? null,
			keterangan: record?.keterangan ?? (inferred ? 'Terhubung dari Dinas Luar' : null),
			tandaTangan: record?.tandaTangan ?? null,
			inferredFromDinasLuar: inferred
		};
	});
}

export async function listPresensiPegawaiBulanan(
	sekolahId: number,
	year: number,
	month: number,
	search = '',
	jenis: PegawaiJenis | '' = ''
) {
	const dates = enumerateMonthDates(year, month);
	const employees = await activeEmployees(sekolahId, search, jenis);
	const start = dates[0];
	const end = dates.at(-1)!;
	const records = employees.length
		? await db.query.tablePresensiPegawai.findMany({
				where: and(
					eq(tablePresensiPegawai.sekolahId, sekolahId),
					gte(tablePresensiPegawai.tanggal, start),
					lte(tablePresensiPegawai.tanggal, end),
					inArray(
						tablePresensiPegawai.pegawaiId,
						employees.map((employee) => employee.id)
					)
				)
			})
		: [];
	const byKey = new Map(
		records.map((record) => [
			`${record.pegawaiId}:${record.tanggal}`,
			record.status as PresensiPegawaiStatus
		])
	);
	const dinas = await dinasLuarEmployeeIds(sekolahId, start, end);
	const workdayResults = await Promise.all(
		dates.map((date) => isPresensiPegawaiWorkday(sekolahId, date))
	);
	const workdays = new Set(dates.filter((_, index) => workdayResults[index].isWorkday));
	return {
		dates,
		workdays,
		rows: employees.map((employee) => {
			const statuses = dates.map(
				(date) =>
					byKey.get(`${employee.id}:${date}`) ??
					(dinas.get(date)?.has(employee.id) ? 'dinas_luar' : null)
			);
			const counts = { hadir: 0, izin: 0, sakit: 0, dinas_luar: 0, cuti: 0, belum: 0 };
			statuses.forEach((status, index) => {
				if (!workdays.has(dates[index])) return;
				if (status) counts[status]++;
				else counts.belum++;
			});
			return { ...employee, statuses, counts };
		})
	};
}

export async function savePresensiPegawai(params: {
	sekolahId: number;
	pegawaiId: number;
	tanggal: string;
	status: PresensiPegawaiStatus;
	waktuMasuk?: string | null;
	waktuPulang?: string | null;
	keterangan?: string | null;
	tandaTangan?: string | null;
	petugasUserId?: number | null;
}) {
	const employee = await db.query.tablePegawai.findFirst({
		columns: { id: true, nama: true },
		where: and(eq(tablePegawai.id, params.pegawaiId), eq(tablePegawai.sekolahId, params.sekolahId))
	});
	if (!employee) throw new Error('Pegawai tidak ditemukan pada sekolah aktif.');
	const academic = await resolveSekolahAcademicContext(params.sekolahId);
	await db
		.insert(tablePresensiPegawai)
		.values({
			sekolahId: params.sekolahId,
			tahunAjaranId: academic.activeTahunAjaranId,
			semesterId: academic.activeSemesterId,
			pegawaiId: employee.id,
			namaPegawai: employee.nama,
			tanggal: params.tanggal,
			status: params.status,
			waktuMasuk: params.waktuMasuk || null,
			waktuPulang: params.waktuPulang || null,
			keterangan: params.keterangan || null,
			tandaTangan: params.tandaTangan || null,
			petugasUserId: params.petugasUserId || null,
			updatedAt: new Date().toISOString()
		})
		.onConflictDoUpdate({
			target: [
				tablePresensiPegawai.sekolahId,
				tablePresensiPegawai.pegawaiId,
				tablePresensiPegawai.tanggal
			],
			set: {
				namaPegawai: employee.nama,
				status: params.status,
				waktuMasuk: params.waktuMasuk || null,
				waktuPulang: params.waktuPulang || null,
				keterangan: params.keterangan || null,
				tandaTangan: params.tandaTangan || null,
				petugasUserId: params.petugasUserId || null,
				updatedAt: new Date().toISOString()
			}
		});
}
