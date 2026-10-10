import db from '$lib/server/db';
import { fail, error } from '@sveltejs/kit';
import { authority } from '../../../pengguna/utils.server';
import { ensureEducationUnitsSchema } from '$lib/server/db/ensure-education-units';
import { ensureDataGovernanceSchema } from '$lib/server/db/ensure-data-governance';
import { writeAuditLog } from '$lib/server/audit-log';
import {
	isIntegratedSchool,
	suggestedEducationLevel,
	validateEducationUnit
} from '$lib/education-unit';
import type { Actions, PageServerLoad } from './$types';
import { sql } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals, url }) => {
	authority('sekolah_manage');
	const school = locals.sekolah;
	if (!school) throw error(400, 'Pilih sekolah aktif.');
	await ensureEducationUnitsSchema();
	const units = await db.$client.execute({
		sql: `SELECT id,jenjang,nama,npsn FROM sekolah_satuan_pendidikan WHERE sekolah_id=? ORDER BY CASE jenjang WHEN 'sd' THEN 1 WHEN 'smp' THEN 2 ELSE 3 END`,
		args: [school.id]
	});
	const periods = await db.$client.execute({
		sql: `SELECT se.id, ta.nama || ' - ' || se.nama AS nama FROM semester se JOIN tahun_ajaran ta ON ta.id=se.tahun_ajaran_id WHERE ta.sekolah_id=? ORDER BY ta.is_aktif DESC,se.is_aktif DESC,se.id DESC`,
		args: [school.id]
	});
	const requested = Number(url.searchParams.get('semester_id'));
	const semesterId = periods.rows.some((row) => Number(row.id) === requested)
		? requested
		: Number(periods.rows[0]?.id || 0);
	const classes = await db.$client.execute({
		sql: `SELECT k.id,k.nama,k.fase,m.satuan_id AS satuanId,m.nama_snapshot AS namaSnapshot,m.npsn_snapshot AS npsnSnapshot FROM kelas k LEFT JOIN kelas_satuan_pendidikan m ON m.kelas_id=k.id WHERE k.sekolah_id=? AND k.semester_id=? ORDER BY k.nama`,
		args: [school.id, semesterId]
	});
	return {
		meta: { title: 'Satuan Pendidikan' },
		integrated: isIntegratedSchool(school),
		units: units.rows.map((row) => ({
			id: Number(row.id),
			jenjang: String(row.jenjang),
			nama: String(row.nama),
			npsn: String(row.npsn)
		})),
		periods: periods.rows.map((row) => ({ id: Number(row.id), nama: String(row.nama) })),
		semesterId,
		classes: classes.rows.map((row) => ({
			id: Number(row.id),
			nama: String(row.nama),
			fase: row.fase == null ? null : String(row.fase),
			satuanId: row.satuanId == null ? null : Number(row.satuanId),
			npsn: row.npsnSnapshot == null ? null : String(row.npsnSnapshot),
			suggestion: suggestedEducationLevel({
				nama: String(row.nama),
				fase: row.fase == null ? null : String(row.fase)
			})
		}))
	};
};

