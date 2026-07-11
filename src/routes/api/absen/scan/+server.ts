import db from '$lib/server/db';
import { tableAbsensi, tableMurid } from '$lib/server/db/schema';
import { json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';

type ScanPayload = {
	token?: unknown;
	mode?: unknown;
};

function parseToken(raw: unknown) {
	if (typeof raw !== 'string') return '';
	const value = raw.trim();
	if (!value) return '';
	try {
		const parsed = JSON.parse(value) as { type?: unknown; token?: unknown };
		if (parsed.type === 'rapkumer-absensi' && typeof parsed.token === 'string') {
			return parsed.token.trim();
		}
	} catch {
		// raw token fallback
	}
	return value;
}

function dayRange(date = new Date()) {
	const start = new Date(date);
	start.setHours(0, 0, 0, 0);
	const end = new Date(date);
	end.setHours(23, 59, 59, 999);
	return { start: start.toISOString(), end: end.toISOString() };
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ ok: false, message: 'Login diperlukan' }, { status: 401 });
	}
	const sekolahId = locals.sekolah?.id ?? null;
	if (!sekolahId) {
		return json({ ok: false, message: 'Sekolah aktif tidak ditemukan' }, { status: 400 });
	}

	let body: ScanPayload;
	try {
		body = (await request.json()) as ScanPayload;
	} catch {
		return json({ ok: false, message: 'Payload scan tidak valid' }, { status: 400 });
	}

	const token = parseToken(body.token);
	const mode = body.mode === 'pulang' ? 'pulang' : 'masuk';
	if (!token) {
		return json({ ok: false, message: 'Token QR kosong' }, { status: 400 });
	}

	const murid = await db.query.tableMurid.findFirst({
		columns: { id: true, nama: true, qrToken: true },
		with: { kelas: { columns: { nama: true, fase: true } } },
		where: and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.qrToken, token))
	});
	if (!murid) {
		return json(
			{ ok: false, message: 'QR murid tidak dikenali untuk sekolah aktif' },
			{ status: 404 }
		);
	}

	const { start, end } = dayRange();
	const existing = await db.query.tableAbsensi.findFirst({
		columns: { id: true, waktu: true },
		where: and(
			eq(tableAbsensi.muridId, murid.id),
			eq(tableAbsensi.mode, mode),
			sql`${tableAbsensi.waktu} >= ${start}`,
			sql`${tableAbsensi.waktu} <= ${end}`
		)
	});

	if (existing) {
		return json({
			ok: true,
			duplicate: true,
			message: `${murid.nama} sudah presensi ${mode} hari ini`,
			murid: { id: murid.id, nama: murid.nama, kelas: murid.kelas },
			waktu: existing.waktu
		});
	}

	const now = new Date().toISOString();
	await db.insert(tableAbsensi).values({ muridId: murid.id, waktu: now, mode, metode: 'qr' });

	return json({
		ok: true,
		duplicate: false,
		message: `Presensi ${mode} tersimpan untuk ${murid.nama}`,
		murid: { id: murid.id, nama: murid.nama, kelas: murid.kelas },
		waktu: now
	});
};
