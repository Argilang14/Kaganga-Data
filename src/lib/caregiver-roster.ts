export type RosterScope = 'kelas' | 'asrama' | 'wali-asuh';
export type RosterOptions = { scope: RosterScope; id: number };
export type RosterChoice = { id: number; nama: string; count: number };
export type RosterContext = {
	period: string;
	classes: RosterChoice[];
	dorms: RosterChoice[];
	caregivers: RosterChoice[];
};
export type RosterStudent = {
	id: number;
	nama: string;
	nis: string;
	kelasId: number | null;
	kelas: string;
	waliKelas: string;
	asramaId: number | null;
	asrama: string;
	waliAsuhId: number | null;
	waliAsuh: string;
};
export function parseRosterOptions(input: unknown): RosterOptions {
	if (!input || typeof input !== 'object')
		throw new Error('Pilih cakupan dan kelompok yang akan dicetak.');
	const value = input as Record<string, unknown>;
	if (
		!['kelas', 'asrama', 'wali-asuh'].includes(String(value.scope)) ||
		typeof value.id !== 'number' ||
		!Number.isSafeInteger(value.id) ||
		value.id <= 0
	)
		throw new Error('Pilihan cetak tidak sesuai. Pilih kembali cakupan dan kelompoknya.');
	return { scope: value.scope as RosterScope, id: value.id };
}
