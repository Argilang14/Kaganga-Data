import { writeAuditLog } from '$lib/server/audit-log';
import { hashPassword } from '$lib/server/auth';
import db from '$lib/server/db';
import { ensureLongTermFoundationSchema } from '$lib/server/db/ensure-long-term-foundation';
import {
	tableAuthSession,
	tableAuthUser,
	tableAuthUserMurid,
	tableKelas,
	tableMurid
} from '$lib/server/db/schema';
import { validatePassword } from '$lib/password-policy';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { defaultPermissionsForType } from '../../pengguna/permissions';
import { authority } from '../../pengguna/utils.server';

const ids = (form: FormData) => [
	...new Set(
		form
			.getAll('muridIds')
			.map(Number)
			.filter((id) => Number.isInteger(id) && id > 0)
	)
];

export async function load({ locals }) {
	authority('portal_wali_manage');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw redirect(303, '/login');
	await ensureLongTermFoundationSchema();
	const [students, accounts] = await Promise.all([
		db
			.select({
				id: tableMurid.id,
				nama: tableMurid.nama,
				nis: tableMurid.nis,
				kelas: tableKelas.nama
			})
			.from(tableMurid)
			.innerJoin(tableKelas, eq(tableMurid.kelasId, tableKelas.id))
			.where(eq(tableMurid.sekolahId, sekolahId))
			.orderBy(asc(tableMurid.nama)),
		db
			.select({
				id: tableAuthUser.id,
				username: tableAuthUser.username,
				mustChangePassword: tableAuthUser.mustChangePassword
			})
			.from(tableAuthUser)
			.where(and(eq(tableAuthUser.sekolahId, sekolahId), eq(tableAuthUser.type, 'wali_murid')))
			.orderBy(asc(tableAuthUser.username))
	]);
	const accountIds = accounts.map((item) => item.id);
	const links = accountIds.length
		? await db
				.select({
					authUserId: tableAuthUserMurid.authUserId,
					muridId: tableAuthUserMurid.muridId,
					hubungan: tableAuthUserMurid.hubungan,
					nama: tableMurid.nama
				})
				.from(tableAuthUserMurid)
				.innerJoin(tableMurid, eq(tableAuthUserMurid.muridId, tableMurid.id))
				.where(inArray(tableAuthUserMurid.authUserId, accountIds))
		: [];
	return {
		meta: { title: 'Pengaturan Portal Wali' } satisfies PageMeta,
		students,
		accounts: accounts.map((account) => ({
			...account,
			children: links.filter((link) => link.authUserId === account.id)
		}))
	};
}

export const actions = {
	create: async ({ request, locals }) => {
		authority('portal_wali_manage');
		const sekolahId = locals.sekolah?.id;
		const form = await request.formData();
		const username = String(form.get('username') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const hubungan = String(form.get('hubungan') ?? 'wali').trim() || 'wali';
		const muridIds = ids(form);
		const validation = validatePassword(password);
		if (!sekolahId || username.length < 3 || !validation.valid || !muridIds.length)
			return fail(400, {
				fail: validation.valid
					? 'Nama pengguna dan minimal satu anak wajib diisi.'
					: validation.message
			});
		const valid = await db
			.select({ id: tableMurid.id })
			.from(tableMurid)
			.where(and(eq(tableMurid.sekolahId, sekolahId), inArray(tableMurid.id, muridIds)));
		if (valid.length !== muridIds.length)
			return fail(400, { fail: 'Data anak tidak valid untuk sekolah aktif.' });
		try {
			const result = hashPassword(password);
			const now = new Date().toISOString();
			const created = await db.transaction(async (tx) => {
				const [user] = await tx
					.insert(tableAuthUser)
					.values({
						username,
						usernameNormalized: username.toLowerCase(),
						passwordHash: result.hash,
						passwordSalt: result.salt,
						passwordUpdatedAt: now,
						permissions: defaultPermissionsForType('wali_murid'),
						type: 'wali_murid',
						sekolahId,
						mustChangePassword: true,
						createdAt: now,
						updatedAt: now
					})
					.returning();
				await tx
					.insert(tableAuthUserMurid)
					.values(
						muridIds.map((muridId) => ({ authUserId: user.id, muridId, hubungan, createdAt: now }))
					);
				return user;
			});
			await writeAuditLog({
				locals,
				request,
				action: 'create',
				entityType: 'portal_wali',
				entityId: created.id,
				summary: `Akun wali ${username} dibuat untuk ${muridIds.length} anak.`,
				after: { username, muridIds, hubungan }
			});
			return { message: 'Akun wali murid berhasil dibuat.' };
		} catch (error) {
			if (String(error).includes('UNIQUE'))
				return fail(409, { fail: 'Nama pengguna sudah digunakan.' });
			throw error;
		}
	},
	updateChildren: async ({ request, locals }) => {
		authority('portal_wali_manage');
		const sekolahId = locals.sekolah?.id;
		const form = await request.formData();
		const userId = Number(form.get('userId'));
		const muridIds = ids(form);
		const hubungan = String(form.get('hubungan') ?? 'wali').trim() || 'wali';
		const user = sekolahId
			? await db.query.tableAuthUser.findFirst({
					where: and(
						eq(tableAuthUser.id, userId),
						eq(tableAuthUser.sekolahId, sekolahId),
						eq(tableAuthUser.type, 'wali_murid')
					)
				})
			: null;
		if (!user || !muridIds.length)
			return fail(400, { fail: 'Akun dan minimal satu anak wajib dipilih.' });
		const valid = await db
			.select({ id: tableMurid.id })
			.from(tableMurid)
			.where(and(eq(tableMurid.sekolahId, sekolahId!), inArray(tableMurid.id, muridIds)));
		if (valid.length !== muridIds.length) return fail(400, { fail: 'Data anak tidak valid.' });
		await db.transaction(async (tx) => {
			await tx.delete(tableAuthUserMurid).where(eq(tableAuthUserMurid.authUserId, userId));
			await tx
				.insert(tableAuthUserMurid)
				.values(muridIds.map((muridId) => ({ authUserId: userId, muridId, hubungan })));
		});
		await writeAuditLog({
			locals,
			request,
			action: 'update',
			entityType: 'portal_wali',
			entityId: userId,
			summary: `Hubungan anak akun ${user.username} diperbarui.`,
			after: { muridIds, hubungan }
		});
		return { message: 'Hubungan anak berhasil diperbarui.' };
	},
	delete: async ({ request, locals }) => {
		authority('portal_wali_manage');
		const sekolahId = locals.sekolah?.id;
		const id = Number((await request.formData()).get('id'));
		const user = sekolahId
			? await db.query.tableAuthUser.findFirst({
					where: and(
						eq(tableAuthUser.id, id),
						eq(tableAuthUser.sekolahId, sekolahId),
						eq(tableAuthUser.type, 'wali_murid')
					)
				})
			: null;
		if (!user) return fail(404, { fail: 'Akun wali tidak ditemukan.' });
		await db.transaction(async (tx) => {
			await tx.delete(tableAuthSession).where(eq(tableAuthSession.userId, id));
			await tx.delete(tableAuthUser).where(eq(tableAuthUser.id, id));
		});
		await writeAuditLog({
			locals,
			request,
			action: 'delete',
			entityType: 'portal_wali',
			entityId: id,
			summary: `Akun wali ${user.username} dihapus.`,
			before: { username: user.username }
		});
		return { message: 'Akun wali berhasil dihapus.' };
	}
};
