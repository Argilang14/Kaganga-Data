import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scanReceipt } from './attendance-scan-result.ts';

const record = {
	status: 'hadir',
	waktuScan: '2026-10-14T00:15:00Z',
	petugasUserId: 11,
	metode: 'qr'
};
test('scan ulang menampilkan petugas/waktu pertama tanpa mengganti status', () => {
	const result = scanReceipt(record, true, 'Guru A');
	assert.equal(result.code, 'already_present');
	assert.match(result.message, /Sudah dipindai oleh Guru A/);
	assert.match(result.message, /07[.:]15/);
	assert.equal(result.waktuScan, record.waktuScan);
	assert.deepEqual(result.petugas, { id: 11, nama: 'Guru A' });
});
test('catatan manual sakit tidak dianggap scan baru dan tidak diberi waktu palsu', () => {
	const result = scanReceipt(
		{ ...record, status: 'sakit', metode: 'manual', waktuScan: null },
		true,
		null
	);
	assert.match(result.message, /Sudah tercatat/);
	assert.match(result.message, /Status sakit/);
	assert.equal(result.waktuScan, null);
	assert.equal(result.petugas, null);
});
test('scan baru dilaporkan berhasil, berbeda dengan duplikat', () => {
	assert.equal(scanReceipt(record, false, 'Guru A').code, 'success');
});
