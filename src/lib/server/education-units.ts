import db from '$lib/server/db';
import { error } from '@sveltejs/kit';
import { ensureEducationUnitsSchema } from './db/ensure-education-units';
import {
	resolveEducationIdentity,
	isIntegratedSchool,
	type EducationIdentity
} from '$lib/education-unit';

export async function getClassEducationIdentity(
	sekolahId: number,
	kelasId: number
): Promise<EducationIdentity> {
	await ensureEducationUnitsSchema();
	const result = await db.$client.execute({
		sql: `SELECT k.nama AS kelas, s.nama, s.npsn, s.jenjang_pendidikan AS jenjangPendidikan, s.jenjang_variant AS jenjangVariant,
			u.id AS satuanId, u.jenjang, m.nama_snapshot AS namaSnapshot, m.npsn_snapshot AS npsnSnapshot
			FROM kelas k JOIN sekolah s ON s.id=k.sekolah_id
			LEFT JOIN kelas_satuan_pendidikan m ON m.kelas_id=k.id
			LEFT JOIN sekolah_satuan_pendidikan u ON u.id=m.satuan_id AND u.sekolah_id=s.id
			WHERE k.id=? AND k.sekolah_id=?`,
		args: [kelasId, sekolahId]
	});
	const row = result.rows[0];
	if (!row) throw error(404, 'Kelas tidak ditemukan pada sekolah aktif.');
	try {
		return resolveEducationIdentity(
			{
				nama: String(row.nama),
				npsn: String(row.npsn),
				jenjangPendidikan: String(row.jenjangPendidikan),
				jenjangVariant: row.jenjangVariant == null ? null : String(row.jenjangVariant)
			},
			row.satuanId == null
				? null
				: {
						satuanId: Number(row.satuanId),
						nama: String(row.namaSnapshot),
						npsn: String(row.npsnSnapshot),
						jenjang: String(row.jenjang)
					},
			String(row.kelas)
		);
	} catch (cause) {
		throw error(
			409,
			cause instanceof Error ? cause.message : 'Pemetaan satuan pendidikan belum lengkap.'
		);
	}
}

export async function getStudentEducationIdentity(sekolahId: number, muridId: number) {
	const result = await db.$client.execute({
		sql: 'SELECT kelas_id FROM murid WHERE id=? AND sekolah_id=?',
		args: [muridId, sekolahId]
	});
	const row = result.rows[0];
	if (!row) throw error(404, 'Murid tidak ditemukan pada sekolah aktif.');
	return getClassEducationIdentity(sekolahId, Number(row.kelas_id));
}

export function commonSchoolIdentity<
	T extends { npsn: string; jenjangPendidikan: string; jenjangVariant?: string | null }
>(school: T): T {
	return isIntegratedSchool(school) ? { ...school, npsn: '' } : school;
}

export async function getDocumentEducationIdentity(
	school: Sekolah | Omit<Sekolah, 'logo'>,
	options: { kelasId?: number | null; jenjang?: string | null } = {}
) {
	if (options.kelasId) return getClassEducationIdentity(school.id, options.kelasId);
	const level = (
		{ srd: 'sd', srmp: 'smp', srma: 'sma', sd: 'sd', smp: 'smp', sma: 'sma' } as Record<
			string,
			string
		>
	)[options.jenjang || ''];
	if (isIntegratedSchool(school) && level) {
		await ensureEducationUnitsSchema();
		const result = await db.$client.execute({
			sql: 'SELECT id,nama,npsn,jenjang FROM sekolah_satuan_pendidikan WHERE sekolah_id=? AND jenjang=?',
			args: [school.id, level]
		});
		const row = result.rows[0];
		if (!row)
			throw error(409, `Identitas satuan ${level.toUpperCase()} belum diisi di Data Sekolah.`);
		return {
			nama: String(row.nama),
			npsn: String(row.npsn),
			jenjang: String(row.jenjang),
			satuanId: Number(row.id)
		};
	}
	return {
		nama: school.nama,
		npsn: commonSchoolIdentity(school).npsn,
		jenjang: school.jenjangPendidikan,
		satuanId: null
	};
}

export async function assertSingleSchoolDapodikWrite(sekolahId: number) {
	const school = (
		await db.$client.execute({
			sql: 'SELECT jenjang_pendidikan,jenjang_variant FROM sekolah WHERE id=?',
			args: [sekolahId]
		})
	).rows[0];
	if (school?.jenjang_pendidikan === 'srt' || school?.jenjang_variant === 'srt')
		throw error(
			409,
			'Dapodik sekolah terintegrasi saat ini hanya mendukung konfigurasi dan pratinjau per satuan. Penerapan data dan pengiriman nilai belum diaktifkan.'
		);
}
