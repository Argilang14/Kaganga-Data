import { error } from '@sveltejs/kit';
import { pdfFilename, pdfDisposition } from '$lib/pdf-filename';
import { and, eq, isNotNull } from 'drizzle-orm';
import db from '$lib/server/db';
import { ensureMartikulasiSchema } from '$lib/server/db/ensure-martikulasi';
import {
	tableKelas,
	tableMartikulasiHasil,
	tableMartikulasiSettings,
	tableMurid,
	tablePegawai,
	tableSekolah,
	tableTahunAjaran
} from '$lib/server/db/schema';
import { getClassEducationIdentity, commonSchoolIdentity } from '$lib/server/education-units';
import { renderPDF } from '$lib/server/pdf/pagedpdf';
import {
	renderRaportMartikulasiHTML,
	renderSkMartikulasiHTML,
	renderSttmMartikulasiHTML,
	type MartikulasiStudentPrint
} from '$lib/server/pdf/templates/martikulasi';
import {
	composeAlamat,
	fallbackTempat,
	formatTanggal,
	getLogoDinasSrc,
	getLogoSrc,
	optionalInteger,
	requireInteger
} from '$lib/server/pdf/preview-utils';
import type { RequestHandler } from './$types';

const labels = {
	sk: 'SK-Tim-Martikulasi',
	raport: 'Raport-Hasil-Martikulasi',
	sttm: 'STTM'
} as const;

