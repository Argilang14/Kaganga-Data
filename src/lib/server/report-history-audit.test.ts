import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { auditReportHistory, valueCoverage } from './report-history-audit.ts';
import {
	createReportHistoryBackup,
	restoreReportHistoryBackup,
	fileSha256
} from './report-history-backup.ts';

async function fixture() {
	await mkdir('tmp', { recursive: true });
	const folder = await mkdtemp(path.resolve('tmp/report-history-test-'));
	const database = path.join(folder, 'source.sqlite3');
	const db = createClient({ url: `file:${database}` });
	await db.batch([
		'CREATE TABLE sekolah(id INTEGER PRIMARY KEY,nama TEXT)',
		'CREATE TABLE tahun_ajaran(id INTEGER PRIMARY KEY,sekolah_id INTEGER,nama TEXT)',
		'CREATE TABLE semester(id INTEGER PRIMARY KEY,tahun_ajaran_id INTEGER,nama TEXT)',
		'CREATE TABLE kelas(id INTEGER PRIMARY KEY,sekolah_id INTEGER,tahun_ajaran_id INTEGER,semester_id INTEGER,nama TEXT)',
		'CREATE TABLE murid(id INTEGER PRIMARY KEY,sekolah_id INTEGER,semester_id INTEGER,kelas_id INTEGER,nis TEXT,nisn TEXT,nama TEXT,tanggal_lahir TEXT,foto TEXT)',
		'CREATE TABLE murid_identity_link(murid_id INTEGER,sekolah_id INTEGER,semester_id INTEGER,identity_uid TEXT)',
		'CREATE TABLE murid_lifecycle(id INTEGER PRIMARY KEY,sekolah_id INTEGER,identity_key TEXT,needs_identity_review INTEGER)',
		'CREATE TABLE murid_riwayat_kelas(id INTEGER PRIMARY KEY,sekolah_id INTEGER,murid_id INTEGER,tahun_ajaran_id INTEGER,semester_id INTEGER,kelas_id INTEGER,identity_key TEXT,tahun_ajaran_snapshot TEXT,semester_snapshot TEXT,kelas_snapshot TEXT)',
		'CREATE TABLE mata_pelajaran(id INTEGER PRIMARY KEY,kelas_id INTEGER)',
		'CREATE TABLE asesmen_sumatif(id INTEGER PRIMARY KEY,murid_id INTEGER,mata_pelajaran_id INTEGER,nilai_akhir REAL,nilai_akhir_rts REAL)',
		'CREATE TABLE keasramaan(id INTEGER PRIMARY KEY,kelas_id INTEGER)',
		'CREATE TABLE keasramaan_indikator(id INTEGER PRIMARY KEY,keasramaan_id INTEGER)',
		'CREATE TABLE keasramaan_tujuan(id INTEGER PRIMARY KEY,indikator_id INTEGER)',
		'CREATE TABLE asesmen_keasramaan(id INTEGER PRIMARY KEY,murid_id INTEGER,keasramaan_id INTEGER,tujuan_id INTEGER,kategori TEXT)',
		'CREATE TABLE blob_fixture(id INTEGER PRIMARY KEY,data BLOB)',
		"INSERT INTO sekolah VALUES(1,'Sekolah A'),(2,'Sekolah B')",
		"INSERT INTO tahun_ajaran VALUES(1,1,'2024/2025'),(2,1,'2025/2026'),(3,2,'2024/2025')",
		"INSERT INTO semester VALUES(1,1,'Ganjil'),(2,1,'Genap'),(3,2,'Ganjil'),(4,3,'Ganjil')",
		"INSERT INTO kelas VALUES(1,1,1,1,'X.A'),(2,1,1,2,'X.A'),(3,1,2,3,'XI.A'),(4,2,3,4,'X.A')",
		"INSERT INTO murid VALUES(1,1,1,1,'001','0000000000','Contoh','2010-01-01',NULL),(2,1,2,2,'001','0000000000','Contoh','2010-01-01',NULL),(3,2,4,4,'001','0000000000','Contoh','2010-01-01',NULL)",
		"INSERT INTO murid_identity_link VALUES(1,1,1,'internal-a'),(2,1,2,'internal-a'),(3,2,4,'internal-a')",
		"INSERT INTO murid_riwayat_kelas VALUES(1,1,1,1,1,1,'uid:internal-a','2024/2025','Ganjil','X.A'),(2,1,2,1,2,2,'uid:internal-a','2024/2025','Genap','X.A'),(3,2,3,3,4,4,'uid:internal-a','2024/2025','Ganjil','X.A')",
		'INSERT INTO mata_pelajaran VALUES(1,1),(2,1),(3,2),(4,4)',
		'INSERT INTO asesmen_sumatif VALUES(1,1,1,0,0),(2,1,2,80,NULL)',
		'INSERT INTO keasramaan VALUES(1,1)',
		'INSERT INTO keasramaan_indikator VALUES(1,1)',
		'INSERT INTO keasramaan_tujuan VALUES(1,1),(2,1)',
		"INSERT INTO asesmen_keasramaan VALUES(1,1,1,1,'baik')",
		"INSERT INTO blob_fixture VALUES(1,x'0001FF')"
	]);
	return { db, folder, database };
}

