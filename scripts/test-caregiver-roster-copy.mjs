import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { createServer } from 'vite';

await mkdir('tmp', { recursive: true });
const directory = await mkdtemp(path.resolve('tmp/caregiver-roster-'));
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
let connection, pdfModule;
try {
	connection = await vite.ssrLoadModule('/src/lib/server/db/index.ts');
	const roster = await vite.ssrLoadModule('/src/lib/server/caregiver-roster.ts');
	const { parseRosterOptions } = await vite.ssrLoadModule('/src/lib/caregiver-roster.ts');
	const { renderCaregiverRosterHTML } = await vite.ssrLoadModule(
		'/src/lib/server/pdf/templates/daftar-wali-asuh.ts'
	);
	const route = await vite.ssrLoadModule('/src/routes/api/pdf/daftar-wali-asuh/+server.ts');
	pdfModule = await vite.ssrLoadModule('/src/lib/server/pdf/pagedpdf.ts');
	const address = await insert('alamat', { jalan: 'Jalan Pengujian 1' });
	const principal = await insert('pegawai', {
		nama: 'Kepala Sekolah Uji',
		jenis: 'kepala_sekolah',
		status: 'aktif'
	});
	const school = await insert('sekolah', {
		nama: 'SEKOLAH UJI DAFTAR WALI ASUH',
		npsn: `QA${Date.now()}`,
		jenjang_pendidikan: 'sma',
		alamat_id: address,
		kepala_sekolah_id: principal
	});
	const teacher = await insert('pegawai', {
		sekolah_id: school,
		nama: 'Guru Kelas Uji',
		jenis: 'guru',
		status: 'aktif'
	});
	const year = await insert('tahun_ajaran', { sekolah_id: school, nama: '2026/2027', is_aktif: 1 });
	const semester = await insert('semester', {
		tahun_ajaran_id: year,
		tipe: 'ganjil',
		nama: 'Ganjil',
		is_aktif: 1
	});
	const old = await insert('semester', {
		tahun_ajaran_id: year,
		tipe: 'genap',
		nama: 'Genap',
		is_aktif: 0
	});
	const kelas = await insert('kelas', {
		sekolah_id: school,
		tahun_ajaran_id: year,
		semester_id: semester,
		nama: 'X A',
		wali_kelas_id: teacher
	});
	const kelasB = await insert('kelas', {
		sekolah_id: school,
		tahun_ajaran_id: year,
		semester_id: semester,
		nama: 'X B'
	});
	const dorm = await insert('asrama', {
		sekolah_id: school,
		semester_id: semester,
		nama: 'Asrama Uji',
		nama_key: `asrama-${school}`,
		kategori: 'putra',
		aktif: 1
	});
	const room = await insert('asrama_kamar', {
		sekolah_id: school,
		asrama_id: dorm,
		nama: 'Kamar A',
		nama_key: 'a',
		kapasitas: 100,
		aktif: 1
	});
	const caregivers = [];
	for (let i = 0; i < 7; i++)
		caregivers.push(
			await insert('pegawai', {
				sekolah_id: school,
				nama: i < 2 ? 'Wali Asuh Nama Sama' : `Wali Asuh ${i + 1}`,
				jenis: 'wali_asuh',
				status: 'aktif'
			})
		);
	const actor = await insert('auth_user', {
		sekolah_id: school,
		username: `qa.roster.${school}`,
		type: 'admin',
		must_change_password: 0
	});
	const schoolData = await connection.default.query.tableSekolah.findFirst({
		where: (t, { eq }) => eq(t.id, school),
		with: { alamat: true }
	});
	const admin = {
		id: actor,
		type: 'admin',
		roles: ['admin'],
		sekolahId: school,
		username: `qa.roster.${school}`,
		permissions: []
	};
	const locals = { user: admin, sekolah: schoolData };
	const makeStudent = async (
		i,
		{ classId = kelas, period = semester, care = caregivers[i % 7], placement = true, name } = {}
	) => {
		const id = await insert('murid', {
			sekolah_id: school,
			semester_id: period,
			kelas_id: classId,
			nama: name ?? `Murid Uji ${String(i).padStart(3, '0')}`,
			nis: `QA${i}`,
			nisn: `QA${i}`,
			alamat_id: address,
			wali_asuh_pegawai_id: care,
			jenis_kelamin: 'L'
		});
		const uid = `qa-roster-${school}-${i}`;
		await insert('murid_identity_link', {
			murid_id: id,
			sekolah_id: school,
			semester_id: period,
			identity_uid: uid
		});
		if (placement)
			await insert('asrama_penempatan', {
				sekolah_id: school,
				kamar_id: room,
				identity_uid: uid,
				murid_id: id,
				mulai: '2026-01-01',
				nama_snapshot: 'QA',
				kelas_snapshot: 'X A',
				alasan: 'Pengujian'
			});
		return { id, uid };
	};
	for (let i = 0; i < 59; i++)
		await makeStudent(i, {
			classId: i % 2 ? kelas : kelasB,
			name:
				i === 3
					? 'Nama <script>anak</script> & Panjang Sekali Untuk Menguji Pembungkusan Teks Pada Dokumen'
					: undefined
		});
	await makeStudent(59, { care: null });
	await makeStudent(60, { classId: null });
	await makeStudent(61, { placement: false });
	await makeStudent(62, { period: old, placement: false });
	const inactive = await makeStudent(63);
	await insert('murid_lifecycle', {
		sekolah_id: school,
		identity_key: 'uid:' + inactive.uid,
		nis: 'QA63',
		nama_snapshot: 'Nonaktif',
		status: 'keluar',
		needs_identity_review: 0
	});
	const data = await roster.loadCaregiverRoster(locals);
	assert.equal(data.students.length, 62);
	assert.equal(data.context.dorms[0].count, 61);
	assert.equal(data.context.classes.length, 2);
	assert.equal(data.context.caregivers.length, 7);
	assert.equal(data.context.caregivers.filter((c) => c.nama === 'Wali Asuh Nama Sama').length, 2);
	assert(data.students.some((s) => s.kelasId === null));
	assert(data.students.some((s) => s.waliAsuhId === null));
	assert.throws(() => parseRosterOptions({ scope: 'semua', id: kelas }));
	assert.throws(() => parseRosterOptions({ scope: 'kelas', id: '1' }));
	assert.throws(
		() => roster.selectRoster(data, { scope: 'kelas', id: 999999 }),
		(e) => e.status === 404
	);
	await assert.rejects(
		roster.loadCaregiverRoster({ user: null, sekolah: schoolData }),
		(e) => e.status === 401
	);
	await assert.rejects(
		roster.loadCaregiverRoster({
			user: { ...admin, type: 'tim_keamanan', roles: ['tim_keamanan'] },
			sekolah: schoolData
		}),
		(e) => e.status === 403
	);
	const limited = await roster.loadCaregiverRoster({
		user: {
			...admin,
			id: actor + 1,
			type: 'wali_asuh',
			roles: ['wali_asuh'],
			pegawaiId: caregivers[0],
			permissions: []
		},
		sekolah: schoolData
	});
	assert(limited.students.length > 0);
	assert(limited.students.every((s) => s.waliAsuhId === caregivers[0]));
	assert.equal(limited.context.caregivers.length, 1);
	assert.throws(
		() => roster.selectRoster(limited, { scope: 'wali-asuh', id: caregivers[1] }),
		(e) => e.status === 404
	);
	const teacherData = await roster.loadCaregiverRoster({
		user: {
			...admin,
			id: actor + 2,
			type: 'user',
			roles: ['user'],
			pegawaiId: teacher,
			permissions: [],
			waliKelasIds: [kelas]
		},
		sekolah: schoolData
	});
	assert(teacherData.students.length > 0);
	assert(teacherData.students.every((s) => s.kelasId === kelas));
	assert.throws(
		() => roster.selectRoster(teacherData, { scope: 'kelas', id: kelasB }),
		(e) => e.status === 404
	);
	const targets = [
		['kelas', kelas],
		['asrama', dorm],
		['wali-asuh', caregivers[0]]
	];
	for (const [scope, id] of targets) {
		const options = { scope, id },
			selected = roster.selectRoster(data, options);
		const html = renderCaregiverRosterHTML({
			school: { nama: schoolData.nama, alamat: 'Jalan Pengujian 1' },
			period: data.context.period,
			group: selected.group.nama,
			options,
			students: selected.students
		});
		assert(!html.includes('<script>anak</script>'));
		await writeFile(path.join(directory, scope + '.html'), html);
		const response = await route.POST({
			locals,
			request: new Request('http://localhost/api/pdf/daftar-wali-asuh', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(options)
			})
		});
		assert.equal(
			response.status,
			200,
			await (response.status !== 200 ? response.text() : Promise.resolve(''))
		);
		assert(response.headers.get('content-type').includes('application/pdf'));
		const buffer = Buffer.from(await response.arrayBuffer());
		assert(buffer.subarray(0, 4).toString() === '%PDF');
		await writeFile(path.join(directory, scope + '.pdf'), buffer);
	}
	const oversized = Array.from({ length: 65 }, (_, i) => ({
		...data.students[0],
		id: 10000 + i,
		nama: `Anak ${String(i + 1).padStart(3, '0')} Nama Sangat Panjang untuk Pengujian Dokumen`,
		waliAsuhId: caregivers[0],
		waliAsuh: 'Wali Asuh Uji Panjang'
	}));
	const longHtml = renderCaregiverRosterHTML({
		school: { nama: schoolData.nama },
		period: data.context.period,
		group: 'Asrama Uji Panjang',
		options: { scope: 'asrama', id: dorm },
		students: oversized
	});
	await writeFile(path.join(directory, 'panjang.pdf'), await pdfModule.renderPDF(longHtml));
	await writeFile(
		path.join(directory, 'result.json'),
		JSON.stringify(
			{ school, actor, kelas, dorm, caregiver: caregivers[0], count: data.students.length },
			null,
			2
		)
	);
	console.log(
		'PASS: 3 PDFs; active period, identity placement, classless/unassigned students, duplicate caregiver names, lifecycle, teacher and caregiver scopes, validation.'
	);
	console.log('QA artifacts:', directory);
} finally {
	if (pdfModule) await (await pdfModule.getBrowser()).close();
	if (connection) await connection.closeDbClient();
	await vite.close();
	client.close();
}
