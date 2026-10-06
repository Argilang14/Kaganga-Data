import db from '$lib/server/db';
import { ensureUjianSchema } from '$lib/server/db/ensure-ujian';
import { writeAuditLog } from '$lib/server/audit-log';
import {
	examParticipantNumber,
	isValidExamNpsn,
	nextExamSequence,
	participantsInClassAdditionOrder
} from '$lib/server/ujian-numbering';
import { fail, redirect } from '@sveltejs/kit';
import { authority } from '../pengguna/utils.server';
import type { Actions, PageServerLoad } from './$types';

const text = (form: FormData, key: string, max = 200) =>
	String(form.get(key) ?? '')
		.trim()
		.slice(0, max);
const integer = (form: FormData, key: string) => {
	const value = Number(form.get(key));
	return Number.isInteger(value) && value > 0 ? value : null;
};
const statuses = ['draft', 'aktif', 'selesai'] as const;

async function sessionForSchool(sessionId: number, sekolahId: number) {
	const result = await db.$client.execute({
		sql: `SELECT * FROM ujian_session WHERE id = ? AND sekolah_id = ? LIMIT 1`,
		args: [sessionId, sekolahId]
	});
	return result.rows[0] ?? null;
}

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	authority('ujian_manage');
	await ensureUjianSchema();
	depends('app:ujian');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw redirect(303, '/login');

	const [sessionResult, yearResult] = await Promise.all([
		db.$client.execute({
			sql: `SELECT s.id, s.tahun_ajaran_id AS tahunAjaranId, s.semester_id AS semesterId,
				s.nama, s.singkatan, s.tanggal_ujian AS tanggalUjian,
				s.tanggal_cetak AS tanggalCetak, s.status, ta.nama AS tahunAjaran,
				se.nama AS semester, COUNT(p.id) AS participantCount
			FROM ujian_session s
			JOIN tahun_ajaran ta ON ta.id = s.tahun_ajaran_id
			LEFT JOIN semester se ON se.id = s.semester_id
			LEFT JOIN ujian_peserta p ON p.session_id = s.id
			WHERE s.sekolah_id = ?
			GROUP BY s.id
			ORDER BY s.created_at DESC, s.id DESC`,
			args: [sekolahId]
		}),
		db.$client.execute({
			sql: `SELECT ta.id, ta.nama, ta.is_aktif AS isAktif,
				se.id AS semesterId, se.nama AS semesterNama, se.tipe AS semesterTipe
			FROM tahun_ajaran ta
			LEFT JOIN semester se ON se.tahun_ajaran_id = ta.id
			WHERE ta.sekolah_id = ?
			ORDER BY ta.is_aktif DESC, ta.nama DESC, se.tipe`,
			args: [sekolahId]
		})
	]);

	const sessions = sessionResult.rows.map((row) => ({
		id: Number(row.id),
		tahunAjaranId: Number(row.tahunAjaranId),
		semesterId: row.semesterId == null ? null : Number(row.semesterId),
		nama: String(row.nama),
		singkatan: row.singkatan ? String(row.singkatan) : null,
		tanggalUjian: row.tanggalUjian ? String(row.tanggalUjian) : null,
		tanggalCetak: row.tanggalCetak ? String(row.tanggalCetak) : null,
		status: String(row.status),
		tahunAjaran: String(row.tahunAjaran),
		semester: row.semester ? String(row.semester) : null,
		participantCount: Number(row.participantCount ?? 0)
	}));
	const requestedId = Number(url.searchParams.get('session_id'));
	const selectedSessionId = sessions.some((item) => item.id === requestedId)
		? requestedId
		: (sessions[0]?.id ?? null);

	const yearMap = new Map<
		number,
		{
			id: number;
			nama: string;
			isAktif: boolean;
			semesters: Array<{ id: number; nama: string; tipe: string }>;
		}
	>();
	for (const row of yearResult.rows) {
		const id = Number(row.id);
		if (!yearMap.has(id))
			yearMap.set(id, { id, nama: String(row.nama), isAktif: Boolean(row.isAktif), semesters: [] });
		if (row.semesterId != null)
			yearMap.get(id)?.semesters.push({
				id: Number(row.semesterId),
				nama: String(row.semesterNama),
				tipe: String(row.semesterTipe)
			});
	}

	let participants: Array<{
		id: number;
		muridId: number | null;
		nomorPeserta: string | null;
		ruang: string | null;
		usernameLms: string | null;
		passwordSet: boolean;
		nama: string;
		nis: string | null;
		nisn: string | null;
		kelas: string | null;
	}> = [];
	let classes: Array<{ id: number; nama: string; muridCount: number }> = [];
	if (selectedSessionId) {
		const selected = sessions.find((item) => item.id === selectedSessionId)!;
		const [participantResult, classResult] = await Promise.all([
			db.$client.execute({
				sql: `SELECT id, murid_id AS muridId, nomor_peserta AS nomorPeserta, ruang,
					username_lms AS usernameLms, password_lms IS NOT NULL AND password_lms <> '' AS passwordSet,
					murid_nama_snapshot AS nama, nis_snapshot AS nis, nisn_snapshot AS nisn,
					kelas_nama_snapshot AS kelas
				FROM ujian_peserta WHERE session_id = ?
				ORDER BY COALESCE(ruang, ''), LENGTH(COALESCE(nomor_peserta, '')), COALESCE(nomor_peserta, ''), murid_nama_snapshot`,
				args: [selectedSessionId]
			}),
			db.$client.execute({
				sql: `SELECT k.id, k.nama, COUNT(m.id) AS muridCount
				FROM kelas k LEFT JOIN murid m ON m.kelas_id = k.id AND m.sekolah_id = k.sekolah_id AND ${activeMuridSql('m')}
				WHERE k.sekolah_id = ? AND k.tahun_ajaran_id = ?
					AND (? IS NULL OR k.semester_id = ?)
				GROUP BY k.id ORDER BY k.nama`,
				args: [sekolahId, selected.tahunAjaranId, selected.semesterId, selected.semesterId]
			})
		]);
		participants = participantResult.rows.map((row) => ({
			id: Number(row.id),
			muridId: row.muridId == null ? null : Number(row.muridId),
			nomorPeserta: row.nomorPeserta ? String(row.nomorPeserta) : null,
			ruang: row.ruang ? String(row.ruang) : null,
			usernameLms: row.usernameLms ? String(row.usernameLms) : null,
			passwordSet: Boolean(row.passwordSet),
			nama: String(row.nama),
			nis: row.nis ? String(row.nis) : null,
			nisn: row.nisn ? String(row.nisn) : null,
			kelas: row.kelas ? String(row.kelas) : null
		}));
		classes = classResult.rows.map((row) => ({
			id: Number(row.id),
			nama: String(row.nama),
			muridCount: Number(row.muridCount ?? 0)
		}));
	}

	return {
		meta: { title: 'Sesi Ujian' } satisfies PageMeta,
		sessions,
		selectedSessionId,
		participants,
		classes,
		years: [...yearMap.values()]
	};
};

