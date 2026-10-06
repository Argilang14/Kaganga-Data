import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	attendanceKegiatanSearch,
	attendanceKegiatanAction
} from './attendance-kegiatan-filters.ts';

test('tanggal lama, kelas dan kegiatan tetap ada untuk semua aksi absensi', () => {
	const filters = { tanggal: '2026-08-03', kelasId: 42, kegiatanId: 7 };
	for (const action of ['updateManual', 'bulkUpdateManual', 'clearStatus'] as const) {
		const url = new URL(
			attendanceKegiatanAction(action, filters),
			'http://localhost/administrasi/absensi/kegiatan'
		);
		assert.ok(url.searchParams.has(`/${action}`));
		assert.equal(url.searchParams.get('tanggal'), filters.tanggal);
		assert.equal(url.searchParams.get('kelas_id'), '42');
		assert.equal(url.searchParams.get('kegiatan_id'), '7');
		assert.equal([...url.searchParams.keys()].filter((key) => key.startsWith('/')).length, 1);
	}
});

test('filter aktual tetap dibawa saat pengguna hanya mengganti satu pilihan', () => {
	const params = attendanceKegiatanSearch({ tanggal: '2026-08-03', kelasId: 42, kegiatanId: 7 });
	params.set('kelas_id', '43');
	assert.equal(params.get('tanggal'), '2026-08-03');
	assert.equal(params.get('kegiatan_id'), '7');
	assert.equal(params.get('kelas_id'), '43');
});

test('pilihan kosong tidak mengirim id null atau id palsu', () => {
	const params = attendanceKegiatanSearch({
		tanggal: '2026-08-03',
		kelasId: null,
		kegiatanId: null
	});
	assert.equal(params.toString(), 'tanggal=2026-08-03');
});
