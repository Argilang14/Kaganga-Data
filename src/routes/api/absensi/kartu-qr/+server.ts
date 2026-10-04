import {
	assertAbsensiDigitalAccess,
	createPreviewableQrToken,
	hashQrToken,
	loadAbsensiKelasOptions,
	resolvePrintableQrToken
} from '$lib/server/absensi-digital';
import db from '$lib/server/db';
import { studentAccessCondition } from '$lib/server/student-access';
import { canAttendance } from '$lib/attendance-access';
import { writeAuditLog } from '$lib/server/audit-log';
import { tableMurid, tableQrMurid } from '$lib/server/db/schema';
import { error, json } from '@sveltejs/kit';
import { and, eq, inArray, isNull } from 'drizzle-orm';
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
	if (action === 'generate-missing' && !canAttendance(locals.user, 'qr_manage')) throw error(403, 'Izin penerbitan QR belum diberikan.');
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
			await studentAccessCondition(locals.user, sekolahId)
		)
	});
	if (muridList.length !== muridIds.length) {
		throw error(403, 'Sebagian murid tidak ditemukan atau berada di luar akses Anda.');
	}

	const qrRows = await db.query.tableQrMurid.findMany({
		columns: {
			id: true,
			muridId: true,
			tokenHash: true,
			tokenVersion: true,
			issuedAt: true,
			revokedAt: true
		},
		where: and(inArray(tableQrMurid.muridId, muridIds), isNull(tableQrMurid.revokedAt)),
		orderBy: (table, { desc }) => [desc(table.tokenVersion), desc(table.id)]
	});
	const activeByMurid = new Map<number, (typeof qrRows)[number]>();
	for (const row of qrRows) {
		if (!activeByMurid.has(row.muridId)) activeByMurid.set(row.muridId, row);
	}

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
	const targetIds = [...missingIds, ...outdatedIds];
	if (action === 'generate-missing' && targetIds.length) {
		const now = new Date().toISOString();
		await db.transaction(async (tx) => {
			for (const muridId of targetIds) {
				const latest = await tx.query.tableQrMurid.findFirst({
					columns: { tokenVersion: true },
					where: eq(tableQrMurid.muridId, muridId),
					orderBy: (table, { desc }) => [desc(table.tokenVersion), desc(table.id)]
				});
				const tokenVersion = (latest?.tokenVersion ?? 0) + 1;
				const token = createPreviewableQrToken({ muridId, tokenVersion, issuedAt: now });
				await tx
					.update(tableQrMurid)
					.set({ revokedAt: now, updatedAt: now })
					.where(and(eq(tableQrMurid.muridId, muridId), isNull(tableQrMurid.revokedAt)));
				await tx.insert(tableQrMurid).values({
					muridId,
					tokenHash: hashQrToken(token),
					tokenVersion,
					issuedAt: now,
					createdAt: now,
					updatedAt: now
				});
				generated += 1;
				await writeAuditLog({ locals, request, action: 'update', entityType: 'qr_murid', entityId: muridId,
					summary: 'Menerbitkan ulang QR absensi', before: { tokenVersion: latest?.tokenVersion ?? 0 }, after: { tokenVersion } }, tx);
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
