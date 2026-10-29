import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const directory = path.resolve('tmp', `print-signatures-${Date.now()}`);
await mkdir(directory, { recursive: true });
const vite = await createServer({
	configFile: false, resolve: { alias: { $lib: path.resolve('src/lib') } },
	optimizeDeps: { noDiscovery: true, include: [] },
	server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', logLevel: 'error'
});
let browser;
try {
	const { renderRaporHTML } = await vite.ssrLoadModule('/src/lib/server/pdf/templates/rapor.ts');
	const { renderSRRaporHTML } = await vite.ssrLoadModule('/src/lib/server/pdf/templates/sr.ts');
	const { renderPiagamHTML } = await vite.ssrLoadModule('/src/lib/server/pdf/templates/piagam.ts');
	browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
	const page = await browser.newPage();
	await page.setRequestInterception(true);
	page.on('request', (request) => /^https?:/.test(request.url()) ? request.abort() : request.continue());
	await page.setViewport({ width: 1000, height: 1200 });
	// Synthetic QA mark, never a real employee signature.
	const signature = await page.evaluate(() => {
		const canvas = document.createElement('canvas');
		canvas.width = 240; canvas.height = 100;
		const context = canvas.getContext('2d');
		context.font = 'bold 32px sans-serif';
		context.fillStyle = '#163257';
		context.fillText('QA TEST', 25, 65);
		return canvas.toDataURL('image/png');
	});
	const report = {
		sekolah: { nama: 'Sekolah QA', alamat: 'Bengkulu', jenjangVariant: 'sma' },
		murid: { nama: 'Murid QA', nis: '001', nisn: '0000000001' },
		rombel: { nama: 'X.A', fase: 'E' }, periode: { tahunPelajaran: '2026/2027', semester: 'Ganjil' },
		waliKelas: { nama: 'Wali QA', nip: '111' }, kepalaSekolah: { nama: 'Kepsek QA', nip: '222' },
		nilaiIntrakurikuler: [{ mataPelajaran: 'Bahasa Indonesia', nilaiAkhir: '85', deskripsi: 'Capaian QA', jenis: 'wajib' }],
		kokurikuler: '', hasKokurikuler: false, ekstrakurikuler: [],
		ketidakhadiran: { sakit: 0, izin: 0, tanpaKeterangan: 0 }, catatanWali: 'Catatan QA', tanggapanOrangTua: '',
		ttd: { tempat: 'Bengkulu', tanggal: '28 Oktober 2026' }
	};
	const certificate = {
		sekolah: { nama: 'Sekolah QA', jenjang: 'sma', npsn: '00000000', alamat: { jalan: 'Bengkulu', desa: '', kecamatan: '', kabupaten: 'Bengkulu' } },
		murid: report.murid, penghargaan: { rataRata: 85, rataRataFormatted: '85', ranking: 1, rankingLabel: 'I', judul: 'Piagam QA', subjudul: 'Penghargaan', motivasi: 'Capaian QA' },
		periode: { semester: 'Ganjil', tahunAjaran: '2026/2027', namaKelas: 'X.A' },
		ttd: { ...report.ttd, kepalaSekolah: report.kepalaSekolah, waliKelas: report.waliKelas }
	};
	for (const [name, render, data] of [
		['rapor', renderRaporHTML, report], ['rapor-sr', renderSRRaporHTML, report],
		['piagam-1', (input) => renderPiagamHTML(input, '1'), certificate],
		['piagam-2', (input) => renderPiagamHTML(input, '2'), certificate]
	]) {
		const positions = [];
		for (const enabled of [false, true]) {
			const fixture = structuredClone(data);
			const principal = fixture.kepalaSekolah ?? fixture.ttd.kepalaSekolah;
			const teacher = fixture.waliKelas ?? fixture.ttd.waliKelas;
			principal.signatureUrl = enabled ? signature : null;
			teacher.signatureUrl = enabled ? signature : null;
			await page.setContent(render(fixture), { waitUntil: 'domcontentloaded' });
			await page.waitForFunction(() => [...document.images].every((image) => image.complete));
			positions.push(await page.evaluate(() => {
				const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
				const names = [];
				while (walker.nextNode()) {
					const text = walker.currentNode.textContent.trim();
					if (!['Kepsek QA', 'Wali QA'].includes(text)) continue;
					const range = document.createRange();
					range.selectNodeContents(walker.currentNode);
					names.push({ text, top: range.getBoundingClientRect().top });
				}
				return { height: document.body.scrollHeight, names };
			}));
			const marks = await page.$$eval('img[alt="Tanda tangan"]', (images) => images.map((img) => ({ loaded: img.complete && img.naturalWidth > 0, width: img.getBoundingClientRect().width, height: img.getBoundingClientRect().height })));
			assert.equal(marks.length, enabled ? 2 : 0);
			for (const mark of marks) { assert.ok(mark.loaded); assert.ok(mark.width > 100 && mark.width < 120); assert.ok(mark.height > 45 && mark.height < 60); }
			if (enabled) {
				await page.screenshot({ path: path.join(directory, `${name}.png`), fullPage: true });
				await page.pdf({ path: path.join(directory, `${name}.pdf`), format: 'A4', printBackground: true, preferCSSPageSize: true });
			}
		}
		assert.equal(positions[0].height, positions[1].height, `${name}: signature must not change document height`);
		assert.ok(positions[0].names.length > 0);
		for (const before of positions[0].names) assert.ok(positions[1].names.some((after) => after.text === before.text && Math.abs(after.top - before.top) < 1));
		console.log(`PASS ${name}: marks loaded; name positions and page height unchanged`);
	}
	await writeFile(path.join(directory, 'result.json'), JSON.stringify({ status: 'PASS', templates: 4, fixture: 'synthetic', directory }, null, 2));
	console.log(directory);
} finally {
	await browser?.close();
	await vite.close();
}
