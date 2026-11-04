import db from '$lib/server/db/index.js';
import { ensurePenggunaIdentitySchema } from '$lib/server/db/ensure-pengguna';
import { tableAuthSession, tableAuthUser, tableAuthUserKelas } from '$lib/server/db/schema';
import { error } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import {
	defaultPermissionsForType,
	effectivePermissions,
	permissionsForAccessPosition,
	permissionAppliesToUser,
	userPermissions
} from '../permissions';
import { authority } from '../utils.server.js';
import { writeAuditLog } from '$lib/server/audit-log';
import { getLegacyWaliKelasIds } from '$lib/server/legacy-wali-kelas';

const u = tableAuthUser;

export async function load({ params, locals }) {
	authority('user_detail');
	await ensurePenggunaIdentitySchema();
	if (!locals.sekolah?.id) error(400, 'Sekolah aktif tidak ditemukan');

	const [userDetail] = await db
		.select({
			id: u.id,
			username: u.username,
			type: u.type,
			jabatanAkses: u.jabatanAkses,
			roles: u.roles,
			pegawaiId: u.pegawaiId,
			sekolahId: u.sekolahId,
			permissions: u.permissions,
			createdAt: u.createdAt
		})
		.from(u)
		.where(and(eq(u.id, +params.id), eq(u.sekolahId, locals.sekolah.id)));
	if (!userDetail) error(404, 'Data pengguna tidak ditemukan');
	const waliKelasIds = await getLegacyWaliKelasIds(userDetail, locals.sekolah.id);

	return {
		meta: { title: 'Pengaturan Izin Pengguna' },
		userDetail: {
			...userDetail,
			waliKelasIds,
			automaticPermissions: effectivePermissions({ ...userDetail, waliKelasIds, permissions: [] }),
			storedPermissions: userDetail.permissions,
			permissions: effectivePermissions({ ...userDetail, waliKelasIds }),
			positionPermissions: permissionsForAccessPosition(userDetail.jabatanAkses)
		}
	};
}

export const actions = {
	set_permissions: async ({ params, request, locals }) => {
		authority('user_set_permissions');
		await ensurePenggunaIdentitySchema();
		if (!locals.sekolah?.id) error(400, 'Sekolah aktif tidak ditemukan');

		const submitted = new Set(Array.from((await request.formData()).keys()));
		const [target] = await db
			.select({
				id: u.id,
				username: u.username,
				type: u.type,
				jabatanAkses: u.jabatanAkses,
				roles: u.roles,
				pegawaiId: u.pegawaiId,
				sekolahId: u.sekolahId
			})
			.from(u)
			.where(and(eq(u.id, +params.id), eq(u.sekolahId, locals.sekolah.id)));
		if (!target) error(404, 'Data pengguna tidak ditemukan');
		const waliKelasIds = await getLegacyWaliKelasIds(target, locals.sekolah.id);
		const baseline = new Set(effectivePermissions({ ...target, waliKelasIds, permissions: [] }));
		const permissions = userPermissions.filter(
			(permission) =>
				submitted.has(permission) &&
				!baseline.has(permission) &&
				permissionAppliesToUser(target, permission)
		);
		const [updated] = await db
			.update(u)
			.set({ permissions, updatedAt: new Date().toISOString() })
			.where(and(eq(u.id, +params.id), eq(u.sekolahId, locals.sekolah.id)))
			.returning({ id: u.id });
		if (!updated) error(404, 'Data pengguna tidak ditemukan');
		await db.delete(tableAuthSession).where(eq(tableAuthSession.userId, target.id));
		const effective = effectivePermissions({ ...target, waliKelasIds, permissions });
		await writeAuditLog({
			locals,
			request,
			action: 'update',
			entityType: 'izin_pengguna',
			entityId: target.id,
			summary: `Memperbarui izin akun ${target.username}`,
			after: { jabatanAkses: target.jabatanAkses, permissions }
		}).catch((auditError) => console.error('Failed to audit permission update', auditError));
		return { message: 'Izin pengguna berhasil diperbarui', permissions: effective };
	},
	reset_permissions: async ({ params, locals, request }) => {
		authority('user_set_permissions');
		await ensurePenggunaIdentitySchema();
		if (!locals.sekolah?.id) error(400, 'Sekolah aktif tidak ditemukan');

		const [target] = await db
			.select({
				id: u.id,
				username: u.username,
				type: u.type,
				jabatanAkses: u.jabatanAkses,
				roles: u.roles,
				pegawaiId: u.pegawaiId,
				sekolahId: u.sekolahId
			})
			.from(u)
			.where(and(eq(u.id, +params.id), eq(u.sekolahId, locals.sekolah.id)));
		if (!target) error(404, 'Data pengguna tidak ditemukan');

		const [{ total }] = await db
			.select({ total: sql<number>`count(*)` })
			.from(tableAuthUserKelas)
			.where(eq(tableAuthUserKelas.authUserId, target.id));
		const permissions = defaultPermissionsForType(target.type, { kelasCount: Number(total ?? 0) });
		await db
			.update(u)
			.set({ permissions, updatedAt: new Date().toISOString() })
			.where(eq(u.id, target.id));
		await db.delete(tableAuthSession).where(eq(tableAuthSession.userId, target.id));
		await writeAuditLog({
			locals,
			request,
			action: 'update',
			entityType: 'izin_pengguna',
			entityId: target.id,
			summary: `Mereset izin akun ${target.username}`,
			after: { jabatanAkses: target.jabatanAkses, permissions }
		}).catch((auditError) => console.error('Failed to audit permission reset', auditError));
		return {
			message: `Izin pengguna direset ke default (${target.type.replaceAll('_', ' ')})`,
			permissions: effectivePermissions({
				...target,
				permissions,
				waliKelasIds: await getLegacyWaliKelasIds(target, locals.sekolah.id)
			})
		};
	}
};
