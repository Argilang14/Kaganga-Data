import { MuridIdentityConflictError } from './murid-identity-integrity';
import db from '$lib/server/db';
import { and, desc, eq, inArray, isNull, sql, type SQLWrapper } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { tableMurid, tableMuridIdentityLink, tableQrMurid } from '$lib/server/db/schema';
import { ensureAbsensiDigitalSchema } from '$lib/server/db/ensure-absensi-digital';
import { ensureDataGovernanceSchema } from '$lib/server/db/ensure-data-governance';
import { assertMuridIdentityConsistent } from './murid-identity-service';
import { activeMuridFilter } from './murid-query';
import { createPreviewableQrToken, hashQrToken, resolvePrintableQrToken } from './student-qr-token';

type Reader = typeof db | DBTransaction;
export type PersonalQr = typeof tableQrMurid.$inferSelect & { conflicting?: boolean };

export async function preparePersonalQr() {
	await ensureAbsensiDigitalSchema();
	await ensureDataGovernanceSchema();
}

// Serialize local issuers; SQLite still protects writes from other processes.
let qrWrites: Promise<unknown> = Promise.resolve();
export async function personalQrTransaction<T>(work: (tx: DBTransaction) => Promise<T>) {
	const write = qrWrites.then(() => db.transaction(work));
	qrWrites = write.catch(() => undefined);
	try {
		return await write;
	} catch (cause) {
		const problem = cause as { code?: string; cause?: { code?: string } } | null;
		if (/^SQLITE_(BUSY|LOCKED)/.test(problem?.code ?? problem?.cause?.code ?? ''))
			throw error(
				409,
				'QR sedang diproses petugas lain. Tunggu sebentar lalu coba lagi; kartu yang sudah dibuat tetap berlaku.'
			);
		throw cause;
	}
}

/** Identity links, never names or NISN alone, connect cards across semesters. */
export async function personalQrStudentIds(
	schoolId: number,
	studentId: number,
	reader: Reader = db
) {
	const student = await reader.query.tableMurid.findFirst({
		columns: { id: true },
		where: and(eq(tableMurid.id, studentId), eq(tableMurid.sekolahId, schoolId))
	});
	if (!student) throw error(404, 'Murid tidak ditemukan di sekolah aktif.');
	const link = await reader.query.tableMuridIdentityLink.findFirst({
		where: and(
			eq(tableMuridIdentityLink.muridId, studentId),
			eq(tableMuridIdentityLink.sekolahId, schoolId)
		)
	});
	if (!link) return [studentId];
	try {
		return (await assertMuridIdentityConsistent(reader, schoolId, link.identityUid, studentId)).map(
			(member) => member.id
		);
	} catch (cause) {
		if (!(cause instanceof MuridIdentityConflictError)) throw cause;
		throw error(
			409,
			`Hubungan identitas murid ID ${studentId} perlu diperiksa sebelum menggunakan QR.`
		);
	}
}

export async function loadPersonalQrMap(
	schoolId: number,
	studentIds: number[],
	reader: Reader = db
) {
	if (reader === db) await preparePersonalQr();
	const result = new Map<number, PersonalQr>();
	for (const id of studentIds) {
		const members = await personalQrStudentIds(schoolId, id, reader);
		const rows = await reader.query.tableQrMurid.findMany({
			where: and(inArray(tableQrMurid.muridId, members), isNull(tableQrMurid.revokedAt)),
			orderBy: [desc(tableQrMurid.issuedAt), desc(tableQrMurid.id)]
		});
		if (rows.length) {
			const qr = { ...rows[0], conflicting: rows.length > 1 };
			const token = resolvePrintableQrToken(qr);
			if (token) await rememberScannedQr(qr, token, reader);
			result.set(id, qr);
		}
	}
	return result;
}

export async function loadActivePrintableQr(studentId: number) {
	await preparePersonalQr();
	const student = await db.query.tableMurid.findFirst({
		columns: { sekolahId: true },
		where: eq(tableMurid.id, studentId)
	});
	if (!student) return { status: 'missing' as const };
	const qr = (await loadPersonalQrMap(student.sekolahId, [studentId])).get(studentId);
	if (!qr) return { status: 'missing' as const };
	const token = resolvePrintableQrToken(qr);
	if (!token) return { status: 'not_printable' as const, qr };
	return { status: 'ready' as const, qr, token };
}

