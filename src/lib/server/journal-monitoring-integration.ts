export type MonitoringJournalContext = {
	monitoringKey: string;
	tanggal: string;
	jenisJadwal: 'persiapan' | 'ganjil' | 'genap';
	kelasId: number;
	kelasNama: string;
	jadwalMapelId: number;
	mataPelajaranId: number | null;
	mapelNama: string;
	mapelKode: string | null;
	jadwalIds: number[];
	jamPelajaran: string;
	pukul: string | null;
	jadwalTemplateId: number | null;
	tahunAjaranId: number;
	semesterId: number | null;
	existingJournalId: number | null;
	source: 'schedule' | 'snapshot';
};

type ResolvedMonitoringJournalContext = Partial<MonitoringJournalContext> & {
	jadwalPelajaranIds?: number[];
	journalId?: number;
	canWrite?: boolean;
};

export function normalizeMonitoringJournalContext(
	value: ResolvedMonitoringJournalContext,
	monitoringKey = value.monitoringKey ?? ''
): MonitoringJournalContext {
	const tanggal = value.tanggal ?? '';
	const jenisJadwal = value.jenisJadwal ?? '';
	const kelasId = value.kelasId ?? 0;
	const jadwalMapelId = value.jadwalMapelId ?? 0;
	const tahunAjaranId = value.tahunAjaranId ?? 0;
	const jadwalIds = [...new Set(value.jadwalIds ?? value.jadwalPelajaranIds ?? [])].sort(
		(a, b) => a - b
	);
	if (
		!monitoringKey ||
		value.canWrite === false ||
		!/^\d{4}-\d{2}-\d{2}$/.test(tanggal) ||
		!['persiapan', 'ganjil', 'genap'].includes(jenisJadwal) ||
		!Number.isSafeInteger(kelasId) ||
		kelasId <= 0 ||
		!Number.isSafeInteger(jadwalMapelId) ||
		jadwalMapelId <= 0 ||
		!Number.isSafeInteger(tahunAjaranId) ||
		tahunAjaranId <= 0 ||
		!jadwalIds.length ||
		jadwalIds.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
		!value.jamPelajaran
	) {
		throw new Error('Konteks monitoring jurnal tidak valid.');
	}
	return {
		monitoringKey,
		tanggal,
		jenisJadwal: jenisJadwal as MonitoringJournalContext['jenisJadwal'],
		kelasId,
		kelasNama: value.kelasNama!,
		jadwalMapelId,
		mataPelajaranId: value.mataPelajaranId ?? null,
		mapelNama: value.mapelNama!,
		mapelKode: value.mapelKode ?? null,
		jadwalIds,
		jamPelajaran: value.jamPelajaran!,
		pukul: value.pukul ?? null,
		jadwalTemplateId: value.jadwalTemplateId ?? null,
		tahunAjaranId,
		semesterId: value.semesterId ?? null,
		existingJournalId: value.existingJournalId ?? value.journalId ?? null,
		source: value.source ?? 'schedule'
	};
}

export function monitoringJournalSubmissionMatches(
	context: MonitoringJournalContext,
	input: {
		monitoringKey: string;
		tanggal: string;
		jenisJadwal: string | null;
		kelasId: number;
		jadwalMapelId: number | null;
		mataPelajaranId: number | null;
		jadwalIds: number[];
	}
) {
	const submittedIds = [...new Set(input.jadwalIds)].sort((a, b) => a - b);
	return (
		input.monitoringKey === context.monitoringKey &&
		input.tanggal === context.tanggal &&
		input.jenisJadwal === context.jenisJadwal &&
		input.kelasId === context.kelasId &&
		input.jadwalMapelId === context.jadwalMapelId &&
		input.mataPelajaranId === context.mataPelajaranId &&
		submittedIds.length === context.jadwalIds.length &&
		submittedIds.every((id, index) => id === context.jadwalIds[index])
	);
}
