import assert from 'node:assert/strict';
import test from 'node:test';
import {
	monthlyAttendanceIndicators,
	monthlyRecapPeriods,
	type SchoolPermitRecap
} from './attendance-permit-recap.ts';

const student = { id: 1, nama: 'Murid Contoh' };
const period = { start: '2026-10-01', end: '2026-10-31' };
const recap = (): SchoolPermitRecap => ({
	counts: { hadir: 0, terlambat: 0, sakit: 0, izin: 0, alfa: 0 },
	izinPulang: 0,
	durasiPulang: 0,
	belumTercatat: 0,
	belumDiverifikasi: 0,
	perluDiperiksa: 0
});

test('batas bulanan: tiga hari belum muncul, empat hari muncul, alfa satu hari muncul', () => {
	const totals = recap();
	totals.counts.izin = totals.counts.sakit = totals.durasiPulang = totals.belumTercatat = 3;
	assert.deepEqual(monthlyAttendanceIndicators(student, totals, period), []);
	totals.counts.alfa = 1;
	assert.deepEqual(
		monthlyAttendanceIndicators(student, totals, period).map((row) => row.indikator),
		['Alfa']
	);
	totals.counts.izin = totals.counts.sakit = totals.durasiPulang = totals.belumTercatat = 4;
	const rows = monthlyAttendanceIndicators(student, totals, period);
	assert.equal(rows.length, 5);
	assert.equal(
		rows.find((row) => row.indikator.startsWith('Pulang'))?.akumulasi,
		'4 hari kalender'
	);
	assert.equal(rows.find((row) => row.indikator.startsWith('Izin'))?.akumulasi, '4 hari sekolah');
	assert.equal(rows.find((row) => row.indikator === 'Alfa')?.akumulasi, '1 hari sekolah');
	assert.equal(rows.find((row) => row.indikator.startsWith('Presensi'))?.status, 'baru');
	assert.match(
		rows.find((row) => row.indikator.startsWith('Presensi'))!.catatan,
		/bukan alfa otomatis/
	);
});

test('rentang dipisah per bulan, termasuk tahun kabisat dan batas tahun', () => {
	assert.deepEqual(monthlyRecapPeriods('2026-10-30', '2026-11-03'), [
		{ start: '2026-10-30', end: '2026-10-31' },
		{ start: '2026-11-01', end: '2026-11-03' }
	]);
	assert.deepEqual(monthlyRecapPeriods('2024-02-01', '2024-03-01'), [
		{ start: '2024-02-01', end: '2024-02-29' },
		{ start: '2024-03-01', end: '2024-03-01' }
	]);
	assert.deepEqual(monthlyRecapPeriods('2026-12-31', '2027-01-01'), [
		{ start: '2026-12-31', end: '2026-12-31' },
		{ start: '2027-01-01', end: '2027-01-01' }
	]);
	for (const [start, end] of [
		['2026-02-30', '2026-03-01'],
		['2026-11-01', '2026-10-31'],
		['2024-01-01', '2026-01-01']
	])
		assert.throws(() => monthlyRecapPeriods(start, end));
});

test('tindak lanjut harus cocok murid, jenis, dan seluruh periode bulanan', () => {
	const totals = recap();
	totals.counts.alfa = 1;
	const followUp = {
		muridId: 1,
		jenis: 'alfa_berulang',
		periodeMulai: period.start,
		periodeSelesai: period.end,
		status: 'diproses' as const,
		catatan: 'Orang tua sudah dihubungi'
	};
	const [row] = monthlyAttendanceIndicators(student, totals, period, [followUp]);
	assert.equal(row.status, 'diproses');
	assert.equal(row.catatan, followUp.catatan);
	for (const changes of [
		{ muridId: 2 },
		{ jenis: 'sakit_berulang' },
		{ periodeMulai: '2026-09-01' },
		{ periodeSelesai: '2026-10-05' }
	])
		assert.equal(
			monthlyAttendanceIndicators(student, totals, period, [{ ...followUp, ...changes }])[0].status,
			'baru'
		);
});
