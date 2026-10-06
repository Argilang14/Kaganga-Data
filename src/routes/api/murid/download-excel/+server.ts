import db from '$lib/server/db';
import { tableMurid, tableMuridIdentityLink, tableMuridLifecycle } from '$lib/server/db/schema';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import { writeAoaToBuffer } from '$lib/utils/excel.js';
import { and, asc, eq, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { activeMuridFilter, archivedMuridFilter } from '$lib/server/murid-query';
import { getKelasContextForUser } from '$lib/server/route-utils';
import { hasSchoolWideOperationalAccess } from '$lib/access-position';

export async function GET({ locals, url }) {
	if (!locals.user) throw error(401, 'Silakan login.');
	const status = url.searchParams.get('status') ?? 'aktif';
	if (!['aktif', 'arsip', 'semua'].includes(status))
		throw error(400, 'Pilihan status tidak valid.');
	if (
		status !== 'aktif' &&
		locals.user.type !== 'admin' &&
		!locals.user.permissions?.includes('murid_arsip')
	)
		throw error(403, 'Tidak memiliki izin arsip murid.');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) {
		throw error(401, 'Sekolah tidak ditemukan');
	}

	const academicContext = await resolveSekolahAcademicContext(sekolahId);
	const activeSemesterId = academicContext.activeSemesterId;
	if (!activeSemesterId) {
		throw error(400, 'Belum ada semester aktif. Atur semester aktif di menu Rapor.');
	}

	const candidates = await db.query.tableMurid.findMany({
		where: and(
			eq(tableMurid.sekolahId, sekolahId),
			eq(tableMurid.semesterId, activeSemesterId),
			status === 'aktif'
				? activeMuridFilter()
				: status === 'arsip'
					? archivedMuridFilter()
					: undefined
		),
		orderBy: [asc(tableMurid.kelasId), asc(tableMurid.nama)],
		with: {
			kelas: { columns: { nama: true } },
			alamat: {
				columns: { jalan: true, desa: true, kecamatan: true, kabupaten: true, kodePos: true }
			},
			ayah: { columns: { nama: true, pekerjaan: true, kontak: true } },
			ibu: { columns: { nama: true, pekerjaan: true, kontak: true } },
			wali: { columns: { nama: true, pekerjaan: true, kontak: true } }
		}
	});
	const daftarMurid: typeof candidates = [];
	for (const row of candidates) {
		if (
			hasSchoolWideOperationalAccess(locals.user) ||
			(await getKelasContextForUser(locals, url, String(row.id))).hasAccess
		)
			daftarMurid.push(row);
	}
	const lifecycleRows = await db
		.select({
			id: tableMuridIdentityLink.muridId,
			status: tableMuridLifecycle.status,
			review: tableMuridLifecycle.needsIdentityReview
		})
		.from(tableMuridIdentityLink)
		.innerJoin(
			tableMuridLifecycle,
			and(
				eq(tableMuridIdentityLink.sekolahId, tableMuridLifecycle.sekolahId),
				eq(tableMuridLifecycle.identityKey, sql`'uid:' || ${tableMuridIdentityLink.identityUid}`)
			)
		)
		.where(
			and(
				eq(tableMuridIdentityLink.sekolahId, sekolahId),
				eq(tableMuridIdentityLink.semesterId, activeSemesterId)
			)
		);
	const lifecycleById = new Map(
		lifecycleRows.map((row) => [row.id, row.review ? 'Perlu Periksa Identitas' : row.status])
	);

	const headers = [
		'Nama',
		'NIPD',
		'Rombel',
		'NISN',
		'Tempat Lahir',
		'Tanggal Lahir',
		'JK',
		'Agama',
		'Alamat',
		'Kelurahan',
		'Kecamatan',
		'Kabupaten',
		'Kode Pos',
		'Pendidikan Sebelumnya',
		'Telepon',
		'HP',
		'Email',
		'Kontak Orang Tua',
		'Nama Ayah',
		'Pekerjaan Ayah',
		'Kontak Ayah',
		'Nama Ibu',
		'Pekerjaan Ibu',
		'Kontak Ibu',
		'Nama Wali',
		'Pekerjaan Wali',
		'Kontak Wali',
		'Status Murid'
	];

	const rows: unknown[][] = [headers];

	for (const murid of daftarMurid) {
		const alamat = murid.alamat;
		const ayah = murid.ayah;
		const ibu = murid.ibu;
		const wali = murid.wali;

		rows.push([
			murid.nama,
			murid.nis,
			murid.kelas?.nama ?? '',
			murid.nisn,
			murid.tempatLahir,
			murid.tanggalLahir,
			murid.jenisKelamin,
			murid.agama,
			alamat?.jalan ?? '',
			alamat?.desa ?? '',
			alamat?.kecamatan ?? '',
			alamat?.kabupaten ?? '',
			alamat?.kodePos ?? '',
			murid.pendidikanSebelumnya,
			'',
			'',
			'',
			'',
			ayah?.nama ?? '',
			ayah?.pekerjaan ?? '',
			ayah?.kontak ?? '',
			ibu?.nama ?? '',
			ibu?.pekerjaan ?? '',
			ibu?.kontak ?? '',
			wali?.nama ?? '',
			wali?.pekerjaan ?? '',
			wali?.kontak ?? '',
			lifecycleById.get(murid.id) ?? 'aktif'
		]);
	}

	const buffer = await writeAoaToBuffer(rows);

	return new Response(new Uint8Array(buffer), {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="Data Murid-${status}.xlsx"`
		}
	});
}
