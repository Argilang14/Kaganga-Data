import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildMeetingKey,
	classMonitoringCapabilities,
	isStrictLocalDate,
	monitoringState,
	splitClassMonitoringMeetings
} from './class-monitoring.ts';

test('strict local dates reject normalized invalid dates', () => {
	assert.equal(isStrictLocalDate('2026-02-28'), true);
	assert.equal(isStrictLocalDate('2026-02-30'), false);
	assert.equal(isStrictLocalDate('2026-2-03'), false);
});

test('teacher defaults and explicit monitoring permissions are scoped', () => {
	assert.deepEqual(classMonitoringCapabilities({ type: 'user', permissions: [] }), {
		canView: true,
		canScan: true,
		canManage: false
	});
	assert.equal(
		classMonitoringCapabilities({ type: 'wali_asuh', permissions: ['class_monitoring_lihat'] })
			.canScan,
		false
	);
	assert.equal(
		classMonitoringCapabilities({ type: 'user', permissions: ['class_monitoring_manage'] })
			.canManage,
		true
	);
});

test('meeting grouping never crosses teacher, template, subject, or a slot gap', () => {
	const base = {
		templateId: 7,
		kelasId: 3,
		guruPegawaiId: 11,
		mapelKey: 'm:5',
		pukulMulai: '08:00:00',
		pukulSelesai: '08:45:00'
	};
	const groups = splitClassMonitoringMeetings([
		{ ...base, id: 1, jamKe: 1 },
		{ ...base, id: 2, jamKe: 2, pukulMulai: '08:45:00', pukulSelesai: '09:30:00' },
		{ ...base, id: 3, jamKe: 4 },
		{ ...base, id: 4, jamKe: 5, guruPegawaiId: 12 },
		{ ...base, id: 5, jamKe: 6, templateId: 8 }
	]);
	assert.deepEqual(
		groups.map((group) => group.map((row) => row.id)),
		[[1, 2], [3], [4], [5]]
	);
	assert.equal(buildMeetingKey({ templateId: 7, kelasId: 3, scheduleIds: [2, 1] }), '7:3:1.2');
});

test('status keeps excused distinct from presence and follows local schedule time', () => {
	const base = { date: '2026-10-13', start: '09:00:00', end: '10:00:00', nowDate: '2026-10-13' };
	assert.equal(monitoringState({ ...base, nowTime: '08:59:59' }), 'forthcoming');
	assert.equal(monitoringState({ ...base, nowTime: '09:30:00' }), 'running');
	assert.equal(monitoringState({ ...base, nowTime: '10:00:01' }), 'ended');
	assert.equal(monitoringState({ ...base, nowTime: '09:30:00', scannedAt: 'x' }), 'present');
	assert.equal(monitoringState({ ...base, nowTime: '09:30:00', absenceReason: 'izin' }), 'excused');
});
