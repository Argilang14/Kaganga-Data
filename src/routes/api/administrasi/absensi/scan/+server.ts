import {
	canAccessAbsensiDigital,
	assertAbsensiDigitalAccess,
	getLateAwareStatus,
	hashQrToken,
	parseAbsensiStatus,
	todayLocalDate
} from '$lib/server/absensi-digital';
import {
	assertAbsensiKegiatanAccess,
	canEditAbsensiKegiatan,
	getLateAwareKegiatanStatus,
	parseAbsensiKegiatanStatus
} from '$lib/server/absensi-kegiatan';
import db from '$lib/server/db';
import { ensureAbsensiDigitalSchema } from '$lib/server/db/ensure-absensi-digital';
import {
	tableAbsensiHarian,
	tableAbsensiKegiatan,
	tableKegiatanAbsensi,
	tableMurid,
	tableQrMurid
} from '$lib/server/db/schema';
import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';

function muridPayload(murid: {
	id: number;
	nama: string;
	waliAsuhNama?: string | null;
	kelas?: { nama: string | null; fase: string | null } | null;
}) {
	return {
		id: murid.id,
		nama: murid.nama,
		kelas: murid.kelas?.fase
			? `${murid.kelas.nama ?? '-'} - ${murid.kelas.fase}`
			: (murid.kelas?.nama ?? '-'),
		waliAsuh: murid.waliAsuhNama ?? null,
		fotoUrl: `/api/murid-photo/${murid.id}`
	};
}

