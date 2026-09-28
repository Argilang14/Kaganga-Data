import { error } from '@sveltejs/kit';
import db from '$lib/server/db';
import { ensureUjianSchema } from '$lib/server/db/ensure-ujian';
import { renderPDF } from '$lib/server/pdf/pagedpdf';
import { renderKartuUjianHTML } from '$lib/server/pdf/templates/kartu-ujian';
import { composeAlamat, fallbackTempat, formatTanggal, getLogoDinasSrc, getLogoSrc, requireInteger } from '$lib/server/pdf/preview-utils';
import { isAuthorizedUser } from '../../../pengguna/permissions';
import { pdfDisposition, pdfFilename } from '$lib/pdf-filename';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!isAuthorizedUser(['ujian_cetak', 'ujian_manage'], locals.user)) throw error(403, 'Tidak memiliki izin mencetak kartu ujian.');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId || !locals.sekolah) throw error(400, 'Sekolah aktif tidak ditemukan.');
	await ensureUjianSchema();
	const sessionId = requireInteger('session_id', url.searchParams.get('session_id'));
	const kelas = url.searchParams.get('kelas')?.trim().slice(0, 120) || null;
	const sessionResult = await db.$client.execute({
		sql: `SELECT s.id, s.nama, s.singkatan, s.tanggal_cetak AS tanggalCetak,
			ta.nama AS tahunAjaran, se.nama AS semester
		FROM ujian_session s JOIN tahun_ajaran ta ON ta.id=s.tahun_ajaran_id
		LEFT JOIN semester se ON se.id=s.semester_id
		WHERE s.id=? AND s.sekolah_id=? LIMIT 1`,
		args: [sessionId, sekolahId]
	});
	const session = sessionResult.rows[0];
	if (!session) throw error(404, 'Sesi ujian tidak ditemukan.');
	const participantResult = await db.$client.execute({
		sql: `SELECT nomor_peserta AS nomorPeserta, murid_nama_snapshot AS nama,
			nis_snapshot AS nis, nisn_snapshot AS nisn, kelas_nama_snapshot AS kelas,
			ruang, username_lms AS usernameLms, password_lms AS passwordLms
		FROM ujian_peserta WHERE session_id=? AND (? IS NULL OR kelas_nama_snapshot=?)
		ORDER BY COALESCE(ruang,''), COALESCE(nomor_peserta,''), murid_nama_snapshot`,
		args: [sessionId, kelas, kelas]
	});
	if (!participantResult.rows.length) throw error(400, 'Sesi ujian belum memiliki peserta untuk pilihan ini.');

	const schoolResult = await db.$client.execute({
		sql: `SELECT s.nama, s.email, s.naungan, p.nama AS kepalaNama, p.nip AS kepalaNip
		FROM sekolah s LEFT JOIN pegawai p ON p.id=s.kepala_sekolah_id
		WHERE s.id=? LIMIT 1`,
		args: [sekolahId]
	});
	const school = schoolResult.rows[0];
	const [logoUrl, logoDinasUrl] = await Promise.all([getLogoSrc(sekolahId), getLogoDinasSrc(sekolahId)]);
	const tanggal = formatTanggal(String(session.tanggalCetak || new Date().toISOString().slice(0, 10)));
	const tempat = fallbackTempat(locals.sekolah);
	const html = renderKartuUjianHTML({
		sekolah: { nama: String(school?.nama ?? locals.sekolah.nama), alamat: composeAlamat(locals.sekolah), email: String(school?.email ?? ''), naungan: String(school?.naungan ?? locals.sekolah.naungan), logoUrl, logoDinasUrl },
		ujian: { nama: String(session.nama), singkatan: session.singkatan ? String(session.singkatan) : null, tahunAjaran: String(session.tahunAjaran), semester: session.semester ? String(session.semester) : null, tanggalCetak: tanggal },
		peserta: participantResult.rows.map((row) => ({ nomorPeserta: row.nomorPeserta ? String(row.nomorPeserta) : null, nama: String(row.nama), nis: row.nis ? String(row.nis) : null, nisn: row.nisn ? String(row.nisn) : null, kelas: row.kelas ? String(row.kelas) : null, ruang: row.ruang ? String(row.ruang) : null, usernameLms: row.usernameLms ? String(row.usernameLms) : null, passwordLms: row.passwordLms ? String(row.passwordLms) : null })),
		tandaTangan: { tempatTanggal: [tempat, tanggal].filter(Boolean).join(', '), nama: String(school?.kepalaNama ?? ''), nip: school?.kepalaNip ? String(school.kepalaNip) : null, jabatan: 'Kepala Sekolah' }
	});
	const pdf = Buffer.from(await renderPDF(html));
	const filename = pdfFilename('Kartu Ujian', String(session.singkatan || session.nama), String(session.tahunAjaran), kelas || `${participantResult.rows.length} Peserta`);
	return new Response(new Blob([pdf], { type: 'application/pdf' }), { headers: { 'content-type': 'application/pdf', 'content-disposition': pdfDisposition(filename), 'cache-control': 'no-store' } });
};
