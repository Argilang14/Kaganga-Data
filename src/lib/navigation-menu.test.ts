import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	allowedNavigationFavorites,
	navigationLeaves,
	visibleNavigation
} from './navigation-menu.ts';
import { dormSections } from './dormitory.ts';

const items: MenuItem[] = [
	{
		title: 'Umum',
		subMenu: [
			{ title: 'Murid', path: '/murid' },
			{ title: 'Pengguna', path: '/pengguna' }
		]
	},
	{ title: 'Akhir', path: '/status-akhir', condition: 'genap' }
];
test('menu semester dan izin sama untuk daftar, pencarian, favorit, dan dock', () => {
	const admin = { id: 1, type: 'admin', permissions: [] } as unknown as AuthUser;
	assert.equal(navigationLeaves(visibleNavigation(items, admin, 'ganjil')).length, 2);
	assert.equal(navigationLeaves(visibleNavigation(items, admin, 'genap')).length, 3);
	const teacher = { id: 2, type: 'user', permissions: [] } as unknown as AuthUser;
	assert.deepEqual(
		navigationLeaves(visibleNavigation(items, teacher, 'ganjil')).map((item) => item.path),
		['/murid']
	);
	const favorites = ['/murid', '/pengguna', '/status-akhir', 'https://example.com', '/unknown'].map(
		(path) => ({ path, userId: 2 })
	);
	assert.deepEqual(
		allowedNavigationFavorites(favorites, items, teacher, 'ganjil').map((item) => item.path),
		['/murid']
	);
	assert.deepEqual(allowedNavigationFavorites(favorites, items, admin, 'genap'), []);
	assert.deepEqual(visibleNavigation(items, null, 'genap'), []);
});

test('sidebar asrama membagi halaman dan mempertahankan pembatasan wali', () => {
	const dorm: MenuItem[] = [
		{
			title: 'Data Asrama',
			permission: 'asrama_lihat',
			subMenu: dormSections.map((s) => ({ title: s.menu, path: `/asrama/${s.slug}` }))
		}
	];
	const warden = { type: 'wali_asrama', permissions: [] } as unknown as AuthUser;
	assert.deepEqual(
		navigationLeaves(visibleNavigation(dorm, warden, 'ganjil')).map((i) => i.path),
		['/asrama/kamar', '/asrama/penghuni', '/asrama/penugasan']
	);
	assert.equal(
		navigationLeaves(
			visibleNavigation(dorm, { type: 'admin', permissions: [] } as unknown as AuthUser, 'ganjil')
		).length,
		6
	);
	assert.equal(
		visibleNavigation(dorm, { type: 'user', permissions: [] } as unknown as AuthUser, 'ganjil')
			.length,
		0
	);
});
