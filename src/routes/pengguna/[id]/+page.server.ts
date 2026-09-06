import db from '$lib/server/db/index.js';
import { ensurePenggunaIdentitySchema } from '$lib/server/db/ensure-pengguna';
import { tableAuthUser, tableAuthUserKelas } from '$lib/server/db/schema';
import { error } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { defaultPermissionsForType, userPermissions } from '../permissions';
import { authority } from '../utils.server.js';

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
			permissions: u.permissions,
			createdAt: u.createdAt
		})
		.from(u)
		.where(and(eq(u.id, +params.id), eq(u.sekolahId, locals.sekolah.id)));
	if (!userDetail) error(404, 'Data pengguna tidak ditemukan');

	return { meta: { title: 'Pengaturan Izin Pengguna' }, userDetail };
}

export const actions = {
	set_permissions: async ({ params, request, locals }) => {
		authority('user_set_permissions');
		await ensurePenggunaIdentitySchema();
		if (!locals.sekolah?.id) error(400, 'Sekolah aktif tidak ditemukan');

		const submitted = new Set(Array.from((await request.formData()).keys()));
		const permissions = userPermissions.filter((permission) => submitted.has(permission));
		const [updated] = await db
			.update(u)
			.set({ permissions, updatedAt: new Date().toISOString() })
			.where(and(eq(u.id, +params.id), eq(u.sekolahId, locals.sekolah.id)))
			.returning({ id: u.id });
		if (!updated) error(404, 'Data pengguna tidak ditemukan');
		return { message: 'Izin pengguna berhasil diperbarui', permissions };
	},
	reset_permissions: async ({ params, locals }) => {
		authority('user_set_permissions');
		await ensurePenggunaIdentitySchema();
		if (!locals.sekolah?.id) error(400, 'Sekolah aktif tidak ditemukan');

		const [target] = await db
			.select({ id: u.id, type: u.type })
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
		return {
			message: `Izin pengguna direset ke default (${target.type.replaceAll('_', ' ')})`,
			permissions
		};
	}
};
