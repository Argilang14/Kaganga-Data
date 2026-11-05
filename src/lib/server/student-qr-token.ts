import { createHash, createHmac, randomBytes } from 'node:crypto';

export function hashQrToken(token: string) {
	return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function createQrToken() {
	return `rapkumer-absensi:${randomBytes(32).toString('base64url')}`;
}

function qrTokenSecret() {
	return (
		process.env.RAPKUMER_QR_SECRET ||
		process.env.INTERNAL_RELOAD_SECRET ||
		'rapkumer-absensi-digital-v1'
	);
}

export function createPreviewableQrToken(params: {
	muridId: number;
	tokenVersion: number;
	issuedAt: string;
}) {
	const payload = `${params.muridId}.${params.tokenVersion}.${params.issuedAt}`;
	const signature = createHmac('sha256', qrTokenSecret())
		.update(payload, 'utf8')
		.digest('base64url');
	return `rapkumer-absensi:v2:${payload}.${signature}`;
}

export type PrintableQrRecord = {
	muridId: number;
	tokenHash: string;
	tokenValue?: string | null;
	conflicting?: boolean;
	tokenVersion: number;
	issuedAt: string;
};

export function resolvePrintableQrToken(qr: PrintableQrRecord): string | null {
	if (qr.conflicting) return null;
	if (qr.tokenValue && hashQrToken(qr.tokenValue) === qr.tokenHash) return qr.tokenValue;
	const token = createPreviewableQrToken(qr);
	return hashQrToken(token) === qr.tokenHash ? token : null;
}
