import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseImportedScore } from './score-import.ts';

test('impor membedakan kosong dan nol serta menerima desimal Indonesia', () => {
	for (const value of [null, undefined, '', '   ']) assert.equal(parseImportedScore(value), null);
	assert.equal(parseImportedScore(0), 0);
	assert.equal(parseImportedScore('0'), 0);
	assert.equal(parseImportedScore('85,25'), 85.25);
	assert.equal(parseImportedScore(100), 100);
});

test('impor menolak angka di luar rentang dan isi nonangka', () => {
	for (const value of [
		-1,
		100.01,
		Infinity,
		NaN,
		'abc',
		true,
		{},
		{ formula: '1+1', result: 2 },
		'0x10',
		'1e2'
	]) {
		assert.throws(() => parseImportedScore(value));
	}
});
