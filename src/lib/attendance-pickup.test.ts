import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickupProblem } from './attendance-travel.ts';

test('penjemput dan hubungan wajib terisi termasuk izin lama yang hanya berisi spasi', () => {
	for (const [nama, hubungan] of [
		[null, null],
		['Ibu Ani', ''],
		['', 'Ibu'],
		[' ', 'Ibu'],
		[23, 'Ibu']
	])
		assert.ok(pickupProblem(nama, hubungan));
	assert.equal(pickupProblem('  Ibu Ani  ', 'Ibu kandung'), null);
});
test('panjang nama dan hubungan dibatasi di server', () => {
	assert.ok(pickupProblem('a'.repeat(151), 'Ibu'));
	assert.ok(pickupProblem('Ibu Ani', 'a'.repeat(101)));
	assert.equal(pickupProblem('a'.repeat(150), 'a'.repeat(100)), null);
});
