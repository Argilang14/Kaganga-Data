import { error, fail, isHttpError, type RequestEvent, type ServerLoadEvent } from '@sveltejs/kit';
import db from './db';
import {
	dormEvaluationContext,
	loadDormEvaluation,
	evaluationRows,
	assertDormWritable,
	saveDormGrades,
	evaluationAverage
} from './dorm-evaluation';
import { dormEvaluationExcel } from './dorm-evaluation-excel';
import { writeAuditLog } from './audit-log';
import { buildKeasramaanDeskripsi, ekstrakurikulerNilaiOptions } from '$lib/ekstrakurikuler';
import {
	getIndikatorCategory,
	hitungNilaiIndikator,
	kategoriToRubrikValue
} from '$lib/components/asesmen-keasramaan/utils';

type Indicator = { id: number; evaluasi_id: number; deskripsi: string };
type Context = Awaited<ReturnType<typeof dormEvaluationContext>>;

function dormPage(event: ServerLoadEvent, rows: unknown[], perPage: number) {
	const search = (event.url.searchParams.get('q') ?? '').trim();
	const totalPages = Math.max(1, Math.ceil(rows.length / perPage));
	const currentPage = Math.min(
		totalPages,
		Math.max(1, Math.trunc(Number(event.url.searchParams.get('page')) || 1))
	);
	return { search, currentPage, totalPages, totalItems: rows.length, perPage };
}

export async function loadDormNotesPage(event: ServerLoadEvent) {
	event.depends('app:catatan-wali-asrama');
	const view = await loadDormEvaluation(event, 'notes');
	const search = (event.url.searchParams.get('q') ?? '').trim().toLocaleLowerCase('id');
	const filtered = view.students.filter((s) => s.nama.toLocaleLowerCase('id').includes(search));
	const page = dormPage(event, filtered, 25);
	const offset = (page.currentPage - 1) * page.perPage;
	return {
		...view,
		page,
		daftarCatatan: filtered.slice(offset, offset + page.perPage).map((s, index) => ({
			id: s.penempatan_id,
			no: offset + index + 1,
			nama: s.nama,
			catatan: view.notes.find((n) => n.penempatan_id === s.penempatan_id)?.catatan ?? null,
			canEdit: view.canNote && !s.selesai
		}))
	};
}

export async function loadDormRecapPage(event: ServerLoadEvent) {
	event.depends('app:rekap-nilai-asrama');
	const view = await loadDormEvaluation(event, 'recap');
	const rows = view.students
		.map((s) => {
			const matevScores = view.evaluations.map((e) => ({
				id: e.id,
				nama: e.nama,
				score: evaluationAverage(view.goals, view.grades, s.penempatan_id, e.id)
			}));
			const nilaiRataRata = hitungNilaiIndikator(matevScores.map((e) => e.score));
			const params = new URLSearchParams({
				kamar_id: String(view.room!.id),
				semester_id: String(view.period!.id),
				penempatan_id: String(s.penempatan_id)
			});
			for (const key of ['q', 'page', 'riwayat'])
				if (event.url.searchParams.has(key)) params.set(key, event.url.searchParams.get(key)!);
			return {
				id: s.penempatan_id,
				nama: s.nama,
				nilaiRataRata,
				jumlahMatevDinilai: matevScores.filter((e) => e.score != null).length,
				totalMatev: matevScores.length,
				matevScores,
				detailHref: `/rekap-nilai-asrama/detail?${params}`
			};
		})
		.sort(
			(a, b) =>
				(b.nilaiRataRata ?? -1) - (a.nilaiRataRata ?? -1) || a.nama.localeCompare(b.nama, 'id')
		);
	let lastRank = 0;
	const ranked = rows.map((row, index) => {
		if (row.nilaiRataRata == null || row.nilaiRataRata !== rows[index - 1]?.nilaiRataRata)
			lastRank = index + 1;
		return { ...row, peringkat: lastRank };
	});
	const search = (event.url.searchParams.get('q') ?? '').trim().toLocaleLowerCase('id');
	const filtered = ranked.filter((s) => s.nama.toLocaleLowerCase('id').includes(search));
	const page = dormPage(event, filtered, 20);
	return {
		...view,
		sekolahNama: event.locals.sekolah?.nama ?? 'Sekolah',
		matevList: view.evaluations,
		daftarNilai: filtered.slice(
			(page.currentPage - 1) * page.perPage,
			page.currentPage * page.perPage
		),
		legerRows: ranked,
		summary: {
			totalMurid: ranked.length,
			totalMuridDinilai: ranked.filter((s) => s.jumlahMatevDinilai > 0).length,
			totalMatev: view.evaluations.length
		},
		page
	};
}

