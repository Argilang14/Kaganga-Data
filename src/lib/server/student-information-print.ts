import { error } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import db from './db';
import { tableMurid, tableKelas, tablePegawai, tableMuridProfilFoto } from './db/schema';
import { canUseStudentProfile } from '$lib/murid-profile';
import { hasMenuPermission } from '$lib/role-menu-access';
import { loadStudentProfile } from './murid-profile';
import { resolveSekolahAcademicContext } from './db/academic';
import { studentAccessCondition } from './student-access';
import { activeMuridFilter } from './murid-query';
import { studentProfilePhotoPath } from './murid-profile-storage';
import { readMuridPhotoDataUri } from './pdf/murid-photo';
import { formatTanggal, getLogoSrc } from './pdf/preview-utils';
import { getStudentEducationIdentity } from './education-units';
import {
	MAX_INFORMATION_STUDENTS,
	maskInformationIdentity,
	safeInformationImage,
	type InformationPrintContext,
	type InformationPrintOptions,
	type StudentInformationPage
} from '$lib/student-profile-print';

export async function requireInformationPrintAccess(locals: App.Locals) {
	if (!locals.user) error(401, 'Silakan masuk kembali sebelum mencetak.');
	if (
		!locals.sekolah ||
		!hasMenuPermission(locals.user, 'cetak_dokumen') ||
		!canUseStudentProfile(locals.user, locals.sekolah.id, 'print')
	)
		error(403, 'Izin Cetak Informasi Siswa belum diberikan. Hubungi admin sekolah.');
	if (locals.user.type !== 'admin') {
		const employee = await db.query.tablePegawai.findFirst({
			columns: { id: true },
			where: and(
				eq(tablePegawai.id, locals.user.pegawaiId ?? -1),
				eq(tablePegawai.sekolahId, locals.sekolah.id),
				eq(tablePegawai.status, 'aktif')
			)
		});
		if (!employee) error(403, 'Akun perlu terhubung dengan pegawai aktif. Hubungi admin sekolah.');
	}
	return { user: locals.user, school: locals.sekolah };
}

export async function loadInformationPrintContext(
	locals: App.Locals
): Promise<InformationPrintContext> {
	const { user, school } = await requireInformationPrintAccess(locals);
	const academic = await resolveSekolahAcademicContext(school.id);
	if (!academic.activeSemesterId) return { classes: [] };
	const students = await db
		.select({
			id: tableMurid.id,
			nama: tableMurid.nama,
			kelasId: tableKelas.id,
			kelasNama: tableKelas.nama
		})
		.from(tableMurid)
		.innerJoin(tableKelas, eq(tableMurid.kelasId, tableKelas.id))
		.where(
			and(
				eq(tableKelas.sekolahId, school.id),
				eq(tableKelas.semesterId, academic.activeSemesterId),
				await studentAccessCondition(user, school.id, academic.activeSemesterId, 'assigned'),
				activeMuridFilter()
			)
		)
		.orderBy(asc(tableKelas.nama), asc(tableMurid.nama), asc(tableMurid.id));
	const classes: InformationPrintContext['classes'] = [];
	for (const student of students) {
		let group = classes.find((item) => item.id === student.kelasId);
		if (!group) {
			group = { id: student.kelasId, nama: student.kelasNama, students: [] };
			classes.push(group);
		}
		group.students.push({ id: student.id, nama: student.nama });
	}
	return { classes };
}

const text = (value: string | number | null | undefined) =>
	value === null || value === undefined || value === '' ? '-' : String(value);
const yesNo = (value: boolean | null | undefined) =>
	value === null || value === undefined ? '-' : value ? 'Ya' : 'Tidak';
const housing: Record<string, string> = {
	milik_sendiri: 'Milik sendiri',
	sewa: 'Sewa',
	menumpang: 'Menumpang',
	dinas: 'Dinas',
	lainnya: 'Lainnya'
};
const certificates: Record<string, string> = {
	ada: 'Ada',
	tidak_ada: 'Tidak ada',
	tidak_diketahui: 'Tidak diketahui'
};

