import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import db from '$lib/server/db';
import { ensureProductionOperationsSchema } from '$lib/server/db/ensure-production-operations';
import { redirect } from '@sveltejs/kit';
import { authority } from '../pengguna/utils.server';

export async function load({ locals }) {
	authority('notifikasi_lihat');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw redirect(303, '/login');
	await ensureProductionOperationsSchema();
	const academic = await resolveSekolahAcademicContext(sekolahId);
	const semesterId = academic?.activeSemesterId ?? -1;
	const tahunAjaranId = academic?.activeTahunAjaranId ?? -1;
	const [attendance, scores, dorm, jp, documents] = await Promise.all([
		db.$client.execute({
			sql: `select m.id, m.nama, k.nama as kelas, sum(case when a.status='alfa' then 1 else 0 end) as alfa, sum(case when a.status='terlambat' then 1 else 0 end) as terlambat from absensi_harian a join murid m on m.id=a.murid_id left join kelas k on k.id=m.kelas_id where a.sekolah_id=? and a.semester_id=? and a.tanggal >= date('now','-30 day') and a.status in ('alfa','terlambat') group by m.id,m.nama,k.nama having count(*)>=3 order by count(*) desc,m.nama limit 100`,
			args: [sekolahId, semesterId]
		}),
		db.$client.execute({
			sql: `select m.id, m.nama, k.nama as kelas, mp.nama as mata_pelajaran, round(a.nilai_akhir_rts,1) as nilai_awal, round(a.nilai_akhir,1) as nilai_akhir from asesmen_sumatif a join murid m on m.id=a.murid_id left join kelas k on k.id=m.kelas_id left join mata_pelajaran mp on mp.id=a.mata_pelajaran_id where m.sekolah_id=? and m.semester_id=? and a.nilai_akhir_rts is not null and a.nilai_akhir is not null and a.nilai_akhir <= a.nilai_akhir_rts-5 order by (a.nilai_akhir_rts-a.nilai_akhir) desc limit 100`,
			args: [sekolahId, semesterId]
		}),
		db.$client.execute({
			sql: `select m.id,m.nama,k.nama as kelas from murid m left join kelas k on k.id=m.kelas_id where m.sekolah_id=? and m.semester_id=? and not exists(select 1 from asesmen_keasramaan a where a.murid_id=m.id) order by k.nama,m.nama limit 200`,
			args: [sekolahId, semesterId]
		}),
		db.$client.execute({
			sql: `select k.nama as kelas, jm.kode, jm.nama as mata_pelajaran, target.jenis, target.jp_per_minggu as target_jp, (select count(*) from jadwal_pelajaran lesson join jadwal_template template on template.id=lesson.template_id where lesson.sekolah_id=target.sekolah_id and template.tahun_ajaran_id=target.tahun_ajaran_id and template.jenis=target.jenis and lesson.kelas_id=target.kelas_id and lesson.jadwal_mapel_id=target.jadwal_mapel_id and lesson.tipe='pelajaran') as terisi_jp from jadwal_target_jp target join kelas k on k.id=target.kelas_id join jadwal_mata_pelajaran jm on jm.id=target.jadwal_mapel_id where target.sekolah_id=? and target.tahun_ajaran_id=? and target.jp_per_minggu > (select count(*) from jadwal_pelajaran lesson join jadwal_template template on template.id=lesson.template_id where lesson.sekolah_id=target.sekolah_id and template.tahun_ajaran_id=target.tahun_ajaran_id and template.jenis=target.jenis and lesson.kelas_id=target.kelas_id and lesson.jadwal_mapel_id=target.jadwal_mapel_id and lesson.tipe='pelajaran') order by k.nama,jm.kode limit 200`,
			args: [sekolahId, tahunAjaranId]
		}),
		db.$client.execute({
			sql: `select id,entity_type,entity_label_snapshot,category,original_name,expires_at from document_attachment where sekolah_id=? and expires_at is not null and date(expires_at) between date('now') and date('now','+30 day') order by expires_at limit 100`,
			args: [sekolahId]
		})
	]);
	return {
		meta: { title: 'Analisis dan Peringatan Dini' } satisfies PageMeta,
		attendance: attendance.rows,
		scores: scores.rows,
		dorm: dorm.rows,
		jp: jp.rows,
		documents: documents.rows,
		generatedAt: new Date().toISOString()
	};
}
