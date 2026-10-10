import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import db from '$lib/server/db';
import { commonSchoolIdentity } from '$lib/server/education-units';
import { ensureSuratMenyuratSchema } from '$lib/server/db/ensure-surat-menyurat';
import { tableSekolah, tableSppd } from '$lib/server/db/schema';
import { renderPDF } from '$lib/server/pdf/pagedpdf';
import { renderSppdHTML, type SppdPrintData } from '$lib/server/pdf/templates/sppd';
import {
	fallbackTempat,
	formatTanggal,
	getLogoDinasSrc,
	getLogoSrc
} from '$lib/server/pdf/preview-utils';
import type { RequestHandler } from './$types';

function clean(value: string | null | undefined) {
	return value?.trim() === '-' ? '' : (value?.trim() ?? '');
}

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Harus login terlebih dahulu.');
	if (
		locals.user.type !== 'admin' &&
		!locals.user.permissions?.includes('surat_sppd' as UserPermission)
	) {
		throw error(403, 'Tidak memiliki akses cetak SPPD.');
	}
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw error(400, 'Sekolah aktif tidak ditemukan.');
	const id = Number(url.searchParams.get('id'));
	if (!Number.isInteger(id) || id <= 0) throw error(400, 'ID SPPD tidak valid.');
	await ensureSuratMenyuratSchema();

	const sppd = await db.query.tableSppd.findFirst({
		where: and(eq(tableSppd.id, id), eq(tableSppd.sekolahId, sekolahId)),
		with: {
			pelaksana: {
				with: { pegawai: true }
			},
			pengikut: true
		}
	});
	if (!sppd) throw error(404, 'SPPD tidak ditemukan.');
	const sekolah = await db.query.tableSekolah.findFirst({
		columns: { logo: false, logoDinas: false },
		with: { alamat: true, kepalaSekolah: true },
		where: eq(tableSekolah.id, sekolahId)
	});
	if (!sekolah) throw error(404, 'Sekolah tidak ditemukan.');
	const [logoUrl, logoDinasUrl] = await Promise.all([
		getLogoSrc(sekolahId),
		getLogoDinasSrc(sekolahId)
	]);

	const data: SppdPrintData = {
		sekolah: {
			id: sekolah.id,
			nama: sekolah.nama,
			jenjang: sekolah.jenjangPendidikan,
			jenjangVariant: sekolah.jenjangVariant,
			naungan: sekolah.naungan,
			npsn: locals.sekolah ? commonSchoolIdentity(locals.sekolah).npsn : sekolah.npsn,
			alamat: {
				jalan: sekolah.alamat?.jalan ?? '',
				desa: sekolah.alamat?.desa ?? '',
				kecamatan: sekolah.alamat?.kecamatan ?? '',
				kabupaten: sekolah.alamat?.kabupaten ?? '',
				provinsi: sekolah.alamat?.provinsi ?? null
			},
			website: sekolah.website,
			email: sekolah.email,
			logoUrl,
			logoDinasUrl
		},
		surat: {
			nomor: clean(sppd.nomorSurat),
			tanggal: formatTanggal(sppd.tanggalSurat),
			dasar: clean(sppd.dasarSurat),
			maksud: sppd.maksud,
			alatAngkut: clean(sppd.alatAngkut),
			tempatBerangkat: clean(sppd.tempatBerangkat),
			tempatTujuan: sppd.tempatTujuan,
			lamanya: clean(sppd.lamanya),
			tanggalBerangkat: formatTanggal(sppd.tanggalBerangkat),
			tanggalKembali: formatTanggal(sppd.tanggalKembali),
			keteranganPengikut: clean(sppd.keteranganPengikut),
			kodeRekening: clean(sppd.kodeRekening),
			keteranganLain: clean(sppd.keteranganLain || sppd.keterangan)
		},
		pegawai: sppd.pelaksana.map((row) => ({
			nama: row.pegawai?.nama ?? row.nama,
			pangkat: clean(row.pegawai?.pangkatGolongan),
			golongan: '',
			nip: clean(row.pegawai?.nip),
			jabatan: clean(row.pegawai?.jabatan),
			tingkatBiaya: clean(sppd.tingkatBiaya)
		})),
		pengikut: sppd.pengikut.map((row) => ({
			nama: row.nama,
			tempatLahir: row.tempatLahir,
			tanggalLahir: formatTanggal(row.tanggalLahir)
		})),
		ttd: {
			tempat: fallbackTempat(sekolah as unknown as NonNullable<App.Locals['sekolah']>),
			tanggal: formatTanggal(sppd.tanggalSurat || new Date()),
			statusKepalaSekolah: sekolah.statusKepalaSekolah,
			nama: clean(sekolah.kepalaSekolah?.nama),
			nip: clean(sekolah.kepalaSekolah?.nip)
		}
	};

	try {
		const pdf = await renderPDF(renderSppdHTML(data));
		return new Response(new Blob([pdf as unknown as BlobPart], { type: 'application/pdf' }), {
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `inline; filename="sppd-${id}.pdf"`,
				'Cache-Control': 'private, no-store'
			}
		});
	} catch (cause) {
		console.error('[SPPD PDF]', cause);
		throw error(500, 'Gagal menghasilkan PDF SPPD.');
	}
};
