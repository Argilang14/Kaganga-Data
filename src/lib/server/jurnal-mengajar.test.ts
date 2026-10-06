import assert from 'node:assert/strict';
import test from 'node:test';
const { resolveJurnalContext, splitJurnalBlocks } = (await import(
	'../jurnal-mengajar-context' + '.ts'
)) as typeof import('../jurnal-mengajar-context');

const academic = {
	tahunAjaranList: [
		{
			id: 1,
			sekolahId: 1,
			nama: '2026/2027',
			tanggalMulai: '2026-07-01',
			tanggalSelesai: '2027-06-30',
			isAktif: true,
			createdAt: '',
			updatedAt: null,
			semester: [
				{
					id: 10,
					tahunAjaranId: 1,
					tipe: 'ganjil' as const,
					nama: 'Semester Ganjil',
					tanggalMulai: '2026-07-01',
					tanggalSelesai: '2026-12-31',
					tanggalBagiRaport: null,
					tanggalMasuk: null,
					isAktif: true,
					createdAt: '',
					updatedAt: null
				},
				{
					id: 11,
					tahunAjaranId: 1,
					tipe: 'genap' as const,
					nama: 'Semester Genap',
					tanggalMulai: '2027-01-01',
					tanggalSelesai: '2027-06-30',
					tanggalBagiRaport: null,
					tanggalMasuk: null,
					isAktif: false,
					createdAt: '',
					updatedAt: null
				}
			]
		}
	],
	activeTahunAjaranId: 1,
	activeSemesterId: 10,
	activeSemesterTipe: 'ganjil' as const,
	tanggalBagiRaport: {},
	tanggalMasuk: {}
};

test('resolves semester from journal date and allows preparation override', () => {
	assert.equal(resolveJurnalContext({ ...academic, tanggal: '2027-02-03' })?.jenis, 'genap');
	assert.equal(
		resolveJurnalContext({ ...academic, tanggal: '2026-07-03', requestedJenis: 'persiapan' })
			?.jenis,
		'persiapan'
	);
});

test('splits separated subject periods into distinct journal blocks', () => {
	const blocks = splitJurnalBlocks([
		{ id: 1, jamId: null, jamKe: 2 },
		{ id: 2, jamId: null, jamKe: 3 },
		{ id: 3, jamId: null, jamKe: 6 }
	]);
	assert.deepEqual(
		blocks.map((block) => block.map((item) => item.id)),
		[[1, 2], [3]]
	);
});
