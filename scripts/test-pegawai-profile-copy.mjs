import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { access, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { createClient } from '@libsql/client';

const project = process.cwd();
const port = Number(process.env.PEGAWAI_PROFILE_QA_PORT || 5181);
assert.ok(Number.isSafeInteger(port) && port > 0 && port < 65536, 'Port QA tidak valid.');
assert.ok(![5152, 1206].includes(port), 'QA tidak boleh menggunakan port 5152/1206.');

const sourcePath = path.resolve(project, 'data/database.sqlite3');
const buildEntry = path.resolve(project, 'build/index.js');
await access(buildEntry).catch(() => {
	throw new Error(
		'build/index.js belum tersedia. Tunggu build agent utama, lalu jalankan pnpm build.'
	);
});
await mkdir(path.join(project, 'tmp'), { recursive: true });
const folder = await mkdtemp(path.join(project, 'tmp', 'pegawai-profile-qa-'));
const database = path.join(folder, 'database.sqlite3');
const uploadRoot = path.join(folder, 'uploads');
const base = `http://127.0.0.1:${port}`;
const profilePath = '/pengaturan/profil';
const checks = [];
let server;
let browser;
let output = '';

const pass = (name) => {
	checks.push(name);
	console.log('PASS', name);
};
const hash = (value) => createHash('sha256').update(value).digest('hex');
const isPortFree = (candidate) =>
	new Promise((resolve, reject) => {
		const probe = net.createServer();
		probe.unref();
		probe.once('error', (error) => (error.code === 'EADDRINUSE' ? resolve(false) : reject(error)));
		probe.listen(candidate, '127.0.0.1', () => probe.close(() => resolve(true)));
	});
const hasExited = (child) => !child || child.exitCode !== null || child.signalCode !== null;
const stopServer = async () => {
	if (hasExited(server)) return;
	server.kill('SIGTERM');
	await Promise.race([once(server, 'exit'), new Promise((resolve) => setTimeout(resolve, 5000))]);
	if (!hasExited(server)) {
		server.kill('SIGKILL');
		await once(server, 'exit');
	}
};

assert.equal(await isPortFree(port), true, `Port QA ${port} sedang dipakai.`);
const source = createClient({ url: `file:${sourcePath}` });
try {
	await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
} finally {
	source.close();
}
assert.notEqual(path.resolve(database), sourcePath);
const db = createClient({ url: `file:${database}` });
const row = async (sql, args = []) => (await db.execute({ sql, args })).rows[0];
const rows = async (sql, args = []) => (await db.execute({ sql, args })).rows;
const insert = async (table, values) => {
	const entries = Object.entries(values).filter(([, value]) => value !== undefined);
	const result = await db.execute({
		sql: `INSERT INTO "${table}" (${entries.map(([key]) => `"${key}"`).join(',')}) VALUES (${entries.map(() => '?').join(',')})`,
		args: entries.map(([, value]) => value)
	});
	return Number(result.lastInsertRowid);
};
const clone = (record, overrides) => {
	const result = { ...record, ...overrides };
	delete result.id;
	return result;
};

const editableProfileColumns = {
	nama: 'nama',
	jenisKelamin: 'jenis_kelamin',
	tempatLahir: 'tempat_lahir',
	tanggalLahir: 'tanggal_lahir',
	agama: 'agama',
	statusPerkawinan: 'status_perkawinan',
	nik: 'nik',
	nip: 'nip',
	nomorIndukPppk: 'nomor_induk_pppk',
	nuptk: 'nuptk',
	dapodikPtkId: 'dapodik_ptk_id',
	telepon: 'telepon',
	email: 'email',
	alamat: 'alamat',
	desa: 'desa',
	kecamatan: 'kecamatan',
	kabupaten: 'kabupaten',
	provinsi: 'provinsi',
	kodePos: 'kode_pos',
	kontakDaruratNama: 'kontak_darurat_nama',
	kontakDaruratHubungan: 'kontak_darurat_hubungan',
	kontakDaruratTelepon: 'kontak_darurat_telepon',
	statusKepegawaian: 'status_kepegawaian',
	tanggalMulaiKerja: 'tanggal_mulai_kerja',
	unitPenempatan: 'unit_penempatan',
	pangkatGolongan: 'pangkat_golongan',
	nomorSk: 'nomor_sk',
	tanggalSk: 'tanggal_sk',
	catatan: 'catatan'
};
const profileForm = (record, overrides = {}) => ({
	...Object.fromEntries(
		Object.entries(editableProfileColumns).map(([key, column]) => [key, record[column] ?? ''])
	),
	updatedAt: record.updated_at ?? '',
	...overrides
});
const png = Buffer.from([
	137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0,
	0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 240, 31, 0, 5, 0, 1,
	255, 137, 153, 61, 29, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130
]);
const pdf = Buffer.from('%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n');

const accounts = {};
async function addAccount(name, employeeId, schoolId, options = {}) {
	const template = await row('SELECT * FROM auth_user ORDER BY id LIMIT 1');
	assert.ok(template, 'Template auth_user diperlukan.');
	const token = randomBytes(32).toString('base64url');
	const userId = await insert(
		'auth_user',
		clone(template, {
			username: `qa-profile-${name}`,
			username_normalized: `qa-profile-${name}`,
			type: options.type ?? 'user',
			jabatan_akses: options.jabatanAkses ?? null,
			sekolah_id: schoolId,
			pegawai_id: employeeId,
			kelas_id: null,
			mata_pelajaran_id: null,
			permissions: options.permissions ?? '[]',
			must_change_password: 0
		})
	);
	const now = new Date().toISOString();
	await insert('auth_session', {
		user_id: userId,
		token_hash: hash(token),
		user_agent: 'QA profil pegawai',
		ip_address: '127.0.0.1',
		expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
		created_at: now,
		updated_at: now
	});
	accounts[name] = {
		id: userId,
		employeeId,
		schoolId,
		token,
		cookie: `rapkumer-session=${token}; active-sekolah-id=${schoolId}`
	};
}

async function request(accountName, route, options = {}) {
	const account = accountName ? accounts[accountName] : null;
	const headers = {
		accept: options.accept ?? 'application/json',
		...(account ? { cookie: account.cookie } : {})
	};
	let body;
	if (options.form) {
		headers['x-sveltekit-action'] = 'true';
		body = new FormData();
		for (const [key, value] of Object.entries(options.form)) {
			if (Array.isArray(value)) for (const item of value) body.append(key, item);
			else body.append(key, value instanceof Blob ? value : String(value));
		}
	} else if (options.body) body = options.body;
	if (body instanceof FormData) headers['x-sveltekit-action'] = 'true';
	if (body || (options.method && options.method !== 'GET')) headers.origin = base;
	const response = await fetch(base + route, {
		method: options.method ?? (body ? 'POST' : 'GET'),
		headers,
		body,
		redirect: 'manual'
	});
	const buffer = Buffer.from(await response.arrayBuffer());
	const text = buffer.toString('utf8');
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		// Binary downloads and HTML responses are expected in this suite.
	}
	return {
		status: typeof parsed?.status === 'number' ? parsed.status : response.status,
		responseStatus: response.status,
		text,
		buffer,
		parsed,
		headers: response.headers
	};
}
const expectStatus = (result, expected, label) =>
	assert.ok(
		(Array.isArray(expected) ? expected : [expected]).includes(result.status),
		`${label}: expected ${expected}, received ${result.status}: ${result.text.slice(0, 1000)}`
	);

