import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { createServer } from 'vite';
import { randomBytes, scryptSync } from 'node:crypto';

await mkdir('tmp', { recursive: true });
const directory = await mkdtemp(path.resolve('tmp/student-registry-'));
const database = path.join(directory, 'database.sqlite3');
const source = createClient({ url: 'file:./data/database.sqlite3' });
await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
source.close();
process.env.DB_URL = `file:${database}`;
const client = createClient({ url: process.env.DB_URL });
const insert = async (table, fields) => {
	const columns = (await client.execute(`PRAGMA table_info("${table}")`)).rows;
	const values = { ...fields };
	for (const column of columns)
		if (
			column.name !== 'id' &&
			Number(column.notnull) &&
			column.dflt_value === null &&
			!(column.name in values)
		)
			values[column.name] = column.type.toLowerCase().includes('int')
				? 1
				: column.name === 'created_at'
					? new Date().toISOString()
					: '';
	const entries = Object.entries(values);
	return Number(
		(
			await client.execute({
				sql: `INSERT INTO "${table}" (${entries.map(([key]) => `"${key}"`).join(',')}) VALUES (${entries.map(() => '?').join(',')})`,
				args: entries.map(([, value]) => value)
			})
		).lastInsertRowid
	);
};
const form = (values) => {
	const result = new FormData();
	for (const [key, value] of Object.entries(values))
		for (const item of Array.isArray(value) ? value : [value]) result.append(key, String(item));
	return result;
};
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
				if (id === '\0qa-env') return 'export const env = process.env;';
				if (id === '\0$app/navigation')
					return 'export const goto = () => {}; export const preloadData = () => {}; export const pushState = () => {};';
				if (id === '\0$app/server')
					return 'export const getRequestEvent = () => globalThis.__studentQaEvent;';
			}
		}
	],
	optimizeDeps: { noDiscovery: true, include: [] },
	server: { middlewareMode: true, hmr: false, watch: null },
	appType: 'custom',
	logLevel: 'error'
});
let connection;
try {
	connection = await vite.ssrLoadModule('/src/lib/server/db/index.ts');
	const { migrateUnassignedMurid } = await vite.ssrLoadModule(
		'/src/lib/server/db/murid-unassigned.ts'
	);
	await migrateUnassignedMurid(connection.default.$client);
	const { syncMuridGovernance } = await vite.ssrLoadModule('/src/lib/server/murid-lifecycle.ts');
	const registry = await vite.ssrLoadModule('/src/lib/server/student-registry.ts');
	const dorm = await vite.ssrLoadModule('/src/lib/server/dormitory.ts');
	const schoolAddress = await insert('alamat', {
		jalan: 'Data uji',
		desa: 'Uji',
		kecamatan: 'Uji',
		kabupaten: 'Uji'
	});
	const principal = await insert('pegawai', {
		nama: 'Kepala Sekolah Uji',
		nip: 'QA-01',
		jenis: 'kepala_sekolah'
	});
	const school = await insert('sekolah', {
		nama: 'Sekolah Uji Peserta Didik',
		npsn: `QA${Date.now()}`,
		jenjang_pendidikan: 'sma',
		alamat_id: schoolAddress,
		kepala_sekolah_id: principal,
		email: 'qa@example.invalid'
	});
	const teacher = await insert('pegawai', {
		sekolah_id: school,
		nama: 'Guru Kelas A',
		nip: 'QA-02',
		jenis: 'guru'
	});
	const teacherOther = await insert('pegawai', {
		sekolah_id: school,
		nama: 'Guru Kelas B',
		nip: 'QA-03',
		jenis: 'guru'
	});
	const warden = await insert('pegawai', {
		sekolah_id: school,
		nama: 'Wali Asrama A',
		nip: 'QA-04',
		jenis: 'wali_asrama'
	});
	const wardenOther = await insert('pegawai', {
		sekolah_id: school,
		nama: 'Wali Asrama B',
		nip: 'QA-05',
		jenis: 'wali_asrama'
	});
	const year = await insert('tahun_ajaran', { sekolah_id: school, nama: '2026/2027', is_aktif: 1 });
	const semester = await insert('semester', {
		tahun_ajaran_id: year,
		nama: 'Ganjil',
		tipe: 'ganjil',
		is_aktif: 1
	});
	const classA = await insert('kelas', {
		sekolah_id: school,
		semester_id: semester,
		tahun_ajaran_id: year,
		nama: 'X A',
		fase: 'Fase E',
		wali_kelas_id: teacher
	});
	const classB = await insert('kelas', {
		sekolah_id: school,
		semester_id: semester,
		tahun_ajaran_id: year,
		nama: 'X B',
		fase: 'Fase E',
		wali_kelas_id: teacherOther
	});
	const actor = Number(
		(await client.execute("SELECT id FROM auth_user WHERE type='admin' LIMIT 1")).rows[0].id
	);
	const admin = {
		id: actor,
		username: 'QA Admin',
		type: 'admin',
		sekolahId: school,
		permissions: [],
		mustChangePassword: false
	};
	const locals = (user) => ({ user, sekolah: { id: school, jenjangPendidikan: 'sma' } });
	const homeroom = { ...admin, type: 'wali_kelas', pegawaiId: teacher, waliKelasIds: [classA] };
	const guardian = { ...admin, type: 'wali_asrama', pegawaiId: warden };
	const event = (pathname, user = admin, data = {}) => ({
		locals: locals(user),
		url: new URL(`http://127.0.0.1:5174${pathname}`),
		cookies: { get() {} },
		depends() {},
		request: new Request(`http://127.0.0.1:5174${pathname}`, { method: 'POST', body: form(data) })
	});
	const student = async (name, classId = null, gender = 'L') => {
		const id = await insert('murid', {
			sekolah_id: school,
			semester_id: semester,
			kelas_id: classId,
			nama: name,
			nis: name,
			nisn: '',
			tanggal_lahir: '2010-01-01',
			jenis_kelamin: gender,
			alamat_id: schoolAddress,
			tanggal_masuk: '2026-07-01'
		});
		await syncMuridGovernance(school, [id]);
		return id;
	};
	const waiting = await student('Murid Baru');
	const { attendanceGuard } = await vite.ssrLoadModule('/src/lib/server/attendance-guard.ts');
	assert.equal(
		(
			await attendanceGuard({
				event: event('/murid?/assign', homeroom, { muridId: waiting, kelasId: classA }),
				resolve: async () => new Response('ok')
			})
		).status,
		200
	);
	const classOnly = await student('Murid Kelas Saja', classA);
	const inactive = await student('Murid Pindah', classA);
	await syncMuridGovernance(school, [inactive], 'pindah', { alasan: 'Uji status pindah' });
	const female = await student('Murid Putri', null, 'P');
	const intakeRoute = await vite.ssrLoadModule(
		'/src/routes/(informasi-umum)/murid/form/[[id]]/+page.server.ts'
	);
	const intakeEvent = event('/murid/form', homeroom, {
		nama: 'Murid Formulir',
		nis: 'FORM-01',
		nisn: '',
		tempatLahir: 'Bengkulu',
		tanggalLahir: '2010-01-01',
		jenisKelamin: 'L',
		agama: 'Islam',
		pendidikanSebelumnya: 'SMP',
		tanggalMasuk: '2026-07-01',
		'alamat.jalan': 'Jalan Uji',
		'alamat.desa': 'Desa Uji',
		'alamat.kecamatan': 'Kecamatan Uji',
		'alamat.kabupaten': 'Kabupaten Uji'
	});
	intakeEvent.params = {};
	const intake = await intakeRoute.actions.save(intakeEvent);
	assert(intake.id);
	assert.equal(intake.murid.kelasId, null);
	assert(
		(await registry.loadStudentRegistry(event('/murid/pasif'))).registry.students.some(
			(item) => item.id === intake.id
		)
	);
	await assert.rejects(
		dorm.mutateDormitory(
			locals(admin),
			'directory',
			form({ id: 0, nama: 'Salah Wali', kategori: 'putra', kapasitas: 20, pegawaiId: teacher })
		),
		(cause) => cause.status === 400
	);
	await dorm.mutateDormitory(
		locals(admin),
		'directory',
		form({ id: 0, nama: 'Asrama A', kategori: 'putra', kapasitas: 20, pegawaiId: warden })
	);
	await dorm.mutateDormitory(
		locals(admin),
		'directory',
		form({ id: 0, nama: 'Asrama B', kategori: 'putra', kapasitas: 20, pegawaiId: wardenOther })
	);
	const rooms = (
		await client.execute({
			sql: 'SELECT k.id,g.nama FROM asrama_kamar k JOIN asrama g ON g.id=k.asrama_id WHERE k.sekolah_id=? ORDER BY k.id',
			args: [school]
		})
	).rows;
	const roomA = Number(rooms[0].id),
		roomB = Number(rooms[1].id);
	const roomVersion = Number(
		(await client.execute({ sql: 'SELECT versi FROM asrama_kamar WHERE id=?', args: [roomB] }))
			.rows[0].versi
	);
	const renameRoom = form({
		id: roomB,
		versi: roomVersion,
		nama: 'Asrama B Baru',
		kapasitas: 20,
		pegawaiId: wardenOther
	});
	await dorm.mutateDormitory(locals(admin), 'directory', renameRoom);
	assert.equal(
		(
			await client.execute({
				sql: 'SELECT g.nama FROM asrama g JOIN asrama_kamar k ON k.asrama_id=g.id WHERE k.id=?',
				args: [roomB]
			})
		).rows[0].nama,
		'Asrama B Baru'
	);
	await assert.rejects(
		dorm.mutateDormitory(locals(admin), 'directory', renameRoom),
		(cause) => cause.status === 409
	);
	assert((await registry.loadStudentRegistry(event('/murid/pasif?status=__proto__'))).registry);
	let passive = (await registry.loadStudentRegistry(event('/murid/pasif'))).registry;
	assert(passive.students.some((item) => item.id === waiting));
	assert(passive.students.some((item) => item.id === classOnly));
	assert(passive.students.some((item) => item.id === inactive && item.status === 'pindah'));
	assert.equal(
		(
			await registry.studentRegistryActions.assign(
				event('/murid', homeroom, { muridId: [intake.id, 999999999], kelasId: classA })
			)
		).status,
		404
	);
	assert.equal(
		(await client.execute({ sql: 'SELECT kelas_id FROM murid WHERE id=?', args: [intake.id] }))
			.rows[0].kelas_id,
		null
	);
	assert.equal(
		(
			await registry.studentRegistryActions.assign(
				event('/murid', homeroom, { muridId: waiting, kelasId: classB })
			)
		).status,
		403
	);
	assert.equal(
		(
			await registry.studentRegistryActions.assign(
				event('/murid', homeroom, { muridId: waiting, kelasId: classA })
			)
		).success,
		true
	);
	assert.equal(
		(
			await registry.studentRegistryActions.assign(
				event('/murid', homeroom, { muridId: waiting, kelasId: classA })
			)
		).status,
		409
	);
	assert.equal(
		(
			await registry.studentRegistryActions.assign(
				event('/murid/asrama', guardian, { muridId: waiting, kamarId: roomB })
			)
		).status,
		403
	);
	assert.equal(
		(
			await registry.studentRegistryActions.assign(
				event('/murid/asrama', guardian, { muridId: female, kamarId: roomA })
			)
		).status,
		400
	);
	assert.equal(
		(
			await registry.studentRegistryActions.assign(
				event('/murid/asrama', guardian, { muridId: inactive, kamarId: roomA })
			)
		).status,
		409
	);
	assert.equal(
		(
			await registry.studentRegistryActions.assign(
				event('/murid/asrama', guardian, { muridId: waiting, kamarId: roomA })
			)
		).success,
		true
	);
	assert.equal(
		(
			await registry.studentRegistryActions.assign(
				event('/murid/asrama', guardian, { muridId: waiting, kamarId: roomA })
			)
		).status,
		409
	);
	const dormOnly = await student('Murid Asrama Saja');
	assert.equal(
		(
			await registry.studentRegistryActions.assign(
				event('/murid/asrama', guardian, { muridId: dormOnly, kamarId: roomA })
			)
		).success,
		true
	);
	passive = (await registry.loadStudentRegistry(event('/murid/pasif'))).registry;
	assert(!passive.students.some((item) => item.id === waiting));
	assert(passive.students.some((item) => item.id === dormOnly));
	const all = (await registry.loadStudentRegistry(event('/murid/semua'))).registry;
	const placed = all.students.find((item) => item.id === waiting);
	assert.equal(placed.classHistory.length, 1);
	assert.equal(placed.dormHistory.length, 1);
	const reload = (
		await registry.loadStudentRegistry(event(`/murid/asrama?kamar_id=${roomA}`, guardian))
	).registry;
	assert.deepEqual(
		reload.rooms.map((item) => item.id),
		[roomA]
	);
	assert(reload.students.some((item) => item.id === waiting));
	const caregiver = await insert('pegawai', {
		sekolah_id: school,
		nama: 'Wali Asuh Terhubung',
		nip: 'QA-ASUH',
		jenis: 'wali_asuh'
	});
	await client.execute({
		sql: 'UPDATE murid SET wali_asuh_pegawai_id=?,wali_asuh_nama=? WHERE id=?',
		args: [caregiver, 'Nama lama wali asuh', waiting]
	});
	await client.execute({
		sql: 'UPDATE murid SET wali_asuh_nama=? WHERE id=?',
		args: ['Wali Asuh Lama', dormOnly]
	});
	const dormRegistry = async (user = admin) =>
		(await registry.loadStudentRegistry(event(`/murid/asrama?kamar_id=${roomA}`, user))).registry;
	const residents = await dormRegistry();
	assert.equal(residents.students.find((s) => s.id === waiting).wali_asuh, 'Wali Asuh Terhubung');
	assert.equal(residents.students.find((s) => s.id === dormOnly).wali_asuh, 'Wali Asuh Lama');
	assert(residents.students.every((s) => s.canPassivate));
	assert((await dormRegistry(guardian)).students.every((s) => !s.canPassivate));
	await client.execute({
		sql: 'UPDATE murid SET wali_asuh_nama=? WHERE id=?',
		args: ['   ', dormOnly]
	});
	assert.equal((await dormRegistry()).students.find((s) => s.id === dormOnly).wali_asuh, null);
	await client.execute({
		sql: 'UPDATE kelas SET wali_kelas_id=? WHERE id=?',
		args: [warden, classA]
	});
	const combined = { ...guardian, roles: ['user', 'wali_asrama'], waliKelasIds: [classA] };
	const combinedResidents = (await dormRegistry(combined)).students;
	assert.equal(combinedResidents.find((s) => s.id === waiting).canPassivate, true);
	assert.equal(combinedResidents.find((s) => s.id === dormOnly).canPassivate, false);
	await client.execute({
		sql: 'UPDATE kelas SET wali_kelas_id=? WHERE id=?',
		args: [teacher, classA]
	});
	console.log(
		'PASS Wali Asuh uses linked employee then legacy name; empty names and role/class action boundaries preserved.'
	);
	await assert.rejects(
		registry.loadStudentRegistry(event(`/murid/asrama?kamar_id=${roomB}`, guardian)),
		(cause) => cause.status === 403
	);
	await assert.rejects(
		registry.loadStudentRegistry(event('/murid', guardian), 'kelas'),
		(cause) => cause.status === 403
	);
	const classRoute = await vite.ssrLoadModule(
		'/src/routes/(informasi-umum)/kelas/form/[[id]]/+page.server.ts'
	);
	globalThis.__studentQaEvent = { locals: locals(admin), route: { id: '/kelas/form' } };
	const classForm = await classRoute.load({ params: {}, locals: locals(admin) });
	assert(classForm.pegawaiOptions.some((item) => item.id === teacher));
	assert(!classForm.pegawaiOptions.some((item) => item.id === warden));
	const invalidWali = event('/kelas/form', admin, {
		rombel: 'Kelas Tidak Valid',
		fase: 'Fase E',
		waliKelasId: warden
	});
	invalidWali.params = {};
	assert.equal((await classRoute.actions.save(invalidWali)).status, 400);
	const previousSemester = await insert('semester', {
		tahun_ajaran_id: year,
		nama: 'Genap Lama',
		tipe: 'genap',
		is_aktif: 0
	});
	const oldClass = await insert('kelas', {
		sekolah_id: school,
		semester_id: previousSemester,
		tahun_ajaran_id: year,
		nama: 'IX Lama',
		fase: 'Fase D',
		wali_kelas_id: teacher
	});
	const previousStudent = await insert('murid', {
		sekolah_id: school,
		semester_id: previousSemester,
		kelas_id: oldClass,
		nama: 'Murid Riwayat',
		nis: 'HISTORY-01',
		nisn: '',
		tanggal_lahir: '2010-01-01',
		jenis_kelamin: 'L',
		alamat_id: schoolAddress
	});
	await syncMuridGovernance(school, [previousStudent]);
	assert.equal(
		(
			await registry.studentRegistryActions.assign(
				event('/murid', homeroom, { muridId: previousStudent, kelasId: classA })
			)
		).success,
		true
	);
	const historical = (
		await registry.loadStudentRegistry(event('/murid/semua'))
	).registry.students.filter((item) => item.nis === 'HISTORY-01');
	assert.equal(historical.length, 1);
	assert.equal(historical[0].classHistory.length, 2);
	const allRoute = await vite.ssrLoadModule(
		'/src/routes/(informasi-umum)/murid/semua/+page.server.ts'
	);
	const archiveEvent = event('/murid/semua?view=arsip&status=pindah');
	const archivePage = await allRoute.load(archiveEvent);
	assert.equal(archivePage.registry, null);
	assert.equal(archivePage.canManageArchive, true);
	const archived = archivePage.archive.rows.find((row) => row.lastMuridId === inactive);
	assert(archived);
	await assert.rejects(
		allRoute.load(event('/murid/semua?view=arsip', homeroom)),
		(cause) => cause.status === 303 && cause.location.includes('murid_arsip')
	);
	const restored = await allRoute.actions.updateStatus(
		event('/murid/semua?view=arsip&/updateStatus', admin, {
			lifecycleIds: archived.id,
			status: 'aktif',
			alasan: 'Pemulihan melalui Semua Murid'
		})
	);
	assert(restored.message);
	const restoredPage = await allRoute.load(event('/murid/semua'));
	assert.equal(restoredPage.archive, null);
	assert.equal(restoredPage.registry.students.find((row) => row.id === inactive).status, 'aktif');
	const legacyArchive = await vite.ssrLoadModule(
		'/src/routes/(informasi-umum)/murid/arsip/+page.server.ts'
	);
	assert.throws(
		() => legacyArchive.load(event('/murid/arsip?status=alumni&perlu_periksa=1')),
		(cause) =>
			cause.status === 303 &&
			cause.location.includes('/murid/semua?') &&
			cause.location.includes('view=arsip') &&
			cause.location.includes('perlu_periksa=1')
	);

	// All following mutations use this isolated database copy.
	const passiveService = await vite.ssrLoadModule('/src/lib/server/student-passive.ts');
	const { dormToday } = await vite.ssrLoadModule('/src/lib/dormitory.ts');
	const today = dormToday();
	const makePassive = (ids, reason = 'pindah_kelas', user = admin, date = today) =>
		passiveService.passivateStudents(
			event('/murid?/passivate', user, {
				muridIds: ids,
				reason,
				tanggal: date,
				catatan: 'Uji perpindahan kelas'
			})
		);
	const assignedClass = async (id) =>
		(await client.execute({ sql: 'SELECT kelas_id FROM murid WHERE id=?', args: [id] })).rows[0]
			.kelas_id;
	const lifecycleFor = async (id) =>
		(
			await client.execute({
				sql: "SELECT l.* FROM murid_lifecycle l JOIN murid_identity_link i ON l.identity_key='uid:'||i.identity_uid AND l.sekolah_id=i.sekolah_id WHERE i.murid_id=?",
				args: [id]
			})
		).rows[0];
	await client.execute({
		sql: "UPDATE murid SET foto='qa/photo.jpg',qr_token='qa-preserved-token' WHERE id=?",
		args: [waiting]
	});
	await insert('catatan_wali_kelas', { murid_id: waiting, catatan: 'Nilai dan catatan lama' });
	await insert('absensi_harian', {
		sekolah_id: school,
		semester_id: semester,
		kelas_id: classA,
		murid_id: waiting,
		tanggal: today,
		status: 'hadir',
		metode: 'manual'
	});
	await insert('qr_murid', { murid_id: waiting, token_hash: 'qa-' + Date.now(), issued_at: today });
	const retainedTables = ['catatan_wali_kelas', 'absensi_harian', 'qr_murid'];
	const retainedBefore = await Promise.all(
		retainedTables.map((table) =>
			client
				.execute({ sql: `SELECT * FROM ${table} WHERE murid_id=?`, args: [waiting] })
				.then((r) => r.rows)
		)
	);
	assert.equal((await makePassive(waiting, 'pindah_kelas', homeroom, '2026-02-30')).status, 400);
	assert.equal(await assignedClass(waiting), classA);
	assert.equal(
		(await makePassive(waiting, 'pindah_kelas', { ...homeroom, pegawaiId: teacherOther })).status,
		403
	);
	// Backdating before open dorm start rejects entire selection.
	assert.equal(
		(await makePassive([classOnly, waiting], 'pindah_kelas', admin, '2020-01-01')).status,
		409
	);
	assert.equal(await assignedClass(classOnly), classA);
	assert.equal(await assignedClass(waiting), classA);
	assert((await makePassive(waiting, 'pindah_kelas', homeroom)).message);
	assert.equal(await assignedClass(waiting), null);
	assert.equal((await lifecycleFor(waiting)).placement_status, 'pindah_kelas');
	assert.equal(
		(
			await client.execute({
				sql: 'SELECT COUNT(*) AS n FROM asrama_penempatan WHERE murid_id=? AND selesai IS NULL',
				args: [waiting]
			})
		).rows[0].n,
		0
	);
	let moving = (
		await registry.loadStudentRegistry(event('/murid/pasif?status=pindah_kelas'))
	).registry.students.find((row) => row.id === waiting);
	assert(moving);
	assert.equal(moving.classHistory.length, 1);
	assert.equal(moving.classHistory[0].kelas_snapshot, 'X A');
	assert.equal(moving.classHistory[0].alasan, 'pindah_kelas');
	assert.equal(moving.dormHistory[0].selesai, today);
	const reportArchive = await vite.ssrLoadModule('/src/lib/server/report-archive.ts');
	const historyId = Number(
		(
			await client.execute({
				sql: 'SELECT id FROM murid_riwayat_kelas WHERE murid_id=?',
				args: [waiting]
			})
		).rows[0].id
	);
	const reportBeforeMove = await reportArchive.historicalReportInfo(
		locals(admin),
		historyId,
		'sekolah',
		'ras'
	);
	assert.equal(reportBeforeMove.className, 'X A');
	assert(
		(await registry.loadStudentRegistry(event('/murid'), 'kelas')).registry.candidates.some(
			(row) => row.id === waiting
		)
	);
	assert.equal(
		(
			await registry.studentRegistryActions.assign(
				event('/murid', admin, { muridId: waiting, kelasId: classB })
			)
		).success,
		true
	);
	assert.equal((await lifecycleFor(waiting)).placement_status, null);
	assert.equal(await assignedClass(waiting), classB);
	assert((await makePassive(waiting)).message);
	assert.equal(
		(
			await registry.studentRegistryActions.assign(
				event('/murid', homeroom, { muridId: waiting, kelasId: classA })
			)
		).success,
		true
	);
	moving = (await registry.loadStudentRegistry(event('/murid/semua'))).registry.students.find(
		(row) => row.id === waiting
	);
	assert.deepEqual(
		moving.classHistory.map((row) => row.kelas_snapshot),
		['X A', 'X B', 'X A']
	);
	// Terminal states block both placement types; explicit restore starts unplaced.
	for (const status of ['pindah', 'keluar', 'alumni']) {
		assert((await makePassive(waiting, status)).message);
		assert.equal(await assignedClass(waiting), null);
		assert.equal(
			(
				await registry.studentRegistryActions.assign(
					event('/murid', admin, { muridId: waiting, kelasId: classB })
				)
			).status,
			409
		);
		assert.equal(
			(
				await registry.studentRegistryActions.assign(
					event('/murid/asrama', admin, { muridId: waiting, kamarId: roomA })
				)
			).status,
			409
		);
		assert.equal((await makePassive(waiting, 'pindah_kelas')).status, 409);
		assert(
			(
				await allRoute.actions.updateStatus(
					event('/murid/semua', admin, {
						lifecycleIds: (await lifecycleFor(waiting)).id,
						status: 'aktif',
						alasan: 'Aktif kembali'
					})
				)
			).message
		);
		assert.equal(await assignedClass(waiting), null);
		assert.equal(
			(
				await registry.studentRegistryActions.assign(
					event('/murid', admin, { muridId: waiting, kelasId: classA })
				)
			).success,
			true
		);
	}
	// Promotion waits for different active semester, then clears pending reason.
	assert((await makePassive(classOnly, 'naik_kelas')).message);
	assert.equal(
		(
			await registry.studentRegistryActions.assign(
				event('/murid', admin, { muridId: classOnly, kelasId: classB })
			)
		).status,
		409
	);
	assert(
		!(await registry.loadStudentRegistry(event('/murid'), 'kelas')).registry.candidates.some(
			(row) => row.id === classOnly
		)
	);
	assert((await makePassive(waiting, 'pindah_kelas')).message);
	await client.execute({ sql: 'UPDATE semester SET is_aktif=0 WHERE id=?', args: [semester] });
	await client.execute({
		sql: 'UPDATE semester SET is_aktif=1 WHERE id=?',
		args: [previousSemester]
	});
	assert.equal(
		(
			await registry.studentRegistryActions.assign(
				event('/murid', admin, { muridId: waiting, kelasId: oldClass })
			)
		).status,
		409
	);
	const promoted = await registry.studentRegistryActions.assign(
		event('/murid', admin, { muridId: classOnly, kelasId: oldClass })
	);
	assert.equal(promoted.success, true);
	const newRow = (await lifecycleFor(classOnly)).last_murid_id;
	assert.notEqual(newRow, classOnly);
	assert.equal((await lifecycleFor(classOnly)).placement_status, null);
	assert.equal(await assignedClass(classOnly), null);
	assert.equal(await assignedClass(newRow), oldClass);
	assert.equal((await makePassive(classOnly)).status, 409);
	await client.execute({
		sql: 'UPDATE semester SET is_aktif=0 WHERE id=?',
		args: [previousSemester]
	});
	await client.execute({ sql: 'UPDATE semester SET is_aktif=1 WHERE id=?', args: [semester] });
	const preserved = (
		await client.execute({ sql: 'SELECT foto,qr_token FROM murid WHERE id=?', args: [waiting] })
	).rows[0];
	assert.equal(preserved.foto, 'qa/photo.jpg');
	assert.equal(preserved.qr_token, 'qa-preserved-token');
	assert.equal(
		(await makePassive(waiting, 'keluar', { ...admin, type: 'wali_kelas', sekolahId: school + 1 }))
			.status,
		403
	);
	assert.equal((await makePassive(waiting, '__proto__')).status, 400);
	const retainedAfter = await Promise.all(
		retainedTables.map((table) =>
			client
				.execute({ sql: `SELECT * FROM ${table} WHERE murid_id=?`, args: [waiting] })
				.then((r) => r.rows)
		)
	);
	assert.deepEqual(retainedAfter, retainedBefore);
	// Shared status action closes placements too; invalid date leaves old class intact.
	assert.equal(
		(
			await allRoute.actions.updateStatus(
				event('/murid/semua', admin, {
					lifecycleIds: (await lifecycleFor(intake.id)).id,
					status: 'keluar',
					tanggalStatus: '2026-02-30'
				})
			)
		).status,
		400
	);
	assert.equal(
		(
			await registry.studentRegistryActions.assign(
				event('/murid', admin, { muridId: intake.id, kelasId: classA })
			)
		).success,
		true
	);
	assert(
		(
			await allRoute.actions.updateStatus(
				event('/murid/semua', admin, {
					lifecycleIds: (await lifecycleFor(intake.id)).id,
					status: 'keluar',
					tanggalStatus: today
				})
			)
		).message
	);
	assert.equal(await assignedClass(intake.id), null);
	const archiveWithJournal = await allRoute.load(event('/murid/semua?view=arsip'));
	assert(
		archiveWithJournal.archive.rows.find((row) => row.lastMuridId === waiting).movements.length >= 3
	);
	const salt = randomBytes(16).toString('hex');
	const password = 'RegistryQa-' + randomBytes(10).toString('hex');
	const qaUser = await insert('auth_user', {
		username: 'qa.registry',
		username_normalized: 'qa.registry',
		password_hash: scryptSync(password, salt, 64).toString('hex'),
		password_salt: salt,
		type: 'admin',
		sekolah_id: school,
		must_change_password: 0,
		permissions: '[]'
	});
	assert.equal((await client.execute('PRAGMA foreign_key_check')).rows.length, 0);
	await writeFile(
		path.join(directory, 'fixture.json'),
		JSON.stringify(
			{
				database,
				school,
				classA,
				classB,
				roomA,
				roomB,
				actor,
				qaUser,
				username: 'qa.registry',
				password
			},
			null,
			2
		)
	);
	console.log(
		'PASS: passive reasons, class transfer cycles, semester guards, terminal status/restore, dorm close, history journal, rollback, retention, identity and role boundaries.'
	);
	console.log('QA fixture:', directory);
} finally {
	if (connection) await connection.closeDbClient();
	delete globalThis.__studentQaEvent;
	await vite.close();
	client.close();
}
