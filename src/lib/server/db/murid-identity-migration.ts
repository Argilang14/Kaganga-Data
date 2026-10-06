import type { Client, Transaction } from '@libsql/client';
import { randomUUID } from 'node:crypto';
import { normalizedIdentityText, muridIdentityKey } from '../murid-identity.ts';
import { createConsistentDatabaseBackup } from './database-safety.ts';

type Student = {
	id: number;
	sekolah_id: number;
	semester_id: number;
	nis: string;
	nisn: string;
	nama: string;
	tanggal_lahir: string;
	identity_uid?: string;
};
type Legacy = {
	id: number;
	sekolah_id: number;
	identity_key: string;
	nis: string;
	nisn: string;
	nama_snapshot: string;
	status: string;
	tanggal_status: string | null;
	alasan: string | null;
	last_murid_id: number | null;
	needs_identity_review?: number;
};
type History = { murid_id: number | null; status_snapshot: string; identity_key: string };
type Evidence = { sekolahId: number; identityKey: string; nis: string; nama: string; id: number };
type Group = {
	uid: string;
	rows: Student[];
	legacy: Legacy[];
	status: string;
	review: boolean;
	reason: string;
	legacyKeys: string[];
};
const legacyKey = (row: { nis: string; nisn?: string | null }) =>
	row.nisn?.trim()
		? `nisn:${normalizedIdentityText(row.nisn)}`
		: `nis:${normalizedIdentityText(row.nis)}`;
const personKey = (row: Student) =>
	JSON.stringify([
		row.sekolah_id,
		normalizedIdentityText(row.nis),
		normalizedIdentityText(row.nama),
		row.tanggal_lahir
	]);

export async function auditMuridIdentity(client: Client | Transaction) {
	const tables = new Set(
		(await client.execute("SELECT name FROM sqlite_master WHERE type='table'")).rows.map((r) =>
			String(r.name)
		)
	);
	const rows = (
		await client.execute(
			`SELECT id,sekolah_id,semester_id,nis,nisn,nama,tanggal_lahir FROM murid ORDER BY id`
		)
	).rows as unknown as Student[];
	const links = tables.has('murid_identity_link')
		? (await client.execute('SELECT murid_id,identity_uid FROM murid_identity_link')).rows
		: [];
	const linked = new Map(links.map((r) => [Number(r.murid_id), String(r.identity_uid)]));
	const legacy = tables.has('murid_lifecycle')
		? ((await client.execute('SELECT * FROM murid_lifecycle')).rows as unknown as Legacy[])
		: [];
	const histories = tables.has('murid_riwayat_kelas')
		? ((
				await client.execute(
					'SELECT murid_id,status_snapshot,identity_key FROM murid_riwayat_kelas'
				)
			).rows as unknown as History[])
		: [];
	const evidence: Evidence[] = [];
	if (tables.has('audit_log')) {
		const logs = await client.execute(
			"SELECT sekolah_id,before_data FROM audit_log WHERE entity_type='murid' AND action='delete' AND before_data IS NOT NULL"
		);
		for (const log of logs.rows) {
			try {
				const parsed = JSON.parse(String(log.before_data));
				for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
					if (!item || !Number.isInteger(Number(item.id)) || !item.nis || !item.nama) continue;
					evidence.push({
						sekolahId: Number(log.sekolah_id),
						identityKey: legacyKey(item),
						nis: normalizedIdentityText(item.nis),
						nama: normalizedIdentityText(item.nama),
						id: Number(item.id)
					});
				}
			} catch {
				/* Malformed audit data is not proof of a deletion. */
			}
		}
	}
	const buckets = new Map<string, Student[]>();
	for (const row of rows) {
		const key = personKey(row);
		const bucket = buckets.get(key) ?? [];
		bucket.push(row);
		buckets.set(key, bucket);
	}
	const groups: Group[] = [];
	for (const bucket of buckets.values()) {
		const consistent =
			normalizedIdentityText(bucket[0].nis) &&
			new Set(bucket.map((r) => r.semester_id)).size === bucket.length;
		for (const students of consistent ? [bucket] : bucket.map((r) => [r])) {
			const uids = [...new Set(students.map((r) => linked.get(r.id)).filter(Boolean))] as string[];
			// Never merge previously assigned identities through a mutable national number.
			if (uids.length > 1) {
				for (const row of students)
					groups.push({
						uid: linked.get(row.id) || randomUUID(),
						rows: [row],
						legacy: [],
						legacyKeys: [],
						status: 'aktif',
						review: false,
						reason: ''
					});
				continue;
			}
			groups.push({
				uid: uids[0] || randomUUID(),
				rows: students,
				legacy: [],
				legacyKeys: [],
				status: 'aktif',
				review: false,
				reason: ''
			});
		}
	}
	const keyGroups = new Map<string, Group[]>();
	for (const group of groups) {
		group.legacyKeys = [...new Set(group.rows.map(legacyKey))];
		for (const key of group.legacyKeys) {
			const scoped = `${group.rows[0].sekolah_id}|${key}`;
			keyGroups.set(scoped, [...(keyGroups.get(scoped) ?? []), group]);
		}
	}
	for (const group of groups) {
		const row = group.rows[0];
		const stable = legacy.find(
			(l) =>
				l.sekolah_id === row.sekolah_id &&
				l.identity_key === muridIdentityKey({ identityUid: group.uid })
		);
		if (stable) {
			group.status = stable.status;
			group.review = Boolean(stable.needs_identity_review);
			group.reason = group.review ? stable.alasan || 'Menunggu pemeriksaan identitas.' : '';
			continue;
		}
		group.legacy = legacy.filter(
			(l) => l.sekolah_id === row.sekolah_id && group.legacyKeys.includes(l.identity_key)
		);
		const nonActive = group.legacy.filter((l) => l.status !== 'aktif');
		if (!nonActive.length) continue;
		const ownHistory = histories.filter((h) => group.rows.some((r) => r.id === h.murid_id));
		const decisions = nonActive.map((old) => {
			const sharing = keyGroups.get(`${row.sekolah_id}|${old.identity_key}`) ?? [];
			const ownSnapshot =
				normalizedIdentityText(old.nis) === normalizedIdentityText(row.nis) &&
				normalizedIdentityText(old.nama_snapshot) === normalizedIdentityText(row.nama);
			const deletions = evidence.filter(
				(e) => e.sekolahId === row.sekolah_id && e.identityKey === old.identity_key
			);
			const ownDeletion = deletions.some(
				(e) =>
					e.nis === normalizedIdentityText(row.nis) && e.nama === normalizedIdentityText(row.nama)
			);
			const terminalHistory = ownHistory.some((h) => h.status_snapshot !== 'aktif');
			if (ownDeletion || terminalHistory || (sharing.length === 1 && ownSnapshot))
				return old.status;
			if (
				!ownSnapshot &&
				deletions.length &&
				ownHistory.length === group.rows.length &&
				ownHistory.every((h) => h.status_snapshot === 'aktif')
			)
				return 'aktif';
			return 'review';
		});
		group.review =
			decisions.includes('review') || new Set(decisions.filter((s) => s !== 'review')).size > 1;
		group.status = group.review ? nonActive[0].status : decisions[0];
		group.reason = group.review
			? 'Status lama memakai identitas bersama; bukti belum cukup untuk pemulihan otomatis.'
			: group.status === 'aktif'
				? 'Dipisahkan dari penghapusan murid lain berdasarkan audit dan riwayat aktif.'
				: '';
	}
	return {
		groups,
		totalRows: rows.length,
		reviewGroups: groups.filter((g) => g.review).length,
		recoverableGroups: groups.filter((g) => g.reason && !g.review).length
	};
}

