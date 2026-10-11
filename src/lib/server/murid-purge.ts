import { createHash } from 'node:crypto';
import db from '$lib/server/db';
import { tableMurid, tableMuridLifecycle, tableMuridRiwayatKelas } from '$lib/server/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getMuridIdentityMembers } from './murid-identity-service';
import { identityIntegrityProblem, MuridIdentityConflictError } from './murid-identity-integrity';
import { muridPurgeProblem } from './murid-purge-policy';

type Reader = typeof db | DBTransaction;
type ForeignKey = { table: string; from: string; to: string; on_delete: string };
const identifier = (value: string) => {
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value))
		throw new Error('Nama tabel tidak didukung untuk pemeriksaan penghapusan.');
	return sql.raw(`"${value}"`);
};

export async function loadMuridPurgePlan(reader: Reader, sekolahId: number, lifecycleId: number) {
	const row = await reader.query.tableMuridLifecycle.findFirst({
		where: and(
			eq(tableMuridLifecycle.id, lifecycleId),
			eq(tableMuridLifecycle.sekolahId, sekolahId)
		)
	});
	if (!row) throw new MuridIdentityConflictError('Arsip murid tidak ditemukan.');
	const problem = muridPurgeProblem(row);
	if (problem) throw new MuridIdentityConflictError(problem);
	const members = row.identityKey.startsWith('uid:')
		? await getMuridIdentityMembers(reader, sekolahId, row.identityKey.slice(4))
		: [];
	members.sort((a, b) => a.id - b.id);
	if (row.identityKey.startsWith('uid:')) {
		const integrity = identityIntegrityProblem(members, sekolahId, row.lastMuridId ?? undefined);
		if (integrity) throw new MuridIdentityConflictError(integrity);
	}
	const ids = members.map((member) => member.id).sort((a, b) => a - b);
	const histories = await reader
		.select()
		.from(tableMuridRiwayatKelas)
		.where(
			and(
				eq(tableMuridRiwayatKelas.sekolahId, sekolahId),
				eq(tableMuridRiwayatKelas.identityKey, row.identityKey)
			)
		);
	histories.sort((a, b) => a.id - b.id);
	if (histories.some((history) => history.muridId && !ids.includes(history.muridId)))
		throw new MuridIdentityConflictError(
			'Riwayat arsip masih terkait murid lain. Penghapusan diblokir.'
		);
	const reviews = await reader.all<{ identity_uid: string; legacy_keys: string }>(sql`
		SELECT identity_uid,legacy_keys FROM murid_identity_review WHERE sekolah_id=${sekolahId} AND resolved_at IS NULL`);
	for (const review of reviews) {
		let keys: unknown;
		try {
			keys = JSON.parse(review.legacy_keys);
		} catch {
			throw new MuridIdentityConflictError('Bukti pemeriksaan identitas tidak valid.');
		}
		if (
			`uid:${review.identity_uid}` === row.identityKey ||
			(Array.isArray(keys) && keys.includes(row.identityKey))
		)
			throw new MuridIdentityConflictError(
				'Arsip masih diperlukan untuk pemeriksaan identitas yang belum selesai.'
			);
	}
	const tables = await reader.all<{ name: string }>(
		sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
	);
	const tableNames = new Set(tables.map((table) => table.name));
	const blockers: string[] = [];
	const dependencies: { table: string; count: number; effect: 'hapus' | 'dipertahankan' }[] = [];
	const digest = createHash('sha256').update(JSON.stringify({ row, members, histories }));
	if (ids.length) {
		const idList = sql.join(
			ids.map((id) => sql`${id}`),
			sql`, `
		);
		for (const table of tables) {
			const columns = await reader.all<{ name: string }>(
				sql`PRAGMA table_info(${identifier(table.name)})`
			);
			const foreignKeys = await reader.all<ForeignKey>(
				sql`PRAGMA foreign_key_list(${identifier(table.name)})`
			);
			const studentKeys = foreignKeys.filter((key) => key.table === 'murid' && key.to === 'id');
			if (!studentKeys.length && columns.some((column) => column.name === 'murid_id')) {
				const existing = await reader.all(
					sql`SELECT 1 FROM ${identifier(table.name)} WHERE murid_id IN (${idList}) LIMIT 1`
				);
				if (existing.length)
					blockers.push(`Relasi ${table.name} belum memiliki pengaman database.`);
			}
			for (const key of studentKeys) {
				const records = await reader.all<Record<string, unknown>>(
					sql`SELECT * FROM ${identifier(table.name)} WHERE ${identifier(key.from)} IN (${idList}) ORDER BY rowid`
				);
				if (!records.length) continue;
				digest.update(JSON.stringify({ table: table.name, column: key.from, records }));
				if (records.some((record) => 'sekolah_id' in record && record.sekolah_id !== sekolahId))
					blockers.push(`Relasi ${table.name} tidak konsisten dengan sekolah aktif.`);
				const deletedCount =
					key.on_delete === 'CASCADE'
						? records.length
						: table.name === 'murid_riwayat_kelas'
							? records.filter((record) => record.identity_key === row.identityKey).length
							: table.name === 'murid_lifecycle'
								? records.filter((record) => record.id === row.id).length
								: 0;
				if (deletedCount)
					dependencies.push({ table: table.name, count: deletedCount, effect: 'hapus' });
				if (records.length > deletedCount)
					dependencies.push({
						table: table.name,
						count: records.length - deletedCount,
						effect: 'dipertahankan'
					});
				if (!['CASCADE', 'SET NULL'].includes(key.on_delete))
					blockers.push(`Relasi ${table.name} tidak mendukung penghapusan aman.`);
			}
		}
		if (tableNames.has('document_attachment')) {
			const attachments = await reader.all(
				sql`SELECT id FROM document_attachment WHERE sekolah_id=${sekolahId} AND entity_type='murid' AND entity_id IN (${sql.join(
					ids.map((id) => sql`${String(id)}`),
					sql`, `
				)})`
			);
			if (attachments.length)
				blockers.push(
					`${attachments.length} lampiran murid masih terdaftar. Kelola berkas tersebut terlebih dahulu.`
				);
		}
		if (tableNames.has('martikulasi_hasil')) {
			const issued = await reader.all(
				sql`SELECT id FROM martikulasi_hasil WHERE murid_id IN (${idList}) AND (trim(coalesce(nomor_sttm,''))<>'' OR trim(coalesce(tanggal_sttm,''))<>'')`
			);
			if (issued.length)
				blockers.push(
					'Murid memiliki STTM terbit; arsip resmi tidak boleh dihapus melalui tindakan ini.'
				);
		}
	}
	const fingerprint = digest.update(JSON.stringify(blockers)).digest('hex');
	return {
		lifecycleId: row.id,
		identityKey: row.identityKey,
		nama: row.namaSnapshot,
		nis: row.nis,
		ids,
		periods: members.length,
		historyCount: histories.length,
		dependencies,
		blockers: [...new Set(blockers)],
		fingerprint
	};
}

