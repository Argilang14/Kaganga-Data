import assert from 'node:assert/strict';
import test from 'node:test';
import {
	canDorm,
	dormDate,
	dormId,
	dormStudentIds,
	dormText,
	dormViewHref,
	dormPageHref,
	dormSections,
	dormSectionVisible
} from './dormitory.ts';

test('asrama: validasi tanggal kalender, ID, teks dan batas batch', () => {
	assert.equal(dormDate('2026-10-31', '2026-10-31'), '2026-10-31');
	for (const date of ['2026-02-30', '2026-13-01', '2026-11-01', '2026-1-02'])
		assert.throws(() => dormDate(date, '2026-10-31'));
	for (const id of ['', null, '-1', '1.5', '1e2', '9007199254740999'])
		assert.throws(() => dormId(id));
	assert.equal(dormId('0', true), 0);
	assert.deepEqual(dormStudentIds(['3', '2', '3']), [2, 3]);
	assert.throws(() => dormStudentIds([]));
	assert.throws(() => dormStudentIds(Array.from({ length: 101 }, (_, i) => i + 1)));
	assert.equal(dormText('  Kamar   Satu  '), 'Kamar Satu');
	assert.throws(() => dormText(''));
});
test('asrama: wali hanya baca bawaan, mutasi membutuhkan izin, tenant diperiksa server', () => {
	for (const type of ['wali_asuh', 'wali_asrama']) {
		assert.ok(canDorm({ type }, 'lihat'));
		assert.equal(canDorm({ type }, 'penempatan'), false);
	}
	assert.equal(canDorm({ type: 'user' }, 'lihat'), false);
	assert.ok(canDorm({ type: 'admin' }, 'penugasan'));
	assert.ok(canDorm({ type: 'user', permissions: ['asrama_penempatan'] }, 'penempatan'));
	assert.equal(canDorm({ type: 'admin', mustChangePassword: true }, 'manage'), false);
	assert.equal(canDorm({ type: 'user', jabatanAkses: 'waka_humas' }, 'manage'), false);
	assert.equal(canDorm({ type: 'admin', jabatanAkses: 'waka_humas' }, 'manage'), true);
});
test('asrama: konteks tampilan tidak mengubah kelas, nilai, atau penempatan', () => {
	assert.equal(dormViewHref('/asesmen-sumatif', '?kelas_id=4', 2), '/asrama/penghuni?kamar_id=2');
	const link = new URL(
		dormViewHref(
			'/administrasi/absensi/monitoring',
			'?kelas_id=4&jenjang=sma&tanggal=2026-10-31&tab=asrama&page=3',
			2
		),
		'http://localhost'
	);
	assert.equal(link.searchParams.get('tanggal'), '2026-10-31');
	assert.equal(link.searchParams.get('tab'), 'asrama');
	assert.equal(link.searchParams.get('kelas_id'), null);
	assert.equal(link.searchParams.get('jenjang'), null);
	assert.equal(link.searchParams.get('page'), null);
	assert.equal(link.searchParams.get('kamar_id'), '2');
});

test('asrama: halaman dan tautan lama dipetakan tanpa mengubah filter atau izin', () => {
	assert.equal(dormSections.length, 6);
	assert.equal(
		dormPageHref('pemetaan', 'view=pemetaan&kamar_id=4&q=A&page=2'),
		'/asrama/penempatan?kamar_id=4&q=A&page=2'
	);
	assert.equal(dormPageHref('tidak-valid'), '/asrama/kamar');
	const warden = { type: 'wali_asrama', permissions: [] };
	assert.deepEqual(
		dormSections.filter((s) => dormSectionVisible(warden, s.key)).map((s) => s.key),
		['kamar', 'penghuni', 'penugasan']
	);
	assert.equal(dormSectionVisible({ type: 'admin' }, 'gedung'), true);
	assert.equal(dormSectionVisible({ type: 'user' }, 'penghuni'), false);
	assert.equal(
		dormViewHref('/asrama/kamar', '?kelas_id=1&view=kamar&page=3', 4),
		'/asrama/penghuni?kamar_id=4'
	);
});
