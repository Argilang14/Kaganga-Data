import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	illnessEndDate,
	illnessCovers,
	illnessDate,
	canReturnFromIllness,
	illnessNeedsReview,
	illnessLabel,
	latestIllness
} from './attendance-illness.ts';
import { buildMonitoringRows, resolveMonitoringColumns } from './attendance-monitoring.ts';
const period = {
	id: 1,
	muridId: 7,
	tanggalMulai: '2026-10-30',
	tanggalSelesai: '2026-11-01',
	createdAt: '2026-10-30T00:00:00Z',
	kembaliPada: null,
	dibatalkanPada: null
};

test('Three calendar dates include weekend, month/year boundary and leap day', () => {
	assert.equal(illnessEndDate('2026-10-30'), '2026-11-01');
	assert.equal(illnessEndDate('2026-12-31'), '2027-01-02');
	assert.equal(illnessEndDate('2028-02-28'), '2028-03-01');
	assert.throws(() => illnessEndDate('2026-02-30'));
});
test('WIB midnight expiry needs no running scheduler', () => {
	assert.equal(illnessDate('2026-11-01T16:59:59Z'), '2026-11-01');
	assert.equal(illnessDate('2026-11-01T17:00:00Z'), '2026-11-02');
	assert.equal(illnessCovers(period, '2026-11-01', '23:59:59'), true);
	assert.equal(illnessCovers(period, '2026-11-02'), false);
	assert.equal(illnessNeedsReview(period, '2026-11-02'), true);
});
test('Return preserves previous dates and earlier activities without marking future activities present', () => {
	const returned = { ...period, kembaliPada: '2026-10-31T01:00:00Z' };
	assert.equal(illnessCovers(returned, '2026-10-30'), true);
	assert.equal(illnessCovers(returned, '2026-10-31', '07:00'), true);
	assert.equal(illnessCovers(returned, '2026-10-31', '08:00'), false);
	assert.equal(illnessCovers(returned, '2026-10-31'), false);
	assert.equal(illnessLabel(returned, '2026-10-31'), 'Sudah kembali hadir');
});
test('Offline scan cannot finish a newer period or return twice', () => {
	assert.equal(canReturnFromIllness(period, '2026-10-29T23:59:00Z'), false);
	assert.equal(canReturnFromIllness(period, '2026-10-30T01:00:00Z'), true);
	assert.equal(
		canReturnFromIllness(
			{ ...period, kembaliPada: '2026-10-30T01:00:00Z' },
			'2026-10-30T02:00:00Z'
		),
		false
	);
	assert.equal(
		latestIllness([period, { ...period, id: 2, tanggalMulai: '2026-11-01' }], 7, '2026-11-01')?.id,
		2
	);
});
test('Monitoring projects sick only while covered, expiry stays unrecorded, actual entries win', () => {
	const columns = resolveMonitoringColumns('sekolah', [], new URLSearchParams());
	const input = {
		students: [{ id: 7, nama: 'QA', kelasId: 1, kelas: 'X' }],
		columns,
		records: [],
		permits: [],
		illnesses: [period]
	};
	assert.equal(buildMonitoringRows({ ...input, date: '2026-10-31' })[0].cells[0].status, 'sakit');
	const expired = buildMonitoringRows({ ...input, date: '2026-11-02' })[0].cells[0];
	assert.equal(expired.status, 'belum');
	assert.match(expired.illnessLabel!, /berakhir/);
	assert.equal(
		buildMonitoringRows({
			...input,
			date: '2026-10-31',
			records: [
				{
					id: 1,
					muridId: 7,
					kegiatanId: null,
					status: 'hadir',
					waktuScan: null,
					metode: 'qr',
					createdAt: period.createdAt,
					updatedAt: null
				}
			]
		})[0].cells[0].status,
		'hadir'
	);
});