export async function POST({ request, locals }) {
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId || !locals.user) {
		return json(
			{ ok: false, code: 'unauthorized', message: 'Sesi sekolah tidak valid.' },
			{ status: 401 }
		);
	}
	await ensureAbsensiDigitalSchema();

	const body = (await request.json().catch(() => null)) as {
		token?: string;
		mode?: 'sekolah' | 'kegiatan';
		kegiatanId?: number | string | null;
		status?: string | null;
	} | null;
	const token = body?.token?.trim();
	if (!token) {
		return json(
			{ ok: false, code: 'invalid_token', message: 'Token QR tidak valid.' },
			{ status: 400 }
		);
	}
	const mode = body?.mode === 'kegiatan' ? 'kegiatan' : 'sekolah';
	if (mode === 'kegiatan') assertAbsensiKegiatanAccess(locals.user);
	else assertAbsensiDigitalAccess(locals.user);

	const tokenHash = hashQrToken(token);
	const qr = await db.query.tableQrMurid.findFirst({
		where: eq(tableQrMurid.tokenHash, tokenHash),
		with: {
			murid: {
				columns: {
					id: true,
					nama: true,
					waliAsuhNama: true,
					sekolahId: true,
					semesterId: true,
					kelasId: true
				},
				with: { kelas: { columns: { id: true, nama: true, fase: true } } }
			}
		}
	});

	if (!qr) {
		return json(
			{ ok: false, code: 'invalid_token', message: 'Token QR tidak valid.' },
			{ status: 404 }
		);
	}
	if (qr.revokedAt) {
		return json(
			{ ok: false, code: 'revoked_token', message: 'Token QR sudah dicabut.' },
			{ status: 410 }
		);
	}
	if (!qr.murid) {
		return json(
			{ ok: false, code: 'student_not_found', message: 'Data siswa tidak ditemukan.' },
			{ status: 404 }
		);
	}
	if (qr.murid.sekolahId !== sekolahId) {
		return json(
			{ ok: false, code: 'student_not_found', message: 'Siswa tidak ditemukan di sekolah aktif.' },
			{ status: 404 }
		);
	}

	if (mode === 'kegiatan') {
		const kegiatanId =
			typeof body?.kegiatanId === 'number'
				? body.kegiatanId
				: Number.parseInt(body?.kegiatanId?.toString() ?? '', 10);
		if (!Number.isInteger(kegiatanId) || kegiatanId <= 0) {
			return json(
				{ ok: false, code: 'invalid_activity', message: 'Kegiatan belum dipilih.' },
				{ status: 400 }
			);
		}

		const kegiatan = await db.query.tableKegiatanAbsensi.findFirst({
			where: and(
				eq(tableKegiatanAbsensi.id, kegiatanId),
				eq(tableKegiatanAbsensi.sekolahId, sekolahId),
				eq(tableKegiatanAbsensi.aktif, true)
			)
		});
		if (!kegiatan) {
			return json(
				{ ok: false, code: 'invalid_activity', message: 'Kegiatan tidak ditemukan.' },
				{ status: 404 }
			);
		}
		if (!canEditAbsensiKegiatan(locals.user, kegiatan.aksesEdit)) {
			return json(
				{
					ok: false,
					code: 'forbidden_activity',
					message: 'Anda tidak memiliki akses kegiatan ini.'
				},
				{ status: 403 }
			);
		}

		const tanggal = todayLocalDate();
		const existing = await db.query.tableAbsensiKegiatan.findFirst({
			columns: { id: true, status: true, waktuScan: true },
			where: and(
				eq(tableAbsensiKegiatan.sekolahId, sekolahId),
				eq(tableAbsensiKegiatan.semesterId, qr.murid.semesterId),
				eq(tableAbsensiKegiatan.kelasId, qr.murid.kelasId),
				eq(tableAbsensiKegiatan.kegiatanId, kegiatan.id),
				eq(tableAbsensiKegiatan.muridId, qr.murid.id),
				eq(tableAbsensiKegiatan.tanggal, tanggal)
			)
		});

		if (existing) {
			return json({
				ok: true,
				code: 'already_present',
				message: `Siswa sudah absen ${kegiatan.nama} hari ini.`,
				status: existing.status,
				waktuScan: existing.waktuScan,
				kegiatan: { id: kegiatan.id, nama: kegiatan.nama },
				murid: muridPayload(qr.murid)
			});
		}

		const murid = await db.query.tableMurid.findFirst({
			columns: { id: true },
			where: and(
				eq(tableMurid.id, qr.murid.id),
				eq(tableMurid.sekolahId, sekolahId),
				eq(tableMurid.semesterId, qr.murid.semesterId),
				eq(tableMurid.kelasId, qr.murid.kelasId)
			)
		});
		if (!murid) {
			return json(
				{ ok: false, code: 'student_not_found', message: 'Data siswa tidak ditemukan.' },
				{ status: 404 }
			);
		}

		const nowDate = new Date();
		const now = nowDate.toISOString();
		const requestedStatus = parseAbsensiKegiatanStatus(body?.status);
		const status =
			requestedStatus && requestedStatus !== 'terlambat'
				? requestedStatus
				: requestedStatus === 'terlambat'
					? 'terlambat'
					: getLateAwareKegiatanStatus(kegiatan, nowDate);

		await db.insert(tableAbsensiKegiatan).values({
			sekolahId,
			semesterId: qr.murid.semesterId,
			kelasId: qr.murid.kelasId,
			muridId: qr.murid.id,
			kegiatanId: kegiatan.id,
			tanggal,
			status,
			waktuScan: now,
			metode: 'qr',
			petugasUserId: locals.user.id,
			createdAt: now,
			updatedAt: now
		});

		return json({
			ok: true,
			code: 'success',
			message: `Absensi ${kegiatan.nama} berhasil dicatat sebagai ${status}.`,
			status,
			waktuScan: now,
			kegiatan: { id: kegiatan.id, nama: kegiatan.nama },
			murid: muridPayload(qr.murid)
		});
	}

	if (!canAccessAbsensiDigital(locals.user)) {
		return json(
			{ ok: false, code: 'forbidden', message: 'Anda tidak memiliki akses absensi sekolah.' },
			{ status: 403 }
		);
	}

	const tanggal = todayLocalDate();
	const existing = await db.query.tableAbsensiHarian.findFirst({
		columns: { id: true, status: true, waktuScan: true },
		where: and(
			eq(tableAbsensiHarian.sekolahId, sekolahId),
			eq(tableAbsensiHarian.semesterId, qr.murid.semesterId),
			eq(tableAbsensiHarian.kelasId, qr.murid.kelasId),
			eq(tableAbsensiHarian.muridId, qr.murid.id),
			eq(tableAbsensiHarian.tanggal, tanggal)
		)
	});

	if (existing) {
		return json({
			ok: true,
			code: 'already_present',
			message: 'Siswa sudah absen hari ini.',
			status: existing.status,
			waktuScan: existing.waktuScan,
			murid: muridPayload(qr.murid)
		});
	}

	const nowDate = new Date();
	const now = nowDate.toISOString();
	const status = parseAbsensiStatus(body?.status ?? null) ?? getLateAwareStatus(nowDate);

	const murid = await db.query.tableMurid.findFirst({
		columns: { id: true },
		where: and(
			eq(tableMurid.id, qr.murid.id),
			eq(tableMurid.sekolahId, sekolahId),
			eq(tableMurid.semesterId, qr.murid.semesterId),
			eq(tableMurid.kelasId, qr.murid.kelasId)
		)
	});
	if (!murid) {
		return json(
			{ ok: false, code: 'student_not_found', message: 'Data siswa tidak ditemukan.' },
			{ status: 404 }
		);
	}

	await db.insert(tableAbsensiHarian).values({
		sekolahId,
		semesterId: qr.murid.semesterId,
		kelasId: qr.murid.kelasId,
		muridId: qr.murid.id,
		tanggal,
		status,
		waktuScan: now,
		metode: 'qr',
		petugasUserId: locals.user.id,
		createdAt: now,
		updatedAt: now
	});

	return json({
		ok: true,
		code: 'success',
		message:
			status === 'terlambat'
				? 'Absensi berhasil dicatat sebagai terlambat.'
				: 'Absensi berhasil dicatat.',
		status,
		waktuScan: now,
		murid: muridPayload(qr.murid)
	});
}
