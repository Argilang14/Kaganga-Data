import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import QRCode from 'qrcode';
import db from '$lib/server/db';
import { tableKelas, tableMurid } from '$lib/server/db/schema';
import { buildKelasAccessWhere } from '$lib/server/absensi-digital';
import { getLogoSrc, optionalInteger, requireInteger } from '$lib/server/pdf/preview-utils';

type KartuAbsensiContext = {
	locals: App.Locals;
	url: URL;
};

export type KartuAbsensiPrintData = {
	sekolah: {
		nama: string;
		logoSrc: string | null;
	};
	kelas: {
		nama: string;
	};
	murid: {
		id: number;
		nama: string;
		nis: string;
	};
	qrDataUrl: string;
	issuedAt: string;
};

export async function getKartuAbsensiPreviewPayload({ locals, url }: KartuAbsensiContext) {
	const sekolah = locals.sekolah;
	const user = locals.user;
	if (!sekolah?.id) throw error(404, 'Sekolah aktif tidak ditemukan.');
	if (!user) throw error(401, 'Anda harus login terlebih dahulu.');

	const muridId = requireInteger('murid_id', url.searchParams.get('murid_id'));
	const kelasId = optionalInteger('kelas_id', url.searchParams.get('kelas_id'));

	const murid = await db.query.tableMurid.findFirst({
		columns: {
			id: true,
			nama: true,
			nis: true,
			sekolahId: true,
			kelasId: true,
			qrToken: true,
			createdAt: true,
			updatedAt: true
		},
		where: and(
			eq(tableMurid.id, muridId),
			eq(tableMurid.sekolahId, sekolah.id),
			kelasId ? eq(tableMurid.kelasId, kelasId) : undefined
		),
		with: {
			kelas: {
				columns: { id: true, nama: true, fase: true, sekolahId: true }
			}
		}
	});
	if (!murid?.kelas) throw error(404, 'Data murid tidak ditemukan.');

	if (kelasId && murid.kelasId !== kelasId) {
		throw error(400, 'Murid tidak terdaftar pada kelas yang diminta.');
	}

	const accessWhere = buildKelasAccessWhere(sekolah.id, murid.kelasId, user);
	const kelas = await db.query.tableKelas.findFirst({
		columns: { id: true, nama: true, fase: true },
		where: accessWhere
	});
	if (!kelas) throw error(403, 'Anda tidak memiliki akses ke kelas siswa ini.');

	if (!murid.qrToken) {
		throw error(404, 'QR siswa belum dibuat dari data murid.');
	}

	const token = murid.qrToken;
	const kelasNama = kelas.fase ? `${kelas.nama} - ${kelas.fase}` : kelas.nama;
	const kartuAbsensiData: KartuAbsensiPrintData = {
		sekolah: {
			nama: sekolah.nama,
			logoSrc: await getLogoSrc(sekolah.id)
		},
		kelas: {
			nama: kelasNama
		},
		murid: {
			id: murid.id,
			nama: murid.nama,
			nis: murid.nis
		},
		qrDataUrl: await QRCode.toDataURL(token, { margin: 1, width: 320 }),
		issuedAt: murid.updatedAt ?? murid.createdAt
	};

	return {
		meta: { title: `Kartu Absensi - ${murid.nama}` },
		kartuAbsensiData
	};
}
