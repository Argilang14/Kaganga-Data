import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { uploadsDir } from './data-dirs.ts';

export const printAssetKinds = ['kop-portrait', 'kop-landscape', 'ttd', 'stempel'] as const;
export type PrintAssetKind = (typeof printAssetKinds)[number];
export const printAssetScopes = ['induk', 'sd', 'smp', 'sma'] as const;
export type PrintAssetScope = (typeof printAssetScopes)[number];
export const PRINT_ASSET_MAX_BYTES = 2 * 1024 * 1024;

export function printAssetPath(schoolId: number, scope: PrintAssetScope, kind: PrintAssetKind) {
	if (
		!Number.isSafeInteger(schoolId) ||
		schoolId <= 0 ||
		!printAssetScopes.includes(scope) ||
		!printAssetKinds.includes(kind)
	) {
		throw new Error('Identitas aset cetak tidak valid.');
	}
	return path.join(uploadsDir(), 'print-assets', `sekolah-${schoolId}`, scope, `${kind}.png`);
}

export async function validatePrintAsset(buffer: Buffer, mime: string) {
	if (
		mime !== 'image/png' ||
		buffer.length < 33 ||
		buffer.length > PRINT_ASSET_MAX_BYTES ||
		!buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
		buffer.toString('ascii', 12, 16) !== 'IHDR'
	) {
		throw new Error('Gunakan gambar PNG yang valid, maksimal 2 MB.');
	}
	const width = buffer.readUInt32BE(16),
		height = buffer.readUInt32BE(20);
	if (!width || !height || width > 6000 || height > 6000 || width * height > 4_000_000) {
		throw new Error('Ukuran gambar maksimal 4 juta piksel dan 6.000 piksel per sisi.');
	}
	try {
		const pdf = await PDFDocument.create();
		await pdf.embedPng(buffer);
	} catch {
		throw new Error('Gambar PNG tidak dapat dibaca. Ekspor ulang gambar lalu unggah kembali.');
	}
}

export async function readPrintAsset(
	schoolId: number,
	scope: PrintAssetScope,
	kind: PrintAssetKind
) {
	try {
		return await fs.readFile(printAssetPath(schoolId, scope, kind));
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return null;
		throw cause;
	}
}

export async function savePrintAsset(
	schoolId: number,
	scope: PrintAssetScope,
	kind: PrintAssetKind,
	buffer: Buffer,
	mime: string
) {
	await validatePrintAsset(buffer, mime);
	const target = printAssetPath(schoolId, scope, kind);
	const temporary = `${target}.${randomUUID()}.tmp`;
	await fs.mkdir(path.dirname(target), { recursive: true });
	try {
		await fs.writeFile(temporary, buffer, { flag: 'wx', mode: 0o600 });
		await fs.rename(temporary, target);
	} finally {
		await fs.unlink(temporary).catch((cause: NodeJS.ErrnoException) => {
			if (cause.code !== 'ENOENT') throw cause;
		});
	}
}

export async function removePrintAsset(
	schoolId: number,
	scope: PrintAssetScope,
	kind: PrintAssetKind
) {
	await fs.unlink(printAssetPath(schoolId, scope, kind)).catch((cause: NodeJS.ErrnoException) => {
		if (cause.code !== 'ENOENT') throw cause;
	});
}

export async function printAssetStatus(schoolId: number, scope: PrintAssetScope) {
	const result: Partial<Record<PrintAssetKind, boolean>> = {};
	for (const kind of printAssetKinds)
		result[kind] = Boolean(await readPrintAsset(schoolId, scope, kind));
	return result as Record<PrintAssetKind, boolean>;
}

export async function getSchoolPrintAssets(
	schoolId: number,
	scope: PrintAssetScope,
	orientation: 'portrait' | 'landscape'
) {
	const uri = async (kind: PrintAssetKind) => {
		// A unit must never inherit the parent's kop, which may name another NPSN.
		const own = await readPrintAsset(schoolId, scope, kind);
		const buffer =
			own ??
			(scope !== 'induk' && (kind === 'ttd' || kind === 'stempel')
				? await readPrintAsset(schoolId, 'induk', kind)
				: null);
		return buffer ? `data:image/png;base64,${buffer.toString('base64')}` : null;
	};
	return {
		customLetterheadUrl: await uri(`kop-${orientation}`),
		signatureUrl: await uri('ttd'),
		stampUrl: await uri('stempel')
	};
}
