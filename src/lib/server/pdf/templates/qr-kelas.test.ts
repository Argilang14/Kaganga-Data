import test from 'node:test';
import assert from 'node:assert/strict';
import { renderClassQrHTML } from './qr-kelas.ts';

test('class QR PDF groups four cards per A4 page and escapes identities', () => {
	for (const count of [1, 4, 5, 9]) {
		const html = renderClassQrHTML({
			sekolahNama: '<script>school</script>',
			contextLabel: '2026/2027 & Ganjil',
			cards: Array.from({ length: count }, (_, index) => ({
				nama: `Kelas ${index} <img>`,
				image: 'data:image/png;base64,abc'
			}))
		});
		assert.equal((html.match(/<section class="qr-sheet">/g) ?? []).length, Math.ceil(count / 4));
		assert.equal((html.match(/<article class="qr-card">/g) ?? []).length, count);
		assert.ok(!html.includes('<script>'));
		assert.ok(html.includes('&#60;img&#62;'));
		assert.ok(html.includes('size:A4 portrait'));
	}
});
