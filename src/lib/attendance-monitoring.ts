import { jakartaToday } from './dashboard-summary.ts';

export const monitoringTabs = [
	{ key: 'sekolah', label: 'Sekolah', icon: 'school' },
	{ key: 'sholat', label: 'Sholat', icon: 'calendar' },
	{ key: 'makan', label: 'Makan', icon: 'activity' },
	{ key: 'asrama', label: 'Asrama', icon: 'users' }
] as const;
export type MonitoringTab = (typeof monitoringTabs)[number]['key'];
export const monitoringSlots = [
	{
		key: 'masuk',
		label: 'Masuk Sekolah',
		tab: 'sekolah',
		category: 'sekolah',
		code: 'apel_berangkat'
	},
	{
		key: 'pulang',
		label: 'Pulang Sekolah',
		tab: 'sekolah',
		category: 'sekolah',
		code: 'apel_pulang'
	},
	{ key: 'subuh', label: 'Subuh', tab: 'sholat', category: 'sholat', code: 'sholat_subuh' },
	{ key: 'zuhur', label: 'Zuhur', tab: 'sholat', category: 'sholat', code: 'sholat_zuhur' },
	{ key: 'asar', label: 'Asar', tab: 'sholat', category: 'sholat', code: 'sholat_asar' },
	{ key: 'magrib', label: 'Magrib', tab: 'sholat', category: 'sholat', code: 'sholat_magrib' },
	{ key: 'isya', label: 'Isya', tab: 'sholat', category: 'sholat', code: 'sholat_isya' },
	{ key: 'pagi', label: 'Makan Pagi', tab: 'makan', category: 'makan', code: 'makan_pagi' },
	{ key: 'siang', label: 'Makan Siang', tab: 'makan', category: 'makan', code: 'makan_siang' },
	{
		key: 'makan_malam',
		label: 'Makan Malam',
		tab: 'makan',
		category: 'makan',
		code: 'makan_malam'
	},
	{
		key: 'asrama_berangkat',
		label: 'Berangkat dari Asrama',
		tab: 'asrama',
		category: 'asrama',
		code: 'asrama_berangkat'
	},
	{
		key: 'asrama_tiba',
		label: 'Tiba di Asrama',
		tab: 'asrama',
		category: 'asrama',
		code: 'asrama_tiba'
	},
	{ key: 'apel_malam', label: 'Apel Malam', tab: 'asrama', category: 'asrama', code: 'apel_malam' }
] as const;
export type MonitoringSlotKey = (typeof monitoringSlots)[number]['key'];
export type MonitoringStatus =
	| 'hadir'
	| 'terlambat'
	| 'sakit'
	| 'izin'
	| 'alfa'
	| 'pulang'
	| 'izin_pulang'
	| 'belum'
	| 'tanpa_sumber';
export const monitoringStatusLabels: Record<MonitoringStatus, string> = {
	hadir: 'Hadir',
	terlambat: 'Terlambat',
	sakit: 'Sakit',
	izin: 'Izin',
	alfa: 'Alfa',
	pulang: 'Pulang',
	izin_pulang: 'Izin Pulang',
	belum: 'Belum Tercatat',
	tanpa_sumber: 'Sumber Belum Dipilih'
};
export type MonitoringActivity = {
	id: number;
	nama: string;
	kode: string;
	kategori: string;
	jamMulai: string | null;
};
export type MonitoringColumn = {
	key: MonitoringSlotKey;
	label: string;
	source: string;
	sourceLabel: string;
	activityId: number | null;
	time: string | null;
};
export type MonitoringRecord = {
	id: number;
	muridId: number;
	kegiatanId: number | null;
	status: string;
	waktuScan: string | null;
	metode: string;
	updatedAt: string | null;
	createdAt: string;
};
export type MonitoringPermit = {
	muridId: number | null;
	tanggalKeluar: string;
	waktuKeluar: string | null;
	tanggalKembali: string | null;
	waktuKembali: string | null;
};
export type MonitoringCell = {
	status: MonitoringStatus;
	time: string | null;
	method: string | null;
	source: 'catatan' | 'izin_pulang' | 'kosong' | 'terhubung';
	linkedFrom?: string;
};

export function availableMonitoringTabs(mealsOnly: boolean) {
	return monitoringTabs.filter((tab) => !mealsOnly || tab.key === 'makan');
}

export function normalizeMonitoringTab(tab: string | null) {
	return tab === 'malam' ? 'asrama' : tab;
}

