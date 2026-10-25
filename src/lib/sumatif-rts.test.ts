import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateSumatifRts } from './sumatif-rts.ts';

test('RTS memakai lingkup dan STS dengan bobot bawaan atau bobot sekolah', () => {
	assert.equal(calculateSumatifRts(80, 90), 83);
	assert.equal(calculateSumatifRts(80, 90, { lingkup: 40, sts: 60 }), 86);
	assert.equal(calculateSumatifRts(77.25, 89.5), 80.93);
});

test('nilai nol tetap dihitung, sedangkan komponen kosong dinormalisasi', () => {
	assert.equal(calculateSumatifRts(0, 100), 30);
	assert.equal(calculateSumatifRts(80, null), 80);
	assert.equal(calculateSumatifRts(null, 90), 90);
	assert.equal(calculateSumatifRts(null, null), null);
	assert.equal(calculateSumatifRts(80, 90, { lingkup: 0, sts: 0 }), null);
	assert.equal(calculateSumatifRts(80, 90, { lingkup: 100, sts: 0 }), 80);
});
