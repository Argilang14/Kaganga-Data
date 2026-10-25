import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createClient } from '@libsql/client';
import ExcelJS from 'exceljs';
import puppeteer from 'puppeteer-core';
import { PDFDocument } from 'pdf-lib';
import { renderJadwalPelajaranHTML } from '../src/lib/server/pdf/templates/jadwal-pelajaran.ts';

const project = process.cwd();
const port = Number(process.env.UPSTREAM_QA_PORT || 5178);
assert.ok(Number.isSafeInteger(port) && ![1206, 5152].includes(port));
const baseline = process.argv.includes('--baseline');
await fs.mkdir(path.join(project, 'tmp'), { recursive: true });
const directory = await fs.mkdtemp(path.join(project, 'tmp', 'upstream-adaptation-qa-'));
const database = path.join(directory, 'database.sqlite3');
const sourcePath = path.join(
	project,
	'dist/backups/upstream-review-2026-10-24T15-48-24-393Z/database.sqlite3'
);
await fs.copyFile(sourcePath, database);
const db = createClient({ url: `file:${database}` });
const base = `http://127.0.0.1:${port}`;
const checks = [];
let server,
	browser,
	output = '';
const now = new Date().toISOString();
const row = async (sql, args = []) => (await db.execute({ sql, args })).rows[0];
const pass = (name) => {
	checks.push(name);
	console.log('PASS', name);
};
async function insert(table, values) {
	const keys = Object.keys(values);
	return Number(
		(
			await db.execute({
				sql: `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
				args: Object.values(values)
			})
		).lastInsertRowid
	);
}
function clone(original, overrides) {
	const value = { ...original, ...overrides };
	delete value.id;
	return value;
}

try {
	const original = await row('SELECT * FROM murid ORDER BY id LIMIT 1');
	assert.ok(original, 'Fixture murid lokal diperlukan');
	const school = Number(original.sekolah_id);
	const oldClass = await row('SELECT * FROM kelas WHERE id=?', [original.kelas_id]);
	await db.execute({
		sql: 'UPDATE tahun_ajaran SET is_aktif=CASE WHEN id=? THEN 1 ELSE 0 END WHERE sekolah_id=?',
		args: [oldClass.tahun_ajaran_id, school]
	});
	await db.execute({
		sql: 'UPDATE semester SET is_aktif=CASE WHEN id=? THEN 1 ELSE 0 END WHERE tahun_ajaran_id=?',
		args: [oldClass.semester_id, oldClass.tahun_ajaran_id]
	});
	const classA = await insert(
		'kelas',
		clone(oldClass, {
			nama: 'X.QA Upstream',
			wali_kelas_id: null,
			wali_asuh_id: null,
			wali_asrama_id: null,
			dapodik_rombongan_belajar_id: null
		})
	);
	const classB = await insert(
		'kelas',
		clone(oldClass, {
			nama: 'XI.QA Upstream',
			wali_kelas_id: null,
			wali_asuh_id: null,
			wali_asrama_id: null,
			dapodik_rombongan_belajar_id: null
		})
	);
	await db.execute({
		sql: 'UPDATE sekolah SET sumatif_bobot_rts_lingkup=70,sumatif_bobot_rts_sts=30,jenjang_pendidikan=? WHERE id=?',
		args: ['srt', school]
	});
	for (const [level, npsn] of [
		['sd', '76550273'],
		['smp', '72735090'],
		['sma', '70055420']
	]) {
		const unit = await row(
			'SELECT id FROM sekolah_satuan_pendidikan WHERE sekolah_id=? AND jenjang=?',
			[school, level]
		);
		if (!unit)
			await insert('sekolah_satuan_pendidikan', {
				sekolah_id: school,
				jenjang: level,
				nama: `QA Sekolah ${level.toUpperCase()}`,
				npsn,
				created_at: now,
				updated_at: now
			});
	}
	const employee = await row('SELECT * FROM pegawai WHERE sekolah_id=? LIMIT 1', [school]);
	assert.ok(employee);
	const guardian = await insert(
		'pegawai',
		clone(employee, {
			nama: 'QA Wali Upstream',
			nip: 'QA-UPSTREAM',
			kode_pegawai: 'QA-UPSTREAM',
			nik: null,
			nuptk: null,
			nomor_induk_pppk: null,
			foto: null,
			dapodik_ptk_id: null
		})
	);
	const students = [];
	for (let i = 0; i < 4; i++)
		students.push(
			await insert(
				'murid',
				clone(original, {
					nama: i > 1 ? 'QA Nama Ganda' : `QA Murid ${i}`,
					nis: `UPSTREAM-${i}`,
					nisn: `999980000${i}`,
					kelas_id: classA,
					wali_asuh_nama: i === 0 ? 'QA Wali Upstream' : 'QA Wali Lain',
					wali_asrama_nama: i === 0 ? 'QA Wali Upstream' : 'QA Wali Lain',
					qr_token: randomBytes(20).toString('hex'),
					dapodik_peserta_didik_id: null,
					dapodik_anggota_rombel_id: null
				})
			)
		);
	const mapel = await insert('mata_pelajaran', {
		kelas_id: classA,
		nama: 'QA Sumatif',
		jenis: 'wajib',
		kkm: 70,
		created_at: now,
		updated_at: now
	});
	const otherMapel = await insert('mata_pelajaran', {
		kelas_id: classB,
		nama: 'QA Mapel Lain',
		jenis: 'wajib',
		kkm: 70,
		created_at: now,
		updated_at: now
	});
	const sumatifTujuan = await insert('tujuan_pembelajaran', {
		mata_pelajaran_id: mapel,
		deskripsi: 'QA TP 1',
		lingkup_materi: 'Lingkup 1',
		bobot: 100,
		created_at: now,
		updated_at: now
	});
	const matev = await insert('keasramaan', {
		kelas_id: classA,
		nama: 'QA Matev',
		created_at: now,
		updated_at: now
	});
	const indicator = await insert('keasramaan_indikator', {
		keasramaan_id: matev,
		deskripsi: 'QA Indikator',
		created_at: now,
		updated_at: now
	});
	const tujuan = await insert('keasramaan_tujuan', {
		indikator_id: indicator,
		deskripsi: 'QA Tujuan',
		created_at: now,
		updated_at: now
	});
	const admin = await row("SELECT * FROM auth_user WHERE type='admin' LIMIT 1");
	const accounts = {};
	for (const [name, type, position] of [
		['admin', 'admin', null],
		['asuh', 'wali_asuh', null],
		['asrama', 'wali_asrama', null],
		['kepsek', 'wali_asuh', 'kepala_sekolah'],
		['guru', 'user', null]
	]) {
		const token = randomBytes(32).toString('base64url');
		const id = await insert(
			'auth_user',
			clone(admin, {
				username: `qa-upstream-${name}`,
				username_normalized: `qa-upstream-${name}`,
				type,
				jabatan_akses: position,
				sekolah_id: school,
				kelas_id: classA,
				pegawai_id: guardian,
				mata_pelajaran_id: mapel,
				permissions: '[]',
				must_change_password: 0
			})
		);
		await insert('auth_session', {
			user_id: id,
			token_hash: createHash('sha256').update(token).digest('hex'),
			user_agent: 'Upstream isolated QA',
			ip_address: '127.0.0.1',
			expires_at: new Date(Date.now() + 3600000).toISOString(),
			created_at: now,
			updated_at: now
		});
		accounts[name] = {
			id,
			token,
			cookie: `rapkumer-session=${token}; active-sekolah-id=${school}; active-kelas-id=${classA}`
		};
	}
	server = spawn(process.execPath, ['build/index.js'], {
		cwd: project,
		windowsHide: true,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: {
			...process.env,
			HOST: '127.0.0.1',
			PORT: String(port),
			ORIGIN: base,
			DB_URL: `file:${database}`,
			KAGANGA_DATA_DIR: path.join(directory, 'data'),
			photo: path.join(directory, 'uploads'),
			sounds: path.join(directory, 'sounds'),
			NODE_ENV: 'production'
		}
	});
	server.stdout.on('data', (data) => {
		output += data;
	});
	server.stderr.on('data', (data) => {
		output += data;
	});
	let ready = false;
	for (let i = 0; i < 120; i++) {
		try {
			if ((await fetch(base + '/login', { signal: AbortSignal.timeout(3000) })).ok) {
				ready = true;
				break;
			}
		} catch {
			/* Wait for the isolated server. */
		}
		if (server.exitCode != null) break;
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	assert.ok(ready, output.slice(-4000));
	async function request(name, route, method = 'GET', body) {
		return fetch(base + route, {
			method,
			body,
			redirect: 'manual',
			headers: { cookie: accounts[name].cookie, origin: base },
			signal: AbortSignal.timeout(60000)
		});
	}
	async function workbook(values, name = 'QA Murid 0') {
		const book = new ExcelJS.Workbook(),
			sheet = book.addWorksheet('Nilai');
		sheet.getRow(3).values = [
			'Nama',
			'Lingkup 1',
			'Sumatif Tengah Semester',
			'Sumatif Akhir Semester'
		];
		sheet.getRow(4).values = ['Nama', 'TP 1', 'Tes', 'Tes'];
		sheet.getRow(5).values = [name, ...values];
		const form = new FormData();
		form.append('kelas_id', String(classA));
		form.append('mapel_id', String(mapel));
		form.append(
			'file',
			new Blob([await book.xlsx.writeBuffer()], {
				type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
			}),
			'nilai.xlsx'
		);
		return form;
	}
	const first = await request(
		'admin',
		'/api/asesmen-sumatif/import',
		'POST',
		await workbook([80, 90, 10])
	);
	assert.equal(first.status, 200, await first.text());
	const aggregate = await row(
		'SELECT * FROM asesmen_sumatif WHERE murid_id=? AND mata_pelajaran_id=?',
		[students[0], mapel]
	);
	assert.ok(aggregate);
	if (baseline) {
		assert.equal(aggregate.nilai_akhir_rts, null);
		pass('Bug reproduced on previous build: import does not persist RTS');
	} else {
		assert.equal(aggregate.nilai_akhir_rts, 83);
		pass('Real XLSX import persists RTS 83, excluding SAS 10');
		await db.execute({
			sql: 'UPDATE sekolah SET sumatif_bobot_rts_lingkup=40,sumatif_bobot_rts_sts=60 WHERE id=?',
			args: [school]
		});
		assert.equal(
			(await request('admin', '/api/asesmen-sumatif/import', 'POST', await workbook([80, 90, 100])))
				.status,
			200
		);
		assert.equal(
			(
				await row(
					'SELECT nilai_akhir_rts FROM asesmen_sumatif WHERE murid_id=? AND mata_pelajaran_id=?',
					[students[0], mapel]
				)
			).nilai_akhir_rts,
			86
		);
		assert.equal(
			Number(
				(
					await row(
						'SELECT count(*) AS n FROM asesmen_sumatif WHERE murid_id=? AND mata_pelajaran_id=?',
						[students[0], mapel]
					)
				).n
			),
			1
		);
		pass('Reimport updates RTS with school weights without duplicates');
		assert.equal(
			(
				await request(
					'admin',
					'/api/asesmen-sumatif/import',
					'POST',
					await workbook([0, 100, null])
				)
			).status,
			200
		);
		assert.equal(
			(
				await row(
					'SELECT nilai_akhir_rts FROM asesmen_sumatif WHERE murid_id=? AND mata_pelajaran_id=?',
					[students[0], mapel]
				)
			).nilai_akhir_rts,
			60
		);
		pass('Zero values are retained and empty SAS does not affect RTS');
		const wrong = await workbook([80, 90, 10]);
		wrong.set('mapel_id', String(otherMapel));
		assert.equal(
			(await request('admin', '/api/asesmen-sumatif/import', 'POST', wrong)).status,
			400
		);
		const duplicate = await request(
			'admin',
			'/api/asesmen-sumatif/import',
			'POST',
			await workbook([80, 90, 10], 'QA Nama Ganda')
		);
		assert.equal((await duplicate.json()).details.imported, 0);
		assert.equal(
			Number(
				(
					await row('SELECT count(*) AS n FROM asesmen_sumatif WHERE murid_id IN (?,?)', [
						students[2],
						students[3]
					])
				).n
			),
			0
		);
		pass('Wrong-class subjects and ambiguous student names cannot receive grades');
		const manual = new FormData();
		manual.append('muridId', String(students[1]));
		manual.append('mapelId', String(mapel));
		manual.append('entries.0.tujuanPembelajaranId', String(sumatifTujuan));
		manual.append('entries.0.nilai', '80');
		manual.append('stsTes', '90');
		manual.append('sasTes', '10');
		const manualResponse = await request(
			'admin',
			'/asesmen-sumatif/formulir-asesmen?/save',
			'POST',
			manual
		);
		assert.ok([200, 303].includes(manualResponse.status), await manualResponse.text());
		assert.equal(
			(
				await row(
					'SELECT nilai_akhir_rts FROM asesmen_sumatif WHERE murid_id=? AND mata_pelajaran_id=?',
					[students[1], mapel]
				)
			).nilai_akhir_rts,
			86
		);
		const teacherResponse = await request(
			'guru',
			'/api/asesmen-sumatif/import',
			'POST',
			await workbook([80, 90, 10])
		);
		assert.equal(teacherResponse.status, 200, await teacherResponse.text());
		assert.equal(
			(
				await row(
					'SELECT nilai_akhir_rts FROM asesmen_sumatif WHERE murid_id=? AND mata_pelajaran_id=?',
					[students[0], mapel]
				)
			).nilai_akhir_rts,
			86
		);
		const unassigned = await insert('mata_pelajaran', {
			kelas_id: classA,
			nama: 'QA Unassigned',
			jenis: 'wajib',
			kkm: 70,
			created_at: now,
			updated_at: now
		});
		const forbiddenImport = await workbook([80, 90, 10]);
		forbiddenImport.set('mapel_id', String(unassigned));
		assert.equal(
			(await request('guru', '/api/asesmen-sumatif/import', 'POST', forbiddenImport)).status,
			403
		);
		pass('Manual and teacher import RTS agree; unassigned subjects remain forbidden');
		for (const role of ['guru', 'asuh', 'asrama', 'kepsek'])
			assert.equal((await request(role, '/api/sekolah/aset-cetak')).status, 403);
		pass('Non-admin roles including leadership cannot manage private print assets');
		const png = Buffer.from(
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
			'base64'
		);
		const upload = new FormData();
		upload.append('file', new Blob([png], { type: 'image/png' }), 'kop.png');
		assert.equal(
			(await request('admin', '/api/sekolah/aset-cetak/kop-portrait?scope=sd', 'POST', upload))
				.status,
			200
		);
		assert.equal(
			(await request('admin', '/api/sekolah/aset-cetak/kop-portrait?scope=sd')).status,
			200
		);
		assert.equal(
			(await request('admin', '/api/sekolah/aset-cetak/kop-portrait?scope=smp')).status,
			404
		);
		const invalid = new FormData();
		invalid.append('file', new Blob(['not png'], { type: 'image/png' }), 'bad.png');
		assert.equal(
			(await request('admin', '/api/sekolah/aset-cetak/kop-portrait?scope=sd', 'POST', invalid))
				.status,
			400
		);
		assert.deepEqual(
			Buffer.from(
				await (
					await request('admin', '/api/sekolah/aset-cetak/kop-portrait?scope=sd')
				).arrayBuffer()
			),
			png
		);
		assert.equal((await request('admin', '/api/sekolah/aset-cetak/ttd?scope=../smp')).status, 400);
		assert.equal(
			(await request('admin', '/api/sekolah/aset-cetak/kop-portrait?scope=sd', 'DELETE')).status,
			200
		);
		pass('Authenticated upload, read, rejection, scope isolation and deletion work');
		for (const role of ['asuh', 'asrama']) {
			const own = await request(
				role,
				`/asesmen-keasramaan/form-asesmen?murid_id=${students[0]}&keasramaan_id=${matev}`
			);
			assert.equal(own.status, 200, await own.text());
			const other = await request(
				role,
				`/asesmen-keasramaan/form-asesmen?murid_id=${students[1]}&keasramaan_id=${matev}`
			);
			assert.ok([403, 404].includes(other.status), `${role}: ${other.status}`);
		}
		const leader = await request(
			'kepsek',
			`/asesmen-keasramaan/form-asesmen?murid_id=${students[1]}&keasramaan_id=${matev}`
		);
		assert.equal(leader.status, 200, await leader.text());
		pass('Guardian assessment stays scoped while leadership position bypasses legacy restriction');
		for (const [role, student, status] of [
			['asuh', students[0], 200],
			['asuh', students[1], 403],
			['asrama', students[1], 403],
			['kepsek', students[1], 200]
		]) {
			const form = new FormData();
			form.append('muridId', String(student));
			form.append('keasramaanId', String(matev));
			form.append(`nilai.${tujuan}`, 'baik');
			const response = await request(role, '/asesmen-keasramaan/form-asesmen?/save', 'POST', form);
			if (status === 200) assert.ok([200, 303].includes(response.status), await response.text());
			else assert.equal(response.status, status, await response.text());
		}
		pass('Forged guardian POST is rejected and leadership can save authorized assessments');
		browser = await puppeteer.launch({
			executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
			headless: true
		});
		const art = await browser.newPage();
		await art.setViewport({ width: 1000, height: 150 });
		await art.setContent(
			'<div style="box-sizing:border-box;width:980px;height:140px;border-bottom:4px solid #147759;font:700 26px Arial;text-align:center;padding:28px;color:#125a86">SEKOLAH UJI KAGANGA<br><small style="font-size:15px">Kop PNG - pengujian lokal</small></div>'
		);
		const header = await art.screenshot({ type: 'png' });
		for (const kind of ['kop-landscape', 'ttd', 'stempel']) {
			const form = new FormData();
			form.append('file', new Blob([header], { type: 'image/png' }), 'qa.png');
			assert.equal(
				(await request('admin', `/api/sekolah/aset-cetak/${kind}?scope=induk`, 'POST', form))
					.status,
				200
			);
		}
		await art.close();
		for (const [jenjang, orientation, marks] of [
			['semua', 'landscape', true],
			['srd', 'portrait', false]
		]) {
			const parameters = `jenjang=${jenjang}&orientation=${orientation}&tahun_ajaran_id=${oldClass.tahun_ajaran_id}&jenis=ganjil${marks ? '&school_marks=1' : ''}`;
			const response = await request('admin', '/cetak/jadwal-pelajaran.json?' + parameters);
			assert.equal(response.status, 200, await response.clone().text());
			const data = (await response.json()).jadwalPelajaranData;
			if (marks) {
				assert.ok(data.sekolah.signatureUrl);
				assert.ok(data.sekolah.customLetterheadUrl);
			} else {
				assert.equal(data.sekolah.signatureUrl, null);
				assert.equal(data.sekolah.customLetterheadUrl, null);
			}
			const pdfToken = await fetch(base + '/api/pdf/token', {
				method: 'POST',
				headers: {
					cookie: accounts.admin.cookie,
					origin: base,
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					docType: 'jadwal-pelajaran',
					jenjang,
					orientation,
					tahunAjaranId: oldClass.tahun_ajaran_id,
					jenisJadwal: 'ganjil',
					includeSchoolMarks: marks
				})
			});
			assert.equal(pdfToken.status, 200, await pdfToken.clone().text());
			const { token, slug } = await pdfToken.json();
			const pdfResponse = await request('admin', `/cetak/pdf/${slug}/${token}`);
			assert.equal(pdfResponse.status, 200, await pdfResponse.clone().text());
			assert.match(pdfResponse.headers.get('content-type'), /application\/pdf/);
			const bytes = new Uint8Array(await pdfResponse.arrayBuffer());
			const pdf = await PDFDocument.load(bytes);
			assert.equal(pdf.getPageCount(), 1);
			const size = pdf.getPage(0).getSize();
			assert.equal(size.width > size.height, orientation === 'landscape');
			await fs.writeFile(path.join(directory, `jadwal-${jenjang}.pdf`), bytes);
			const preview = await browser.newPage();
			await preview.setViewport({ width: orientation === 'landscape' ? 1200 : 850, height: 1200 });
			await preview.setContent(renderJadwalPelajaranHTML(data), { waitUntil: 'load' });
			await preview.evaluate(async () => {
				if (window.PagedConfig?.before) await window.PagedConfig.before();
			});
			assert.equal(
				await preview.evaluate(
					() => [...document.images].filter((img) => !img.complete || img.naturalWidth === 0).length
				),
				0
			);
			await preview.screenshot({
				path: path.join(directory, `jadwal-${jenjang}.png`),
				fullPage: true
			});
			await preview.close();
		}
		pass(
			'Actual A4 schedule PDFs render with marks ON/OFF and correct orientation; preview images load'
		);
		const page = await browser.newPage();
		await page.setCookie(
			{ name: 'rapkumer-session', value: accounts.admin.token, domain: '127.0.0.1', path: '/' },
			{ name: 'active-sekolah-id', value: String(school), domain: '127.0.0.1', path: '/' },
			{ name: 'active-kelas-id', value: String(classA), domain: '127.0.0.1', path: '/' }
		);
		for (const [label, width, height] of [
			['desktop', 1440, 1000],
			['tablet', 768, 1024],
			['mobile', 390, 844]
		]) {
			await page.setViewport({ width, height });
			await page.goto(base + '/pengaturan', { waitUntil: 'networkidle0', timeout: 60000 });
			await page.waitForSelector('#print-assets-heading');
			await page.waitForFunction(
				() =>
					!document
						.querySelector('[aria-labelledby="print-assets-heading"]')
						?.getAttribute('aria-busy')
						?.includes('true')
			);
			await page.$eval('[aria-labelledby="print-assets-heading"]', (node) =>
				node.scrollIntoView({ block: 'center' })
			);
			assert.ok(
				await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
				'Page overflows ' + label
			);
			await page.screenshot({ path: path.join(directory, `settings-${label}.png`) });
			if (label === 'mobile') {
				await page.$eval('[aria-labelledby="print-assets-heading"]', (node) =>
					node.scrollIntoView({ block: 'start' })
				);
				await page.screenshot({ path: path.join(directory, 'settings-mobile-top.png') });
			}
		}
		pass('Settings screenshots captured at desktop, tablet and mobile without page overflow');
		const section = '[aria-labelledby="print-assets-heading"]';
		await page.select(section + ' select', 'sd');
		await page.waitForFunction(
			() =>
				document
					.querySelector('[aria-labelledby="print-assets-heading"]')
					?.getAttribute('aria-busy') === 'false'
		);
		const input = await page.$(section + ' input[aria-label="Unggah Kop portrait"]');
		const uploadPath = path.join(directory, 'upload.png');
		await fs.writeFile(uploadPath, header);
		await input.uploadFile(uploadPath);
		await page.waitForSelector(section + ' img[alt="Kop portrait"]');
		await page.waitForFunction(
			() =>
				document
					.querySelector('[aria-labelledby="print-assets-heading"]')
					?.getAttribute('aria-busy') === 'false'
		);
		await page.click(section + ' button[aria-label="Hapus Kop portrait"]');
		await page.waitForFunction(() =>
			[...document.querySelectorAll('button')].some(
				(node) => node.textContent.trim() === 'Batal' && node.getBoundingClientRect().width > 0
			)
		);
		await page.evaluate(() =>
			[...document.querySelectorAll('button')]
				.find(
					(node) => node.textContent.trim() === 'Batal' && node.getBoundingClientRect().width > 0
				)
				.click()
		);
		assert.equal(
			(await request('admin', '/api/sekolah/aset-cetak/kop-portrait?scope=sd')).status,
			200
		);
		await page.click(section + ' button[aria-label="Hapus Kop portrait"]');
		await page.waitForFunction(() =>
			[...document.querySelectorAll('button')].some(
				(node) => node.textContent.trim() === 'Hapus' && node.getBoundingClientRect().width > 0
			)
		);
		await page.evaluate(() =>
			[...document.querySelectorAll('button')]
				.find(
					(node) => node.textContent.trim() === 'Hapus' && node.getBoundingClientRect().width > 0
				)
				.click()
		);
		await page.waitForFunction(
			() =>
				!document.querySelector('[aria-labelledby="print-assets-heading"] img[alt="Kop portrait"]')
		);
		assert.equal(
			(await request('admin', '/api/sekolah/aset-cetak/kop-portrait?scope=sd')).status,
			404
		);
		assert.equal(
			(await request('admin', '/api/sekolah/aset-cetak/kop-landscape?scope=induk')).status,
			200
		);
		pass(
			'Mobile scope selection, upload, cancel deletion and confirmed deletion preserve other scopes'
		);
	}
	assert.equal(String((await db.execute('PRAGMA integrity_check')).rows[0].integrity_check), 'ok');
	assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length, 0);
	await fs.writeFile(
		path.join(directory, 'result.json'),
		JSON.stringify({ baseline, checks, database }, null, 2)
	);
	console.log('QA_RESULT', directory);
} catch (cause) {
	console.error('QA_FOLDER', directory);
	throw cause;
} finally {
	await fs.writeFile(path.join(directory, 'server.log'), output);
	if (browser) await browser.close();
	if (server && server.exitCode == null) {
		const done = once(server, 'exit');
		server.kill();
		await done;
	}
	db.close();
}
