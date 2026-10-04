import { error, json } from '@sveltejs/kit';
import { resolveSchoolPdfVariant } from '$lib/server/pdf/school-variant';
import { storePdfParams } from '$lib/server/pdf/token-store';
import { getCoverPreviewPayload } from '../../../cetak/cover/preview-data';
import { getRaporPreviewPayload } from '../../../cetak/rapor/preview-data';
import { getBiodataPreviewPayload } from '../../../cetak/biodata/preview-data';
import { getKeasramaanPreviewPayload } from '../../../cetak/keasramaan/preview-data';
import { getPiagamPreviewPayload } from '../../../cetak/piagam/preview-data';
import { getKartuAbsensiPreviewPayload } from '../../../cetak/kartu-absensi/preview-data';
import { getJadwalPelajaranPreviewPayload } from '../../../cetak/jadwal-pelajaran/preview-data';
import { getKalenderPendidikanPreviewPayload } from '../../../cetak/kalender-pendidikan/preview-data';
import type { RequestHandler } from './$types';

function slugify(text: string): string {
	return text
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^\w\s-]/g, '')
		.trim()
		.replace(/\s+/g, '-')
		.toLowerCase();
}

async function resolveNama(docType: string, locals: App.Locals, url: URL): Promise<string> {
	let nama = '';
	try {
		type PreviewData = Record<string, unknown>;
		let preview: PreviewData | null = null;
		switch (docType) {
			case 'cover': {
				const p = await getCoverPreviewPayload({ locals, url });
				preview = p.coverData as unknown as PreviewData | null;
				break;
			}
			case 'rapor': {
				const p = await getRaporPreviewPayload({ locals, url });
				preview = p.raporData as unknown as PreviewData | null;
				break;
			}
			case 'biodata': {
				const p = await getBiodataPreviewPayload({ locals, url });
				preview = p.biodataData as unknown as PreviewData | null;
				break;
			}
			case 'keasramaan': {
				const p = await getKeasramaanPreviewPayload({ locals, url });
				preview = p ? (p.keasramaanData as unknown as PreviewData | null) : null;
				break;
			}
			case 'piagam': {
				const p = await getPiagamPreviewPayload({ locals, url });
				preview = p.piagamData as unknown as PreviewData | null;
				break;
			}
			case 'kartu-absensi': {
				const p = await getKartuAbsensiPreviewPayload({ locals, url });
				preview = p.kartuAbsensiData as unknown as PreviewData | null;
				break;
			}
			case 'jadwal-pelajaran': {
				const p = await getJadwalPelajaranPreviewPayload({ locals, url });
				preview = p.jadwalPelajaranData as unknown as PreviewData | null;
				nama = (preview?.jenjangLabel as string) || 'Jadwal Pelajaran';
				break;
			}
			case 'kalender-pendidikan': {
				const p = await getKalenderPendidikanPreviewPayload({ locals, url });
				preview = p.kalenderPendidikanData as unknown as PreviewData | null;
				nama =
					(
						preview?.periode as
							{ label?: string; semester?: string; tahunPelajaran?: string } | undefined
					)?.label || 'Kalender Pendidikan';
				break;
			}
		}
		const muridName = (preview?.murid as Record<string, unknown> | undefined)?.nama as
			string | undefined;
		if (muridName) nama = muridName;
	} catch {
		// fallback
	}
	return nama;
}

export const POST = (async ({ locals, request }) => {
	const body = await request.json();
	const {
		docType,
		muridId,
		kelasId,
		tpMode,
		kriteria,
		template,
		bgLogo,
		raporPeriode,
		orientation,
		layoutMode: layoutModeRaw,
		jenjang,
		periodeMode,
		tahunAjaranId,
		jenisJadwal,
		semesterId,
		wakaKurikulumPegawaiId: wakaKurikulumPegawaiIdRaw
	} = body;
	const wakaKurikulumPegawaiId =
		Number.isInteger(Number(wakaKurikulumPegawaiIdRaw)) && Number(wakaKurikulumPegawaiIdRaw) > 0
			? Number(wakaKurikulumPegawaiIdRaw)
			: undefined;
	const layoutMode = layoutModeRaw === 'multi' ? 'multi' : 'padat';
	const parentSignature =
		body.parentSignature === 'ayah' ||
		body.parentSignature === 'ibu' ||
		body.parentSignature === 'wali'
			? body.parentSignature
			: undefined;
	const kartuLayout =
		body.kartuLayout === 'photo-qr' || body.kartuLayout === 'qr-only' ? body.kartuLayout : 'duplex';
	const variant = resolveSchoolPdfVariant(docType, locals);

	if (locals.user?.type === 'wali_asrama' && docType !== 'kartu-absensi' && (docType !== 'keasramaan' || variant !== 'sr')) {
		throw error(403, 'Wali asrama hanya dapat mencetak Dokumen SR Rapor Keasramaan.');
	}

	const url = new URL('http://localhost');
	if (muridId) url.searchParams.set('murid_id', String(muridId));
	if (kelasId) url.searchParams.set('kelas_id', String(kelasId));
	if (tpMode === 'full-desc') url.searchParams.set('full_tp', 'desc');
	if (kriteria) {
		url.searchParams.set('krit_cukup', String(kriteria.kritCukup));
		url.searchParams.set('krit_baik', String(kriteria.kritBaik));
	}
	if (template) url.searchParams.set('template', template);
	if (bgLogo) url.searchParams.set('bg_logo', '1');
	if (raporPeriode) url.searchParams.set('rapor_periode', raporPeriode);
	if (parentSignature) url.searchParams.set('ttd_wali', parentSignature);
	if (orientation) url.searchParams.set('orientation', orientation);
	if (docType === 'jadwal-pelajaran') url.searchParams.set('layout_mode', layoutMode);
	if (jenjang) url.searchParams.set('jenjang', jenjang);
	if (periodeMode) url.searchParams.set('periode_mode', periodeMode);
	if (tahunAjaranId) url.searchParams.set('tahun_ajaran_id', String(tahunAjaranId));
	if (jenisJadwal) url.searchParams.set('jenis', jenisJadwal);
	if (semesterId) url.searchParams.set('semester_id', String(semesterId));
	if (wakaKurikulumPegawaiId) {
		url.searchParams.set('waka_kurikulum_pegawai_id', String(wakaKurikulumPegawaiId));
	}
	if (docType === 'kartu-absensi') url.searchParams.set('kartu_layout', kartuLayout);

	const docLabel = body.docLabel || docType;
	const nama = await resolveNama(docType, locals, url);
	const slug = `${docLabel}-${slugify(nama || 'dokumen')}`;

	const token = storePdfParams({
		docType,
		muridId,
		kelasId,
		tpMode,
		kritCukup: kriteria?.kritCukup,
		kritBaik: kriteria?.kritBaik,
		template,
		variant,
		bgLogo,
		raporPeriode,
		parentSignature,
		orientation,
		layoutMode: docType === 'jadwal-pelajaran' ? layoutMode : undefined,
		jenjang,
		periodeMode,
		tahunAjaranId,
		jenisJadwal,
		semesterId,
		wakaKurikulumPegawaiId,
		kartuLayout: docType === 'kartu-absensi' ? kartuLayout : undefined,
		slug
	});

	return json({ token, slug });
}) satisfies RequestHandler;
