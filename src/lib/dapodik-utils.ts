import { createHash } from 'node:crypto';

export class DapodikInputError extends Error {}

export function normalizeWebServiceUrl(input: string) {
	let value = input.trim();
	if (!value) throw new DapodikInputError('URL Dapodik wajib diisi.');
	if (!/^https?:\/\//i.test(value)) value = `http://${value}`;
	const parsed = new URL(value);
	if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
		throw new DapodikInputError('URL Dapodik tidak valid.');
	}
	value = value.replace(/\/+$/, '');
	if (!/\/WebService$/i.test(value)) value += '/WebService';
	return value;
}

export function parseDapodikSemesterId(value: string) {
	const match = /^(\d{4})([12])$/.exec(value.trim());
	if (!match) return null;
	const year = Number(match[1]);
	return {
		year,
		tipe: match[2] === '1' ? ('ganjil' as const) : ('genap' as const),
		namaTahun: `${year}/${year + 1}`
	};
}

export type DapodikPembelajaranItem = {
	rombelId: string;
	kelasNama: string;
	pembelajaranId?: string;
	mataPelajaranId?: string;
	nama?: string;
	ptkId?: string;
	row: Record<string, unknown>;
};

export function dapodikPembelajaranKey(rombelId: string, pembelajaranId: string) {
	return `${rombelId}|${pembelajaranId}`;
}

function rowString(row: Record<string, unknown>, key: string) {
	const value = row[key];
	if (typeof value === 'string' && value.trim()) return value.trim();
	if (typeof value === 'number') return String(value);
	const label = row[`${key}_str`];
	return typeof label === 'string' && label.trim() ? label.trim() : undefined;
}

export function collectDapodikPembelajaran(rows: Array<Record<string, unknown>>) {
	const result: DapodikPembelajaranItem[] = [];
	const append = (rombelId: string, kelasNama: string, row: Record<string, unknown>) => {
		result.push({
			rombelId,
			kelasNama,
			pembelajaranId: rowString(row, 'pembelajaran_id'),
			mataPelajaranId: rowString(row, 'mata_pelajaran_id'),
			nama:
				rowString(row, 'nama_mata_pelajaran') ??
				rowString(row, 'mata_pelajaran_id_str') ??
				rowString(row, 'nama_mata_pelajaran_mapel') ??
				rowString(row, 'nama'),
			ptkId: rowString(row, 'ptk_id'),
			row
		});
		if (Array.isArray(row.sub_mapel)) {
			for (const child of row.sub_mapel) {
				if (child && typeof child === 'object') {
					append(rombelId, kelasNama, child as Record<string, unknown>);
				}
			}
		}
	};
	for (const rombel of rows) {
		if (Number(rombel.jenis_rombel ?? 1) !== 1) continue;
		const rombelId = rowString(rombel, 'rombongan_belajar_id');
		if (!rombelId) continue;
		const kelasNama = rowString(rombel, 'nama') ?? '-';
		if (!Array.isArray(rombel.pembelajaran)) continue;
		for (const item of rombel.pembelajaran) {
			if (item && typeof item === 'object') {
				append(rombelId, kelasNama, item as Record<string, unknown>);
			}
		}
	}
	return result;
}

export function uniqueDapodikPembelajaran(items: DapodikPembelajaranItem[]) {
	const unique = new Map<string, DapodikPembelajaranItem>();
	for (const item of items) {
		if (!item.pembelajaranId) continue;
		unique.set(dapodikPembelajaranKey(item.rombelId, item.pembelajaranId), item);
	}
	return [...unique.values()];
}

export type DapodikExtracurricularItem = {
	nama: string;
	members: Array<Record<string, unknown>>;
	row: Record<string, unknown>;
};

export function collectDapodikExtracurricular(rows: Array<Record<string, unknown>>) {
	const result: DapodikExtracurricularItem[] = [];
	for (const row of rows) {
		if (Number(row.jenis_rombel ?? 0) !== 51) continue;
		const nama = rowString(row, 'nm_ekskul') ?? rowString(row, 'nama');
		if (!nama) continue;
		result.push({
			nama,
			members: Array.isArray(row.anggota_rombel)
				? (row.anggota_rombel as Array<Record<string, unknown>>)
				: [],
			row
		});
	}
	return result;
}

export function dapodikDeterministicUuid(seed: string) {
	const hash = createHash('sha1').update(seed).digest();
	hash[6] = (hash[6] & 0x0f) | 0x50;
	hash[8] = (hash[8] & 0x3f) | 0x80;
	const value = hash.toString('hex');
	return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
}

export function normalizeDapodikScore(value: number | null | undefined) {
	if (value == null || !Number.isFinite(value) || value < 0 || value > 100) return null;
	return Number(value.toFixed(2));
}

export function normalizeDapodikDescription(value: string | null | undefined) {
	if (!value) return null;
	const normalized = value.replace(/\s+/gu, ' ').trim();
	if (!normalized || normalized === 'Belum ada penilaian sumatif.') return null;
	return normalized.slice(0, 300);
}

export function dapodikNilaiSelectionKey(kelasId: number, mapelId: number) {
	return `${kelasId}:${mapelId}`;
}
