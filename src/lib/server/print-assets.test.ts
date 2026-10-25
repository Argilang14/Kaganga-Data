import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
	getSchoolPrintAssets,
	printAssetPath,
	readPrintAsset,
	removePrintAsset,
	savePrintAsset,
	validatePrintAsset
} from './print-assets.ts';

const png = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
	'base64'
);

test('gambar cetak memeriksa isi PNG, MIME, batas ukuran dan piksel', async () => {
	await validatePrintAsset(png, 'image/png');
	await assert.rejects(validatePrintAsset(png, 'image/jpeg'));
	await assert.rejects(validatePrintAsset(Buffer.from('<script>'), 'image/png'));
	await assert.rejects(validatePrintAsset(Buffer.alloc(2 * 1024 * 1024 + 1), 'image/png'));
	const large = Buffer.from(png);
	large.writeUInt32BE(6001, 16);
	await assert.rejects(validatePrintAsset(large, 'image/png'));
	await assert.rejects(validatePrintAsset(png.subarray(0, 35), 'image/png'));
	assert.throws(() => printAssetPath(1, '../sd' as never, 'ttd'));
	assert.throws(() => printAssetPath(-1, 'induk', 'ttd'));
});

test('aset terpisah per sekolah dan jenjang; kop induk tidak bocor ke jenjang', async () => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'kaganga-print-assets-'));
	const original = process.env.photo;
	process.env.photo = directory;
	try {
		await savePrintAsset(1, 'induk', 'kop-portrait', png, 'image/png');
		await savePrintAsset(1, 'induk', 'ttd', png, 'image/png');
		const unit = await getSchoolPrintAssets(1, 'sd', 'portrait');
		assert.equal(unit.customLetterheadUrl, null);
		assert.ok(unit.signatureUrl);
		assert.equal((await getSchoolPrintAssets(2, 'induk', 'portrait')).signatureUrl, null);
		assert.equal((await getSchoolPrintAssets(1, 'induk', 'landscape')).customLetterheadUrl, null);
		await savePrintAsset(1, 'sd', 'kop-portrait', png, 'image/png');
		assert.ok((await getSchoolPrintAssets(1, 'sd', 'portrait')).customLetterheadUrl);
		assert.equal((await getSchoolPrintAssets(1, 'smp', 'portrait')).customLetterheadUrl, null);
		await assert.rejects(
			savePrintAsset(1, 'sd', 'kop-portrait', Buffer.from('invalid'), 'image/png')
		);
		assert.deepEqual(await readPrintAsset(1, 'sd', 'kop-portrait'), png);
		await savePrintAsset(1, 'sd', 'kop-portrait', png, 'image/png');
		await removePrintAsset(1, 'sd', 'kop-portrait');
		assert.equal(await readPrintAsset(1, 'sd', 'kop-portrait'), null);
		await removePrintAsset(1, 'sd', 'kop-portrait');
	} finally {
		if (original === undefined) delete process.env.photo;
		else process.env.photo = original;
		await fs.rm(directory, { recursive: true, force: true });
	}
});
