import assert from 'node:assert/strict';
import test from 'node:test';
import {
	semesterLeaders,
	semesterHighlights,
	consistentAttendance,
	configuredHolidays
} from './dashboard-achievements.ts';

const score = (id: number, value: number | null, count = 2) => ({
	id,
	nama: `Murid ${id}`,
	nilaiRataRata: value,
	jumlahMapelDinilai: count,
	totalMapelRelevan: 2
});
test('incomplete class grades never establish a ranking; zero is a valid grade', () => {
	assert.equal(semesterLeaders([score(1, 90), score(2, 50, 1)]).complete, false);
	assert.deepEqual(semesterLeaders([score(1, null)]).rows, []);
	assert.equal(semesterLeaders([score(1, 0)]).rows[0].nilaiRataRata, 0);
	assert.equal(semesterLeaders([]).complete, false);
});
test('ties share competition ranks and all tied third-place students are included', () => {
	assert.deepEqual(
		semesterLeaders([
			score(1, 95),
			score(2, 90),
			score(3, 80),
			score(4, 80),
			score(5, 70)
		]).rows.map((r) => r.peringkat),
		[1, 2, 3, 3]
	);
});
const days = ['2026-10-01', '2026-10-02', '2026-10-05'];
test('highlights keep one representative per level, exclude incomplete grades and preserve ties', () => {
	const kelas = (id: number, jenjang: string, value: number, complete = true) => ({
		id,
		jenjang,
		nama: `Kelas ${id}`,
		complete,
		rows: [{ ...score(id, value), peringkat: 1 }]
	});
	const highlights = semesterHighlights([
		kelas(1, 'sd', 90),
		kelas(2, 'sd', 95),
		kelas(3, 'smp', 80),
		kelas(4, 'sma', 99, false),
		kelas(5, 'sma', 75),
		kelas(6, 'sd', 95)
	]);
	assert.deepEqual(
		highlights.map((row) => row.student?.id),
		[2, 3, 5]
	);
	assert.equal(highlights[0].tied, 2);
	assert.equal(highlights[2].incompleteClasses, 1);
	assert.equal(semesterHighlights([kelas(1, 'sma', 99, false)])[0].student, null);
	assert.equal(semesterHighlights([kelas(1, 'unknown', 99)]).length, 0);
});
test('attendance requires every expected school day; no record is not present', () => {
	assert.equal(consistentAttendance(days, new Map(), '2026-07-01'), 'incomplete');
	assert.equal(
		consistentAttendance(days, new Map(days.map((d) => [d, 'hadir'])), '2026-07-01'),
		'consistent'
	);
	assert.equal(
		consistentAttendance(days, new Map(days.map((d) => [d, 'hadir'])), '2026-10-02'),
		'partial_month'
	);
	assert.equal(consistentAttendance([], new Map(), '2026-07-01'), 'no_days');
	assert.equal(
		consistentAttendance(days, new Map(days.map((d) => [d, 'hadir'])), ''),
		'partial_month'
	);
});
test('sick, permission, alfa and home leave exclude consistency; lateness remains recorded presence', () => {
	for (const status of ['sakit', 'izin', 'alfa', 'pulang', 'izin_pulang'])
		assert.equal(
			consistentAttendance(days, new Map(days.map((d) => [d, status])), '2026-07-01'),
			'absent'
		);
	assert.equal(
		consistentAttendance(days, new Map(days.map((d) => [d, 'terlambat'])), '2026-07-01'),
		'consistent'
	);
});
test('configured holidays support dates and ranges and tolerate invalid legacy JSON', () => {
	assert.deepEqual(
		[
			...configuredHolidays(
				['["2026-10-01"]', '[{"start":"2026-10-02","end":"2026-10-05"}]', 'bad'],
				days
			)
		],
		days
	);
});
