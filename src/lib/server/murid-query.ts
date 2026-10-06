import { sql } from 'drizzle-orm';
import { tableMurid } from '$lib/server/db/schema';

export function activeMuridFilter() {
	return sql`NOT EXISTS (
		SELECT 1 FROM murid_identity_link mi
		JOIN murid_lifecycle ml ON ml.sekolah_id=mi.sekolah_id AND ml.identity_key='uid:' || mi.identity_uid
		WHERE mi.murid_id=${tableMurid.id} AND mi.sekolah_id=${tableMurid.sekolahId}
		AND (ml.status<>'aktif' OR ml.needs_identity_review=1)
	)`;
}

export function archivedMuridFilter() {
	return sql`NOT (${activeMuridFilter()})`;
}
export function activeMuridSql(alias: string) {
	if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias)) throw new Error('Invalid student table alias');
	return `NOT EXISTS (SELECT 1 FROM murid_identity_link mi JOIN murid_lifecycle ml ON ml.sekolah_id=mi.sekolah_id AND ml.identity_key='uid:' || mi.identity_uid WHERE mi.murid_id=${alias}.id AND mi.sekolah_id=${alias}.sekolah_id AND (ml.status<>'aktif' OR ml.needs_identity_review=1))`;
}
