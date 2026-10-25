import test from 'node:test';
import assert from 'node:assert/strict';
import { travelLocalTime, travelPermitProblem } from './attendance-travel.ts';
import { permitCoversMonitoring, buildMonitoringRows } from './attendance-monitoring.ts';

const now = new Date('2026-10-16T07:00:00.000Z');
const permit = {
	muridId: 1,
	status: 'sedang_izin',
	tanggalKeluar: '2026-10-16',
	waktuKeluar: '12:00',
	rencanaKembali: '2026-10-17',
	waktuRencanaKembali: null,
	tanggalKembali: null,
	waktuKembali: null
};
test('travel timestamps use Jakarta independent of server timezone, including midnight', () => {
	assert.deepEqual(travelLocalTime(now), { date: '2026-10-16', time: '14:00:00' });
	assert.deepEqual(travelLocalTime(new Date('2026-10-16T17:01:02Z')), {
		date: '2026-10-17',
		time: '00:01:02'
	});
});
test('departure requires an open permit within its authorization window', () => {
	assert.equal(travelPermitProblem(permit, 'pulang_ke_rumah', now), null);
	for (const extra of [
		{ status: 'dibatalkan' },
		{ tanggalKembali: '2026-10-16' },
		{ tanggalKeluar: '2026-10-17' },
		{ waktuKeluar: '15:00' },
		{ rencanaKembali: '2026-10-15' },
		{ perjalanan: { keluarPada: now.toISOString(), kembaliPada: null } }
	])
		assert.ok(travelPermitProblem({ ...permit, ...extra }, 'pulang_ke_rumah', now));
});
test('overdue return remains allowed; planned return never closes actual absence', () => {
	const overdue = { ...permit, rencanaKembali: '2026-10-15' };
	assert.equal(travelPermitProblem(overdue, 'kembali_ke_sekolah', now), null);
	assert.equal(permitCoversMonitoring('2026-10-20', '12:00', overdue, now), true);
});

test('a minute-based deadline is not overdue at the exact deadline second', () => {
	const sameMinute = { ...permit, rencanaKembali: '2026-10-16', waktuRencanaKembali: '14:00' };
	assert.equal(travelPermitProblem(sameMinute, 'pulang_ke_rumah', now), null);
	assert.ok(travelPermitProblem(sameMinute, 'pulang_ke_rumah', new Date(now.getTime() + 1000)));
	assert.ok(travelPermitProblem({ ...permit, status: 'sudah_kembali' }, 'kembali_ke_sekolah', now));
});
test('actual departure supersedes planned start and same-day return closes only future events', () => {
	const actual = { ...permit, perjalanan: { keluarPada: now.toISOString(), kembaliPada: null } };
	assert.equal(permitCoversMonitoring('2026-10-16', '13:00', actual, now), false);
	assert.equal(permitCoversMonitoring('2026-10-16', '14:00', actual, now), true);
	const returned = { ...actual, tanggalKembali: '2026-10-16', waktuKembali: '16:00:00' };
	assert.equal(permitCoversMonitoring('2026-10-16', '15:59', returned, now), true);
	assert.equal(permitCoversMonitoring('2026-10-16', '16:00', returned, now), false);
	assert.equal(permitCoversMonitoring('2026-10-17', '06:00', returned, now), false);
});
test('unscheduled current-day cells show current leave; historical unknown times remain conservative', () => {
	assert.equal(permitCoversMonitoring('2026-10-16', null, permit, now), true);
	assert.equal(
		permitCoversMonitoring(
			'2026-10-16',
			null,
			{ ...permit, tanggalKembali: '2026-10-16', waktuKembali: '13:00' },
			now
		),
		false
	);
	assert.equal(
		permitCoversMonitoring('2026-10-16', null, permit, new Date('2026-10-18T00:00:00Z')),
		false
	);
});
test('permit projection preserves actual records and only supersedes automatic alfa', () => {
	const input: Parameters<typeof buildMonitoringRows>[0] = {
		date: '2026-10-17',
		students: [{ id: 1, nama: 'Murid A', kelasId: 1, kelas: 'X.A' }],
		columns: [
			{
				key: 'siang',
				label: 'Makan',
				source: '1',
				sourceLabel: 'Makan',
				activityId: 1,
				time: '12:00'
			}
		],
		permits: [permit],
		records: [
			{
				id: 1,
				muridId: 1,
				kegiatanId: 1,
				status: 'alfa',
				waktuScan: null,
				metode: 'auto',
				updatedAt: null,
				createdAt: ''
			}
		]
	};
	assert.equal(buildMonitoringRows(input)[0].cells[0].status, 'izin_pulang');
	assert.equal(
		buildMonitoringRows({ ...input, records: [{ ...input.records[0], metode: 'manual' }] })[0]
			.cells[0].status,
		'alfa'
	);
});
