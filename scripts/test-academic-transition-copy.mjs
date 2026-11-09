import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { createServer } from 'vite';
import { createHash } from 'node:crypto';

await mkdir('tmp', { recursive: true });
const directory = await mkdtemp(path.resolve('tmp/academic-transition-'));
const database = path.join(directory, 'database.sqlite3');
const source = createClient({ url: 'file:./data/database.sqlite3' });
await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
source.close();
process.env.DB_URL = `file:${database}`;
const client = createClient({ url: process.env.DB_URL });
const insert = async (table, fields) => {
	const columns = (await client.execute(`PRAGMA table_info("${table}")`)).rows;
	const values = { ...fields };
	if (table === 'auth_user') values.username_normalized = String(values.username).toLowerCase();
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
	const db = connection.default;
	const { syncMuridGovernance } = await vite.ssrLoadModule('/src/lib/server/murid-lifecycle.ts');
	const academic = await vite.ssrLoadModule('/src/lib/server/db/academic.ts');
	const route = await vite.ssrLoadModule('/src/routes/(informasi-umum)/akademik/+page.server.ts');
	const qr = await vite.ssrLoadModule('/src/lib/server/student-qr.ts');
	const retention = await vite.ssrLoadModule('/src/lib/server/academic-year-retention.ts');
	const principal = await insert('pegawai', {
		nama: 'Kepala Uji Transisi',
		jenis: 'kepala_sekolah'
	});
	const address = await insert('alamat', { jalan: 'Alamat sintetis' });
	const school = await insert('sekolah', {
		nama: 'QA Transisi Tahun',
		npsn: `QA${Date.now()}`,
		jenjang_pendidikan: 'sma',
		alamat_id: address,
		kepala_sekolah_id: principal
	});
	const caregiver = await insert('pegawai', {
		sekolah_id: school,
		nama: 'Wali Asuh Transisi',
		jenis: 'wali_asuh',
		status: 'aktif'
	});
	const teacher = await insert('pegawai', {
		sekolah_id: school,
		nama: 'Guru Transisi',
		jenis: 'guru',
		status: 'aktif'
	});
	const actor = await insert('auth_user', {
		username: `qa.transition.${school}`,
		type: 'admin',
		sekolah_id: school
	});
	const admin = {
		id: actor,
		username: `qa.transition.${school}`,
		type: 'admin',
		roles: ['admin'],
		permissions: [],
		sekolahId: school
	};
	const locals = { user: admin, sekolah: { id: school } };
	const event = (pathname, values = {}, user = admin) => {
		const result = {
			locals: { ...locals, user },
			url: new URL(pathname, 'http://localhost'),
			route: { id: pathname },
			request: new Request('http://localhost' + pathname, { method: 'POST', body: form(values) }),
			depends() {},
			cookies: { get() {} }
		};
		globalThis.__studentQaEvent = result;
		return result;
	};
	const oldYear = await insert('tahun_ajaran', {
		sekolah_id: school,
		nama: '2026/2027',
		is_aktif: 1
	});
	const year = await insert('tahun_ajaran', { sekolah_id: school, nama: '2027/2028', is_aktif: 0 });
	const ganjil = await insert('semester', {
		tahun_ajaran_id: oldYear,
		nama: 'Semester Ganjil',
		tipe: 'ganjil',
		is_aktif: 1,
		tanggal_masuk: '2026-07-01',
		tanggal_bagi_raport: '2026-12-20'
	});
	const genap = await insert('semester', {
		tahun_ajaran_id: oldYear,
		nama: 'Semester Genap',
		tipe: 'genap',
		is_aktif: 0,
		tanggal_masuk: '2027-01-04',
		tanggal_bagi_raport: '2027-06-25'
	});
	const next = await insert('semester', {
		tahun_ajaran_id: year,
		nama: 'Semester Ganjil',
		tipe: 'ganjil',
		is_aktif: 0,
		tanggal_masuk: '2027-07-12',
		tanggal_bagi_raport: '2027-12-20'
	});
	const oldClass = await insert('kelas', {
		sekolah_id: school,
		tahun_ajaran_id: oldYear,
		semester_id: ganjil,
		nama: 'X A',
		fase: 'E',
		wali_kelas_id: teacher
	});
	const oldStudent = await insert('murid', {
		sekolah_id: school,
		semester_id: ganjil,
		kelas_id: oldClass,
		nis: 'QA-TRANSISI-01',
		nisn: '1234567890',
		nama: 'Anak Uji Transisi',
		tanggal_lahir: '2012-01-01',
		jenis_kelamin: 'L',
		alamat_id: address,
		foto: 'qa-foto-tetap.png',
		nik: '1234567890123456',
		wali_asuh_pegawai_id: caregiver,
		wali_asuh_nama: 'Wali Asuh Transisi',
		wali_asuh_nip: 'QA-01',
		anak_ke: 2
	});
	await syncMuridGovernance(school, [oldStudent]);
	const profiles = await vite.ssrLoadModule('/src/lib/server/murid-profile.ts');
	await profiles.saveStudentProfile(locals, oldStudent, { nomorKk: '0012345678901234' }, 0);
	const originalProfile = await profiles.loadStudentProfile(locals, oldStudent);
	const oldIdentity = (
		await client.execute({
			sql: 'SELECT identity_uid FROM murid_identity_link WHERE murid_id=?',
			args: [oldStudent]
		})
	).rows[0].identity_uid;
	await qr.preparePersonalQr();
	await db.transaction((tx) => qr.issuePersonalQr(school, oldStudent, false, tx));
	const card = await qr.loadActivePrintableQr(oldStudent);
	const uid = async (id) =>
		(
			await client.execute({
				sql: 'SELECT identity_uid FROM murid_identity_link WHERE murid_id=?',
				args: [id]
			})
		).rows[0].identity_uid;
	const record = async (table, id) => ({
		...(await client.execute({ sql: `SELECT * FROM ${table} WHERE id=?`, args: [id] })).rows[0]
	});
	const originalStudent = await record('murid', oldStudent);
	const mapel = await insert('mata_pelajaran', { kelas_id: oldClass, nama: 'Mapel Uji' });
	const grade = await insert('asesmen_sumatif', {
		murid_id: oldStudent,
		mata_pelajaran_id: mapel,
		nilai_akhir: 89
	});
	const health = await insert('kesehatan_murid', {
		sekolah_id: school,
		semester_id: ganjil,
		murid_id: oldStudent,
		tanggal_pengukuran: '2026-11-01',
		tinggi_badan: 150
	});
	await insert('auth_user_murid', {
		auth_user_id: actor,
		murid_id: oldStudent,
		hubungan: 'orang tua'
	});
	const oldGrade = await record('asesmen_sumatif', grade);
	const oldHealth = await record('kesehatan_murid', health);
	const copy = () =>
		route.actions['copy-semester'](
			event('/akademik', { targetSemesterId: genap, sourceSemesterId: ganjil })
		);
	const first = await copy();
	assert(first.message.includes('1 murid disalin'));
	const target = (
		await client.execute({
			sql: 'SELECT * FROM murid WHERE sekolah_id=? AND semester_id=?',
			args: [school, genap]
		})
	).rows[0];
	for (const key of [
		'foto',
		'nik',
		'anak_ke',
		'wali_asuh_pegawai_id',
		'wali_asuh_nama',
		'wali_asuh_nip'
	])
		assert.equal(target[key], originalStudent[key], key);
	assert.equal(await uid(target.id), oldIdentity);
	assert.equal(
		(await profiles.loadStudentProfile(locals, target.id)).profile.id,
		originalProfile.profile.id
	);
	assert.equal(
		(await profiles.loadStudentProfile(locals, target.id)).profile.nomorKk,
		'0012345678901234'
	);
	assert.equal((await qr.loadActivePrintableQr(target.id)).token, card.token);
	assert.deepEqual(await record('murid', oldStudent), originalStudent);
	assert.deepEqual(await record('asesmen_sumatif', grade), oldGrade);
	assert.equal(
		(
			await client.execute({
				sql: 'SELECT count(*) n FROM asesmen_sumatif WHERE murid_id=?',
				args: [target.id]
			})
		).rows[0].n,
		0
	);
	await client.execute({
		sql: 'UPDATE kelas SET wali_kelas_id=NULL WHERE id=?',
		args: [target.kelas_id]
	});
	await client.execute({
		sql: 'UPDATE murid SET nis=? WHERE id=?',
		args: ['QA-TRANSISI-NIS-BARU', target.id]
	});
	assert.equal((await copy()).status, 409);
	await client.execute({
		sql: 'UPDATE murid SET nis=? WHERE id=?',
		args: [originalStudent.nis, target.id]
	});
	await copy();
	assert.equal((await record('kelas', target.kelas_id)).wali_kelas_id, null);
	assert.equal(
		(
			await client.execute({
				sql: 'SELECT count(*) n FROM murid WHERE sekolah_id=? AND semester_id=?',
				args: [school, genap]
			})
		).rows[0].n,
		1
	);
	console.log(
		'PASS copy: complete biodata/caregiver, stable identity and QR, no grade copy/overwrite/duplicate; inconsistent identity blocks copying.'
	);
	await route.actions['set-semester'](event('/akademik', { semesterId: genap }));
	const portal = await vite.ssrLoadModule('/src/routes/portal-wali/+page.server.ts');
	const children = (await portal.load(event('/portal-wali'))).children;
	assert.equal(children.length, 1);
	assert.equal(children[0].muridId, target.id);
	assert.equal(children[0].growth.tinggiBadan, 150);
	assert.equal(children[0].grade, null);
	const detail = await vite.ssrLoadModule(
		'/src/routes/(informasi-umum)/murid/[id]/+layout.server.ts'
	);
	assert.equal(
		(await detail.load({ locals, params: { id: String(target.id) } })).kesehatanRiwayat[0].id,
		health
	);
	const growth = await vite.ssrLoadModule(
		'/src/routes/(informasi-umum)/riwayat-pertumbuhan/+page.server.ts'
	);
	assert(
		(await growth.load(event(`/riwayat-pertumbuhan?kelasId=${target.kelas_id}`))).riwayat.some(
			(row) => row.id === health
		)
	);
	console.log(
		'PASS portal and growth: old parent link resolves current student, historical measurements follow identity and old grades do not become current grades.'
	);
	const staff = await vite.ssrLoadModule('/src/lib/server/presensi-pegawai.ts');
	await insert('presensi_settings', {
		sekolah_id: school,
		tahun_ajaran_id: oldYear,
		hari_sekolah: 6,
		libur_nasional: '["2026-11-09"]'
	});
	await insert('presensi_settings', {
		sekolah_id: school,
		tahun_ajaran_id: year,
		hari_sekolah: 5,
		libur_nasional: '[]'
	});
	assert.equal((await staff.isPresensiPegawaiWorkday(school, '2026-11-07')).isWorkday, true);
	const monitoring = await vite.ssrLoadModule('/src/lib/server/class-monitoring.ts');
	const classCard = (await monitoring.getClassQrCards(locals, [oldClass])).cards[0];
	const snapshot = async () => {
		const tables = (
			await client.execute(
				"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
			)
		).rows;
		const hashes = {};
		for (const { name } of tables) {
			if (['tahun_ajaran', 'semester', 'audit_log'].includes(name)) continue;
			const rows = (await client.execute(`SELECT * FROM "${name.replaceAll('"', '""')}"`)).rows;
			hashes[name] = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
		}
		return hashes;
	};
	const beforeActivation = await snapshot();
	await route.actions['set-tahun-ajaran'](event('/akademik', { tahunAjaranId: year }));
	assert.deepEqual(
		await snapshot(),
		beforeActivation,
		'Activating a year preserves every non-period table, including master data, attachments, grades and attendance'
	);
	await assert.rejects(
		monitoring.getClassQrCards(locals, [oldClass]),
		(cause) => cause.status === 403
	);
	assert.equal(
		(
			await record(
				'class_monitoring_qr',
				(
					await client.execute({
						sql: 'SELECT id FROM class_monitoring_qr WHERE kelas_id=?',
						args: [oldClass]
					})
				).rows[0].id
			)
		).token,
		classCard.token
	);
	assert.equal((await academic.resolveSekolahAcademicContext(school)).activeTahunAjaranId, year);
	assert.equal((await staff.isPresensiPegawaiWorkday(school, '2026-11-07')).isWorkday, true);
	assert.equal((await staff.isPresensiPegawaiWorkday(school, '2026-11-09')).isWorkday, false);
	assert.equal(
		(await staff.getPresensiPegawaiSettings(school, '2026-11-07')).tahunAjaranId,
		oldYear
	);
	await staff.savePresensiPegawai({
		sekolahId: school,
		pegawaiId: teacher,
		tanggal: '2026-11-10',
		status: 'hadir'
	});
	assert.equal(
		(
			await client.execute({
				sql: 'SELECT tahun_ajaran_id FROM presensi_pegawai WHERE pegawai_id=?',
				args: [teacher]
			})
		).rows[0].tahun_ajaran_id,
		oldYear
	);
	assert.equal((await academic.documentSemester(school, oldClass, next)).id, ganjil);
	assert.equal((await academic.documentSemester(school, null, next)).id, next);
	console.log(
		'PASS historical dates: employee workdays/holidays and backdated records retain original year; document dates follow selected class even when multiple old active flags remain.'
	);
	const empty = (await portal.load(event('/portal-wali'))).children[0];
	assert(empty.kelas.includes('Belum ditempatkan'));
	assert.equal(empty.grade, null);
	assert.equal(empty.growth.tinggiBadan, 150);
	const newClass = await insert('kelas', {
		sekolah_id: school,
		tahun_ajaran_id: year,
		semester_id: next,
		nama: 'X A',
		fase: 'E'
	});
	assert.notEqual(
		(await monitoring.getClassQrCards(locals, [newClass])).cards[0].token,
		classCard.token
	);
	const nextValues = { ...originalStudent, semester_id: next, kelas_id: newClass, qr_token: null };
	delete nextValues.id;
	const nextStudent = await insert('murid', nextValues);
	await db.transaction(async (tx) => {
		const { linkMuridIdentity } = await vite.ssrLoadModule(
			'/src/lib/server/murid-identity-service.ts'
		);
		await linkMuridIdentity(
			tx,
			school,
			{
				id: nextStudent,
				nis: originalStudent.nis,
				nisn: originalStudent.nisn,
				nama: originalStudent.nama,
				tanggalLahir: originalStudent.tanggal_lahir,
				semesterId: next
			},
			oldIdentity
		);
	});
	await syncMuridGovernance(school, [nextStudent]);
	assert.equal((await qr.currentQrStudent(school, oldStudent, next)).id, nextStudent);
	assert.equal((await qr.loadActivePrintableQr(nextStudent)).token, card.token);
	const staffUserId = await insert('auth_user', {
		sekolah_id: school,
		type: 'user',
		username: `qa.teacher.${school}`
	});
	await insert('auth_user_kelas', { auth_user_id: staffUserId, kelas_id: oldClass });
	await insert('auth_user_mata_pelajaran', { auth_user_id: staffUserId, mata_pelajaran_id: mapel });
	const staffUser = {
		...admin,
		id: staffUserId,
		type: 'user',
		roles: ['user'],
		pegawaiId: teacher,
		kelasId: oldClass
	};
	const access = await vite.ssrLoadModule('/src/lib/server/route-utils.ts');
	assert.equal(
		(await access.getKelasContextForUser({ ...locals, user: staffUser }, {}, String(nextStudent)))
			.hasAccess,
		false
	);
	assert.equal(
		(await access.getKelasContextForUser({ ...locals, user: staffUser }, {}, String(oldStudent)))
			.hasAccess,
		true
	);
	const { canAccessExportClass } = await vite.ssrLoadModule(
		'/src/lib/server/class-export-access.ts'
	);
	assert.equal(await canAccessExportClass(staffUser, school, newClass), false);
	const { getAksesMapelUser } = await vite.ssrLoadModule('/src/lib/server/mapel-access.ts');
	assert.equal((await getAksesMapelUser(staffUser, newClass)).ids.size, 0);
	console.log(
		'PASS year rollover: starts empty; parent links/QR continue after explicit placement; identical class name never transfers teacher access.'
	);
	const permits = await vite.ssrLoadModule('/src/lib/server/attendance-permits.ts');
	const permit = await insert('izin_pulang_murid', {
		sekolah_id: school,
		tahun_ajaran_id: oldYear,
		semester_id: genap,
		kelas_id: target.kelas_id,
		murid_id: target.id,
		nis_snapshot: target.nis,
		nama_snapshot: target.nama,
		kelas_snapshot: 'X A',
		tanggal_keluar: '2027-06-30',
		rencana_kembali: '2027-07-15',
		status: 'sedang_izin',
		alasan: 'Uji lintas periode'
	});
	const beforePermit = await record('izin_pulang_murid', permit);
	const currentPermits = await permits.loadAttendancePermits(school, [nextStudent], '2027-07-12');
	assert.equal(currentPermits.length, 1);
	assert.equal(currentPermits[0].muridId, nextStudent);
	assert.deepEqual(await record('izin_pulang_murid', permit), beforePermit);
	assert.equal(await permits.canManageStudentPermit(staffUser, school, target.id), false);
	await insert('auth_user_kelas', { auth_user_id: staffUserId, kelas_id: newClass });
	// Reload the account object so request-local access caches reflect the new assignment.
	assert.equal(await permits.canManageStudentPermit({ ...staffUser }, school, target.id), true);
	assert.equal((await getAksesMapelUser({ ...staffUser }, newClass)).ids.size, 0);
	console.log(
		'PASS ongoing leave follows identity across years without rewriting original permit.'
	);
	const { travelLocalTime } = await vite.ssrLoadModule('/src/lib/attendance-travel.ts');
	const today = travelLocalTime().date;
	const yesterday = travelLocalTime(new Date(Date.now() - 86400000)).date;
	await client.execute({
		sql: 'UPDATE izin_pulang_murid SET tanggal_keluar=?,rencana_kembali=? WHERE id=?',
		args: [yesterday, today, permit]
	});
	await insert('perjalanan_murid', {
		izin_id: permit,
		keluar_pada: new Date(Date.now() - 86400000).toISOString(),
		keluar_oleh: actor
	});
	const travel = await vite.ssrLoadModule(
		'/src/routes/api/administrasi/absensi/scan/perjalanan/+server.ts'
	);
	const scanEvent = (body) => ({
		locals,
		request: new Request('http://localhost/api/administrasi/absensi/scan/perjalanan', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ token: card.token, operation: 'kembali_ke_sekolah', ...body })
		})
	});
	const preview = await (await travel.POST(scanEvent({}))).json();
	assert.equal(preview.verification.murid.id, nextStudent);
	assert.equal(preview.verification.id, permit);
	const returned = await (
		await travel.POST(
			scanEvent({ confirm: true, permitId: permit, revision: preview.verification.revision })
		)
	).json();
	assert.equal(returned.code, 'success');
	const duplicate = await travel.POST(scanEvent({}));
	assert.equal(duplicate.status, 409);
	assert.equal((await duplicate.json()).code, 'already_present');
	assert.equal((await record('izin_pulang_murid', permit)).murid_id, target.id);
	console.log(
		'PASS cross-period security scan: old QR closes original journey for current student; duplicate return is idempotent.'
	);
	await assert.rejects(
		retention.deleteEmptyAcademicYears(locals, event('/').request, school, [year]),
		(cause) => cause.status === 409
	);
	const emptyYear = await insert('tahun_ajaran', {
		sekolah_id: school,
		nama: '2028/2029',
		is_aktif: 0
	});
	const emptySemester = await insert('semester', {
		tahun_ajaran_id: emptyYear,
		nama: 'Ganjil',
		tipe: 'ganjil'
	});
	await assert.rejects(
		retention.deleteEmptyAcademicYears(locals, event('/').request, school, [oldYear, emptyYear]),
		(cause) => cause.status === 409
	);
	assert.equal((await record('tahun_ajaran', emptyYear)).id, emptyYear);
	await client.execute(
		'CREATE TABLE qa_optional_period(id INTEGER PRIMARY KEY,semester_id INTEGER)'
	);
	await client.execute({
		sql: 'INSERT INTO qa_optional_period VALUES(1,?)',
		args: [emptySemester]
	});
	await assert.rejects(
		retention.deleteEmptyAcademicYears(locals, event('/').request, school, [emptyYear]),
		(cause) => cause.status === 409
	);
	await client.execute('DROP TABLE qa_optional_period');
	await retention.deleteEmptyAcademicYears(locals, event('/').request, school, [emptyYear]);
	assert.equal(
		(await client.execute({ sql: 'SELECT id FROM tahun_ajaran WHERE id=?', args: [emptyYear] }))
			.rows.length,
		0
	);
	assert.deepEqual(await record('asesmen_sumatif', grade), oldGrade);
	assert.deepEqual(await record('kesehatan_murid', health), oldHealth);
	assert.equal((await client.execute('PRAGMA foreign_key_check')).rows.length, 0);
	const hash = createHash('sha256')
		.update(JSON.stringify({ oldGrade, oldHealth, beforePermit }))
		.digest('hex');
	await writeFile(
		path.join(directory, 'result.json'),
		JSON.stringify(
			{
				school,
				oldYear,
				year,
				ganjil,
				genap,
				next,
				oldStudent,
				nextStudent,
				retainedHash: hash,
				status: 'PASS'
			},
			null,
			2
		)
	);
	console.log(
		'PASS retention: active/nonempty/optional-module years blocked atomically; empty year deletable; historical records and foreign keys preserved.'
	);
	console.log('QA artifacts:', directory);
} finally {
	if (connection) await connection.closeDbClient();
	delete globalThis.__studentQaEvent;
	await vite.close();
	client.close();
}
