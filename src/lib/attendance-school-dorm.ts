import type {
	MonitoringCell,
	MonitoringColumn,
	buildMonitoringRows
} from './attendance-monitoring.ts';
import { monitoringStatusLabels } from './attendance-monitoring.ts';

export type SchoolDormJourney = {
	key: 'pergi' | 'kembali';
	status: 'tiba' | 'menunggu' | 'belum' | 'keterangan' | 'periksa' | 'tanpa_sumber';
	label: string;
	note: string;
};
export const schoolDormFilters = ['', 'menunggu_sekolah', 'menunggu_asrama', 'periksa'] as const;
export type SchoolDormFilter = (typeof schoolDormFilters)[number];

const pairs = [
	{ key: 'pergi', departure: 'asrama_berangkat', arrival: 'masuk', destination: 'sekolah' },
	{ key: 'kembali', departure: 'pulang', arrival: 'asrama_tiba', destination: 'asrama' }
] as const;
const present = (cell: MonitoringCell) => ['hadir', 'terlambat', 'pulang'].includes(cell.status);
const condition = (cell: MonitoringCell) => ['sakit', 'izin', 'alfa'].includes(cell.status);

export function connectSchoolDormRows(
	rows: ReturnType<typeof buildMonitoringRows>,
	columns: MonitoringColumn[]
) {
	return rows.map((row) => {
		const cells = row.cells.map((cell) => ({ ...cell }));
		const journeys = pairs.map((pair): SchoolDormJourney => {
			const from = columns.findIndex((column) => column.key === pair.departure);
			const to = columns.findIndex((column) => column.key === pair.arrival);
			const base = { key: pair.key, note: '' };
			if (from < 0 || to < 0 || !columns[from].source || !columns[to].source)
				return { ...base, status: 'tanpa_sumber', label: 'Pasangan sumber belum diatur' };
			const departure = row.cells[from],
				arrival = row.cells[to];
			const notes = [from, to]
				.filter((index) => condition(row.cells[index]) || row.cells[index].status === 'izin_pulang')
				.map(
					(index) =>
						`${monitoringStatusLabels[row.cells[index].status]} dari ${columns[index].label}`
				);
			// Share only the paired condition, never attendance or another prayer/meal/night session.
			for (const [target, origin] of [
				[to, from],
				[from, to]
			]) {
				const source = row.cells[origin];
				if (
					row.cells[target].status === 'belum' &&
					source.source === 'catatan' &&
					['sakit', 'izin'].includes(source.status)
				)
					cells[target] = {
						...source,
						method: null,
						source: 'terhubung',
						linkedFrom: columns[origin].label
					};
			}
			const note = notes.join('; ');
			if (
				(present(departure) && condition(arrival)) ||
				(present(arrival) && condition(departure)) ||
				(condition(departure) && condition(arrival) && departure.status !== arrival.status)
			)
				return {
					...base,
					status: 'periksa',
					label: 'Perlu diperiksa',
					note: [from, to]
						.map(
							(index) =>
								`${monitoringStatusLabels[row.cells[index].status]} dari ${columns[index].label}`
						)
						.join('; ')
				};
			if (
				present(departure) &&
				present(arrival) &&
				departure.time &&
				arrival.time &&
				Date.parse(departure.time) > Date.parse(arrival.time)
			)
				return {
					...base,
					status: 'periksa',
					label: 'Perlu diperiksa',
					note: 'Waktu tiba tercatat sebelum keberangkatan'
				};
			if (present(arrival))
				return {
					...base,
					status: 'tiba',
					label: `Sudah tiba di ${pair.destination}`,
					note: !present(departure) ? note || `${columns[from].label} belum tercatat` : ''
				};
			if (notes.length) return { ...base, status: 'keterangan', label: 'Ada keterangan', note };
			if (present(departure))
				return {
					...base,
					status: 'menunggu',
					label: `Belum tercatat tiba di ${pair.destination}`,
					note: `${columns[from].label} sudah tercatat`
				};
			return { ...base, status: 'belum', label: 'Perjalanan belum tercatat', note: '' };
		});
		return { ...row, cells, journeys };
	});
}

export function matchesSchoolDormFilter(journeys: SchoolDormJourney[], filter: SchoolDormFilter) {
	if (!filter) return true;
	if (filter === 'periksa') return journeys.some((journey) => journey.status === 'periksa');
	return journeys.some(
		(journey) =>
			journey.key === (filter === 'menunggu_sekolah' ? 'pergi' : 'kembali') &&
			journey.status === 'menunggu'
	);
}

export function summarizeSchoolDorm(rows: Array<{ journeys: SchoolDormJourney[] }>) {
	return {
		toSchool: rows.filter((row) => matchesSchoolDormFilter(row.journeys, 'menunggu_sekolah'))
			.length,
		toDorm: rows.filter((row) => matchesSchoolDormFilter(row.journeys, 'menunggu_asrama')).length,
		review: rows.filter((row) => matchesSchoolDormFilter(row.journeys, 'periksa')).length
	};
}
