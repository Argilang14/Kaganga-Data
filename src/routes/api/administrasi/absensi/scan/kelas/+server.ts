import { error, json } from '@sveltejs/kit';
import { classMonitoringCapabilities } from '$lib/class-monitoring';
import { loadMonitor, parseMonitoringJenis, scanClassMeeting } from '$lib/server/class-monitoring';
import type { ClassScanOptions } from '$lib/attendance-scan';
import type { RequestHandler } from './$types';

async function options(locals: App.Locals): Promise<ClassScanOptions> {
	if (!classMonitoringCapabilities(locals.user).canScan || !locals.user?.pegawaiId)
		throw error(403, 'Akun harus terhubung dengan pegawai pengajar untuk scan kelas.');
	const monitor = await loadMonitor(locals);
	const pegawaiId = locals.user.pegawaiId;
	return {
		tanggal: monitor.tanggal,
		jenis: monitor.jenis,
		meetings: monitor.rows.flatMap((row) =>
			row.meetings
				.filter(
					(meeting) =>
						meeting.guruPegawaiId === pegawaiId ||
						meeting.substitutePegawaiId === pegawaiId ||
						meeting.actualGuruPegawaiId === pegawaiId
				)
				.map((meeting) => ({
					key: meeting.key,
					kelas: row.nama,
					mapel: meeting.mapelNama,
					guru: meeting.actualGuruNama ?? meeting.substituteGuruNama ?? meeting.guruNama,
					mulai: meeting.pukulMulai,
					selesai: meeting.pukulSelesai,
					canScan: meeting.canScan,
					scannedAt: meeting.scannedAt,
					journalUrl: meeting.journal.url
				}))
		)
	};
}

export const GET: RequestHandler = async ({ locals }) =>
	json(await options(locals), { headers: { 'Cache-Control': 'private, no-store' } });

export const POST: RequestHandler = async ({ locals, request }) => {
	const body = await request.json().catch(() => null);
	const jenis = parseMonitoringJenis(body?.jenis);
	if (
		!jenis ||
		typeof body?.key !== 'string' ||
		!body.key ||
		body.key.length > 300 ||
		typeof body.qr !== 'string' ||
		!body.qr ||
		body.qr.length > 300 ||
		typeof body.tanggal !== 'string'
	)
		throw error(400, 'Data scan kelas belum lengkap. Pilih pertemuan dan pindai QR kelas.');
	const context = await options(locals);
	if (context.tanggal !== body.tanggal || context.jenis !== jenis)
		throw error(409, 'Jadwal berubah. Muat ulang pertemuan sebelum scan.');
	const meeting = context.meetings.find((item) => item.key === body.key);
	if (!meeting) throw error(403, 'Pertemuan ini bukan penugasan mengajar akun Anda.');
	const saved = await scanClassMeeting(
		locals,
		{
			key: body.key,
			qr: body.qr.trim(),
			tanggal: body.tanggal,
			jenis
		},
		request
	);
	return json(
		{
			ok: true,
			code: 'success',
			message: 'Kehadiran mengajar berhasil dicatat.',
			waktuScan: saved.scannedAt,
			status: 'hadir',
			meeting: { ...meeting, guru: saved.guruNama, scannedAt: saved.scannedAt, canScan: false }
		},
		{ headers: { 'Cache-Control': 'private, no-store' } }
	);
};
