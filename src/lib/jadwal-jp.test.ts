import assert from 'node:assert/strict';
import test from 'node:test';

const { calculateWeeklyJp, summarizeWeeklyJp, summarizeWeeklyJpBySubject } = (await import(
	'./jadwal-jp' + '.ts'
)) as typeof import('./jadwal-jp');

const classes = [
	{ id: 1, nama: 'IV', jenjang: 'srd' },
	{ id: 2, nama: 'VII.A', jenjang: 'srmp' }
];
const targets = [
	{ kode: 'BIND', nama: 'Bahasa Indonesia', jenjang: 'semua', jpPerMinggu: 2 },
	{ kode: 'GEO', nama: 'Geografi', jenjang: 'srma', jpPerMinggu: 3 }
];
const slots = [
	{ hari: 'senin', jamKe: 1, jenjang: 'srd', tipe: 'pelajaran', aktif: true },
	{ hari: 'senin', jamKe: 2, jenjang: 'srd', tipe: 'kegiatan', aktif: true },
	{ hari: 'selasa', jamKe: 1, jenjang: 'srd', tipe: 'pelajaran', aktif: true },
	{ hari: 'senin', jamKe: 1, jenjang: 'srmp', tipe: 'pelajaran', aktif: true },
	{ hari: 'selasa', jamKe: 1, jenjang: 'srmp', tipe: 'pelajaran', aktif: false }
];

test('menghitung JP per kelas dan hanya pada slot pelajaran aktif', () => {
	const result = calculateWeeklyJp({
		classes,
		targets,
		slots,
		entries: [
			{ hari: 'senin', jamKe: 1, kelasId: 1, kode: 'BIND' },
			{ hari: 'senin', jamKe: 2, kelasId: 1, kode: 'BIND' },
			{ hari: 'selasa', jamKe: 1, kelasId: 1, kode: 'BIND' },
			{ hari: 'senin', jamKe: 1, kelasId: 2, kode: 'BIND' },
			{ hari: 'selasa', jamKe: 1, kelasId: 2, kode: 'BIND' }
		]
	});

	assert.deepEqual(
		result.map(({ kelas, kode, actual, target, status }) => ({
			kelas,
			kode,
			actual,
			target,
			status
		})),
		[
			{ kelas: 'IV', kode: 'BIND', actual: 2, target: 2, status: 'tepat' },
			{ kelas: 'VII.A', kode: 'BIND', actual: 1, target: 2, status: 'kurang' }
		]
	);
});

test('mendeteksi beban lebih dan meringkas status', () => {
	const results = calculateWeeklyJp({
		classes: [classes[0]],
		targets: [{ ...targets[0], jpPerMinggu: 1 }],
		slots,
		entries: [
			{ hari: 'senin', jamKe: 1, kelasId: 1, kode: 'BIND' },
			{ hari: 'selasa', jamKe: 1, kelasId: 1, kode: 'BIND' }
		]
	});

	assert.equal(results[0].status, 'lebih');
	assert.equal(results[0].difference, 1);
	assert.deepEqual(summarizeWeeklyJp(results), { kurang: 0, tepat: 0, lebih: 1 });
});

test('target khusus kelas menggantikan target default termasuk nilai nol', () => {
	const result = calculateWeeklyJp({
		classes: [classes[0], { id: 3, nama: 'V', jenjang: 'srd' }],
		targets: [
			{ ...targets[0], jpPerMinggu: 4 },
			{ ...targets[0], kelasId: 1, jpPerMinggu: 2 },
			{ ...targets[0], kelasId: 3, jpPerMinggu: 0 }
		],
		slots,
		entries: [{ hari: 'senin', jamKe: 1, kelasId: 1, kode: 'BIND' }]
	});

	assert.deepEqual(
		result.map(({ kelasId, target }) => ({ kelasId, target })),
		[{ kelasId: 1, target: 2 }]
	);
});

test('ringkasan mapel menjumlahkan sisa JP, bukan jumlah kelas', () => {
	const summary = summarizeWeeklyJpBySubject([
		{
			kelasId: 1,
			kelas: 'X.A',
			jenjang: 'srma',
			kode: 'GEO',
			nama: 'Geografi',
			target: 5,
			actual: 3,
			difference: -2,
			status: 'kurang'
		},
		{
			kelasId: 2,
			kelas: 'X.B',
			jenjang: 'srma',
			kode: 'GEO',
			nama: 'Geografi',
			target: 5,
			actual: 4,
			difference: -1,
			status: 'kurang'
		}
	]).get('GEO');

	assert.deepEqual(summary, {
		kode: 'GEO',
		nama: 'Geografi',
		actual: 7,
		target: 10,
		kurangJp: 3,
		lebihJp: 0,
		kurangKelas: 2,
		tepatKelas: 0,
		lebihKelas: 0
	});
});
