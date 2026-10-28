import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp, stat, utimes, writeFile } from 'node:fs/promises';
import { createClient } from '@libsql/client';
import { createServer } from 'vite';
import { PDFDocument } from 'pdf-lib';
import { execFileSync } from 'node:child_process';

const project = process.cwd();
await mkdir(path.join(project, 'tmp'), { recursive: true });
const folder = await mkdtemp(path.join(project, 'tmp', 'murid-profile-foundation-'));
const database = path.join(folder, 'database.sqlite3');
const sourcePath = path.resolve(project, 'data/database.sqlite3');
assert.notEqual(path.resolve(database), sourcePath);
const source = createClient({ url: `file:${sourcePath}` });
try {
	await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
} finally {
	source.close();
}
process.env.DB_URL = `file:${database}`;
process.env.KAGANGA_DATA_DIR = path.join(folder, 'data');
process.env.photo = `file:${path.join(folder, 'uploads')}`;
let vite, closeDb, imageBrowser;
const checks = [];
const pass = (name) => {
	checks.push(name);
	console.log('PASS', name);
};
const client = createClient({ url: process.env.DB_URL });
const row = async (sql, args = []) => (await client.execute({ sql, args })).rows[0];
const insert = async (table, data) => {
	const entries = Object.entries(data).filter(([, value]) => value !== undefined);
	const result = await client.execute({
		sql: `INSERT INTO "${table}" (${entries.map(([key]) => `"${key}"`).join(',')}) VALUES (${entries.map(() => '?').join(',')})`,
		args: entries.map(([, value]) => value)
	});
	return Number(result.lastInsertRowid);
};
const clone = (template, overrides) => {
	const result = { ...template, ...overrides };
	delete result.id;
	return result;
};
const status = (expected) => (cause) => cause?.status === expected;