export async function deleteMuridPermanently(
	tx: DBTransaction,
	sekolahId: number,
	plan: Awaited<ReturnType<typeof loadMuridPurgePlan>>
) {
	const foreignKeys = await tx.all<{ foreign_keys: number }>(sql`PRAGMA foreign_keys`);
	if (foreignKeys[0]?.foreign_keys !== 1)
		throw new MuridIdentityConflictError(
			'Pengaman relasi SQLite tidak aktif; penghapusan dibatalkan.'
		);
	if (plan.blockers.length) throw new MuridIdentityConflictError(plan.blockers.join(' '));
	await tx
		.delete(tableMuridRiwayatKelas)
		.where(
			and(
				eq(tableMuridRiwayatKelas.sekolahId, sekolahId),
				eq(tableMuridRiwayatKelas.identityKey, plan.identityKey)
			)
		);
	await tx
		.delete(tableMuridLifecycle)
		.where(
			and(
				eq(tableMuridLifecycle.sekolahId, sekolahId),
				eq(tableMuridLifecycle.id, plan.lifecycleId)
			)
		);
	if (plan.identityKey.startsWith('uid:'))
		await tx.run(
			sql`DELETE FROM murid_identity_review WHERE sekolah_id=${sekolahId} AND identity_uid=${plan.identityKey.slice(4)}`
		);
	if (plan.ids.length)
		await tx
			.delete(tableMurid)
			.where(and(eq(tableMurid.sekolahId, sekolahId), inArray(tableMurid.id, plan.ids)));
	if ((await tx.all(sql`PRAGMA foreign_key_check`)).length)
		throw new MuridIdentityConflictError(
			'Pemeriksaan relasi gagal; seluruh penghapusan dibatalkan.'
		);
}
