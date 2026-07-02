import {
	loadAbsensiKelasOptions,
	parsePositiveInteger,
	resolveKelasId
} from '$lib/server/absensi-digital';
import db from '$lib/server/db';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import { tableJadwalPelajaran, tablePegawai } from '$lib/server/db/schema';
import {
	ensureDefaultJadwalFoundation,
	JADWAL_HARI_LABELS,
	requireJadwalAccess
} from '$lib/server/jadwal';
import { redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';

const HARI_URUTAN = ['senin', 'selasa', 'rabu', 'kamis', 'jumat'] as const;

function resolveGuruId(
	guruList: { id: number }[],
	requestedId: number | null | undefined,
	user: Pick<AuthUser, 'type' | 'pegawaiId'>
) {
	if (requestedId && guruList.some((guru) => guru.id === requestedId)) return requestedId;
	if (
		user.type === 'user' &&
		user.pegawaiId &&
		guruList.some((guru) => guru.id === user.pegawaiId)
	) {
		return user.pegawaiId;
	}
	return null;
}

function buildSlotLabel(slot: {
	tipe: string;
	jadwalMapel?: { nama: string; kode: string | null } | null;
	mataPelajaran?: { nama: string; kode: string | null } | null;
	kegiatan?: { nama: string } | null;
	kokurikuler?: { kode: string; tujuan: string } | null;
	catatan?: string | null;
}) {
	if (slot.tipe === 'pelajaran')
		return (
			slot.jadwalMapel?.kode ||
			slot.jadwalMapel?.nama ||
			slot.mataPelajaran?.kode ||
			slot.mataPelajaran?.nama ||
			'-'
		);
	if (slot.kokurikuler) return slot.kokurikuler.kode || 'Kokurikuler';
	if (slot.kegiatan) return slot.kegiatan.nama;
	if (slot.catatan) return slot.catatan;
	return slot.tipe === 'istirahat' ? 'Istirahat' : 'Kosong';
}

export async function load({ locals, url }) {
	requireJadwalAccess(locals.user);
	const sekolah = locals.sekolah;
	const sekolahId = sekolah?.id;
	if (!sekolahId || !sekolah || !locals.user) throw redirect(303, '/login');

	const academic = await resolveSekolahAcademicContext(sekolahId);
	await ensureDefaultJadwalFoundation(sekolahId, {
		tahunAjaranId: academic.activeTahunAjaranId,
		semesterId: academic.activeSemesterId
	});

	const [{ kelasList }, guruList] = await Promise.all([
		loadAbsensiKelasOptions(sekolahId, locals.user),
		db.query.tablePegawai.findMany({
			columns: { id: true, nama: true, nip: true },
			where: and(eq(tablePegawai.sekolahId, sekolahId), eq(tablePegawai.status, 'aktif')),
			orderBy: asc(tablePegawai.nama)
		})
	]);

	const selectedGuruId = resolveGuruId(
		guruList,
		parsePositiveInteger(url.searchParams.get('guru_id')),
		locals.user
	);
	const selectedKelasId = resolveKelasId(
		kelasList,
		parsePositiveInteger(url.searchParams.get('kelas_id'))
	);
	const accessibleKelasIds = kelasList.map((kelas) => kelas.id);
	const whereParts = [eq(tableJadwalPelajaran.sekolahId, sekolahId)];

	if (academic.activeSemesterId) {
		whereParts.push(eq(tableJadwalPelajaran.semesterId, academic.activeSemesterId));
	}
	if (selectedGuruId) whereParts.push(eq(tableJadwalPelajaran.guruPegawaiId, selectedGuruId));
	if (selectedKelasId) {
		whereParts.push(eq(tableJadwalPelajaran.kelasId, selectedKelasId));
	} else if (locals.user.type === 'wali_kelas') {
		whereParts.push(
			accessibleKelasIds.length
				? inArray(tableJadwalPelajaran.kelasId, accessibleKelasIds)
				: eq(tableJadwalPelajaran.kelasId, -1)
		);
	}

	const jadwalList = academic.activeSemesterId
		? await db.query.tableJadwalPelajaran.findMany({
				where: and(...whereParts),
				with: {
					jam: true,
					kelas: {
						columns: { id: true, nama: true, fase: true }
					},
					jadwalMapel: {
						columns: { id: true, nama: true, kode: true }
					},
					mataPelajaran: {
						columns: { id: true, nama: true, kode: true, jenis: true }
					},
					kegiatan: {
						columns: { id: true, nama: true, kode: true, kategori: true, warna: true }
					},
					kokurikuler: {
						columns: { id: true, kode: true, tujuan: true }
					},
					guru: {
						columns: { id: true, nama: true, nip: true }
					}
				}
			})
		: [];

	const sortedJadwal = jadwalList
		.map((slot) => ({ ...slot, label: buildSlotLabel(slot) }))
		.sort((a, b) => {
			const hariDiff =
				HARI_URUTAN.indexOf(a.hari as (typeof HARI_URUTAN)[number]) -
				HARI_URUTAN.indexOf(b.hari as (typeof HARI_URUTAN)[number]);
			if (hariDiff !== 0) return hariDiff;
			return (a.jam?.jamKe ?? 0) - (b.jam?.jamKe ?? 0);
		});

	const summaryByGuru = new Map<
		number,
		{ id: number; nama: string; nip: string; totalJam: number; totalKelas: Set<number> }
	>();
	for (const slot of sortedJadwal) {
		if (!slot.guru) continue;
		const existing = summaryByGuru.get(slot.guru.id) ?? {
			id: slot.guru.id,
			nama: slot.guru.nama,
			nip: slot.guru.nip,
			totalJam: 0,
			totalKelas: new Set<number>()
		};
		existing.totalJam += slot.tipe === 'pelajaran' ? 1 : 0;
		if (slot.kelasId) existing.totalKelas.add(slot.kelasId);
		summaryByGuru.set(slot.guru.id, existing);
	}

	return {
		meta: { title: 'Jadwal Guru' } satisfies PageMeta,
		activeSemesterId: academic.activeSemesterId,
		selectedGuruId,
		selectedKelasId,
		guruList,
		kelasList,
		hariLabels: JADWAL_HARI_LABELS,
		jadwalList: sortedJadwal,
		summaryList: [...summaryByGuru.values()]
			.map((item) => ({ ...item, totalKelas: item.totalKelas.size }))
			.sort((a, b) => a.nama.localeCompare(b.nama)),
		sekolahNama: sekolah.nama,
		userIsGuru: locals.user.type === 'user' && !!locals.user.pegawaiId
	};
}
