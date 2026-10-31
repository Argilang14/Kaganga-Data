import { sql } from 'drizzle-orm';
import { tableMurid } from './db/schema';
import { dormToday } from '$lib/dormitory';

// Membership follows the persistent identity, never a semester-specific class or NISN.
export function dormMembershipCondition(school: number, room: number, date = dormToday()) {
	return sql`EXISTS (SELECT 1 FROM murid_identity_link di JOIN asrama_penempatan dp
	 ON dp.identity_uid=di.identity_uid AND dp.sekolah_id=di.sekolah_id
	 WHERE di.murid_id=${tableMurid.id} AND di.sekolah_id=${school} AND dp.kamar_id=${room}
	 AND dp.mulai<=${date} AND (dp.selesai IS NULL OR dp.selesai>${date}))`;
}
export function dormGuardianCondition(school: number, employee: number, legacyName: string | null) {
	const today = dormToday();
	return sql`EXISTS(SELECT 1 FROM murid_identity_link di WHERE di.murid_id=${tableMurid.id}
	 AND di.sekolah_id=${school} AND (
	 EXISTS(SELECT 1 FROM asrama_penempatan dp JOIN asrama_penugasan dw ON dw.kamar_id=dp.kamar_id
	 AND dw.sekolah_id=dp.sekolah_id JOIN pegawai de ON de.id=dw.pegawai_id
	 WHERE dp.identity_uid=di.identity_uid AND dp.sekolah_id=${school}
	 AND dp.mulai<=${today} AND (dp.selesai IS NULL OR dp.selesai>${today})
	 AND dw.pegawai_id=${employee} AND de.status='aktif' AND dw.mulai<=${today} AND dw.selesai IS NULL)
	 OR (NOT EXISTS(SELECT 1 FROM asrama_penempatan dp WHERE dp.identity_uid=di.identity_uid
	 AND dp.sekolah_id=${school})
	 AND ${legacyName !== null} AND lower(trim(${tableMurid.waliAsramaNama}))=${legacyName ?? ''})))`;
}
