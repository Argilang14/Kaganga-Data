export type JadwalSlotType = 'pelajaran' | 'kegiatan' | 'istirahat' | 'kosong';

export type JadwalSlotLike = {
	hari: string;
	jenjang: string;
	jamKe: number;
	urutan?: number | null;
	tipe: string;
	aktif?: boolean;
};
const KEGIATAN_CODE_ALIASES = new Map([
	['SALAT_DHUHA', 'SHOLAT_DHUHA'],
	['SHALAT_DHUHA', 'SHOLAT_DHUHA'],
	['SHOLAT_DUHA', 'SHOLAT_DHUHA']
]);

export function normalizeJadwalKode(value: unknown): string {
	return String(value ?? '')
		.trim()
		.toUpperCase();
}
export function formatJadwalKegiatanKode(value: unknown): string {
	return String(value ?? '')
		.trim()
		.replace(/\s+/g, ' ');
}

export function normalizeJadwalKegiatanKode(value: unknown): string {
	const normalized = normalizeJadwalKode(value)
		.replace(/[^A-Z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
	return KEGIATAN_CODE_ALIASES.get(normalized) ?? normalized;
}

export function canPlaceJadwalItem(
	slotType: string | null | undefined,
	itemType: 'mapel' | 'kegiatan'
): boolean {
	return itemType === 'kegiatan' || slotType === 'pelajaran';
}
export function jadwalSlotKey(slot: Pick<JadwalSlotLike, 'jenjang' | 'hari' | 'jamKe'>): string {
	return `${slot.jenjang}|${slot.hari}|${slot.jamKe}`;
}

export function uniqueJadwalSlots<T extends JadwalSlotLike>(slots: T[]): T[] {
	const unique = new Map<string, T>();
	for (const slot of slots) unique.set(jadwalSlotKey(slot), slot);
	return [...unique.values()];
}

export function buildJpNumberBySlot(slots: JadwalSlotLike[]): Map<string, number | null> {
	const result = new Map<string, number | null>();
	const groups = new Map<string, JadwalSlotLike[]>();

	for (const slot of uniqueJadwalSlots(slots)) {
		const groupKey = `${slot.jenjang}|${slot.hari}`;
		const group = groups.get(groupKey) ?? [];
		group.push(slot);
		groups.set(groupKey, group);
	}

	for (const group of groups.values()) {
		let jp = 0;
		group
			.sort((a, b) => (a.urutan ?? a.jamKe) - (b.urutan ?? b.jamKe) || a.jamKe - b.jamKe)
			.forEach((slot) => {
				const isLesson = slot.aktif !== false && slot.tipe === 'pelajaran';
				result.set(jadwalSlotKey(slot), isLesson ? ++jp : null);
			});
	}

	return result;
}
