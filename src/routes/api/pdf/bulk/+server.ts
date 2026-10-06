import { error } from '@sveltejs/kit';
import { resolveSchoolPdfVariant } from '$lib/server/pdf/school-variant';
import { canPrintDocument } from '$lib/role-menu-access';
import { documentPdfFilename, pdfDisposition } from '$lib/pdf-filename';
import { generateBulkPDF, type DocumentType, type PdfVariant } from '$lib/server/pdf/generate';
import { getRaporPreviewPayload } from '../../../cetak/rapor/preview-data';
import { getCoverPreviewPayload } from '../../../cetak/cover/preview-data';
import { getBiodataPreviewPayload } from '../../../cetak/biodata/preview-data';
import { getKeasramaanPreviewPayload } from '../../../cetak/keasramaan/preview-data';
import { getPiagamPreviewPayload } from '../../../cetak/piagam/preview-data';
import { getKartuAbsensiPreviewPayload } from '../../../cetak/kartu-absensi/preview-data';

import type { RequestHandler } from './$types';

type BulkRequest = {
	docType: DocumentType;
	muridIds: number[];
	kelasId?: number;
	tpMode?: string;
	criteria?: { kritCukup: number; kritBaik: number };
	template?: '1' | '2';
	pdfVariant?: PdfVariant;
	docLabel?: string;
	kelasLabel?: string;
	bgLogo?: boolean;
	raporPeriode?: string;
	parentSignature?: string;
	kartuLayout?: 'duplex' | 'photo-qr' | 'qr-only';
};

const MAX_BULK_MURID = 500;
const BULK_DATA_CONCURRENCY = 12;

function normalizeMuridIds(value: unknown): number[] {
	if (!Array.isArray(value)) return [];
	return [...new Set(value.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

async function fetchStudentData(
	locals: App.Locals,
	body: BulkRequest,
	muridId: number
): Promise<Record<string, unknown>> {
	const url = new URL('http://localhost');
	url.searchParams.set('murid_id', String(muridId));
	if (body.kelasId) url.searchParams.set('kelas_id', String(body.kelasId));
	if (body.tpMode === 'full-desc') url.searchParams.set('full_tp', 'desc');
	if (body.criteria) {
		url.searchParams.set('krit_cukup', String(body.criteria.kritCukup));
		url.searchParams.set('krit_baik', String(body.criteria.kritBaik));
	}
	if (body.bgLogo) url.searchParams.set('bg_logo', '1');
	if (body.raporPeriode) url.searchParams.set('rapor_periode', body.raporPeriode);
	if (
		body.parentSignature === 'ayah' ||
		body.parentSignature === 'ibu' ||
		body.parentSignature === 'wali'
	) {
		url.searchParams.set('ttd_wali', body.parentSignature);
	}
	if (body.docType === 'kartu-absensi') {
		const layout =
			body.kartuLayout === 'photo-qr' || body.kartuLayout === 'qr-only'
				? body.kartuLayout
				: 'duplex';
		url.searchParams.set('kartu_layout', layout);
	}

	switch (body.docType) {
		case 'rapor': {
			const payload = await getRaporPreviewPayload({ locals, url });
			return payload.raporData as unknown as Record<string, unknown>;
		}
		case 'cover': {
			const payload = await getCoverPreviewPayload({ locals, url });
			return payload.coverData as unknown as Record<string, unknown>;
		}
		case 'biodata': {
			const payload = await getBiodataPreviewPayload({ locals, url });
			return payload.biodataData as unknown as Record<string, unknown>;
		}
		case 'keasramaan': {
			const payload = await getKeasramaanPreviewPayload({ locals, url });
			if (!payload) throw error(400, 'Data rapor keasramaan tidak ditemukan.');
			return payload.keasramaanData as unknown as Record<string, unknown>;
		}
		case 'piagam': {
			const payload = await getPiagamPreviewPayload({ locals, url });
			return payload.piagamData as unknown as Record<string, unknown>;
		}
		case 'kartu-absensi': {
			const payload = await getKartuAbsensiPreviewPayload({ locals, url });
			return payload.kartuAbsensiData as unknown as Record<string, unknown>;
		}
		default:
			throw error(400, `Unknown document type: ${body.docType}`);
	}
}

export const POST = (async ({ locals, request }) => {
	const body: BulkRequest = await request.json();
	const variant: PdfVariant = resolveSchoolPdfVariant(body.docType, locals);
	const muridIds = normalizeMuridIds(body.muridIds);

	if (!locals.user || !locals.sekolah?.id) {
		throw error(401, 'Sesi sekolah tidak valid. Silakan masuk kembali.');
	}
	if (!body.docType || !muridIds.length) {
		throw error(400, 'Parameter docType dan muridIds wajib diisi.');
	}
	if (muridIds.length > MAX_BULK_MURID) {
		throw error(
			413,
			`Maksimal ${MAX_BULK_MURID} murid dalam satu PDF. Cetak per jenjang atau kelas untuk data yang lebih besar.`
		);
	}
	if (!canPrintDocument(locals.user, body.docType)) {
		throw error(403, 'Jenis dokumen tidak diizinkan untuk akun ini.');
	}

	const allData: Record<string, unknown>[] = [];
	for (let index = 0; index < muridIds.length; index += BULK_DATA_CONCURRENCY) {
		const batch = muridIds.slice(index, index + BULK_DATA_CONCURRENCY);
		allData.push(
			...(await Promise.all(batch.map((muridId) => fetchStudentData(locals, body, muridId))))
		);
	}

	const items = allData.map((data) => ({
		docType: body.docType,
		data,
		template: body.template,
		variant
	}));

	const pdfBuffer = await generateBulkPDF(items);
	const docLabel = body.docLabel || body.docType;
	const kelasLabel = body.kelasLabel || 'Semua-Kelas';
	const filename = documentPdfFilename(
		body.docType,
		allData[0],
		{ kelas: body.kelasLabel || 'Semua Kelas' },
		muridIds.length
	);

	return new Response(new Blob([pdfBuffer as unknown as BlobPart], { type: 'application/pdf' }), {
		headers: {
			'Content-Disposition': pdfDisposition(filename, 'attachment')
		}
	});
}) satisfies RequestHandler;
