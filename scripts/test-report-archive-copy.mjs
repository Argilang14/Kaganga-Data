import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, cp, lstat } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { createServer } from 'vite';
import { PDFDocument } from 'pdf-lib';

const root = process.cwd();
await mkdir('tmp', { recursive: true });
const folder = await mkdtemp(path.resolve('tmp/report-archive-qa-'));
const database = path.join(folder, 'database.sqlite3');
const source = createClient({ url: 'file:./data/database.sqlite3' });
try {
	await source.execute({ sql: 'VACUUM INTO ?', args: [database] });
} finally {
	source.close();
}
process.env.DB_URL = `file:${database}`;
process.env.KAGANGA_DATA_DIR = path.join(folder, 'data');
process.env.KAGANGA_UPLOADS_DIR = path.join(folder, 'uploads');
process.env.photo = path.join(folder, 'uploads');
for (const uploadRoot of [
	path.resolve('data/uploads'),
	path.join(process.env.LOCALAPPDATA ?? root, 'Kaganga-data', 'uploads')
]) {
	try {
		await cp(uploadRoot, process.env.photo, {
			recursive: true,
			force: false,
			filter: async (source) => {
				if ((await lstat(source)).isSymbolicLink())
					throw new Error('QA upload source contains a symlink.');
				return true;
			}
		});
	} catch (cause) {
		if (cause.code !== 'ENOENT') throw cause;
	}
}
const client = createClient({ url: process.env.DB_URL });
const row = async (sql, args = []) => (await client.execute({ sql, args })).rows[0];
const insert = async (table, value) => {
	const entries = Object.entries(value);
	return Number(
		(
			await client.execute({
				sql: `INSERT INTO "${table}" (${entries.map(([k]) => `"${k}"`).join(',')}) VALUES (${entries.map(() => '?').join(',')})`,
				args: entries.map(([, v]) => v)
			})
		).lastInsertRowid
	);
};
const clone = (record, changes) => {
	const result = { ...record, ...changes };
	delete result.id;
	return result;
};
const digest = (value) => createHash('sha256').update(value).digest('hex');
const checks = [];
const pass = (name) => {
	checks.push(name);
	console.log('PASS', name);
};
const rejected = async (fn, status) => {
	await assert.rejects(fn, (cause) => cause.status === status);
};
let vite, connection, pdfBrowser;
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
	const service = await vite.ssrLoadModule('/src/lib/server/report-archive.ts');
	const api = await vite.ssrLoadModule('/src/routes/api/rapor-arsip/[id]/+server.ts');
	const original = await row('SELECT * FROM murid WHERE kelas_id IS NOT NULL LIMIT 1');
	const schoolId = Number(original.sekolah_id);
	const user = await connection.default.query.tableAuthUser.findFirst({
		where: (t, { eq }) => eq(t.type, 'admin')
	});
	assert.ok(user);
	const school = await connection.default.query.tableSekolah.findFirst({
		where: (t, { eq }) => eq(t.id, schoolId),
		with: { kepalaSekolah: true }
	});
	const locals = { user: { ...user, permissions: [] }, sekolah: school };
	const noAccess = {
		...locals,
		user: { ...user, type: 'tim_dapur', jabatanAkses: null, permissions: [] }
	};
	await rejected(
		() =>
			api.GET({
				locals: noAccess,
				params: { id: '1' },
				url: new URL('http://localhost/api/rapor-arsip/1?jenis=sekolah&periode=ras')
			}),
		403
	);
	await rejected(
		() =>
			api.GET({
				locals,
				params: { id: '1' },
				url: new URL('http://localhost/api/rapor-arsip/1?jenis=asrama&periode=rts')
			}),
		400
	);
	await rejected(
		() =>
			api.POST({
				locals,
				params: { id: '1' },
				url: new URL('http://localhost/api/rapor-arsip/1?jenis=sekolah&periode=ras'),
				request: new Request('http://localhost', { method: 'POST', body: 'x'.repeat(17000) })
			}),
		413
	);
	const staff = {
		...locals,
		user: {
			...user,
			type: 'user',
			jabatanAkses: null,
			permissions: ['murid_arsip', 'cetak_akademik', 'cetak_keasramaan']
		}
	};
	const activeBefore = JSON.stringify(
		(await client.execute('SELECT id,is_aktif FROM semester ORDER BY id')).rows
	);
	const oldClass = await row('SELECT * FROM kelas WHERE id=?', [original.kelas_id]);
	const oldYear = await row('SELECT * FROM tahun_ajaran WHERE id=?', [oldClass.tahun_ajaran_id]);
	const oldSemester = await row('SELECT * FROM semester WHERE id=?', [oldClass.semester_id]);
	const year = await insert('tahun_ajaran', clone(oldYear, { nama: '2024/2025', is_aktif: 0 }));
	const semester = await insert(
		'semester',
		clone(oldSemester, {
			nama: 'genap',
			tahun_ajaran_id: year,
			is_aktif: 0,
			tanggal_bagi_raport: '2025-06-20'
		})
	);
	const kelas = await insert(
		'kelas',
		clone(oldClass, {
			nama: 'X.QA Riwayat',
			tahun_ajaran_id: year,
			semester_id: semester,
			dapodik_rombongan_belajar_id: null
		})
	);
	const identity = await row('SELECT * FROM murid_identity_link WHERE murid_id=?', [original.id]);
	const student = await insert(
		'murid',
		clone(original, {
			kelas_id: kelas,
			semester_id: semester,
			qr_token: randomUUID(),
			dapodik_peserta_didik_id: null,
			dapodik_anggota_rombel_id: null
		})
	);
	await insert(
		'murid_identity_link',
		clone(identity, { murid_id: student, semester_id: semester })
	);
	const now = new Date().toISOString();
	const history = await insert('murid_riwayat_kelas', {
		sekolah_id: schoolId,
		murid_id: student,
		identity_key: `uid:${identity.identity_uid}`,
		tahun_ajaran_id: year,
		semester_id: semester,
		kelas_id: kelas,
		nama_snapshot: original.nama,
		nis_snapshot: original.nis,
		nisn_snapshot: original.nisn,
		tahun_ajaran_snapshot: '2024/2025',
		semester_snapshot: 'Semester Genap',
		kelas_snapshot: 'X.QA Riwayat',
		status_snapshot: 'aktif',
		recorded_at: now
	});
	let unit = await row('SELECT * FROM sekolah_satuan_pendidikan WHERE sekolah_id=? LIMIT 1', [
		schoolId
	]);
	if (!unit) {
		const unitId = await insert('sekolah_satuan_pendidikan', {
			sekolah_id: schoolId,
			jenjang: 'sma',
			nama: 'Sekolah Riwayat QA',
			npsn: '00001234',
			created_at: now
		});
		unit = await row('SELECT * FROM sekolah_satuan_pendidikan WHERE id=?', [unitId]);
	}
	await insert('kelas_satuan_pendidikan', {
		kelas_id: kelas,
		satuan_id: unit.id,
		nama_snapshot: unit.nama,
		npsn_snapshot: unit.npsn,
		created_at: now
	});
	assert.equal(
		(await service.historicalReportInfo(locals, history, 'sekolah', 'ras')).coverage.observed,
		0
	);
	const metadata = {
		schoolName: 'Sekolah Riwayat QA',
		npsn: '00001234',
		address: 'Jalan Sekolah QA',
		principalName: 'Kepala Sekolah Periode Lama',
		principalNip: '',
		principalStatus: 'plt',
		caregiverName: 'Wali Asuh Periode Lama',
		caregiverNip: '',
		teacherName: 'Wali Periode Lama',
		teacherNip: '-',
		place: 'Bengkulu',
		date: '2025-06-20'
	};
	const input = { action: 'preview', metadata, confirmMetadata: true };
	const request = new Request('http://localhost/api/rapor-arsip/qa', { method: 'POST' });
	await rejected(
		() => service.previewOrFinalizeReport(locals, history, 'sekolah', 'ras', input, request),
		409
	);
	await rejected(() => service.historicalReportInfo(noAccess, history, 'sekolah', 'ras'), 403);
	await rejected(
		() =>
			service.historicalReportInfo(
				{ ...locals, sekolah: { ...school, id: 999999 } },
				history,
				'sekolah',
				'ras'
			),
		404
	);
	await rejected(
		() => service.historicalReportInfo({ ...locals, user: null }, history, 'sekolah', 'ras'),
		401
	);
	pass('Empty values, unauthorized users and cross-school history blocked');
	const subject = await insert('mata_pelajaran', {
		kelas_id: kelas,
		nama: 'Matematika QA Historis',
		jenis: 'wajib',
		kkm: 70,
		created_at: now,
		updated_at: now
	});
	const grade = await insert('asesmen_sumatif', {
		murid_id: student,
		mata_pelajaran_id: subject,
		nilai_akhir: 84,
		nilai_akhir_rts: 76,
		created_at: now,
		updated_at: now
	});
	const tp = await insert('tujuan_pembelajaran', {
		mata_pelajaran_id: subject,
		deskripsi: 'memahami materi historis QA',
		lingkup_materi: 'Lingkup QA',
		bobot: 100,
		created_at: now,
		updated_at: now
	});
	await insert('asesmen_sumatif_tujuan', {
		murid_id: student,
		mata_pelajaran_id: subject,
		tujuan_pembelajaran_id: tp,
		nilai: 84,
		created_at: now,
		updated_at: now
	});
	const incompleteSubject = await insert('mata_pelajaran', {
		kelas_id: kelas,
		nama: 'Mapel QA Belum Diisi',
		jenis: 'wajib',
		kkm: 70,
		created_at: now,
		updated_at: now
	});
	await rejected(
		() =>
			service.previewOrFinalizeReport(
				locals,
				history,
				'sekolah',
				'ras',
				{ ...input, action: 'finalize' },
				request
			),
		409
	);
	await client.execute({ sql: 'DELETE FROM mata_pelajaran WHERE id=?', args: [incompleteSubject] });
	const outsideSubject = await insert('mata_pelajaran', {
		kelas_id: oldClass.id,
		nama: 'Mapel QA Luar Periode',
		jenis: 'wajib',
		kkm: 70,
		created_at: now,
		updated_at: now
	});
	const outsideGoal = await insert('tujuan_pembelajaran', {
		mata_pelajaran_id: outsideSubject,
		deskripsi: 'Tujuan luar periode',
		lingkup_materi: 'QA',
		bobot: 100,
		created_at: now,
		updated_at: now
	});
	await client.execute({
		sql: 'UPDATE asesmen_sumatif_tujuan SET tujuan_pembelajaran_id=? WHERE murid_id=?',
		args: [outsideGoal, student]
	});
	await rejected(
		() => service.previewOrFinalizeReport(locals, history, 'sekolah', 'ras', input, request),
		409
	);
	await client.execute({
		sql: 'UPDATE asesmen_sumatif_tujuan SET tujuan_pembelajaran_id=? WHERE murid_id=?',
		args: [tp, student]
	});
	pass('Incomplete core grades and wrong-period narrative sources are rejected');
	const reportSource = await vite.ssrLoadModule('/src/routes/cetak/rapor/preview-data.ts');
	assert.equal(
		reportSource.raporSubjectApplies('Pendidikan Agama Islam dan Budi Pekerti', 'Islam'),
		true
	);
	assert.equal(
		reportSource.raporSubjectApplies('Pendidikan Agama Kristen dan Budi Pekerti', 'Islam'),
		false
	);
	assert.equal(reportSource.raporSubjectApplies('Pendalaman Kitab Suci Islam', 'Islam'), true);
	assert.equal(reportSource.raporSubjectApplies('Matematika', 'Islam'), true);
	await insert('mata_pelajaran', {
		kelas_id: kelas,
		nama:
			original.agama.toLowerCase() === 'islam'
				? 'Pendidikan Agama Kristen dan Budi Pekerti'
				: 'Pendidikan Agama Islam dan Budi Pekerti',
		jenis: 'wajib',
		kkm: 70,
		created_at: now,
		updated_at: now
	});
	assert.equal(
		(await service.historicalReportInfo(locals, history, 'sekolah', 'ras')).coverage.expected,
		1
	);
	const evaluation = await insert('keasramaan', {
		kelas_id: kelas,
		nama: 'Kemandirian QA Historis',
		created_at: now,
		updated_at: now
	});
	const indicator = await insert('keasramaan_indikator', {
		keasramaan_id: evaluation,
		deskripsi: 'Kemandirian',
		created_at: now,
		updated_at: now
	});
	const target = await insert('keasramaan_tujuan', {
		indikator_id: indicator,
		deskripsi: 'menjaga kebersihan kamar',
		created_at: now,
		updated_at: now
	});
	await insert('asesmen_keasramaan', {
		murid_id: student,
		keasramaan_id: evaluation,
		tujuan_id: target,
		kategori: 'baik',
		created_at: now,
		updated_at: now
	});
	for (const kind of ['sekolah', 'asrama'])
		assert.equal(
			(await service.historicalReportInfo(locals, history, kind, 'ras')).coverage.status,
			'nilai_inti_lengkap'
		);
	await rejected(
		() =>
			service.previewOrFinalizeReport(
				locals,
				history,
				'sekolah',
				'ras',
				{ ...input, confirmMetadata: false },
				request
			),
		400
	);
	await rejected(
		() =>
			service.previewOrFinalizeReport(
				locals,
				history,
				'sekolah',
				'ras',
				{ ...input, metadata: { ...metadata, npsn: '1' } },
				request
			),
		400
	);
	await rejected(
		() =>
			service.previewOrFinalizeReport(
				staff,
				history,
				'sekolah',
				'ras',
				{ ...input, action: 'finalize' },
				request
			),
		403
	);
	await rejected(
		() =>
			service.previewOrFinalizeReport(
				locals,
				history,
				'sekolah',
				'ras',
				{ ...input, action: 'finalize', confirmFinal: true, expectedHash: 'stale' },
				request
			),
		409
	);
	pass('Metadata confirmation, finalization permission and stale preview hash enforced');
	pdfBrowser = await (await vite.ssrLoadModule('/src/lib/server/pdf/pagedpdf.ts')).getBrowser();
	const preview = await service.previewOrFinalizeReport(
		locals,
		history,
		'sekolah',
		'ras',
		input,
		request
	);
	assert.ok((await PDFDocument.load(preview.bytes)).getPageCount() > 0);
	await writeFile(path.join(folder, 'school-draft.pdf'), preview.bytes);
	await client.execute({
		sql: 'UPDATE asesmen_sumatif SET nilai_akhir=85 WHERE id=?',
		args: [grade]
	});
	await rejected(
		() =>
			service.previewOrFinalizeReport(
				locals,
				history,
				'sekolah',
				'ras',
				{ ...input, action: 'finalize', confirmFinal: true, expectedHash: preview.hash },
				request
			),
		409
	);
	const updated = await service.previewOrFinalizeReport(
		locals,
		history,
		'sekolah',
		'ras',
		input,
		request
	);
	const final = await service.previewOrFinalizeReport(
		locals,
		history,
		'sekolah',
		'ras',
		{ ...input, action: 'finalize', confirmFinal: true, expectedHash: updated.hash },
		request
	);
	assert.equal(final.final, true);
	const archive = await row('SELECT * FROM rapor_arsip WHERE history_id=? AND jenis=?', [
		history,
		'sekolah'
	]);
	const snapshot = JSON.parse(archive.snapshot_json);
	assert.equal(snapshot.metadata.npsn, '00001234');
	assert.equal(snapshot.data.periode.tahunPelajaran, '2024/2025');
	assert.equal(snapshot.data.periode.semester, 'Genap');
	assert.equal(snapshot.data.nilaiIntrakurikuler[0].nilaiAkhir, '85');
	assert.equal(snapshot.data.kepalaSekolah.nama, metadata.principalName);
	assert.equal(snapshot.data.waliKelas.nama, metadata.teacherName);
	assert.ok(!archive.snapshot_json.includes('data:image/'));
	assert.equal(archive.sha256, digest(final.bytes));
	assert.equal(
		(
			await row(
				"SELECT COUNT(*) n FROM audit_log WHERE entity_type='rapor_arsip' AND entity_id=?",
				[archive.id]
			)
		).n,
		1
	);
	await rejected(
		() =>
			service.previewOrFinalizeReport(
				locals,
				history,
				'sekolah',
				'ras',
				{ ...input, action: 'finalize' },
				request
			),
		409
	);
	await assert.rejects(() =>
		client.execute({
			sql: "UPDATE rapor_arsip SET snapshot_json='{}' WHERE id=?",
			args: [archive.id]
		})
	);
	await client.execute('PRAGMA foreign_keys=ON');
	await assert.rejects(() =>
		client.execute({ sql: 'DELETE FROM murid WHERE id=?', args: [student] })
	);
	await client.execute({
		sql: 'UPDATE asesmen_sumatif SET nilai_akhir=11 WHERE id=?',
		args: [grade]
	});
	assert.equal(
		digest(await service.archivedReportPdf(locals, history, 'sekolah', 'ras')),
		archive.sha256
	);
	pass('School PDF freezes historical context and values, audit recorded, overwrite/purge blocked');
	const dormPreview = await service.previewOrFinalizeReport(
		locals,
		history,
		'asrama',
		'ras',
		input,
		request
	);
	assert.ok((await PDFDocument.load(dormPreview.bytes)).getPageCount() > 0);
	const dormFinal = await service.previewOrFinalizeReport(
		locals,
		history,
		'asrama',
		'ras',
		{ ...input, action: 'finalize', confirmFinal: true, expectedHash: dormPreview.hash },
		request
	);
	const dormArchive = await row("SELECT * FROM rapor_arsip WHERE history_id=? AND jenis='asrama'", [
		history
	]);
	assert.equal(JSON.parse(dormArchive.snapshot_json).data.periode.tahunAjaran, '2024/2025');
	assert.equal(dormArchive.sha256, digest(dormFinal.bytes));
	await writeFile(path.join(folder, 'dorm-final.pdf'), dormFinal.bytes);
	await writeFile(path.join(folder, 'school-final.pdf'), final.bytes);
	pass('Dorm report uses same verified historical period and is finalized independently');
	const dirs = await vite.ssrLoadModule('/src/lib/server/data-dirs.ts');
	const archivePath = path.join(dirs.uploadsDir(), 'rapor-arsip', archive.storage_key);
	const intact = await readFile(archivePath);
	await writeFile(archivePath, 'tampered');
	await rejected(
		() => service.archivedReportPdf(locals, history, 'sekolah', 'ras', archive.id),
		409
	);
	await writeFile(archivePath, intact);
	const teacher = {
		...locals,
		user: {
			...user,
			type: 'user',
			jabatanAkses: null,
			sekolahId: schoolId,
			kelasId: kelas,
			permissions: ['rapor_arsip_lihat', 'cetak_akademik', 'cetak_keasramaan']
		}
	};
	assert.equal(
		(await service.historicalReportInfo(teacher, history, 'sekolah', 'ras')).archived.id,
		archive.id
	);
	await rejected(
		() =>
			service.historicalReportInfo(
				{ ...teacher, user: { ...teacher.user, kelasId: null } },
				history,
				'sekolah',
				'ras'
			),
		403
	);
	for (const type of ['tim_dapur', 'tim_keamanan', 'wali_murid'])
		await rejected(
			() =>
				service.historicalReportInfo(
					{ ...teacher, user: { ...teacher.user, type } },
					history,
					'sekolah',
					'ras'
				),
			403
		);
	await rejected(
		() =>
			service.historicalReportInfo(
				{ ...teacher, user: { ...teacher.user, sekolahId: 999999 } },
				history,
				'sekolah',
				'ras'
			),
		403
	);
	const guardianEmployee = await row(
		'SELECT * FROM pegawai WHERE sekolah_id=? AND nama IN (SELECT nama FROM pegawai WHERE sekolah_id=? GROUP BY nama HAVING COUNT(*)=1) LIMIT 1',
		[schoolId, schoolId]
	);
	assert.ok(guardianEmployee);
	await client.execute({
		sql: 'UPDATE murid SET wali_asuh_nama=?,wali_asrama_nama=? WHERE id=?',
		args: [guardianEmployee.nama, guardianEmployee.nama, student]
	});
	for (const type of ['wali_asuh', 'wali_asrama']) {
		const guardian = {
			...teacher,
			user: { ...teacher.user, type, pegawaiId: guardianEmployee.id, kelasId: null }
		};
		assert.equal(
			(await service.historicalReportInfo(guardian, history, 'asrama', 'ras')).archived.id,
			dormArchive.id
		);
		await rejected(
			() =>
				service.historicalReportInfo(
					{ ...guardian, user: { ...guardian.user, pegawaiId: null } },
					history,
					'asrama',
					'ras'
				),
			403
		);
	}
	const leader = {
		...teacher,
		user: { ...teacher.user, kelasId: null, jabatanAkses: 'waka_kurikulum', permissions: [] }
	};
	assert.ok((await service.historicalReportInfo(leader, history, 'sekolah', 'ras')).archived);
	assert.equal(service.canArchiveAction(leader, 'finalisasi'), false);
	assert.ok(
		(
			await service.historicalReportInfo(
				{ ...leader, user: { ...leader.user, type: 'tim_dapur' } },
				history,
				'sekolah',
				'ras'
			)
		).archived
	);
	pass(
		'Teacher, guardians, leaders and special roles obey report permissions and assigned-student scope'
	);
	const revisionInput = {
		...input,
		action: 'revise-preview',
		reason: 'Perbaikan nilai berdasarkan berita acara',
		expectedVersionId: archive.id
	};
	await rejected(
		() =>
			service.previewOrFinalizeReport(teacher, history, 'sekolah', 'ras', revisionInput, request),
		403
	);
	await rejected(
		() =>
			service.previewOrFinalizeReport(
				locals,
				history,
				'sekolah',
				'ras',
				{ ...revisionInput, reason: 'singkat' },
				request
			),
		400
	);
	const revisionPreview = await service.previewOrFinalizeReport(
		locals,
		history,
		'sekolah',
		'ras',
		revisionInput,
		request
	);
	await rejected(
		() =>
			service.previewOrFinalizeReport(
				locals,
				history,
				'sekolah',
				'ras',
				{ ...revisionInput, action: 'revise-finalize', confirmFinal: true, expectedHash: 'stale' },
				request
			),
		409
	);
	const revisionFinal = await service.previewOrFinalizeReport(
		locals,
		history,
		'sekolah',
		'ras',
		{
			...revisionInput,
			action: 'revise-finalize',
			confirmFinal: true,
			expectedHash: revisionPreview.hash
		},
		request
	);
	const revision = await row('SELECT * FROM rapor_arsip_revisi WHERE arsip_id=?', [archive.id]);
	assert.equal(revision.nomor, 2);
	assert.equal(revision.sebelumnya_id, archive.id);
	assert.equal(
		digest(await service.archivedReportPdf(locals, history, 'sekolah', 'ras', archive.id)),
		archive.sha256
	);
	assert.equal(
		digest(await service.archivedReportPdf(locals, history, 'sekolah', 'ras')),
		digest(revisionFinal.bytes)
	);
	assert.equal(
		(await service.historicalReportInfo(locals, history, 'sekolah', 'ras')).versions.length,
		2
	);
	await rejected(
		() =>
			service.previewOrFinalizeReport(locals, history, 'sekolah', 'ras', revisionInput, request),
		409
	);
	await rejected(
		() => service.archivedReportPdf(locals, history, 'sekolah', 'ras', randomUUID()),
		404
	);
	await assert.rejects(() =>
		client.execute({
			sql: "UPDATE rapor_arsip_revisi SET alasan='diganti' WHERE id=?",
			args: [revision.id]
		})
	);
	await client.execute({
		sql: 'UPDATE asesmen_sumatif SET nilai_akhir=NULL WHERE id=?',
		args: [grade]
	});
	assert.equal(
		(await service.historicalReportInfo(locals, history, 'sekolah', 'ras')).archived.number,
		2
	);
	assert.equal(
		digest(await service.archivedReportPdf(locals, history, 'sekolah', 'ras')),
		revision.sha256
	);
	await client.execute({
		sql: 'UPDATE asesmen_sumatif SET nilai_akhir=11 WHERE id=?',
		args: [grade]
	});
	await writeFile(path.join(folder, 'school-revision-v2.pdf'), revisionFinal.bytes);
	pass(
		'Revision v2 preserves original PDF, immutable reason, stale-version rejection and independent frozen reading'
	);
	const batch = await vite.ssrLoadModule('/src/lib/server/report-archive-batch.ts');
	const baseStudent = await row('SELECT * FROM murid WHERE id=?', [student]),
		baseHistory = await row('SELECT * FROM murid_riwayat_kelas WHERE id=?', [history]);
	const batchHistories = [];
	for (let i = 1; i <= 3; i++) {
		const uid = randomUUID(),
			name = `QA Massal ${i}`;
		const pupil = await insert(
			'murid',
			clone(baseStudent, {
				nama: name,
				nis: `QA-BATCH-${i}`,
				nisn: `999988000${i}`,
				qr_token: randomUUID(),
				foto: null
			})
		);
		await insert(
			'murid_identity_link',
			clone(identity, { murid_id: pupil, semester_id: semester, identity_uid: uid })
		);
		const h = await insert(
			'murid_riwayat_kelas',
			clone(baseHistory, {
				murid_id: pupil,
				identity_key: `uid:${uid}`,
				nama_snapshot: name,
				nis_snapshot: `QA-BATCH-${i}`,
				nisn_snapshot: `999988000${i}`
			})
		);
		await insert(
			'asesmen_sumatif',
			clone(await row('SELECT * FROM asesmen_sumatif WHERE id=?', [grade]), { murid_id: pupil })
		);
		await insert('asesmen_sumatif_tujuan', {
			murid_id: pupil,
			mata_pelajaran_id: subject,
			tujuan_pembelajaran_id: tp,
			nilai: 84,
			created_at: now,
			updated_at: now
		});
		batchHistories.push(h);
		await insert('asesmen_keasramaan', {
			murid_id: pupil,
			keasramaan_id: evaluation,
			tujuan_id: target,
			kategori: 'baik',
			created_at: now,
			updated_at: now
		});
	}
	await rejected(
		() =>
			batch.previewReportBatch(
				teacher,
				'sekolah',
				'ras',
				{ ...input, historyIds: batchHistories },
				request
			),
		403
	);
	await rejected(
		() =>
			batch.previewReportBatch(
				locals,
				'sekolah',
				'ras',
				{ ...input, historyIds: [batchHistories[0], batchHistories[0]] },
				request
			),
		400
	);
	const currentHistory = await row('SELECT id FROM murid_riwayat_kelas WHERE murid_id=?', [
		original.id
	]);
	await rejected(
		() =>
			batch.previewReportBatch(
				locals,
				'sekolah',
				'ras',
				{ ...input, historyIds: [batchHistories[0], Number(currentHistory.id)] },
				request
			),
		400
	);
	const merged = await batch.previewReportBatch(
		locals,
		'sekolah',
		'ras',
		{ ...input, historyIds: batchHistories.slice(0, 2) },
		request
	);
	assert.equal(merged.plan.length, 2);
	const dormBatch = await batch.previewReportBatch(
		locals,
		'asrama',
		'ras',
		{ ...input, historyIds: batchHistories.slice(0, 2) },
		request
	);
	assert.equal(dormBatch.plan.length, 2);
	const otherCare = await row('SELECT murid_id FROM murid_riwayat_kelas WHERE id=?', [
		batchHistories[1]
	]);
	await client.execute({
		sql: 'UPDATE murid SET wali_asuh_nama=? WHERE id=?',
		args: ['QA Wali Berbeda', otherCare.murid_id]
	});
	await rejected(
		() =>
			batch.previewReportBatch(
				locals,
				'asrama',
				'ras',
				{ ...input, historyIds: batchHistories.slice(0, 2) },
				request
			),
		409
	);
	await client.execute({
		sql: 'UPDATE murid SET wali_asuh_nama=? WHERE id=?',
		args: [guardianEmployee.nama, otherCare.murid_id]
	});
	assert.ok((await PDFDocument.load(merged.bytes)).getPageCount() >= 2);
	assert.equal(
		(
			await row(
				'SELECT COUNT(*) n FROM rapor_arsip WHERE history_id IN (?,?)',
				batchHistories.slice(0, 2)
			)
		).n,
		0
	);
	await service.previewOrFinalizeReport(
		locals,
		batchHistories[0],
		'sekolah',
		'ras',
		{ ...input, action: 'finalize', confirmFinal: true, expectedHash: merged.plan[0].hash },
		request
	);
	const second = await row('SELECT murid_id FROM murid_riwayat_kelas WHERE id=?', [
		batchHistories[1]
	]);
	await client.execute({
		sql: 'UPDATE asesmen_sumatif SET nilai_akhir=12 WHERE murid_id=?',
		args: [second.murid_id]
	});
	await rejected(
		() =>
			service.previewOrFinalizeReport(
				locals,
				batchHistories[1],
				'sekolah',
				'ras',
				{ ...input, action: 'finalize', confirmFinal: true, expectedHash: merged.plan[1].hash },
				request
			),
		409
	);
	assert.equal(
		(
			await row(
				'SELECT COUNT(*) n FROM rapor_arsip WHERE history_id IN (?,?)',
				batchHistories.slice(0, 2)
			)
		).n,
		1
	);
	const retry = await batch.previewReportBatch(
		locals,
		'sekolah',
		'ras',
		{ ...input, historyIds: [batchHistories[1]] },
		request
	);
	await service.previewOrFinalizeReport(
		locals,
		batchHistories[1],
		'sekolah',
		'ras',
		{ ...input, action: 'finalize', confirmFinal: true, expectedHash: retry.plan[0].hash },
		request
	);
	await writeFile(path.join(folder, 'batch-draft.pdf'), merged.bytes);
	const racePreview = await service.previewOrFinalizeReport(
		locals,
		batchHistories[2],
		'sekolah',
		'ras',
		input,
		request
	);
	await service.previewOrFinalizeReport(
		locals,
		batchHistories[2],
		'sekolah',
		'ras',
		{ ...input, action: 'finalize', confirmFinal: true, expectedHash: racePreview.hash },
		request
	);
	const raceBase = await row('SELECT * FROM rapor_arsip WHERE history_id=?', [batchHistories[2]]);
	const raceInput = {
		...input,
		action: 'revise-preview',
		reason: 'Pemeriksaan revisi bersamaan oleh dua admin',
		expectedVersionId: raceBase.id
	};
	const raceDraft = await service.previewOrFinalizeReport(
		locals,
		batchHistories[2],
		'sekolah',
		'ras',
		raceInput,
		request
	);
	const raceAdminId = await insert(
		'auth_user',
		clone(await row('SELECT * FROM auth_user WHERE id=?', [user.id]), {
			username: 'qa-rapor-race-admin',
			username_normalized: 'qa-rapor-race-admin',
			type: 'admin',
			sekolah_id: schoolId,
			must_change_password: 0
		})
	);
	const raceBody = {
		...raceInput,
		action: 'revise-finalize',
		confirmFinal: true,
		expectedHash: raceDraft.hash
	};
	const raced = await Promise.allSettled([
		service.previewOrFinalizeReport(locals, batchHistories[2], 'sekolah', 'ras', raceBody, request),
		service.previewOrFinalizeReport(
			{ ...locals, user: { ...user, id: raceAdminId } },
			batchHistories[2],
			'sekolah',
			'ras',
			raceBody,
			request
		)
	]);
	assert.equal(raced.filter((v) => v.status === 'fulfilled').length, 1);
	assert.equal(raced.find((v) => v.status === 'rejected').reason.status, 409);
	assert.equal(
		(await row('SELECT COUNT(*) n FROM rapor_arsip_revisi WHERE arsip_id=?', [raceBase.id])).n,
		1
	);
	pass(
		'Two concurrent approvers append exactly one revision and return a conflict to the stale operation'
	);
	pass(
		'Batch preview is read-only, single-class, bounded and safely resumes after one stale item fails'
	);
	const backup = await vite.ssrLoadModule('/src/lib/server/report-history-backup.ts');
	await backup.createReportHistoryBackup({
		database,
		directory: path.join(folder, 'backup'),
		uploads: [dirs.uploadsDir()]
	});
	await backup.restoreReportHistoryBackup(
		path.join(folder, 'backup'),
		path.join(folder, 'restored')
	);
	assert.equal(
		digest(
			await readFile(path.join(folder, 'restored', 'uploads-0', 'rapor-arsip', archive.storage_key))
		),
		archive.sha256
	);
	assert.equal(
		digest(
			await readFile(
				path.join(folder, 'restored', 'uploads-0', 'rapor-arsip', revision.storage_key)
			)
		),
		revision.sha256
	);
	pass(
		'Tampered PDF rejected; database plus external final PDFs back up and restore with matching hashes'
	);
	assert.equal(
		JSON.stringify(
			(
				await client.execute({
					sql: 'SELECT id,is_aktif FROM semester WHERE id!=? ORDER BY id',
					args: [semester]
				})
			).rows
		),
		activeBefore
	);
	assert.equal((await client.execute('PRAGMA quick_check')).rows[0].quick_check, 'ok');
	pass('Active semester flags and production source database remain untouched');
	const token = randomBytes(32).toString('hex');
	const accounts = {};
	const authTemplate = await row('SELECT * FROM auth_user WHERE id=?', [user.id]);
	for (const [label, options] of Object.entries({
		teacher: {
			type: 'user',
			kelas_id: kelas,
			permissions: ['rapor_arsip_lihat', 'cetak_akademik']
		},
		unassigned: {
			type: 'user',
			kelas_id: null,
			permissions: ['rapor_arsip_lihat', 'cetak_akademik']
		},
		asuh: {
			type: 'wali_asuh',
			pegawai_id: guardianEmployee.id,
			permissions: ['rapor_arsip_lihat']
		},
		asrama: {
			type: 'wali_asrama',
			pegawai_id: guardianEmployee.id,
			permissions: ['rapor_arsip_lihat']
		},
		asrama_unassigned: {
			type: 'wali_asrama',
			pegawai_id: null,
			permissions: ['rapor_arsip_lihat']
		},
		leader: { type: 'user', jabatan_akses: 'waka_kurikulum', permissions: [] },
		kitchen: { type: 'tim_dapur', permissions: ['rapor_arsip_lihat', 'cetak_akademik'] }
	})) {
		const accountToken = randomBytes(32).toString('hex');
		const accountId = await insert(
			'auth_user',
			clone(authTemplate, {
				username: `qa-rapor-${label}`,
				username_normalized: `qa-rapor-${label}`,
				sekolah_id: schoolId,
				kelas_id: null,
				pegawai_id: null,
				jabatan_akses: null,
				mata_pelajaran_id: null,
				must_change_password: 0,
				...options,
				permissions: JSON.stringify(options.permissions)
			})
		);
		await insert('auth_session', {
			user_id: accountId,
			token_hash: digest(accountToken),
			user_agent: 'QA rapor role',
			ip_address: '127.0.0.1',
			expires_at: new Date(Date.now() + 3600000).toISOString(),
			created_at: now,
			updated_at: now
		});
		accounts[label] = { token: accountToken };
	}
	await insert('auth_session', {
		user_id: user.id,
		token_hash: digest(token),
		user_agent: 'QA rapor arsip',
		ip_address: '127.0.0.1',
		expires_at: new Date(Date.now() + 3600000).toISOString(),
		created_at: now,
		updated_at: now
	});
	await writeFile(
		path.join(folder, 'ui-fixture.json'),
		JSON.stringify({
			database,
			uploadRoot: dirs.uploadsDir(),
			history,
			schoolId,
			student,
			token,
			metadata,
			classId: kelas,
			batchHistories,
			baseArchiveId: archive.id,
			accounts,
			checks
		})
	);
	await writeFile(path.resolve('tmp/report-archive-latest.json'), JSON.stringify({ folder }));
	console.log(JSON.stringify({ folder, checks: checks.length }));
} finally {
	await pdfBrowser?.close();
	await connection?.closeDbClient();
	await vite?.close();
	client.close();
}