export async function loadDormRecapDetailPage(event: ServerLoadEvent) {
	event.depends('app:rekap-nilai-asrama-detail');
	const view = await loadDormRecapPage(event);
	const supplied = event.url.searchParams.get('penempatan_id');
	const student = supplied
		? view.students.find((s) => s.penempatan_id === positiveId(supplied))
		: null;
	if (supplied && !student) error(403, 'Anak berada di luar asrama atau penugasan.');
	const row = view.legerRows.find((s) => s.id === student?.penempatan_id);
	const daftarNilai = (row?.matevScores ?? []).map((e, index) => {
		const goals = view.goals.filter((g) => g.evaluasi_id === e.id);
		return {
			no: index + 1,
			matevId: e.id,
			matev: e.nama,
			nilai: e.score,
			sudahDinilai: e.score != null,
			tujuanDinilai: goals.filter((g) =>
				view.grades.some((n) => n.penempatan_id === student!.penempatan_id && n.tujuan_id === g.id)
			).length,
			totalTujuan: goals.length
		};
	});
	const scores = daftarNilai.flatMap((e) => (e.nilai == null ? [] : [e.nilai]));
	const params = new URLSearchParams(event.url.searchParams);
	params.delete('penempatan_id');
	params.delete('murid_id');
	return {
		...view,
		status: student ? ('ready' as const) : ('empty' as const),
		meta: { title: 'Detail Rekap Nilai Asrama' },
		murid: student ?? null,
		daftarNilai,
		ringkasan: {
			rataRata: row?.nilaiRataRata ?? null,
			matevDinilai: scores.length,
			totalMatev: daftarNilai.length
		},
		tertinggi: daftarNilai.filter((e) => e.nilai === Math.max(...scores)),
		terendah: daftarNilai.filter((e) => e.nilai === Math.min(...scores)),
		backUrl: `/rekap-nilai-asrama?${params}`
	};
}

async function indicators(
	ctx: Pick<Context, 'school' | 'room' | 'period'>,
	reader = db.$client as Pick<typeof db.$client, 'execute'>
) {
	return ctx.room && ctx.period
		? evaluationRows<Indicator>(
				`SELECT i.* FROM asrama_evaluasi_indikator i JOIN asrama_evaluasi e ON e.id=i.evaluasi_id
		 WHERE e.sekolah_id=? AND e.kamar_id=? AND e.semester_id=? ORDER BY i.id`,
				[ctx.school, ctx.room.id, ctx.period.id],
				reader
			)
		: [];
}
function positiveId(value: unknown) {
	const result = Number(value);
	if (!Number.isSafeInteger(result) || result <= 0) error(400, 'Pilihan data tidak valid.');
	return result;
}
function requiredText(value: unknown, max: number) {
	const result = String(value ?? '').trim();
	if (!result || result.length > max) error(400, `Isi keterangan antara 1 dan ${max} karakter.`);
	return result;
}

export async function loadDormMasterPage(event: ServerLoadEvent) {
	event.depends('app:keasramaan');
	const view = await loadDormEvaluation(event, 'master');
	const list = await indicators(view);
	const mataEvaluasi = view.evaluations.map((e) => ({
		...e,
		indikator: list.filter((i) => i.evaluasi_id === e.id)
	}));
	return { ...view, mataEvaluasi, mataPelajaran: mataEvaluasi, tableReady: true };
}

export async function loadDormGoalsPage(event: ServerLoadEvent) {
	event.depends('app:keasramaan:tp');
	const view = await loadDormMasterPage(event);
	const indicatorId = positiveId(event.url.searchParams.get('indikatorId'));
	const indicator = view.mataEvaluasi.flatMap((e) => e.indikator).find((i) => i.id === indicatorId);
	if (!indicator) error(403, 'Indikator berada di luar asrama atau periode ini.');
	const evaluation = view.evaluations.find((e) => e.id === indicator.evaluasi_id)!;
	return {
		...view,
		indikator: { ...indicator, keasramaan: evaluation },
		tujuanTableReady: true,
		tujuan: view.goals.filter(
			(g) => g.evaluasi_id === evaluation.id && g.indikator === indicator.deskripsi
		)
	};
}

