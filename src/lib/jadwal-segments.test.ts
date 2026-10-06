import assert from 'node:assert/strict';
import test from 'node:test';
import type { JadwalMergeCell } from './jadwal-segments';

const { buildJadwalSegments } = (await import(
	'./jadwal-segments' + '.ts'
)) as typeof import('./jadwal-segments');

function cell(overrides: Partial<JadwalMergeCell> = {}): JadwalMergeCell {
	const row = overrides.row ?? 1;
	const column = overrides.column ?? 0;
	return {
		key: overrides.key ?? 'senin|' + row + '|' + column,
		hari: 'senin',
		row,
		column,
		group: 'srd',
		kode: 'BIND',
		kind: 'mapel',
		mergeIdentity: 'guru:1',
		...overrides
	};
}

test('mapel berurutan dengan guru yang sama menjadi satu blok 3 JP', () => {
	const cells = [1, 2, 3].map((row) => cell({ key: 'mapel-' + row, row }));
	const segments = buildJadwalSegments(cells);
	const segment = segments.get('mapel-1');

	assert.ok(segment);
	assert.equal(segment.anchorKey, 'mapel-1');
	assert.equal(segment.rowSpan, 3);
	assert.equal(segment.colSpan, 1);
	assert.deepEqual(segment.cellKeys, ['mapel-1', 'mapel-2', 'mapel-3']);
	assert.strictEqual(segments.get('mapel-2'), segment);
	assert.strictEqual(segments.get('mapel-3'), segment);
});

test('mapel tidak digabung jika guru berbeda atau terdapat celah baris', () => {
	const segments = buildJadwalSegments([
		cell({ key: 'jam-1', row: 1 }),
		cell({ key: 'jam-2', row: 2, mergeIdentity: 'guru:2' }),
		cell({ key: 'jam-4', row: 4 })
	]);

	assert.equal(segments.get('jam-1')?.rowSpan, 1);
	assert.equal(segments.get('jam-2')?.rowSpan, 1);
	assert.equal(segments.get('jam-4')?.rowSpan, 1);
});

test('mapel tidak digabung melewati baris kegiatan atau istirahat', () => {
	const segments = buildJadwalSegments([
		cell({ key: 'bind-1', row: 1 }),
		cell({ key: 'bind-2', row: 2 }),
		cell({
			key: 'istirahat',
			row: 3,
			kode: 'ISTIRAHAT',
			kind: 'kegiatan',
			mergeIdentity: 'ISTIRAHAT'
		}),
		cell({ key: 'bind-4', row: 4 })
	]);

	assert.equal(segments.get('bind-1')?.rowSpan, 2);
	assert.strictEqual(segments.get('bind-2'), segments.get('bind-1'));
	assert.equal(segments.get('istirahat')?.rowSpan, 1);
	assert.equal(segments.get('bind-4')?.rowSpan, 1);
});

test('kegiatan berurutan dalam satu jenjang menjadi satu blok mendatar', () => {
	const cells = [0, 1, 2].map((column) =>
		cell({
			key: 'upacara-' + column,
			column,
			kode: 'UPACARA',
			kind: 'kegiatan',
			mergeIdentity: 'UPACARA'
		})
	);
	const segments = buildJadwalSegments(cells);
	const segment = segments.get('upacara-0');

	assert.ok(segment);
	assert.equal(segment.anchorKey, 'upacara-0');
	assert.equal(segment.rowSpan, 1);
	assert.equal(segment.colSpan, 3);
	assert.deepEqual(segment.cellKeys, ['upacara-0', 'upacara-1', 'upacara-2']);
});

test('kegiatan tidak digabung melewati celah kolom atau batas jenjang', () => {
	const segments = buildJadwalSegments([
		cell({ key: 'srd-0', column: 0, kode: 'UPACARA', kind: 'kegiatan' }),
		cell({ key: 'srd-2', column: 2, kode: 'UPACARA', kind: 'kegiatan' }),
		cell({ key: 'srmp-0', column: 0, group: 'srmp', kode: 'UPACARA', kind: 'kegiatan' })
	]);

	assert.equal(segments.get('srd-0')?.colSpan, 1);
	assert.equal(segments.get('srd-2')?.colSpan, 1);
	assert.equal(segments.get('srmp-0')?.colSpan, 1);
});

test('kegiatan memenuhi kelas yang berurutan tetapi berhenti tepat di batas jenjang', () => {
	const segments = buildJadwalSegments([
		...['iv', 'v', 'vi'].map((key, column) =>
			cell({ key, column, kode: 'UPACARA', kind: 'kegiatan', mergeIdentity: 'UPACARA' })
		),
		...['vii-a', 'vii-b'].map((key, column) =>
			cell({
				key,
				column,
				group: 'srmp',
				kode: 'UPACARA',
				kind: 'kegiatan',
				mergeIdentity: 'UPACARA'
			})
		)
	]);

	assert.equal(segments.get('iv')?.colSpan, 3);
	assert.deepEqual(segments.get('iv')?.cellKeys, ['iv', 'v', 'vi']);
	assert.equal(segments.get('vii-a')?.colSpan, 2);
	assert.deepEqual(segments.get('vii-a')?.cellKeys, ['vii-a', 'vii-b']);
});
