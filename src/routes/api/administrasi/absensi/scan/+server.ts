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
import { canAttendance, canAttendActivity, attendanceDateAllowed } from '$lib/attendance-access';
import { assertStudentAccess } from '$lib/server/student-access';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import { saveAttendance } from '$lib/server/attendance-mutation';
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

const MAX_OFFLINE_SCAN_AGE_MS = 12 * 60 * 60 * 1000;

function resolveCapturedAt(value: string | null | undefined) {
	const current = new Date();
	if (!value) return { date: current } as const;
	const captured = new Date(value);
	const age = current.getTime() - captured.getTime();
	if (!Number.isFinite(captured.getTime()) || age < -5 * 60 * 1000) {
		return { error: 'Waktu scan offline tidak valid.' } as const;
	}
	if (age > MAX_OFFLINE_SCAN_AGE_MS) {
		return { error: 'Scan offline sudah lebih dari 12 jam dan tidak dapat disinkronkan.' } as const;
	}
	return { date: captured } as const;
}

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
	if (!canAttendance(locals.user, 'scan'))
		return json({ ok: false, message: 'Izin scan belum diberikan.' }, { status: 403 });

	const body = (await request.json().catch(() => null)) as {
		token?: string;
		mode?: 'sekolah' | 'kegiatan';
		kegiatanId?: number | string | null;
		status?: string | null;
		capturedAt?: string | null;
	} | null;
	const token = body?.token?.trim();
	if (!token) {
		return json(
			{ ok: false, code: 'invalid_token', message: 'Token QR tidak valid.' },
			{ status: 400 }
		);
	}
	const mode = body?.mode === 'kegiatan' ? 'kegiatan' : 'sekolah';
	const kegiatanId = Number(body?.kegiatanId);
	if (mode === 'kegiatan' && (!Number.isSafeInteger(kegiatanId) || kegiatanId <= 0)) {
		return json(
			{
				ok: false,
				code: 'invalid_activity',
				message: 'Pilih kegiatan terlebih dahulu sebelum scan.'
			},
			{ status: 400 }
		);
	}
	const captured = resolveCapturedAt(body?.capturedAt);
	if ('error' in captured) {
		return json(
			{ ok: false, code: 'expired_offline_scan', message: captured.error },
			{ status: 400 }
		);
	}
	const scanDate = captured.date;
	if (!attendanceDateAllowed(locals.user, todayLocalDate(scanDate), todayLocalDate()))
		return json(
			{ ok: false, message: 'Tanggal scan memerlukan izin koreksi tanggal lama.' },
			{ status: 403 }
		);
	if (mode === 'sekolah' && !canAttendActivity(locals.user, 'sekolah'))
		return json(
			{ ok: false, message: 'Scan sekolah di luar tanggung jawab akun.' },
			{ status: 403 }
		);
	if (body?.status && !['hadir', 'terlambat'].includes(body.status))
		return json(
			{
				ok: false,
				message:
					'Scan QR hanya mencatat hadir atau terlambat. Gunakan input manual untuk status lain.'
			},
			{ status: 400 }
		);
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
	const academic = await resolveSekolahAcademicContext(sekolahId);
	if (
		!(await assertStudentAccess(locals.user, sekolahId, qr.murid.id, true)) ||
		academic.activeSemesterId !== qr.murid.semesterId
	) {
		return json(
			{
				ok: false,
				code: 'forbidden_student',
				message: 'Murid di luar penugasan akun atau tidak aktif.'
			},
			{ status: 403 }
		);
	}
	if (qr.revokedAt) {
		return json(
			{
				ok: false,
				code: 'revoked_token',
				message: 'Token QR sudah dicabut.',
				murid: muridPayload(qr.murid)
			},
			{ status: 410 }
		);
	}
	if (mode === 'kegiatan') {
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
		if (
			!canEditAbsensiKegiatan(locals.user, kegiatan.aksesEdit, kegiatan.kategori, {
				kode: kegiatan.kode,
				tanggal: todayLocalDate(scanDate)
			})
		) {
			return json(
				{
					ok: false,
					code: 'forbidden_activity',
					message: 'Anda tidak memiliki akses kegiatan ini.'
				},
				{ status: 403 }
			);
		}

		const tanggal = todayLocalDate(scanDate);
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
				eq(tableMurid.kelasId, qr.murid.kelasId),
				activeMuridFilter()
			)
		});
		if (!murid) {
			return json(
				{ ok: false, code: 'student_not_found', message: 'Data siswa tidak ditemukan.' },
				{ status: 404 }
			);
		}

		const nowDate = scanDate;
		const now = nowDate.toISOString();
		const requestedStatus = parseAbsensiKegiatanStatus(body?.status);
		const status =
			requestedStatus && requestedStatus !== 'terlambat'
				? requestedStatus
				: requestedStatus === 'terlambat'
					? 'terlambat'
					: getLateAwareKegiatanStatus(kegiatan, nowDate);

		const saved = await saveAttendance({
			locals,
			request,
			semesterId: qr.murid.semesterId,
			kelasId: qr.murid.kelasId,
			muridIds: [qr.murid.id],
			kegiatanId: kegiatan.id,
			tanggal,
			status,
			metode: 'qr',
			waktuScan: now
		});

		return json({
			ok: true,
			code: saved.skipped ? 'already_present' : 'success',
			message: `Absensi ${kegiatan.nama} berhasil dicatat sebagai ${status}.`,
			status: saved.records[0]?.status ?? status,
			waktuScan: saved.records[0]?.waktuScan ?? now,
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

	const tanggal = todayLocalDate(scanDate);
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

	const nowDate = scanDate;
	const now = nowDate.toISOString();
	const status = parseAbsensiStatus(body?.status ?? null) ?? getLateAwareStatus(nowDate);

	const murid = await db.query.tableMurid.findFirst({
		columns: { id: true },
		where: and(
			eq(tableMurid.id, qr.murid.id),
			eq(tableMurid.sekolahId, sekolahId),
			eq(tableMurid.semesterId, qr.murid.semesterId),
			eq(tableMurid.kelasId, qr.murid.kelasId),
			activeMuridFilter()
		)
	});
	if (!murid) {
		return json(
			{ ok: false, code: 'student_not_found', message: 'Data siswa tidak ditemukan.' },
			{ status: 404 }
		);
	}

	const saved = await saveAttendance({
		locals,
		request,
		semesterId: qr.murid.semesterId,
		kelasId: qr.murid.kelasId,
		muridIds: [qr.murid.id],
		tanggal,
		status,
		metode: 'qr',
		waktuScan: now
	});

	return json({
		ok: true,
		code: saved.skipped ? 'already_present' : 'success',
		message:
			status === 'terlambat'
				? 'Absensi berhasil dicatat sebagai terlambat.'
				: 'Absensi berhasil dicatat.',
		status: saved.records[0]?.status ?? status,
		waktuScan: saved.records[0]?.waktuScan ?? now,
		murid: muridPayload(qr.murid)
	});
}
import { activeMuridFilter } from '$lib/server/murid-query';