export async function loadDormInputPage(event: ServerLoadEvent) {
	event.depends('app:asesmen-keasramaan');
	const view = await loadDormEvaluation(event, 'input');
	const supplied =
		event.url.searchParams.get('keasramaan_id') ?? event.url.searchParams.get('evaluasi_id');
	const selected = supplied
		? (view.evaluations.find((e) => e.id === positiveId(supplied)) ?? null)
		: view.evaluations.length === 1
			? view.evaluations[0]
			: null;
	if (supplied && !selected) error(403, 'Mata evaluasi berada di luar asrama atau periode ini.');
	const goals = view.goals.filter((g) => g.evaluasi_id === selected?.id);
	const search = (event.url.searchParams.get('q') ?? '').trim();
	const filtered = view.students.filter((s) =>
		s.nama.toLocaleLowerCase('id').includes(search.toLocaleLowerCase('id'))
	);
	const totalPages = Math.max(1, Math.ceil(filtered.length / 25));
	const currentPage = Math.min(
		totalPages,
		Math.max(1, Math.trunc(Number(event.url.searchParams.get('page')) || 1))
	);
	const daftarMurid = filtered.slice((currentPage - 1) * 25, currentPage * 25).map((s, index) => {
		const nilai = goals.map((g) => {
			const grade = view.grades.find(
				(n) => n.penempatan_id === s.penempatan_id && n.tujuan_id === g.id
			);
			return {
				tujuanId: g.id,
				tujuan: g.deskripsi,
				kategori: grade?.kategori ?? null,
				kategoriLabel: null,
				timestamp: grade?.updated_at ?? null
			};
		});
		const descriptions = [...new Set(goals.map((g) => g.indikator))].map((name) => {
			const values = goals
				.filter((g) => g.indikator === name)
				.map((g) => {
					const grade = nilai.find((n) => n.tujuanId === g.id)?.kategori;
					return grade ? kategoriToRubrikValue(grade) : null;
				});
			const average = hitungNilaiIndikator(values);
			return {
				indikatorNama: name,
				nilaiIndikator: average,
				category: getIndikatorCategory(average)
			};
		});
		const deskripsi = buildKeasramaanDeskripsi(descriptions, s.nama);
		return {
			id: s.penempatan_id,
			muridId: s.id,
			nama: s.nama,
			no: (currentPage - 1) * 25 + index + 1,
			nilai,
			deskripsi,
			hasNilai: !!deskripsi,
			lastUpdated:
				nilai
					.map((n) => n.timestamp)
					.filter((n) => n != null)
					.sort()
					.at(-1) ?? null,
			isAsuhanku: view.canGrade && !s.selesai,
			canView: true
		};
	});
	return {
		...view,
		keasramaanList: view.evaluations.map((e) => ({
			...e,
			tujuanCount: view.goals.filter((g) => g.evaluasi_id === e.id).length
		})),
		selectedKeasramaanId: selected?.id ?? null,
		selectedKeasramaan: selected ? { ...selected, tujuan: goals } : null,
		daftarMurid,
		search,
		totalMurid: filtered.length,
		muridCount: view.students.length,
		page: { currentPage, totalPages }
	};
}

export async function loadDormGradePage(event: RequestEvent) {
	const view = await loadDormEvaluation(event, 'input');
	const placement = positiveId(event.url.searchParams.get('penempatan_id'));
	const student = view.students.find((s) => s.penempatan_id === placement);
	const evaluation = view.evaluations.find(
		(e) => e.id === positiveId(event.url.searchParams.get('keasramaan_id'))
	);
	if (!student || !evaluation) error(403, 'Anak atau mata evaluasi berada di luar penugasan.');
	const list = (await indicators(view)).filter((i) => i.evaluasi_id === evaluation.id);
	const tujuan = view.goals
		.filter((g) => g.evaluasi_id === evaluation.id)
		.map((g) => ({
			...g,
			indikatorId: list.find((i) => i.deskripsi === g.indikator)!.id,
			indikatorNama: g.indikator,
			indikatorDeskripsi: g.indikator
		}));
	const params = new URLSearchParams({
		kamar_id: String(view.room!.id),
		semester_id: String(view.period!.id),
		keasramaan_id: String(evaluation.id)
	});
	if (view.history) params.set('riwayat', '1');
	for (const key of ['q', 'page'])
		if (event.url.searchParams.has(key)) params.set(key, event.url.searchParams.get(key)!);
	return {
		...view,
		murid: student,
		keasramaan: evaluation,
		tujuan,
		nilaiByTujuan: Object.fromEntries(
			view.grades.filter((n) => n.penempatan_id === placement).map((n) => [n.tujuan_id, n.kategori])
		),
		kategoriOptions: ekstrakurikulerNilaiOptions,
		indikators: list.map((i) => ({ id: i.id, nama: i.deskripsi })),
		backUrl: `/asesmen-keasramaan?${params}`,
		canGrade: view.canGrade && !student.selesai
	};
}

