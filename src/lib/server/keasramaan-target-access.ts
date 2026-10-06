import db from './db';
import { error } from '@sveltejs/kit';
import { canAccessExportClass } from './class-export-access';
import { guardianStudentCondition } from './assignment-summary';
import { tableMurid } from './db/schema';
import { and, eq, inArray } from 'drizzle-orm';

export async function assertKeasramaanTargets(user: App.Locals['user'], sekolahId: number, path: string, values: URLSearchParams | FormData) {
	if (user?.type === 'admin') return;
	const targets: Array<[string, string]> = [
		['keasramaanId', 'SELECT kelas_id FROM keasramaan WHERE id=?'],
		['mataEvaluasiId', 'SELECT kelas_id FROM keasramaan WHERE id=?'],
		['indikatorId', 'SELECT k.kelas_id FROM keasramaan_indikator i JOIN keasramaan k ON k.id=i.keasramaan_id WHERE i.id=?']
	];
	if (path === '/keasramaan/mata-evaluasi') targets.push(['id', 'SELECT kelas_id FROM keasramaan WHERE id=?']);
	if (path === '/keasramaan/tp') {
		const query = 'SELECT k.kelas_id FROM keasramaan_tujuan t JOIN keasramaan_indikator i ON i.id=t.indikator_id JOIN keasramaan k ON k.id=i.keasramaan_id WHERE t.id=?';
		targets.push(['id', query], ['ids', query]);
	}
	for (const [key, query] of targets) {
		for (const value of values.getAll(key)) {
			const id = Number(value);
			if (!Number.isSafeInteger(id) || id <= 0) throw error(400, 'ID tidak valid.');
			const row = (await db.$client.execute({ sql: query, args: [id] })).rows[0];
			if (!row || !(await canAccessExportClass(user, sekolahId, Number(row.kelas_id)))) throw error(403, 'Data keasramaan di luar penugasan.');
		}
	}
	for (const key of ['muridId', 'murid_id']) {
		for (const value of values.getAll(key)) {
			const id = Number(value);
			if (!Number.isSafeInteger(id) || id <= 0) throw error(400, 'ID murid tidak valid.');
			const murid = await db.query.tableMurid.findFirst({ columns: { kelasId: true },
				where: and(eq(tableMurid.id, id), eq(tableMurid.sekolahId, sekolahId), await guardianStudentCondition(user, sekolahId)) });
			if (!murid || !(await canAccessExportClass(user, sekolahId, murid.kelasId))) throw error(403, 'Murid di luar penugasan.');
		}
	}
	const bulk = values.get('muridIds');
	if (typeof bulk === 'string') {
		let parsed: unknown;
		try { parsed = JSON.parse(bulk); } catch { throw error(400, 'Daftar murid tidak valid.'); }
		if (!Array.isArray(parsed) || parsed.some(id => !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) throw error(400, 'Daftar murid tidak valid.');
		const ids = [...new Set(parsed.map(Number))];
		if (!ids.length) return;
		const rows = await db.query.tableMurid.findMany({ columns: { id: true, kelasId: true },
			where: and(inArray(tableMurid.id, ids), eq(tableMurid.sekolahId, sekolahId), await guardianStudentCondition(user, sekolahId)) });
		if (rows.length !== ids.length) throw error(403, 'Daftar berisi murid di luar penugasan.');
		for (const kelasId of new Set(rows.map(row => row.kelasId))) {
			if (!(await canAccessExportClass(user, sekolahId, kelasId))) throw error(403, 'Kelas di luar penugasan.');
		}
	}
}
