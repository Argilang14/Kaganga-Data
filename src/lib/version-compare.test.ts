import assert from 'node:assert/strict';
import test from 'node:test';
import { compareVersions, normalizeVersion } from './version-compare.ts';

test('versi stabil baru dikenali dari instalasi lama maupun beta', () => {
	for (const installed of ['2.1.9', '2.2.1', '2.2.2', '2.2.2-beta.1']) {
		assert.equal(compareVersions('v2.2.3', installed), 1, installed);
	}
	assert.equal(compareVersions('2.2.3', '2.2.3'), 0);
	assert.equal(compareVersions('2.2.2', '2.2.3'), -1);
});

test('beta dan rc berada sebelum versi stabil dengan basis sama', () => {
	assert.equal(compareVersions('2.2.2-beta.1', '2.2.2'), -1);
	assert.equal(compareVersions('2.2.2', '2.2.2-beta.1'), 1);
	assert.equal(compareVersions('2.2.3-rc.1', '2.2.3'), -1);
	assert.equal(compareVersions('2.2.3-beta.10', '2.2.3-beta.2'), 1);
	assert.equal(compareVersions('2.2.3-rc.1', '2.2.3-beta.10'), 1);
});

test('angka versi dibandingkan numerik dan build metadata tidak menaikkan versi', () => {
	assert.equal(compareVersions('2.10.0', '2.9.99'), 1);
	assert.equal(compareVersions('3.0.0', '2.99.99'), 1);
	assert.equal(compareVersions('2.2.3+build.5', '2.2.3+build.1'), 0);
	assert.equal(compareVersions(' V2.2.3 ', 'v2.2.2'), 1);
});

test('versi tidak valid tidak dianggap sebagai pembaruan', () => {
	for (const malformed of ['', 'Latest', '2.2', '2.2.3junk', '2.2.3-beta.01']) {
		assert.equal(compareVersions(malformed, '2.2.2'), -1, malformed);
	}
	assert.equal(compareVersions('2.2.3', 'tidak diketahui'), 1);
	assert.equal(normalizeVersion(null), '0.0.0');
	assert.equal(normalizeVersion(undefined), '0.0.0');
});
