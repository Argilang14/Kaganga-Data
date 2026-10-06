import assert from 'node:assert/strict';
import test from 'node:test';
import { pdfFilename, documentPdfFilename, pdfDisposition, responsePdfFilename } from './pdf-filename.ts';
test('report names include student, class, year and document type', () => {
	assert.equal(documentPdfFilename('rapor', { murid: { nama: 'Putra' }, rombel: { nama: 'X.A' }, periode: { tahunPelajaran: '2026/2027' } }), 'Raport - Putra - X.A - 2026-2027.pdf');
});
test('timetable names include academic year rather than a random identifier', () => {
	assert.equal(documentPdfFilename('jadwal-pelajaran', { jenjangLabel: 'SRMA', periode: { tahunPelajaran: '2026/2027', semester: 'Ganjil' } }), 'Jadwal Pelajaran - SRMA - 2026-2027 - Ganjil.pdf');
});
test('filenames strip unsafe characters and preserve unicode through headers', () => {
	assert.equal(pdfFilename('A/B', 'x\r\n"'), 'A-B - x---.pdf');
	const filename = pdfFilename('Raport', 'André');
	assert.equal(responsePdfFilename(new Response('', { headers: { 'content-disposition': pdfDisposition(filename) } })), filename);
});
