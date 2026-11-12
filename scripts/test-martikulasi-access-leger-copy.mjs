import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { createServer } from 'vite';

await mkdir('tmp', { recursive: true });
const folder = await mkdtemp(path.resolve('tmp/martikulasi-access-leger-'));
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
const pass = (name) => console.log('PASS', name);
try {
	connection = await vite.ssrLoadModule('/src/lib/server/db/index.ts');
	assert.equal(connection.databaseUrl, process.env.DB_URL);
	const module = await vite.ssrLoadModule(
		'/src/routes/(input-nilai)/asesmen-martikulasi/+page.server.ts'
	);
	const access = await vite.ssrLoadModule('/src/lib/server/martikulasi-access.ts');
	const recap = await vite.ssrLoadModule('/src/routes/(input-nilai)/nilai-akhir/+page.server.ts');
	const leger = await vite.ssrLoadModule('/src/routes/api/leger-metadata/+server.ts');
	const levels = await vite.ssrLoadModule('/src/lib/server/martikulasi-levels.ts');
	const ensure = await vite.ssrLoadModule('/src/lib/server/db/ensure-martikulasi.ts');
	await ensure.ensureMartikulasiSchema();
	const seedClass = await one(
		'SELECT k.* FROM kelas k JOIN semester s ON s.id=k.semester_id JOIN tahun_ajaran t ON t.id=s.tahun_ajaran_id WHERE s.is_aktif=1 AND t.is_aktif=1 LIMIT 1'
	);
	assert.ok(seedClass);
	const school = Number(seedClass.sekolah_id),
		semester = Number(seedClass.semester_id),
		year = Number(seedClass.tahun_ajaran_id),
		tag = randomUUID();
	const employee = await insert('pegawai', {
		sekolah_id: school,
		nama: 'QA Guru ' + tag,
		nip: '',
		jenis: 'guru',
		status: 'aktif'
	});
	const guardian = await insert('pegawai', {
		sekolah_id: school,
		nama: 'QA Asuh ' + tag,
		nip: '',
		jenis: 'wali_asuh',
		status: 'aktif'
	});
	const ownClass = await insert('kelas', {
		...seedClass,
		nama: 'QA A ' + tag,
		wali_kelas_id: employee
	});
	const otherClass = await insert('kelas', {
		...seedClass,
		nama: 'QA B ' + tag,
		wali_kelas_id: null
	});
	const seed = await one('SELECT * FROM murid WHERE sekolah_id=? LIMIT 1', [school]);
	const pupils = [];
	for (let i = 0; i < 23; i++)
		pupils.push(
			await insert('murid', {
				...seed,
				kelas_id: i === 22 ? otherClass : ownClass,
				semester_id: semester,
				nama: `QA ${String(i).padStart(2, '0')} ${tag}`,
				nis: `qa-${i}-${tag}`,
				nisn: '',
				wali_asuh_pegawai_id: i === 0 || i === 22 ? guardian : null,
				dapodik_peserta_didik_id: null,
				dapodik_anggota_rombel_id: null
			})
		);
	const base = {
		id: 999999,
		type: 'user',
		roles: ['user'],
		pegawaiId: employee,
		sekolahId: school,
		permissions: [],
		waliKelasIds: [ownClass]
	};
	const users = {
		homeroom: base,
		guardian: {
			...base,
			type: 'wali_asuh',
			roles: ['wali_asuh'],
			pegawaiId: guardian,
			waliKelasIds: []
		},
		kesiswaan: { ...base, roles: ['waka_kesiswaan'], pegawaiId: null, waliKelasIds: [] },
		teacher: { ...base, waliKelasIds: [], pegawaiId: null },
		dorm: {
			...base,
			type: 'wali_asrama',
			roles: ['wali_asrama'],
			pegawaiId: guardian,
			waliKelasIds: []
		},
		combined: { ...base, roles: ['user', 'wali_asuh'], pegawaiId: employee }
	};
	const event = (user, kelasId, fields = {}, method = 'POST') => {
		const form = new FormData();
		for (const [key, value] of Object.entries(fields)) form.set(key, String(value));
		const url = new URL('http://localhost/asesmen-martikulasi');
		return {
			locals: { user, sekolah: { id: school } },
			url,
			cookies: { get: () => String(kelasId) },
			depends: () => {},
			parent: async () => ({ kelasAktif: { id: kelasId } }),
			request: new Request(url, { method, body: method === 'POST' ? form : undefined })
		};
	};
	const save = (user, kelasId, muridId) =>
		module.actions.simpan(
			event(user, kelasId, {
				tahunAjaranId: year,
				kelasId,
				muridId,
				levelPenempatan: 'madya',
				nilai_literasi_capaianAwal: '40',
				nilai_literasi_capaianAkhir: '70',
				nilai_numerasi_capaianAkhir: '75',
				nilai_sains_capaianAkhir: '64',
				nilai_bahasa_inggris_capaianAkhir: '49',
				nilai_keagamaan_akhlak_deskripsiCapaian: 'B',
				nilai_kepemimpinan_kesamaptaan_deskripsiCapaian: 'C',
				nilai_sosial_kepribadian_deskripsiCapaian: 'B',
				nilai_kemandirian_keasramaan_capaianAkhir: '99',
				nilai_kemandirian_keasramaan_deskripsiCapaian: 'B'
			})
		);
	for (const [name, cls, count] of [
		['homeroom', ownClass, 20],
		['guardian', ownClass, 1],
		['kesiswaan', ownClass, 20],
		['guardian', otherClass, 1]
	]) {
		const data = await module.load(event(users[name], cls, {}, 'GET'));
		assert.equal(data.daftarMurid.length, count);
		assert.equal(data.canEdit, true);
	}
	assert.equal((await module.load(event(users.homeroom, otherClass, {}, 'GET'))).jumlahMurid, 0);
	assert.equal((await module.load(event(users.guardian, ownClass, {}, 'GET'))).jumlahMurid, 1);
	assert.deepEqual(await access.martikulasiClassIds(users.homeroom, school, semester), [ownClass]);
	assert.ok(
		(await access.martikulasiClassIds(users.guardian, school, semester)).includes(otherClass)
	);
	assert.ok(
		(await access.martikulasiClassIds(users.kesiswaan, school, semester)).includes(otherClass)
	);
	pass(
		'Daftar dan pemilih kelas: wali kelas hanya kelas binaan; wali asuh hanya anak binaan; Waka Kesiswaan lintas kelas'
	);
	assert.ok((await save(users.homeroom, ownClass, pupils[0])).message);
	assert.ok((await save(users.guardian, otherClass, pupils[22])).message);
	assert.ok((await save(users.kesiswaan, ownClass, pupils[1])).message);
	for (const [user, cls, pupil] of [
		[users.homeroom, otherClass, pupils[22]],
		[users.guardian, ownClass, pupils[1]],
		[users.teacher, ownClass, pupils[0]],
		[users.dorm, ownClass, pupils[0]]
	])
		assert.ok([400, 403].includes((await save(user, cls, pupil)).status));
	pass('Simpan per murid menerima penugasan yang sah dan menolak ID murid/kelas di luar penugasan');
	const mass = (scope, ids) =>
		module.actions.isi_massal(
			event(users.guardian, ownClass, {
				tahunAjaranId: year,
				kelasId: ownClass,
				scope,
				muridIds: JSON.stringify(ids),
				field: 'levelPenempatan',
				value: 'mahir'
			})
		);
	assert.equal((await mass('terpilih', [pupils[0], pupils[1]])).status, 403);
	assert.equal((await mass('semua', [])).updated, 1);
	assert.equal(
		(
			await one(
				'SELECT level_penempatan level FROM martikulasi_hasil WHERE murid_id=? AND tahun_ajaran_id=?',
				[pupils[1], year]
			)
		).level,
		'madya'
	);
	pass(
		'Pengisian massal Semua tetap hanya anak binaan; pilihan campuran ditolak tanpa perubahan parsial'
	);
	const oldYear = await insert('tahun_ajaran', {
		...(await one('SELECT * FROM tahun_ajaran WHERE id=?', [year])),
		nama: 'QA older ' + tag,
		is_aktif: 0
	});
	await insert('martikulasi_hasil', {
		sekolah_id: school,
		tahun_ajaran_id: oldYear,
		kelas_id: ownClass,
		murid_id: pupils[2],
		level_penempatan: 'dasar',
		status_kelengkapan: 'belum_lengkap',
		updated_at: new Date().toISOString()
	});
	const current = await levels.getMartikulasiLevels(school, ownClass, pupils.slice(0, 3));
	assert.equal(current.get(pupils[0]), 'Level Mahir');
	assert.equal(current.get(pupils[1]), 'Level Madya');
	assert.equal(current.get(pupils[2]), null);

	const seedSemester = await one('SELECT * FROM semester WHERE id=?', [semester]);
	const otherSemester = await one('SELECT id FROM semester WHERE tahun_ajaran_id=? AND id<>?', [
		year,
		semester
	]);
	const secondSemester = Number(
		otherSemester?.id ??
			(await insert('semester', {
				...seedSemester,
				tipe: seedSemester.tipe === 'ganjil' ? 'genap' : 'ganjil',
				is_aktif: 0
			}))
	);
	const secondClass = await insert('kelas', {
		...seedClass,
		nama: 'QA linked ' + tag,
		semester_id: secondSemester,
		wali_kelas_id: null
	});
	const linkedStudent = await insert('murid', {
		...(await one('SELECT * FROM murid WHERE id=?', [pupils[0]])),
		semester_id: secondSemester,
		kelas_id: secondClass
	});
	const identity = 'qa-' + randomUUID();
	for (const [murid, sem] of [
		[pupils[0], semester],
		[linkedStudent, secondSemester]
	])
		await client.execute({
			sql: 'INSERT INTO murid_identity_link (sekolah_id,murid_id,semester_id,identity_uid) VALUES(?,?,?,?)',
			args: [school, murid, sem, identity]
		});
	assert.equal(
		(await levels.getMartikulasiLevels(school, secondClass, [linkedStudent])).get(linkedStudent),
		'Level Mahir'
	);
	pass('Level Martikulasi mengikuti identitas murid antarsemester dalam tahun ajaran yang sama');
	// Legacy levels retain their human-readable labels.
	await client.execute({
		sql: "UPDATE martikulasi_hasil SET level_penempatan='siap_dengan_pendampingan' WHERE murid_id=? AND tahun_ajaran_id=?",
		args: [pupils[1], year]
	});
	const recapData = await recap.load(event(users.homeroom, ownClass, {}, 'GET'));
	assert.equal(recapData.daftarNilai[0].levelMartikulasi, 'Level Mahir');
	assert.equal(recapData.daftarNilai[1].levelMartikulasi, 'Level Madya');
	assert.equal(recapData.summary.totalMurid, 22);
	const metadataEvent = event(users.homeroom, ownClass, {}, 'GET');
	metadataEvent.url = new URL(`http://localhost/api/leger-metadata?kelas_id=${ownClass}`);
	const meta = await (await leger.GET(metadataEvent)).json();
	assert.equal(meta.murid.length, 22);
	assert.equal(meta.murid[0].levelMartikulasi, 'Level Mahir');

	assert.deepEqual(meta.murid[0].capaianMartikulasi, {
		literasi: '70',
		numerasi: '75',
		sains: '64',
		bahasa_inggris: '49',
		keagamaan_akhlak: 'B',
		kepemimpinan_kesamaptaan: 'C',
		sosial_kepribadian: 'B',
		kemandirian_keasramaan: 'B'
	});
	assert.deepEqual(meta.murid[2].capaianMartikulasi, {});
	assert.equal(meta.martikulasiAspek.akademik.length, 4);
	assert.equal(meta.martikulasiAspek.asrama.length, 4);

	const denied = {
		...metadataEvent,
		url: new URL(`http://localhost/api/leger-metadata?kelas_id=${otherClass}`)
	};
	await assert.rejects(
		() => leger.GET(denied),
		(error) => error.status === 403
	);
	pass(
		'Rekap dan metadata leger mengambil seluruh murid, label lama dinormalisasi, tahun sebelumnya tidak bocor, ekspor kelas lain ditolak'
	);
	// Run the actual component export function and reopen its generated XLSX.
	const { readFile, writeFile } = await import('node:fs/promises');
	const ts = await import('typescript');
	const { default: ExcelJS } = await import('exceljs');
	let source = (await readFile('src/lib/components/LegerDownload.svelte', 'utf8'))
		.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1]
		.replace(/import Icon[^;]+;/, '');
	const js = ts.transpileModule(source, {
		compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
	}).outputText;
	const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
	for (const subjectCount of [1, 2, 12, 20]) {
		const headers = Array.from({ length: subjectCount }, (_, i) => ({
			id: i + 1,
			nama: 'Mapel ' + (i + 1)
		}));
		const fixture = {
			...meta,
			headers,
			kokRows: subjectCount === 1 ? [] : [{ id: 1, nama: 'Kok 1' }],
			ekstrakRows:
				subjectCount === 1
					? []
					: [
							{ id: 1, nama: 'Eks 1' },
							{ id: 2, nama: 'Eks 2' }
						],
			murid: meta.murid.map((m, index) => ({
				...m,
				nilai: {
					...Object.fromEntries(
						headers.map((h) => [String(h.id), index === 2 ? null : index === 3 ? 0 : 80])
					),
					kok_1: 'Baik',
					eks_1: 'Cukup',
					eks_2: 'Sangat Baik'
				}
			}))
		};
		let blob;
		const doc = { body: { appendChild() {} }, createElement: () => ({ click() {}, remove() {} }) };
		await new AsyncFunction(
			'$props',
			'fetch',
			'document',
			'URL',
			'alert',
			js + '\nawait downloadLeger();'
		)(
			() => ({ kelasId: ownClass }),
			async () => ({ ok: true, json: async () => fixture }),
			doc,
			{
				createObjectURL: (b) => {
					blob = b;
					return 'blob:qa';
				},
				revokeObjectURL() {}
			},
			(message) => {
				throw new Error(message);
			}
		);
		assert.ok(blob);
		if (subjectCount === 2)
			await writeFile(
				path.join(folder, 'leger-aspek-preview.xlsx'),
				Buffer.from(await blob.arrayBuffer())
			);
		const wb = new ExcelJS.Workbook();
		await wb.xlsx.load(await blob.arrayBuffer());
		const ws = wb.getWorksheet('Leger');
		const avg = 2 + subjectCount + fixture.kokRows.length + fixture.ekstrakRows.length + 2;
		const level = avg + 1;
		assert.equal(ws.getCell(3, avg).value, 'Rata-rata Intrakurikuler');
		assert.equal(ws.getCell(3, level).value, 'Level Martikulasi');
		assert.equal(ws.getCell(6, level).value, 'Level Mahir');
		assert.equal(ws.getCell(7, level).value, 'Level Madya');
		assert.equal(ws.getCell(8, level).value, '');
		assert.equal(ws.getCell(8, 3).value, '');
		assert.equal(ws.getCell(9, 3).value, 0);
		if (subjectCount >= 3) assert.equal(ws.getCell(6, 5).value, 80);
		else if (fixture.kokRows.length) assert.equal(ws.getCell(6, 3 + subjectCount).value, 'Baik');
		assert.equal(
			ws.getCell(6, avg).formula,
			`IF(COUNT(C6:${ws.getColumn(2 + subjectCount).letter}6)=0,"",ROUND(AVERAGE(C6:${ws.getColumn(2 + subjectCount).letter}6),2))`
		);

		assert.equal(ws.getCell(3, level + 1).value, 'Martikulasi');
		assert.equal(ws.getCell(3, level + 8).master.address, ws.getCell(3, level + 1).address);
		assert.equal(ws.getCell(4, level + 1).value, 'Akademik');
		assert.equal(ws.getCell(4, level + 4).master.address, ws.getCell(4, level + 1).address);
		assert.equal(ws.getCell(4, level + 5).value, 'Asrama');
		assert.equal(ws.getCell(4, level + 8).master.address, ws.getCell(4, level + 5).address);
		const aspects = [...meta.martikulasiAspek.akademik, ...meta.martikulasiAspek.asrama];
		assert.deepEqual(
			aspects.map((_, i) => ws.getCell(5, level + 1 + i).value),
			['LIT', 'NUM', 'IPA', 'BING', 'PAPB', 'KEPM', 'KETR', 'KEMN']
		);
		assert.deepEqual(
			aspects.map((_, i) => ws.getCell(6, level + 1 + i).value),
			[70, 75, 64, 49, 'B', 'C', 'B', 'B']
		);
		for (let i = 0; i < 8; i++) {
			assert.equal(ws.getCell(8, level + 1 + i).value, '');
			assert.equal(ws.getCell(5, level + 1 + i).alignment.textRotation, 90);
			assert.equal(ws.getCell(6, level + 1 + i).alignment.horizontal, 'center');
		}
		assert.equal(ws.getCell(3, level + 9).value, 'Ket');
		assert.equal(ws.getCell(3, 3).value, 'Intrakurikuler');
		assert.equal(ws.getCell(4, 3).master.address, ws.getCell(3, 3).address);
		assert.equal(ws.getCell(5, 3).value, 'Mapel 1');
		assert.equal(ws.getCell(5, 1).master.address, 'A3');
		assert.equal(ws.getCell(5, 2).master.address, 'B3');
		assert.equal(ws.getCell(28, 1).value, 'RATA-RATA');
		assert.equal(
			ws.getCell(28, avg).formula,
			`IF(COUNT(${ws.getColumn(avg).letter}6:${ws.getColumn(avg).letter}27)=0,"",ROUND(AVERAGE(${ws.getColumn(avg).letter}6:${ws.getColumn(avg).letter}27),2))`
		);
	}
	pass(
		'XLSX nyata dibuka ulang: posisi level tepat setelah rata-rata, 2/12/20 mapel, kokurikuler, ekstrakurikuler, rumus dan merge tidak bergeser'
	);
	assert.equal((await query('PRAGMA foreign_key_check')).length, 0);
	console.log('Copy only:', folder);
} finally {
	if (connection) await connection.closeDbClient();
	await vite.close();
	client.close();
}
