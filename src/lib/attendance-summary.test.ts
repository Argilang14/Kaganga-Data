import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	buildAttendanceSummary,
	inferSummaryLevel,
	isSummaryDate,
	type SummaryStatus
} from './attendance-summary.ts';

const base = {
	tanggal: '2026-10-02',
	kegiatan: 'Apel Berangkat',
	cakupan: 'kelas' as const,
	classes: [{ id: 1, nama: 'X.A', jenjang: 'sma' as const }],
	students: [
		'Hadir',
		'Terlambat',
		'Sakit',
		'Izin',
		'Alfa',
		'Izin Pulang',
		'Belum Scan',
		'Pulang Biasa'
	].map((nama, index) => ({ id: index + 1, nama, kelasId: 1 })),
	attendance: ['hadir', 'terlambat', 'sakit', 'izin', 'alfa', 'pulang']
		.map((status, index) => ({ muridId: index + 1, status: status as SummaryStatus }))
		.concat([{ muridId: 8, status: 'pulang' }]),
	permitStudentIds: [6],
	generatedAt: '2026-10-02T00:30:00Z'
};

test('format per kelas mengikuti contoh dan Jumat dihitung tanpa ketergantungan timezone host', () => {
	const result = buildAttendanceSummary(base);
	assert.match(result.text, /Rekap kehadiran kelas X.A\nHari Jum'at, 2\/10\/2026/);
	assert.deepEqual(result.totals, { jumlah: 8, hadir: 2, tidakHadir: 4, belum: 2 });
	assert.match(result.text, /Sakit \(s\)/);
	assert.match(result.text, /Izin \(i\)/);
	assert.match(result.text, /Alfa \(a\)/);
	assert.match(result.text, /Izin Pulang \(p\)/);
	assert.match(result.text, /Belum tercatat : 2/);
	assert.match(result.text, /07\.30/);
});
test('status Pulang biasa bukan otomatis tidak hadir dan menghasilkan peringatan', () => {
	const result = buildAttendanceSummary(base);
	assert.match(result.text, /Pulang Biasa \(status pulang perlu konfirmasi\)/);
	assert.ok(result.warnings.some((item) => item.includes('belum memiliki catatan izin pulang')));
});
test('catatan sakit dan izin menggantikan belum tercatat tanpa input ulang', () => {
	const result = buildAttendanceSummary({
		...base,
		attendance: [...base.attendance, { muridId: 7, status: 'sakit' }]
	});
	assert.equal(result.totals.belum, 1);
	assert.match(result.text, /Belum Scan \(s\)/);
});
test('hadir eksplisit tidak ditimpa oleh catatan izin pulang lama', () => {
	const result = buildAttendanceSummary({ ...base, permitStudentIds: [1, 6] });
	assert.equal(result.totals.hadir, 2);
});
test('murid duplikat tidak menggandakan jumlah dan murid di luar kelas tidak ikut dihitung', () => {
	const result = buildAttendanceSummary({
		...base,
		students: [...base.students, base.students[0], { id: 99, nama: 'Luar Cakupan', kelasId: 99 }]
	});
	assert.equal(result.totals.jumlah, 8);
	assert.ok(!result.text.includes('Luar Cakupan'));
});
test('seluruh jenjang diurut SD SMP SMA dan kelas tanpa jenjang tidak hilang', () => {
	const result = buildAttendanceSummary({
		...base,
		cakupan: 'semua',
		classes: [
			...base.classes,
			{ id: 2, nama: 'IV.A', jenjang: 'sd' },
			{ id: 3, nama: 'VII.A', jenjang: 'smp' },
			{ id: 4, nama: 'Kelas Persiapan', jenjang: 'unknown' }
		]
	});
	assert.deepEqual(
		result.classes.map((item) => item.jenjang),
		['sd', 'smp', 'sma', 'unknown']
	);
	assert.match(result.text, /Kelas Persiapan\nJml : 0/);
	assert.equal(result.warnings.filter((item) => item.includes('Jenjang kelas')).length, 1);
});
test('per jenjang dan anak binaan mendapat judul yang tidak menyesatkan', () => {
	assert.match(
		buildAttendanceSummary({ ...base, cakupan: 'jenjang', jenjang: 'sma' }).text,
		/jenjang SMA/
	);
	assert.match(
		buildAttendanceSummary({ ...base, restrictedStudents: true }).text,
		/anak binaan sesuai penugasan/
	);
});
test('nama dengan baris baru tidak dapat menyisipkan baris status baru', () => {
	const result = buildAttendanceSummary({
		...base,
		students: [{ id: 3, nama: 'Nama\nTOTAL\nPalsu', kelasId: 1 }]
	});
	assert.match(result.text, /Nama TOTAL Palsu \(s\)/);
});
test('validasi tanggal menolak tanggal mustahil', () => {
	for (const value of ['2026-02-30', '2026-13-02', 'tanggal', ''])
		assert.equal(isSummaryDate(value), false);
	assert.equal(isSummaryDate('2026-10-02'), true);
	assert.throws(() => buildAttendanceSummary({ ...base, tanggal: '2026-02-30' }));
});
test('jenjang SRT mengikuti fase atau tingkat kelas tanpa menebak SMA', () => {
	for (const nama of ['I.A', 'II.A', 'VI.A', 'Kelas 1 A'])
		assert.equal(inferSummaryLevel({ nama }, 'srt'), 'sd');
	assert.equal(inferSummaryLevel({ nama: 'VII.B' }, 'srt'), 'smp');
	assert.equal(inferSummaryLevel({ nama: 'XI IPA 1' }, 'srt'), 'sma');
	assert.equal(inferSummaryLevel({ nama: 'Kelas Biru', fase: 'Fase D' }, 'srt'), 'smp');
	assert.equal(inferSummaryLevel({ nama: 'Kelas Biru' }, 'srt'), 'unknown');
	assert.equal(inferSummaryLevel({ nama: 'Kelas Biru' }, 'sd'), 'sd');
});
