import { error } from '@sveltejs/kit';
import db from '$lib/server/db';
import { getStudentEducationIdentity } from '$lib/server/education-units';
import { ensureUjianSchema } from '$lib/server/db/ensure-ujian';
import { ensureAbsensiDigitalSchema } from '$lib/server/db/ensure-absensi-digital';
import { tableMurid, tableQrMurid } from '$lib/server/db/schema';
import { resolvePrintableQrToken } from '$lib/server/absensi-digital';
import { and, eq, inArray, isNull, desc } from 'drizzle-orm';
import QRCode from 'qrcode';
import { renderPDF } from '$lib/server/pdf/pagedpdf';
import { renderKartuUjianHTML } from '$lib/server/pdf/templates/kartu-ujian';
import { renderKartuUjianMejaHTML } from '$lib/server/pdf/templates/kartu-ujian-meja';
import {
	composeAlamat,
	fallbackTempat,
	formatTanggal,
	getLogoDinasSrc,
	getLogoSrc,
	requireInteger
} from '$lib/server/pdf/preview-utils';
import { isAuthorizedUser } from '../../../pengguna/permissions';
import { pdfDisposition, pdfFilename } from '$lib/pdf-filename';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!isAuthorizedUser(['ujian_cetak', 'ujian_manage'], locals.user))
		throw error(403, 'Tidak memiliki izin mencetak kartu ujian.');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId || !locals.sekolah) throw error(400, 'Sekolah aktif tidak ditemukan.');
	await ensureUjianSchema();
	const sessionId = requireInteger('session_id', url.searchParams.get('session_id'));
	const kelas = url.searchParams.get('kelas')?.trim().slice(0, 120) || null;
	const ruang = url.searchParams.get('ruang')?.trim().slice(0, 120) || null;
	const layout = url.searchParams.get('layout') || 'kartu';
	if (layout !== 'kartu' && layout !== 'meja') throw error(400, 'Format kartu ujian tidak valid.');
	const isDeskCard = layout === 'meja';
	const showAttendanceQr = url.searchParams.get('qr_absensi') === '1';
	if (isDeskCard && showAttendanceQr)
		throw error(400, 'QR absensi hanya tersedia pada Kartu Ujian biasa.');
	const showLmsAccount = url.searchParams.get('akun_lms') === '1';
	const showPrincipalSignature = !isDeskCard || url.searchParams.get('ttd_kepsek') !== '0';
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
		sql: `SELECT id AS participantId, murid_id AS muridId, nomor_peserta AS nomorPeserta, murid_nama_snapshot AS nama,
			nis_snapshot AS nis, nisn_snapshot AS nisn, kelas_nama_snapshot AS kelas,
			ruang, username_lms AS usernameLms, password_lms AS passwordLms, sekolah_nama_snapshot AS schoolName
		FROM ujian_peserta WHERE session_id=? AND (? IS NULL OR kelas_nama_snapshot=?)
		AND (? IS NULL OR ruang=?)
		ORDER BY COALESCE(ruang,''), LENGTH(COALESCE(nomor_peserta,'')), COALESCE(nomor_peserta,''), murid_nama_snapshot`,
		args: [sessionId, kelas, kelas, ruang, ruang]
	});
	if (!participantResult.rows.length)
		throw error(400, 'Sesi ujian belum memiliki peserta untuk pilihan ini.');
	const attendanceQrImages = new Map<number, string>();
	if (showAttendanceQr) {
		await ensureAbsensiDigitalSchema();
		const participantIds = [
			...new Set(
				participantResult.rows
					.map((row) => Number(row.muridId))
					.filter((id) => Number.isInteger(id) && id > 0)
			)
		];
		const students = participantIds.length
			? await db.query.tableMurid.findMany({
					columns: { id: true },
					where: and(eq(tableMurid.sekolahId, sekolahId), inArray(tableMurid.id, participantIds))
				})
			: [];
		const studentIds = students.map((student) => student.id);
		const records = studentIds.length
			? await db.query.tableQrMurid.findMany({
					columns: { muridId: true, tokenHash: true, tokenVersion: true, issuedAt: true },
					where: and(inArray(tableQrMurid.muridId, studentIds), isNull(tableQrMurid.revokedAt)),
					orderBy: [desc(tableQrMurid.tokenVersion), desc(tableQrMurid.id)]
				})
			: [];
		const tokens = new Map<number, string | null>();
		for (const record of records) {
			if (!tokens.has(record.muridId)) tokens.set(record.muridId, resolvePrintableQrToken(record));
		}
		const unavailable = participantResult.rows.filter((row) => !tokens.get(Number(row.muridId)));
		if (unavailable.length)
			throw error(
				409,
				`QR absensi belum tersedia atau perlu diperbarui untuk ${unavailable.length} peserta (${unavailable
					.slice(0, 3)
					.map((row) => row.nama)
					.join(
						', '
					)}). Buat/perbarui QR melalui Absensi - Kartu Absensi, atau gunakan QR Absensi OFF.`
			);
		for (const [muridId, token] of tokens) {
			if (token)
				attendanceQrImages.set(
					muridId,
					await QRCode.toDataURL(token, { margin: 4, width: 480, errorCorrectionLevel: 'M' })
				);
		}
	}

	const schoolResult = await db.$client.execute({
		sql: `SELECT s.nama, s.email, s.naungan, p.nama AS kepalaNama, p.nip AS kepalaNip
		FROM sekolah s LEFT JOIN pegawai p ON p.id=s.kepala_sekolah_id
		WHERE s.id=? LIMIT 1`,
		args: [sekolahId]
	});
	const school = schoolResult.rows[0];
	const [logoUrl, logoDinasUrl] = await Promise.all([
		getLogoSrc(sekolahId),
		getLogoDinasSrc(sekolahId)
	]);
	const tanggal = formatTanggal(
		String(session.tanggalCetak || new Date().toISOString().slice(0, 10))
	);
	const tempat = fallbackTempat(locals.sekolah);
	const renderCards = isDeskCard ? renderKartuUjianMejaHTML : renderKartuUjianHTML;
	const participantSchools = new Map<number, string>();
	for (const row of participantResult.rows) {
		participantSchools.set(
			Number(row.participantId),
			row.schoolName
				? String(row.schoolName)
				: (await getStudentEducationIdentity(sekolahId, Number(row.muridId))).nama
		);
	}
	const html = renderCards({
		sekolah: {
			nama: String(school?.nama ?? locals.sekolah.nama),
			alamat: composeAlamat(locals.sekolah),
			email: String(school?.email ?? ''),
			naungan: String(school?.naungan ?? locals.sekolah.naungan),
			logoUrl,
			logoDinasUrl
		},
		ujian: {
			nama: String(session.nama),
			singkatan: session.singkatan ? String(session.singkatan) : null,
			tahunAjaran: String(session.tahunAjaran),
			semester: session.semester ? String(session.semester) : null,
			tanggalCetak: tanggal
		},
		showAttendanceQr,
		showLmsAccount,
		showPrincipalSignature,
		peserta: participantResult.rows.map((row) => ({
			sekolah: {
				nama: participantSchools.get(Number(row.participantId)) || '',
				alamat: composeAlamat(locals.sekolah!),
				email: String(school?.email ?? ''),
				naungan: String(school?.naungan ?? ''),
				logoUrl,
				logoDinasUrl
			},
			nomorPeserta: row.nomorPeserta ? String(row.nomorPeserta) : null,
			nama: String(row.nama),
			nis: row.nis ? String(row.nis) : null,
			nisn: row.nisn ? String(row.nisn) : null,
			kelas: row.kelas ? String(row.kelas) : null,
			ruang: row.ruang ? String(row.ruang) : null,
			usernameLms: row.usernameLms ? String(row.usernameLms) : null,
			passwordLms: row.passwordLms ? String(row.passwordLms) : null,
			qrDataUrl: attendanceQrImages.get(Number(row.muridId)) ?? null
		})),
		tandaTangan: {
			tempatTanggal: [tempat, tanggal].filter(Boolean).join(', '),
			nama: String(school?.kepalaNama ?? ''),
			nip: school?.kepalaNip ? String(school.kepalaNip) : null,
			jabatan: 'Kepala Sekolah'
		}
	});
	const pdf = Buffer.from(await renderPDF(html));
	const filename = pdfFilename(
		isDeskCard ? 'Kartu Ujian Meja' : 'Kartu Ujian',
		String(session.singkatan || session.nama),
		String(session.tahunAjaran),
		kelas || `${participantResult.rows.length} Peserta`,
		ruang ? `Ruang ${ruang}` : null
	);
	return new Response(new Blob([pdf], { type: 'application/pdf' }), {
		headers: {
			'content-type': 'application/pdf',
			'content-disposition': pdfDisposition(filename),
			'cache-control': 'no-store'
		}
	});
};