export const GET = (async ({ locals, url }) => {
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId || !locals.user?.id) throw error(401, 'Unauthorized');
	await ensureMartikulasiSchema();

	const jenis = url.searchParams.get('jenis');
	if (jenis !== 'sk' && jenis !== 'raport' && jenis !== 'sttm') {
		throw error(400, 'Jenis dokumen Martikulasi tidak valid.');
	}
	const tahunAjaranId = requireInteger('tahun_ajaran_id', url.searchParams.get('tahun_ajaran_id'));
	const kelasId = optionalInteger('kelas_id', url.searchParams.get('kelas_id'));
	const muridId = optionalInteger('murid_id', url.searchParams.get('murid_id'));
	const draft = url.searchParams.get('draft') === '1';
	const showBgLogo = url.searchParams.get('bg_logo') === '1';
	if (jenis === 'sttm' && draft && !muridId) {
		throw error(400, 'Pratinjau draf STTM harus memilih satu murid.');
	}

	const [tahun, settings, sekolah, logoUrl, logoDinasUrl] = await Promise.all([
		db.query.tableTahunAjaran.findFirst({
			columns: { id: true, nama: true },
			where: and(eq(tableTahunAjaran.id, tahunAjaranId), eq(tableTahunAjaran.sekolahId, sekolahId))
		}),
		db.query.tableMartikulasiSettings.findFirst({
			where: and(
				eq(tableMartikulasiSettings.sekolahId, sekolahId),
				eq(tableMartikulasiSettings.tahunAjaranId, tahunAjaranId)
			),
			with: { tim: true }
		}),
		db.query.tableSekolah.findFirst({
			columns: {
				nama: true,
				npsn: true,
				naungan: true,
				email: true,
				kepalaSekolahId: true,
				statusKepalaSekolah: true
			},
			where: eq(tableSekolah.id, sekolahId)
		}),
		getLogoSrc(sekolahId),
		getLogoDinasSrc(sekolahId)
	]);
	if (!tahun) throw error(404, 'Tahun ajaran tidak ditemukan pada sekolah aktif.');
	if (!settings) throw error(400, 'Pengaturan Martikulasi untuk tahun ajaran ini belum disimpan.');
	if (!sekolah) throw error(404, 'Data sekolah tidak ditemukan.');

	const kepala = await db.query.tablePegawai.findFirst({
		columns: { nama: true, nip: true },
		where: and(eq(tablePegawai.id, sekolah.kepalaSekolahId), eq(tablePegawai.sekolahId, sekolahId))
	});
	const schoolPrint = {
		backgroundLogoUrl: showBgLogo ? logoUrl : null,
		nama: settings.sekolahNamaSnapshot || sekolah.nama,
		npsn: locals.sekolah ? commonSchoolIdentity(locals.sekolah).npsn : sekolah.npsn,
		naungan: settings.naunganSnapshot || sekolah.naungan,
		alamat: settings.alamatSnapshot || (locals.sekolah ? composeAlamat(locals.sekolah) : ''),
		email: settings.emailSnapshot || sekolah.email,
		logoUrl,
		logoDinasUrl,
		kepalaSekolah: {
			nama: settings.kepalaSekolahNamaSnapshot || kepala?.nama || '',
			nip: settings.kepalaSekolahNipSnapshot || kepala?.nip || null,
			status: settings.kepalaSekolahStatusSnapshot || sekolah.statusKepalaSekolah
		}
	};
	const settingsPrint = {
		tahunAjaran: tahun.nama,
		periodeMulai: formatTanggal(settings.periodeMulai),
		periodeSelesai: formatTanggal(settings.periodeSelesai),
		nomorSk: settings.nomorSk,
		tanggalSk: formatTanggal(settings.tanggalSk),
		lokasiPenetapan:
			settings.lokasiPenetapan || (locals.sekolah ? fallbackTempat(locals.sekolah) : '')
	};

	let html: string;
	let filename = pdfFilename(labels[jenis], tahun.nama);
	if (jenis === 'sk') {
		html = renderSkMartikulasiHTML({
			school: schoolPrint,
			settings: settingsPrint,
			tim: settings.tim
				.sort((a, b) => a.urutan - b.urutan || a.id - b.id)
				.map((item) => ({
					nama: item.namaSnapshot,
					nip: item.nipSnapshot,
					jabatan: item.jabatanTim,
					tugas: item.tugas
				}))
		});
	} else {
		const conditions = [
			eq(tableMartikulasiHasil.sekolahId, sekolahId),
			eq(tableMartikulasiHasil.tahunAjaranId, tahunAjaranId)
		];
		if (kelasId) conditions.push(eq(tableMartikulasiHasil.kelasId, kelasId));
		if (muridId) conditions.push(eq(tableMartikulasiHasil.muridId, muridId));
		if (jenis === 'sttm' && !draft) {
			conditions.push(eq(tableMartikulasiHasil.statusKelengkapan, 'lengkap'));
			conditions.push(isNotNull(tableMartikulasiHasil.nomorSttm));
		}

		const hasil = await db.query.tableMartikulasiHasil.findMany({
			where: and(...conditions),
			with: {
				murid: { columns: { nama: true, nis: true, nisn: true } },
				kelas: {
					columns: { nama: true, fase: true },
					with: { waliKelas: { columns: { nama: true, nip: true } } }
				},
				nilai: true
			}
		});
		const identities = new Map<number, Awaited<ReturnType<typeof getClassEducationIdentity>>>();
		for (const item of hasil) {
			if (!item.nomorSttm && item.kelas)
				identities.set(item.id, await getClassEducationIdentity(sekolahId, item.kelasId));
		}
		const students: MartikulasiStudentPrint[] = hasil
			.filter((item) => item.murid && item.kelas)
			.map((item) => ({
				nama: item.muridNamaSnapshot || item.murid!.nama,
				nis: item.nisSnapshot || item.murid!.nis,
				nisn: item.nisnSnapshot || item.murid!.nisn,
				jenjang: item.nomorSttm
					? item.jenjangSnapshot || ''
					: identities.get(item.id)!.jenjang.toUpperCase(),
				kelas: item.kelasNamaSnapshot || item.kelas!.nama,
				nomorSttm: item.nomorSttm,
				tanggalSttm: formatTanggal(item.tanggalSttm),
				levelPenempatan: item.nomorSttm
					? item.levelPenempatanSnapshot || item.levelPenempatan
					: item.levelPenempatan,
				rekomendasi: item.rekomendasi,
				catatanUmum: item.catatanUmum,
				waliKelas: item.waliKelasNamaSnapshot
					? { nama: item.waliKelasNamaSnapshot, nip: item.waliKelasNipSnapshot }
					: item.kelas!.waliKelas
						? { nama: item.kelas!.waliKelas.nama, nip: item.kelas!.waliKelas.nip }
						: null,
				schoolSnapshot: item.nomorSttm
					? {
							nama: item.sekolahNamaSnapshot || schoolPrint.nama,
							npsn: item.npsnSnapshot || schoolPrint.npsn,
							naungan: item.naunganSnapshot || schoolPrint.naungan,
							alamat: item.alamatSnapshot || schoolPrint.alamat,
							email: item.emailSnapshot || schoolPrint.email,
							backgroundLogoUrl: schoolPrint.backgroundLogoUrl,
							logoUrl: schoolPrint.logoUrl,
							logoDinasUrl: schoolPrint.logoDinasUrl,
							kepalaSekolah: {
								nama: item.kepalaSekolahNamaSnapshot || schoolPrint.kepalaSekolah.nama,
								nip: item.kepalaSekolahNipSnapshot || schoolPrint.kepalaSekolah.nip,
								status: item.kepalaSekolahStatusSnapshot || schoolPrint.kepalaSekolah.status
							}
						}
					: {
							...schoolPrint,
							nama: identities.get(item.id)!.nama,
							npsn: identities.get(item.id)!.npsn
						},
				lokasiPenetapanSnapshot: item.lokasiPenetapanSnapshot,
				nilai: item.nilai
			}))
			.sort((a, b) => a.nama.localeCompare(b.nama, 'id-ID'));
		if (!students.length) {
			throw error(
				404,
				jenis === 'sttm'
					? 'Belum ada STTM bernomor yang dapat dicetak. Gunakan preview per murid untuk melihat draf.'
					: 'Belum ada hasil Martikulasi untuk pilihan ini.'
			);
		}
		filename = pdfFilename(
			labels[jenis],
			muridId ? students[0].nama : `${students.length} Murid`,
			muridId ? students[0].kelas : 'Semua Kelas',
			tahun.nama
		);
		html =
			jenis === 'raport'
				? renderRaportMartikulasiHTML({ school: schoolPrint, settings: settingsPrint, students })
				: renderSttmMartikulasiHTML({ school: schoolPrint, settings: settingsPrint, students });
	}

	const pdf = Buffer.from(await renderPDF(html));
	return new Response(new Blob([pdf], { type: 'application/pdf' }), {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': pdfDisposition(filename),
			'Cache-Control': 'private, no-store'
		}
	});
}) satisfies RequestHandler;
