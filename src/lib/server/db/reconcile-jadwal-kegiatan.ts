import { normalizeJadwalKegiatanKode } from '$lib/jadwal-slots';
import db from '$lib/server/db';
import { ensureJadwalBellSchema } from '$lib/server/db/ensure-jadwal-bell';
import {
	tableJadwalKegiatan,
	tableJadwalPelajaran,
	tableKegiatanCustom
} from '$lib/server/db/schema';
import { and, asc, eq, inArray } from 'drizzle-orm';

type KegiatanKategori = 'umum' | 'kokurikuler' | 'keagamaan' | 'istirahat';

function kategoriFromKode(kode: string): KegiatanKategori {
	if (kode.includes('ISTIRAHAT') || kode.includes('ISHOMA')) return 'istirahat';
	if (kode.includes('SHOLAT') || kode.includes('SALAT') || kode.includes('DOA')) return 'keagamaan';
	if (kode.includes('KOKURIKULER')) return 'kokurikuler';
	return 'umum';
}

function warnaFromKategori(kategori: KegiatanKategori) {
	if (kategori === 'istirahat') return '#F9C08B';
	if (kategori === 'keagamaan') return '#FFF200';
	if (kategori === 'kokurikuler') return '#7A9B3A';
	return '#8BC34A';
}

let reconciliation: Promise<void> | null = null;

export function ensureJadwalKegiatanTerintegrasi() {
	if (!reconciliation) {
		reconciliation = reconcileJadwalKegiatan().finally(() => {
			reconciliation = null;
		});
	}
	return reconciliation;
}

async function reconcileJadwalKegiatan() {
	await ensureJadwalBellSchema();
	const [existingRows, legacyRows] = await Promise.all([
		db.query.tableJadwalKegiatan.findMany({
			orderBy: [asc(tableJadwalKegiatan.sekolahId), asc(tableJadwalKegiatan.id)]
		}),
		db.query.tableKegiatanCustom.findMany({
			orderBy: [asc(tableKegiatanCustom.sekolahId), asc(tableKegiatanCustom.id)]
		})
	]);

	const existingKeys = new Set(
		existingRows.map((row) => `${row.sekolahId}|${normalizeJadwalKegiatanKode(row.kode)}`)
	);
	for (const legacy of legacyRows) {
		const kode = normalizeJadwalKegiatanKode(legacy.kode || legacy.nama);
		const key = `${legacy.sekolahId}|${kode}`;
		if (!kode || existingKeys.has(key)) continue;
		const kategori = kategoriFromKode(kode);
		try {
			await db.insert(tableJadwalKegiatan).values({
				sekolahId: legacy.sekolahId,
				kode,
				nama: legacy.nama,
				kategori,
				warna: warnaFromKategori(kategori),
				aktif: true,
				createdAt: legacy.createdAt,
				updatedAt: new Date().toISOString()
			});
			existingKeys.add(key);
		} catch (error) {
			const message = error instanceof Error ? error.message.toLowerCase() : String(error);
			if (!message.includes('unique')) throw error;
		}
	}

	const kegiatanRows = await db.query.tableJadwalKegiatan.findMany({
		orderBy: [asc(tableJadwalKegiatan.sekolahId), asc(tableJadwalKegiatan.id)]
	});
	const groups = new Map<string, typeof kegiatanRows>();
	for (const row of kegiatanRows) {
		const kode = normalizeJadwalKegiatanKode(row.kode || row.nama);
		if (!kode) continue;
		const key = `${row.sekolahId}|${kode}`;
		const group = groups.get(key) ?? [];
		group.push(row);
		groups.set(key, group);
	}

	await db.transaction(async (tx) => {
		const canonicalByOriginalId = new Map<number, (typeof kegiatanRows)[number]>();
		const canonicalByCode = new Map<string, (typeof kegiatanRows)[number]>();

		for (const [key, group] of groups) {
			const kode = key.slice(key.indexOf('|') + 1);
			const canonical =
				group.find((row) => row.kode === kode) ??
				group.find((row) => normalizeJadwalKegiatanKode(row.kode) === kode) ??
				group[0];
			const duplicateIds = group.filter((row) => row.id !== canonical.id).map((row) => row.id);
			for (const row of group) canonicalByOriginalId.set(row.id, canonical);
			canonicalByCode.set(key, canonical);

			if (duplicateIds.length) {
				await tx
					.update(tableJadwalPelajaran)
					.set({ kegiatanId: canonical.id, updatedAt: new Date().toISOString() })
					.where(
						and(
							eq(tableJadwalPelajaran.sekolahId, canonical.sekolahId),
							inArray(tableJadwalPelajaran.kegiatanId, duplicateIds)
						)
					);
				await tx.delete(tableJadwalKegiatan).where(inArray(tableJadwalKegiatan.id, duplicateIds));
			}
		}

		const jadwalRows = await tx.query.tableJadwalPelajaran.findMany({
			columns: {
				id: true,
				sekolahId: true,
				kegiatanId: true,
				kodeKegiatan: true,
				tipe: true
			}
		});
		for (const jadwal of jadwalRows) {
			const kode = normalizeJadwalKegiatanKode(jadwal.kodeKegiatan);
			const kegiatan =
				(jadwal.kegiatanId ? canonicalByOriginalId.get(jadwal.kegiatanId) : null) ??
				canonicalByCode.get(`${jadwal.sekolahId}|${kode}`);
			if (!kegiatan) continue;
			const canonicalKode = normalizeJadwalKegiatanKode(kegiatan.kode);
			const tipe = kegiatan.kategori === 'istirahat' ? 'istirahat' : 'kegiatan';
			if (
				jadwal.kegiatanId === kegiatan.id &&
				jadwal.kodeKegiatan === canonicalKode &&
				jadwal.tipe === tipe
			)
				continue;
			await tx
				.update(tableJadwalPelajaran)
				.set({
					kegiatanId: kegiatan.id,
					kodeKegiatan: canonicalKode,
					tipe,
					updatedAt: new Date().toISOString()
				})
				.where(eq(tableJadwalPelajaran.id, jadwal.id));
		}
	});
}