export async function saveDormGradePage(event: RequestEvent) {
	try {
		const form = await event.request.formData();
		const ctx = await dormEvaluationContext(event, form);
		const placement = positiveId(form.get('penempatan_id'));
		const evaluation = positiveId(form.get('keasramaanId'));
		if (!ctx.evaluations.some((e) => e.id === evaluation))
			error(403, 'Mata evaluasi berada di luar penugasan.');
		const entries = [...form.entries()]
			.filter(([key]) => key.startsWith('nilai.'))
			.map(([key, value]) => {
				const goal = positiveId(key.slice(6));
				if (!ctx.goals.some((g) => g.id === goal && g.evaluasi_id === evaluation))
					error(403, 'Tujuan berada di luar mata evaluasi ini.');
				return { placement, goal, category: String(value) };
			});
		await saveDormGrades(ctx, entries);
		await writeAuditLog({
			locals: event.locals,
			request: event.request,
			action: 'update',
			entityType: 'asrama_evaluasi',
			entityId: placement,
			summary: 'Nilai keasramaan tersimpan.',
			after: { evaluation, semesterId: ctx.period?.id }
		});
		return { message: 'Nilai keasramaan tersimpan.' };
	} catch (cause) {
		return pageFailure(cause);
	}
}

function pageFailure(cause: unknown) {
	if (isHttpError(cause)) return fail(cause.status, { fail: cause.body.message });
	if (String(cause).includes('UNIQUE constraint'))
		return fail(409, { fail: 'Data yang sama sudah tersedia.' });
	if (String(cause).includes('asrama_goal_has_grades'))
		return fail(409, { fail: 'Data sudah memiliki nilai dan dikunci untuk menjaga riwayat.' });
	console.error('[dorm-evaluation-page]', cause);
	return fail(500, { fail: 'Data belum tersimpan. Muat ulang halaman dan coba lagi.' });
}