export async function currentQrStudent(
	schoolId: number,
	sourceId: number,
	semesterId: number | null,
	reader: Reader = db
) {
	if (reader === db) await preparePersonalQr();
	if (!semesterId) return undefined;
	const source = await reader.query.tableMurid.findFirst({
		columns: { id: true },
		where: and(eq(tableMurid.id, sourceId), eq(tableMurid.sekolahId, schoolId))
	});
	if (!source) return undefined;
	const members = await personalQrStudentIds(schoolId, sourceId, reader);
	const active = await reader
		.select({ id: tableQrMurid.id })
		.from(tableQrMurid)
		.where(and(inArray(tableQrMurid.muridId, members), isNull(tableQrMurid.revokedAt)));
	if (active.length > 1)
		throw error(
			409,
			'Ada beberapa QR aktif untuk anak ini. Periksa identitas atau gunakan Perbarui QR secara sengaja.'
		);
	return reader.query.tableMurid.findFirst({
		where: and(
			inArray(tableMurid.id, members),
			eq(tableMurid.sekolahId, schoolId),
			eq(tableMurid.semesterId, semesterId),
			activeMuridFilter()
		),
		with: { kelas: { columns: { id: true, nama: true, fase: true } } }
	});
}

/** Call inside a transaction. Only explicit replacement may revoke an existing card. */
export async function issuePersonalQr(
	schoolId: number,
	studentId: number,
	replace: boolean,
	tx: DBTransaction
) {
	const members = await personalQrStudentIds(schoolId, studentId, tx);
	const active = (await loadPersonalQrMap(schoolId, [studentId], tx)).get(studentId);
	if (!replace && active) {
		const token = resolvePrintableQrToken(active);
		if (!token)
			throw error(
				409,
				'QR lama perlu diperiksa. Pindai kartu lama untuk memulihkan kode, atau gunakan Perbarui QR untuk menggantinya.'
			);
		await rememberScannedQr(active, token, tx);
		return { qr: active, token, created: false };
	}
	if (replace)
		await tx.update(tableMurid).set({ qrToken: null }).where(inArray(tableMurid.id, members));
	const latest = await tx.query.tableQrMurid.findFirst({
		where: inArray(tableQrMurid.muridId, members),
		orderBy: desc(tableQrMurid.tokenVersion)
	});
	const now = new Date().toISOString();
	const tokenVersion = (latest?.tokenVersion ?? 0) + 1;
	const token = createPreviewableQrToken({ muridId: studentId, tokenVersion, issuedAt: now });
	await tx
		.update(tableQrMurid)
		.set({ revokedAt: now, updatedAt: now })
		.where(and(inArray(tableQrMurid.muridId, members), isNull(tableQrMurid.revokedAt)));
	const [qr] = await tx
		.insert(tableQrMurid)
		.values({
			muridId: studentId,
			tokenValue: token,
			tokenHash: hashQrToken(token),
			tokenVersion,
			issuedAt: now,
			createdAt: now,
			updatedAt: now
		})
		.returning();
	return { qr, token, created: true };
}

export async function rememberScannedQr(qr: PersonalQr, token: string, reader: Reader = db) {
	if (!qr.revokedAt && qr.tokenValue !== token && hashQrToken(token) === qr.tokenHash)
		await reader
			.update(tableQrMurid)
			.set({ tokenValue: token })
			.where(
				and(
					eq(tableQrMurid.id, qr.id),
					eq(tableQrMurid.tokenHash, qr.tokenHash),
					isNull(tableQrMurid.revokedAt)
				)
			);
}

/** Used only for completeness indicators; scan access is checked against the current student. */
export function personalQrExists(studentId: SQLWrapper, schoolId: SQLWrapper) {
	return sql`exists (select 1 from qr_murid pq where pq.revoked_at is null and (
		pq.murid_id=${studentId} or exists (
			select 1 from murid_identity_link qc join murid_identity_link qp
			on qp.sekolah_id=qc.sekolah_id and qp.identity_uid=qc.identity_uid
			where qc.murid_id=${studentId} and qc.sekolah_id=${schoolId} and qp.murid_id=pq.murid_id
		)))`;
}