try {
	console.log('Preparing isolated service loader');
	vite = await createServer({
		configFile: false,
		resolve: { alias: { $lib: path.join(project, 'src', 'lib') } },
		plugins: [
			{
				name: 'profile-qa-private-env',
				resolveId(id) {
					if (id === '$env/dynamic/private') return '\0profile-qa-private-env';
				},
				load(id) {
					if (id === '\0profile-qa-private-env') return 'export const env = process.env;';
				}
			}
		],
		optimizeDeps: { noDiscovery: true, include: [] },
		server: { middlewareMode: true, hmr: false, watch: null },
		appType: 'custom',
		logLevel: 'error'
	});
	const dbModule = await vite.ssrLoadModule('/src/lib/server/db/index.ts');
	closeDb = dbModule.closeDbClient;
	assert.equal(dbModule.databaseUrl, `file:${database}`, 'Service must use the isolated copy.');
	const service = await vite.ssrLoadModule('/src/lib/server/murid-profile.ts');
	const { ensureMuridProfileSchema } = await vite.ssrLoadModule(
		'/src/lib/server/db/ensure-murid-profile.ts'
	);
	const { ensureDataGovernanceSchema } = await vite.ssrLoadModule(
		'/src/lib/server/db/ensure-data-governance.ts'
	);
	const { ensureKesehatanMuridSchema } = await vite.ssrLoadModule(
		'/src/lib/server/db/ensure-kesehatan-murid.ts'
	);
	const { studentProfilePhotoPath } = await vite.ssrLoadModule(
		'/src/lib/server/murid-profile-storage.ts'
	);
	const { loadMuridPurgePlan } = await vite.ssrLoadModule('/src/lib/server/murid-purge.ts');
	await ensureDataGovernanceSchema();
	await ensureMuridProfileSchema();
	await ensureMuridProfileSchema();
	await ensureKesehatanMuridSchema();
	pass('Migration is additive and repeatable on an isolated database copy');

	const template = await row('SELECT * FROM murid ORDER BY id LIMIT 1');
	assert.ok(template, 'A student template is required for QA.');
	const school = Number(template.sekolah_id);
	const kelas = await row('SELECT * FROM kelas WHERE id=?', [template.kelas_id]);
	await client.execute({
		sql: 'UPDATE tahun_ajaran SET is_aktif=CASE WHEN id=? THEN 1 ELSE 0 END WHERE sekolah_id=?',
		args: [kelas.tahun_ajaran_id, school]
	});
	await client.execute({
		sql: 'UPDATE semester SET is_aktif=CASE WHEN id=? THEN 1 ELSE 0 END WHERE tahun_ajaran_id=?',
		args: [template.semester_id, kelas.tahun_ajaran_id]
	});
	const student = await insert(
		'murid',
		clone(template, {
			nis: 'PROFILE-QA',
			nisn: '',
			nama: 'Murid Profil QA',
			qr_token: null,
			wali_asuh_nama: 'Wali Profil QA',
			wali_asrama_nama: 'Wali Profil QA'
		})
	);
	const second = await insert(
		'murid',
		clone(template, {
			nis: 'PROFILE-QA-OTHER',
			nisn: '',
			nama: 'Murid Lain QA',
			qr_token: null,
			wali_asuh_nama: 'Wali Lain QA',
			wali_asrama_nama: 'Wali Lain QA'
		})
	);
	for (const [id, uid] of [
		[student, 'profile-qa-identity'],
		[second, 'profile-qa-other']
	])
		await insert('murid_identity_link', {
			murid_id: id,
			sekolah_id: school,
			semester_id: template.semester_id,
			identity_uid: uid
		});
	const employeeTemplate = await row('SELECT * FROM pegawai WHERE sekolah_id=? LIMIT 1', [school]);
	assert.ok(employeeTemplate, 'An employee template is required for QA.');
	const employee = await insert(
		'pegawai',
		clone(employeeTemplate, {
			nama: 'Wali Profil QA',
			nip: 'PROFILE-QA',
			status: 'aktif',
			kode_pegawai: 'PROFILE-QA'
		})
	);
	const adminRow = await row("SELECT * FROM auth_user WHERE type='admin' LIMIT 1");
	assert.ok(adminRow);
	const userId = await insert(
		'auth_user',
		clone(adminRow, {
			username: 'profile-qa',
			username_normalized: 'profile-qa',
			type: 'wali_asrama',
			jabatan_akses: null,
			sekolah_id: school,
			pegawai_id: employee,
			kelas_id: template.kelas_id,
			permissions: '[]'
		})
	);
	const schoolRow = await row('SELECT * FROM sekolah WHERE id=?', [school]);
	const admin = {
		sekolah: { ...schoolRow, id: school },
		user: {
			id: Number(adminRow.id),
			username: 'admin-qa',
			type: 'admin',
			permissions: [],
			mustChangePassword: false
		}
	};
	const guardian = (permissions = []) => ({
		sekolah: admin.sekolah,
		user: {
			id: userId,
			username: 'wali-qa',
			type: 'wali_asrama',
			sekolahId: school,
			pegawaiId: employee,
			kelasId: Number(template.kelas_id),
			jabatanAkses: null,
			permissions,
			mustChangePassword: false
		}
	});
	await assert.rejects(service.loadStudentProfile({}, student), status(401));
	await assert.rejects(
		service.loadStudentProfile(guardian(['menu_murid', 'absensi_lihat']), student),
		status(403)
	);
	await assert.rejects(
		service.loadStudentProfile(
			{ ...guardian(['murid_profil_lihat']), sekolah: { id: school + 99999 } },
			student
		),
		status(403)
	);
	pass('Unauthenticated, ordinary attendance and cross-school access are denied');

	const permitted = guardian(['murid_profil_lihat', 'murid_profil_manage', 'murid_profil_cetak']);
	const profileEndpoint = await vite.ssrLoadModule('/src/routes/api/murid-profil/[id]/+server.ts');
	for (const body of ['null', '[]', '{']) {
		const response = await profileEndpoint.PUT({
			locals: permitted,
			params: { id: String(student) },
			request: new Request('http://localhost/api/murid-profil/' + student, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body
			})
		});
		assert.equal(response.status, 400);
	}
	assert.ok(await service.requireStudentProfileAccess(permitted, student, 'read'));
	await assert.rejects(service.requireStudentProfileAccess(permitted, second, 'read'), status(404));
	await assert.rejects(
		service.requireStudentProfileAccess(guardian(['murid_profil_lihat']), student, 'edit'),
		status(403)
	);
	await assert.rejects(
		service.requireStudentProfileAccess(guardian(['murid_profil_manage']), student, 'print'),
		status(403)
	);
	pass(
		'Explicit rights remain action-specific and guardian access remains limited to assigned students'
	);
	await client.execute({
		sql: "UPDATE pegawai SET status='nonaktif' WHERE id=?",
		args: [employee]
	});
	await assert.rejects(
		service.requireStudentProfileAccess(permitted, student, 'read'),
		status(403)
	);
	await client.execute({ sql: "UPDATE pegawai SET status='aktif' WHERE id=?", args: [employee] });
	assert.ok(
		await service.requireStudentProfileAccess(
			{ ...permitted, user: { ...permitted.user, jabatanAkses: 'waka_keasramaan' } },
			second,
			'read'
		)
	);
	await assert.rejects(
		service.requireStudentProfileAccess(
			{ ...guardian(), user: { ...guardian().user, jabatanAkses: 'kepala_sekolah' } },
			student,
			'read'
		),
		status(403)
	);
	pass(
		'Inactive employees are denied and school-wide positions still require an explicit private-profile grant'
	);

	const partial = await service.saveStudentProfile(admin, second, { jumlahTanggungan: 0 }, 0);
	assert.equal(partial.revisi, 1);
	assert.deepEqual((await service.loadStudentProfile(admin, second)).profile.jenisBansos, []);
	pass('A new partial profile supplies a real empty assistance array through ORM defaults');
	let version = await service.saveStudentProfile(
		permitted,
		student,
		{
			nomorKk: '0012345678901234',
			desilDtsen: 1,
			statusBansos: 'menerima',
			jenisBansos: ['pkh'],
			penghasilanKeluarga: 'Rp1 juta sampai Rp1,5 juta',
			jumlahTanggungan: 3,
			rt: '001',
			bersediaAsrama: false,
			petugasPendataanId: employee,
			catatanPetugas: 'Catatan pribadi QA'
		},
		0
	);
	assert.equal(version.revisi, 1);
	let loaded = await service.loadStudentProfile(permitted, student);
	assert.equal(loaded.profile.nomorKk, '0012345678901234');
	assert.equal(loaded.profile.bersediaAsrama, false);
	assert.equal(loaded.profile.suratPernyataanDitandatangani, null);
	assert.equal(loaded.profile.petugasPendataanNama, 'Wali Profil QA');
	assert.equal(loaded.health, null);
	assert.equal(loaded.student.foto, template.foto);
	pass('Optional information, leading zeros, explicit No and surveyor snapshot are preserved');

	await assert.rejects(
		service.saveStudentProfile(permitted, student, { catatanPetugas: 'stale' }, 0),
		status(409)
	);
	await assert.rejects(service.saveStudentProfile(permitted, student, { sekolahId: 999 }, 1));
	await assert.rejects(
		service.saveStudentProfile(permitted, student, { statusBansos: 'tidak_menerima' }, 1)
	);
	await assert.rejects(
		service.saveStudentProfile(permitted, student, { petugasPendataanId: 99999999 }, 1),
		status(400)
	);
	version = await service.saveStudentProfile(
		permitted,
		student,
		{ catatanPetugas: 'Catatan diperbarui QA' },
		1
	);
	loaded = await service.loadStudentProfile(permitted, student);
	assert.equal(loaded.profile.nomorKk, '0012345678901234');
	assert.equal(version.revisi, 2);
	const audit = await client.execute({
		sql: "SELECT after_data,before_data FROM audit_log WHERE entity_type='murid_profil' AND entity_id=?",
		args: [String(version.id)]
	});
	assert.equal(audit.rows.length, 2);
	assert.equal(JSON.stringify(audit.rows).includes('0012345678901234'), false);
	assert.equal(JSON.stringify(audit.rows).includes('Catatan pribadi QA'), false);
	pass(
		'Stale writes, mass assignment, inconsistent assistance and invalid surveyors are rejected; audit excludes private values'
	);

	const semesterTemplate = await row('SELECT * FROM semester WHERE id=?', [template.semester_id]);
	const otherSemester = await row(
		'SELECT id FROM semester WHERE tahun_ajaran_id=? AND id<>? LIMIT 1',
		[kelas.tahun_ajaran_id, template.semester_id]
	);
	const oldSemester = otherSemester
		? Number(otherSemester.id)
		: await insert(
				'semester',
				clone(semesterTemplate, {
					is_aktif: 0,
					tipe: semesterTemplate.tipe === 'ganjil' ? 'genap' : 'ganjil'
				})
			);
	const oldClass = await insert(
		'kelas',
		clone(kelas, { semester_id: oldSemester, nama: 'Profil QA Lama' })
	);
	const oldStudent = await insert(
		'murid',
		clone(await row('SELECT * FROM murid WHERE id=?', [student]), {
			semester_id: oldSemester,
			kelas_id: oldClass
		})
	);
	await insert('murid_identity_link', {
		murid_id: oldStudent,
		sekolah_id: school,
		semester_id: oldSemester,
		identity_uid: 'profile-qa-identity'
	});
	const oldLoaded = await service.loadStudentProfile(
		{ ...admin, user: { ...admin.user } },
		oldStudent,
		{ asOf: '2026-10-01' }
	);
	assert.equal(oldLoaded.profile.id, loaded.profile.id);
	await assert.rejects(service.loadStudentProfile(permitted, oldStudent), (cause) =>
		[403, 404].includes(cause?.status)
	);
	for (const [muridId, date, condition] of [
		[oldStudent, '2026-09-01', 'Catatan lama'],
		[student, '2026-10-01', 'Catatan sesuai tanggal'],
		[student, '2026-11-01', 'Catatan masa depan']
	])
		await insert('kesehatan_murid', {
			sekolah_id: school,
			murid_id: muridId,
			semester_id: muridId === oldStudent ? oldSemester : template.semester_id,
			tanggal_pengukuran: date,
			kondisi_fisik: condition,
			ukuran_baju: 'XL',
			created_at: new Date().toISOString()
		});
	const dated = await service.loadStudentProfile(admin, student, { asOf: '2026-10-10' });
	assert.equal(dated.health.kondisiFisik, 'Catatan sesuai tanggal');
	assert.equal(dated.health.tanggalPengukuran, '2026-10-01');
	assert.equal(
		(await service.loadStudentProfile(admin, student, { asOf: '2026-09-15' })).health.kondisiFisik,
		'Catatan lama'
	);
	pass(
		'One identity retains one profile across semesters; health reuses dated records and old assignments cannot open current private profiles'
	);

	const storageKey = `sekolah-${school}/11111111-2222-3333-4444-555555555555.png`;
	const filePath = studentProfilePhotoPath(school, storageKey);
	assert.ok(filePath.startsWith(path.join(folder, 'uploads', 'murid-profil') + path.sep));
	for (const key of [
		'../outside.png',
		'C:\\outside.png',
		storageKey.replace('/', '\\'),
		storageKey.replace(`sekolah-${school}`, `sekolah-${school + 1}`),
		'https://example.test/foto.png'
	])
		assert.equal(studentProfilePhotoPath(school, key), null);
	await insert('murid_profil_foto', {
		profil_id: version.id,
		sekolah_id: school,
		jenis: 'rumah',
		storage_key: storageKey,
		mime_type: 'image/png',
		ukuran_bytes: 100,
		sha256: 'a'.repeat(64),
		created_at: new Date().toISOString()
	});
	const photoData = (await service.loadStudentProfile(permitted, student)).photos;
	assert.equal(photoData.length, 1);
	assert.deepEqual(Object.keys(photoData[0]).sort(), ['id', 'jenis', 'updatedAt']);
	pass(
		'Photo metadata has a private school-scoped path and never exposes filesystem keys in page data'
	);
	await client.execute({
		sql: 'DELETE FROM murid_profil_foto WHERE profil_id=?',
		args: [version.id]
	});
	if (process.env.QA_PROFILE_PHOTOS === '1') {
		const photoService = await vite.ssrLoadModule('/src/lib/server/student-profile-photos.ts');
		const { getBrowser } = await vite.ssrLoadModule('/src/lib/server/pdf/pagedpdf.ts');
		imageBrowser = await getBrowser();
		const imagePage = await imageBrowser.newPage();
		const base64 = await imagePage.evaluate(() => {
			const c = document.createElement('canvas');
			c.width = 320;
			c.height = 240;
			const ctx = c.getContext('2d');
			ctx.fillStyle = '#36aa88';
			ctx.fillRect(0, 0, 320, 240);
			return c.toDataURL('image/png').split(',')[1];
		});
		await imagePage.close();
		const file = () => new File([Buffer.from(base64, 'base64')], 'qa.png', { type: 'image/png' });
		await assert.rejects(
			photoService.changeStudentProfilePhoto(
				guardian(['murid_profil_lihat']),
				student,
				'rumah',
				version.revisi,
				file()
			),
			status(403)
		);
		await assert.rejects(
			photoService.changeStudentProfilePhoto(permitted, second, 'rumah', version.revisi, file()),
			status(404)
		);
		for (const invalid of [
			new File(['<svg></svg>'], 'fake.png', { type: 'image/png' }),
			new File([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])], 'corrupt.png', {
				type: 'image/png'
			}),
			new File([Buffer.alloc(5242881)], 'large.png', { type: 'image/png' })
		])
			await assert.rejects(
				photoService.changeStudentProfilePhoto(
					permitted,
					student,
					'rumah',
					version.revisi,
					invalid
				),
				status(400)
			);
		pass('Photo service rejects read-only, unassigned, disguised, corrupt and oversized uploads');
		let photoVersion = await photoService.changeStudentProfilePhoto(
			permitted,
			student,
			'rumah',
			version.revisi,
			file()
		);
		assert.equal(photoVersion.revisi, version.revisi + 1);
		let response = await photoService.readStudentProfilePhoto(permitted, student, 'rumah');
		assert.equal(response.headers.get('content-type'), 'image/jpeg');
		assert.match(response.headers.get('cache-control'), /no-store/);
		assert.ok((await response.arrayBuffer()).byteLength > 100);
		await assert.rejects(
			photoService.changeStudentProfilePhoto(permitted, student, 'rumah', version.revisi, null),
			status(409)
		);
		await assert.rejects(
			photoService.readStudentProfilePhoto(permitted, second, 'rumah'),
			status(404)
		);
		const { createConsistentDatabaseBackup } = await vite.ssrLoadModule(
			'/src/lib/server/db/database-safety.ts'
		);
		const { verifyStudentProfileFiles } = await vite.ssrLoadModule(
			'/src/lib/server/student-profile-files.ts'
		);
		const backup = await createConsistentDatabaseBackup({
			client,
			databasePath: database,
			label: 'profile-photo-qa'
		});
		const snapshot = createClient({ url: `file:${backup}` });
		try {
			await verifyStudentProfileFiles(snapshot);
		} finally {
			snapshot.close();
		}
		pass(
			'Private image decodes to JPEG, remains access controlled, and is copied and verified with database backup'
		);
		const originalPhoto = await row(
			"SELECT storage_key FROM murid_profil_foto WHERE profil_id=? AND jenis='rumah'",
			[version.id]
		);
		const originalPath = studentProfilePhotoPath(school, originalPhoto.storage_key);
		await utimes(originalPath, new Date('2000-01-01'), new Date('2000-01-01'));
		photoVersion = await photoService.changeStudentProfilePhoto(
			permitted,
			student,
			'rumah',
			photoVersion.revisi,
			file()
		);
		assert.ok(
			(await stat(originalPath)).mtimeMs > Date.now() - 10000,
			'Retention must start at replacement, not the original upload date'
		);
		photoVersion = await photoService.changeStudentProfilePhoto(
			permitted,
			student,
			'rumah',
			photoVersion.revisi,
			null
		);
		await assert.rejects(
			photoService.readStudentProfilePhoto(permitted, student, 'rumah'),
			status(404)
		);
		assert.equal(
			(await service.loadStudentProfile(permitted, student)).student.foto,
			template.foto
		);
		assert.equal(photoVersion.photos.length, 0);
		pass('Replace/delete advance the revision and never change the primary student photo');
	}

	await insert('murid_lifecycle', {
		sekolah_id: school,
		identity_key: 'uid:profile-qa-identity',
		nis: 'PROFILE-QA',
		nisn: '',
		nama_snapshot: 'Murid Profil QA',
		status: 'keluar',
		last_murid_id: student,
		needs_identity_review: 0,
		created_at: new Date().toISOString()
	});
	const lifecycle = await row(
		"SELECT id FROM murid_lifecycle WHERE sekolah_id=? AND identity_key='uid:profile-qa-identity'",
		[school]
	);
	const plan = await loadMuridPurgePlan(dbModule.default, school, Number(lifecycle.id));
	assert.ok(plan.blockers.some((message) => message.includes('Profil tambahan')));
	assert.equal((await client.execute('PRAGMA foreign_key_check')).rows.length, 0);
	pass('Permanent deletion cannot orphan a private profile or photo metadata');
	if (process.env.QA_INFORMATION_PRINT === '1') {
		await client.execute({ sql: "UPDATE murid_lifecycle SET status='aktif' WHERE sekolah_id=? AND last_murid_id=?", args: [school, student] });
		const { ensureEducationUnitsSchema } = await vite.ssrLoadModule('/src/lib/server/db/ensure-education-units.ts');
		await ensureEducationUnitsSchema();
		const printClass = await insert('kelas', clone(kelas, { nama: 'X.QA Cetak' }));
		let unit = await row('SELECT * FROM sekolah_satuan_pendidikan WHERE sekolah_id=? ORDER BY id LIMIT 1', [school]);
		if (!unit) {
			const unitId = await insert('sekolah_satuan_pendidikan', { sekolah_id: school, jenjang: 'sma', nama: 'Satuan Pendidikan QA', npsn: '70000000', created_at: new Date().toISOString() });
			unit = await row('SELECT * FROM sekolah_satuan_pendidikan WHERE id=?', [unitId]);
		}
		await insert('kelas_satuan_pendidikan', { kelas_id: printClass, satuan_id: unit.id, nama_snapshot: unit.nama, npsn_snapshot: unit.npsn, created_at: new Date().toISOString() });
		const address = await insert('alamat', { jalan: 'Jalan Contoh QA nomor 12', desa: 'Desa QA', kecamatan: 'Kecamatan QA', kabupaten: 'Kota QA', provinsi: 'Provinsi QA', created_at: new Date().toISOString() });
		await client.execute({ sql: 'UPDATE murid SET kelas_id=?,alamat_id=?,ayah_id=NULL,ibu_id=NULL,wali_id=NULL,foto=NULL,nik=?,tempat_lahir=?,tanggal_lahir=? WHERE id IN (?,?)', args: [printClass, address, '0012345678901234', 'Kota QA', '2010-01-02', student, second] });
		await client.execute({ sql: 'UPDATE murid SET nik=?,tempat_lahir=?,tanggal_lahir=? WHERE id=?', args: ['0012345678901234', 'Kota QA', '2010-01-02', oldStudent] });
		await client.execute({ sql: 'UPDATE murid SET nik=? WHERE id=?', args: ['0012345678909876', second] });
		const printing = await vite.ssrLoadModule('/src/lib/server/student-information-print.ts');
		const templateModule = await vite.ssrLoadModule('/src/lib/server/pdf/templates/informasi-siswa.ts');
		const { renderStudentInformationPDF } = await vite.ssrLoadModule('/src/lib/server/pdf/student-information-pdf.ts');
		const { getBrowser } = await vite.ssrLoadModule('/src/lib/server/pdf/pagedpdf.ts');
		imageBrowser = await getBrowser();
		const printAdmin = { ...admin, user: { ...admin.user } };
		const printGuardian = { ...guardian(['murid_profil_cetak', 'cetak_dokumen']), user: { ...guardian(['murid_profil_cetak', 'cetak_dokumen']).user } };
		const context = await printing.loadInformationPrintContext(printGuardian);
		assert.deepEqual(context.classes.find((c) => c.id === printClass).students.map((s) => s.id), [student]);
		await assert.rejects(printing.loadInformationPrintContext(guardian(['murid_profil_lihat'])), status(403));
		await assert.rejects(printing.loadInformationPrintContext({ ...printGuardian, sekolah: { ...admin.sekolah, id: school + 999 } }), status(403));
		await assert.rejects(printing.buildStudentInformationPages(printGuardian, { kelasId: printClass, muridId: second, maskIdentity: true, background: 'default' }), status(404));
		const options = { kelasId: printClass, muridId: null, maskIdentity: true, background: 'default' };
		const pages = await printing.buildStudentInformationPages(printAdmin, options);
		const privatePage = pages.find((p) => p.nama === 'Murid Profil QA');
		assert.equal(pages.length, 2);
		assert.equal((await printing.buildStudentInformationPages(printGuardian, options)).length, 1);
		assert.equal(privatePage.murid[0][1], '************1234');
		assert.equal(privatePage.murid[1][1], '************1234');
		assert.equal(JSON.stringify(pages).includes('0012345678901234'), false);
		const full = await printing.buildStudentInformationPages(printAdmin, { ...options, muridId: student, maskIdentity: false });
		assert.equal(full[0].murid[0][1], '0012345678901234');
		pass('Private print grant is independent of read/manage, school- and assignment-scoped; masking happens before HTML');
		const canvasPage = await imageBrowser.newPage();
		const image = await canvasPage.evaluate(() => { const c=document.createElement('canvas');c.width=1200;c.height=800;const ctx=c.getContext('2d');ctx.fillStyle='#094887';ctx.fillRect(0,0,1200,800);ctx.fillStyle='#327c9f';ctx.fillRect(0,0,45,800);return c.toDataURL('image/png'); });
		await canvasPage.close();
		const withPhotos = { ...privatePage, logo: image, photos: privatePage.photos.map((p) => ({ ...p, src: image })) };
		for (const [name, students, background, backgroundImage] of [
			['single', [withPhotos], 'default', null], ['class', pages, 'default', null],
			['plain', [pages[1]], 'none', null], ['custom', [withPhotos], 'custom', image]
		]) {
			const html = templateModule.renderStudentInformationHTML(students, { background, backgroundImage });
			await writeFile(path.join(folder, `${name}.html`), html);
			const layoutPage = await imageBrowser.newPage();
			try {
				await layoutPage.setContent(html, { waitUntil: 'load' });
				const frames = await layoutPage.$$eval('.photos img,.photos .missing', (elements) => elements.map((el) => {
					const rect = el.getBoundingClientRect();
					return { width: rect.width, height: rect.height, fit: getComputedStyle(el).objectFit };
				}));
				assert.equal(frames.length, students.length * 4);
				for (const frame of frames) {
					assert.ok(Math.abs(frame.width / frame.height - 3 / 4) < 0.005, JSON.stringify(frame));
					assert.equal(frame.fit, 'contain');
				}
				await writeFile(path.join(folder, `${name}-photo-frames.json`), JSON.stringify(frames, null, 2));
				const sections = await layoutPage.$$eval('.poster', (posters) => posters.map((poster) => {
					const housing = poster.querySelector('.housing').getBoundingClientRect();
					const equipment = poster.querySelector('.equipment-panel').getBoundingClientRect();
					const photos = poster.querySelector('.photo-column').getBoundingClientRect();
					const notes = poster.querySelector('.note-panel').getBoundingClientRect();
					const photoTitle = poster.querySelector('.student-photo-title').getBoundingClientRect();
					const studentPhotos = poster.querySelector('.student-photos').getBoundingClientRect();
					return { housingTop: housing.top, equipmentTop: equipment.top, equipmentBottom: equipment.bottom, photosBottom: photos.bottom, notesBottom: notes.bottom, notesHeight: notes.height, photoTitleBottom: photoTitle.bottom, studentPhotosTop: studentPhotos.top };
				}));
				for (const section of sections) {
					assert.ok(Math.abs(section.housingTop - section.equipmentTop) < 1, JSON.stringify(section));
					assert.ok(section.photosBottom < section.housingTop, JSON.stringify(section));
					assert.ok(Math.abs(section.notesBottom - section.equipmentBottom) < 1, JSON.stringify(section));
					assert.ok(section.photoTitleBottom < section.studentPhotosTop, JSON.stringify(section));
				}
				await writeFile(path.join(folder, `${name}-sections.json`), JSON.stringify(sections, null, 2));
			} finally {
				await layoutPage.close();
			}
			const pdf = await renderStudentInformationPDF(html);
			const parsed = await PDFDocument.load(pdf);
			assert.equal(parsed.getPageCount(), students.length);
			for (const page of parsed.getPages()) { assert.ok(Math.abs(page.getWidth() - 841.89) < 1); assert.ok(Math.abs(page.getHeight() - 595.28) < 1); }
			const target = path.join(folder, `${name}.pdf`);
			await writeFile(target, pdf);
			execFileSync('pdftoppm', ['-f', '1', '-singlefile', '-scale-to', '1400', '-png', target, path.join(folder, `${name}-render`)], { windowsHide: true });
			const extracted = execFileSync(process.env.QA_PYTHON || 'python', ['-c', "from pypdf import PdfReader; import sys; print(' '.join(p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages))", target], { encoding: 'utf8', windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
			assert.equal(extracted.includes('0012345678901234'), false);
			assert.ok(extracted.includes('INFORMASI MURID'));
		}
		await assert.rejects(renderStudentInformationPDF(templateModule.renderStudentInformationHTML([{ ...pages[0], catatan: 'Catatan panjang yang perlu diringkas. '.repeat(400) }], { background: 'default' })), status(422));
		pass('Single/class, full/empty photos, white/custom backgrounds render actual A4 PDFs; overflowing text is rejected without truncation');
	}
	await writeFile(
		path.join(folder, 'results.json'),
		JSON.stringify({ checks, passed: checks.length, database: 'isolated-copy' }, null, 2)
	);
	console.log(`PASS ${checks.length} foundation checks; report: ${folder}`);
} finally {
	if (imageBrowser) await imageBrowser.close();
	if (closeDb) await closeDb();
	if (vite) await vite.close();
	client.close();
}
