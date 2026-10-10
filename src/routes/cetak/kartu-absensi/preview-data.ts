import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import QRCode from 'qrcode';
import db from '$lib/server/db';
import { getStudentEducationIdentity } from '$lib/server/education-units';
import { studentAccessCondition } from '$lib/server/student-access';
import { canAttendance } from '$lib/attendance-access';
import { tableKelas, tableMurid, tableSekolah } from '$lib/server/db/schema';
import { buildKelasAccessWhere, loadActivePrintableQr } from '$lib/server/absensi-digital';
import {
	formatTanggal,
	getLogoSrc,
	optionalInteger,
	requireInteger
} from '$lib/server/pdf/preview-utils';
import { readMuridPhotoDataUri } from '$lib/server/pdf/murid-photo';

type KartuAbsensiContext = {
	locals: App.Locals;
	url: URL;
};

export type KartuAbsensiPrintData = {
	layout: KartuAbsensiLayout;
	sekolah: {
		nama: string;
		logoSrc: string | null;
		naungan: string;
		alamat: string;
	};
	kelas: {
		nama: string;
	};
	murid: {
		id: number;
		nama: string;
		nis: string;
		nisn: string;
		tempatTanggalLahir: string;
		alamat: string;
		fotoSrc: string | null;
	};
	qrDataUrl: string;
	issuedAt: string;
};

export type KartuAbsensiLayout = 'duplex' | 'photo-qr' | 'qr-only';

function kartuLayout(value: string | null): KartuAbsensiLayout {
	return value === 'photo-qr' || value === 'qr-only' ? value : 'duplex';
}

function joinAddress(
	alamat:
		| {
				jalan?: string | null;
				desa?: string | null;
				kecamatan?: string | null;
				kabupaten?: string | null;
				provinsi?: string | null;
		  }
		| null
		| undefined
) {
	return [alamat?.jalan, alamat?.desa, alamat?.kecamatan, alamat?.kabupaten, alamat?.provinsi]
		.map((part) => part?.trim())
		.filter(Boolean)
		.join(', ');
}

function naunganLabel(naungan: string | null | undefined) {
	if (naungan === 'kemsos') return 'KEMENTERIAN SOSIAL REPUBLIK INDONESIA';
	if (naungan === 'kemenag') return 'KEMENTERIAN AGAMA REPUBLIK INDONESIA';
	return 'KEMENTERIAN PENDIDIKAN DASAR DAN MENENGAH';
}

export async function getKartuAbsensiPreviewPayload({ locals, url }: KartuAbsensiContext) {
	const sekolah = locals.sekolah;
	const user = locals.user;
	if (!sekolah?.id) throw error(404, 'Sekolah aktif tidak ditemukan.');
	if (!user) throw error(401, 'Anda harus login terlebih dahulu.');
	if (!canAttendance(user, 'lihat')) throw error(403, 'Izin kartu absensi belum diberikan.');

	const muridId = requireInteger('murid_id', url.searchParams.get('murid_id'));
	const kelasId = optionalInteger('kelas_id', url.searchParams.get('kelas_id'));

	const murid = await db.query.tableMurid.findFirst({
		columns: {
			id: true,
			nama: true,
			nis: true,
			nisn: true,
			tempatLahir: true,
			tanggalLahir: true,
			foto: true,
			sekolahId: true,
			kelasId: true
		},
		where: and(
			eq(tableMurid.id, muridId),
			eq(tableMurid.sekolahId, sekolah.id),
			kelasId ? eq(tableMurid.kelasId, kelasId) : undefined,
			await studentAccessCondition(user, sekolah.id)
		),
		with: {
			alamat: true,
			kelas: {
				columns: { id: true, nama: true, fase: true, sekolahId: true }
			}
		}
	});
	if (!murid?.kelas) throw error(404, 'Data murid tidak ditemukan.');

	if (kelasId && murid.kelasId !== kelasId) {
		throw error(400, 'Murid tidak terdaftar pada kelas yang diminta.');
	}

	const accessWhere = await buildKelasAccessWhere(sekolah.id, murid.kelasId, user);
	const kelas = await db.query.tableKelas.findFirst({
		columns: { id: true, nama: true, fase: true },
		where: accessWhere
	});
	if (!kelas) throw error(403, 'Anda tidak memiliki akses ke kelas siswa ini.');

	const school = await db.query.tableSekolah.findFirst({
		columns: { nama: true, naungan: true },
		where: eq(tableSekolah.id, sekolah.id),
		with: { alamat: true }
	});
	if (!school) throw error(404, 'Data sekolah tidak ditemukan.');

	const activeQr = await loadActivePrintableQr(murid.id);
	if (activeQr.status === 'missing') {
		throw error(404, 'QR aktif siswa belum dibuat dari menu Absensi - Kartu Absensi.');
	}
	if (activeQr.status === 'not_printable') {
		throw error(
			409,
			'QR aktif lama tidak dapat dicetak ulang. Perbarui QR siswa dari menu Absensi - Kartu Absensi.'
		);
	}

	const kelasNama = kelas.fase ? `${kelas.nama} - ${kelas.fase}` : kelas.nama;
	const kartuAbsensiData: KartuAbsensiPrintData = {
		layout: kartuLayout(url.searchParams.get('kartu_layout')),
		sekolah: {
			nama: (await getStudentEducationIdentity(sekolah.id, murid.id)).nama,
			logoSrc: await getLogoSrc(sekolah.id),
			naungan: naunganLabel(school.naungan),
			alamat: joinAddress(school.alamat)
		},
		kelas: {
			nama: kelasNama
		},
		murid: {
			id: murid.id,
			nama: murid.nama,
			nis: murid.nis,
			nisn: murid.nisn,
			tempatTanggalLahir: [murid.tempatLahir, formatTanggal(murid.tanggalLahir)]
				.filter(Boolean)
				.join(', '),
			alamat: joinAddress(murid.alamat),
			fotoSrc: readMuridPhotoDataUri(murid.foto)
		},
		qrDataUrl: await QRCode.toDataURL(activeQr.token, { margin: 1, width: 480 }),
		issuedAt: activeQr.qr.issuedAt
	};

	return {
		meta: { title: `Kartu Pelajar dan Absensi - ${murid.nama}` },
		kartuAbsensiData
	};
}