export const actions: Actions = {
	saveSession: async ({ request, locals }) => {
		authority('ujian_manage');
		await ensureUjianSchema();
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(403, { fail: 'Sekolah aktif tidak ditemukan.' });
		const form = await request.formData();
		const id = integer(form, 'id');
		const tahunAjaranId = integer(form, 'tahunAjaranId');
		const semesterId = integer(form, 'semesterId');
		const nama = text(form, 'nama', 180);
		const singkatan = text(form, 'singkatan', 30);
		const status = text(form, 'status', 20) as (typeof statuses)[number];
		if (!tahunAjaranId || !nama || !statuses.includes(status))
			return fail(400, { fail: 'Nama, tahun ajaran, dan status wajib valid.' });
		const context = await db.$client.execute({
			sql: `SELECT ta.id, se.id AS semesterId FROM tahun_ajaran ta
			LEFT JOIN semester se ON se.id = ? AND se.tahun_ajaran_id = ta.id
			WHERE ta.id = ? AND ta.sekolah_id = ? LIMIT 1`,
			args: [semesterId, tahunAjaranId, sekolahId]
		});
		if (!context.rows[0] || (semesterId && context.rows[0].semesterId == null))
			return fail(400, { fail: 'Tahun ajaran atau semester tidak sesuai sekolah aktif.' });
		const now = new Date().toISOString();
		const values = [
			tahunAjaranId,
			semesterId,
			nama,
			singkatan || null,
			text(form, 'tanggalUjian', 10) || null,
			text(form, 'tanggalCetak', 10) || null,
			status,
			now
		];
		if (id) {
			if (!(await sessionForSchool(id, sekolahId)))
				return fail(404, { fail: 'Sesi ujian tidak ditemukan.' });
			await db.$client.execute({
				sql: `UPDATE ujian_session SET tahun_ajaran_id=?, semester_id=?, nama=?, singkatan=?, tanggal_ujian=?, tanggal_cetak=?, status=?, updated_at=? WHERE id=? AND sekolah_id=?`,
				args: [...values, id, sekolahId]
			});
			await writeAuditLog({
				locals,
				request,
				action: 'update',
				entityType: 'ujian_session',
				entityId: id,
				summary: `Sesi ujian ${nama} diperbarui.`,
				after: { nama, tahunAjaranId, semesterId, status }
			});
			return { message: 'Sesi ujian berhasil diperbarui.', sessionId: id };
		}
		const result = await db.$client.execute({
			sql: `INSERT INTO ujian_session (sekolah_id,tahun_ajaran_id,semester_id,nama,singkatan,tanggal_ujian,tanggal_cetak,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
			args: [sekolahId, ...values.slice(0, 7), now]
		});
		const sessionId = Number(result.lastInsertRowid);
		await writeAuditLog({
			locals,
			request,
			action: 'create',
			entityType: 'ujian_session',
			entityId: sessionId,
			summary: `Sesi ujian ${nama} dibuat.`,
			after: { nama, tahunAjaranId, semesterId, status }
		});
		return { message: 'Sesi ujian berhasil dibuat.', sessionId };
	},
	addClass: async ({ request, locals }) => {
		authority('ujian_manage');
		await ensureUjianSchema();
		const sekolahId = locals.sekolah?.id;
		const form = await request.formData();
		const sessionId = integer(form, 'sessionId');
		const classId = integer(form, 'classId');
		if (!sekolahId || !sessionId || !classId)
			return fail(400, { fail: 'Sesi dan kelas wajib dipilih.' });
		const session = await sessionForSchool(sessionId, sekolahId);
		if (!session) return fail(404, { fail: 'Sesi ujian tidak ditemukan.' });
		const murid = await db.$client.execute({
			sql: `SELECT m.id, m.nama, m.nis, m.nisn, k.nama AS kelas
			FROM kelas k JOIN murid m ON m.kelas_id = k.id
			WHERE k.id=? AND k.sekolah_id=? AND m.sekolah_id=k.sekolah_id AND k.tahun_ajaran_id=?
				AND (? IS NULL OR k.semester_id=?) AND ${activeMuridSql('m')} ORDER BY m.nama`,
			args: [
				classId,
				sekolahId,
				Number(session.tahun_ajaran_id),
				session.semester_id,
				session.semester_id
			]
		});
		if (!murid.rows.length)
			return fail(400, { fail: 'Kelas tidak memiliki murid yang dapat ditambahkan.' });
		const now = new Date().toISOString();
		const room = text(form, 'room', 50) || null;
		let added = 0;
		const tx = await db.$client.transaction('write');
		try {
			const school = (
				await tx.execute({ sql: 'SELECT npsn FROM sekolah WHERE id=?', args: [sekolahId] })
			).rows[0];
			const npsn = String(school?.npsn ?? '').trim();
			if (!isValidExamNpsn(npsn))
				return fail(400, {
					fail: 'Lengkapi NPSN sekolah aktif dengan 8 digit di Data Sekolah sebelum menomori peserta.'
				});
			const existing = await tx.execute({
				sql: 'SELECT murid_id, nomor_peserta FROM ujian_peserta WHERE session_id=?',
				args: [sessionId]
			});
			const existingIds = new Set(existing.rows.map((row) => Number(row.murid_id)));
			let sequence = nextExamSequence(
				npsn,
				existing.rows.map((row) => (row.nomor_peserta == null ? null : String(row.nomor_peserta)))
			);
			for (const row of murid.rows) {
				if (existingIds.has(Number(row.id))) continue;
				await tx.execute({
					sql: `INSERT INTO ujian_peserta (session_id,murid_id,nomor_peserta,ruang,username_lms,murid_nama_snapshot,nis_snapshot,nisn_snapshot,kelas_nama_snapshot,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
					args: [
						sessionId,
						Number(row.id),
						examParticipantNumber(npsn, sequence),
						room,
						row.nis ? `s${row.nis}` : null,
						String(row.nama),
						row.nis,
						row.nisn,
						row.kelas,
						now
					]
				});
				sequence += 1;
				added += 1;
			}
			await tx.commit();
		} finally {
			if (!tx.closed) await tx.rollback();
			tx.close();
		}
		await writeAuditLog({
			locals,
			request,
			action: 'create',
			entityType: 'ujian_peserta',
			entityId: sessionId,
			summary: `${added} peserta ditambahkan ke sesi ujian.`,
			after: { sessionId, classId, added }
		});
		return {
			message: added
				? `${added} peserta berhasil ditambahkan.`
				: 'Semua murid kelas tersebut sudah menjadi peserta.'
		};
	},
	renumberParticipants: async ({ request, locals }) => {
		authority('ujian_manage');
		await ensureUjianSchema();
		const sekolahId = locals.sekolah?.id;
		const form = await request.formData();
		const sessionId = integer(form, 'sessionId');
		if (!sekolahId || !sessionId || !(await sessionForSchool(sessionId, sekolahId)))
			return fail(404, { fail: 'Sesi ujian tidak ditemukan.' });
		const tx = await db.$client.transaction('write');
		let count = 0;
		try {
			const school = (
				await tx.execute({ sql: 'SELECT npsn FROM sekolah WHERE id=?', args: [sekolahId] })
			).rows[0];
			const npsn = String(school?.npsn ?? '').trim();
			if (!isValidExamNpsn(npsn))
				return fail(400, {
					fail: 'Lengkapi NPSN sekolah aktif dengan 8 digit di Data Sekolah sebelum menomori peserta.'
				});
			const result = await tx.execute({
				sql: 'SELECT id, kelas_nama_snapshot AS kelas FROM ujian_peserta WHERE session_id=? ORDER BY id',
				args: [sessionId]
			});
			const participants = participantsInClassAdditionOrder(
				result.rows.map((row) => ({
					id: Number(row.id),
					kelas: row.kelas == null ? null : String(row.kelas)
				}))
			);
			const now = new Date().toISOString();
			for (const [index, participant] of participants.entries()) {
				await tx.execute({
					sql: 'UPDATE ujian_peserta SET nomor_peserta=?, updated_at=? WHERE id=? AND session_id=?',
					args: [examParticipantNumber(npsn, index + 1), now, participant.id, sessionId]
				});
			}
			count = participants.length;
			await tx.commit();
		} finally {
			if (!tx.closed) await tx.rollback();
			tx.close();
		}
		await writeAuditLog({
			locals,
			request,
			action: 'update',
			entityType: 'ujian_peserta',
			entityId: sessionId,
			summary: `Nomor ${count} peserta disusun ulang berdasarkan NPSN dan urutan penambahan kelas.`,
			after: { sessionId, count }
		});
		return { message: `${count} nomor peserta berhasil disusun ulang.` };
	},
	updateParticipant: async ({ request, locals }) => {
		authority('ujian_manage');
		const sekolahId = locals.sekolah?.id;
		const form = await request.formData();
		const id = integer(form, 'id');
		if (!sekolahId || !id) return fail(400, { fail: 'Peserta tidak valid.' });
		const password = text(form, 'passwordLms', 100);
		const result = await db.$client.execute({
			sql: `UPDATE ujian_peserta SET nomor_peserta=?, ruang=?, username_lms=?, password_lms=CASE WHEN ?='' THEN password_lms ELSE ? END, updated_at=?
			WHERE id=? AND session_id IN (SELECT id FROM ujian_session WHERE sekolah_id=?)`,
			args: [
				text(form, 'nomorPeserta', 60) || null,
				text(form, 'ruang', 50) || null,
				text(form, 'usernameLms', 100) || null,
				password,
				password,
				new Date().toISOString(),
				id,
				sekolahId
			]
		});
		if (!result.rowsAffected) return fail(404, { fail: 'Peserta tidak ditemukan.' });
		return { message: 'Data peserta berhasil disimpan.' };
	},
	deleteParticipant: async ({ request, locals }) => {
		authority('ujian_manage');
		const sekolahId = locals.sekolah?.id;
		const form = await request.formData();
		const id = integer(form, 'id');
		if (!sekolahId || !id) return fail(400, { fail: 'Peserta tidak valid.' });
		await db.$client.execute({
			sql: `DELETE FROM ujian_peserta WHERE id=? AND session_id IN (SELECT id FROM ujian_session WHERE sekolah_id=?)`,
			args: [id, sekolahId]
		});
		return { message: 'Peserta dihapus dari sesi ujian.' };
	},
	deleteSession: async ({ request, locals }) => {
		authority('ujian_manage');
		const sekolahId = locals.sekolah?.id;
		const form = await request.formData();
		const id = integer(form, 'id');
		if (!sekolahId || !id || !(await sessionForSchool(id, sekolahId)))
			return fail(404, { fail: 'Sesi ujian tidak ditemukan.' });
		await db.$client.execute({
			sql: `DELETE FROM ujian_session WHERE id=? AND sekolah_id=?`,
			args: [id, sekolahId]
		});
		await writeAuditLog({
			locals,
			request,
			action: 'delete',
			entityType: 'ujian_session',
			entityId: id,
			summary: 'Sesi ujian dan daftar pesertanya dihapus.'
		});
		return { message: 'Sesi ujian berhasil dihapus.' };
	}
};
import { activeMuridSql } from '$lib/server/murid-query';