export async function buildStudentInformationPages(
	locals: App.Locals,
	options: InformationPrintOptions
) {
	const { school } = await requireInformationPrintAccess(locals);
	const context = await loadInformationPrintContext(locals);
	const group = context.classes.find((item) => item.id === options.kelasId);
	const selected =
		group?.students.filter((item) => options.muridId === null || item.id === options.muridId) ?? [];
	if (!selected.length)
		error(404, 'Murid tidak ditemukan pada kelas dan cakupan akses yang dipilih.');
	if (selected.length > MAX_INFORMATION_STUDENTS)
		error(
			400,
			`Maksimal ${MAX_INFORMATION_STUDENTS} murid per PDF. Pilih satu murid terlebih dahulu.`
		);
	const logo = safeInformationImage(await getLogoSrc(school.id));
	const pages: StudentInformationPage[] = [];
	for (const selectedStudent of selected) {
		const data = await loadStudentProfile(locals, selectedStudent.id, { action: 'print' });
		if (!data.student) error(404, 'Data murid tidak ditemukan. Pilih kembali murid.');
		const s = data.student,
			p = data.profile,
			h = data.health,
			a = s.alamat;
		const education = await getStudentEducationIdentity(school.id, s.id);
		const photos: Record<string, string> = {};
		if (p) {
			const metadata = await db.query.tableMuridProfilFoto.findMany({
				where: and(
					eq(tableMuridProfilFoto.profilId, p.id),
					eq(tableMuridProfilFoto.sekolahId, school.id)
				)
			});
			for (const photo of metadata) {
				const file = studentProfilePhotoPath(school.id, photo.storageKey);
				if (!file)
					error(409, 'Lokasi foto profil tidak valid. Minta admin memeriksa dokumentasi murid.');
				const bytes = await readFile(file).catch(() => null);
				if (
					!bytes ||
					bytes.length !== photo.ukuranBytes ||
					createHash('sha256').update(bytes).digest('hex') !== photo.sha256
				)
					error(409, 'Berkas foto profil hilang atau berubah. Perbarui foto sebelum mencetak.');
				photos[photo.jenis] = `data:${photo.mimeType};base64,${bytes.toString('base64')}`;
			}
		}
		const assistance =
			p?.statusBansos === 'tidak_menerima'
				? 'Tidak menerima'
				: p?.statusBansos === 'menerima'
					? p.jenisBansos
							.map((kind) =>
								kind === 'lainnya' ? p.bansosLainnya || 'Lainnya' : kind.toUpperCase()
							)
							.join(', ') || 'Menerima'
					: '-';
		pages.push({
			nama: s.nama,
			sekolah: education.nama,
			kelas: group!.nama,
			jenjang: education.jenjang.toUpperCase(),
			logo,
			photos: [
				{ label: 'Foto murid', src: safeInformationImage(readMuridPhotoDataUri(s.foto)) },
				{ label: 'Foto murid tambahan', src: photos.murid_tambahan ?? null },
				{ label: 'Foto rumah', src: photos.rumah ?? null },
				{ label: 'Foto orang tua/wali', src: photos.orang_tua ?? null }
			],
			murid: [
				['NIK murid', maskInformationIdentity(s.nik, options.maskIdentity)],
				['Nomor kartu keluarga', maskInformationIdentity(p?.nomorKk, options.maskIdentity)],
				['NIS / NISN', [s.nis, s.nisn].filter(Boolean).join(' / ') || '-'],
				[
					'Tempat, tanggal lahir',
					[s.tempatLahir, formatTanggal(s.tanggalLahir)].filter(Boolean).join(', ') || '-'
				],
				[
					'Jenis kelamin',
					s.jenisKelamin === 'P' ? 'Perempuan' : s.jenisKelamin === 'L' ? 'Laki-laki' : '-'
				],
				['Agama', text(s.agama)],
				['Asal sekolah', text(s.pendidikanSebelumnya)],
				['Kondisi fisik', text(h?.kondisiFisik)],
				['Desil DTSEN', text(p?.desilDtsen)],
				['Bantuan sosial', assistance]
			],
			orangTua: [
				['Nama ayah', text(s.ayah?.nama)],
				['Pekerjaan ayah', text(s.ayah?.pekerjaan)],
				['Nama ibu', text(s.ibu?.nama)],
				['Pekerjaan ibu', text(s.ibu?.pekerjaan)],
				['Nama wali', text(s.wali?.nama)],
				['Penghasilan per bulan', text(p?.penghasilanKeluarga)],
				[
					'Jumlah tanggungan',
					p?.jumlahTanggungan === null || p?.jumlahTanggungan === undefined
						? '-'
						: `${p.jumlahTanggungan} orang`
				]
			],
			alamat: [
				['Alamat', text(a?.jalan)],
				['RT / RW', [p?.rt || '-', p?.rw || '-'].join(' / ')],
				['Kelurahan/desa', text(a?.desa)],
				['Kecamatan', text(a?.kecamatan)],
				['Kabupaten/kota', text(a?.kabupaten)],
				['Provinsi', text(a?.provinsi)]
			],
			asrama: [
				['Bersedia tinggal di asrama', yesNo(p?.bersediaAsrama)],
				['Surat pernyataan ditandatangani', yesNo(p?.suratPernyataanDitandatangani)],
				['Tanggal pernyataan', formatTanggal(p?.tanggalSuratPernyataan) || '-']
			],
			perlengkapan: [
				['Seragam baju', text(h?.ukuranBaju)],
				['Seragam celana', text(h?.ukuranCelana)],
				['Sepatu sekolah', text(h?.ukuranSepatu)]
			],
			petugas: [
				['Nama petugas', text(p?.petugasPendataanNama)],
				['Tanggal pendataan', formatTanggal(p?.tanggalPendataan) || '-']
			],
			hunian: [
				['Status hunian', housing[p?.statusHunian ?? ''] || '-'],
				[
					'Luas tempat tinggal',
					p?.luasTempatTinggal === null || p?.luasTempatTinggal === undefined
						? '-'
						: `${p.luasTempatTinggal} m2`
				],
				[
					'Sertifikat rumah',
					[certificates[p?.statusSertifikat ?? ''], p?.pemilikRumah].filter(Boolean).join(' / ') ||
						'-'
				]
			],
			catatan: p?.catatanPetugas ?? '',
			maskIdentity: options.maskIdentity
		});
	}
	return pages;
}
