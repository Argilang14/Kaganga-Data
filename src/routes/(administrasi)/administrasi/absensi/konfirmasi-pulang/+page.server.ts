import { and, count, desc, eq, isNotNull, isNull, like, ne, or, sql } from 'drizzle-orm';
import db from '$lib/server/db';
import {
	tableIzinPulangMurid as permit,
	tablePerjalananMurid as journey
} from '$lib/server/db/schema';
import { assertTravelAccess } from '$lib/server/attendance-travel-access';
import { ensureAbsenceMonitoringSchema } from '$lib/server/db/ensure-absence-monitoring';
import { attendanceStaffName } from '$lib/server/attendance-staff';
import { pickupProblem, travelLocalTime, travelReturnDeadline } from '$lib/attendance-travel';

export async function load({ locals, url, setHeaders }) {
	await assertTravelAccess(locals);
	await ensureAbsenceMonitoringSchema();
	setHeaders({ 'cache-control': 'private, no-store' });
	const school = locals.sekolah!.id;
	const now = new Date();
	const local = travelLocalTime(now);
	const point = `${local.date}T${local.time}`;
	const tab = ['keluar', 'pulang', 'riwayat'].includes(url.searchParams.get('tab') ?? '')
		? url.searchParams.get('tab')!
		: 'keluar';
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
	const scope = eq(permit.sekolahId, school);
	const active = and(
		ne(permit.status, 'dibatalkan'),
		isNull(permit.tanggalKembali),
		isNull(journey.kembaliPada)
	);
	const deadline = sql`(${permit.rencanaKembali} || 'T' || CASE WHEN ${permit.waktuRencanaKembali} IS NULL THEN '23:59:59' WHEN length(${permit.waktuRencanaKembali}) = 5 THEN ${permit.waktuRencanaKembali} || ':00' ELSE ${permit.waktuRencanaKembali} END)`;
	const late = and(active, sql`${deadline} < ${point}`);
	const pending = and(active, isNull(journey.keluarPada));
	const away = and(active, isNotNull(journey.keluarPada));
	const state =
		url.searchParams.get('terlambat') === '1' && tab !== 'riwayat'
			? active
			: tab === 'keluar'
				? pending
				: tab === 'pulang'
					? away
					: or(isNotNull(permit.tanggalKembali), eq(permit.status, 'dibatalkan'));
	const where = and(
		scope,
		state,
		q
			? or(
					like(permit.namaSnapshot, `%${q}%`),
					like(permit.kelasSnapshot, `%${q}%`),
					like(permit.nomorDokumen, `%${q}%`)
				)
			: undefined,
		url.searchParams.get('terlambat') === '1' ? late : undefined
	);
	const [totals] = await db
		.select({ total: count() })
		.from(permit)
		.leftJoin(journey, eq(journey.izinId, permit.id))
		.where(where);
	const pages = Math.max(1, Math.ceil(totals.total / 20));
	const requested = Number(url.searchParams.get('page'));
	const page = Math.min(pages, Number.isSafeInteger(requested) && requested > 0 ? requested : 1);
	const [summary] = await db
		.select({
			pending: sql<number>`coalesce(sum(case when ${pending} then 1 else 0 end), 0)`,
			away: sql<number>`coalesce(sum(case when ${away} then 1 else 0 end), 0)`,
			late: sql<number>`coalesce(sum(case when ${late} then 1 else 0 end), 0)`
		})
		.from(permit)
		.leftJoin(journey, eq(journey.izinId, permit.id))
		.where(scope);
	// Only operational permit fields are exposed; medical reasons and pickup contacts stay private.
	const records = await db
		.select({
			id: permit.id,
			muridId: permit.muridId,
			nama: permit.namaSnapshot,
			kelas: permit.kelasSnapshot,
			nomor: permit.nomorDokumen,
			tanggalKeluar: permit.tanggalKeluar,
			waktuKeluar: permit.waktuKeluar,
			rencanaKembali: permit.rencanaKembali,
			waktuRencanaKembali: permit.waktuRencanaKembali,
			tanggalKembali: permit.tanggalKembali,
			waktuKembali: permit.waktuKembali,
			status: permit.status,
			penjemputNama: permit.penjemputNama,
			penjemputHubungan: permit.penjemputHubungan,
			keluarPada: journey.keluarPada,
			keluarOleh: journey.keluarOleh,
			kembaliPada: journey.kembaliPada,
			kembaliOleh: journey.kembaliOleh
		})
		.from(permit)
		.leftJoin(journey, eq(journey.izinId, permit.id))
		.where(where)
		.orderBy(desc(permit.tanggalKeluar), desc(permit.id))
		.limit(20)
		.offset((page - 1) * 20);
	const staff = new Map<number, string | null>();
	for (const row of records)
		for (const id of [row.keluarOleh, row.kembaliOleh]) {
			if (id && !staff.has(id)) staff.set(id, await attendanceStaffName(id, school));
		}
	return {
		meta: { title: 'Konfirmasi Pulang' } satisfies PageMeta,
		tab,
		q,
		lateOnly: url.searchParams.get('terlambat') === '1',
		page,
		pages,
		total: totals.total,
		summary,
		refreshedAt: now.toISOString(),
		rows: records.map((row) => ({
			...row,
			keluarPetugas: row.keluarOleh ? (staff.get(row.keluarOleh) ?? null) : null,
			kembaliPetugas: row.kembaliOleh ? (staff.get(row.kembaliOleh) ?? null) : null,
			pickupIncomplete: !!pickupProblem(row.penjemputNama, row.penjemputHubungan),
			late: !row.tanggalKembali && row.status !== 'dibatalkan' && point > travelReturnDeadline(row)
		}))
	};
}
