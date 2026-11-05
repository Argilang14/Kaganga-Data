import { activeMuridFilter } from '$lib/server/murid-query';
import { personalQrTransaction, issuePersonalQr, loadPersonalQrMap } from '$lib/server/student-qr';
import {
	assertAbsensiDigitalAccess,
	loadAbsensiKelasOptions,
	resolvePrintableQrToken
} from '$lib/server/absensi-digital';
import db from '$lib/server/db';
import { studentAccessCondition } from '$lib/server/student-access';
import { canAttendance } from '$lib/attendance-access';
import { writeAuditLog } from '$lib/server/audit-log';
import { tableMurid } from '$lib/server/db/schema';
import { error, json } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types';

const MAX_QR_MURID = 500;

type QrRequest = {
	action?: 'status' | 'generate-missing';
	muridIds?: unknown;
};

function normalizeMuridIds(value: unknown): number[] {
	if (!Array.isArray(value)) return [];
	return [...new Set(value.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

export const POST = (async ({ locals, request }) => {
	assertAbsensiDigitalAccess(locals.user);
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId || !locals.user) throw error(401, 'Sesi sekolah tidak valid.');

	const body = (await request.json()) as QrRequest;
	const action = body.action === 'generate-missing' ? body.action : 'status';
	if (action === 'generate-missing' && !canAttendance(locals.user, 'qr_manage'))
		throw error(403, 'Izin penerbitan QR belum diberikan.');
	const muridIds = normalizeMuridIds(body.muridIds);
	if (!muridIds.length) throw error(400, 'Daftar murid wajib diisi.');
	if (muridIds.length > MAX_QR_MURID) {
		throw error(413, `Maksimal ${MAX_QR_MURID} murid dalam satu proses.`);
	}

	const { academic, kelasList } = await loadAbsensiKelasOptions(sekolahId, locals.user);
	if (!academic.activeSemesterId) throw error(409, 'Semester aktif belum tersedia.');
	const kelasIds = kelasList.map((kelas) => kelas.id);
	if (!kelasIds.length) throw error(403, 'Anda tidak memiliki akses ke kelas murid tersebut.');

	const muridList = await db.query.tableMurid.findMany({
		columns: { id: true },
		where: and(
			eq(tableMurid.sekolahId, sekolahId),
			eq(tableMurid.semesterId, academic.activeSemesterId),
			inArray(tableMurid.kelasId, kelasIds),
			inArray(tableMurid.id, muridIds),
			activeMuridFilter(),
			await studentAccessCondition(locals.user, sekolahId)
		)
	});
	if (muridList.length !== muridIds.length) {
		throw error(403, 'Sebagian murid tidak ditemukan atau berada di luar akses Anda.');
	}

	const activeByMurid = await loadPersonalQrMap(sekolahId, muridIds);

	const readyIds: number[] = [];
	const missingIds: number[] = [];
	const outdatedIds: number[] = [];
	for (const muridId of muridIds) {
		const qr = activeByMurid.get(muridId);
		if (!qr) missingIds.push(muridId);
		else if (resolvePrintableQrToken(qr)) readyIds.push(muridId);
		else outdatedIds.push(muridId);
	}

	let generated = 0;
	const targetIds = missingIds;
	if (action === 'generate-missing' && outdatedIds.length)
		throw error(
			409,
			'QR lama belum dapat dicetak atau ada beberapa QR aktif. Pindai kartu lama untuk pemulihan; gunakan Perbarui QR hanya jika ingin menggantinya.'
		);
	if (action === 'generate-missing' && targetIds.length) {
		await personalQrTransaction(async (tx) => {
			for (const muridId of targetIds) {
				const result = await issuePersonalQr(sekolahId, muridId, false, tx);
				if (!result.created) continue;
				generated += 1;
				await writeAuditLog(
					{
						locals,
						request,
						action: 'create',
						entityType: 'qr_murid',
						entityId: muridId,
						summary: 'Menerbitkan QR absensi murid',
						after: { tokenVersion: result.qr.tokenVersion }
					},
					tx
				);
			}
		});
	}

	return json({
		total: muridIds.length,
		ready: action === 'generate-missing' ? muridIds.length : readyIds.length,
		missing: action === 'generate-missing' ? 0 : missingIds.length,
		outdated: action === 'generate-missing' ? 0 : outdatedIds.length,
		generated
	});
}) satisfies RequestHandler;
