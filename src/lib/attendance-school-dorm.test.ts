import test from 'node:test';
import assert from 'node:assert/strict';
import {
	buildMonitoringRows,
	resolveMonitoringColumns,
	normalizeMonitoringTab,
	type MonitoringRecord
} from './attendance-monitoring.ts';
import {
	connectSchoolDormRows,
	summarizeSchoolDorm,
	matchesSchoolDormFilter
} from './attendance-school-dorm.ts';

const date = '2026-10-05';
const activities = [
	{ id: 1, kode: 'apel_berangkat', nama: 'Masuk Sekolah', kategori: 'sekolah', jamMulai: '07:00' },
	{ id: 2, kode: 'apel_pulang', nama: 'Pulang Sekolah', kategori: 'sekolah', jamMulai: '15:00' },
	{
		id: 3,
		kode: 'asrama_berangkat',
		nama: 'Berangkat Asrama',
		kategori: 'asrama',
		jamMulai: '06:30'
	},
	{ id: 4, kode: 'asrama_tiba', nama: 'Tiba Asrama', kategori: 'asrama', jamMulai: '15:30' },
	{ id: 5, kode: 'apel_malam', nama: 'Apel Malam', kategori: 'asrama', jamMulai: '21:00' }
];
const columns = [
	...resolveMonitoringColumns('sekolah', activities, new URLSearchParams()),
	...resolveMonitoringColumns('asrama', activities, new URLSearchParams())
];
const student = { id: 1, nama: 'Murid A', kelasId: 1, kelas: 'X.A' };
function record(
	kegiatanId: number,
	status = 'hadir',
	waktuScan: string | null = null
): MonitoringRecord {
	return {
		id: kegiatanId,
		muridId: 1,
		kegiatanId,
		status,
		waktuScan,
		metode: waktuScan ? 'qr' : 'manual',
		createdAt: '2026-10-05T01:00:00Z',
		updatedAt: null
	};
}
function rows(
	records: MonitoringRecord[] = [],
	permits: Parameters<typeof buildMonitoringRows>[0]['permits'] = []
) {
	return buildMonitoringRows({ date, columns, students: [student], records, permits });
}
test('old night link resolves to dorm with three separate sources', () => {
	assert.equal(normalizeMonitoringTab('malam'), 'asrama');
	assert.deepEqual(
		resolveMonitoringColumns('malam', activities, new URLSearchParams()).map((c) => c.key),
		['asrama_berangkat', 'asrama_tiba', 'apel_malam']
	);
});
test('departure does not invent arrival, alfa or night attendance; original rows immutable', () => {
	const original = rows([record(3)]);
	const before = JSON.stringify(original);
	const connected = connectSchoolDormRows(original, columns);
	assert.equal(connected[0].journeys[0].status, 'menunggu');
	assert.equal(connected[0].cells[0].status, 'belum');
	assert.equal(connected[0].cells[4].status, 'belum');
	assert.equal(JSON.stringify(original), before);
	assert.deepEqual(summarizeSchoolDorm(connected), { toSchool: 1, toDorm: 0, review: 0 });
	assert.ok(matchesSchoolDormFilter(connected[0].journeys, 'menunggu_sekolah'));
});
test('school and dorm return are separate; arrival without departure remains visible', () => {
	const connected = connectSchoolDormRows(rows([record(1), record(2)]), columns)[0];
	assert.equal(connected.journeys[0].status, 'tiba');
	assert.match(connected.journeys[0].note, /belum tercatat/);
	assert.equal(connected.journeys[1].status, 'menunggu');
	assert.equal(connected.cells[3].status, 'belum');
	const complete = connectSchoolDormRows(
		rows([record(1), record(2), record(3), record(4)]),
		columns
	)[0];
	assert.ok(complete.journeys.every((j) => j.status === 'tiba'));
});
test('sick and permitted absences share only a paired missing cell, not another session', () => {
	for (const [origin, target] of [
		[1, 2],
		[3, 0],
		[2, 3],
		[4, 1]
	]) {
		for (const status of ['sakit', 'izin']) {
			const linked = connectSchoolDormRows(rows([record(origin, status)]), columns)[0];
			assert.equal(linked.cells[target].status, status);
			assert.equal(linked.cells[target].source, 'terhubung');
			assert.ok(linked.cells[target].linkedFrom);
			assert.equal(linked.cells[4].status, 'belum');
			assert.equal(linked.cells.filter((c) => c.status === status).length, 2);
		}
	}
});
test('alfa not copied; conflicts do not overwrite actual records', () => {
	assert.equal(
		connectSchoolDormRows(rows([record(3, 'alfa')]), columns)[0].cells[0].status,
		'belum'
	);
	for (const [first, second] of [
		['sakit', 'hadir'],
		['sakit', 'izin'],
		['alfa', 'hadir']
	]) {
		const connected = connectSchoolDormRows(
			rows([record(3, first), record(1, second)]),
			columns
		)[0];
		assert.equal(connected.cells[2].status, first);
		assert.equal(connected.cells[0].status, second);
		assert.equal(connected.journeys[0].status, 'periksa');
		assert.match(connected.journeys[0].note, /Berangkat dari Asrama/);
		assert.match(connected.journeys[0].note, /Masuk Sekolah/);
	}
});
test('incorrect time order needs review; missing clocks never assume lateness', () => {
	const connected = connectSchoolDormRows(
		rows([record(3, 'hadir', '2026-10-05T01:00:00Z'), record(1, 'hadir', '2026-10-05T00:00:00Z')]),
		columns
	)[0];
	assert.equal(connected.journeys[0].status, 'periksa');
	assert.equal(
		connectSchoolDormRows(rows([record(3), record(1)]), columns)[0].journeys[0].status,
		'tiba'
	);
});
test('home permit stays time bounded and return-school is not home permission', () => {
	const permit = {
		muridId: 1,
		tanggalKeluar: date,
		waktuKeluar: '12:00',
		tanggalKembali: date,
		waktuKembali: '20:00'
	};
	const connected = connectSchoolDormRows(rows([record(3), record(2)], [permit]), columns)[0];
	assert.equal(connected.cells[0].status, 'belum');
	assert.equal(connected.cells[3].status, 'izin_pulang');
	assert.equal(connected.cells[4].status, 'belum');
	assert.equal(connected.journeys[0].status, 'menunggu');
	assert.equal(connected.journeys[1].status, 'keterangan');
});
test('unconfigured source produces no false travel alarm or absence copy', () => {
	const missing = columns.map((c) => (c.key === 'masuk' ? { ...c, source: '' } : c));
	const connected = connectSchoolDormRows(rows([record(3, 'sakit')]), missing);
	assert.equal(connected[0].journeys[0].status, 'tanpa_sumber');
	assert.equal(connected[0].cells[0].status, 'belum');
	assert.deepEqual(summarizeSchoolDorm(connected), { toSchool: 0, toDorm: 0, review: 0 });
});
test('a corrected latest record recomputes without leaving copied sickness behind', () => {
	const connected = connectSchoolDormRows(
		rows([record(3, 'sakit'), { ...record(3), id: 99, updatedAt: '2026-10-05T02:00:00Z' }]),
		columns
	)[0];
	assert.equal(connected.cells[0].status, 'belum');
	assert.equal(connected.journeys[0].status, 'menunggu');
});
