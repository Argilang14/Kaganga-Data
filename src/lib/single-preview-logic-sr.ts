// Single Murid Preview Logic - Encapsulated & Testable

import {
	createPreviewURLSearchParams,
	type TPMode,
	type RaporCriteria,
	type RaporPeriode,
	type ParentSignatureChoice
} from '$lib/rapor-params';
import type { PreviewPayload } from '$lib/preview-types-sr';

export type MuridData = {
	id: number;
	nama: string;
	nis?: string | null;
	nisn?: string | null;
};

export type DocumentType =
	| 'cover'
	| 'biodata'
	| 'rapor'
	| 'piagam'
	| 'keasramaan'
	| 'kartu-absensi'
	| 'kartu-ujian'
	| 'jadwal-pelajaran'
	| 'kalender-pendidikan'
	| 'jurnal-mengajar'
	| 'rekap-absensi-kegiatan'
	| 'buku-tamu'
	| 'martikulasi-sk'
	| 'martikulasi-raport'
	| 'martikulasi-sttm';

export type { PreviewPayload } from '$lib/preview-types-sr';

export type PreviewState = {
	document: DocumentType | '';
	metaTitle: string;
	data: PreviewPayload | null;
	murid: MuridData | null;
	loading: boolean;
	error: string | null;
};

export type SinglePreviewRequest = {
	documentType: DocumentType;
	murid?: MuridData | null;
	kelasId?: number;
	tpMode: TPMode;
	criteria: RaporCriteria;
	raporPeriode?: RaporPeriode;
	parentSignature?: ParentSignatureChoice;
	extraParams?: Record<string, string | number | boolean | null | undefined>;
	signal?: AbortSignal;
};

const DOCUMENT_PATHS: Record<DocumentType, string> = {
	cover: '/cetak/cover',
	biodata: '/cetak/biodata',
	rapor: '/cetak/rapor',
	piagam: '/cetak/piagam',
	keasramaan: '/cetak/keasramaan',
	'kartu-absensi': '/cetak/kartu-absensi',
	'kartu-ujian': '/api/pdf/kartu-ujian',
	'jadwal-pelajaran': '/cetak/jadwal-pelajaran',
	'kalender-pendidikan': '/cetak/kalender-pendidikan',
	'jurnal-mengajar': '/api/pdf/jurnal-mengajar',
	'rekap-absensi-kegiatan': '/api/pdf/absensi-kegiatan',
	'buku-tamu': '/api/buku-tamu/print',
	'martikulasi-sk': '/api/pdf/martikulasi',
	'martikulasi-raport': '/api/pdf/martikulasi',
	'martikulasi-sttm': '/api/pdf/martikulasi'
};

const DOCUMENT_LABELS: Record<DocumentType, string> = {
	cover: 'Cover',
	biodata: 'Biodata',
	rapor: 'Rapor',
	piagam: 'Piagam',
	keasramaan: 'Rapor Keasramaan',
	'kartu-absensi': 'Kartu Absensi Murid',
	'kartu-ujian': 'Kartu Ujian',
	'jadwal-pelajaran': 'Jadwal Pelajaran',
	'kalender-pendidikan': 'Kalender Pendidikan',
	'jurnal-mengajar': 'Jurnal Mengajar',
	'rekap-absensi-kegiatan': 'Rekap Absensi Kegiatan',
	'buku-tamu': 'PDF Buku Tamu Digital',
	'martikulasi-sk': 'SK Tim Martikulasi',
	'martikulasi-raport': 'Raport Hasil Martikulasi',
	'martikulasi-sttm': 'Surat Tanda Tamat Martikulasi'
};

export async function loadSinglePreview(
	request: SinglePreviewRequest
): Promise<{ data: PreviewPayload; title: string }> {
	const path = DOCUMENT_PATHS[request.documentType];
	const label = DOCUMENT_LABELS[request.documentType];

	const params = createPreviewURLSearchParams({
		muridId: request.murid?.id,
		kelasId: request.kelasId,
		tpMode: request.tpMode,
		criteria: request.criteria,
		raporPeriode: request.raporPeriode,
		parentSignature: request.parentSignature
	});
	for (const [key, value] of Object.entries(request.extraParams ?? {})) {
		if (value !== null && value !== undefined && value !== '') {
			params.set(key, String(value));
		}
	}

	const response = await fetch(`${path}.json?${params.toString()}`, {
		signal: request.signal
	});

	if (!response.ok) {
		throw new Error(
			`Gagal memuat preview ${label}. Server tidak dapat menyiapkan dokumen. Coba lagi nanti.`
		);
	}

	const payload = (await response.json()) as PreviewPayload;
	const title =
		(payload.meta && typeof payload.meta === 'object' && 'title' in payload.meta
			? ((payload.meta as { title?: string | null }).title ?? '')
			: '') || (request.murid?.nama ? `${label} - ${request.murid.nama}` : label);

	return { data: payload, title };
}

export function resetPreviewState(): PreviewState {
	return {
		document: '',
		metaTitle: '',
		data: null,
		murid: null,
		loading: false,
		error: null
	};
}

export function isPreviewableDocument(value: DocumentType | ''): value is DocumentType {
	return (
		value === 'cover' ||
		value === 'biodata' ||
		value === 'rapor' ||
		value === 'piagam' ||
		value === 'keasramaan' ||
		value === 'kartu-absensi' ||
		value === 'kartu-ujian' ||
		value === 'jadwal-pelajaran' ||
		value === 'kalender-pendidikan' ||
		value === 'jurnal-mengajar' ||
		value === 'rekap-absensi-kegiatan' ||
		value === 'martikulasi-sk' ||
		value === 'martikulasi-raport' ||
		value === 'martikulasi-sttm'
	);
}

export function buildPreviewButtonTitle(
	selectedDocument: DocumentType | '',
	hasSelectionOptions: boolean,
	selectedMurid: MuridData | null,
	isPiagam: boolean
): string {
	if (!selectedDocument) return 'Pilih dokumen yang ingin di-preview terlebih dahulu';
	if (!hasSelectionOptions) {
		return isPiagam
			? 'Tidak ada data peringkat yang tersedia untuk piagam di kelas ini'
			: 'Tidak ada murid yang dapat di-preview untuk kelas ini';
	}
	if (!selectedMurid) {
		return isPiagam
			? 'Pilih peringkat piagam yang ingin di-preview terlebih dahulu'
			: 'Pilih murid yang ingin di-preview terlebih dahulu';
	}
	const label = DOCUMENT_LABELS[selectedDocument as DocumentType] ?? 'dokumen';
	return `Preview ${label} untuk ${selectedMurid.nama}`;
}
