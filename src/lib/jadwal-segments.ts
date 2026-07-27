export type JadwalSegmentKind = 'mapel' | 'kegiatan';

export type JadwalMergeCell = {
	key: string;
	hari: string;
	row: number;
	column: number;
	group: string;
	kode: string;
	kind: JadwalSegmentKind;
	mergeIdentity?: string;
};

export type JadwalSegment = {
	anchorKey: string;
	cellKeys: string[];
	kind: JadwalSegmentKind;
	kode: string;
	rowSpan: number;
	colSpan: number;
};

function registerSegment(
	segments: Map<string, JadwalSegment>,
	cells: JadwalMergeCell[],
	kind: JadwalSegmentKind
) {
	if (!cells.length) return;
	const segment: JadwalSegment = {
		anchorKey: cells[0].key,
		cellKeys: cells.map((cell) => cell.key),
		kind,
		kode: cells[0].kode,
		rowSpan: kind === 'mapel' ? cells.length : 1,
		colSpan: kind === 'kegiatan' ? cells.length : 1
	};
	for (const cell of cells) segments.set(cell.key, segment);
}

function identity(cell: JadwalMergeCell) {
	return cell.kode + '|' + (cell.mergeIdentity ?? '');
}

export function buildJadwalSegments(cells: JadwalMergeCell[]): Map<string, JadwalSegment> {
	const segments = new Map<string, JadwalSegment>();
	const kegiatanRows = new Map<string, JadwalMergeCell[]>();
	const mapelColumns = new Map<string, JadwalMergeCell[]>();

	for (const cell of cells) {
		if (!cell.kode) continue;
		const target = cell.kind === 'kegiatan' ? kegiatanRows : mapelColumns;
		const axisKey =
			cell.kind === 'kegiatan'
				? cell.group + '|' + cell.hari + '|' + cell.row
				: cell.group + '|' + cell.hari + '|' + cell.column;
		const group = target.get(axisKey) ?? [];
		group.push(cell);
		target.set(axisKey, group);
	}

	for (const row of kegiatanRows.values()) {
		row.sort((a, b) => a.column - b.column);
		let run: JadwalMergeCell[] = [];
		for (const cell of row) {
			const previous = run.at(-1);
			if (
				previous &&
				(cell.column !== previous.column + 1 || identity(cell) !== identity(previous))
			) {
				registerSegment(segments, run, 'kegiatan');
				run = [];
			}
			run.push(cell);
		}
		registerSegment(segments, run, 'kegiatan');
	}

	for (const column of mapelColumns.values()) {
		column.sort((a, b) => a.row - b.row);
		let run: JadwalMergeCell[] = [];
		for (const cell of column) {
			const previous = run.at(-1);
			if (previous && (cell.row !== previous.row + 1 || identity(cell) !== identity(previous))) {
				registerSegment(segments, run, 'mapel');
				run = [];
			}
			run.push(cell);
		}
		registerSegment(segments, run, 'mapel');
	}

	return segments;
}
