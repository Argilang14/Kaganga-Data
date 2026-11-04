import db, { databaseUrl } from './index';
import path from 'node:path';
import { getUserRoles } from '../../user-role';
import { createConsistentDatabaseBackup } from './database-safety';
let pending: Promise<void> | null = null;
export function resetUserRolesSchema() {
	pending = null;
}
export function ensureUserRolesSchema() {
	return (pending ??= migrate().catch((error) => {
		pending = null;
		throw error;
	}));
}
async function migrate() {
	const columns = await db.$client.execute('PRAGMA table_info(auth_user)');
	const hasRoles = columns.rows.some((column) => column.name === 'roles');
	const users = await db.$client.execute(`SELECT u.id,u.type,u.jabatan_akses,
 EXISTS(SELECT 1 FROM auth_user_mata_pelajaran am WHERE am.auth_user_id=u.id) OR u.mata_pelajaran_id IS NOT NULL
 OR EXISTS(SELECT 1 FROM kelas k WHERE k.wali_kelas_id=u.pegawai_id AND k.sekolah_id=u.sekolah_id) AS teaching
 FROM auth_user u ${hasRoles ? 'WHERE u.roles IS NULL' : ''}`);
	if (hasRoles && !users.rows.length) return;
	if (databaseUrl.startsWith('file:'))
		await createConsistentDatabaseBackup({
			client: db.$client,
			databasePath: path.resolve(databaseUrl.slice(5)),
			label: 'roles-pengguna'
		});
	const tx = await db.$client.transaction('write');
	try {
		if (!hasRoles) await tx.execute('ALTER TABLE auth_user ADD COLUMN roles TEXT');
		for (const row of users.rows) {
			const roles = getUserRoles({
				type: row.jabatan_akses && !row.teaching ? null : String(row.type),
				jabatanAkses: row.jabatan_akses as string | null
			});
			if (!roles.length) throw new Error(`Role akun ${row.id} tidak dikenal; pemetaan dihentikan.`);
			await tx.execute({
				sql: 'UPDATE auth_user SET roles=?,jabatan_akses=NULL WHERE id=? AND roles IS NULL',
				args: [JSON.stringify(roles), row.id!]
			});
		}
		await tx.commit();
	} catch (error) {
		await tx.rollback();
		throw error;
	} finally {
		tx.close();
	}
}
