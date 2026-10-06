import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const templates = [
	'jadwal-pelajaran.ts',
	'kalender-pendidikan.ts',
	'jurnal-mengajar.ts',
	'martikulasi.ts'
];

test('seluruh dokumen SR yang ditentukan memakai renderer kop sekolah bersama', () => {
	for (const template of templates) {
		const source = readFileSync(new URL(template, import.meta.url), 'utf8');
		assert.match(source, /renderSchoolLetterhead\(/, template);
		assert.match(source, /schoolLetterheadStyles\(/, template);
	}
});

test('tiga dokumen Martikulasi memakai satu fungsi kop yang sama', () => {
	const source = readFileSync(new URL('martikulasi.ts', import.meta.url), 'utf8');
	assert.match(source, /renderSkMartikulasiHTML[\s\S]*head\(input\.school\)/);
	assert.match(source, /renderRaportMartikulasiHTML[\s\S]*head\(school\)/);
	assert.match(source, /renderSttmMartikulasiHTML[\s\S]*head\(school\)/);
});
