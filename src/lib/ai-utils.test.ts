import assert from 'node:assert/strict';
import test from 'node:test';
const { parseGeneratedTpPayload, validateAiBaseUrl } = (await import(
	'./ai-utils' + '.ts'
)) as typeof import('./ai-utils');

test('Base URL AI wajib HTTPS dan menolak jaringan lokal', () => {
	assert.equal(validateAiBaseUrl('https://generativelanguage.googleapis.com').valid, true);
	assert.equal(validateAiBaseUrl('http://example.com').valid, false);
	assert.equal(validateAiBaseUrl('https://127.0.0.1:9000').valid, false);
	assert.equal(validateAiBaseUrl('https://192.168.1.2/v1').valid, false);
});

test('payload AI dibatasi dan dinormalisasi sebelum masuk pratinjau', () => {
	const groups = parseGeneratedTpPayload(
		JSON.stringify({
			lingkupMateri: [
				{ nama: ' Bilangan ', tujuanPembelajaran: [' memahami bilangan. ', 'membandingkan'] },
				{ nama: 'Diabaikan', tujuanPembelajaran: ['tidak masuk'] }
			]
		}),
		{ maxGroups: 1, maxItemsPerGroup: 1 }
	);
	assert.deepEqual(groups, [{ lingkupMateri: 'Bilangan', deskripsi: ['memahami bilangan'] }]);
});
