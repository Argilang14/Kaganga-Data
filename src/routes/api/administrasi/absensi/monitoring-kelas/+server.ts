import {
	getClassQrCards,
	loadMonitor,
	manageClassAbsence,
	parseMonitoringJenis,
	resetClassQr,
	scanClassMeeting
} from '$lib/server/class-monitoring';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

function text(value: unknown, max = 500) {
	return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function positiveInt(value: unknown) {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export const GET: RequestHandler = async ({ locals, url }) =>
	json(await loadMonitor(locals, url.searchParams), {
		headers: { 'Cache-Control': 'private, no-store' }
	});

export const POST: RequestHandler = async ({ locals, request }) => {
	let body: Record<string, unknown>;
	try {
		const parsed = await request.json();
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
		body = parsed as Record<string, unknown>;
	} catch {
		throw error(400, 'JSON permintaan tidak valid.');
	}
	const action = body.action;
	if (action === 'scan') {
		const jenis = parseMonitoringJenis(body.jenis);
		const key = text(body.key, 300);
		const qr = text(body.qr, 300);
		const tanggal = text(body.tanggal, 10);
		if (!jenis || !key || !qr || !tanggal) throw error(400, 'Data scan belum lengkap.');
		return json(await scanClassMeeting(locals, { key, qr, tanggal, jenis }, request));
	}
	if (action === 'absence') {
		const jenis = parseMonitoringJenis(body.jenis);
		const key = text(body.key, 300);
		const tanggal = text(body.tanggal, 10);
		const reason = body.reason === 'sakit' || body.reason === 'izin' ? body.reason : null;
		if (!jenis || !key || !tanggal || !reason)
			throw error(400, 'Data ketidakhadiran belum lengkap.');
		return json(
			await manageClassAbsence(
				locals,
				{
					key,
					tanggal,
					jenis,
					reason,
					substitutePegawaiId: positiveInt(body.substitutePegawaiId) ?? undefined,
					note: text(body.note) || undefined
				},
				request
			)
		);
	}
	if (action === 'qr') {
		if (!Array.isArray(body.kelasIds) || body.kelasIds.length < 1 || body.kelasIds.length > 500)
			throw error(400, 'Daftar kelas QR tidak valid.');
		const kelasIds = [...new Set(body.kelasIds.map(positiveInt))];
		if (kelasIds.some((id) => !id)) throw error(400, 'ID kelas QR tidak valid.');
		return json(await getClassQrCards(locals, kelasIds as number[], request));
	}
	if (action === 'resetQr') {
		const kelasId = positiveInt(body.kelasId);
		if (!kelasId) throw error(400, 'Kelas wajib dipilih untuk membuat ulang QR.');
		return json(await resetClassQr(locals, kelasId, request));
	}
	throw error(400, 'Aksi monitoring tidak dikenal.');
};
