import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { createServer } from 'vite';

await mkdir('tmp', { recursive: true });
const folder = await mkdtemp(path.resolve('tmp/user-roles-'));
const database = path.join(folder, 'database.sqlite3');
const source = createClient({ url: 'file:data/database.sqlite3' });
try {
	await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
} finally {
	source.close();
}
process.env.DB_URL = `file:${database.replaceAll('\\', '/')}`;
let client = createClient({ url: process.env.DB_URL });
const query = async (sql, args = []) => (await client.execute({ sql, args })).rows;
const one = async (sql, args = []) => (await query(sql, args))[0];
const insert = async (table, row) => {
	const { id, ...value } = { created_at: new Date().toISOString(), ...row };
	void id;
	const keys = Object.keys(value);
	return Number(
		(
			await client.execute({
				sql: `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
				args: Object.values(value)
			})
		).lastInsertRowid
	);
};
// Reconstruct legacy roles on copy to exercise first-run migration.
if ((await query('PRAGMA table_info(auth_user)')).some((row) => row.name === 'roles')) {
	await client.execute(
		`UPDATE auth_user SET jabatan_akses=(SELECT value FROM json_each(auth_user.roles) WHERE value IN ('kepala_sekolah','waka_kurikulum','waka_kesiswaan','waka_sarpras','waka_keasramaan','waka_humas','operator') LIMIT 1)`
	);
	await client.execute('ALTER TABLE auth_user DROP COLUMN roles');
}
const legacyAccounts = await query('SELECT * FROM auth_user ORDER BY id');
const protectedTables = [
	'auth_user_kelas',
	'auth_user_mata_pelajaran',
	'kelas',
	'murid',
	'asesmen_sumatif',
	'asrama_evaluasi_nilai'
];
const originalRows = new Map();
for (const table of protectedTables)
	originalRows.set(table, await query('SELECT * FROM ' + table + ' ORDER BY id'));
const pass = (name) => console.log('PASS', name);
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
				if (id === '\0$app/server')
					return 'export const getRequestEvent=()=>globalThis.__rolesQaEvent;';
				if (id === '\0$app/navigation')
					return 'export const goto=()=>{};export const preloadData=()=>{};export const pushState=()=>{};';
			}
		}
	],
	server: { middlewareMode: true, hmr: false, watch: null },
	optimizeDeps: { noDiscovery: true, include: [] },
	appType: 'custom',
	logLevel: 'error'
});
let connection;
try {
	connection = await vite.ssrLoadModule('/src/lib/server/db/index.ts');
	assert.equal(connection.databaseUrl, process.env.DB_URL);
	const migration = await vite.ssrLoadModule('/src/lib/server/db/ensure-user-roles.ts');
	await migration.ensureUserRolesSchema();
	client.close();
	client = createClient({ url: process.env.DB_URL });
	const migrated = await query('SELECT * FROM auth_user ORDER BY id /* roles migrated */');
	assert.equal(migrated.length, legacyAccounts.length);
	for (let i = 0; i < migrated.length; i++) {
		const { roles, jabatan_akses, ...after } = migrated[i];
		const { jabatan_akses: beforePosition, ...before } = legacyAccounts[i];
		assert.deepEqual(
			Object.keys(after).filter(
				(key) => JSON.stringify(after[key]) !== JSON.stringify(before[key])
			),
			[],
			'No account column changed'
		);
		assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort());
		assert.equal(jabatan_akses, null);
		assert.ok(JSON.parse(roles).length);
		if (beforePosition) assert.ok(JSON.parse(roles).includes(beforePosition));
	}
	for (const table of protectedTables)
		assert.deepEqual(
			await query('SELECT * FROM ' + table + ' ORDER BY id'),
			originalRows.get(table)
		);
	migration.resetUserRolesSchema();
	await migration.ensureUserRolesSchema();
	assert.ok(
		JSON.stringify(await query('SELECT * FROM auth_user ORDER BY id /* roles migrated */')) ===
			JSON.stringify(migrated),
		'Migration repeat unchanged'
	);
	pass(
		'Legacy role migration idempotent; accounts, credentials, teaching links, students and history unchanged'
	);
	const auth = await vite.ssrLoadModule('/src/lib/server/auth.ts');
	const homeroom = await vite.ssrLoadModule('/src/lib/server/legacy-wali-kelas.ts');
	const management = await vite.ssrLoadModule('/src/lib/server/kelas-manage.ts');
	const permissions = await vite.ssrLoadModule('/src/routes/pengguna/permissions.ts');
	const registry = await vite.ssrLoadModule('/src/lib/server/student-registry.ts');
	const notes = await vite.ssrLoadModule(
		'/src/routes/(input-nilai)/catatan-wali-kelas/+page.server.ts'
	);
	const finalStatus = await vite.ssrLoadModule(
		'/src/routes/(input-nilai)/status-akhir/+page.server.ts'
	);
	const formative = await vite.ssrLoadModule(
		'/src/routes/(input-nilai)/asesmen-formatif/formulir-asesmen/+page.server.ts'
	);
	const bulk = await vite.ssrLoadModule('/src/lib/server/bulk-user.ts');
	const summaries = await vite.ssrLoadModule('/src/lib/server/assignment-summary.ts');
	const seedClass = await one(
		'SELECT k.* FROM kelas k JOIN semester s ON s.id=k.semester_id JOIN tahun_ajaran t ON t.id=s.tahun_ajaran_id WHERE s.is_aktif=1 AND t.is_aktif=1 LIMIT 1'
	);
	assert.ok(seedClass, 'Active period required for copy test');
	const school = Number(seedClass.sekolah_id);
	const semester = Number(seedClass.semester_id);
	const tag = randomUUID();
	const employee = await insert('pegawai', {
		sekolah_id: school,
		nama: `QA Guru ${tag}`,
		nip: '',
		jenis: 'guru',
		status: 'aktif'
	});
	const ownClass = await insert('kelas', {
		...seedClass,
		nama: `QA Wali ${tag}`,
		wali_kelas_id: employee
	});
	const otherClass = await insert('kelas', {
		...seedClass,
		nama: `QA Lain ${tag}`,
		wali_kelas_id: null
	});
	const password = `Qa-${randomUUID()}!`;
	const hash = auth.hashPassword(password);
	const username = `qa-${tag}`;
	const account = await insert('auth_user', {
		username,
		username_normalized: username,
		password_hash: hash.hash,
		password_salt: hash.salt,
		type: 'user',
		sekolah_id: school,
		pegawai_id: employee,
		permissions: '[]',
		must_change_password: 0
	});
	for (const kelas of [ownClass, otherClass])
		await insert('auth_user_kelas', { auth_user_id: account, kelas_id: kelas });
	let user = { ...(await auth.authenticateUser(username, password)), waliKelasIds: [] };
	user.waliKelasIds = await homeroom.getLegacyWaliKelasIds(user, school);
	user.permissions = permissions.effectivePermissions(user);
	assert.deepEqual(user.waliKelasIds, [ownClass]);
	assert.ok(await management.canManageKelas(user, school, ownClass));
	assert.equal(await management.canManageKelas(user, school, otherClass), false);
	assert.equal(user.type, 'user');
	pass('Teacher retains teaching role; homeroom authority follows Data Kelas only');
	const seedStudent = await one('SELECT * FROM murid WHERE sekolah_id=? LIMIT 1', [school]);
	assert.ok(seedStudent);
	const ownStudent = await insert('murid', {
		...seedStudent,
		semester_id: semester,
		kelas_id: ownClass,
		nama: `QA Anak ${tag}`,
		nis: `qa-${tag}`,
		nisn: '',
		wali_asuh_pegawai_id: null,
		dapodik_peserta_didik_id: null,
		dapodik_anggota_rombel_id: null
	});
	const foreignStudent = await insert('murid', {
		...seedStudent,
		semester_id: semester,
		kelas_id: otherClass,
		nama: `QA Lain ${tag}`,
		nis: `qa-other-${tag}`,
		nisn: '',
		wali_asuh_pegawai_id: null,
		dapodik_peserta_didik_id: null,
		dapodik_anggota_rombel_id: null
	});
	const locals = { user, sekolah: { id: school } };
	const event = (pathname, fields = {}) => {
		const form = new FormData();
		for (const [key, value] of Object.entries(fields))
			for (const item of [].concat(value)) form.append(key, String(item));
		const url = new URL(pathname, 'http://localhost');
		return {
			locals,
			url,
			cookies: { get: () => undefined },
			depends: () => {},
			params: {},
			request: new Request(url, { method: 'POST', body: form })
		};
	};
	const governance = await vite.ssrLoadModule('/src/lib/server/murid-lifecycle.ts');
	const passiveStudent = await insert('murid', {
		...seedStudent,
		semester_id: semester,
		kelas_id: null,
		nama: `QA Pasif ${tag}`,
		nis: `qa-passive-${tag}`,
		nisn: '',
		wali_asuh_pegawai_id: null,
		dapodik_peserta_didik_id: null,
		dapodik_anggota_rombel_id: null
	});
	await governance.syncMuridGovernance(school, [passiveStudent]);
	assert.equal(
		(
			await registry.studentRegistryActions.assign(
				event('/murid', { muridId: passiveStudent, kelasId: otherClass })
			)
		).status,
		403
	);
	const assignment = await registry.studentRegistryActions.assign(
		event('/murid', { muridId: passiveStudent, kelasId: ownClass })
	);
	assert.equal(assignment.success, true);
	assert.equal(
		Number((await one('SELECT kelas_id FROM murid WHERE id=?', [passiveStudent])).kelas_id),
		ownClass
	);
	pass('Passive pupil can be assigned only to own homeroom');
	const listing = await registry.loadStudentRegistry(event('/murid'), 'kelas');
	assert.deepEqual(
		listing.registry.classes.map((row) => row.id),
		[ownClass]
	);
	assert.equal(
		(
			await notes.actions.save(
				event('/catatan-wali-kelas', { muridId: ownStudent, catatan: 'QA catatan' })
			)
		).message,
		'Catatan tersimpan'
	);
	assert.equal(
		(
			await notes.actions.save(
				event('/catatan-wali-kelas', { muridId: foreignStudent, catatan: 'Forbidden' })
			)
		).status,
		403
	);
	assert.equal(
		(
			await notes.actions.fillAll(
				event('/catatan-wali-kelas', {
					muridIds: JSON.stringify([ownStudent, foreignStudent]),
					catatan: 'Forbidden'
				})
			)
		).status,
		403
	);
	assert.equal(
		(await one('SELECT catatan FROM catatan_wali_kelas WHERE murid_id=?', [ownStudent])).catatan,
		'QA catatan'
	);
	assert.equal(
		(
			await finalStatus.actions.save(
				event('/status-akhir', { muridId: foreignStudent, status: 'Lulus' })
			)
		).status,
		403
	);
	const routeUtils = await vite.ssrLoadModule('/src/lib/server/route-utils.ts');
	await routeUtils.assertHomeroomDocumentAccess(locals, ownStudent);
	await assert.rejects(
		() => routeUtils.assertHomeroomDocumentAccess(locals, foreignStudent),
		(cause) => cause.status === 403
	);
	pass('Homeroom list, notes, final status and report documents reject other teaching classes');
	const seedMapel = await one('SELECT * FROM mata_pelajaran LIMIT 1');
	const mapel = await insert('mata_pelajaran', {
		...seedMapel,
		kelas_id: ownClass,
		nama: `QA Pelajaran ${tag}`,
		pengampu_id: employee
	});
	const wrongMapel = await insert('mata_pelajaran', {
		...seedMapel,
		kelas_id: ownClass,
		nama: `QA Tidak Ditugaskan ${tag}`,
		pengampu_id: null
	});
	await insert('auth_user_mata_pelajaran', { auth_user_id: account, mata_pelajaran_id: mapel });
	await formative.load(
		event(`/asesmen-formatif/formulir-asesmen?murid_id=${ownStudent}&mapel_id=${mapel}`)
	);
	await formative.load(
		event(`/asesmen-formatif/formulir-asesmen?murid_id=${ownStudent}&mapel_id=${wrongMapel}`)
	);
	pass('Homeroom teacher can assess every subject in own class');
	await client.execute({
		sql: 'DELETE FROM auth_user_kelas WHERE auth_user_id=? AND kelas_id=?',
		args: [account, ownClass]
	});
	await formative.load(
		event(`/asesmen-formatif/formulir-asesmen?murid_id=${ownStudent}&mapel_id=${mapel}`)
	);
	const homeroomOnly = await insert('pegawai', {
		sekolah_id: school,
		nama: `QA Wali Saja ${tag}`,
		nip: '',
		jenis: 'guru',
		status: 'aktif'
	});
	await insert('kelas', { ...seedClass, nama: `QA Wali Saja ${tag}`, wali_kelas_id: homeroomOnly });
	const teachers = await bulk.buildBulkUserPreview(school, 'user');
	assert.notEqual(
		teachers.candidates.find((row) => row.pegawaiId === homeroomOnly).status,
		'blocked'
	);
	assert.equal(
		teachers.candidates.find((row) => row.pegawaiId === homeroomOnly).kelasIds.length,
		0
	);
	pass('Homeroom-only account supported without fictional teaching assignments');
	const guardian = await insert('pegawai', {
		sekolah_id: school,
		nama: `QA Wali Asrama ${tag}`,
		nip: '',
		jenis: 'wali_asrama',
		status: 'aktif'
	});
	const roomGroup = await insert('asrama', {
		sekolah_id: school,
		nama: `QA Asrama ${tag}`,
		nama_key: `qa-${tag}`,
		kategori: 'putra'
	});
	const room = await insert('asrama_kamar', {
		sekolah_id: school,
		asrama_id: roomGroup,
		nama: 'QA Kosong',
		nama_key: `qa-${tag}`,
		kapasitas: 10
	});
	await insert('asrama_penugasan', {
		sekolah_id: school,
		kamar_id: room,
		pegawai_id: guardian,
		peran: 'utama',
		mulai: '2020-01-01',
		nama_snapshot: `QA ${tag}`,
		alasan: 'QA',
		petugas_id: account
	});
	const preview = await bulk.buildBulkUserPreview(school, 'wali_asrama');
	const candidate = preview.candidates.find((row) => row.pegawaiId === guardian);
	assert.ok(candidate);
	assert.notEqual(candidate.status, 'blocked');
	assert.equal(candidate.studentIds.length, 0);
	assert.ok(candidate.rooms.some((name) => name.includes('QA Kosong')));
	const summary = (
		await summaries.getAssignmentSummaries(
			[{ id: -123, type: 'wali_asrama', pegawaiId: guardian }],
			school,
			semester,
			seedClass.tahun_ajaran_id
		)
	).get(-123);
	assert.ok(summary.includes('QA Kosong'));
	assert.ok(summary.includes('0 murid aktif'));
	pass('Empty assigned dorm supports bulk account creation and correct dorm summary');

	const academic = await vite.ssrLoadModule('/src/lib/server/academic-assessment-access.ts');
	const sumatif = await vite.ssrLoadModule(
		'/src/routes/(input-nilai)/asesmen-sumatif/formulir-asesmen/+page.server.ts'
	);
	const otherSubject = await insert('mata_pelajaran', {
		...seedMapel,
		kelas_id: otherClass,
		nama: (await one('SELECT nama FROM mata_pelajaran WHERE id=?', [mapel])).nama,
		pengampu_id: employee
	});
	const forbiddenSubject = await insert('mata_pelajaran', {
		...seedMapel,
		kelas_id: otherClass,
		nama: 'QA Forbidden ' + tag,
		pengampu_id: null
	});
	for (const handler of [formative, sumatif]) {
		await handler.load(
			event(
				`/asesmen-formatif/formulir-asesmen?murid_id=${foreignStudent}&mapel_id=${otherSubject}`
			)
		);
		await assert.rejects(
			() =>
				handler.load(
					event(
						`/asesmen-formatif/formulir-asesmen?murid_id=${foreignStudent}&mapel_id=${forbiddenSubject}`
					)
				),
			(e) => e.status === 403
		);
		await assert.rejects(
			() =>
				handler.actions.save(
					event('/asesmen-formatif/formulir-asesmen', {
						muridId: foreignStudent,
						mapelId: forbiddenSubject
					})
				),
			(e) => e.status === 403
		);
	}
	const thirdClass = await insert('kelas', {
		...seedClass,
		nama: 'QA Unassigned ' + tag,
		wali_kelas_id: null
	});
	const thirdStudent = await insert('murid', {
		...seedStudent,
		semester_id: semester,
		kelas_id: thirdClass,
		nama: 'QA Unassigned ' + tag,
		nis: 'third-' + tag,
		nisn: '',
		dapodik_peserta_didik_id: null,
		dapodik_anggota_rombel_id: null
	});
	const thirdSubject = await insert('mata_pelajaran', {
		...seedMapel,
		kelas_id: thirdClass,
		nama: 'QA Pelajaran ' + tag,
		pengampu_id: null
	});
	await assert.rejects(
		() => academic.assertAcademicAssessmentAccess(locals, thirdStudent, thirdClass, thirdSubject),
		(e) => e.status === 403
	);
	const attendance = await vite.ssrLoadModule('/src/lib/server/attendance-student-access.ts');
	assert.ok(await attendance.assertStudentAccess(user, school, foreignStudent));
	assert.equal(await attendance.assertStudentAccess(user, school, thirdStudent), null);
	const combined = { ...user, roles: ['user', 'waka_sarpras'], waliKelasIds: [ownClass] };
	await assert.rejects(
		() =>
			academic.assertAcademicAssessmentAccess(
				{ ...locals, user: combined },
				thirdStudent,
				thirdClass,
				thirdSubject
			),
		(e) => e.status === 403
	);
	assert.equal(await attendance.assertStudentAccess(combined, school, thirdStudent), null);
	for (const role of ['waka_kurikulum', 'operator', 'kepala_sekolah']) {
		const leader = {
			...user,
			roles: [role],
			waliKelasIds: [],
			permissions: permissions.effectivePermissions({ roles: [role] })
		};
		await academic.assertAcademicAssessmentAccess(
			{ ...locals, user: leader },
			thirdStudent,
			thirdClass,
			thirdSubject
		);
		assert.equal(
			(
				await notes.actions.save({
					...event('/catatan-wali-kelas', { muridId: foreignStudent, catatan: 'QA ' + role }),
					locals: { ...locals, user: leader }
				})
			).message,
			'Catatan tersimpan'
		);
	}
	const editStudent = await vite.ssrLoadModule('/src/lib/server/student-access.ts');
	for (const role of ['operator', 'waka_kesiswaan', 'waka_kurikulum', 'kepala_sekolah']) {
		assert.equal(
			await editStudent.canEditStudentRecord(
				{ ...locals, user: { ...user, roles: [role], waliKelasIds: [] } },
				{ id: thirdStudent, sekolahId: school, kelasId: thirdClass }
			),
			true
		);
	}
	const importing = await vite.ssrLoadModule('/src/routes/api/asesmen-sumatif/import/+server.ts');
	const importForm = new FormData();
	importForm.set('kelas_id', String(thirdClass));
	importForm.set('mapel_id', String(thirdSubject));
	importForm.set('file', new File(['invalid-xlsx'], 'test.xlsx'));
	const rejected = await importing.POST({
		locals,
		request: new Request('http://localhost/api/asesmen-sumatif/import', {
			method: 'POST',
			body: importForm
		})
	});
	assert.equal(rejected.status, 403);
	pass(
		'Teacher: all own homeroom subjects; only assigned subject elsewhere; third class denied for load, save, import and attendance; combined Sarpras cannot widen scope'
	);
	const peer = await insert('murid', {
		...seedStudent,
		semester_id: semester,
		kelas_id: thirdClass,
		nama: 'QA Peer ' + tag,
		nis: 'peer-' + tag,
		nisn: '',
		dapodik_peserta_didik_id: null,
		dapodik_anggota_rombel_id: null,
		wali_asuh_pegawai_id: null
	});
	await client.execute({
		sql: 'UPDATE murid SET wali_asuh_pegawai_id=? WHERE id=?',
		args: [employee, thirdStudent]
	});
	const caregiverTeacher = { ...user, roles: ['user', 'wali_asuh'], waliKelasIds: [ownClass] };
	assert.ok(
		(await attendance.accessibleClassIds(caregiverTeacher, school, semester)).includes(thirdClass)
	);
	assert.ok(await attendance.assertStudentAccess(caregiverTeacher, school, thirdStudent));
	assert.equal(await attendance.assertStudentAccess(caregiverTeacher, school, peer), null);
	const studentsAccess = await vite.ssrLoadModule('/src/lib/server/student-access.ts');
	assert.ok(
		!(
			await studentsAccess.accessibleClassIds(caregiverTeacher, school, semester, 'academic')
		).includes(thirdClass)
	);
	await assert.rejects(
		() =>
			academic.assertAcademicAssessmentAccess(
				{ ...locals, user: caregiverTeacher },
				thirdStudent,
				thirdClass,
				thirdSubject
			),
		(e) => e.status === 403
	);
	pass(
		'Combined teacher and caregiver sees own ward class for attendance without exposing classmates or academic grades'
	);
	const teacherKitchen = { ...user, roles: ['user', 'tim_dapur'], waliKelasIds: [ownClass] };
	assert.equal(await attendance.assertStudentAccess(teacherKitchen, school, thirdStudent), null);
	assert.ok(
		await attendance.assertStudentAccess(teacherKitchen, school, thirdStudent, false, 'makan')
	);
	assert.equal(
		await attendance.assertStudentAccess(teacherKitchen, school, thirdStudent, false, 'sekolah'),
		null
	);
	const mutation = await vite.ssrLoadModule('/src/lib/server/attendance-mutation.ts');
	const seedActivity = await one('SELECT * FROM kegiatan_absensi WHERE sekolah_id=? LIMIT 1', [
		school
	]);
	const meal = await insert('kegiatan_absensi', {
		...seedActivity,
		sekolah_id: school,
		kode: 'qa_meal_' + tag,
		nama: 'QA Makan ' + tag,
		kategori: 'makan',
		akses_edit: 'semua',
		aktif: 1
	});
	const schoolActivity = await insert('kegiatan_absensi', {
		...seedActivity,
		sekolah_id: school,
		kode: 'qa_school_' + tag,
		nama: 'QA Sekolah ' + tag,
		kategori: 'sekolah',
		akses_edit: 'semua',
		aktif: 1
	});
	const mealOptions = {
		locals: { ...locals, user: teacherKitchen },
		semesterId: semester,
		kelasId: thirdClass,
		tanggal: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }),
		muridIds: [thirdStudent],
		status: 'hadir',
		kegiatanId: meal,
		catatan: 'QA role'
	};
	assert.equal((await mutation.saveAttendance(mealOptions)).affected, 1);
	await assert.rejects(
		() => mutation.saveAttendance({ ...mealOptions, kegiatanId: schoolActivity }),
		(e) => e.status === 403
	);
	const guard = await vite.ssrLoadModule('/src/lib/server/attendance-guard.ts');
	const kitchenEvent = event('/administrasi/absensi');
	kitchenEvent.locals = { ...locals, user: { ...user, type: 'tim_dapur', roles: ['tim_dapur'] } };
	await assert.rejects(
		() =>
			guard.attendanceGuard({
				event: kitchenEvent,
				resolve: () => {
					throw Error('Unexpected access');
				}
			}),
		(e) => e.status === 403
	);
	pass('Kitchen role opens meal attendance only; combined teacher cannot expand school attendance');
	const managing = await vite.ssrLoadModule('/src/routes/pengguna/+page.server.ts');
	const accountEmployee = await insert('pegawai', {
		sekolah_id: school,
		nama: 'QA Multi ' + tag,
		nip: '',
		jenis: 'guru',
		status: 'aktif'
	});
	const manager = await connection.default.query.tableAuthUser.findFirst({
		where: (u, { eq }) => eq(u.type, 'admin')
	});
	const managementEvent = (fields) => {
		const e = event('/pengguna', fields);
		e.locals = { user: manager, sekolah: { id: school } };
		globalThis.__rolesQaEvent = e;
		return e;
	};
	const created = await managing.actions.create_user(
		managementEvent({
			username: 'multi-' + tag,
			password: 'Qa-' + tag + '!',
			pegawaiId: accountEmployee,
			roles: JSON.stringify(['user', 'waka_kurikulum']),
			mataPelajaranIds: JSON.stringify([mapel]),
			kelasIds: JSON.stringify([otherClass])
		})
	);
	assert.ok(created.user?.id, created.message);
	let createdRow = await one('SELECT * FROM auth_user WHERE id=?', [created.user.id]);
	assert.deepEqual(JSON.parse(createdRow.roles), ['user', 'waka_kurikulum']);
	assert.equal(createdRow.jabatan_akses, null);
	const updatedAccount = await managing.actions.update_user(
		managementEvent({
			id: createdRow.id,
			updatedAt: createdRow.updated_at,
			username: createdRow.username,
			roles: JSON.stringify(['user', 'waka_sarpras']),
			mataPelajaranIds: JSON.stringify([mapel]),
			kelasIds: JSON.stringify([otherClass])
		})
	);
	assert.ok(updatedAccount.user?.id, updatedAccount.message);
	assert.deepEqual(
		JSON.parse((await one('SELECT roles FROM auth_user WHERE id=?', [createdRow.id])).roles),
		['user', 'waka_sarpras']
	);
	assert.equal(
		(
			await managing.actions.create_user(
				managementEvent({
					username: 'duplicate-' + tag,
					password: 'Qa-' + tag + '!',
					pegawaiId: accountEmployee,
					roles: JSON.stringify(['waka_sarpras'])
				})
			)
		).status,
		400
	);
	pass('Create and update persist multiple roles; duplicate employee account rejected');
	await client.execute({ sql: 'UPDATE kelas SET wali_kelas_id=NULL WHERE id=?', args: [ownClass] });
	assert.deepEqual(await homeroom.getLegacyWaliKelasIds(user, school), []);
	assert.equal(await management.canManageKelas(user, school, ownClass), false);
	assert.ok(await one('SELECT id FROM catatan_wali_kelas WHERE murid_id=?', [ownStudent]));
	pass('Ending homeroom assignment removes authority while preserving notes');
	const session = await auth.createSession(account);
	assert.ok(await auth.resolveSession(session.token));
	await client.execute({
		sql: "UPDATE pegawai SET status='nonaktif' WHERE id=?",
		args: [employee]
	});
	assert.equal(await auth.authenticateUser(username, password), null);
	assert.equal(await auth.resolveSession(session.token), null);
	assert.equal(
		Number((await one('SELECT COUNT(*) n FROM auth_session WHERE user_id=?', [account])).n),
		0
	);
	await client.execute({ sql: "UPDATE pegawai SET status='aktif' WHERE id=?", args: [employee] });
	assert.ok(await auth.authenticateUser(username, password));
	assert.equal(await auth.resolveSession(session.token), null);
	await auth.createSession(account);
	await auth.revokeEmployeeSessions(employee, school);
	assert.equal(
		Number((await one('SELECT COUNT(*) n FROM auth_session WHERE user_id=?', [account])).n),
		0
	);
	await client.execute({ sql: "UPDATE pegawai SET jenis='keamanan' WHERE id=?", args: [employee] });
	assert.equal(await auth.authenticateUser(username, password), null);
	await client.execute({ sql: "UPDATE pegawai SET jenis='guru' WHERE id=?", args: [employee] });
	pass(
		'Inactive or mismatched employees cannot log in; sessions revoked and remain invalid after reactivation'
	);
	assert.equal((await query('PRAGMA foreign_key_check')).length, 0);
	pass('Foreign keys remain valid');
	console.log('Copy only:', folder);
} finally {
	delete globalThis.__rolesQaEvent;
	if (connection) await connection.closeDbClient();
	await vite.close();
	client.close();
}
