import { error, isHttpError, json } from '@sveltejs/kit';
import { parseCompletionEntries } from '$lib/attendance-completion';
import { loadAttendanceSummary, loadSummaryOptions } from '$lib/server/attendance-summary';
import { saveAttendance } from '$lib/server/attendance-mutation';
import db from '$lib/server/db';
import { tableAbsensiKegiatan, tableAuthUser, tableMurid } from '$lib/server/db/schema';
import { studentAccessCondition } from '$lib/server/attendance-student-access';
import { and, eq, inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request, url }) => {
	let entries;
	try {
		entries = parseCompletionEntries((await request.json()).entries);
	} catch (cause) {
		throw error(400, cause instanceof Error ? cause.message : 'Data absensi tidak valid.');
	}
	const report = await loadAttendanceSummary(locals, url.searchParams);
	const options = await loadSummaryOptions(locals, url.searchParams.get('tanggal')!);
	const missing = new Map(report.missingStudents.map((item) => [item.id, item]));
	const results = [];
	for (const entry of entries) {
		const student = missing.get(entry.muridId);
		if (!student) {
			const accessible = await db.query.tableMurid.findFirst({
				columns: { id: true },
				where: and(
					eq(tableMurid.id, entry.muridId),
					inArray(
						tableMurid.kelasId,
						report.classes.map((item) => item.id)
					),
					await studentAccessCondition(locals.user, locals.sekolah!.id, options.semesterId)
				)
			});
			const existing = accessible
				? await db.query.tableAbsensiKegiatan.findFirst({
						columns: { petugasUserId: true },
						where: and(
							eq(tableAbsensiKegiatan.sekolahId, locals.sekolah!.id),
							eq(tableAbsensiKegiatan.muridId, entry.muridId),
							eq(tableAbsensiKegiatan.kegiatanId, Number(url.searchParams.get('kegiatan_id'))),
							eq(tableAbsensiKegiatan.tanggal, url.searchParams.get('tanggal')!)
						)
					})
				: null;
			const actor = existing?.petugasUserId
				? await db.query.tableAuthUser.findFirst({
						columns: { username: true },
						with: { pegawai: { columns: { nama: true } } },
						where: eq(tableAuthUser.id, existing.petugasUserId)
					})
				: null;
			results.push({
				muridId: entry.muridId,
				code: 'changed',
				message: actor
					? `Sudah dicatat oleh ${actor.pegawai?.nama ?? actor.username}. Data tidak ditimpa.`
					: 'Murid sudah tercatat atau di luar daftar. Perbarui ringkasan.'
			});
			continue;
		}
		if (!student.canEdit) {
			results.push({ muridId: entry.muridId, code: 'forbidden', message: student.reason });
			continue;
		}
		if (entry.status === 'pulang') {
			results.push({
				muridId: entry.muridId,
				code: 'failed',
				message:
					'Belum ada izin pulang yang berlaku untuk kegiatan ini. Periksa catatan izin pulang dan konfirmasi keamanan; popup tidak menerbitkan izin.'
			});
			continue;
		}
		try {
			const saved = await saveAttendance({
				locals,
				request,
				semesterId: options.semesterId,
				kelasId: student.kelasId,
				muridIds: [entry.muridId],
				tanggal: url.searchParams.get('tanggal')!,
				kegiatanId: Number(url.searchParams.get('kegiatan_id')),
				status: entry.status,
				catatan: entry.catatan,
				onlyEmpty: true,
				metode: 'manual',
				waktuScan: new Date().toISOString()
			});
			let message = 'Absensi manual tersimpan.';
			if (!saved.affected) {
				const actor = saved.records[0]?.petugasUserId
					? await db.query.tableAuthUser.findFirst({
							columns: { username: true },
							with: { pegawai: { columns: { nama: true } } },
							where: eq(tableAuthUser.id, saved.records[0].petugasUserId)
						})
					: null;
				message = `Sudah dicatat oleh ${actor?.pegawai?.nama ?? actor?.username ?? 'petugas lain atau izin pulang'}. Data tidak ditimpa.`;
			}
			results.push({ muridId: entry.muridId, code: saved.affected ? 'saved' : 'changed', message });
		} catch (cause) {
			if (!isHttpError(cause)) throw cause;
			results.push({ muridId: entry.muridId, code: 'failed', message: cause.body.message });
		}
	}
	return json(
		{ results, report: await loadAttendanceSummary(locals, url.searchParams) },
		{ headers: { 'cache-control': 'no-store, private' } }
	);
};
