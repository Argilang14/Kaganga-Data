export type ArchiveKind = 'sekolah' | 'asrama' | 'martikulasi';
export const archiveKinds: ArchiveKind[] = ['sekolah', 'asrama', 'martikulasi'];
export const archiveKindLabel: Record<ArchiveKind, string> = {
	sekolah: 'Rapor sekolah',
	asrama: 'Rapor asrama',
	martikulasi: 'Rapor martikulasi'
};
export function archivePrintPermission(kind: ArchiveKind) {
	return kind === 'asrama' ? 'cetak_keasramaan' : 'cetak_akademik';
}
export type ArchivePeriod = 'rts' | 'ras';
export const reportBatchLimit = 20;
export function reportHistoryIds(value: unknown): number[] {
	if (
		!Array.isArray(value) ||
		!value.length ||
		value.length > reportBatchLimit ||
		value.some((id) => !Number.isSafeInteger(id) || id < 1) ||
		new Set(value).size !== value.length
	)
		throw new Error(`Pilih 1-${reportBatchLimit} riwayat murid yang berbeda.`);
	return value as number[];
}
export function reportRevisionReason(value: unknown): string {
	if (typeof value !== 'string') throw new Error('Alasan revisi wajib diisi.');
	const reason = value.trim();
	if (
		reason.length < 10 ||
		reason.length > 1000 ||
		/[<>]/.test(reason) ||
		[...reason].some((c) => c.charCodeAt(0) < 32)
	)
		throw new Error('Alasan revisi harus 10-1000 karakter tanpa tag atau karakter kontrol.');
	return reason;
}
export type ReportMetadata = {
	schoolName: string;
	npsn: string;
	address: string;
	principalName: string;
	principalNip: string;
	principalStatus: string;
	teacherName: string;
	teacherNip: string;
	caregiverName: string;
	caregiverNip: string;
	place: string;
	date: string;
};
export function reportSelection(kind: unknown, period: unknown) {
	if (kind !== 'sekolah' && kind !== 'asrama' && kind !== 'martikulasi')
		throw new Error('Jenis rapor tidak valid.');
	if (period !== 'rts' && period !== 'ras') throw new Error('Periode rapor tidak valid.');
	if (kind === 'asrama' && period !== 'ras')
		throw new Error('Rapor asrama memakai periode akhir semester.');
	if (kind === 'martikulasi' && period !== 'ras')
		throw new Error('Rapor martikulasi memakai hasil akhir program.');
	return { kind, period } as { kind: ArchiveKind; period: ArchivePeriod };
}
export function verifiedReportMetadata(value: unknown): ReportMetadata {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error('Identitas dokumen belum lengkap.');
	const input = value as Record<string, unknown>;
	const result = {} as ReportMetadata;
	for (const key of [
		'schoolName',
		'npsn',
		'address',
		'principalName',
		'principalNip',
		'principalStatus',
		'teacherName',
		'teacherNip',
		'caregiverName',
		'caregiverNip',
		'place',
		'date'
	] as const) {
		if (typeof input[key] !== 'string' || (input[key] as string).length > 600)
			throw new Error(`Isian ${key} tidak valid.`);
		result[key] = (input[key] as string).trim();
		if (
			/[<>]/.test(result[key]) ||
			[...result[key]].some((character) => character.charCodeAt(0) < 32)
		)
			throw new Error('Identitas dokumen mengandung karakter yang tidak diizinkan.');
	}
	if (
		!result.schoolName ||
		!result.address ||
		!result.principalName ||
		!result.teacherName ||
		!result.place
	)
		throw new Error(
			'Nama sekolah, alamat, kepala sekolah, wali, dan tempat penetapan wajib diisi.'
		);
	if (!/^\d{8}$/.test(result.npsn)) throw new Error('NPSN satuan pendidikan harus 8 digit.');
	if (
		!/^\d{4}-\d{2}-\d{2}$/.test(result.date) ||
		!Number.isFinite(Date.parse(result.date + 'T00:00:00Z')) ||
		new Date(result.date + 'T00:00:00Z').toISOString().slice(0, 10) !== result.date
	)
		throw new Error('Tanggal rapor tidak valid.');
	if (!['definitif', 'plt'].includes(result.principalStatus))
		throw new Error('Status kepala sekolah tidak valid.');
	for (const key of ['principalNip', 'teacherNip', 'caregiverNip'] as const)
		if (result[key] && result[key] !== '-' && !/^\d{18}$/.test(result[key]))
			throw new Error('NIP harus 18 digit, kosong, atau tanda -.');
	return result;
}