test('indikator membedakan nol, kosong, belum lengkap dan bukan rapor final', () => {
	assert.equal(valueCoverage(2, 0, 0).status, 'data_tidak_tersedia');
	assert.equal(valueCoverage(2, 1, 1).status, 'nilai_belum_lengkap');
	assert.equal(valueCoverage(2, 2, 2).status, 'nilai_inti_lengkap');
	assert.equal(valueCoverage(0, 0, 0).status, 'data_tidak_tersedia');
	assert.equal(valueCoverage(1, 1, 1).final, false);
});
test('nilai per semester tidak mengambil nilai periode berikutnya; nilai nol sah', async () => {
	const { db } = await fixture();
	try {
		const r = await auditReportHistory(db, { schoolId: 1 });
		assert.equal(r.entries.length, 2);
		assert.equal(r.summary.internalIdentities, 1);
		assert.equal(r.summary.multiPeriodIdentities, 1);
		const old = r.entries.find((e) => e.studentId === 1)!;
		const newer = r.entries.find((e) => e.studentId === 2)!;
		assert.equal(old.academic.ras.filled, 2);
		assert.equal(old.academic.ras.status, 'nilai_inti_lengkap');
		assert.equal(old.academic.rts.filled, 1);
		assert.equal(old.academic.rts.status, 'nilai_belum_lengkap');
		assert.equal(newer.academic.ras.status, 'data_tidak_tersedia');
		assert.equal(old.dorm.status, 'nilai_belum_lengkap');
		assert.equal(r.periods.find((p) => p.semesterId === 3)!.students, 0);
		assert.equal(r.summary.missingOrInvalidNisn, 2);
		assert.deepEqual(old.warnings, ['nisn_belum_valid']);
		assert.ok(old.identityVerified);
	} finally {
		db.close();
	}
});
test('scope sekolah memisahkan UID/NIS sama dan audit tidak mengubah tabel', async () => {
	const { db } = await fixture();
	try {
		const before = (await db.execute('SELECT * FROM murid ORDER BY id')).rows;
		await assert.rejects(auditReportHistory(db, { schoolId: 0 }), /ID sekolah tidak valid/);
		const all = await auditReportHistory(db);
		assert.equal(all.summary.internalIdentities, 2);
		const scoped = await auditReportHistory(db, { schoolId: 2 });
		assert.deepEqual(
			scoped.entries.map((v) => v.studentId),
			[3]
		);
		assert.deepEqual((await db.execute('SELECT * FROM murid ORDER BY id')).rows, before);
		await assert.rejects(db.execute("UPDATE murid SET nama='berubah'"));
	} finally {
		db.close();
	}
});
test('identitas hilang dan snapshot-only tidak ditebak dari NIS/NISN', async () => {
	const { db } = await fixture();
	try {
		await db.execute('DELETE FROM murid_identity_link WHERE murid_id=2');
		await db.execute(
			"INSERT INTO murid_riwayat_kelas VALUES(9,1,NULL,NULL,NULL,NULL,'nisn:0000','2023/2024','Genap','IX.A')"
		);
		const r = await auditReportHistory(db, { schoolId: 1 });
		assert.equal(r.entries.find((e) => e.studentId === 2)!.identityUid, null);
		assert.equal(r.snapshotsOnly[0].status, 'data_sumber_tidak_tersedia');
		assert.equal(r.snapshotsOnly[0].safeHistoricalContext, false);
		assert.equal((await db.execute('SELECT COUNT(*) n FROM murid_identity_link')).rows[0].n, 2);
	} finally {
		db.close();
	}
});
test('konteks kelas/semester dan nilai lintas kelas ditandai, bukan dipakai', async () => {
	const { db } = await fixture();
	try {
		await db.execute('INSERT INTO asesmen_sumatif VALUES(9,1,3,99,99)');
		await db.execute('UPDATE kelas SET semester_id=3 WHERE id=2');
		const r = await auditReportHistory(db, { schoolId: 1 });
		assert.ok(r.entries[0].issues.includes('nilai_akademik_di_luar_kelas'));
		assert.equal(r.entries[0].academic.ras.filled, 2);
		assert.ok(r.entries[1].issues.includes('relasi_periode_kelas_tidak_cocok'));
		assert.ok(r.entries.every((e) => !e.safeHistoricalContext));
	} finally {
		db.close();
	}
});
test('UID bersama yang berisi orang berbeda dan NISN sama pada UID berbeda harus diperiksa', async () => {
	const { db } = await fixture();
	try {
		await db.execute("UPDATE murid SET nama='Orang Berbeda' WHERE id=2");
		assert.equal((await auditReportHistory(db, { schoolId: 1 })).summary.identityReview, 2);
		await db.execute('PRAGMA query_only=OFF');
		await db.execute("UPDATE murid_identity_link SET identity_uid='internal-b' WHERE murid_id=2");
		await db.execute("UPDATE murid SET nisn='0012345678' WHERE sekolah_id=1");
		const r = await auditReportHistory(db, { schoolId: 1 });
		assert.equal(r.summary.internalIdentities, 2);
		assert.ok(r.entries.every((e) => e.issues.includes('nisn_sama_pada_identitas_berbeda')));
	} finally {
		db.close();
	}
});
test('riwayat berkunci salah dan status menunggu verifikasi memblokir konteks historis', async () => {
	const { db } = await fixture();
	try {
		await db.execute("UPDATE murid_riwayat_kelas SET identity_key='uid:other' WHERE murid_id=1");
		await db.execute(
			"INSERT INTO murid_lifecycle VALUES(1,1,'uid:internal-a',1),(2,1,'nisn:0000',1)"
		);
		const r = await auditReportHistory(db, { schoolId: 1 });
		assert.equal(r.summary.identityReview, 2);
		assert.equal(r.summary.legacyLifecycleRows, 1);
		assert.ok(r.entries[0].issues.includes('riwayat_tidak_cocok_dengan_sumber'));
	} finally {
		db.close();
	}
});
test('nilai/predikat tidak valid dan tujuan asrama yang salah ditandai', async () => {
	const { db } = await fixture();
	try {
		await db.execute('UPDATE asesmen_sumatif SET nilai_akhir=101 WHERE id=1');
		await db.execute("UPDATE asesmen_keasramaan SET kategori='tidak-sah'");
		await db.execute("INSERT INTO asesmen_keasramaan VALUES(2,2,1,1,'baik')");
		const r = await auditReportHistory(db, { schoolId: 1 });
		assert.ok(r.entries[0].issues.includes('nilai_ras_tidak_valid'));
		assert.ok(r.entries[0].issues.includes('predikat_asrama_tidak_valid'));
		assert.ok(r.entries[1].issues.includes('nilai_asrama_di_luar_kelas_atau_tujuan'));
	} finally {
		db.close();
	}
});
test('tabel penilaian tidak ada dicatat tanpa migrasi; tidak dikira nilai lengkap', async () => {
	const { db } = await fixture();
	try {
		await db.execute('DROP TABLE asesmen_sumatif');
		const r = await auditReportHistory(db);
		assert.ok(r.missingTables.includes('asesmen_sumatif'));
		assert.ok(r.entries.every((e) => e.academic.ras.status === 'data_tidak_tersedia'));
		assert.equal(
			(await db.execute("SELECT name FROM sqlite_master WHERE name='asesmen_sumatif'")).rows.length,
			0
		);
	} finally {
		db.close();
	}
});
test('backup fisik dan pemulihan salinan mempertahankan blob, foto, checksum dan semua tabel', async () => {
	const { db, folder, database } = await fixture();
	db.close();
	const uploads = path.join(folder, 'uploads');
	await mkdir(uploads);
	await writeFile(path.join(uploads, 'foto.jpg'), Buffer.from([1, 2, 3]));
	const source = createClient({ url: `file:${database}` });
	await source.execute("UPDATE murid SET foto='foto.jpg' WHERE id=1");
	source.close();
	const before = await fileSha256(database);
	const backup = await createReportHistoryBackup({
		database,
		directory: path.join(folder, 'backup'),
		uploads: [uploads]
	});
	assert.equal(backup.manifest.files.length, 1);
	assert.ok(backup.manifest.complete);
	assert.equal(backup.manifest.references[0].status, 'ok');
	assert.equal(await fileSha256(database), before);
	const restored = await restoreReportHistoryBackup(backup.directory, path.join(folder, 'qa'));
	const qa = createClient({ url: `file:${restored.database}` });
	try {
		assert.equal(
			(await qa.execute('SELECT hex(data) value FROM blob_fixture')).rows[0].value,
			'0001FF'
		);
		assert.equal((await auditReportHistory(qa)).summary.students, 3);
	} finally {
		qa.close();
	}
	assert.deepEqual(
		await readFile(path.join(folder, 'qa/uploads-0/foto.jpg')),
		Buffer.from([1, 2, 3])
	);
	await assert.rejects(
		createReportHistoryBackup({ database, directory: backup.directory, uploads: [uploads] }),
		/EEXIST/
	);
});
test('foto rujukan hilang membuat backup belum lengkap; file rusak ditolak saat salinan dipulihkan', async () => {
	const { db, folder, database } = await fixture();
	await db.execute("UPDATE murid SET foto='hilang.jpg' WHERE id=1");
	db.close();
	const uploads = path.join(folder, 'uploads');
	await mkdir(uploads);
	await writeFile(path.join(uploads, 'lain.jpg'), 'original');
	const backup = await createReportHistoryBackup({
		database,
		directory: path.join(folder, 'backup'),
		uploads: [uploads]
	});
	assert.equal(backup.manifest.complete, false);
	assert.equal(backup.manifest.references[0].status, 'missing');
	await writeFile(path.join(backup.directory, 'uploads-0/lain.jpg'), 'changed');
	await assert.rejects(
		restoreReportHistoryBackup(backup.directory, path.join(folder, 'qa')),
		/Checksum lampiran/
	);
});
test('folder backup di dalam unggahan ditolak dan manifest traversal tidak keluar dari target', async () => {
	const { db, folder, database } = await fixture();
	db.close();
	const uploads = path.join(folder, 'uploads');
	await mkdir(uploads);
	await writeFile(path.join(uploads, 'file.txt'), 'test');
	await assert.rejects(
		createReportHistoryBackup({
			database,
			directory: path.join(uploads, 'backup'),
			uploads: [uploads]
		}),
		/dalam folder unggahan/
	);
	const backup = await createReportHistoryBackup({
		database,
		directory: path.join(folder, 'backup'),
		uploads: [uploads]
	});
	backup.manifest.files[0].relativePath = '../outside.txt';
	await writeFile(path.join(backup.directory, 'manifest.json'), JSON.stringify(backup.manifest));
	await assert.rejects(
		restoreReportHistoryBackup(backup.directory, path.join(folder, 'qa')),
		/keluar dari folder/
	);
});
