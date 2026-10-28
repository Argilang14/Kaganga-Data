import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import db from './db';
import { tableMuridProfilTambahan as profiles, tableMuridProfilFoto as photos } from './db/schema';
import { requireStudentProfileAccess } from './murid-profile';
import { studentProfilePhotoKinds } from '$lib/murid-profile';
import { studentProfilePhotoPath } from './murid-profile-storage';
import { normalizeStudentProfileImage } from './student-profile-image';
import { writeAuditLog } from './audit-log';

function photoKind(value: string) {
	const kind = studentProfilePhotoKinds.find((kind) => kind === value);
	if (!kind) error(400, 'Jenis foto tidak dikenal. Pilih kembali foto yang akan dikelola.');
	return kind;
}

export async function readStudentProfilePhoto(locals: App.Locals, id: number, kind: string) {
	const ctx = await requireStudentProfileAccess(locals, id, 'read');
	const jenis = photoKind(kind);
	const rows = await db
		.select({ photo: photos })
		.from(photos)
		.innerJoin(profiles, eq(photos.profilId, profiles.id))
		.where(
			and(
				eq(profiles.sekolahId, ctx.school.id),
				eq(profiles.identityUid, ctx.uid),
				eq(photos.jenis, jenis),
				eq(photos.sekolahId, ctx.school.id)
			)
		);
	const row = rows[0]?.photo;
	if (!row) error(404, 'Foto belum tersedia.');
	const file = studentProfilePhotoPath(ctx.school.id, row.storageKey);
	if (!file) error(404, 'Foto tidak tersedia. Hubungi admin sekolah.');
	let bytes;
	try {
		bytes = await readFile(file);
	} catch {
		error(404, 'Berkas foto tidak ditemukan. Hubungi admin sekolah.');
	}
	return new Response(bytes, {
		headers: {
			'Content-Type': row.mimeType,
			'Cache-Control': 'private, no-store',
			'X-Content-Type-Options': 'nosniff',
			'Content-Disposition': 'inline; filename="foto-murid.jpg"'
		}
	});
}

export async function changeStudentProfilePhoto(
	locals: App.Locals,
	id: number,
	kind: string,
	revision: number,
	file: File | null,
	request?: Request
) {
	const ctx = await requireStudentProfileAccess(locals, id, 'edit');
	const jenis = photoKind(kind);
	if (!Number.isSafeInteger(revision) || revision < 0)
		error(400, 'Versi foto tidak valid. Muat ulang profil.');
	const bytes = file ? await normalizeStudentProfileImage(file) : null;
	const key = bytes ? `sekolah-${ctx.school.id}/${randomUUID()}.jpg` : null;
	const target = key ? studentProfilePhotoPath(ctx.school.id, key)! : null;
	if (bytes && target) {
		await mkdir(path.dirname(target), { recursive: true });
		await writeFile(target, bytes, { flag: 'wx' });
	}
	try {
		return await db.transaction(async (tx) => {
			const existing = await tx.query.tableMuridProfilTambahan.findFirst({
				where: and(eq(profiles.sekolahId, ctx.school.id), eq(profiles.identityUid, ctx.uid))
			});
			if ((existing?.revisi ?? 0) !== revision)
				error(409, 'Profil telah diperbarui pengguna lain. Muat ulang sebelum mengubah foto.');
			if (!existing && !bytes) error(404, 'Foto belum tersedia.');
			const now = new Date().toISOString();
			const values = { revisi: revision + 1, updatedBy: ctx.user.id, updatedAt: now };
			const [profile] = existing
				? await tx
						.update(profiles)
						.set(values)
						.where(and(eq(profiles.id, existing.id), eq(profiles.revisi, revision)))
						.returning()
				: await tx
						.insert(profiles)
						.values({
							...values,
							sekolahId: ctx.school.id,
							identityUid: ctx.uid,
							createdBy: ctx.user.id
						})
						.onConflictDoNothing()
						.returning();
			if (!profile) error(409, 'Profil telah berubah. Muat ulang sebelum mengubah foto.');
			const oldPhoto = await tx.query.tableMuridProfilFoto.findFirst({
				where: and(
					eq(photos.profilId, profile.id),
					eq(photos.sekolahId, ctx.school.id),
					eq(photos.jenis, jenis)
				)
			});
			const oldPath = oldPhoto ? studentProfilePhotoPath(ctx.school.id, oldPhoto.storageKey) : null;
			// Start orphan retention before removing the reference, even for photos uploaded months ago.
			if (oldPath)
				await utimes(oldPath, new Date(), new Date()).catch((cause: NodeJS.ErrnoException) => {
					if (cause.code !== 'ENOENT') throw cause;
				});
			if (bytes && key) {
				await tx
					.insert(photos)
					.values({
						profilId: profile.id,
						sekolahId: ctx.school.id,
						jenis,
						storageKey: key,
						mimeType: 'image/jpeg',
						ukuranBytes: bytes.length,
						sha256: createHash('sha256').update(bytes).digest('hex'),
						createdBy: ctx.user.id,
						updatedAt: now
					})
					.onConflictDoUpdate({
						target: [photos.profilId, photos.jenis],
						set: {
							storageKey: key,
							mimeType: 'image/jpeg',
							ukuranBytes: bytes.length,
							sha256: createHash('sha256').update(bytes).digest('hex'),
							createdBy: ctx.user.id,
							updatedAt: now
						}
					});
			} else {
				const deleted = await tx
					.delete(photos)
					.where(
						and(
							eq(photos.profilId, profile.id),
							eq(photos.sekolahId, ctx.school.id),
							eq(photos.jenis, jenis)
						)
					)
					.returning({ id: photos.id });
				if (!deleted.length) error(404, 'Foto belum tersedia.');
			}
			await writeAuditLog(
				{
					locals,
					request,
					action: bytes ? 'update' : 'delete',
					entityType: 'murid_profil_foto',
					entityId: profile.id,
					summary: bytes ? 'Dokumentasi murid diperbarui' : 'Dokumentasi murid dihapus',
					after: { jenis, revision: profile.revisi }
				},
				tx
			);
			return {
				revisi: profile.revisi,
				photos: await tx
					.select({ id: photos.id, jenis: photos.jenis, updatedAt: photos.updatedAt })
					.from(photos)
					.where(and(eq(photos.profilId, profile.id), eq(photos.sekolahId, ctx.school.id)))
			};
		});
	} catch (cause) {
		if (target) await unlink(target).catch(() => undefined);
		throw cause;
	}
	// Replaced files remain unreferenced for seven days so in-flight database backups can copy them.
}