export const actions: Actions = {
	saveUnit: async ({ locals, request }) => {
		authority('sekolah_manage');
		const school = locals.sekolah;
		if (!school || !isIntegratedSchool(school))
			return fail(400, { fail: 'Satuan pendidikan hanya untuk sekolah terintegrasi.' });
		await ensureEducationUnitsSchema();
		await ensureDataGovernanceSchema();
		const form = await request.formData();
		const values = {
			jenjang: String(form.get('jenjang') || ''),
			nama: String(form.get('nama') || '').trim(),
			npsn: String(form.get('npsn') || '').trim()
		};
		const message = validateEducationUnit(values);
		if (message) return fail(400, { fail: message });
		const existing = await db.$client.execute({
			sql: 'SELECT * FROM sekolah_satuan_pendidikan WHERE sekolah_id=? AND jenjang=?',
			args: [school.id, values.jenjang]
		});
		const duplicate = await db.$client.execute({
			sql: 'SELECT id FROM sekolah_satuan_pendidikan WHERE sekolah_id=? AND npsn=? AND jenjang<>?',
			args: [school.id, values.npsn, values.jenjang]
		});
		if (duplicate.rows.length)
			return fail(400, { fail: 'NPSN sudah digunakan jenjang lain pada sekolah ini.' });
		await db.transaction(async (tx) => {
			await tx.run(
				sql`INSERT INTO sekolah_satuan_pendidikan (sekolah_id,jenjang,nama,npsn,created_at) VALUES (${school.id},${values.jenjang},${values.nama},${values.npsn},${new Date().toISOString()}) ON CONFLICT(sekolah_id,jenjang) DO UPDATE SET nama=excluded.nama,npsn=excluded.npsn,updated_at=excluded.created_at`
			);
			await writeAuditLog(
				{
					locals,
					request,
					action: existing.rows.length ? 'update' : 'create',
					entityType: 'sekolah_satuan_pendidikan',
					summary: `Identitas satuan ${values.jenjang.toUpperCase()} disimpan.`,
					before: existing.rows[0] || null,
					after: values
				},
				tx
			);
		});
		return {
			message:
				'Identitas satuan disimpan. Identitas kelas yang sudah dipetakan tetap menggunakan snapshot sebelumnya.'
		};
	},
	mapClasses: async ({ locals, request }) => {
		authority('sekolah_manage');
		const school = locals.sekolah;
		if (!school || !isIntegratedSchool(school))
			return fail(400, { fail: 'Sekolah terintegrasi tidak ditemukan.' });
		await ensureEducationUnitsSchema();
		await ensureDataGovernanceSchema();
		const form = await request.formData();
		if (form.get('confirmed') !== 'on')
			return fail(400, { fail: 'Konfirmasi pemetaan kelas diperlukan.' });
		const semesterId = Number(form.get('semesterId'));
		const classes = await db.$client.execute({
			sql: 'SELECT id FROM kelas WHERE sekolah_id=? AND semester_id=?',
			args: [school.id, semesterId]
		});
		const units = await db.$client.execute({
			sql: 'SELECT id,nama,npsn FROM sekolah_satuan_pendidikan WHERE sekolah_id=?',
			args: [school.id]
		});
		const mappings = classes.rows.map((row) => ({
			kelasId: Number(row.id),
			satuanId: Number(form.get(`kelas_${row.id}`))
		}));
		if (
			!mappings.length ||
			mappings.some((row) => !units.rows.some((unit) => Number(unit.id) === row.satuanId))
		)
			return fail(400, {
				fail: 'Pilih satuan pendidikan yang valid untuk setiap kelas dalam semester ini.'
			});
		const before = await db.$client.execute({
			sql: 'SELECT m.* FROM kelas_satuan_pendidikan m JOIN kelas k ON k.id=m.kelas_id WHERE k.sekolah_id=? AND k.semester_id=?',
			args: [school.id, semesterId]
		});
		await db.transaction(async (tx) => {
			for (const mapping of mappings) {
				const unit = units.rows.find((row) => Number(row.id) === mapping.satuanId)!;
				await tx.run(
					sql`INSERT INTO kelas_satuan_pendidikan (kelas_id,satuan_id,nama_snapshot,npsn_snapshot,created_at) VALUES (${mapping.kelasId},${mapping.satuanId},${String(unit.nama)},${String(unit.npsn)},${new Date().toISOString()}) ON CONFLICT(kelas_id) DO UPDATE SET satuan_id=excluded.satuan_id,nama_snapshot=excluded.nama_snapshot,npsn_snapshot=excluded.npsn_snapshot,updated_at=excluded.created_at`
				);
			}
			await writeAuditLog(
				{
					locals,
					request,
					action: 'update',
					entityType: 'kelas_satuan_pendidikan',
					summary: `${mappings.length} kelas dipetakan ke satuan pendidikan.`,
					before: before.rows,
					after: { semesterId, mappings }
				},
				tx
			);
		});
		return { message: 'Pemetaan kelas disimpan tanpa mengubah murid atau QR.' };
	}
};
