import type { Client } from '@libsql/client';

const migrations = new WeakMap<Client, Promise<void>>();

// Match resolveSekolahAcademicContext, including its fallback when active flags are unset.
const semesterForSchool = (school: string) => `(SELECT s.id FROM semester s
 WHERE s.tahun_ajaran_id=(SELECT t.id FROM tahun_ajaran t WHERE t.sekolah_id=${school}
 ORDER BY t.is_aktif DESC,t.id DESC LIMIT 1) ORDER BY s.is_aktif DESC,s.id ASC LIMIT 1)`;

export function ensureDormitoryPeriod(client: Client) {
	let migration = migrations.get(client);
	if (!migration) {
		migration = migrate(client).catch((cause) => {
			migrations.delete(client);
			throw cause;
		});
		migrations.set(client, migration);
	}
	return migration;
}

async function migrate(client: Client) {
	const tx = await client.transaction('write');
	try {
		const columns = await tx.execute('PRAGMA table_info(asrama)');
		if (!columns.rows.some((column) => column.name === 'semester_id'))
			await tx.execute('ALTER TABLE asrama ADD COLUMN semester_id INTEGER REFERENCES semester(id)');
		const period = semesterForSchool('asrama.sekolah_id');
		// Qualify the existing unique key without rebuilding referenced tables or changing IDs.
		await tx.execute(`UPDATE asrama SET semester_id=${period},
 nama_key='semester:'||${period}||':'||nama_key
 WHERE semester_id IS NULL AND deleted_at IS NULL AND ${period} IS NOT NULL`);
		await tx.execute('CREATE INDEX IF NOT EXISTS asrama_periode ON asrama(sekolah_id,semester_id)');
		await tx.execute(`CREATE TRIGGER IF NOT EXISTS asrama_periode_valid BEFORE INSERT ON asrama
 WHEN NEW.semester_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM semester s JOIN tahun_ajaran t ON t.id=s.tahun_ajaran_id
 WHERE s.id=NEW.semester_id AND t.sekolah_id=NEW.sekolah_id)
 THEN RAISE(ABORT,'asrama_period_scope') END; END`);
		await tx.execute(`CREATE TRIGGER IF NOT EXISTS asrama_periode_locked BEFORE UPDATE OF semester_id ON asrama
 WHEN OLD.semester_id IS NOT NULL AND NEW.semester_id IS NOT OLD.semester_id
 BEGIN SELECT RAISE(ABORT,'asrama_period_locked'); END`);
		// Older importers can omit the period; bind their new record once, never on rollover.
		const newPeriod = semesterForSchool('NEW.sekolah_id');
		await tx.execute(`CREATE TRIGGER IF NOT EXISTS asrama_periode_default AFTER INSERT ON asrama
 WHEN NEW.semester_id IS NULL AND ${newPeriod} IS NOT NULL BEGIN
 UPDATE asrama SET semester_id=${newPeriod},nama_key='semester:'||${newPeriod}||':'||NEW.nama_key
 WHERE id=NEW.id; END`);
		await tx.commit();
	} catch (cause) {
		await tx.rollback();
		throw cause;
	} finally {
		tx.close();
	}
}
