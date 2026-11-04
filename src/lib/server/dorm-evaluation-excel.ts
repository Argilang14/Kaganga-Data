import ExcelJS from 'exceljs';
import { error, isHttpError, json, redirect, type RequestEvent } from '@sveltejs/kit';
import db from './db';
import { writeAuditLog } from './audit-log';
import {
	dormEvaluationContext,
	saveDormGrades,
	assertDormWritable,
	evaluationRows
} from './dorm-evaluation';

export async function dormEvaluationExcel(event: RequestEvent, download: boolean, master = false) {
	if (download) {
		const ctx = await dormEvaluationContext(event);
		if (!ctx.room || !ctx.period) error(400, 'Pilih asrama dan periode sebelum mengunduh Excel.');
		const workbook = new ExcelJS.Workbook();
		const evaluationId = Number(event.url.searchParams.get('evaluasi_id') ?? 0);
		if (evaluationId && !ctx.evaluations.some((e) => e.id === evaluationId))
			error(403, 'Mata evaluasi berada di luar asrama ini.');
		const goals = ctx.goals.filter((g) => !evaluationId || g.evaluasi_id === evaluationId);
		const sheet = workbook.addWorksheet(master ? 'Mata evaluasi' : 'Nilai');
		if (master) {
			sheet.addRow(['Mata evaluasi', 'Indikator', 'Tujuan']);
			const indicators = await evaluationRows<{ evaluasi_id: number; deskripsi: string }>(
				'SELECT i.evaluasi_id,i.deskripsi FROM asrama_evaluasi_indikator i JOIN asrama_evaluasi e ON e.id=i.evaluasi_id WHERE e.sekolah_id=? AND e.kamar_id=? AND e.semester_id=? ORDER BY e.id,i.id',
				[ctx.school, ctx.room.id, ctx.period.id]
			);
			for (const indicator of indicators) {
				const matching = goals.filter(
					(g) => g.evaluasi_id === indicator.evaluasi_id && g.indikator === indicator.deskripsi
				);
				for (const goal of matching.length ? matching : [null])
					sheet.addRow([
						ctx.evaluations.find((e) => e.id === indicator.evaluasi_id)?.nama ?? '',
						indicator.deskripsi,
						goal?.deskripsi ?? ''
					]);
			}
		} else {
			sheet.addRow([
				'Penempatan ID',
				'Tujuan ID',
				'Nama',
				'NISN',
				'Mata evaluasi',
				'Indikator',
				'Tujuan',
				'Nilai'
			]);
			for (const s of ctx.students)
				for (const t of goals)
					sheet.addRow([
						s.penempatan_id,
						t.id,
						s.nama,
						s.nisn ?? '',
						ctx.evaluations.find((e) => e.id === t.evaluasi_id)?.nama ?? '',
						t.indikator,
						t.deskripsi,
						ctx.grades.find((n) => n.penempatan_id === s.penempatan_id && n.tujuan_id === t.id)
							?.kategori ?? ''
					]);
		}
		sheet.views = [{ state: 'frozen', ySplit: 1 }];
		sheet.getRow(1).font = { bold: true };
		sheet.columns.forEach((c, i) => {
			c.width = master ? (i === 2 ? 65 : 30) : i === 6 ? 65 : i === 2 ? 30 : 22;
		});
		const context = workbook.addWorksheet('Konteks');
		context.addRow(['Asrama ID', 'Semester ID']);
		context.addRow([ctx.room.id, ctx.period.id]);
		const bytes = await workbook.xlsx.writeBuffer();
		return new Response(bytes as unknown as BodyInit, {
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="keasramaan-${master ? 'master' : 'nilai'}-${ctx.room.id}-${ctx.period.id}.xlsx"`
			}
		});
	}
	const form = await event.request.formData();
	const isMaster = form.get('jenis') === 'master';
	const base = isMaster ? '/keasramaan' : '/asesmen-keasramaan';
	const resultParams = new URLSearchParams({
		kamar_id: String(form.get('kamar_id') ?? ''),
		semester_id: String(form.get('semester_id') ?? '')
	});
	let outcome: { message?: string; fail?: string };
	try {
		const ctx = await dormEvaluationContext(event, form);
		if (!ctx.room || !ctx.period) error(400, 'Pilih asrama dan periode sebelum mengimpor.');
		if (isMaster ? !ctx.canMaster : !ctx.canGrade)
			error(403, 'Impor berada di luar kewenangan akun atau periode aktif.');
		const file = form.get('file');
		if (
			!(file instanceof File) ||
			file.size === 0 ||
			file.size > 5 * 1024 * 1024 ||
			!file.name.toLowerCase().endsWith('.xlsx')
		)
			error(400, 'Pilih berkas .xlsx berukuran maksimal 5 MB.');
		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(await file.arrayBuffer());
		const sheet = workbook.worksheets[0];
		if (!sheet || sheet.rowCount > 10001) error(400, 'Berkas kosong atau melebihi 10.000 baris.');
		const cell = (row: number, col: number) => sheet.getRow(row).getCell(col).text.trim();
		let count = 0;
		if (isMaster) {
			if (
				!['Mata evaluasi', 'Matev'].includes(cell(1, 1)) ||
				cell(1, 2) !== 'Indikator' ||
				!['Tujuan', 'Tujuan Pembelajaran'].includes(cell(1, 3))
			)
				error(400, 'Gunakan kolom Mata evaluasi, Indikator, dan Tujuan pada baris pertama.');
			const entries: Array<{ nama: string; indikator: string; deskripsi: string }> = [];
			let currentName = '',
				currentIndicator = '';
			for (let r = 2; r <= sheet.rowCount; r++) {
				const rawName = cell(r, 1),
					rawIndicator = cell(r, 2),
					deskripsi = cell(r, 3);
				if (!rawName && !rawIndicator && !deskripsi) continue;
				if (rawName && rawName !== currentName) {
					currentName = rawName;
					currentIndicator = '';
				}
				if (rawIndicator) currentIndicator = rawIndicator;
				const nama = currentName,
					indikator = currentIndicator;
				if (
					!nama ||
					nama.length > 200 ||
					!indikator ||
					indikator.length > 500 ||
					deskripsi.length > 2000
				)
					error(
						400,
						`Baris ${r} belum lengkap atau teks terlalu panjang. Periksa isian mata evaluasi, indikator, dan tujuan.`
					);
				entries.push({ nama, indikator, deskripsi });
			}
			if (!entries.length)
				error(400, 'Belum ada tujuan untuk diimpor. Isi berkas terlebih dahulu.');
			const tx = await db.$client.transaction('write');
			try {
				await assertDormWritable(ctx, 'master', tx);
				for (const entry of entries) {
					await tx.execute({
						sql: 'INSERT OR IGNORE INTO asrama_evaluasi(sekolah_id,kamar_id,semester_id,nama) VALUES(?,?,?,?)',
						args: [ctx.school, ctx.room.id, ctx.period.id, entry.nama]
					});
					await tx.execute({
						sql: 'INSERT OR IGNORE INTO asrama_evaluasi_indikator(evaluasi_id,deskripsi) SELECT id,? FROM asrama_evaluasi WHERE sekolah_id=? AND kamar_id=? AND semester_id=? AND nama=?',
						args: [entry.indikator, ctx.school, ctx.room.id, ctx.period.id, entry.nama]
					});
					if (!entry.deskripsi) continue;
					await tx.execute({
						sql: 'INSERT OR IGNORE INTO asrama_evaluasi_tujuan(evaluasi_id,indikator,deskripsi) SELECT id,?,? FROM asrama_evaluasi WHERE sekolah_id=? AND kamar_id=? AND semester_id=? AND nama=?',
						args: [
							entry.indikator,
							entry.deskripsi,
							ctx.school,
							ctx.room.id,
							ctx.period.id,
							entry.nama
						]
					});
				}
				await tx.commit();
			} catch (cause) {
				await tx.rollback();
				throw cause;
			} finally {
				tx.close();
			}
			count = entries.length;
		} else {
			if (cell(1, 1) !== 'Penempatan ID' || cell(1, 2) !== 'Tujuan ID' || cell(1, 8) !== 'Nilai')
				error(
					400,
					'Gunakan template nilai asrama terbaru. Template kelas lama tidak dapat dipakai.'
				);
			const context = workbook.getWorksheet('Konteks');
			if (
				!context ||
				Number(context.getCell('A2').value) !== ctx.room.id ||
				Number(context.getCell('B2').value) !== ctx.period.id
			)
				error(
					400,
					'Template berasal dari asrama atau periode berbeda. Unduh template yang sesuai.'
				);
			const entries = [];
			const evaluationId = Number(form.get('evaluasi_id') ?? 0);
			if (evaluationId && !ctx.evaluations.some((e) => e.id === evaluationId))
				error(403, 'Mata evaluasi berada di luar asrama ini.');
			for (let r = 2; r <= sheet.rowCount; r++) {
				const category = cell(r, 8);
				if (!category) continue;
				if (
					evaluationId &&
					!ctx.goals.some((g) => g.id === Number(cell(r, 2)) && g.evaluasi_id === evaluationId)
				)
					error(403, 'Berkas memuat tujuan di luar Matev terpilih.');
				entries.push({ placement: Number(cell(r, 1)), goal: Number(cell(r, 2)), category });
			}
			await saveDormGrades(ctx, entries);
			count = entries.length;
		}
		await writeAuditLog({
			locals: event.locals,
			request: event.request,
			action: 'import',
			entityType: 'asrama_evaluasi',
			entityId: ctx.room.id,
			summary: `Impor ${isMaster ? 'mata evaluasi' : 'nilai'} asrama: ${count} baris.`,
			after: { semesterId: ctx.period.id, count }
		});
		outcome = { message: `Impor selesai: ${count} baris diproses.` };
	} catch (cause) {
		console.error('[dorm-evaluation-import]', cause);
		outcome = {
			fail: isHttpError(cause)
				? cause.body.message
				: 'Berkas belum diimpor. Periksa format dan coba lagi.'
		};
	}
	if (event.request.headers.get('accept')?.includes('application/json'))
		return json(outcome, { status: outcome.fail ? 400 : 200 });
	resultParams.set(outcome.fail ? 'galat' : 'pesan', outcome.fail ?? outcome.message ?? '');
	redirect(303, `${base}?${resultParams}`);
}