try {
	await db.execute('PRAGMA busy_timeout=10000');
	await db.execute('PRAGMA foreign_keys=ON');
	const employeeTemplate = await row('SELECT * FROM pegawai ORDER BY id LIMIT 1');
	const schoolTemplate = await row('SELECT * FROM sekolah ORDER BY id LIMIT 1');
	const schools = await rows('SELECT id FROM sekolah ORDER BY id LIMIT 2');
	assert.ok(employeeTemplate, 'Template pegawai diperlukan di snapshot.');
	assert.ok(schoolTemplate, 'Template sekolah diperlukan di snapshot.');
	if (schools.length === 1) {
		const suffix = `${Date.now()}-${randomBytes(3).toString('hex')}`;
		const clonedSchoolId = await insert(
			'sekolah',
			clone(schoolTemplate, {
				nama: `QA Profil Sekolah Lain ${suffix}`,
				npsn: `QA-${suffix}`,
				email: `qa-profile-school-${suffix}@invalid.test`,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			})
		);
		schools.push({ id: clonedSchoolId });
	}
	assert.equal(schools.length, 2, 'QA IDOR gagal menyiapkan dua sekolah di salinan database.');
	const ownSchool = Number(schools[0].id);
	const otherSchool = Number(schools[1].id);
	const now = new Date().toISOString();
	const employee = async (label, schoolId, suffix) =>
		insert(
			'pegawai',
			clone(employeeTemplate, {
				sekolah_id: schoolId,
				kode_pegawai: `QA-PROFILE-${suffix}`,
				nama: `QA Profil ${label}`,
				nip: `QA-NIP-${suffix}`,
				nik: `QA-NIK-${suffix}`,
				nomor_induk_pppk: null,
				nuptk: null,
				dapodik_ptk_id: null,
				jenis: 'guru',
				jabatan: 'Guru QA',
				status: 'aktif',
				foto: null,
				created_at: now,
				updated_at: now
			})
		);
	const ownId = await employee('Pemilik', ownSchool, 'OWN');
	const sameSchoolId = await employee('Sekolah Sama Rahasia', ownSchool, 'SAME');
	const otherSchoolId = await employee('Sekolah Lain Rahasia', otherSchool, 'OTHER');
	const duplicateId = await employee('Duplikat', ownSchool, 'DUP');
	const managerEmployeeId = await employee('Manager', ownSchool, 'MANAGER');
	await addAccount('owner', ownId, ownSchool);
	await addAccount('same', sameSchoolId, ownSchool);
	await addAccount('other', otherSchoolId, otherSchool);
	await addAccount('manager', managerEmployeeId, ownSchool, {
		type: 'admin',
		jabatanAkses: 'kepala_sekolah'
	});
	for (const role of ['user', 'wali_kelas', 'wali_asuh', 'wali_asrama', 'tim_dapur'])
		await addAccount(`staff-${role}`, ownId, ownSchool, { type: role });
	await addAccount('unlinked', null, ownSchool);
	await addAccount('school-mismatch', ownId, otherSchool);

	server = spawn(process.execPath, ['build/index.js'], {
		cwd: project,
		windowsHide: true,
		env: {
			...process.env,
			PORT: String(port),
			HOST: '127.0.0.1',
			ORIGIN: base,
			DB_URL: `file:${database}`,
			KAGANGA_DATA_DIR: path.join(folder, 'data'),
			photo: `file:${uploadRoot}`,
			NODE_ENV: 'production'
		},
		stdio: ['ignore', 'pipe', 'pipe']
	});
	server.stdout.on('data', (value) => (output += value));
	server.stderr.on('data', (value) => (output += value));
	let ready = false;
	for (let attempt = 0; attempt < 120; attempt++) {
		try {
			if ((await fetch(base + '/login')).status === 200) {
				ready = true;
				break;
			}
		} catch {
			// The isolated server may still be starting.
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	assert.ok(ready, output.slice(-5000));

	const initial = await row('SELECT * FROM pegawai WHERE id=?', [ownId]);
	const protectedBefore = Object.fromEntries(
		['jenis', 'status', 'jabatan', 'kode_pegawai', 'sekolah_id'].map((key) => [key, initial[key]])
	);
	const fullUpdate = profileForm(initial, {
		nama: 'QA Profil Pemilik Lengkap',
		jenisKelamin: 'perempuan',
		tempatLahir: 'Bandung',
		tanggalLahir: '1991-02-03',
		agama: 'Islam',
		statusPerkawinan: 'menikah',
		nik: 'QA-NIK-OWN-UPDATED',
		nip: 'QA-NIP-OWN-UPDATED',
		nomorIndukPppk: 'PPPK-QA-1',
		nuptk: 'NUPTK-QA-1',
		dapodikPtkId: 'DAPODIK-QA-1',
		telepon: '081234567890',
		email: 'qa-profile@invalid.test',
		alamat: 'Alamat QA lengkap',
		desa: 'Desa QA',
		kecamatan: 'Kecamatan QA',
		kabupaten: 'Kabupaten QA',
		provinsi: 'Jawa Barat',
		kodePos: '40123',
		kontakDaruratNama: 'Kontak QA',
		kontakDaruratHubungan: 'Keluarga',
		kontakDaruratTelepon: '089999999999',
		statusKepegawaian: 'Tetap',
		tanggalMulaiKerja: '2020-07-01',
		unitPenempatan: 'Unit QA',
		pangkatGolongan: 'III/a',
		nomorSk: 'SK-QA-001',
		tanggalSk: '2020-06-01',
		catatan: 'Catatan biodata QA'
	});
	expectStatus(
		await request('owner', profilePath + '?/saveProfile', { form: fullUpdate }),
		200,
		'owner saveProfile'
	);
	const updated = await row('SELECT * FROM pegawai WHERE id=?', [ownId]);
	for (const [key, column] of Object.entries(editableProfileColumns))
		assert.equal(updated[column] ?? '', fullUpdate[key], `Kolom ${key} tidak tersimpan.`);
	for (const [column, value] of Object.entries(protectedBefore))
		assert.equal(updated[column], value, `Kolom terlindungi ${column} berubah.`);
	pass('Owner can update every editable profile field without changing protected fields');

	for (const protectedKey of [
		'jenis',
		'status',
		'jabatan',
		'kodePegawai',
		'role',
		'pegawaiId',
		'sekolahId',
		'unknownField'
	]) {
		const current = await row('SELECT * FROM pegawai WHERE id=?', [ownId]);
		expectStatus(
			await request('owner', profilePath + '?/saveProfile', {
				form: { ...profileForm(current), [protectedKey]: 'escalate' }
			}),
			400,
			`protected ${protectedKey}`
		);
	}
	const duplicateField = new FormData();
	for (const [key, value] of Object.entries(
		profileForm(await row('SELECT * FROM pegawai WHERE id=?', [ownId]))
	))
		duplicateField.append(key, String(value));
	duplicateField.append('nama', 'duplikat');
	expectStatus(
		await request('owner', profilePath + '?/saveProfile', { body: duplicateField, method: 'POST' }),
		400,
		'duplicate form key'
	);
	pass('Unknown, protected, and repeated profile fields are rejected');

	const fresh = await row('SELECT * FROM pegawai WHERE id=?', [ownId]);
	expectStatus(
		await request('owner', profilePath + '?/saveProfile', {
			form: { ...profileForm(fresh), updatedAt: initial.updated_at, telepon: '000' }
		}),
		409,
		'stale updatedAt'
	);
	const duplicate = await row('SELECT * FROM pegawai WHERE id=?', [duplicateId]);
	for (const key of ['nip', 'nik']) {
		expectStatus(
			await request('owner', profilePath + '?/saveProfile', {
				form: { ...profileForm(fresh), [key]: duplicate[key] }
			}),
			400,
			`duplicate ${key}`
		);
	}
	expectStatus(
		await request('owner', profilePath + '?/saveProfile', {
			form: { ...profileForm(fresh), tanggalLahir: '2026-02-30' }
		}),
		400,
		'invalid profile date'
	);
	pass('Optimistic locking, duplicate NIP/NIK, and invalid profile dates are enforced');
	expectStatus(
		await request('owner', profilePath + '?/saveProfile', {
			form: { ...profileForm(fresh), nip: '' }
		}),
		400,
		'required NIP cannot be erased'
	);

	const savePendidikan = await request('owner', profilePath + '?/savePendidikan', {
		form: {
			jenjang: 'S1',
			institusi: 'Universitas QA',
			programStudi: 'Pengujian',
			tahunLulus: '2015',
			nomorIjazah: 'IJ-QA-1',
			isTerakhir: 'on'
		}
	});
	expectStatus(savePendidikan, 200, 'save pendidikan');
	const pendidikan = await row(
		"SELECT * FROM pegawai_pendidikan WHERE pegawai_id=? AND institusi='Universitas QA'",
		[ownId]
	);
	assert.ok(pendidikan);
	expectStatus(
		await request('owner', profilePath + '?/savePendidikan', {
			form: { id: pendidikan.id, jenjang: 'S2', institusi: 'Institut QA', tahunLulus: '2027' }
		}),
		200,
		'update pendidikan'
	);
	expectStatus(
		await request('owner', profilePath + '?/savePendidikan', {
			form: { id: sameSchoolId, jenjang: 'S1', institusi: 'IDOR' }
		}),
		404,
		'pendidikan invalid id'
	);
	expectStatus(
		await request('owner', profilePath + '?/savePendidikan', {
			form: { id: 'abc', jenjang: 'S1', institusi: 'Invalid' }
		}),
		400,
		'pendidikan malformed id'
	);

	const saveSertifikasi = await request('owner', profilePath + '?/saveSertifikasi', {
		form: {
			jenis: 'Kompetensi',
			nama: 'Sertifikasi QA',
			penyelenggara: 'Lembaga QA',
			nomor: 'CERT-QA-1',
			tanggalMulai: '2025-01-01',
			tanggalSelesai: '2025-01-02',
			berlakuSampai: '2028-01-02',
			catatan: 'Lulus'
		}
	});
	expectStatus(saveSertifikasi, 200, 'save sertifikasi');
	const sertifikasi = await row(
		"SELECT * FROM pegawai_sertifikasi WHERE pegawai_id=? AND nama='Sertifikasi QA'",
		[ownId]
	);
	assert.ok(sertifikasi);
	expectStatus(
		await request('owner', profilePath + '?/saveSertifikasi', {
			form: {
				id: sertifikasi.id,
				jenis: 'Kompetensi',
				nama: 'Sertifikasi QA Diperbarui',
				penyelenggara: 'Lembaga QA',
				tanggalMulai: '2025-02-01',
				tanggalSelesai: '2025-02-02'
			}
		}),
		200,
		'update sertifikasi'
	);
	expectStatus(
		await request('owner', profilePath + '?/saveSertifikasi', {
			form: {
				id: sertifikasi.id,
				jenis: 'Kompetensi',
				nama: 'Sertifikasi QA Diperbarui',
				tanggalMulai: '2025-02-02',
				tanggalSelesai: '2025-02-01'
			}
		}),
		400,
		'sertifikasi reversed dates'
	);
	expectStatus(
		await request('owner', profilePath + '?/saveSertifikasi', {
			form: { jenis: 'Kompetensi', nama: 'Invalid Date', tanggalMulai: '2025-13-01' }
		}),
		400,
		'sertifikasi invalid date'
	);
	pass('Owner can create and update education/certification; invalid IDs and dates are rejected');

	expectStatus(
		await request('owner', profilePath + '?/saveDokumen', {
			form: {
				jenis: 'ijazah',
				nama: 'Dokumen QA.pdf',
				nomor: 'DOC-QA-1',
				tanggal: '2025-04-31',
				file: new Blob([pdf], { type: 'application/pdf' })
			}
		}),
		400,
		'document invalid date'
	);
	expectStatus(
		await request('owner', profilePath + '?/saveDokumen', {
			form: {
				jenis: 'ijazah',
				nama: 'Dokumen Palsu.pdf',
				file: new Blob(['not-pdf'], { type: 'application/pdf' })
			}
		}),
		400,
		'document invalid signature'
	);
	const saveDocument = await request('owner', profilePath + '?/saveDokumen', {
		form: {
			jenis: 'ijazah',
			nama: 'Dokumen QA.pdf',
			nomor: 'DOC-QA-1',
			tanggal: '2025-04-30',
			file: new Blob([pdf], { type: 'application/pdf' })
		}
	});
	expectStatus(saveDocument, 200, 'save document');
	const document = await row(
		"SELECT * FROM pegawai_dokumen WHERE pegawai_id=? AND nama='Dokumen QA.pdf'",
		[ownId]
	);
	assert.ok(document?.file_path);
	expectStatus(
		await request('owner', profilePath + '?/saveDokumen', {
			form: {
				id: document.id,
				jenis: 'ijazah',
				nama: 'Dokumen QA Diperbarui.pdf',
				nomor: 'DOC-QA-2',
				tanggal: '2025-05-01'
			}
		}),
		200,
		'update document metadata'
	);
	const ownDownload = await request('owner', `/api/pegawai-document/${document.id}`);
	expectStatus(ownDownload, 200, 'owner document download');
	assert.deepEqual(ownDownload.buffer, pdf);
	const deniedDocument = await request('same', `/api/pegawai-document/${document.id}`);
	expectStatus(deniedDocument, [303, 403], 'same-school document IDOR');
	if (deniedDocument.status === 303)
		assert.ok(deniedDocument.headers.get('location')?.startsWith('/forbidden?'), 'Access denial must redirect to forbidden, not expose the file.');
	expectStatus(
		await request('other', `/api/pegawai-document/${document.id}`),
		404,
		'other-school document IDOR'
	);
	const managerDownload = await request('manager', `/api/pegawai-document/${document.id}`);
	expectStatus(managerDownload, 200, 'manager document download');
	assert.deepEqual(managerDownload.buffer, pdf);
	pass('Document upload/download is isolated; owner and school manager retain intended access');

	const photoForm = new FormData();
	photoForm.append('foto', new Blob([png], { type: 'image/png' }), 'qa-photo.png');
	expectStatus(
		await request('owner', `/api/pegawai-photo/${ownId}`, { body: photoForm, method: 'POST' }),
		200,
		'owner photo upload'
	);
	const photoDownload = await request('owner', `/api/pegawai-photo/${ownId}`);
	expectStatus(photoDownload, 200, 'owner photo download');
	assert.deepEqual(photoDownload.buffer, png);
	for (const role of ['user', 'wali_kelas', 'wali_asuh', 'wali_asrama', 'tim_dapur']) {
		const account = `staff-${role}`;
		expectStatus(await request(account, profilePath), 200, `${role} own profile`);
		expectStatus(
			await request(account, `/api/pegawai-photo/${ownId}`),
			200,
			`${role} own photo`
		);
		expectStatus(
			await request(account, `/api/pegawai-photo/${sameSchoolId}`),
			403,
			`${role} other employee photo`
		);
		const otherProfile = await request(account, `/pegawai/${sameSchoolId}`);
		expectStatus(otherProfile, [303, 403], `${role} other employee profile`);
		if (otherProfile.responseStatus === 303)
			assert.notEqual(otherProfile.headers.get('location'), `/pegawai/${sameSchoolId}`);
	}
	expectStatus(await request('unlinked', profilePath), 403, 'unlinked profile');
	expectStatus(await request('school-mismatch', profilePath), 404, 'school mismatch profile');
	const anonymousProfile = await request(null, profilePath);
	assert.ok([302, 303, 307, 308].includes(anonymousProfile.responseStatus));
	assert.match(anonymousProfile.headers.get('location') ?? '', /\/login(?:\?|$)/);
	pass('Every staff role can read its own profile/photo; other, unlinked, mismatched, and anonymous access is denied');
	for (const [account, id, expected] of [
		['owner', sameSchoolId, 403],
		['owner', otherSchoolId, 403],
		['other', ownId, 403]
	]) {
		expectStatus(
			await request(account, `/api/pegawai-photo/${id}`, { method: 'DELETE' }),
			expected,
			`${account} photo IDOR ${id}`
		);
	}
	const managerPhoto = new FormData();
	managerPhoto.append('foto', new Blob([png], { type: 'image/png' }), 'manager-photo.png');
	expectStatus(
		await request('manager', `/api/pegawai-photo/${sameSchoolId}`, {
			body: managerPhoto,
			method: 'POST'
		}),
		200,
		'manager photo endpoint'
	);
	expectStatus(
		await request('owner', `/api/pegawai-photo/${ownId}`, { method: 'DELETE' }),
		200,
		'owner photo delete'
	);
	assert.equal((await row('SELECT foto FROM pegawai WHERE id=?', [ownId])).foto, null);
	pass('Owner photo POST/GET/DELETE works; IDOR is denied and manager endpoint remains available');

	const foreignEducation = await insert('pegawai_pendidikan', {
		sekolah_id: ownSchool,
		pegawai_id: sameSchoolId,
		jenjang: 'S3',
		institusi: 'Rahasia Sekolah Sama',
		is_terakhir: 0,
		created_at: now,
		updated_at: now
	});
	const foreignCertification = await insert('pegawai_sertifikasi', {
		sekolah_id: otherSchool,
		pegawai_id: otherSchoolId,
		jenis: 'Rahasia',
		nama: 'Rahasia Sekolah Lain',
		created_at: now,
		updated_at: now
	});
	for (const [action, id] of [
		['deletePendidikan', foreignEducation],
		['deleteSertifikasi', foreignCertification]
	]) {
		expectStatus(
			await request('owner', `${profilePath}?/${action}`, { form: { id } }),
			404,
			`${action} IDOR`
		);
	}
	expectStatus(
		await request('owner', profilePath + '?/deleteDokumen', { form: { id: 'nope' } }),
		400,
		'delete document invalid id'
	);

	const managerEducation = await request('manager', `/pegawai/${sameSchoolId}?/savePendidikan`, {
		form: { jenjang: 'D4', institusi: 'Manager Preserved', tahunLulus: '2020' }
	});
	expectStatus(managerEducation, 200, 'manager shared savePendidikan');
	const managedEducation = await row(
		"SELECT id FROM pegawai_pendidikan WHERE pegawai_id=? AND institusi='Manager Preserved'",
		[sameSchoolId]
	);
	assert.ok(managedEducation);
	expectStatus(
		await request('manager', `/pegawai/${sameSchoolId}?/deletePendidikan`, {
			form: { id: managedEducation.id }
		}),
		200,
		'manager shared deletePendidikan'
	);
	const managerCertification = await request(
		'manager',
		`/pegawai/${sameSchoolId}?/saveSertifikasi`,
		{ form: { jenis: 'Kompetensi', nama: 'Manager Certificate', tanggalMulai: '2025-01-01' } }
	);
	expectStatus(managerCertification, 200, 'manager shared saveSertifikasi');
	const managedCertification = await row(
		"SELECT id FROM pegawai_sertifikasi WHERE pegawai_id=? AND nama='Manager Certificate'",
		[sameSchoolId]
	);
	assert.ok(managedCertification);
	expectStatus(
		await request('manager', `/pegawai/${sameSchoolId}?/deleteSertifikasi`, {
			form: { id: managedCertification.id }
		}),
		200,
		'manager shared deleteSertifikasi'
	);
	const managerDocument = await request('manager', `/pegawai/${sameSchoolId}?/saveDokumen`, {
		form: {
			jenis: 'sk',
			nama: 'Manager Document.pdf',
			file: new Blob([pdf], { type: 'application/pdf' })
		}
	});
	expectStatus(managerDocument, 200, 'manager shared saveDokumen');
	const managedDocument = await row(
		"SELECT id FROM pegawai_dokumen WHERE pegawai_id=? AND nama='Manager Document.pdf'",
		[sameSchoolId]
	);
	assert.ok(managedDocument);
	expectStatus(
		await request('manager', `/pegawai/${sameSchoolId}?/deleteDokumen`, {
			form: { id: managedDocument.id }
		}),
		200,
		'manager shared deleteDokumen'
	);
	pass('Shared admin-route personal actions remain functional and owner CRUD rejects IDOR');

	expectStatus(
		await request('owner', profilePath + '?/deletePendidikan', { form: { id: pendidikan.id } }),
		200,
		'delete own pendidikan'
	);
	expectStatus(
		await request('owner', profilePath + '?/deleteSertifikasi', { form: { id: sertifikasi.id } }),
		200,
		'delete own sertifikasi'
	);
	expectStatus(
		await request('owner', profilePath + '?/deleteDokumen', { form: { id: document.id } }),
		200,
		'delete own document'
	);
	assert.equal(
		Number((await row('SELECT COUNT(*) AS n FROM pegawai_dokumen WHERE id=?', [document.id])).n),
		0
	);
	pass('Owner can delete own education, certification, and document records');

	// Keep populated own-only records for visual verification after CRUD assertions.
	await insert('pegawai_pendidikan', {
		sekolah_id: ownSchool,
		pegawai_id: ownId,
		jenjang: 'S1',
		institusi: 'Own Only University',
		program_studi: 'QA Browser',
		tahun_lulus: 2015,
		nomor_ijazah: 'OWN-ONLY-IJAZAH',
		is_terakhir: 1,
		created_at: now,
		updated_at: now
	});
	await insert('pegawai_sertifikasi', {
		sekolah_id: ownSchool,
		pegawai_id: ownId,
		jenis: 'Kompetensi',
		nama: 'Own Only Certificate',
		penyelenggara: 'QA Browser',
		tanggal_mulai: '2025-01-01',
		tanggal_selesai: '2025-01-02',
		created_at: now,
		updated_at: now
	});

	browser = await puppeteer.launch({
		executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
		headless: true,
		args: ['--no-sandbox'],
		userDataDir: path.join(folder, 'browser')
	});
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.setCookie(
		{ name: 'rapkumer-session', value: accounts.owner.token, url: base },
		{ name: 'active-sekolah-id', value: String(ownSchool), url: base }
	);
	const waitForDatabase = async (predicate, label) => {
		for (let attempt = 0; attempt < 100; attempt++) {
			if (await predicate()) return;
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		assert.fail(`Waktu tunggu database habis: ${label}`);
	};
	async function assertBiodataFieldBounds(width) {
		await page.setViewport({ width, height: width === 320 ? 740 : 844 });
		await page.goto(base + profilePath, { waitUntil: 'networkidle0' });
		const geometry = await page.evaluate(() => {
			const controls = [
				...document.querySelectorAll(
					'#profile-panel-biodata form input:not([type="hidden"]), #profile-panel-biodata form select, #profile-panel-biodata form textarea'
				)
			]
				.filter((element) => element instanceof HTMLElement && element.offsetParent !== null)
				.map((element) => {
					const box = element.getBoundingClientRect();
					return {
						name: element.getAttribute('name'),
						left: box.left,
						right: box.right,
						width: box.width,
						tableScroller: Boolean(element.closest('table')?.closest('.overflow-x-auto'))
					};
				});
			return { viewport: innerWidth, controls };
		});
		assert.ok(geometry.controls.length >= Object.keys(editableProfileColumns).length);
		for (const control of geometry.controls) {
			if (control.tableScroller) continue;
			assert.ok(control.width > 0, `${control.name} tidak memiliki lebar pada ${width}px.`);
			assert.ok(control.left >= -0.5, `${control.name} keluar sisi kiri pada ${width}px.`);
			assert.ok(
				control.right <= geometry.viewport + 0.5,
				`${control.name} keluar sisi kanan pada ${width}px.`
			);
		}
	}

	await page.setViewport({ width: 390, height: 844 });
	await page.goto(base + profilePath, { waitUntil: 'networkidle0' });
	const browserPhone = `0812${Date.now().toString().slice(-8)}`;
	await page.$eval('#profile-panel-biodata input[name="telepon"]', (input) => {
		if (!(input instanceof HTMLInputElement)) throw new Error('Input telepon tidak ditemukan.');
		input.value = '';
		input.dispatchEvent(new Event('input', { bubbles: true }));
	});
	await page.type('#profile-panel-biodata input[name="telepon"]', browserPhone);
	const saveButtonState = await page.evaluate(() => {
		const button = [...document.querySelectorAll('#profile-panel-biodata button[type="submit"]')].find(
			(node) => node.textContent?.trim() === 'Simpan biodata'
		);
		if (!(button instanceof HTMLButtonElement)) return null;
		button.scrollIntoView({ block: 'end', inline: 'nearest' });
		const panel = button.closest('main, [role="main"], .overflow-y-auto');
		if (panel instanceof HTMLElement && panel.scrollHeight > panel.clientHeight)
			panel.scrollTop = Math.min(panel.scrollHeight, panel.scrollTop + 24);
		const box = button.getBoundingClientRect();
		return { disabled: button.disabled, top: box.top, bottom: box.bottom };
	});
	assert.ok(saveButtonState, 'Tombol Simpan biodata tidak ditemukan.');
	assert.equal(saveButtonState.disabled, false);
	assert.ok(saveButtonState.top >= 0 && saveButtonState.bottom <= 844);
	await page.screenshot({ path: path.join(folder, 'profile-save-button-bottom.png') });
	await page.click('#profile-panel-biodata button[type="submit"]');
	await waitForDatabase(
		async () => (await row('SELECT telepon FROM pegawai WHERE id=?', [ownId])).telepon === browserPhone,
		'browser biodata submit'
	);
	await page.reload({ waitUntil: 'networkidle0' });
	assert.equal(
		await page.$eval('#profile-panel-biodata input[name="telepon"]', (input) =>
			input instanceof HTMLInputElement ? input.value : null
		),
		browserPhone
	);
	pass('FormEnhance browser submit persists biodata and reload retains the saved value');

	await assertBiodataFieldBounds(320);
	await assertBiodataFieldBounds(390);
	pass('Visible biodata inputs, selects, and textareas stay within 320px and 390px viewports');

	await page.setViewport({ width: 320, height: 740 });
	await page.goto(base + profilePath, { waitUntil: 'networkidle0' });
	const photoTrigger = await page.evaluateHandle(() =>
		[...document.querySelectorAll('button')].find((button) =>
			['Unggah foto', 'Ubah foto'].includes(button.textContent?.trim() ?? '')
		)
	);
	assert.ok(photoTrigger.asElement(), 'Tombol modal foto tidak ditemukan pada 320px.');
	await photoTrigger.asElement().click();
	await page.waitForSelector('dialog[open]');
	const photoModalState = await page.evaluate(() => {
		const dialog = document.querySelector('dialog[open]');
		const box = dialog?.querySelector('.modal-box');
		const save = [...(dialog?.querySelectorAll('button') ?? [])].find(
			(button) => button.textContent?.trim() === 'Simpan'
		);
		if (!(dialog instanceof HTMLDialogElement) || !(box instanceof HTMLElement) || !(save instanceof HTMLButtonElement))
			return null;
		save.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		const modalBox = box.getBoundingClientRect();
		const saveBox = save.getBoundingClientRect();
		return {
			modalLeft: modalBox.left,
			modalRight: modalBox.right,
			saveTop: saveBox.top,
			saveBottom: saveBox.bottom,
			saveDisabled: save.disabled,
			focusInside: dialog.contains(document.activeElement)
		};
	});
	assert.ok(photoModalState, 'Modal foto tidak dapat diperiksa.');
	assert.ok(photoModalState.modalLeft >= -0.5 && photoModalState.modalRight <= 320.5);
	assert.ok(photoModalState.saveTop >= 0 && photoModalState.saveBottom <= 740);
	assert.equal(photoModalState.saveDisabled, true);
	assert.equal(photoModalState.focusInside, true);
	await page.screenshot({ path: path.join(folder, 'profile-photo-modal-320.png') });
	await page.evaluate(() => {
		const dialog = document.querySelector('dialog[open]');
		const cancel = [...(dialog?.querySelectorAll('button') ?? [])].find(
			(button) => button.textContent?.trim() === 'Batal'
		);
		if (!(cancel instanceof HTMLButtonElement)) throw new Error('Tombol Batal tidak ditemukan.');
		cancel.click();
	});
	await page.waitForFunction(() => !document.querySelector('dialog[open]'));
	pass('Photo modal opens, fits, traps focus, exposes Save, screenshots, and closes at 320px');
	await photoTrigger.dispose();

	async function capture(name, width, height, dark = false) {
		await page.setViewport({ width, height });
		await page.emulateMediaFeatures([
			{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }
		]);
		await page.goto(base + profilePath, { waitUntil: 'networkidle0' });
		const state = await page.evaluate(() => ({
			overflow: document.documentElement.scrollWidth > innerWidth,
			theme: document.documentElement.getAttribute('data-theme'),
			text: document.body.innerText,
			revision: document.querySelector('[data-ui-revision]')?.getAttribute('data-ui-revision'),
			photoButton: [...document.querySelectorAll('button')]
				.map((node) => node.textContent?.trim())
				.find((label) => label === 'Unggah foto' || label === 'Ubah foto'),
			tabs: [
				...document.querySelectorAll('input.tab[type="radio"][name="employee-profile-tab"]')
			].map((node) => node.getAttribute('aria-label'))
		}));
		assert.equal(state.overflow, false, `${name} mengalami overflow horizontal.`);
		assert.equal(state.revision, 'employee-profile-self-service-1');
		assert.ok(
			state.photoButton === 'Unggah foto' || state.photoButton === 'Ubah foto',
			'Tombol modal foto profil tidak ditemukan.'
		);
		assert.ok(state.text.includes('QA Profil Pemilik Lengkap'));
		assert.ok(!state.text.includes('Rahasia Sekolah Sama'));
		assert.ok(!state.text.includes('Rahasia Sekolah Lain'));
		if (dark) assert.equal(state.theme, 'dark', 'Screenshot dark tidak memakai tema gelap.');
		await page.screenshot({ path: path.join(folder, `${name}.png`), fullPage: true });
		return state.tabs.filter(Boolean);
	}
	const tabs = await capture('profile-desktop', 1366, 900);
	assert.ok(tabs.length > 0, 'Navigasi tab profil tidak ditemukan.');
	await capture('profile-mobile-390', 390, 844);
	await capture('profile-mobile-320', 320, 740);
	await capture('profile-dark', 390, 844, true);
	const tabText = [];
	for (const [index, label] of tabs.entries()) {
		const clicked = await page.evaluate((wanted) => {
			const tab = [
				...document.querySelectorAll(
					'input.tab[type="radio"][name="employee-profile-tab"][aria-label]'
				)
			].find((node) => node.getAttribute('aria-label') === wanted);
			if (!(tab instanceof HTMLInputElement)) return false;
			tab.click();
			return tab.checked;
		}, label);
		assert.equal(clicked, true, `Radio tab ${label} tidak terpilih setelah diklik.`);
		await new Promise((resolve) => setTimeout(resolve, 100));
		assert.equal(
			await page.evaluate((wanted) => {
				const selected = document.querySelector(
					'input.tab[type="radio"][name="employee-profile-tab"]:checked'
				);
				return selected?.getAttribute('aria-label') === wanted;
			}, label),
			true,
			`Status checked tab ${label} tidak bertahan.`
		);
		assert.equal(
			await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
			false,
			`Tab ${label} mengalami overflow.`
		);
		tabText.push(await page.evaluate(() => document.body.innerText));
		await page.screenshot({
			path: path.join(folder, `profile-tab-${index + 1}.png`),
			fullPage: true
		});
	}
	assert.ok(tabText.some((text) => text.includes('Own Only University')));
	assert.ok(tabText.some((text) => text.includes('Own Only Certificate')));
	assert.ok(tabText.every((text) => !text.includes('Rahasia Sekolah Sama')));
	assert.ok(tabText.every((text) => !text.includes('Rahasia Sekolah Lain')));
	assert.deepEqual(errors, []);
	pass(
		'Desktop, 390px, 320px, dark mode, and profile tabs render without overflow or data leakage'
	);

	const auditTable = await row(
		"SELECT name FROM sqlite_master WHERE type='table' AND name='audit_log'"
	);
	if (auditTable) {
		const ownerAudit = await rows(
			"SELECT action, summary FROM audit_log WHERE username_snapshot='qa-profile-owner' AND entity_type='pegawai' AND entity_id=? ORDER BY id",
			[String(ownId)]
		);
		assert.equal(ownerAudit.length, 4, `Mutasi mandiri tercatat ${ownerAudit.length}, seharusnya 4.`);
		assert.equal(
			ownerAudit.filter((entry) => entry.summary === 'Pegawai memperbarui profil pribadi').length,
			2
		);
		assert.equal(ownerAudit.filter((entry) => entry.summary === 'Foto pegawai diperbarui').length, 1);
		assert.equal(ownerAudit.filter((entry) => entry.summary === 'Foto pegawai dihapus').length, 1);
		pass('Every successful self profile/photo mutation is present in audit_log');
	}

	assert.equal((await db.execute('PRAGMA integrity_check')).rows[0].integrity_check, 'ok');
	assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length, 0);
	await writeFile(
		path.join(folder, 'result.json'),
		JSON.stringify({ checks, database, uploadRoot, screenshots: folder }, null, 2)
	);
	console.log('QA_RESULT', folder);
} catch (error) {
	await writeFile(path.join(folder, 'server.log'), output);
	console.error('QA_FOLDER', folder);
	throw error;
} finally {
	if (browser) await browser.close();
	await stopServer();
	db.close();
}
