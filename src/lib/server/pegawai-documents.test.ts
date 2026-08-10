import assert from 'node:assert/strict';
import test from 'node:test';
const { PEGAWAI_DOCUMENT_MAX_BYTES, safeDocumentFilename, validatePegawaiDocument } = (await import(
	'./pegawai-documents' + '.ts'
)) as typeof import('./pegawai-documents');

test('menerima dokumen PDF, PNG, dan JPEG dengan signature yang benar', async () => {
	const pdf = new File([Buffer.from('%PDF-1.7\n')], 'dokumen.pdf', { type: 'application/pdf' });
	const png = new File([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0])], 'foto.png', {
		type: 'image/png'
	});
	const jpeg = new File([Buffer.from([0xff, 0xd8, 0xff, 0xd9])], 'foto.jpg', {
		type: 'image/jpeg'
	});

	assert.equal((await validatePegawaiDocument(pdf)).extension, '.pdf');
	assert.equal((await validatePegawaiDocument(png)).extension, '.png');
	assert.equal((await validatePegawaiDocument(jpeg)).extension, '.jpg');
});

test('menolak tipe, signature, dan ukuran dokumen yang tidak valid', async () => {
	const text = new File(['data'], 'dokumen.txt', { type: 'text/plain' });
	const fakePdf = new File(['bukan pdf'], 'dokumen.pdf', { type: 'application/pdf' });
	const oversized = new File([new Uint8Array(PEGAWAI_DOCUMENT_MAX_BYTES + 1)], 'besar.pdf', {
		type: 'application/pdf'
	});

	await assert.rejects(validatePegawaiDocument(text), /PDF, JPG, atau PNG/);
	await assert.rejects(validatePegawaiDocument(fakePdf), /tidak valid/);
	await assert.rejects(validatePegawaiDocument(oversized), /maksimal 2 MB/);
});

test('hanya menerima nama file tunggal yang aman', () => {
	assert.equal(safeDocumentFilename('pegawai-1.pdf'), 'pegawai-1.pdf');
	assert.equal(safeDocumentFilename('../pegawai-1.pdf'), null);
	assert.equal(safeDocumentFilename('folder/pegawai-1.pdf'), null);
	assert.equal(safeDocumentFilename(null), null);
});