export async function mutateDormMasterPage(
	event: RequestEvent,
	operation: 'create' | 'save' | 'bulkDelete' | 'goal-create' | 'goal-update' | 'goal-delete'
) {
	try {
		const form = await event.request.formData();
		const ctx = await dormEvaluationContext(event, form);
		const tx = await db.$client.transaction('write');
		try {
			await assertDormWritable(ctx, 'master', tx);
			if (operation.startsWith('goal-')) {
				const list = await indicators(ctx, tx);
				if (operation === 'goal-delete') {
					const ids = form.getAll('ids').map(positiveId);
					if (!ids.length || ids.length > 10000) error(400, 'Pilih tujuan yang akan dihapus.');
					for (const target of ids) {
						if (!ctx.goals.some((g) => g.id === target))
							error(403, 'Tujuan berada di luar asrama ini.');
						await tx.execute({
							sql: 'DELETE FROM asrama_evaluasi_tujuan WHERE id=?',
							args: [target]
						});
					}
				} else {
					const indicator = list.find((i) => i.id === positiveId(form.get('indikatorId')));
					if (!indicator) error(403, 'Indikator berada di luar asrama ini.');
					const description = requiredText(form.get('deskripsi'), 2000);
					if (operation === 'goal-create')
						await tx.execute({
							sql: 'INSERT INTO asrama_evaluasi_tujuan(evaluasi_id,indikator,deskripsi) VALUES(?,?,?)',
							args: [indicator.evaluasi_id, indicator.deskripsi, description]
						});
					else {
						const target = positiveId(form.get('id'));
						if (
							!ctx.goals.some(
								(g) =>
									g.id === target &&
									g.evaluasi_id === indicator.evaluasi_id &&
									g.indikator === indicator.deskripsi
							)
						)
							error(403, 'Tujuan berada di luar indikator ini.');
						await tx.execute({
							sql: 'UPDATE asrama_evaluasi_tujuan SET deskripsi=? WHERE id=?',
							args: [description, target]
						});
					}
				}
			} else if (operation === 'bulkDelete') {
				const ids = form.getAll('ids').map(positiveId);
				if (!ids.length || ids.length > 10000) error(400, 'Pilih mata evaluasi yang akan dihapus.');
				for (const target of ids) {
					if (!ctx.evaluations.some((e) => e.id === target))
						error(403, 'Mata evaluasi berada di luar asrama ini.');
					await tx.execute({
						sql: 'DELETE FROM asrama_evaluasi_tujuan WHERE evaluasi_id=?',
						args: [target]
					});
					await tx.execute({ sql: 'DELETE FROM asrama_evaluasi WHERE id=?', args: [target] });
				}
			} else {
				const nama = requiredText(
					form.get(operation === 'create' ? 'nama' : 'mataEvaluasiNama'),
					200
				);
				let target: number;
				if (operation === 'create') {
					const result = await tx.execute({
						sql: 'INSERT INTO asrama_evaluasi(sekolah_id,kamar_id,semester_id,nama) VALUES(?,?,?,?) RETURNING id',
						args: [ctx.school, ctx.room!.id, ctx.period!.id, nama]
					});
					target = Number(result.rows[0].id);
				} else {
					target = positiveId(form.get('mataEvaluasiId'));
					const existing = ctx.evaluations.find((e) => e.id === target);
					if (!existing) error(403, 'Mata evaluasi berada di luar asrama ini.');
					if (existing.nama !== nama)
						await tx.execute({
							sql: 'UPDATE asrama_evaluasi SET nama=? WHERE id=?',
							args: [nama, target]
						});
				}
				const old = (await indicators(ctx, tx)).filter((i) => i.evaluasi_id === target);
				const keys = [...form.keys()].filter((key) => /^indikator\.\d+\.deskripsi$/.test(key));
				if (keys.length > 1000) error(400, 'Maksimal 1.000 indikator per penyimpanan.');
				const kept = new Set<number>();
				const names = new Set<string>();
				for (const key of keys) {
					const description = requiredText(form.get(key), 500);
					if (names.has(description)) error(400, 'Indikator yang sama diisi lebih dari sekali.');
					names.add(description);
					const supplied = form.get(key.replace(/deskripsi$/, 'id'));
					if (supplied) {
						const indicator = old.find((i) => i.id === positiveId(supplied));
						if (!indicator || kept.has(indicator.id))
							error(403, 'Indikator berada di luar mata evaluasi ini atau berulang.');
						if (old.some((i) => i.id !== indicator.id && i.deskripsi === description))
							error(409, 'Nama indikator sudah dipakai. Pilih nama lain.');
						kept.add(indicator.id);
						if (description !== indicator.deskripsi) {
							await tx.execute({
								sql: 'UPDATE asrama_evaluasi_tujuan SET indikator=? WHERE evaluasi_id=? AND indikator=?',
								args: [description, target, indicator.deskripsi]
							});
							// Goal synchronization may have inserted the new label; retain the original ID.
							await tx.execute({
								sql: 'DELETE FROM asrama_evaluasi_indikator WHERE evaluasi_id=? AND deskripsi=? AND id<>?',
								args: [target, description, indicator.id]
							});
							await tx.execute({
								sql: 'UPDATE asrama_evaluasi_indikator SET deskripsi=? WHERE id=?',
								args: [description, indicator.id]
							});
						}
					} else
						await tx.execute({
							sql: 'INSERT INTO asrama_evaluasi_indikator(evaluasi_id,deskripsi) VALUES(?,?)',
							args: [target, description]
						});
				}
				for (const indicator of old.filter((i) => !kept.has(i.id))) {
					await tx.execute({
						sql: 'DELETE FROM asrama_evaluasi_tujuan WHERE evaluasi_id=? AND indikator=?',
						args: [target, indicator.deskripsi]
					});
					await tx.execute({
						sql: 'DELETE FROM asrama_evaluasi_indikator WHERE id=?',
						args: [indicator.id]
					});
				}
			}
			await tx.commit();
		} catch (cause) {
			await tx.rollback();
			throw cause;
		} finally {
			tx.close();
		}
		await writeAuditLog({
			locals: event.locals,
			request: event.request,
			action: 'update',
			entityType: 'asrama_evaluasi',
			entityId: ctx.room!.id,
			summary: 'Susunan evaluasi asrama diperbarui.',
			after: { operation, semesterId: ctx.period!.id }
		});
		return { message: 'Data keasramaan tersimpan.' };
	} catch (cause) {
		return pageFailure(cause);
	}
}

export async function importDormMasterPage(event: RequestEvent) {
	const form = await event.request.formData();
	form.set('jenis', 'master');
	const response = await dormEvaluationExcel(
		{
			...event,
			request: new Request(event.request.url, {
				method: 'POST',
				headers: { accept: 'application/json' },
				body: form
			})
		},
		false
	);
	const result = await response.json();
	return response.ok ? result : fail(response.status, result);
}
