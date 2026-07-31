import assert from 'node:assert/strict';
import test from 'node:test';
import type { JadwalSlotLike } from './jadwal-slots';

const {
	buildJpNumberBySlot,
	canPlaceJadwalItem,
	jadwalSlotKey,
	normalizeJadwalKode,
	normalizeJadwalKegiatanKode
} = (await import('./jadwal-slots' + '.ts')) as typeof import('./jadwal-slots');

test('normalizes schedule codes consistently', () => {
	assert.equal(normalizeJadwalKode('  sholat_dhuha '), 'SHOLAT_DHUHA');
	test('normalizes activity aliases to one canonical code', () => {
		assert.equal(normalizeJadwalKegiatanKode('Sholat Dhuha'), 'SHOLAT_DHUHA');
		assert.equal(normalizeJadwalKegiatanKode('sholat-duha'), 'SHOLAT_DHUHA');
		assert.equal(normalizeJadwalKegiatanKode('salat dhuha'), 'SHOLAT_DHUHA');
	});
});

test('only lesson slots receive sequential JP numbers', () => {
	const slots: JadwalSlotLike[] = [
		{ jenjang: 'srd', hari: 'senin', jamKe: 1, tipe: 'kegiatan' },
		{ jenjang: 'srd', hari: 'senin', jamKe: 2, tipe: 'pelajaran' },
		{ jenjang: 'srd', hari: 'senin', jamKe: 3, tipe: 'istirahat' },
		{ jenjang: 'srd', hari: 'senin', jamKe: 4, tipe: 'pelajaran' }
	];
	const numbers = buildJpNumberBySlot(slots);
	assert.deepEqual(
		slots.map((slot) => numbers.get(jadwalSlotKey(slot))),
		[null, 1, null, 2]
	);
});

test('duplicate template slots do not multiply JP numbers', () => {
	const slots: JadwalSlotLike[] = [
		{ jenjang: 'srma', hari: 'senin', jamKe: 1, tipe: 'pelajaran' },
		{ jenjang: 'srma', hari: 'senin', jamKe: 1, tipe: 'pelajaran' },
		{ jenjang: 'srma', hari: 'senin', jamKe: 2, tipe: 'pelajaran' },
		{ jenjang: 'srma', hari: 'senin', jamKe: 2, tipe: 'pelajaran' },
		{ jenjang: 'srma', hari: 'senin', jamKe: 3, tipe: 'istirahat' },
		{ jenjang: 'srma', hari: 'senin', jamKe: 4, tipe: 'pelajaran' }
	];
	const numbers = buildJpNumberBySlot(slots);
	assert.equal(numbers.get('srma|senin|1'), 1);
	assert.equal(numbers.get('srma|senin|2'), 2);
	assert.equal(numbers.get('srma|senin|3'), null);
	assert.equal(numbers.get('srma|senin|4'), 3);
});

test('only activities can occupy non-JP slots', () => {
	assert.equal(canPlaceJadwalItem('pelajaran', 'mapel'), true);
	assert.equal(canPlaceJadwalItem('kegiatan', 'mapel'), false);
	assert.equal(canPlaceJadwalItem('istirahat', 'mapel'), false);
	assert.equal(canPlaceJadwalItem('kegiatan', 'kegiatan'), true);
});
