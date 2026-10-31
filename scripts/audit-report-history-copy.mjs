import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { auditReportHistory } from '../src/lib/server/report-history-audit.ts';
import {
	createReportHistoryBackup,
	restoreReportHistoryBackup
} from '../src/lib/server/report-history-backup.ts';

const args = process.argv.slice(2);
const value = (name) => {
	const i = args.indexOf(name);
	return i < 0 ? null : args[i + 1];
};
const database = value('--database');
if (!database)
	throw new Error(
		'Gunakan --database <SQLite> --uploads <folder unggahan>. Tidak ada database default.'
	);
const uploads = args.flatMap((arg, index) => (arg === '--uploads' ? [args[index + 1]] : []));
if (!uploads.length || uploads.some((v) => !v || v.startsWith('--')))
	throw new Error('Folder --uploads wajib disebutkan secara eksplisit.');
const base = path.resolve(value('--output') || 'dist/backups/report-history');
const source = path.resolve(database);
if (base === source || base.startsWith(source + path.sep))
	throw new Error('Folder output tidak valid.');
const schoolId = value('--school') ? Number(value('--school')) : undefined;
if (schoolId !== undefined && (!Number.isSafeInteger(schoolId) || schoolId < 1))
	throw new Error('ID sekolah tidak valid.');
await mkdir(base, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const folder = path.join(base, `audit-${stamp}`);
console.log('Membuat snapshot SQLite dan menyalin berkas unggahan...');
const backup = await createReportHistoryBackup({ database: source, directory: folder, uploads });
console.log('Memeriksa snapshot tanpa migrasi atau perubahan identitas...');
const snapshot = createClient({ url: `file:${backup.database}` });
let report;
try {
	report = await auditReportHistory(snapshot, { schoolId });
} finally {
	snapshot.close();
}
const restored = await restoreReportHistoryBackup(folder, path.join(folder, 'qa-restore'));
const qa = createClient({ url: `file:${restored.database}` });
try {
	const repeated = await auditReportHistory(qa, { schoolId });
	assert.deepEqual(repeated, report, 'Data hasil salinan pemulihan berbeda dari snapshot.');
} finally {
	qa.close();
}
const output = {
	...report,
	generatedAt: new Date().toISOString(),
	scope: 'Snapshot database lokal yang disebutkan; bukan pemeriksaan PC sekolah jarak jauh.',
	backup: {
		directory: folder,
		sha256: backup.manifest.databaseSha256,
		files: backup.manifest.files.length,
		bytes: backup.manifest.files.reduce((n, f) => n + f.bytes, 0),
		references: backup.manifest.references.length,
		unavailableReferences: backup.manifest.references.filter((r) => r.status !== 'ok'),
		complete: backup.manifest.complete,
		copyRestore: {
			verified: true,
			database: restored.database,
			files: restored.files,
			note: 'Pemulihan ke direktori QA baru dan audit ulang; tidak memulihkan atau mengganti database operasional.'
		}
	}
};
await writeFile(path.join(folder, 'audit.json'), JSON.stringify(output, null, 2), { flag: 'wx' });
const md = [
	'# Audit riwayat pendidikan dan kelengkapan nilai',
	'',
	`Waktu: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB.`,
	'Cakupan: database lokal yang disebutkan pada perintah. Data PC sekolah belum diperiksa.',
	'',
	'## Backup dan pengujian',
	`- Integritas SQLite: ${report.integrity}; pelanggaran foreign key: ${report.foreignKeyViolations}.`,
	`- Berkas disalin dan diperiksa hash: ${output.backup.files} (${output.backup.bytes} byte).`,
	`- Referensi berkas bermasalah: ${output.backup.unavailableReferences.length}; backup lengkap terhadap referensi yang diperiksa: ${output.backup.complete ? 'ya' : 'belum'}.`,
	'- Salinan pemulihan QA: checksum database/berkas sesuai, hasil audit sama dengan snapshot.',
	'- Database operasional tidak dimigrasikan, digabung, dipulihkan, atau diubah oleh alat ini.',
	'',
	'## Identitas dan riwayat',
	`- Baris murid: ${report.summary.students}; identitas internal: ${report.summary.internalIdentities}.`,
	`- Identitas dengan data lebih dari satu semester: ${report.summary.multiPeriodIdentities}.`,
	`- Baris perlu pemeriksaan identitas: ${report.summary.identityReview}; relasi/konteks perlu diperiksa: ${report.summary.relationshipReview}.`,
	`- Riwayat tanpa data murid sumber: ${report.summary.snapshotsOnly}.`,
	`- NISN kosong/tidak valid: ${report.summary.missingOrInvalidNisn}. UID tetap menjadi kunci; tidak digabung melalui NIS/NISN.`,
	`- Catatan status berkunci lama (bukan UID): ${report.summary.legacyLifecycleRows}. Tidak dipasangkan otomatis ke murid saat ini.`,
	'',
	'## Kelengkapan per periode',
	'| Sekolah ID | Tahun ajaran | Semester | Murid | RTS tanpa nilai | RAS tanpa nilai | Asrama tanpa nilai |',
	'|---|---|---|---:|---:|---:|---:|',
	...report.periods.map(
		(p) =>
			`| ${p.schoolId} | ${p.year} | ${p.semester} | ${p.students} | ${p.academicRts.data_tidak_tersedia} | ${p.academicRas.data_tidak_tersedia} | ${p.dorm.data_tidak_tersedia} |`
	),
	'',
	'## Batas penilaian',
	...report.limitations.map((v) => `- ${v}`),
	'- Periode dengan 0 murid bukan bukti rapor hilang; tidak ada sumber murid untuk dinilai pada snapshot ini.',
	'- Nilai inti lengkap dihitung terhadap seluruh mapel kelas/tujuan asrama, bukan persetujuan kelengkapan seluruh komponen rapor.',
	'- Laporan rinci berada pada audit.json. Tidak ada tombol rapor, finalisasi, atau perubahan UI pada tahap 1-4.',
	''
].join('\n');
await writeFile(path.join(folder, 'ringkasan.md'), md, { flag: 'wx' });
console.log(
	JSON.stringify(
		{
			directory: folder,
			summary: report.summary,
			periods: report.periods,
			backup: output.backup,
			integrity: report.integrity
		},
		null,
		2
	)
);
if (report.integrity !== 'ok' || report.foreignKeyViolations || !backup.manifest.complete)
	process.exitCode = 2;
