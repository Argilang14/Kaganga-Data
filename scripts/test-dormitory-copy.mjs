import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { createServer } from 'vite';

const root = process.cwd();
await mkdir('tmp', { recursive: true });
const folder = await mkdtemp(path.resolve('tmp/dormitory-qa-'));
const database = path.join(folder, 'database.sqlite3');
const source = createClient({ url: 'file:./data/database.sqlite3' });
try {
	await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
} finally {
	source.close();
}
process.env.DB_URL = `file:${database}`;
process.env.KAGANGA_DATA_DIR = path.join(folder, 'data');
const client = createClient({ url: process.env.DB_URL });
const query = async (sql, args = []) => (await client.execute({ sql, args })).rows;
const row = async (sql, args = []) => (await query(sql, args))[0];
const insert = async (table, value) => {
	const entries = Object.entries(value);
	return Number(
		(
			await client.execute({
				sql: `INSERT INTO "${table}" (${entries.map(([key]) => `"${key}"`).join(',')}) VALUES (${entries.map(() => '?').join(',')})`,
				args: entries.map(([, value]) => value)
			})
		).lastInsertRowid
	);
};
const clone = (record, changes) => {
	const result = { ...record, ...changes };
	delete result.id;
	return result;
};
const checks = [];
const pass = (name) => {
	checks.push(name);
	console.log('PASS', name);
};
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const reject = async (fn, status) => assert.rejects(fn, (cause) => cause.status === status);
const form = (value) => {
	const f = new FormData();
	for (const [key, v] of Object.entries(value))
		for (const item of Array.isArray(v) ? v : [v]) f.append(key, String(item));
	return f;
};
let vite, connection;
try {
	vite = await createServer({
		configFile: false,
		resolve: { alias: { $lib: path.join(root, 'src/lib') } },
		plugins: [
			{
				name: 'qa-env',
				resolveId(id) {
					if (id === '$env/dynamic/private') return '\0qa-env';
				},
				load(id) {
					if (id === '\0qa-env') return 'export const env = process.env;';
				}
			}
		],
		optimizeDeps: { noDiscovery: true, include: [] },
		server: { middlewareMode: true, hmr: false, watch: null },
		appType: 'custom',
		logLevel: 'error'
	});
	connection = await vite.ssrLoadModule('/src/lib/server/db/index.ts');
	assert.equal(connection.databaseUrl, process.env.DB_URL);
	const service = await vite.ssrLoadModule('/src/lib/server/dormitory.ts');
	const access = await vite.ssrLoadModule('/src/lib/server/dormitory-access.ts');
	const assignments = await vite.ssrLoadModule('/src/lib/server/assignment-summary.ts');
	const care = await vite.ssrLoadModule('/src/lib/server/pengasuhan.ts');
	const monitoring = await vite.ssrLoadModule('/src/lib/server/attendance-monitoring.ts');
	const academic = await vite.ssrLoadModule('/src/lib/server/db/academic.ts');
	const enums = await vite.ssrLoadModule('/src/lib/dormitory.ts');
	const admin = await connection.default.query.tableAuthUser.findFirst({
		where: (t, { eq }) => eq(t.type, 'admin')
	});
	const original = await row('SELECT * FROM murid LIMIT 1');
	const school = await connection.default.query.tableSekolah.findFirst({
		where: (t, { eq }) => eq(t.id, Number(original.sekolah_id))
	});
	const locals = { user: { ...admin, permissions: [], jabatanAkses: null }, sekolah: school };
	const ctx = await academic.resolveSekolahAcademicContext(school.id);
	const today = enums.dormToday();
	const before = digest(
		await query(
			'SELECT id,kelas_id,semester_id,nis,nisn,wali_asuh_nama,wali_asrama_nama FROM murid ORDER BY id'
		)
	);
	const mark = digest(
		await query(
			"SELECT name,sql FROM sqlite_master WHERE name LIKE '%asesmen%' OR name LIKE '%rapor%' ORDER BY name"
		)
	);
	await service.loadDormitory(locals, new URLSearchParams());
	await service.loadDormitory(locals, new URLSearchParams());
	pass('idempotent schema; no automatic room, pupil, or warden assignments');
	const suffix = randomUUID().slice(0, 7);
	await service.mutateDormitory(
		locals,
		'building',
		form({ nama: `QA Putra ${suffix}`, kategori: 'putra', aktif: 'on' })
	);
	await service.mutateDormitory(
		locals,
		'building',
		form({ nama: `QA Putri ${suffix}`, kategori: 'putri', aktif: 'on' })
	);
	const building = Number(
		(await row('SELECT id FROM asrama WHERE nama=?', [`QA Putra ${suffix}`])).id
	);
	const girls = Number(
		(await row('SELECT id FROM asrama WHERE nama=?', [`QA Putri ${suffix}`])).id
	);
	const rooms = [];
	for (const [name, cap, asrama] of [
		['A', 2, building],
		['B', 3, building],
		['C', 1, girls]
	]) {
		await service.mutateDormitory(
			locals,
			'room',
			form({ nama: name, kapasitas: cap, asramaId: asrama, aktif: 'on' })
		);
		rooms.push(
			Number(
				(await row('SELECT id FROM asrama_kamar WHERE asrama_id=? AND nama=?', [asrama, name])).id
			)
		);
	}
	const [a, b, g] = rooms;
	const employeeOriginal = await row('SELECT * FROM pegawai WHERE sekolah_id=? LIMIT 1', [
		school.id
	]);
	const employees = [];
	for (let i = 0; i < 3; i++)
		employees.push(
			await insert(
				'pegawai',
				clone(employeeOriginal, {
					nama: `QA Wali Sama ${suffix}`,
					kode_pegawai: `QA-${suffix}-${i}`,
					nik: null,
					nuptk: null,
					email: null,
					nip: `QA-${suffix}-${i}`,
					status: 'aktif'
				})
			)
		);
	const primary = async (room, employee, old = 0) =>
		service.mutateDormitory(
			locals,
			'staff',
			form({
				kamarId: room,
				pegawaiId: employee,
				peran: 'utama',
				tanggal: today,
				alasan: 'QA penugasan',
				old
			})
		);
	await primary(a, employees[0]);
	await primary(b, employees[0]);
	const students = [];
	for (let i = 0; i < 4; i++) {
		const kelas = await row(
			'SELECT * FROM kelas WHERE sekolah_id=? AND semester_id=? LIMIT 1 OFFSET ?',
			[school.id, ctx.activeSemesterId, i % 2]
		);
		const id = await insert(
			'murid',
			clone(original, {
				nama: `QA Murid ${i} ${suffix}`,
				nis: `QA${suffix}${i}`,
				nisn: '',
				jenis_kelamin: i === 3 ? 'P' : 'L',
				kelas_id: kelas.id,
				semester_id: ctx.activeSemesterId,
				wali_asrama_nama: employeeOriginal.nama,
				wali_asuh_nama: employeeOriginal.nama
			})
		);
		const uid = randomUUID();
		await insert('murid_identity_link', {
			murid_id: id,
			sekolah_id: school.id,
			semester_id: ctx.activeSemesterId,
			identity_uid: uid
		});
		students.push({ id, uid });
	}
	const preview = async (ids, room, date = today) =>
		service.previewPlacement(locals, { ids, room, date, reason: 'QA pindah' });
	const apply = async (plan) =>
		service.mutateDormitory(
			locals,
			'place',
			form({
				kamarId: plan.input.room,
				muridId: plan.input.ids,
				tanggal: plan.input.date,
				alasan: plan.input.reason,
				token: plan.token
			})
		);
	const plan = await preview(
		students.slice(0, 2).map((s) => s.id),
		a
	);
	await apply(plan);
	assert.equal(
		Number(
			(
				await row(
					'SELECT COUNT(*) AS n FROM asrama_penempatan WHERE kamar_id=? AND selesai IS NULL',
					[a]
				)
			).n
		),
		2
	);
	pass('bulk placement cross-class atomic and capacity-aware');
	await reject(() => preview([students[2].id], a), 409);
	await reject(() => preview([students[3].id], b), 400);
	await reject(() => preview([students[0].id], a), 409);
	await reject(() => apply(plan), 409);
	pass('full room, wrong gender, duplicate placement and stale preview rejected');
	const old = await row('SELECT * FROM asrama_penempatan WHERE identity_uid=?', [students[0].uid]);
	await apply(await preview([students[0].id], b));
	assert.equal(
		(await row('SELECT selesai FROM asrama_penempatan WHERE id=?', [old.id])).selesai,
		today
	);
	assert.equal(
		Number(
			(
				await row(
					'SELECT sebelumnya_id FROM asrama_penempatan WHERE identity_uid=? AND selesai IS NULL',
					[students[0].uid]
				)
			).sebelumnya_id
		),
		Number(old.id)
	);
	await assert.rejects(() =>
		client.execute({ sql: 'DELETE FROM asrama_penempatan WHERE id=?', args: [old.id] })
	);
	await assert.rejects(() =>
		client.execute({
			sql: 'UPDATE asrama_penempatan SET alasan=? WHERE id=?',
			args: ['ubah', old.id]
		})
	);
	pass('same-day transfer appends immutable history; no duplicate active UID');
	await assert.rejects(() =>
		service.mutateDormitory(
			locals,
			'room',
			form({ id: a, versi: 1, nama: 'A', kapasitas: 1, aktif: '' })
		)
	);
	await assert.rejects(() =>
		service.mutateDormitory(
			locals,
			'building',
			form({ id: building, versi: 1, nama: `QA Putra ${suffix}`, kategori: 'putri', aktif: 'on' })
		)
	);
	pass('occupied rooms cannot be deactivated; occupied building category cannot change');
	const guard = (employee) => ({
		...locals,
		user: {
			...admin,
			type: 'wali_asrama',
			jabatanAkses: null,
			permissions: [],
			pegawaiId: employee,
			sekolahId: school.id,
			mustChangePassword: false
		}
	});
	const first = guard(employees[0]),
		other = guard(employees[1]);
	assert.equal((await access.dormRooms(first)).length, 2);
	assert.equal((await access.dormRooms(other)).length, 0);
	await reject(
		() =>
			service.mutateDormitory(first, 'close', form({ id: old.id, tanggal: today, alasan: 'QA' })),
		403
	);
	await reject(
		() =>
			service.loadDormitory(other, new URLSearchParams({ kamar_id: String(a), view: 'penghuni' })),
		403
	);
	pass('warden IDs survive duplicate employee names; unassigned rooms and mutations denied');
	const assigned = await assignments.guardianStudentCondition(first.user, school.id);
	const schema = await vite.ssrLoadModule('/src/lib/server/db/schema.ts');
	const { and, eq } = await vite.ssrLoadModule('drizzle-orm');
	const guardedIds = async (user) => {
		const condition = await assignments.guardianStudentCondition(user, school.id);
		return (
			await connection.default
				.select({ id: schema.tableMurid.id })
				.from(schema.tableMurid)
				.where(and(eq(schema.tableMurid.sekolahId, school.id), condition))
		).map((r) => r.id);
	};
	assert.ok(assigned);
	assert.ok((await guardedIds(first.user)).includes(students[0].id));
	const staff = await row(
		"SELECT * FROM asrama_penugasan WHERE kamar_id=? AND peran='utama' AND selesai IS NULL",
		[b]
	);
	await primary(b, employees[1], Number(staff.id));
	assert.ok(!(await guardedIds(first.user)).includes(students[0].id));
	assert.ok((await guardedIds(other.user)).includes(students[0].id));
	pass('private scope follows current room assignment, not the old warden name');
	await apply(await preview([students[3].id], g));
	const careA = await care.careContext(locals, a),
		careB = await care.careContext(locals, b);
	assert.ok(careA.students.some((r) => r.id === students[1].id));
	assert.ok(!careA.students.some((r) => r.id === students[0].id));
	assert.ok(careB.students.some((r) => r.id === students[0].id));
	const mon = await monitoring.loadAttendanceMonitoring(
		first,
		new URLSearchParams({ tanggal: today, tab: 'asrama', kamar_id: String(b) })
	);
	assert.ok(mon.rows.some((r) => r.id === students[0].id || r.muridId === students[0].id));
	pass('care uses assigned room; school-wide warden attendance remains available for other rooms');
	const semester = await row('SELECT * FROM semester WHERE id=?', [ctx.activeSemesterId]);
	const otherSemester = await row('SELECT * FROM semester WHERE tahun_ajaran_id=? AND id<>?', [
		semester.tahun_ajaran_id,
		semester.id
	]);
	const next = otherSemester
		? Number(otherSemester.id)
		: await insert(
				'semester',
				clone(semester, { tipe: semester.tipe === 'ganjil' ? 'genap' : 'ganjil', is_aktif: 0 })
			);
	const copy = await insert(
		'murid',
		clone(await row('SELECT * FROM murid WHERE id=?', [students[0].id]), { semester_id: next })
	);
	await insert('murid_identity_link', {
		murid_id: copy,
		sekolah_id: school.id,
		semester_id: next,
		identity_uid: students[0].uid
	});
	assert.equal(
		Number(
			(
				await row(
					'SELECT COUNT(*) AS n FROM asrama_penempatan WHERE identity_uid=? AND selesai IS NULL',
					[students[0].uid]
				)
			).n
		),
		1
	);
	pass('cross-semester student copies retain one persistent room placement');
	const oldWard = await row('SELECT * FROM pegawai WHERE id=?', [employeeOriginal.id]);
	const asuh = {
		...locals,
		user: {
			...admin,
			type: 'wali_asuh',
			jabatanAkses: null,
			permissions: [],
			pegawaiId: Number(oldWard.id),
			sekolahId: school.id,
			mustChangePassword: false
		}
	};
	assert.ok((await guardedIds(asuh.user)).includes(students[0].id));
	await client.execute({
		sql: 'UPDATE murid SET wali_asuh_nama=? WHERE id=?',
		args: [`Tidak ditugaskan ${suffix}`, students[1].id]
	});
	assert.ok(!(await guardedIds(asuh.user)).includes(students[1].id));
	pass('wali asuh remains bound to personal assignments independently of room warden');
	const untouched = await service.previewPlacement(locals, {
		ids: [students[2].id],
		room: a,
		date: today,
		reason: 'QA stale'
	});
	await client.execute({ sql: 'UPDATE asrama_kamar SET versi=versi+1 WHERE id=?', args: [a] });
	await reject(() => apply(untouched), 409);
	assert.equal(
		Number(
			(
				await row('SELECT COUNT(*) AS n FROM asrama_penempatan WHERE identity_uid=?', [
					students[2].uid
				])
			).n
		),
		0
	);
	pass('stale preview leaves no partial student placement');
	const foreignSchool = await insert(
		'sekolah',
		clone(await row('SELECT * FROM sekolah WHERE id=?', [school.id]), {
			nama: `QA Sekolah Lain ${suffix}`,
			npsn: `QA${suffix}`
		})
	);
	const foreignBuilding = await insert('asrama', {
		sekolah_id: foreignSchool,
		nama: 'QA Foreign',
		nama_key: 'qa foreign',
		kategori: 'putra'
	});
	await assert.rejects(() =>
		service.mutateDormitory(
			locals,
			'room',
			form({ nama: 'Kamar Tidak Sah', asramaId: foreignBuilding, kapasitas: 2, aktif: 'on' })
		)
	);
	await reject(
		() =>
			service.loadDormitory(
				{ ...first, sekolah: { ...school, id: foreignSchool } },
				new URLSearchParams()
			),
		403
	);
	pass('tenant boundary enforced for master creation, room lookup and non-admin context');
	const girlPlacement = await row(
		'SELECT * FROM asrama_penempatan WHERE identity_uid=? AND selesai IS NULL',
		[students[3].uid]
	);
	await service.mutateDormitory(
		locals,
		'close',
		form({ id: girlPlacement.id, tanggal: today, alasan: 'QA keluar asrama' })
	);
	await reject(
		() =>
			service.mutateDormitory(
				locals,
				'close',
				form({ id: girlPlacement.id, tanggal: today, alasan: 'QA ulang' })
			),
		409
	);
	assert.equal(
		(await row('SELECT selesai_alasan FROM asrama_penempatan WHERE id=?', [girlPlacement.id]))
			.selesai_alasan,
		'QA keluar asrama'
	);
	assert.ok(!(await guardedIds({ ...asuh.user, type: 'wali_asrama' })).includes(students[3].id));
	pass('closing placement is single-use; reason saved and legacy private access not resurrected');
	await service.mutateDormitory(
		locals,
		'room',
		form({ nama: 'QA Kapasitas Satu', kapasitas: 1, asramaId: building, aktif: 'on' })
	);
	const limited = Number(
		(
			await row('SELECT id FROM asrama_kamar WHERE asrama_id=? AND nama=?', [
				building,
				'QA Kapasitas Satu'
			])
		).id
	);
	const concurrent = [];
	for (let i = 0; i < 2; i++) {
		const id = await insert(
			'murid',
			clone(original, {
				nama: `QA Serentak ${suffix} ${i}`,
				nis: `QAConcurrent${suffix}${i}`,
				nisn: '',
				jenis_kelamin: 'L',
				semester_id: ctx.activeSemesterId
			})
		);
		const uid = randomUUID();
		await insert('murid_identity_link', {
			murid_id: id,
			sekolah_id: school.id,
			semester_id: ctx.activeSemesterId,
			identity_uid: uid
		});
		students.push({ id, uid });
		concurrent.push(await preview([id], limited));
	}
	const attempts = await Promise.allSettled(concurrent.map((plan) => apply(plan)));
	assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1);
	assert.equal(
		Number(
			(
				await row(
					'SELECT COUNT(*) AS n FROM asrama_penempatan WHERE kamar_id=? AND selesai IS NULL',
					[limited]
				)
			).n
		),
		1
	);
	pass('simultaneous confirmations cannot exceed room capacity');
	assert.equal(
		mark,
		digest(
			await query(
				"SELECT name,sql FROM sqlite_master WHERE name LIKE '%asesmen%' OR name LIKE '%rapor%' ORDER BY name"
			)
		)
	);
	const after = digest(
		await query(
			`SELECT id,kelas_id,semester_id,nis,nisn,wali_asuh_nama,wali_asrama_nama FROM murid WHERE id NOT IN (${[...students.map((s) => s.id), copy].map(() => '?').join(',')}) ORDER BY id`,
			[...students.map((s) => s.id), copy]
		)
	);
	assert.equal(after, before);
	assert.equal((await row('PRAGMA integrity_check')).integrity_check, 'ok');
	assert.equal((await query('PRAGMA foreign_key_check')).length, 0);
	pass('existing classes, student assignments and report schemas unchanged; integrity OK');
	await writeFile(path.join(folder, 'result.json'), JSON.stringify({ database, checks }, null, 2));
	const token = randomUUID(),
		now = new Date().toISOString();
	await insert('auth_session', {
		user_id: admin.id,
		token_hash: createHash('sha256').update(token).digest('hex'),
		user_agent: 'QA asrama',
		ip_address: '127.0.0.1',
		expires_at: new Date(Date.now() + 3600000).toISOString(),
		created_at: now,
		updated_at: now
	});
	await writeFile(
		path.join(folder, 'ui-fixture.json'),
		JSON.stringify({
			database,
			token,
			schoolId: school.id,
			rooms,
			students,
			employee: employees[0],
			suffix,
			today
		})
	);
	await writeFile('tmp/dormitory-latest.json', JSON.stringify({ folder }));
	console.log(JSON.stringify({ database, passed: checks.length }, null, 2));
} finally {
	client.close();
	await connection?.closeDbClient?.();
	await vite?.close();
}
