import db from '$lib/server/db';
import { tableAuthUserMataPelajaran, tableMataPelajaran } from '$lib/server/db/schema';
import {
	consumeAiRateLimit,
	generateTujuanPembelajaran,
	getAiSettings
} from '$lib/server/ai';
import { and, eq } from 'drizzle-orm';
import { json } from '@sveltejs/kit';

const MAX_GROUPS = 12;
const MAX_ITEMS = 12;
const MAX_CP_LENGTH = 12_000;

function canUseGenerator(user: Pick<AuthUser, 'type' | 'permissions'>) {
	return (
		['admin', 'user', 'wali_kelas', 'wali_asuh'].includes(user.type) ||
		user.permissions?.includes('rapor_manage')
	);
}

export const POST = async ({ request, locals }) => {
	const user = locals.user;
	const sekolahId = locals.sekolah?.id;
	if (!user) return json({ message: 'Sesi berakhir. Silakan masuk kembali.' }, { status: 401 });
	if (!sekolahId || !canUseGenerator(user)) {
		return json({ message: 'Anda tidak berhak menggunakan fitur ini.' }, { status: 403 });
	}
	if (!consumeAiRateLimit(`${sekolahId}:${user.id}`)) {
		return json({ message: 'Batas penggunaan sementara tercapai. Coba lagi beberapa menit.' }, { status: 429 });
	}

	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return json({ message: 'Data permintaan tidak valid.' }, { status: 400 });
	}
	const mapelId = Number(body.mapelId);
	const capaianPembelajaran =
		typeof body.capaianPembelajaran === 'string' ? body.capaianPembelajaran.trim() : '';
	const maxLingkupMateri = Number(body.maxLingkupMateri);
	const maxTujuanPembelajaran = Number(body.maxTujuanPembelajaran);
	if (!Number.isInteger(mapelId) || mapelId < 1) {
		return json({ message: 'Mata pelajaran tidak valid.' }, { status: 400 });
	}
	if (!capaianPembelajaran || capaianPembelajaran.length > MAX_CP_LENGTH) {
		return json(
			{ message: `Capaian Pembelajaran wajib diisi dan maksimal ${MAX_CP_LENGTH} karakter.` },
			{ status: 400 }
		);
	}
	if (!Number.isInteger(maxLingkupMateri) || maxLingkupMateri < 1 || maxLingkupMateri > MAX_GROUPS) {
		return json({ message: `Jumlah lingkup materi harus 1-${MAX_GROUPS}.` }, { status: 400 });
	}
	if (!Number.isInteger(maxTujuanPembelajaran) || maxTujuanPembelajaran < 1 || maxTujuanPembelajaran > MAX_ITEMS) {
		return json({ message: `Jumlah tujuan per lingkup harus 1-${MAX_ITEMS}.` }, { status: 400 });
	}

	const mapel = await db.query.tableMataPelajaran.findFirst({
		where: eq(tableMataPelajaran.id, mapelId),
		with: { kelas: { with: { semester: true } } }
	});
	if (!mapel || mapel.kelas.sekolahId !== sekolahId) {
		return json({ message: 'Mata pelajaran tidak ditemukan.' }, { status: 404 });
	}
	if (user.type === 'wali_kelas' && user.kelasId !== mapel.kelasId) {
		return json({ message: 'Mata pelajaran berada di luar kelas penugasan Anda.' }, { status: 403 });
	}
	if (user.type === 'user') {
		const assigned =
			user.mataPelajaranId === mapelId ||
			Boolean(
				await db.query.tableAuthUserMataPelajaran.findFirst({
					where: and(
						eq(tableAuthUserMataPelajaran.authUserId, user.id),
						eq(tableAuthUserMataPelajaran.mataPelajaranId, mapelId)
					)
				})
			);
		if (!assigned) return json({ message: 'Mata pelajaran belum ditugaskan kepada Anda.' }, { status: 403 });
	}

	const settings = await getAiSettings(sekolahId);
	if (!settings) {
		return json({ message: 'Generator AI belum dikonfigurasi oleh admin.' }, { status: 400 });
	}
	try {
		const groups = await generateTujuanPembelajaran({
			...settings,
			capaianPembelajaran,
			mapelNama: mapel.nama,
			kelasLabel: `Kelas ${mapel.kelas.nama}${mapel.kelas.fase ? ` Fase ${mapel.kelas.fase}` : ''}`,
			semesterAktif: mapel.kelas.semester?.nama?.trim() || '',
			maxLingkupMateri,
			maxTujuanPembelajaran
		});
		return json({ data: { groups } });
	} catch (error) {
		return json(
			{ message: error instanceof Error ? error.message : 'Generator AI gagal diproses.' },
			{ status: 502 }
		);
	}
};
