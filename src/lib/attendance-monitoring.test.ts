import test from 'node:test';
import assert from 'node:assert/strict';
import {
	availableMonitoringTabs,
	resolveMonitoringColumns,
	buildMonitoringRows,
	monitoringCounts,
	permitCoversMonitoring,
	monitoringToday,
	type MonitoringRecord
} from './attendance-monitoring.ts';

const date = '2026-10-05';
const activities = [
	{ id: 1, nama: 'Apel Berangkat', kode: 'apel_berangkat', kategori: 'sekolah', jamMulai: '07:00' },
	{ id: 2, nama: 'Apel Pulang', kode: 'apel_pulang', kategori: 'sekolah', jamMulai: '15:00' },
	{ id: 3, nama: 'Makan Pagi', kode: 'makan_pagi', kategori: 'makan', jamMulai: '06:00' },
	{ id: 4, nama: 'Apel Malam', kode: 'apel_malam', kategori: 'asrama', jamMulai: '21:00' }
];
const students = [
	{ id: 1, nama: 'Murid A', kelasId: 1, kelas: 'X.A' },
	{ id: 2, nama: 'Murid B', kelasId: 1, kelas: 'X.A' }
];
const record = (extra = {}): MonitoringRecord => ({
	id: 1,
	muridId: 1,
	kegiatanId: 1,
	status: 'hadir',
	waktuScan: '2026-10-05T00:00:00Z',
	metode: 'qr',
	updatedAt: null,
	createdAt: '2026-10-05T00:00:00Z',
	...extra
});
const permit = {
	muridId: 2,
	tanggalKeluar: '2026-10-04',
	waktuKeluar: '12:00',
	tanggalKembali: null,
	waktuKembali: null
};

test('default school mapping uses departure/return activities and explicit daily fallback', () => {
	assert.deepEqual(
		resolveMonitoringColumns('sekolah', activities, new URLSearchParams()).map(
			(item) => item.source
		),
		['1', '2']
	);
	assert.equal(resolveMonitoringColumns('sekolah', [], new URLSearchParams())[0].source, 'harian');
	assert.equal(
		resolveMonitoringColumns('sekolah', activities, new URLSearchParams('sumber_masuk=harian'))[0]
			.activityId,
		null
	);
});
test('invalid, foreign and wrong-category sources fail closed', () => {
	for (const source of ['999', '3', 'harian'])
		assert.throws(() =>
			resolveMonitoringColumns(
				'sekolah',
				activities,
				new URLSearchParams(`sumber_pulang=${source}`)
			)
		);
});
test('meal staff receive only meal tab', () => {
	assert.deepEqual(
		availableMonitoringTabs(true).map((item) => item.key),
		['makan']
	);
	assert.equal(availableMonitoringTabs(false).length, 4);
});
test('school, meals and night remain independent; unknowns never become alfa', () => {
	const records = [record({ kegiatanId: 3 })];
	const school = buildMonitoringRows({
		date,
		students,
		records,
		permits: [],
		columns: resolveMonitoringColumns('sekolah', activities, new URLSearchParams())
	});
	assert.deepEqual(
		school[0].cells.map((cell) => cell.status),
		['belum', 'belum']
	);
	const night = buildMonitoringRows({
		date,
		students,
		records,
		permits: [],
		columns: resolveMonitoringColumns('malam', activities, new URLSearchParams())
	});
	assert.equal(night[0].cells[2].status, 'belum');
});
test('each student counted once and duplicate records resolve deterministically', () => {
	const rows = buildMonitoringRows({
		date,
		students: [...students, students[0]],
		permits: [],
		columns: resolveMonitoringColumns('sekolah', activities, new URLSearchParams()),
		records: [record(), record({ id: 2, status: 'sakit', updatedAt: '2026-10-05T01:00:00Z' })]
	});
	assert.equal(rows.length, 2);
	assert.equal(monitoringCounts(rows, 0).sakit, 1);
	assert.equal(monitoringCounts(rows, 0).belum, 1);
	assert.equal(rows[0].cells[1].status, 'belum');
});
test('actual attendance wins over a permit and only missing cells are supplemented', () => {
	const rows = buildMonitoringRows({
		date,
		students,
		permits: [permit, { ...permit, muridId: 1 }],
		records: [record()],
		columns: resolveMonitoringColumns('sekolah', activities, new URLSearchParams())
	});
	assert.equal(rows[0].cells[0].status, 'hadir');
	assert.equal(rows[1].cells[0].status, 'izin_pulang');
	assert.equal(rows[1].cells[0].source, 'izin_pulang');
});
test('permit uses departure/return times and excludes the exact return instant', () => {
	const interval = {
		...permit,
		tanggalKeluar: date,
		waktuKeluar: '12:00',
		tanggalKembali: date,
		waktuKembali: '20:00'
	};
	assert.equal(permitCoversMonitoring(date, '07:00', interval), false);
	assert.equal(permitCoversMonitoring(date, '15:00', interval), true);
	assert.equal(permitCoversMonitoring(date, '20:00', interval), false);
	assert.equal(permitCoversMonitoring(date, '21:00', interval), false);
	assert.equal(permitCoversMonitoring(date, null, interval), false);
	assert.equal(permitCoversMonitoring(date, null, permit), true);
});
test('unknown schedule and departure times never retroactively excuse a partial day', () => {
	assert.equal(
		permitCoversMonitoring(date, '07:00', { ...permit, tanggalKeluar: date, waktuKeluar: null }),
		false
	);
	assert.equal(
		permitCoversMonitoring(date, null, { ...permit, tanggalKeluar: date, waktuKeluar: '12:00' }),
		false
	);
});
test('missing source is distinct from unrecorded and permits do not invent a source', () => {
	const rows = buildMonitoringRows({
		date,
		students,
		records: [],
		permits: [permit],
		columns: resolveMonitoringColumns('sholat', [], new URLSearchParams())
	});
	assert.ok(rows.every((row) => row.cells.every((cell) => cell.status === 'tanpa_sumber')));
});
test('daily attendance is independent of an activity record', () => {
	const rows = buildMonitoringRows({
		date,
		students,
		records: [record(), record({ kegiatanId: null, status: 'izin' })],
		permits: [],
		columns: resolveMonitoringColumns(
			'sekolah',
			activities,
			new URLSearchParams('sumber_masuk=harian')
		)
	});
	assert.equal(rows[0].cells[0].status, 'izin');
});
test('midnight scan remains on the attendance date; monitoring today uses Jakarta', () => {
	const scan = '2026-10-05T17:05:00Z';
	const rows = buildMonitoringRows({
		date,
		students,
		records: [record({ kegiatanId: 4, waktuScan: scan })],
		permits: [],
		columns: resolveMonitoringColumns('malam', activities, new URLSearchParams())
	});
	assert.equal(rows[0].cells[2].time, scan);
	assert.equal(monitoringToday(new Date(scan)), '2026-10-06');
});
