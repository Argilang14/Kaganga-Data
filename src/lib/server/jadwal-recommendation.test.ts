import assert from 'node:assert/strict';
import test from 'node:test';
import { buildScheduleRecommendations } from './jadwal-recommendation.ts';

test('rekomendasi mengisi kekurangan tanpa bentrok guru atau kelas', () => {
	const result = buildScheduleRecommendations({
		classes: [
			{ id: 1, nama: 'X.A', jenjang: 'srma' },
			{ id: 2, nama: 'X.B', jenjang: 'srma' }
		],
		subjects: [
			{
				id: 10,
				kode: 'GEO',
				nama: 'Geografi',
				jenjang: 'srma',
				guruPegawaiId: 7,
				target: 2
			}
		],
		slots: [
			{ hari: 'senin', jamKe: 1, jenjang: 'srma' },
			{ hari: 'senin', jamKe: 2, jenjang: 'srma' },
			{ hari: 'selasa', jamKe: 1, jenjang: 'srma' },
			{ hari: 'selasa', jamKe: 2, jenjang: 'srma' },
			{ hari: 'rabu', jamKe: 1, jenjang: 'srma' }
		],
		entries: [],
		unavailable: [{ pegawaiId: 7, hari: 'senin', jamKe: 1 }]
	});

	assert.equal(result.proposals.length, 4);
	assert.equal(result.unresolved.length, 0);
	const teacherSlots = result.proposals.map((item) => `${item.hari}|${item.jamKe}`);
	assert.equal(new Set(teacherSlots).size, teacherSlots.length);
	assert.ok(teacherSlots.every((slot) => slot !== 'senin|1'));
});

test('rekomendasi melaporkan target yang tidak memperoleh slot aman', () => {
	const result = buildScheduleRecommendations({
		classes: [{ id: 1, nama: 'VII.A', jenjang: 'srmp' }],
		subjects: [
			{
				id: 20,
				kode: 'IPA',
				nama: 'IPA',
				jenjang: 'srmp',
				guruPegawaiId: 8,
				target: 2
			}
		],
		slots: [{ hari: 'senin', jamKe: 1, jenjang: 'srmp' }],
		entries: [{ kelasId: 1, hari: 'senin', jamKe: 1, kode: 'BIND', guruPegawaiId: 9 }],
		unavailable: []
	});

	assert.equal(result.proposals.length, 0);
	assert.deepEqual(result.unresolved.map((item) => item.missing), [2]);
});
