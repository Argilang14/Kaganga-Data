import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { createServer } from 'vite';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';

await mkdir('tmp', { recursive: true });
const folder = await mkdtemp(path.resolve('tmp/dorm-evaluation-'));
const database = path.join(folder, 'database.sqlite3');
const source = createClient({ url: 'file:data/database.sqlite3' });
try {
	await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
} finally {
	source.close();
}
process.env.DB_URL = `file:${database}`;
process.env.KAGANGA_DATA_DIR = path.join(folder, 'data');
process.env.KAGANGA_UPLOADS_DIR = path.join(folder, 'uploads');
process.env.photo = path.join(folder, 'uploads');
const client = createClient({ url: process.env.DB_URL });
const query = async (sql, args = []) => (await client.execute({ sql, args })).rows;
const first = async (sql, args = []) => (await query(sql, args))[0];
const insert = async (table, value) => {
	const entries = Object.entries(value);
	return Number(
		(
			await client.execute({
				sql: `INSERT INTO "${table}" (${entries.map(([k]) => `"${k}"`).join(',')}) VALUES(${entries.map(() => '?').join(',')})`,
				args: entries.map(([, v]) => v)
			})
		).lastInsertRowid
	);
};
const clone = (original, changes) => {
	const value = { ...original, ...changes };
	delete value.id;
	return value;
};
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const checks = [];
const pass = (name) => {
	checks.push(name);
	console.log('PASS', name);
};
const rejects = (fn, status) => assert.rejects(fn, (cause) => cause.status === status);
let connection, renderer;
const vite = await createServer({
	configFile: false,
	resolve: { alias: { $lib: path.resolve('src/lib') } },
	plugins: [
		{
			name: 'qa-env',
			resolveId(id) {
				if (id === '$env/dynamic/private') return '\0qa-env';
				if (id.startsWith('$app/')) return '\0' + id;
			},
			load(id) {
				if (id === '\0qa-env') return 'export const env=process.env;';
				if (id === '\0$app/navigation')
					return 'export const goto=()=>{};export const preloadData=()=>{};export const pushState=()=>{};';
				if (id === '\0$app/server')
					return 'export const getRequestEvent=()=>globalThis.__dormQaEvent;';
			}
		}
	],
	optimizeDeps: { noDiscovery: true, include: [] },
	server: { middlewareMode: true, hmr: false, watch: null },
	appType: 'custom',
	logLevel: 'error'
});
try {
	connection = await vite.ssrLoadModule('/src/lib/server/db/index.ts');
	assert.equal(connection.databaseUrl, process.env.DB_URL);
	const schema = await vite.ssrLoadModule('/src/lib/server/db/ensure-dorm-evaluation.ts');
	const oldTables = [
		'keasramaan',
		'keasramaan_indikator',
		'keasramaan_tujuan',
		'asesmen_keasramaan',
		'asesmen_formatif',
		'asesmen_sumatif',
		'catatan_wali_asrama'
	];
	const oldRows = Object.fromEntries(
		await Promise.all(
			oldTables.map(async (t) => [t, digest(await query(`SELECT * FROM ${t} ORDER BY id`))])
		)
	);
	await schema.ensureDormEvaluationSchema();
	await schema.ensureDormEvaluationSchema();
	for (const t of oldTables)
		assert.equal(digest(await query(`SELECT * FROM ${t} ORDER BY id`)), oldRows[t]);
	pass('migration idempotent; all legacy evaluation, grade and note rows unchanged');
	const db = connection.default;
	const service = await vite.ssrLoadModule('/src/lib/server/dorm-evaluation.ts');
	const excel = await vite.ssrLoadModule('/src/lib/server/dorm-evaluation-excel.ts');
	const lifecycle = await vite.ssrLoadModule('/src/lib/server/murid-lifecycle.ts');
	const school = await db.query.tableSekolah.findFirst({
		where: (t, { eq }) => eq(t.id, 5),
		with: { alamat: true, kepalaSekolah: true }
	});
	const admin = await db.query.tableAuthUser.findFirst({
		where: (t, { eq }) => eq(t.type, 'admin')
	});
	assert(school && admin);
	const period = await first(
		'SELECT s.* FROM semester s JOIN tahun_ajaran y ON y.id=s.tahun_ajaran_id WHERE y.sekolah_id=? AND s.is_aktif=1 AND y.is_aktif=1',
		[school.id]
	);
	assert(period);
	const suffix = randomUUID().slice(0, 8);
	const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
	const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE', {
		timeZone: 'Asia/Jakarta'
	});
	const employeeBase = await first('SELECT * FROM pegawai WHERE sekolah_id=? LIMIT 1', [school.id]);
	const employeeIds = [];
	for (let i = 0; i < 3; i++)
		employeeIds.push(
			await insert(
				'pegawai',
				clone(employeeBase, {
					nama: i < 2 ? `QA Wali Sama ${suffix}` : `QA Wali Asrama ${suffix}`,
					nip: `QA-${suffix}-${i}`,
					kode_pegawai: `QA-${suffix}-${i}`,
					nik: null,
					email: null,
					nuptk: null,
					jenis: i < 2 ? 'wali_asuh' : 'wali_asrama',
					status: 'aktif'
				})
			)
		);
	const userIds = [];
	const rawAdmin = await first('SELECT * FROM auth_user WHERE id=?', [admin.id]);
	for (let i = 0; i < 3; i++)
		userIds.push(
			await insert(
				'auth_user',
				clone(rawAdmin, {
					username: `qa-dorm-${suffix}-${i}`,
					username_normalized: `qa-dorm-${suffix}-${i}`,
					sekolah_id: school.id,
					type: i < 2 ? 'wali_asuh' : 'wali_asrama',
					roles: JSON.stringify([i < 2 ? 'wali_asuh' : 'wali_asrama']),
					pegawai_id: employeeIds[i],
					jabatan_akses: null,
					kelas_id: null,
					mata_pelajaran_id: null,
					permissions: '[]',
					must_change_password: 0
				})
			)
		);
	const users = await Promise.all(
		userIds.map((id) => db.query.tableAuthUser.findFirst({ where: (t, { eq }) => eq(t.id, id) }))
	);
	const locals = { user: admin, sekolah: school };
	const event = (actor = admin, room = rooms[0], extra = {}) => ({
		locals: { user: actor, sekolah: school },
		url: new URL(
			`http://localhost/asesmen-keasramaan?${new URLSearchParams({ kamar_id: String(room), semester_id: String(period.id), ...extra })}`
		),
		cookies: { get: () => undefined }
	});
	const mutate = async (actor, room, values) => {
		const e = event(actor, room);
		const form = new FormData();
		for (const [k, v] of Object.entries({ kamar_id: room, semester_id: period.id, ...values }))
			form.append(k, String(v));
		e.request = new Request(e.url, { method: 'POST', body: form });
		return service.mutateDormEvaluation(e);
	};
	const building = await insert('asrama', {
		sekolah_id: school.id,
		nama: `QA Eval ${suffix}`,
		nama_key: `qa-eval-${suffix}`,
		kategori: 'putra'
	});
	const rooms = [];
	for (let i = 0; i < 2; i++)
		rooms.push(
			await insert('asrama_kamar', {
				sekolah_id: school.id,
				asrama_id: building,
				nama: `QA ${i}`,
				nama_key: `qa-${i}`,
				kapasitas: 30
			})
		);
	for (const room of rooms)
		await insert('asrama_penugasan', {
			sekolah_id: school.id,
			kamar_id: room,
			pegawai_id: employeeIds[2],
			peran: 'utama',
			mulai: yesterday,
			nama_snapshot: `QA Wali Asrama ${suffix}`,
			alasan: 'QA copy',
			petugas_id: admin.id
		});
	const original = await first(
		'SELECT * FROM murid WHERE sekolah_id=? AND semester_id=? AND kelas_id IS NOT NULL LIMIT 1',
		[school.id, period.id]
	);
	const students = [],
		placements = [];
	for (let i = 0; i < 3; i++) {
		const owner = i === 1 ? 1 : 0;
		const id = await insert(
			'murid',
			clone(original, {
				nama: `QA Anak ${i} ${suffix}`,
				nis: `QAE${suffix}${i}`,
				nisn: '',
				jenis_kelamin: 'L',
				kelas_id: i === 0 ? null : original.kelas_id,
				wali_asuh_pegawai_id: employeeIds[owner],
				wali_asuh_nama: `QA Wali Sama ${suffix}`,
				wali_asuh_nip: `QA-${suffix}-${owner}`,
				wali_asrama_nama: null,
				wali_asrama_nip: null
			})
		);
		await lifecycle.syncMuridGovernance(school.id, [id]);
		students.push(id);
		const link = await first('SELECT * FROM murid_identity_link WHERE murid_id=?', [id]);
		placements.push(
			await insert('asrama_penempatan', {
				sekolah_id: school.id,
				kamar_id: rooms[i === 2 ? 1 : 0],
				identity_uid: link.identity_uid,
				murid_id: id,
				mulai: yesterday,
				alasan: 'QA copy',
				nama_snapshot: `QA Anak ${i} ${suffix}`,
				kelas_snapshot: 'QA',
				petugas_id: admin.id
			})
		);
	}
	for (const room of rooms)
		for (const name of ['Kemandirian', 'Kedisiplinan']) {
			assert((await mutate(admin, room, { operation: 'master', nama: name })).message);
			const evaluation = await first(
				'SELECT id FROM asrama_evaluasi WHERE kamar_id=? AND semester_id=? AND nama=?',
				[room, period.id, name]
			);
			for (const description of ['Merapikan perlengkapan', 'Mematuhi jadwal'])
				assert(
					(
						await mutate(admin, room, {
							operation: 'goal',
							evaluasi_id: evaluation.id,
							indikator: 'Kebiasaan harian',
							deskripsi: description
						})
					).message
				);
		}
	const a = await service.dormEvaluationContext(event(users[0]));
	assert.deepEqual(
		a.students.map((s) => s.id),
		[students[0]]
	);
	assert.equal(a.rooms.length, 2);
	assert(a.canGrade && !a.canMaster && !a.canNote);
	assert.deepEqual(
		(await service.dormEvaluationContext(event(users[1]))).students.map((s) => s.id),
		[students[1]]
	);
	assert.equal((await service.dormEvaluationContext(event(users[2]))).students.length, 2);
	assert(!(await service.dormEvaluationContext(event(users[2]))).canGrade);
	await rejects(() => service.dormEvaluationContext(event({ ...users[0], sekolahId: 99999 })), 403);
	pass(
		'same-name caregivers isolated by employee ID; own wards across dorms; pupil without class included; warden cannot grade'
	);
	const rolePermissions = await vite.ssrLoadModule('/src/routes/pengguna/permissions.ts');
	const combined = {
		...users[0],
		type: 'user',
		roles: ['user', 'waka_keasramaan', 'wali_asuh'],
		permissions: rolePermissions.effectivePermissions({
			roles: ['user', 'waka_keasramaan', 'wali_asuh']
		})
	};
	const combinedContext = await service.dormEvaluationContext(event(combined));
	assert.deepEqual(
		combinedContext.students.map((s) => s.id),
		[students[0]]
	);
	assert.ok(combinedContext.canGrade);
	await rejects(
		() =>
			service.saveDormGrades(combinedContext, [
				{ placement: placements[1], goal: a.goals[0].id, category: 'baik' }
			]),
		403
	);
	pass('Combined dorm leadership and caregiver grades only own wards');
	const entries = a.goals.map((g, i) => ({
		placement: placements[0],
		goal: g.id,
		category: i % 2 ? 'baik' : 'sangat-baik'
	}));
	await service.saveDormGrades(a, entries);
	assert.equal(
		(await query('SELECT * FROM asrama_evaluasi_nilai WHERE penempatan_id=?', [placements[0]]))
			.length,
		4
	);
	await rejects(
		() => service.saveDormGrades(a, [{ ...entries[0], placement: placements[1] }]),
		403
	);
	await rejects(() => service.saveDormGrades(a, [{ ...entries[0], goal: 999999 }]), 403);
	await rejects(() => service.saveDormGrades(a, [{ ...entries[0], category: 'excellent' }]), 400);
	await service.saveDormGrades(a, [{ ...entries[0], category: '' }]);
	assert.equal(
		(await query('SELECT * FROM asrama_evaluasi_nilai WHERE penempatan_id=?', [placements[0]]))
			.length,
		3
	);
	await service.saveDormGrades(a, [entries[0]]);
	assert.equal(
		(
			await mutate(admin, rooms[0], {
				operation: 'edit-goal',
				tujuan_id: a.goals[0].id,
				indikator: 'X',
				deskripsi: 'X'
			})
		).status,
		409
	);
	pass(
		'caregiver can assess every evaluation; foreign wards/goals and invalid values rejected; explicit reset works; graded goals locked'
	);
	const pages = await vite.ssrLoadModule('/src/lib/server/dorm-evaluation-pages.ts');
	const pageEvent = (actor = admin, room = rooms[0], extra = {}) => ({
		...event(actor, room, extra),
		depends() {}
	});
	const postPage = async (operation, values, actor = admin, room = rooms[0]) => {
		const e = pageEvent(actor, room);
		const form = new FormData();
		for (const [key, value] of Object.entries(values))
			for (const item of Array.isArray(value) ? value : [value]) form.append(key, String(item));
		e.request = new Request(e.url, { method: 'POST', body: form });
		return operation === 'grade'
			? pages.saveDormGradePage(e)
			: pages.mutateDormMasterPage(e, operation);
	};
	assert(
		(
			await postPage('create', {
				nama: 'Editor lama',
				'indikator.0.deskripsi': 'Indikator tanpa tujuan'
			})
		).message
	);
	let masterView = await pages.loadDormMasterPage(pageEvent());
	const editor = masterView.mataEvaluasi.find((e) => e.nama === 'Editor lama');
	assert(editor?.indikator[0]);
	const indicatorId = editor.indikator[0].id;
	assert(
		(
			await postPage('goal-create', {
				indikatorId: indicatorId,
				deskripsi: 'Tujuan dari editor lama'
			})
		).message
	);
	let goalsView = await pages.loadDormGoalsPage(
		pageEvent(admin, rooms[0], { indikatorId: String(indicatorId) })
	);
	assert.equal(goalsView.tujuan.length, 1);
	assert(
		(
			await postPage('save', {
				mataEvaluasiId: editor.id,
				mataEvaluasiNama: 'Editor lama',
				'indikator.0.id': indicatorId,
				'indikator.0.deskripsi': 'Indikator diubah'
			})
		).message
	);
	goalsView = await pages.loadDormGoalsPage(
		pageEvent(admin, rooms[0], { indikatorId: String(indicatorId) })
	);
	assert.equal(goalsView.tujuan[0].indikator, 'Indikator diubah');
	assert.equal((await postPage('create', { nama: 'Dilarang' }, users[0])).status, 403);
	assert.equal((await postPage('bulkDelete', { ids: [a.evaluations[0].id] })).status, 409);
	const firstEvaluation = a.goals.find((g) => g.id === entries[0].goal).evaluasi_id;
	const gradeValues = {
		penempatan_id: placements[0],
		keasramaanId: firstEvaluation,
		[`nilai.${entries[0].goal}`]: 'baik'
	};
	assert((await postPage('grade', gradeValues, users[0])).message);
	assert.equal(
		(await postPage('grade', { ...gradeValues, penempatan_id: placements[1] }, users[0])).status,
		403
	);
	const inputView = await pages.loadDormInputPage(
		pageEvent(users[0], rooms[0], { keasramaan_id: String(firstEvaluation) })
	);
	assert.deepEqual(
		inputView.daftarMurid.map((s) => s.id),
		[placements[0]]
	);
	assert(inputView.daftarMurid[0].deskripsi);
	assert(!Object.hasOwn(inputView, 'user'));
	const gradeView = await pages.loadDormGradePage(
		pageEvent(users[0], rooms[0], {
			penempatan_id: String(placements[0]),
			keasramaan_id: String(firstEvaluation)
		})
	);
	assert.equal(gradeView.murid.id, students[0]);
	assert.equal(gradeView.tujuan.length, 2);
	assert(gradeView.indikators.length > 0);
	const selectedTemplate = await excel.dormEvaluationExcel(
		event(users[0], rooms[0], { evaluasi_id: String(firstEvaluation) }),
		true
	);
	const selectedBook = new ExcelJS.Workbook();
	await selectedBook.xlsx.load(await selectedTemplate.arrayBuffer());
	assert.equal(selectedBook.worksheets[0].rowCount, 3);
	const masterBook = new ExcelJS.Workbook();
	const masterSheet = masterBook.addWorksheet('Matev');
	masterSheet.addRows([
		['Matev', 'Indikator', 'Tujuan Pembelajaran'],
		['QA Excel lama', 'Membaca', 'Tujuan satu'],
		['', '', 'Tujuan dua'],
		['', 'Tanpa tujuan', '']
	]);
	const importForm = new FormData();
	importForm.set('file', new File([await masterBook.xlsx.writeBuffer()], 'matev.xlsx'));
	const importEvent = pageEvent();
	importEvent.request = new Request(importEvent.url, { method: 'POST', body: importForm });
	assert((await pages.importDormMasterPage(importEvent)).message);
	const imported = (await pages.loadDormMasterPage(pageEvent())).mataEvaluasi.find(
		(e) => e.nama === 'QA Excel lama'
	);
	assert.equal(imported.indikator.length, 2);
	assert.equal(
		(await query('SELECT * FROM asrama_evaluasi_tujuan WHERE evaluasi_id=?', [imported.id])).length,
		2
	);
	assert((await postPage('bulkDelete', { ids: imported.id })).message);
	await rejects(
		() =>
			pages.loadDormGradePage(
				pageEvent(users[0], rooms[0], {
					penempatan_id: String(placements[1]),
					keasramaan_id: String(firstEvaluation)
				})
			),
		403
	);
	await service.saveDormGrades(a, [entries[0]]);
	assert((await postPage('goal-delete', { ids: goalsView.tujuan.map((g) => g.id) })).message);
	assert((await postPage('bulkDelete', { ids: editor.id })).message);
	pass(
		'original master/indicator/goal and per-pupil form contracts restored; independent indicators, own wards and graded locks preserved'
	);
	assert(
		(
			await mutate(users[2], rooms[0], {
				operation: 'note',
				penempatan_id: placements[0],
				catatan: 'Sudah mandiri.'
			})
		).message
	);
	assert.equal(
		(
			await mutate(users[0], rooms[0], {
				operation: 'note',
				penempatan_id: placements[0],
				catatan: 'Invalid'
			})
		).status,
		403
	);
	assert(
		(
			await mutate(users[2], rooms[0], {
				operation: 'note',
				penempatan_id: placements[0],
				catatan: ''
			})
		).message
	);
	pass('dorm warden notes scoped separately; caregiver cannot edit notes; note can be cleared');
	const saveNote = async (action, values, actor = users[2], extra = {}) => {
		const e = pageEvent(actor, rooms[0], extra);
		const form = new FormData();
		for (const [key, value] of Object.entries(values)) form.set(key, String(value));
		e.request = new Request(e.url, { method: 'POST', body: form });
		return service.mutateDormEvaluation(e, action);
	};
	assert(
		(await saveNote('save', { muridId: placements[0], catatan: 'Catatan per baris' })).message
	);
	let notesView = await pages.loadDormNotesPage(pageEvent(users[2]));
	assert.equal(
		notesView.daftarCatatan.find((s) => s.id === placements[0]).catatan,
		'Catatan per baris'
	);
	assert(notesView.daftarCatatan.every((s) => s.canEdit));
	const noteTargets = JSON.stringify(placements.slice(0, 2));
	assert(
		(await saveNote('fillAll', { muridIds: noteTargets, catatan: 'Catatan bersama' })).message
	);
	assert.equal(
		(
			await saveNote('fillAll', {
				muridIds: JSON.stringify([placements[0], placements[2]]),
				catatan: 'Tidak sah'
			})
		).status,
		403
	);
	assert.equal(
		(await saveNote('fillAll', { muridIds: '{invalid', catatan: 'Tidak sah' })).status,
		400
	);
	assert.equal(
		(await saveNote('fillAll', { muridIds: noteTargets, catatan: 'Tidak sah' }, users[0])).status,
		403
	);
	assert.equal(
		(
			await saveNote('fillAll', { muridIds: noteTargets, catatan: 'Tidak sah' }, users[2], {
				riwayat: '1'
			})
		).status,
		403
	);
	notesView = await pages.loadDormNotesPage(pageEvent(users[2]));
	assert(notesView.daftarCatatan.every((s) => s.catatan === 'Catatan bersama'));
	assert(
		(await pages.loadDormNotesPage(pageEvent(users[2], rooms[0], { q: 'no-such-pupil' })))
			.daftarCatatan.length === 0
	);
	assert((await saveNote('fillAll', { muridIds: noteTargets, catatan: '' })).message);
	assert(
		(await pages.loadDormNotesPage(pageEvent(users[2]))).daftarCatatan.every((s) => !s.catatan)
	);
	let recapView = await pages.loadDormRecapPage(pageEvent());
	assert.equal(recapView.legerRows.length, 2);
	assert.equal(recapView.summary.totalMurid, 2);
	assert.equal(recapView.legerRows[0].id, placements[0]);
	assert.equal(recapView.legerRows[0].peringkat, 1);
	assert.equal(
		recapView.legerRows[0].matevScores[0].score,
		service.evaluationAverage(
			a.goals,
			(await service.dormEvaluationContext(event())).grades,
			placements[0],
			a.evaluations[0].id
		)
	);
	const detailView = await pages.loadDormRecapDetailPage(
		pageEvent(users[0], rooms[0], { penempatan_id: String(placements[0]), q: 'QA', page: '1' })
	);
	assert.equal(detailView.status, 'ready');
	assert.equal(detailView.murid.id, students[0]);
	assert.equal(detailView.ringkasan.rataRata, recapView.legerRows[0].nilaiRataRata);
	assert(detailView.tertinggi.length > 0 && detailView.terendah.length > 0);
	assert(detailView.backUrl.includes('kamar_id=') && detailView.backUrl.includes('q=QA'));
	assert(detailView.daftarNilai.some((e) => e.tujuanDinilai > 0));
	await rejects(
		() =>
			pages.loadDormRecapDetailPage(
				pageEvent(users[0], rooms[0], { penempatan_id: String(placements[1]) })
			),
		403
	);
	recapView = await pages.loadDormRecapPage(pageEvent(users[0]));
	assert.deepEqual(
		recapView.legerRows.map((s) => s.id),
		[placements[0]]
	);
	assert.equal(
		(await pages.loadDormRecapPage(pageEvent(admin, rooms[0], { q: 'no-such-pupil' }))).daftarNilai
			.length,
		0
	);
	pass(
		'original notes and recap contracts restored; individual/bulk save atomic and scoped; detail, leger, ranking and caregiver boundaries preserved'
	);
	const download = await excel.dormEvaluationExcel(event(users[0]), true);
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(await download.arrayBuffer());
	assert.equal(workbook.worksheets[0].rowCount, 5);
	workbook.worksheets[0].getCell('H2').value = 'cukup';
	workbook.worksheets[0].addRow([
		placements[1],
		a.goals[0].id,
		'Other child',
		'',
		'',
		'',
		'',
		'baik'
	]);
	const f = new FormData();
	f.set('kamar_id', String(rooms[0]));
	f.set('semester_id', String(period.id));
	f.set('file', new File([await workbook.xlsx.writeBuffer()], 'nilai.xlsx'));
	const e = event(users[0]);
	e.request = new Request(e.url, {
		method: 'POST',
		headers: { accept: 'application/json' },
		body: f
	});
	const beforeGrades = digest(await query('SELECT * FROM asrama_evaluasi_nilai ORDER BY id'));
	assert.equal((await excel.dormEvaluationExcel(e, false)).status, 400);
	assert.equal(
		digest(await query('SELECT * FROM asrama_evaluasi_nilai ORDER BY id')),
		beforeGrades
	);
	pass(
		'Excel includes own wards only; one unauthorized row aborts complete import without partial save'
	);
	workbook.worksheets[0].spliceRows(6, 1);
	// Blank cells keep stored grades; valid rows commit together.
	workbook.worksheets[0].getCell('H3').value = '';
	const validImport = new FormData();
	validImport.set('kamar_id', String(rooms[0]));
	validImport.set('semester_id', String(period.id));
	validImport.set('file', new File([await workbook.xlsx.writeBuffer()], 'nilai.xlsx'));
	e.request = new Request(e.url, {
		method: 'POST',
		headers: { accept: 'application/json' },
		body: validImport
	});
	assert.equal((await excel.dormEvaluationExcel(e, false)).status, 200);
	assert.equal(
		(
			await first(
				'SELECT kategori FROM asrama_evaluasi_nilai WHERE penempatan_id=? AND tujuan_id=?',
				[placements[0], a.goals[0].id]
			)
		).kategori,
		'cukup'
	);
	assert.equal(
		(await query('SELECT id FROM asrama_evaluasi_nilai WHERE penempatan_id=?', [placements[0]]))
			.length,
		4
	);
	pass('valid Excel import succeeds; blank cells preserve existing grades');
	await client.execute({
		sql: 'UPDATE murid SET wali_asuh_pegawai_id=? WHERE id=?',
		args: [employeeIds[1], students[0]]
	});
	await rejects(() => service.saveDormGrades(a, [entries[0]]), 409);
	await client.execute({
		sql: 'UPDATE murid SET wali_asuh_pegawai_id=? WHERE id=?',
		args: [employeeIds[0], students[0]]
	});
	const academicGuard = await vite.ssrLoadModule('/src/lib/server/academic-assessment-access.ts');
	const teacherRow = await first(
		`SELECT u.id FROM auth_user u WHERE u.sekolah_id=? AND u.roles='["user"]' AND EXISTS(SELECT 1 FROM auth_user_kelas a WHERE a.auth_user_id=u.id) AND EXISTS(SELECT 1 FROM murid m WHERE m.sekolah_id=u.sekolah_id AND m.semester_id=? AND m.kelas_id IS NOT NULL AND m.kelas_id NOT IN(SELECT a.kelas_id FROM auth_user_kelas a WHERE a.auth_user_id=u.id) AND m.kelas_id<>coalesce(u.kelas_id,-1) AND NOT EXISTS(SELECT 1 FROM kelas k WHERE k.id=m.kelas_id AND k.wali_kelas_id=u.pegawai_id)) LIMIT 1`,
		[school.id, period.id]
	);
	assert(teacherRow);
	const teacher = await db.query.tableAuthUser.findFirst({
		where: (t, { eq }) => eq(t.id, teacherRow.id)
	});
	assert(teacher);
	const allowedClasses = await query('SELECT kelas_id FROM auth_user_kelas WHERE auth_user_id=?', [
		teacher.id
	]);
	const classId = Number(allowedClasses[0]?.kelas_id ?? teacher.kelasId);
	assert(classId);
	const classStudent = await first(
		'SELECT m.id FROM murid m JOIN kelas k ON k.id=m.kelas_id WHERE m.sekolah_id=? AND k.id=? LIMIT 1',
		[school.id, classId]
	);
	if (classStudent)
		await academicGuard.assertAcademicAssessmentAccess(
			{ user: teacher, sekolah: school },
			Number(classStudent.id),
			classId,
			teacher.mataPelajaranId
		);
	const other = await first(
		'SELECT m.id,m.kelas_id FROM murid m WHERE m.sekolah_id=? AND m.semester_id=? AND m.kelas_id IS NOT NULL AND m.kelas_id NOT IN(SELECT kelas_id FROM auth_user_kelas WHERE auth_user_id=?) AND m.kelas_id<>? LIMIT 1',
		[school.id, period.id, teacher.id, classId]
	);
	assert(other);
	await rejects(
		() =>
			academicGuard.assertAcademicAssessmentAccess(
				{ user: teacher, sekolah: school },
				Number(other.id),
				Number(other.kelas_id)
			),
		403
	);
	await rejects(
		() =>
			academicGuard.assertAcademicAssessmentAccess(
				{ user: users[0], sekolah: school },
				Number(other.id),
				Number(other.kelas_id)
			),
		403
	);
	pass(
		'stale caregiver assignment rejected inside transaction; academic teacher restricted to assigned class'
	);
	for (const route of ['asesmen-formatif', 'asesmen-sumatif']) {
		const handlers = await vite.ssrLoadModule(
			'/src/routes/(input-nilai)/' + route + '/formulir-asesmen/+page.server.ts'
		);
		const subject = await first('SELECT id FROM mata_pelajaran WHERE kelas_id=? LIMIT 1', [
			other.kelas_id
		]);
		assert(subject);
		const denied = {
			locals: { user: teacher, sekolah: school },
			url: new URL('http://localhost/?murid_id=' + other.id + '&mapel_id=' + subject.id),
			depends: () => {}
		};
		await rejects(() => handlers.load(denied), 403);
		const form = new FormData();
		form.set('muridId', String(other.id));
		form.set('mapelId', String(subject.id));
		await rejects(
			() =>
				handlers.actions.save({
					...denied,
					request: new Request(denied.url, { method: 'POST', body: form })
				}),
			403
		);
	}
	const view = await service.loadDormEvaluation(event(admin), 'input');
	assert(!Object.hasOwn(view, 'user'), 'Page data must preserve layout account context');
	const legacy = {
		id: await insert(
			'keasramaan',
			clone(await first('SELECT * FROM keasramaan LIMIT 1'), {
				nama: `QA legacy ${suffix}`,
				kelas_id: original.kelas_id
			})
		)
	};
	const legacyIndicator = await insert(
		'keasramaan_indikator',
		clone(await first('SELECT * FROM keasramaan_indikator LIMIT 1'), {
			keasramaan_id: legacy.id,
			deskripsi: 'QA indikator'
		})
	);
	await insert(
		'keasramaan_tujuan',
		clone(await first('SELECT * FROM keasramaan_tujuan LIMIT 1'), {
			indikator_id: legacyIndicator,
			deskripsi: 'QA tujuan'
		})
	);
	const beforeLegacyCopy = Number((await first('SELECT count(*) n FROM asrama_evaluasi_nilai')).n);
	assert(
		(await mutate(admin, rooms[1], { operation: 'copy-legacy', sumber_lama_id: legacy.id })).message
	);
	assert.equal(
		Number((await first('SELECT count(*) n FROM asrama_evaluasi_nilai')).n),
		beforeLegacyCopy
	);
	assert(
		await first('SELECT id FROM asrama_evaluasi WHERE kamar_id=? AND sumber_lama_id=?', [
			rooms[1],
			legacy.id
		])
	);
	const copied = await first(
		'SELECT id FROM asrama_evaluasi WHERE kamar_id=? AND sumber_lama_id=?',
		[rooms[1], legacy.id]
	);
	assert.equal(
		(await query('SELECT id FROM asrama_evaluasi_tujuan WHERE evaluasi_id=?', [copied.id])).length,
		1
	);
	await client.execute({
		sql: 'DELETE FROM asrama_evaluasi_tujuan WHERE evaluasi_id=?',
		args: [copied.id]
	});
	await client.execute({ sql: 'DELETE FROM asrama_evaluasi WHERE id=?', args: [copied.id] });
	await client.execute({ sql: 'DELETE FROM keasramaan WHERE id=?', args: [legacy.id] });
	pass(
		'academic load and save reject wrong class; dorm page preserves layout user; legacy copy creates master without grades'
	);
	const preview = await vite.ssrLoadModule('/src/routes/cetak/keasramaan/preview-data.ts');
	const pdfUrl = new URL(
		`http://localhost/cetak/keasramaan.pdf?murid_id=${students[0]}&penempatan_id=${placements[0]}&semester_id=${period.id}`
	);
	globalThis.__dormQaEvent = { locals, route: { id: '/cetak-raport' } };
	const payload = await preview.getKeasramaanPreviewPayload({ locals, url: pdfUrl });
	assert.equal(payload.keasramaanData.rombel.label, 'Asrama');
	assert.equal(payload.keasramaanData.keasramaanRows.filter((r) => !r.kategoriHeader).length, 2);
	const printPage = await vite.ssrLoadModule('/src/routes/cetak-raport/+page.server.ts');
	const printEvent = event(users[0], rooms[0], { bagian: 'asrama' });
	printEvent.parent = async () => ({ academicContext: null });
	const printData = await printPage.load(printEvent);
	assert.equal(printData.kelasId, null);
	assert.equal(printData.dormReport.semesterId, period.id);
	assert.deepEqual(
		printData.daftarMurid.map((s) => s.id),
		[students[0]]
	);
	assert.equal(printData.daftarMurid[0].penempatan_id, placements[0]);
	await rejects(
		() => printPage.load({ ...printEvent, url: event(users[0], 999999, { bagian: 'asrama' }).url }),
		403
	);
	pass(
		'original print controls receive dorm-scoped wards and placement IDs, including pupil without class'
	);
	const pdfRoute = await vite.ssrLoadModule('/src/routes/cetak/keasramaan.pdf/+server.ts');
	renderer = await vite.ssrLoadModule('/src/lib/server/pdf/pagedpdf.ts');
	const response = await pdfRoute.GET({ locals, url: pdfUrl });
	assert.equal(response.status, 200);
	const bytes = new Uint8Array(await response.arrayBuffer());
	assert((await PDFDocument.load(bytes)).getPageCount() > 0);
	await writeFile(path.join(folder, 'asrama-no-class.pdf'), bytes);
	const tokenRoute = await vite.ssrLoadModule('/src/routes/api/pdf/token/+server.ts');
	const tokens = await tokenRoute.POST({
		locals,
		request: new Request('http://localhost/api/pdf/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				docType: 'keasramaan',
				muridId: students[0],
				penempatanId: placements[0],
				semesterId: period.id
			})
		})
	});
	const tokenPdf = await vite.ssrLoadModule('/src/routes/cetak/pdf/[slug]/[token]/+server.ts');
	const tokenParams = await tokens.json();
	const tokenStore = await vite.ssrLoadModule('/src/lib/server/pdf/token-store.ts');
	const stored = tokenStore.consumePdfParams(tokenParams.token);
	assert.equal(stored.penempatanId, placements[0]);
	assert.equal(stored.semesterId, period.id);
	tokenParams.token = tokenStore.storePdfParams(stored);
	assert.equal((await tokenPdf.GET({ locals, params: tokenParams })).status, 200);
	const bulkRoute = await vite.ssrLoadModule('/src/routes/api/pdf/bulk/+server.ts');
	const bulkRequest = (penempatanIds) => ({
		locals,
		request: new Request('http://localhost/api/pdf/bulk', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				docType: 'keasramaan',
				muridIds: [students[0]],
				penempatanIds,
				semesterId: period.id
			})
		})
	});
	const bulkResponse = await bulkRoute.POST(bulkRequest({ [students[0]]: placements[0] }));
	assert.equal(bulkResponse.status, 200);
	assert((await PDFDocument.load(await bulkResponse.arrayBuffer())).getPageCount() > 0);
	await rejects(() => bulkRoute.POST(bulkRequest({})), 400);
	await rejects(() => bulkRoute.POST(bulkRequest({ [students[0]]: placements[2] })), 404);
	await rejects(
		() =>
			preview.getKeasramaanPreviewPayload({
				locals: { user: users[1], sekolah: school },
				url: pdfUrl
			}),
		403
	);
	pass(
		'direct PDF and token PDF valid for pupil without class; room label and caregiver permission retained'
	);
	const identity = await first('SELECT identity_uid FROM murid_identity_link WHERE murid_id=?', [
		students[0]
	]);
	const year = await first('SELECT * FROM tahun_ajaran WHERE id=?', [period.tahun_ajaran_id]);
	const history = await insert('murid_riwayat_kelas', {
		sekolah_id: school.id,
		murid_id: students[0],
		identity_key: `uid:${identity.identity_uid}`,
		tahun_ajaran_id: year.id,
		semester_id: period.id,
		kelas_id: original.kelas_id,
		nama_snapshot: `QA Anak 0 ${suffix}`,
		nis_snapshot: `QAE${suffix}0`,
		nisn_snapshot: '',
		tahun_ajaran_snapshot: year.nama,
		semester_snapshot: period.nama,
		kelas_snapshot: 'QA kelas sebelumnya',
		status_snapshot: 'aktif',
		recorded_at: new Date().toISOString()
	});
	const archive = await vite.ssrLoadModule('/src/lib/server/report-archive.ts');
	const info = await archive.historicalReportInfo(locals, history, 'asrama', 'ras');
	assert.equal(info.dormPlacementId, placements[0]);
	assert.equal(info.coverage.expected, 4);
	assert.equal(info.coverage.status, 'nilai_inti_lengkap');
	const archiveInput = {
		action: 'preview',
		confirmMetadata: true,
		metadata: {
			...info.metadata,
			npsn: '00001234',
			schoolName: 'Sekolah QA Asrama',
			principalName: 'Kepala Sekolah QA',
			teacherName: 'Wali Asrama QA',
			caregiverName: 'Wali Asuh QA',
			principalNip: '',
			teacherNip: '',
			caregiverNip: '',
			address: 'Alamat QA Bengkulu',
			place: 'Bengkulu',
			date: today
		}
	};
	const archiveRequest = new Request('http://localhost/api/rapor-arsip', { method: 'POST' });
	const archivePreview = await archive.previewOrFinalizeReport(
		locals,
		history,
		'asrama',
		'ras',
		archiveInput,
		archiveRequest
	);
	assert(archivePreview.bytes.length > 1000);
	const finalized = await archive.previewOrFinalizeReport(
		locals,
		history,
		'asrama',
		'ras',
		{
			...archiveInput,
			action: 'finalize',
			confirmFinal: true,
			expectedHash: archivePreview.hash
		},
		archiveRequest
	);
	assert(finalized.final);
	pass('dorm archive coverage and finalization use placement even without current class');
	const beforeMove = digest(
		await query('SELECT * FROM asrama_evaluasi_nilai WHERE penempatan_id=? ORDER BY id', [
			placements[0]
		])
	);
	await client.execute({
		sql: 'UPDATE murid SET kelas_id=? WHERE id=?',
		args: [original.kelas_id, students[0]]
	});
	assert.equal((await service.dormEvaluationContext(event(users[0]))).grades.length, 4);
	await client.execute({ sql: 'UPDATE murid SET kelas_id=NULL WHERE id=?', args: [students[0]] });
	await client.execute({
		sql: 'UPDATE asrama_penempatan SET selesai=?,selesai_alasan=? WHERE id=?',
		args: [today, 'QA pindah', placements[0]]
	});
	const ended = await service.dormEvaluationContext(event(users[0], rooms[0], { riwayat: '1' }));
	assert(!ended.canGrade);
	assert.equal(ended.grades.length, 4);
	await rejects(() => service.saveDormGrades(a, [entries[0]]), 409);
	const link = await first('SELECT * FROM murid_identity_link WHERE murid_id=?', [students[0]]);
	const newPlacement = await insert('asrama_penempatan', {
		sekolah_id: school.id,
		kamar_id: rooms[1],
		identity_uid: link.identity_uid,
		murid_id: students[0],
		sebelumnya_id: placements[0],
		mulai: today,
		alasan: 'QA pindah',
		nama_snapshot: `QA Anak 0 ${suffix}`,
		kelas_snapshot: '',
		petugas_id: admin.id
	});
	const moved = await service.dormEvaluationContext(event(users[0], rooms[1]));
	assert(moved.students.some((s) => s.penempatan_id === newPlacement));
	assert(!moved.grades.length);
	assert.deepEqual(
		Buffer.from(await archive.archivedReportPdf(locals, history, 'asrama', 'ras')),
		Buffer.from(finalized.bytes)
	);
	assert.equal(
		(await archive.historicalReportInfo(locals, history, 'asrama', 'ras')).metadata.schoolName,
		'Sekolah QA Asrama'
	);
	await service.saveDormGrades(moved, [
		{ placement: newPlacement, goal: moved.goals[0].id, category: 'baik' }
	]);
	await rejects(() => archive.historicalReportInfo(locals, history, 'asrama', 'ras', true), 409);
	pass(
		'final PDF unchanged after dorm movement; live archive rejects ambiguous multiple graded placements'
	);
	assert.equal(
		digest(
			await query('SELECT * FROM asrama_evaluasi_nilai WHERE penempatan_id=? ORDER BY id', [
				placements[0]
			])
		),
		beforeMove
	);
	const lifecycleRow = await first(
		'SELECT identity_key FROM murid_lifecycle WHERE last_murid_id=?',
		[students[0]]
	);
	await client.execute({
		sql: "UPDATE murid_lifecycle SET status='keluar' WHERE sekolah_id=? AND identity_key=?",
		args: [school.id, lifecycleRow.identity_key]
	});
	assert(
		!(await service.dormEvaluationContext(event(users[0], rooms[1]))).students.some(
			(s) => s.id === students[0]
		)
	);
	pass(
		'class movement preserves grades/caregiver; dorm movement creates empty new assessment and read-only old placement; inactive pupils excluded'
	);
	for (const t of oldTables)
		assert.equal(
			digest(await query(`SELECT * FROM ${t} ORDER BY id`)),
			oldRows[t],
			`${t} unchanged`
		);
	assert.equal((await query('PRAGMA foreign_key_check')).length, 0);
	const auth = await vite.ssrLoadModule('/src/lib/server/auth.ts');
	const token = await auth.createSession(admin.id);
	await writeFile(
		path.join(folder, 'ui-fixture.json'),
		JSON.stringify(
			{
				database,
				schoolId: school.id,
				token,
				rooms,
				students,
				placements,
				periodId: period.id,
				userIds
			},
			null,
			2
		)
	);
	await writeFile('tmp/dorm-evaluation-latest.json', JSON.stringify({ folder, database }));
	await writeFile(
		path.join(folder, 'results.json'),
		JSON.stringify({ checks, legacyUnchanged: true, foreignKeyErrors: 0 }, null, 2)
	);
	console.log('QA artifacts:', folder);
} finally {
	delete globalThis.__dormQaEvent;
	if (renderer) await (await renderer.getBrowser()).close();
	if (connection) await connection.closeDbClient();
	await vite.close();
	client.close();
}
process.exit(0);
