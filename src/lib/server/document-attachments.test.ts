import assert from 'node:assert/strict';
import test from 'node:test';
import { detectAttachment } from './document-attachments.ts';

test('mendeteksi PDF dari signature, bukan nama saja', () => {
	assert.equal(detectAttachment(Buffer.from('%PDF-1.7 test'), 'application/pdf', 'surat.pdf')?.mime, 'application/pdf');
	assert.equal(detectAttachment(Buffer.from('bukan pdf'), 'application/pdf', 'surat.pdf'), null);
});

test('menolak konten HTML yang menyamar sebagai gambar', () => {
	assert.equal(detectAttachment(Buffer.from('<html>'), 'image/png', 'foto.png'), null);
});
