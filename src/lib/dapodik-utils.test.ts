import assert from 'node:assert/strict';
import test from 'node:test';

const {
	collectDapodikPembelajaran,
	collectDapodikExtracurricular,
	dapodikDeterministicUuid,
	dapodikNilaiSelectionKey,
	dapodikPembelajaranKey,
	normalizeDapodikDescription,
	normalizeDapodikScore,
	normalizeWebServiceUrl,
	parseDapodikSemesterId,
	uniqueDapodikPembelajaran
} = (await import('./dapodik-utils' + '.ts')) as typeof import('./dapodik-utils');

test('URL WebService Dapodik dinormalisasi tanpa menggandakan path', () => {
	assert.equal(normalizeWebServiceUrl('192.168.1.10:5774'), 'http://192.168.1.10:5774/WebService');
	assert.equal(
		normalizeWebServiceUrl('http://localhost:5774/WebService/'),
		'http://localhost:5774/WebService'
	);
});

test('ID pengiriman nilai stabil dan berbeda untuk seed berbeda', () => {
	const first = dapodikDeterministicUuid('kaganga-nilai:1:2:3');
	assert.equal(first, dapodikDeterministicUuid('kaganga-nilai:1:2:3'));
	assert.notEqual(first, dapodikDeterministicUuid('kaganga-nilai:1:2:4'));
	assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('nilai Dapodik hanya menerima angka 0 sampai 100 dan dibulatkan dua desimal', () => {
	assert.equal(normalizeDapodikScore(87.456), 87.46);
	assert.equal(normalizeDapodikScore(0), 0);
	assert.equal(normalizeDapodikScore(100), 100);
	assert.equal(normalizeDapodikScore(-1), null);
	assert.equal(normalizeDapodikScore(101), null);
	assert.equal(normalizeDapodikScore(Number.NaN), null);
	assert.equal(dapodikNilaiSelectionKey(12, 34), '12:34');
});

test('deskripsi nilai Dapodik dirapikan dan dibatasi 300 karakter', () => {
	assert.equal(
		normalizeDapodikDescription('  Mampu memahami\nkonsep dasar.  '),
		'Mampu memahami konsep dasar.'
	);
	assert.equal(normalizeDapodikDescription('Belum ada penilaian sumatif.'), null);
	assert.equal(normalizeDapodikDescription('x'.repeat(350))?.length, 300);
});

test('URL dengan kredensial tertanam ditolak', () => {
	assert.throws(() => normalizeWebServiceUrl('http://user:password@localhost:5774'));
});

test('ID semester Dapodik dipetakan ke tahun ajaran dan tipe semester', () => {
	assert.deepEqual(parseDapodikSemesterId('20261'), {
		year: 2026,
		tipe: 'ganjil',
		namaTahun: '2026/2027'
	});
	assert.deepEqual(parseDapodikSemesterId('20262'), {
		year: 2026,
		tipe: 'genap',
		namaTahun: '2026/2027'
	});
	assert.equal(parseDapodikSemesterId('20263'), null);
});

test('pembelajaran hanya dikumpulkan dari rombel reguler beserta sub mapel', () => {
	const result = collectDapodikPembelajaran([
		{
			jenis_rombel: 1,
			rombongan_belajar_id: 'kelas-a',
			nama: 'VII.A',
			pembelajaran: [
				{
					pembelajaran_id: 'pb-1',
					mata_pelajaran_id: 100,
					nama_mata_pelajaran: 'Bahasa Indonesia',
					sub_mapel: [{ pembelajaran_id: 'pb-1a', nama: 'Bahasa Indonesia Lanjutan' }]
				}
			]
		},
		{
			jenis_rombel: 51,
			rombongan_belajar_id: 'ekskul',
			pembelajaran: [{ pembelajaran_id: 'pb-x', nama: 'Pramuka' }]
		}
	]);
	assert.deepEqual(
		result.map(({ pembelajaranId, nama }) => ({ pembelajaranId, nama })),
		[
			{ pembelajaranId: 'pb-1', nama: 'Bahasa Indonesia' },
			{ pembelajaranId: 'pb-1a', nama: 'Bahasa Indonesia Lanjutan' }
		]
	);
});

test('kunci pembelajaran stabil dan payload ganda diproses satu kali', () => {
	const item = {
		rombelId: 'kelas-a',
		kelasNama: 'VII.A',
		pembelajaranId: 'pb-1',
		nama: 'Matematika',
		row: { pembelajaran_id: 'pb-1', nama: 'Matematika' }
	};
	assert.equal(dapodikPembelajaranKey('kelas-a', 'pb-1'), 'kelas-a|pb-1');
	assert.deepEqual(uniqueDapodikPembelajaran([item, structuredClone(item)]), [item]);
});

test('ekstrakurikuler hanya dibaca dari rombel tipe 51 beserta anggotanya', () => {
	const result = collectDapodikExtracurricular([
		{ jenis_rombel: 1, nama: 'VII.A' },
		{
			jenis_rombel: 51,
			nm_ekskul: 'Pramuka',
			anggota_rombel: [{ peserta_didik_id: 'murid-1' }]
		},
		{ jenis_rombel: 51, nama: '' }
	]);
	assert.equal(result.length, 1);
	assert.equal(result[0].nama, 'Pramuka');
	assert.deepEqual(result[0].members, [{ peserta_didik_id: 'murid-1' }]);
});
