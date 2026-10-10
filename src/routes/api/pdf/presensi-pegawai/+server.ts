import { error } from '@sveltejs/kit';
import { and, eq, or, sql } from 'drizzle-orm';
import db from '$lib/server/db';
import { commonSchoolIdentity } from '$lib/server/education-units';
import { tablePegawai, tableSekolah } from '$lib/server/db/schema';
import { isAuthorizedUser } from '../../../pengguna/permissions';
import { isValidDate } from '$lib/server/absen/utils';
import {
	listPresensiPegawaiBulanan,
	listPresensiPegawaiHarian
} from '$lib/server/presensi-pegawai';
import { statusLabel, normalizePegawaiJenis, pegawaiJenisLabel } from '$lib/presensi-pegawai-utils';
import { renderPDF } from '$lib/server/pdf/pagedpdf';
import { composeAlamat, getLogoDinasSrc, getLogoSrc } from '$lib/server/pdf/preview-utils';
import { renderPresensiPegawaiHTML } from '$lib/server/pdf/templates/presensi-pegawai';
import type { RequestHandler } from './$types';

const monthNames = [
	'Januari',
	'Februari',
	'Maret',
	'April',
	'Mei',
	'Juni',
	'Juli',
	'Agustus',
	'September',
	'Oktober',
	'November',
	'Desember'
];

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!isAuthorizedUser(['administrasi_presensi_pegawai'], locals.user))
		throw error(403, 'Forbidden');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId || !locals.sekolah) throw error(400, 'Sekolah aktif tidak ditemukan.');
	const q = url.searchParams.get('q')?.trim().slice(0, 100) ?? '';
	const jenis = normalizePegawaiJenis(url.searchParams.get('jenis'));
	const sekolah = await db.query.tableSekolah.findFirst({
		columns: { nama: true, npsn: true, kepalaSekolahId: true },
		where: eq(tableSekolah.id, sekolahId)
	});
	const [kepala, pejabat, logoUrl, logoDinasUrl] = await Promise.all([
		sekolah?.kepalaSekolahId
			? db.query.tablePegawai.findFirst({
					columns: { nama: true, nip: true },
					where: and(
						eq(tablePegawai.id, sekolah.kepalaSekolahId),
						eq(tablePegawai.sekolahId, sekolahId)
					)
				})
			: null,
		db.query.tablePegawai.findFirst({
			columns: { nama: true, nip: true, jabatan: true },
			where: and(
				eq(tablePegawai.sekolahId, sekolahId),
				eq(tablePegawai.status, 'aktif'),
				or(
					sql`lower(${tablePegawai.jabatan}) like '%tata usaha%'`,
					eq(tablePegawai.jenis, 'tu'),
					eq(tablePegawai.jenis, 'operator')
				)
			)
		}),
		getLogoSrc(sekolahId),
		getLogoDinasSrc(sekolahId)
	]);

	let judul = 'DAFTAR PRESENSI PEGAWAI';
	let periode = '';
	let headers: string[] = [];
	let rows: Array<Array<string | number>> = [];
	const tanggal = url.searchParams.get('tanggal');
	if (tanggal && isValidDate(tanggal)) {
		const data = await listPresensiPegawaiHarian(sekolahId, tanggal, q, jenis);
		periode = new Intl.DateTimeFormat('id-ID', { dateStyle: 'full' }).format(
			new Date(`${tanggal}T12:00:00`)
		);
		headers = ['No.', 'Nama', 'NIP', 'Jenis', 'Status', 'Masuk', 'Pulang', 'Keterangan'];
		rows = data.map((row, index) => [
			index + 1,
			row.nama,
			row.nip || '-',
			pegawaiJenisLabel(row.jenis),
			statusLabel(row.status),
			row.waktuMasuk || '-',
			row.waktuPulang || '-',
			row.keterangan || '-'
		]);
	} else {
		const now = new Date();
		const month = Number(url.searchParams.get('bulan'));
		const year = Number(url.searchParams.get('tahun'));
		const bulan = Number.isInteger(month) && month >= 1 && month <= 12 ? month : now.getMonth() + 1;
		const tahun = Number.isInteger(year) && year >= 2000 && year <= 2200 ? year : now.getFullYear();
		const data = await listPresensiPegawaiBulanan(sekolahId, tahun, bulan, q, jenis);
		judul = 'REKAP PRESENSI PEGAWAI';
		periode = `${monthNames[bulan - 1]} ${tahun}`;
		headers = [
			'No.',
			'Nama',
			'NIP',
			'Jenis',
			'Hadir',
			'Izin',
			'Sakit',
			'Dinas Luar',
			'Cuti',
			'Belum'
		];
		rows = data.rows.map((row, index) => [
			index + 1,
			row.nama,
			row.nip || '-',
			pegawaiJenisLabel(row.jenis),
			row.counts.hadir,
			row.counts.izin,
			row.counts.sakit,
			row.counts.dinas_luar,
			row.counts.cuti,
			row.counts.belum
		]);
	}

	const html = renderPresensiPegawaiHTML({
		sekolah: {
			nama: sekolah?.nama ?? '',
			npsn: commonSchoolIdentity(locals.sekolah).npsn,
			alamat: composeAlamat(locals.sekolah),
			logoUrl,
			logoDinasUrl
		},
		judul,
		periode: `${periode}${jenis ? ` - ${pegawaiJenisLabel(jenis)}` : ''}`,
		headers,
		rows,
		tandaTangan: {
			kiri: {
				jabatan: 'Mengetahui, Kepala Sekolah',
				nama: kepala?.nama ?? '',
				nip: kepala?.nip ?? ''
			},
			kanan: {
				jabatan: pejabat?.jabatan || 'Petugas Administrasi',
				nama: pejabat?.nama ?? '',
				nip: pejabat?.nip ?? ''
			}
		}
	});
	const pdf = Buffer.from(await renderPDF(html));
	return new Response(new Blob([pdf], { type: 'application/pdf' }), {
		headers: {
			'content-type': 'application/pdf',
			'content-disposition': 'inline; filename="presensi-pegawai.pdf"',
			'cache-control': 'no-store'
		}
	});
};