export async function migrateMuridIdentity(
	client: Client,
	options: { databasePath?: string; backup?: boolean } = {}
) {
	const exists = (
		await client.execute(
			"SELECT 1 FROM sqlite_master WHERE type='table' AND name='murid_identity_migration'"
		)
	).rows.length;
	if (
		exists &&
		(await client.execute('SELECT 1 FROM murid_identity_migration WHERE version=1')).rows.length
	)
		return { migrated: false };
	if (options.backup !== false && !options.databasePath)
		throw new Error('Backup database diperlukan sebelum migrasi identitas murid.');
	const backupPath =
		options.backup !== false && options.databasePath
			? await createConsistentDatabaseBackup({
					client,
					databasePath: options.databasePath,
					label: 'pre-murid-identity-v2'
				})
			: null;
	const tx = await client.transaction('write');
	try {
		await tx.execute(
			'CREATE TABLE IF NOT EXISTS murid_identity_migration (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL, backup_path TEXT)'
		);
		if ((await tx.execute('SELECT 1 FROM murid_identity_migration WHERE version=1')).rows.length) {
			await tx.rollback();
			return { migrated: false };
		}
		await tx.execute(`CREATE TABLE IF NOT EXISTS murid_identity_link (
			murid_id INTEGER PRIMARY KEY REFERENCES murid(id) ON DELETE CASCADE,
			sekolah_id INTEGER NOT NULL REFERENCES sekolah(id) ON DELETE CASCADE,
			semester_id INTEGER NOT NULL REFERENCES semester(id) ON DELETE CASCADE,
			identity_uid TEXT NOT NULL,
			UNIQUE(sekolah_id,semester_id,identity_uid)
		)`);
		await tx.execute(
			'CREATE INDEX IF NOT EXISTS murid_identity_link_identity_idx ON murid_identity_link(sekolah_id,identity_uid)'
		);
		const columns = (await tx.execute('PRAGMA table_info(murid_lifecycle)')).rows;
		if (!columns.some((r) => r.name === 'needs_identity_review'))
			await tx.execute(
				'ALTER TABLE murid_lifecycle ADD COLUMN needs_identity_review INTEGER NOT NULL DEFAULT 0'
			);
		await tx.execute(`CREATE TABLE IF NOT EXISTS murid_identity_review (
			id INTEGER PRIMARY KEY AUTOINCREMENT, sekolah_id INTEGER NOT NULL,
			identity_uid TEXT NOT NULL, legacy_keys TEXT NOT NULL, reason TEXT NOT NULL,
			evidence TEXT NOT NULL, resolved_at TEXT, UNIQUE(sekolah_id,identity_uid)
		)`);
		const plan = await auditMuridIdentity(tx);
		const now = new Date().toISOString();
		for (const group of plan.groups) {
			const row = group.rows.at(-1)!;
			const key = muridIdentityKey({ identityUid: group.uid });
			for (const student of group.rows)
				await tx.execute({
					sql: 'INSERT INTO murid_identity_link(murid_id,sekolah_id,semester_id,identity_uid) VALUES(?,?,?,?) ON CONFLICT(murid_id) DO NOTHING',
					args: [student.id, student.sekolah_id, student.semester_id, group.uid]
				});
			await tx.execute({
				sql: `INSERT INTO murid_lifecycle(sekolah_id,identity_key,nis,nisn,nama_snapshot,status,last_murid_id,needs_identity_review,created_at,updated_at,tanggal_status,alasan) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(sekolah_id,identity_key) DO NOTHING`,
				args: [
					row.sekolah_id,
					key,
					row.nis,
					row.nisn,
					row.nama,
					group.status,
					row.id,
					Number(group.review),
					now,
					now,
					group.status === 'aktif' ? null : (group.legacy[0]?.tanggal_status ?? null),
					group.reason || group.legacy[0]?.alasan || null
				]
			});
			for (const student of group.rows)
				await tx.execute({
					sql: 'UPDATE murid_riwayat_kelas SET identity_key=? WHERE sekolah_id=? AND murid_id=?',
					args: [key, student.sekolah_id, student.id]
				});
			if (group.review)
				await tx.execute({
					sql: 'INSERT OR IGNORE INTO murid_identity_review(sekolah_id,identity_uid,legacy_keys,reason,evidence) VALUES(?,?,?,?,?)',
					args: [
						row.sekolah_id,
						group.uid,
						JSON.stringify(group.legacyKeys),
						group.reason,
						JSON.stringify({
							muridIds: group.rows.map((r) => r.id),
							legacyIds: group.legacy.map((l) => l.id)
						})
					]
				});
		}
		// Preserve old archive snapshots, but detach them from live rows after splitting.
		await tx.execute(`INSERT OR IGNORE INTO murid_riwayat_kelas(sekolah_id,identity_key,murid_id,tahun_ajaran_id,semester_id,kelas_id,nama_snapshot,nis_snapshot,nisn_snapshot,tahun_ajaran_snapshot,semester_snapshot,kelas_snapshot,fase_snapshot,status_snapshot,recorded_at)
			SELECT m.sekolah_id,'uid:' || mi.identity_uid,m.id,k.tahun_ajaran_id,m.semester_id,m.kelas_id,m.nama,m.nis,m.nisn,ta.nama,s.nama,k.nama,k.fase,ml.status,CURRENT_TIMESTAMP
			FROM murid m JOIN murid_identity_link mi ON mi.murid_id=m.id JOIN murid_lifecycle ml ON ml.sekolah_id=m.sekolah_id AND ml.identity_key='uid:' || mi.identity_uid
			JOIN kelas k ON k.id=m.kelas_id JOIN semester s ON s.id=m.semester_id JOIN tahun_ajaran ta ON ta.id=k.tahun_ajaran_id`);
		await tx.execute(
			"UPDATE murid_lifecycle SET last_murid_id=NULL WHERE identity_key NOT LIKE 'uid:%'"
		);
		await tx.execute({
			sql: 'INSERT INTO murid_identity_migration(version,applied_at,backup_path) VALUES(1,?,?)',
			args: [now, backupPath]
		});
		if ((await tx.execute('PRAGMA foreign_key_check')).rows.length)
			throw new Error('Migrasi identitas menghasilkan pelanggaran foreign key.');
		await tx.commit();
		return {
			migrated: true,
			totalRows: plan.totalRows,
			reviewGroups: plan.reviewGroups,
			recoveredGroups: plan.recoverableGroups,
			backupPath
		};
	} catch (error) {
		await tx.rollback();
		throw error;
	} finally {
		tx.close();
	}
}
