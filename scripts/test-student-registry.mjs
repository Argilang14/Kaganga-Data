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
	const { canEditStudentRecord } = await vite.ssrLoadModule('/src/lib/server/student-access.ts');
	const photoRoute = await vite.ssrLoadModule('/src/routes/api/murid-photo/[id]/+server.ts');
	const healthRoute = await vite.ssrLoadModule(
		'/src/routes/(informasi-umum)/murid/[id]/+page.server.ts'
	);
	const detailRoute = await vite.ssrLoadModule(
		'/src/routes/(informasi-umum)/murid/[id]/+layout.server.ts'
	);
	const wardUser = { ...admin, type: 'wali_asuh', roles: ['wali_asuh'], pegawaiId: caregiver };
	const ownResidents = await dormRegistry(wardUser);
	assert.deepEqual(
		ownResidents.students.map((s) => s.id),
		[waiting]
	);
	assert.equal(ownResidents.canManage, false);
	assert.equal(ownResidents.candidates.length, 0);
	assert.equal(
		(
			await registry.studentRegistryActions.assign(
				event('/murid/asrama', wardUser, { muridId: waiting, kamarId: roomA })
			)
		).status,
		403
	);
	for (const role of [
		'user',
		'wali_asuh',
		'tim_dapur',
		'tim_keamanan',
		'waka_kesiswaan',
		'waka_keasramaan',
		'waka_sarpras',
		'waka_humas',
		'wali_murid'
	]) {
		const reader = {
			...admin,
			type: role === 'wali_murid' ? role : 'user',
			roles: [role],
			permissions: ['menu_murid', 'kelas_manage', 'murid_arsip']
		};
		for (const view of ['semua', 'pasif']) {
			const loaded = await registry.loadStudentRegistry(event(`/murid/${view}`, reader));
			assert.equal(loaded.registry.canManage, false, role + view);
			assert(loaded.registry.students.length > 0);
		}
		assert.equal(
			await canEditStudentRecord(locals(reader), {
				id: waiting,
				sekolahId: school,
				kelasId: classA
			}),
			false,
			role
		);
		await assert.rejects(
			intakeRoute.load({ params: {}, locals: locals(reader) }),
			(e) => e.status === 303
		);
		await assert.rejects(
			photoRoute.DELETE({ params: { id: String(waiting) }, locals: locals(reader) }),
			(e) => e.status === 403
		);
		assert.equal(
			(
				await healthRoute.actions['save-kesehatan']({
					params: { id: String(waiting) },
					locals: locals(reader),
					request: event('/murid', reader).request
				})
			).status,
			403
		);
		assert.equal(
			(
				await healthRoute.actions['delete-kesehatan']({
					params: { id: String(waiting) },
					locals: locals(reader),
					request: event('/murid', reader).request
				})
			).status,
			403
		);
	}
	for (const role of ['operator', 'kepala_sekolah', 'waka_kurikulum']) {
		const manager = { ...admin, type: 'user', roles: [role], permissions: [] };
		assert((await registry.loadStudentRegistry(event('/murid/semua', manager))).registry.canManage);
		assert((await registry.loadStudentRegistry(event('/murid/pasif', manager))).registry.canManage);
		assert.equal(
			(await registry.loadStudentRegistry(event(`/murid?kelas_id=${classA}`, manager), 'kelas'))
				.registry.classes.length,
			2
		);
		if (role === 'waka_kurikulum')
			await assert.rejects(dormRegistry(manager), (e) => e.status === 403);
		else assert((await dormRegistry(manager)).canManage);
	}
	assert(
		await canEditStudentRecord(locals(homeroom), { id: dormOnly, sekolahId: school, kelasId: null })
	);
	assert(
		await canEditStudentRecord(locals(guardian), { id: dormOnly, sekolahId: school, kelasId: null })
	);
	const allDetail = await detailRoute.load({
		params: { id: String(waiting) },
		locals: locals(homeroom),
		url: new URL('http://localhost/murid/1?student_view=semua')
	});
	assert.equal(allDetail.canEditStudent, false);
	await assert.rejects(
		registry.loadStudentRegistry({
			...event('/murid/semua', { ...admin, type: 'user', roles: ['user'], sekolahId: school + 1 })
		}),
		(e) => e.status === 403
	);
	console.log(
		'PASS student role matrix: shared read-only lists, own wards, full managers, passive editors; direct photo/health/intake writes denied and cross-school access rejected.'
	);
	const classPage = await vite.ssrLoadModule('/src/routes/(informasi-umum)/murid/+page.server.ts');
	const loadClassPage = () =>
		classPage.load({
			...event(`/murid?kelas_id=${classA}`),
			parent: async () => ({
				daftarKelas: [{ id: classA }, { id: classB }],
				kelasAktif: { id: classA }
			})
		});
	assert.equal(
		(await loadClassPage()).daftarMurid.find((s) => s.id === waiting).waliAsuhDisplay,
		'Wali Asuh Terhubung'
	);
	await client.execute({
		sql: 'UPDATE murid SET wali_asuh_nama=? WHERE id=?',
		args: ['Wali Asuh Lama', classOnly]
	});
	assert.equal(
		(await loadClassPage()).daftarMurid.find((s) => s.id === classOnly).waliAsuhDisplay,
		'Wali Asuh Lama'
	);
	await client.execute({
		sql: 'UPDATE murid SET wali_asuh_nama=? WHERE id=?',
		args: ['   ', classOnly]
	});
	const classRows = (await loadClassPage()).daftarMurid;
	assert.equal(classRows.find((s) => s.id === classOnly).waliAsuhDisplay, null);
	assert(classRows.every((s) => s.kelasId === classA));
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
	// Dorm deletion closes placements and hides the room while preserving all history.
	{
		const createEmptyDorm = async (name) => {
			await dorm.mutateDormitory(
				locals(admin),
				'directory',
				form({
					id: 0,
					nama: name,
					kategori: 'putra',
					kapasitas: 10,
					pegawaiId: 0
				})
			);
			return (
				await client.execute({
					sql: 'SELECT * FROM asrama_kamar WHERE sekolah_id=? AND nama=? AND deleted_at IS NULL',
					args: [school, name]
				})
			).rows[0];
		};
		const deleteDorm = (room, user = admin, extra = {}) =>
			dorm.mutateDormitory(
				locals(user),
				'delete',
				form({
					id: room.id,
					versi: room.versi,
					confirmDelete: 'true',
					...extra
				})
			);
		const exists = async (table, id) =>
			(await client.execute({ sql: `SELECT id FROM ${table} WHERE id=?`, args: [id] })).rows.length;
		const record = async (table, id) =>
			(await client.execute({ sql: `SELECT * FROM ${table} WHERE id=?`, args: [id] })).rows[0];
		const { dormRooms } = await vite.ssrLoadModule('/src/lib/server/dormitory-access.ts');
		const unused = await createEmptyDorm('Asrama Hapus Uji');
		await assert.rejects(
			deleteDorm(unused, admin, { confirmDelete: '' }),
			(cause) => cause.status === 400
		);
		await assert.rejects(
			deleteDorm(unused, admin, { versi: Number(unused.versi) + 1 }),
			(cause) => cause.status === 409
		);
		await assert.rejects(deleteDorm(unused, guardian), (cause) => cause.status === 403);
		await assert.rejects(
			deleteDorm(unused, { ...admin, type: 'guru', permissions: ['asrama_manage'] }),
			(cause) => cause.status === 403
		);
		await assert.rejects(
			deleteDorm(unused, {
				...admin,
				type: 'guru',
				permissions: ['asrama_manage', 'asrama_penugasan'],
				sekolahId: school + 1
			}),
			(cause) => cause.status === 403
		);
		const foreignSchool = await insert('sekolah', {
			nama: 'Sekolah Pembatas Uji',
			npsn: `QAD${Date.now()}`,
			jenjang_pendidikan: 'sma',
			alamat_id: schoolAddress,
			kepala_sekolah_id: principal,
			email: 'qa@example.invalid'
		});
		const foreignBuilding = await insert('asrama', {
			sekolah_id: foreignSchool,
			nama: 'Asrama Sekolah Lain',
			nama_key: 'asrama sekolah lain',
			kategori: 'putra'
		});
		const foreignRoom = {
			id: await insert('asrama_kamar', {
				sekolah_id: foreignSchool,
				asrama_id: foreignBuilding,
				nama: 'Kamar Lain',
				nama_key: 'kamar lain',
				kapasitas: 10
			}),
			versi: 1
		};
		await assert.rejects(deleteDorm(foreignRoom), (cause) => cause.status === 404);
		assert.equal(await exists('asrama_kamar', foreignRoom.id), 1);
		assert.equal(await exists('asrama_kamar', unused.id), 1);
		assert.equal((await deleteDorm(unused)).message, 'Asrama berhasil dihapus.');
		assert((await record('asrama_kamar', unused.id)).deleted_at);
		assert((await record('asrama', unused.asrama_id)).deleted_at);
		assert(!(await dormRooms(locals(admin))).some((room) => room.id === unused.id));
		assert((await dormRooms(locals(admin), false, true)).some((room) => room.id === unused.id));
		const replacement = await createEmptyDorm('Asrama Hapus Uji');
		assert.notEqual(replacement.id, unused.id);
		const { dormitoryActions } = await vite.ssrLoadModule('/src/lib/server/dormitory-page.ts');
		await assert.rejects(
			dormitoryActions.save(
				event(`/asrama?kamar_id=${replacement.id}`, admin, {
					operation: 'delete',
					id: replacement.id,
					versi: replacement.versi,
					confirmDelete: 'true'
				})
			),
			(cause) => cause.status === 303 && cause.location === '/asrama'
		);
		await assert.rejects(deleteDorm(unused), (cause) => cause.status === 404);
		const deleteAudit = (
			await client.execute({
				sql: "SELECT * FROM audit_log WHERE sekolah_id=? AND entity_type='asrama' AND entity_id=? AND action='delete'",
				args: [school, String(unused.id)]
			})
		).rows;
		assert.equal(deleteAudit.length, 1);
		assert.match(deleteAudit[0].summary, /Asrama Hapus Uji/);
		const shared = await createEmptyDorm('Gedung Bersama Uji');
		const sibling = await insert('asrama_kamar', {
			sekolah_id: school,
			asrama_id: shared.asrama_id,
			nama: 'Kamar Tetap',
			nama_key: 'kamar tetap',
			kapasitas: 10
		});
		await deleteDorm(shared);
		assert.equal((await record('asrama', shared.asrama_id)).deleted_at, null);
		assert.equal(await exists('asrama_kamar', sibling), 1);
		// A failure writing the audit rolls the room and its parent back atomically.
		const rollbackDorm = await createEmptyDorm('Asrama Rollback Uji');
		await client.execute(
			"CREATE TRIGGER qa_reject_dorm_delete_audit BEFORE INSERT ON audit_log WHEN NEW.action='delete' AND NEW.entity_type='asrama' BEGIN SELECT RAISE(ABORT,'qa_audit_failure'); END"
		);
		await assert.rejects(deleteDorm(rollbackDorm), /qa_audit_failure/);
		assert.equal((await record('asrama_kamar', rollbackDorm.id)).deleted_at, null);
		assert.equal((await record('asrama', rollbackDorm.asrama_id)).deleted_at, null);
		await client.execute('DROP TRIGGER qa_reject_dorm_delete_audit');
		const assigned = await createEmptyDorm('Asrama Wali Uji');
		const assignment = await insert('asrama_penugasan', {
			sekolah_id: school,
			kamar_id: assigned.id,
			pegawai_id: warden,
			peran: 'utama',
			mulai: today,
			nama_snapshot: 'Wali Uji',
			alasan: 'Uji pengaman hapus',
			petugas_id: actor
		});
		await deleteDorm(assigned);
		assert.equal((await record('asrama_penugasan', assignment)).selesai, today);
		const futureRoom = await createEmptyDorm('Asrama Rencana Uji');
		const futureAssignment = await insert('asrama_penugasan', {
			sekolah_id: school,
			kamar_id: futureRoom.id,
			pegawai_id: warden,
			peran: 'utama',
			mulai: '2099-01-01',
			nama_snapshot: 'Wali Rencana',
			alasan: 'Penugasan mendatang',
			petugas_id: actor
		});
		await deleteDorm(futureRoom);
		assert.equal((await record('asrama_penugasan', futureAssignment)).selesai, '2099-01-01');
		const placed = await createEmptyDorm('Asrama Murid Uji');
		const testStudent = await student('Murid Uji Penghapusan', classA);
		const identity = (
			await client.execute({
				sql: 'SELECT identity_uid FROM murid_identity_link WHERE murid_id=?',
				args: [testStudent]
			})
		).rows[0].identity_uid;
		const placement = await insert('asrama_penempatan', {
			sekolah_id: school,
			kamar_id: placed.id,
			murid_id: testStudent,
			identity_uid: identity,
			mulai: today,
			alasan: 'Uji pengaman hapus',
			nama_snapshot: 'Murid Uji Penghapusan',
			kelas_snapshot: 'Belum mendapat kelas',
			petugas_id: actor
		});
		const { ensureDormEvaluationSchema } = await vite.ssrLoadModule(
			'/src/lib/server/db/ensure-dorm-evaluation.ts'
		);
		await ensureDormEvaluationSchema();
		const evaluation = await insert('asrama_evaluasi', {
			sekolah_id: school,
			kamar_id: placed.id,
			semester_id: semester,
			nama: 'Evaluasi Uji'
		});
		const goal = await insert('asrama_evaluasi_tujuan', {
			evaluasi_id: evaluation,
			indikator: 'Kedisiplinan',
			deskripsi: 'Tertib mengikuti kegiatan'
		});
		const grade = await insert('asrama_evaluasi_nilai', {
			penempatan_id: placement,
			tujuan_id: goal,
			murid_id: testStudent,
			kategori: 'baik',
			penilai_id: actor
		});
		const note = await insert('asrama_evaluasi_catatan', {
			penempatan_id: placement,
			semester_id: semester,
			catatan: 'Catatan tetap tersimpan',
			petugas_id: actor
		});
		const preservedGrade = await record('asrama_evaluasi_nilai', grade);
		const preservedNote = await record('asrama_evaluasi_catatan', note);
		const studentBefore = await record('murid', testStudent);
		// Failure after closing residents must roll the closures back as well.
		await client.execute(
			"CREATE TRIGGER qa_reject_dorm_delete_audit BEFORE INSERT ON audit_log WHEN NEW.action='delete' AND NEW.entity_type='asrama' BEGIN SELECT RAISE(ABORT,'qa_audit_failure'); END"
		);
		await assert.rejects(deleteDorm(placed), /qa_audit_failure/);
		assert.equal((await record('asrama_penempatan', placement)).selesai, null);
		assert.equal((await record('asrama_kamar', placed.id)).deleted_at, null);
		await client.execute('DROP TRIGGER qa_reject_dorm_delete_audit');
		await deleteDorm(placed);
		assert.equal((await record('asrama_penempatan', placement)).selesai, today);
		assert.equal((await record('asrama_penempatan', placement)).selesai_alasan, 'Asrama dihapus');
		assert.deepEqual(await record('murid', testStudent), studentBefore);
		assert.deepEqual(await record('asrama_evaluasi_nilai', grade), preservedGrade);
		assert.deepEqual(await record('asrama_evaluasi_catatan', note), preservedNote);
		const passiveAfterDelete = await registry.loadStudentRegistry(event('/murid/pasif'));
		assert(
			passiveAfterDelete.registry.students.some(
				(row) => row.id === testStudent && row.kamar_id === null
			)
		);
		const allAfterDelete = await registry.loadStudentRegistry(event('/murid/semua'));
		assert(
			allAfterDelete.registry.students
				.find((row) => row.id === testStudent)
				.dormHistory.some((row) => row.kamar === placed.nama)
		);
		const { dormEvaluationContext } = await vite.ssrLoadModule(
			'/src/lib/server/dorm-evaluation.ts'
		);
		const historical = await dormEvaluationContext(
			event(`/asesmen-keasramaan?riwayat=1&kamar_id=${placed.id}&semester_id=${semester}`)
		);
		assert(historical.students.some((row) => row.id === testStudent));
		assert(historical.grades.some((row) => row.penempatan_id === placement));
		assert.equal(historical.canGrade, false);
		const printed = await dormEvaluationContext(
			event(`/cetak-raport?bagian=asrama&kamar_id=${placed.id}&semester_id=${semester}`)
		);
		assert(printed.students.some((row) => row.id === testStudent));
		assert(printed.grades.some((row) => row.penempatan_id === placement));
		await assert.rejects(
			dormEvaluationContext(event(`/asesmen-keasramaan?kamar_id=${placed.id}`)),
			(cause) => cause.status === 403
		);
		await assert.rejects(
			client.execute({ sql: 'UPDATE asrama_kamar SET aktif=1 WHERE id=?', args: [placed.id] }),
			/asrama_deleted/
		);
		await assert.rejects(
			dorm.mutateDormitory(
				locals(admin),
				'room',
				form({
					id: placed.id,
					versi: Number(placed.versi) + 1,
					nama: placed.nama,
					kapasitas: 10,
					aktif: 'on'
				})
			),
			(cause) => cause.status === 409
		);
		const destination = await createEmptyDorm('Asrama Tujuan Uji');
		const move = {
			kamarId: destination.id,
			tanggal: today,
			alasan: 'Penempatan setelah asrama dihapus',
			muridId: testStudent
		};
		const preview = await dorm.previewPlacement(locals(admin), dorm.placementInput(form(move)));
		await dorm.mutateDormitory(locals(admin), 'place', form({ ...move, token: preview.token }));
		assert.equal(
			(
				await client.execute({
					sql: 'SELECT kamar_id FROM asrama_penempatan WHERE murid_id=? AND selesai IS NULL',
					args: [testStudent]
				})
			).rows[0].kamar_id,
			destination.id
		);
		assert.equal(await exists('asrama_evaluasi', evaluation), 1);
		assert.equal(await exists('asrama_penempatan', placement), 1);
		assert.equal(await exists('asrama_penugasan', assignment), 1);
		await assert.rejects(
			client.execute({ sql: 'DELETE FROM asrama_penempatan WHERE id=?', args: [placement] }),
			/asrama_history_locked/
		);
		await assert.rejects(
			client.execute({ sql: 'DELETE FROM asrama_penugasan WHERE id=?', args: [assignment] }),
			/asrama_history_locked/
		);
		console.log(
			'PASS: simple dorm deletion, automatic release/reassignment, confirmation, role/school/version guards, name reuse, shared building, audit rollback, historical grades/notes/printing and immutable history.'
		);
	}
	// Master lists must not reclassify students when the report period changes.
	const independentStudent = await student('QA Periode Mandiri', classA);
	const assignment = await registry.studentRegistryActions.assign(
		event('/murid/asrama', admin, { muridId: independentStudent, kamarId: roomA })
	);
	assert.equal(assignment.success, true);
	const masterSnapshot = async () => {
		const all = await registry.loadStudentRegistry(event('/murid/semua?q=QA%20Periode%20Mandiri'));
		const passive = await registry.loadStudentRegistry(
			event('/murid/pasif?q=QA%20Periode%20Mandiri')
		);
		return { students: all.registry.students, passive: passive.registry.students };
	};
	const beforePeriod = await masterSnapshot();
	assert.equal(beforePeriod.students[0].kelas, 'X A');
	assert.equal(beforePeriod.passive.length, 0);
	const newYear = await insert('tahun_ajaran', {
		sekolah_id: school,
		nama: '2027/2028',
		is_aktif: 1
	});
	await insert('semester', {
		tahun_ajaran_id: newYear,
		nama: 'Ganjil',
		tipe: 'ganjil',
		is_aktif: 1
	});
	await client.execute({ sql: 'UPDATE tahun_ajaran SET is_aktif=0 WHERE id=?', args: [year] });
	assert.deepEqual(await masterSnapshot(), beforePeriod);
	const withoutPlacement = await registry.loadStudentRegistry(event('/murid/pasif?q=Murid'));
	await client.execute({ sql: 'UPDATE tahun_ajaran SET is_aktif=0 WHERE id=?', args: [newYear] });
	await client.execute({ sql: 'UPDATE tahun_ajaran SET is_aktif=1 WHERE id=?', args: [year] });
	assert.deepEqual(
		(await registry.loadStudentRegistry(event('/murid/pasif?q=Murid'))).registry.students,
		withoutPlacement.registry.students
	);
	const noSelectedDorm = await registry.loadStudentRegistry(event('/murid/asrama', guardian));
	assert.equal(noSelectedDorm.registry.roomId, null);
	assert.equal(noSelectedDorm.registry.total, 0);
	assert.equal(
		(await registry.loadStudentRegistry(event('/murid/asrama?kamar_id=0', guardian))).registry
			.roomId,
		null
	);
	console.log(
		'PASS: master and passive lists retain identities, current placements and membership across report-year changes; dorm selection matches navbar.'
	);
	// Dormitory rollover starts empty, while previous placements remain historical.
	const { dormRooms } = await vite.ssrLoadModule('/src/lib/server/dormitory-access.ts');
	assert((await dormRooms(locals(admin))).some((room) => room.id === roomA));
	await client.execute({ sql: 'UPDATE tahun_ajaran SET is_aktif=0 WHERE id=?', args: [year] });
	await client.execute({ sql: 'UPDATE tahun_ajaran SET is_aktif=1 WHERE id=?', args: [newYear] });
	assert.equal((await dormRooms(locals(admin))).length, 0);
	await assert.rejects(
		dorm.mutateDormitory(
			locals(admin),
			'directory',
			form({ id: roomA, nama: 'Tidak boleh', kapasitas: 30 })
		),
		(cause) => cause.status === 403
	);
	await assert.rejects(
		dorm.mutateDormitory(
			locals(admin),
			'directory',
			form({ semesterId: semester, nama: 'Form lama', kapasitas: 30 })
		),
		(cause) => cause.status === 409
	);
	await dorm.mutateDormitory(
		locals(admin),
		'directory',
		form({ nama: 'Asrama A', kategori: 'putra', kapasitas: 30 })
	);
	const newRooms = await dormRooms(locals(admin));
	assert.equal(newRooms.length, 1);
	assert.equal(newRooms[0].penghuni, 0);
	assert.equal(newRooms[0].wali, null);
	const newRoom = newRooms[0].id;
	const rolloverCandidates = await registry.loadStudentRegistry(
		event(`/murid/asrama?kamar_id=${newRoom}`)
	);
	assert(rolloverCandidates.registry.candidates.some((row) => row.id === independentStudent));
	const placedAgain = await registry.studentRegistryActions.assign(
		event('/murid/asrama', admin, { muridId: independentStudent, kamarId: newRoom })
	);
	assert.equal(placedAgain.success, true);
	const placementHistory = (
		await client.execute({
			sql: 'SELECT kamar_id,selesai FROM asrama_penempatan WHERE murid_id=? ORDER BY id',
			args: [independentStudent]
		})
	).rows;
	assert.equal(placementHistory.length, 2);
	assert.equal(placementHistory[0].kamar_id, roomA);
	assert(placementHistory[0].selesai);
	assert.equal(placementHistory[1].kamar_id, newRoom);
	assert.equal(placementHistory[1].selesai, null);
	await client.execute({ sql: 'UPDATE tahun_ajaran SET is_aktif=0 WHERE id=?', args: [newYear] });
	await client.execute({ sql: 'UPDATE tahun_ajaran SET is_aktif=1 WHERE id=?', args: [year] });
	assert((await dormRooms(locals(admin))).some((room) => room.id === roomA));
	assert(!(await dormRooms(locals(admin))).some((room) => room.id === newRoom));
	console.log(
		'PASS: dormitory period rollover, empty assignments, name reuse, stale/foreign-period guards and student reassignment history.'
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