export function resolveMonitoringColumns(
	tab: MonitoringTab | 'malam',
	activities: MonitoringActivity[],
	params: URLSearchParams
): MonitoringColumn[] {
	return monitoringSlots
		.filter((slot) => slot.tab === normalizeMonitoringTab(tab))
		.map((slot) => {
			const raw = params.get(`sumber_${slot.key}`);
			const defaultActivity = activities.find(
				(item) => item.kode === slot.code && item.kategori === slot.category
			);
			const source =
				raw ??
				(defaultActivity ? String(defaultActivity.id) : slot.key === 'masuk' ? 'harian' : '');
			if (source === 'harian' && slot.key === 'masuk')
				return {
					key: slot.key,
					label: slot.label,
					source,
					sourceLabel: 'Absensi Harian Sekolah',
					activityId: null,
					time: null
				};
			const activity = activities.find(
				(item) => String(item.id) === source && item.kategori === slot.category
			);
			if (source && !activity)
				throw new Error('Sumber kegiatan tidak tersedia atau tidak sesuai kategori.');
			return {
				key: slot.key,
				label: slot.label,
				source,
				sourceLabel: activity?.nama ?? 'Belum dipilih',
				activityId: activity?.id ?? null,
				time: activity?.jamMulai ?? null
			};
		});
}

function validTime(value: string | null) {
	return value !== null && /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value);
}

function fullTime(value: string | null, fallback: string) {
	return validTime(value) ? (value!.length === 5 ? `${value}:00` : value!) : fallback;
}

// Without a scheduled time, only a permit covering the whole date can fill a missing cell.
export function permitCoversMonitoring(
	date: string,
	time: string | null,
	permit: MonitoringPermit
) {
	const start = `${permit.tanggalKeluar}T${fullTime(permit.waktuKeluar, '23:59:59')}`;
	const end = permit.tanggalKembali
		? `${permit.tanggalKembali}T${fullTime(permit.waktuKembali, '00:00:00')}`
		: null;
	const pointStart = `${date}T${fullTime(time, '00:00:00')}`;
	const pointEnd = validTime(time) ? pointStart : `${date}T23:59:59`;
	return start <= pointStart && (end === null || end > pointEnd);
}

export function buildMonitoringRows(input: {
	date: string;
	students: Array<{ id: number; nama: string; kelasId: number; kelas: string }>;
	columns: MonitoringColumn[];
	records: MonitoringRecord[];
	permits: MonitoringPermit[];
}) {
	const records = new Map<string, MonitoringRecord>();
	for (const record of input.records) {
		const key = `${record.muridId}:${record.kegiatanId ?? 'harian'}`;
		const previous = records.get(key);
		if (
			!previous ||
			(record.updatedAt ?? record.createdAt) > (previous.updatedAt ?? previous.createdAt) ||
			((record.updatedAt ?? record.createdAt) === (previous.updatedAt ?? previous.createdAt) &&
				record.id > previous.id)
		)
			records.set(key, record);
	}
	const permits = new Map<number, MonitoringPermit[]>();
	for (const permit of input.permits) {
		if (permit.muridId === null) continue;
		const list = permits.get(permit.muridId) ?? [];
		list.push(permit);
		permits.set(permit.muridId, list);
	}
	return [...new Map(input.students.map((student) => [student.id, student])).values()].map(
		(student) => ({
			...student,
			cells: input.columns.map((column): MonitoringCell => {
				if (!column.source)
					return { status: 'tanpa_sumber', time: null, method: null, source: 'kosong' };
				const record = records.get(`${student.id}:${column.activityId ?? 'harian'}`);
				if (
					record &&
					['hadir', 'terlambat', 'sakit', 'izin', 'alfa', 'pulang'].includes(record.status)
				)
					return {
						status: record.status as MonitoringStatus,
						time: record.waktuScan,
						method: record.metode,
						source: 'catatan'
					};
				if (
					permits
						.get(student.id)
						?.some((permit) => permitCoversMonitoring(input.date, column.time, permit))
				)
					return { status: 'izin_pulang', time: null, method: null, source: 'izin_pulang' };
				return { status: 'belum', time: null, method: null, source: 'kosong' };
			})
		})
	);
}

export function monitoringCounts(
	rows: ReturnType<typeof buildMonitoringRows>,
	columnIndex: number
) {
	const counts = Object.fromEntries(
		Object.keys(monitoringStatusLabels).map((status) => [status, 0])
	) as Record<MonitoringStatus, number>;
	for (const row of rows) counts[row.cells[columnIndex].status]++;
	return counts;
}

export function monitoringToday(now = new Date()) {
	return jakartaToday(now);
}
