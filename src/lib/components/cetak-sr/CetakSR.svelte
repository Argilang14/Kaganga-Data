<script lang="ts">
	/* eslint-disable @typescript-eslint/no-unused-vars */
	import { page } from '$app/state';
	import Icon from '$lib/components/icon.svelte';
	import GuestPdf from '$lib/components/cetak/GuestPdf.svelte';
	import { responsePdfFilename } from '$lib/pdf-filename';
	import PreviewHeader from '$lib/components/cetak-sr/PreviewHeader.svelte';
	import DocumentMuridSelector from '$lib/components/cetak-sr/DocumentMuridSelector.svelte';
	import PreviewFooter from '$lib/components/cetak-sr/PreviewFooter.svelte';
	import PreviewContent from '$lib/components/cetak-sr/PreviewContent.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import { tick, onMount } from 'svelte';
	import {
		loadSinglePreview,
		isPreviewableDocument,
		type DocumentType,
		type MuridData,
		type PreviewPayload
	} from '$lib/single-preview-logic-sr';
	import { loadBulkPreviews_robust, buildBulkErrorMessage } from '$lib/bulk-preview-logic-sr';
	import {
		DEFAULT_RAPOR_CRITERIA,
		type ParentSignatureChoice,
		type RaporPeriode
	} from '$lib/rapor-params';
	type Props = {
		data: {
			jurnalAccess?: {
				canPrint: boolean;
				requiresClass: boolean;
				allowedSigners: readonly ('wali_kelas' | 'guru_mapel')[];
				defaultScope: 'kelas' | 'mapel';
				defaultSigner: 'wali_kelas' | 'guru_mapel';
			};
			academicContext?: unknown;
			kelasId?: number | string | null;
			tahunAjaranList?: Array<{
				id: number;
				nama: string;
				semester: Array<{ id: number; nama: string; tipe: string }>;
			}>;
			activeTahunAjaranId?: number | null;
			activeSemesterId?: number | null;
			activeSemesterTipe?: string | null;
			tanggalMasuk?: string;
			tanggalBagiRaport?: string;
			pegawaiGuruList?: Array<{
				id: number;
				nama: string;
				nip: string;
				jabatan: string | null;
			}>;
			jurnalKelasList?: Array<{
				id: number;
				nama: string;
				fase: string | null;
				tahunAjaranId: number;
				semesterId: number;
				waliKelasId: number | null;
				waliKelas: { id: number; nama: string; nip: string | null } | null;
				tahunAjaran: { nama: string };
				semester: { nama: string; tipe: string };
			}>;
			jurnalMapelList?: Array<{
				id: number;
				kode: string;
				nama: string;
				jenjang: string;
				guruPegawaiId: number | null;
				guru: { id: number; nama: string; nip: string | null } | null;
			}>;
			daftarMurid?: Array<{ id: number; nama: string; nis?: string | null; nisn?: string | null }>;
			piagamRankingOptions?: Array<{
				muridId: number;
				peringkat: number;
				nama: string;
				nilaiRataRata: number | null;
			}>;
			ujianSessions?: Array<{
				id: number;
				nama: string;
				singkatan: string | null;
				tahunAjaran: string;
				semester: string | null;
				participantCount: number;
				classes: string[];
				rooms: string[];
			}>;
			absensiAccess?: boolean;
			absensiToday?: string;
			absensiKelasList?: Array<{ id: number; nama: string; fase: string | null }>;
			absensiKegiatanList?: Array<{ id: number; nama: string; kategori: string }>;
		};
		pdfVariant?: 'default' | 'sr';
		documentGroup?: 'dokumen' | 'raport';
	};

	let { data, pdfVariant: pdfVariantProp, documentGroup }: Props = $props();
	const pdfVariant = $derived(
		pdfVariantProp ?? (page.url.searchParams.get('sr') === '1' ? 'sr' : 'default')
	);
	const isSRVariant = $derived(pdfVariant === 'sr');

	const documentOptions: Array<{ value: DocumentType; label: string }> = [
		{ value: 'cover', label: 'Cover' },
		{ value: 'biodata', label: 'Biodata' },
		{ value: 'rapor', label: 'Rapor' },
		{ value: 'piagam', label: 'Piagam' },
		{ value: 'keasramaan', label: 'Rapor Keasramaan' },
		{ value: 'kartu-absensi', label: 'Kartu Absensi Murid' },
		{ value: 'kartu-ujian', label: 'Kartu Ujian' },
		{ value: 'jadwal-pelajaran', label: 'Jadwal Pelajaran' },
		{ value: 'kalender-pendidikan', label: 'Kalender Pendidikan' },
		{ value: 'jurnal-mengajar', label: 'Jurnal Mengajar' },
		{ value: 'rekap-absensi-kegiatan', label: 'Rekap Absensi Kegiatan' },
		{ value: 'buku-tamu', label: 'PDF Buku Tamu Digital' },
		{ value: 'martikulasi-sk', label: 'Masa Persiapan - SK Tim Martikulasi' },
		{ value: 'martikulasi-raport', label: 'Masa Persiapan - Raport Hasil Martikulasi' },
		{ value: 'martikulasi-sttm', label: 'Masa Persiapan - STTM' }
	];
	const currentUserType = $derived((page.data.user as { type?: string } | null | undefined)?.type);
	const visibleDocumentOptions = $derived.by(() => {
		const general = ['kartu-absensi', 'kartu-ujian', 'kartu-ujian-meja', 'jadwal-pelajaran', 'kalender-pendidikan', 'jurnal-mengajar', 'rekap-absensi-kegiatan', 'buku-tamu'];
		if (documentGroup === 'dokumen') return documentOptions.filter((option) => general.includes(option.value) && (option.value !== 'jurnal-mengajar' || data.jurnalAccess?.canPrint !== false) && (option.value !== 'rekap-absensi-kegiatan' || data.absensiAccess === true) && (option.value !== 'buku-tamu' || page.data.user?.type === 'admin' || page.data.user?.permissions?.includes('administrasi_buku_tamu')) && (!['kartu-ujian', 'kartu-ujian-meja'].includes(option.value) || page.data.user?.type === 'admin' || page.data.user?.permissions?.includes('ujian_cetak') || page.data.user?.permissions?.includes('ujian_manage')));
		if (documentGroup === 'raport') return documentOptions.filter((option) => !general.includes(option.value) && (currentUserType !== 'wali_asrama' || option.value === 'keasramaan'));
		if (currentUserType === 'wali_asrama') {
			return documentOptions.filter((option) => option.value === 'keasramaan');
		}
		return documentOptions.filter(
			(option) =>
				(!option.value.startsWith('martikulasi-') || isSRVariant) &&
				(((option.value !== 'jurnal-mengajar' || data.jurnalAccess?.canPrint !== false) &&
					option.value !== 'kartu-absensi' &&
					option.value !== 'jadwal-pelajaran' &&
					option.value !== 'kalender-pendidikan') ||
					isSRVariant)
		);
	});

	let selectedDocument = $state<DocumentType | ''>(
		page.url.searchParams.get('dokumen') === 'kartu-ujian-meja'
			? 'kartu-ujian'
			: ((page.url.searchParams.get('dokumen') as DocumentType) ?? '')
	);
	let selectedRaporPeriode = $state<RaporPeriode | ''>('');
	let selectedMuridId = $state('');
	let selectedTemplate = $state<'1' | '2'>('1');
	let previewDocument = $state<DocumentType | ''>('');
	let previewMetaTitle = $state('');
	let previewData = $state<PreviewPayload | null>(null);
	let previewMurid = $state<MuridData | null>(null);
	let previewPrintable = $state<HTMLDivElement | null>(null);
	let previewLoading = $state(false);
	let previewError = $state<string | null>(null);
	let showBgLogo = $state(true);
	let downloadLoading = $state(false);
	let jurnalTanggalMulai = $state('');
	let jurnalTanggalSelesai = $state('');
	let absensiTanggalAwal = $state(data.absensiToday ?? '');
	let absensiTanggalAkhir = $state(data.absensiToday ?? '');
	let absensiKelasId = $state<number | null>(
		data.absensiKelasList?.some((kelas) => kelas.id === Number(data.kelasId))
			? Number(data.kelasId)
			: (data.absensiKelasList?.[0]?.id ?? null)
	);
	let absensiKegiatanId = $state<number | null>(null);
	let jurnalScope = $state<'kelas' | 'mapel'>(data.jurnalAccess?.defaultScope ?? 'kelas');
	let jurnalKelasId = $state<number | null>(data.kelasId ? Number(data.kelasId) : null);
	let jurnalMapelId = $state<number | null>(null);
	let jurnalJenis = $state<'persiapan' | 'ganjil' | 'genap'>(
		data.activeSemesterTipe === 'genap' ? 'genap' : 'ganjil'
	);
	let jurnalPenandatangan = $state<'wali_kelas' | 'guru_mapel'>(
		data.jurnalAccess?.defaultSigner ?? 'wali_kelas'
	);
	let selectedJadwalOrientation = $state<'landscape' | 'portrait'>('landscape');
	let selectedJadwalLayout = $state<'padat' | 'multi'>('padat');
	let selectedKartuLayout = $state<'duplex' | 'photo-qr' | 'qr-only'>('duplex');
	let selectedUjianSessionId = $state<number | null>(
		Number(page.url.searchParams.get('session_id')) || data.ujianSessions?.[0]?.id || null
	);
	let selectedUjianKelas = $state('');
	let selectedUjianRuang = $state('');
	// Keep old desk-card links working under the merged document menu.
	let showUjianDeskCard = $state(page.url.searchParams.get('dokumen') === 'kartu-ujian-meja');
	let showUjianAttendanceQr = $state(false);
	let showUjianLmsAccount = $state(false);
	let showUjianDeskPrincipalSignature = $state(true);
	let selectedJadwalJenjang = $state<'semua' | 'srd' | 'srmp' | 'srma'>('semua');
	let selectedKalenderPeriode = $state<
		'tahun_kalender' | 'tahun_ajaran' | 'semester_ganjil' | 'semester_genap'
	>('tahun_ajaran');
	const tahunAjaranList = $derived(data.tahunAjaranList ?? []);
	const pegawaiGuruList = $derived(data.pegawaiGuruList ?? []);
	const jurnalKelasList = $derived(data.jurnalKelasList ?? []);
	const jurnalMapelList = $derived(data.jurnalMapelList ?? []);
	const ujianSessions = $derived(data.ujianSessions ?? []);
	const absensiKelasList = $derived(data.absensiKelasList ?? []);
	const absensiKegiatanList = $derived(data.absensiKegiatanList ?? []);
	const selectedUjianSession = $derived(
		ujianSessions.find((item) => item.id === selectedUjianSessionId) ?? null
	);
	const jurnalAccess = $derived(
		data.jurnalAccess ?? {
			canPrint: true,
			requiresClass: false,
			allowedSigners: ['wali_kelas', 'guru_mapel'] as const,
			defaultScope: 'kelas' as const,
			defaultSigner: 'wali_kelas' as const
		}
	);
	const jurnalKelas = $derived(jurnalKelasList.find((item) => item.id === jurnalKelasId) ?? null);
	const jurnalMapel = $derived(jurnalMapelList.find((item) => item.id === jurnalMapelId) ?? null);
	function initialWakaKurikulumId() {
		return (
			data.pegawaiGuruList?.find((pegawai) =>
				pegawai.jabatan?.toLocaleLowerCase('id-ID').includes('kurikulum')
			)?.id ?? null
		);
	}
	let selectedWakaKurikulumId = $state<number | null>(initialWakaKurikulumId());
	function initialPrintContext() {
		return {
			tahunAjaranId: data.activeTahunAjaranId ?? data.tahunAjaranList?.[0]?.id ?? null,
			jenis: data.activeSemesterTipe === 'genap' ? ('genap' as const) : ('ganjil' as const),
			semesterId: data.activeSemesterId ?? null
		};
	}
	const printContext = initialPrintContext();
	let selectedPrintTahunAjaranId = $state<number | null>(printContext.tahunAjaranId);
	let selectedJadwalJenis = $state<'persiapan' | 'ganjil' | 'genap'>(printContext.jenis);
	let selectedKalenderSemesterId = $state<number | null>(printContext.semesterId);
	const selectedPrintTahun = $derived(
		tahunAjaranList.find((tahun) => tahun.id === selectedPrintTahunAjaranId) ?? null
	);
	const kalenderSemesterOptions = $derived(selectedPrintTahun?.semester ?? []);
	const selectedKalenderSemester = $derived(
		kalenderSemesterOptions.find((semester) => semester.id === selectedKalenderSemesterId) ?? null
	);
	const jadwalSourceHref = $derived(
		`/rapor/jadwal-pelajaran?tahunAjaranId=${selectedPrintTahunAjaranId ?? ''}&jenis=${selectedJadwalJenis}`
	);
	const kalenderSourceHref = $derived(
		`/jadwal/kalender?tahun_ajaran_id=${selectedPrintTahunAjaranId ?? ''}&semester_id=${selectedKalenderSemesterId ?? ''}&jenjang=${selectedJadwalJenjang}`
	);

	$effect(() => {
		if (
			selectedKalenderSemesterId &&
			!kalenderSemesterOptions.some((semester) => semester.id === selectedKalenderSemesterId)
		) {
			selectedKalenderSemesterId = kalenderSemesterOptions[0]?.id ?? null;
		}
	});

	$effect(() => {
		const semester = selectedKalenderSemester;
		selectedKalenderPeriode = semester
			? semester.tipe === 'genap'
				? 'semester_genap'
				: 'semester_ganjil'
			: 'tahun_ajaran';
	});

	let pdfViewerUrl = $state('');
	let pdfViewerFilename = $state('Dokumen.pdf');
	let pdfViewerTitle = $state('');
	let pdfViewerEl = $state<HTMLElement | null>(null);
	const ujianSelectionKey = $derived(
		[selectedDocument, selectedUjianSessionId, selectedUjianKelas, selectedUjianRuang, showUjianDeskCard, showUjianAttendanceQr, showUjianLmsAccount, showUjianDeskPrincipalSignature].join('|')
	);
	let previousUjianSelectionKey = $state('');
	$effect(() => {
		const nextKey = ujianSelectionKey;
		if (previousUjianSelectionKey && previousUjianSelectionKey !== nextKey && pdfViewerUrl) {
			URL.revokeObjectURL(pdfViewerUrl);
			pdfViewerUrl = '';
			pdfViewerTitle = '';
		}
		previousUjianSelectionKey = nextKey;
	});
	const jurnalSelectionKey = $derived(
		[
			jurnalScope,
			jurnalKelasId,
			jurnalMapelId,
			jurnalJenis,
			jurnalTanggalMulai,
			jurnalTanggalSelesai,
			jurnalPenandatangan,
			showBgLogo
		].join('|')
	);
	let previousJurnalSelectionKey = $state('');

	$effect(() => {
		const nextKey = jurnalSelectionKey;
		if (previousJurnalSelectionKey && previousJurnalSelectionKey !== nextKey && pdfViewerUrl) {
			URL.revokeObjectURL(pdfViewerUrl);
			pdfViewerUrl = '';
			pdfViewerTitle = '';
		}
		previousJurnalSelectionKey = nextKey;
	});

	// show TP listing: 'compact' | 'full-desc'
	let fullTP = $state<'compact' | 'full-desc'>('compact');
	let parentSignature = $state<ParentSignatureChoice>('auto');

	// Kriteria intrakurikuler (defaults per spec)

	let kritCukup = $state<number>(DEFAULT_RAPOR_CRITERIA.kritCukup);
	let kritBaik = $state<number>(DEFAULT_RAPOR_CRITERIA.kritBaik);

	// Load persisted criteria from localStorage (if available)
	// Load persisted criteria from server (if available). Falls back to defaults.
	onMount(async () => {
		jurnalTanggalMulai = data.tanggalMasuk ?? '';
		jurnalTanggalSelesai = data.tanggalBagiRaport ?? '';
		try {
			const res = await fetch('/api/sekolah/rapor-kriteria');
			if (res.ok) {
				const json = await res.json();
				const lc = json?.cukup;
				const lb = json?.baik;
				if (lc !== undefined && !Number.isNaN(Number(lc))) kritCukup = Number(lc);
				if (lb !== undefined && !Number.isNaN(Number(lb))) kritBaik = Number(lb);
			}
		} catch {
			// ignore network errors — keep defaults
		}
	});

	// bulk print state
	let isBulkMode = $state(false);
	let bulkPreviewData = $state<Array<{ murid: MuridData; data: PreviewPayload }>>([]);
	let bulkPrintableNodes = $state<HTMLDivElement[]>([]);
	let waitingForPrintable = $state(false);
	let bulkLoadProgress = $state<{ current: number; total: number } | null>(null);
	let qrReadiness = $state<{
		total: number;
		ready: number;
		missing: number;
		outdated: number;
		generated: number;
	} | null>(null);
	let qrReadinessLoading = $state(false);
	let qrGenerateLoading = $state(false);
	let qrReadinessError = $state<string | null>(null);

	// increment this to bust background cache after upload
	let bgRefreshKey = $state<number>(0);

	const academicContext = $derived((data.academicContext ?? null) as never);

	const kelasAktif = $derived(page.data.kelasAktif ?? null);
	const kelasAktifLabel = $derived.by(() => {
		if (!kelasAktif) return null;
		return kelasAktif.fase ? `${kelasAktif.nama} - ${kelasAktif.fase}` : kelasAktif.nama;
	});

	const piagamRankingOptions = $derived(data.piagamRankingOptions ?? []);
	const hasPiagamRankingOptions = $derived.by(() => piagamRankingOptions.length > 0);
	const daftarMurid = $derived(data.daftarMurid ?? []);
	const muridCount = $derived.by(() => daftarMurid.length);
	const hasMurid = $derived.by(() => muridCount > 0);
	const selectedMurid = $derived.by<MuridData | null>(() => {
		const murid = daftarMurid.find((item) => String(item.id) === selectedMuridId);
		return murid
			? {
					id: murid.id,
					nama: murid.nama,
					nis: murid.nis,
					nisn: murid.nisn
				}
			: null;
	});
	const isPiagamSelected = $derived.by(() => selectedDocument === 'piagam');
	const isJadwalSelected = $derived.by(() => selectedDocument === 'jadwal-pelajaran');
	const isKalenderSelected = $derived.by(() => selectedDocument === 'kalender-pendidikan');
	const isJurnalSelected = $derived.by(() => selectedDocument === 'jurnal-mengajar');
	const isAbsensiKegiatanSelected = $derived.by(
		() => selectedDocument === 'rekap-absensi-kegiatan'
	);
	const isKartuUjianSelected = $derived(selectedDocument === 'kartu-ujian');
	const isKartuUjianMejaSelected = $derived(isKartuUjianSelected && showUjianDeskCard);
	const isMartikulasiSkSelected = $derived.by(() => selectedDocument === 'martikulasi-sk');
	const isMartikulasiSelected = $derived.by(() =>
		selectedDocument === 'martikulasi-sk' ||
		selectedDocument === 'martikulasi-raport' ||
		selectedDocument === 'martikulasi-sttm'
	);
	const qrNotReadyCount = $derived((qrReadiness?.missing ?? 0) + (qrReadiness?.outdated ?? 0));
	const hasValidJurnalPeriod = $derived.by(
		() =>
			Boolean(jurnalTanggalMulai && jurnalTanggalSelesai) &&
			jurnalTanggalMulai <= jurnalTanggalSelesai &&
			(!jurnalAccess.requiresClass || Boolean(jurnalKelasId)) &&
			(jurnalScope === 'kelas' ? Boolean(jurnalKelasId) : Boolean(jurnalMapelId)) &&
			jurnalAccess.allowedSigners.includes(jurnalPenandatangan) &&
			(jurnalPenandatangan === 'wali_kelas'
				? Boolean(jurnalKelas?.waliKelas)
				: Boolean(jurnalMapel?.guru))
	);

	function changeJurnalScope(scope: 'kelas' | 'mapel') {
		jurnalScope = scope;
		jurnalPenandatangan =
			scope === 'kelas' && jurnalAccess.allowedSigners.includes('wali_kelas')
				? 'wali_kelas'
				: 'guru_mapel';
		if (scope === 'kelas') jurnalMapelId = null;
	}
	const documentNeedsMurid = $derived.by(
		() =>
			selectedDocument !== 'jadwal-pelajaran' &&
			selectedDocument !== 'kalender-pendidikan' &&
			selectedDocument !== 'jurnal-mengajar' &&
			selectedDocument !== 'rekap-absensi-kegiatan' &&
			selectedDocument !== 'martikulasi-sk' &&
			selectedDocument !== 'kartu-ujian' && selectedDocument !== 'kartu-ujian-meja'
	);
	const navigationMuridIds = $derived.by(() => {
		if (isPiagamSelected) {
			return piagamRankingOptions.map((option) => String(option.muridId));
		}
		return daftarMurid.map((murid) => String(murid.id));
	});
	const selectedMuridIndex = $derived.by(() => {
		if (!selectedMuridId) return -1;
		return navigationMuridIds.findIndex((id) => id === selectedMuridId);
	});
	const hasPrevMurid = $derived.by(() => selectedMuridIndex > 0);
	const hasNextMurid = $derived.by(
		() => selectedMuridIndex >= 0 && selectedMuridIndex < navigationMuridIds.length - 1
	);
	const hasSelectionOptions = $derived.by(() => {
		if (isJadwalSelected || isKalenderSelected) return true;
		if (isJurnalSelected) return hasValidJurnalPeriod;
		if (isAbsensiKegiatanSelected) {
			return Boolean(
				absensiKelasId &&
				absensiTanggalAwal &&
				absensiTanggalAkhir &&
				absensiTanggalAwal <= absensiTanggalAkhir
			);
		}
		if (isKartuUjianSelected) return Boolean(selectedUjianSession?.participantCount);
		if (isMartikulasiSkSelected) return Boolean(selectedPrintTahunAjaranId);
		return isPiagamSelected ? hasPiagamRankingOptions : hasMurid;
	});
	const canNavigateMurid = $derived.by(() => {
		if (!selectedDocument || !documentNeedsMurid) return false;
		if (!hasSelectionOptions) return false;
		return selectedMuridIndex >= 0 && navigationMuridIds.length > 0;
	});
	const isPreviewMatchingSelection = $derived.by(() =>
		Boolean(previewDocument && selectedDocument && selectedDocument === previewDocument)
	);

	// Reset preview state when document selection changes
	$effect(() => {
		if (selectedDocument) {
			if (!visibleDocumentOptions.some((option) => option.value === selectedDocument)) {
				resetCetak();
				selectedDocument = '';
				return;
			}
			resetCetak();
		}
	});

	$effect(() => {
		if (isPiagamSelected) {
			const rankingOptions = piagamRankingOptions;
			if (!rankingOptions.length) {
				if (selectedMuridId) {
					selectedMuridId = '';
				}
				return;
			}
			if (
				selectedMuridId &&
				!rankingOptions.some((option) => String(option.muridId) === selectedMuridId)
			) {
				selectedMuridId = '';
			}
			return;
		}

		const list = daftarMurid;
		if (!list.length) {
			if (selectedMuridId) {
				selectedMuridId = '';
			}
			return;
		}
		if (selectedMuridId && !list.some((murid) => String(murid.id) === selectedMuridId)) {
			selectedMuridId = '';
		}
	});

	$effect(() => {
		if (selectedDocument !== 'kartu-absensi' || !daftarMurid.length) {
			qrReadiness = null;
			qrReadinessError = null;
			return;
		}
		void refreshQrReadiness();
	});

	const selectedDocumentEntry = $derived.by(
		() => documentOptions.find((option) => option.value === selectedDocument) ?? null
	);
	const previewDocumentEntry = $derived.by(
		() => documentOptions.find((option) => option.value === previewDocument) ?? null
	);
	const headingDocumentLabel = $derived.by(() => {
		if (previewDocumentEntry?.label) return previewDocumentEntry.label;
		if (selectedDocumentEntry?.label) return selectedDocumentEntry.label;
		return 'Dokumen';
	});
	const headingMuridName = $derived.by(() => {
		if (previewMurid?.nama) return previewMurid.nama;
		if (selectedMurid?.nama) return selectedMurid.nama;
		return '';
	});
	const headingTitle = $derived.by(() => {
		const parts: string[] = ['Cetak'];
		const docLabel = headingDocumentLabel.trim();
		if (docLabel) parts.push(docLabel);
		const muridLabel = headingMuridName.trim();
		if (muridLabel) parts.push(muridLabel);
		return parts.join(' - ');
	});

	const downloadDisabled = $derived.by(
		() =>
			!selectedDocument ||
			!hasSelectionOptions ||
			(documentNeedsMurid && !selectedMurid) ||
			downloadLoading
	);
	const downloadButtonTitle = $derived.by(() => {
		if (!selectedDocument) return 'Pilih dokumen terlebih dahulu';
		if (!hasSelectionOptions) {
			return isPiagamSelected
				? 'Tidak ada data peringkat piagam untuk kelas ini'
				: 'Tidak ada murid di kelas ini';
		}
		if (documentNeedsMurid && !selectedMurid) {
			return isPiagamSelected ? 'Pilih peringkat piagam' : 'Pilih murid';
		}
		if (downloadLoading) return 'Sedang membuat PDF...';
		if (isJadwalSelected) return 'Preview PDF Jadwal Pelajaran';
		if (isKalenderSelected) return 'Preview PDF Kalender Pendidikan';
		if (isJurnalSelected) {
			return hasValidJurnalPeriod
				? 'Preview PDF Jurnal Mengajar'
				: 'Pilih rentang tanggal jurnal yang valid';
		}
		if (isAbsensiKegiatanSelected) {
			return hasSelectionOptions
				? 'Preview PDF Rekap Absensi Kegiatan'
				: 'Pilih kelas dan rentang tanggal absensi yang valid';
		}
		if (isMartikulasiSelected) return 'Preview PDF dokumen Martikulasi';
		if (isKartuUjianSelected) return selectedUjianSession?.participantCount ? `Preview PDF ${isKartuUjianMejaSelected ? 'Kartu Ujian Meja' : 'Kartu Ujian'}` : 'Pilih sesi ujian yang memiliki peserta';
		return `Download PDF ${selectedDocumentEntry?.label ?? 'dokumen'} untuk ${selectedMurid?.nama ?? ''}`;
	});

	let previewAbortController: AbortController | null = null;
	let keydownHandler: ((event: KeyboardEvent) => void) | null = null;

	function resetCetak() {
		previewDocument = '';
		previewMetaTitle = '';
		previewData = null;
		previewMurid = null;
		previewPrintable = null;
		isBulkMode = false;
		bulkPreviewData = [];
		bulkPrintableNodes = [];
		waitingForPrintable = false;
	}

	const docLabel = $derived.by(() => {
		const base =
			selectedDocumentEntry?.label?.replace(/\s+/g, '-')?.toLowerCase() ?? selectedDocument;
		if (selectedDocument === 'rapor' && selectedRaporPeriode === 'rts') {
			return 'rapor-tengah-semester';
		}
		return base;
	});

	async function handleDownloadSingle() {
		const documentType = selectedDocument;
		if (!documentType) {
			toast('Pilih dokumen terlebih dahulu', 'warning');
			return;
		}
		if (!isPreviewableDocument(documentType)) {
			return;
		}
		if (!hasSelectionOptions) {
			const message =
				documentType === 'jurnal-mengajar'
					? 'Pilih rentang tanggal jurnal yang valid.'
					: documentType === 'rekap-absensi-kegiatan'
						? 'Pilih kelas dan rentang tanggal absensi yang valid.'
					: documentType === 'piagam'
						? 'Tidak ada data peringkat piagam untuk kelas ini.'
						: 'Tidak ada murid di kelas ini.';
			toast(message, 'warning');
			return;
		}
		const murid = selectedMurid;
		if (
			documentType === 'jadwal-pelajaran' ||
			documentType === 'kalender-pendidikan' ||
			documentType === 'jurnal-mengajar' ||
			documentType === 'rekap-absensi-kegiatan' ||
			documentType === 'martikulasi-sk' ||
			documentType === 'kartu-ujian' || documentType === 'kartu-ujian-meja'
		) {
			await loadPdf(null);
			return;
		}
		if (!murid) {
			const message =
				documentType === 'piagam'
					? 'Pilih peringkat piagam yang ingin diunduh.'
					: 'Pilih murid yang ingin diunduh.';
			toast(message, 'warning');
			return;
		}

		await loadPdf(murid);
	}

	async function scrollToViewer() {
		await tick();
		pdfViewerEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	async function responseErrorMessage(response: Response, fallback: string) {
		const text = await response.text();
		try {
			const payload = JSON.parse(text) as { message?: string; error?: string };
			return payload.message || payload.error || fallback;
		} catch {
			return text || fallback;
		}
	}

	async function loadPdf(murid: MuridData | null) {
		const documentType = selectedDocument;
		if (!documentType) return;
		downloadLoading = true;
		try {
			if (documentType === 'rekap-absensi-kegiatan') {
				if (!absensiKelasId) throw new Error('Pilih kelas absensi terlebih dahulu.');
				const params = new URLSearchParams({
					tanggal_awal: absensiTanggalAwal,
					tanggal_akhir: absensiTanggalAkhir,
					kelas_id: String(absensiKelasId)
				});
				if (absensiKegiatanId) params.set('kegiatan_id', String(absensiKegiatanId));
				const pdfRes = await fetch(`/api/pdf/absensi-kegiatan?${params}`);
				if (!pdfRes.ok) {
					throw new Error(
						await responseErrorMessage(pdfRes, 'Gagal memuat rekap absensi kegiatan')
					);
				}
				const blob = await pdfRes.blob();
				pdfViewerFilename = responsePdfFilename(pdfRes);
				if (pdfViewerUrl) URL.revokeObjectURL(pdfViewerUrl);
				pdfViewerUrl = URL.createObjectURL(blob);
				pdfViewerTitle = `Rekap Absensi Kegiatan ${absensiTanggalAwal} - ${absensiTanggalAkhir}`;
				await scrollToViewer();
				toast('PDF Rekap Absensi Kegiatan berhasil dimuat', 'success');
				return;
			}
			if (documentType === 'kartu-ujian' || documentType === 'kartu-ujian-meja') {
				if (!selectedUjianSessionId) throw new Error('Pilih sesi ujian terlebih dahulu.');
				const selectionKey = ujianSelectionKey;
				const isDeskCard = isKartuUjianMejaSelected;
				const cardLabel = isDeskCard ? 'Kartu Ujian Meja' : 'Kartu Ujian';
				const sessionLabel = selectedUjianSession?.singkatan || selectedUjianSession?.nama || '';
				const params = new URLSearchParams({ session_id: String(selectedUjianSessionId) });
				params.set('layout', isDeskCard ? 'meja' : 'kartu');
				params.set('qr_absensi', !isDeskCard && showUjianAttendanceQr ? '1' : '0');
				params.set('akun_lms', showUjianLmsAccount ? '1' : '0');
				if (isDeskCard) params.set('ttd_kepsek', showUjianDeskPrincipalSignature ? '1' : '0');
				if (selectedUjianKelas) params.set('kelas', selectedUjianKelas);
				if (selectedUjianRuang) params.set('ruang', selectedUjianRuang);
				const pdfRes = await fetch(`/api/pdf/kartu-ujian?${params}`);
				if (!pdfRes.ok) throw new Error(await responseErrorMessage(pdfRes, 'Gagal memuat kartu ujian'));
				const blob = await pdfRes.blob();
				if (selectionKey !== ujianSelectionKey) return;
				pdfViewerFilename = responsePdfFilename(pdfRes);
				if (pdfViewerUrl) URL.revokeObjectURL(pdfViewerUrl);
				pdfViewerUrl = URL.createObjectURL(blob);
				pdfViewerTitle = `${cardLabel} - ${sessionLabel}`;
				await scrollToViewer();
				toast(`PDF ${cardLabel} berhasil dimuat`, 'success');
				return;
			}
			if (
				documentType === 'martikulasi-sk' ||
				documentType === 'martikulasi-raport' ||
				documentType === 'martikulasi-sttm'
			) {
				const jenis = documentType === 'martikulasi-sk' ? 'sk' : documentType === 'martikulasi-raport' ? 'raport' : 'sttm';
				const params = new URLSearchParams({
					jenis,
					tahun_ajaran_id: String(selectedPrintTahunAjaranId ?? '')
				});
				if (data.kelasId) params.set('kelas_id', String(data.kelasId));
				if (murid) params.set('murid_id', String(murid.id));
				if (documentType === 'martikulasi-sttm' && murid) params.set('draft', '1');
				params.set('bg_logo', showBgLogo ? '1' : '0');
				const pdfRes = await fetch(`/api/pdf/martikulasi?${params}`);
				if (!pdfRes.ok) {
					throw new Error(await responseErrorMessage(pdfRes, 'Gagal memuat dokumen Martikulasi'));
				}
				const blob = await pdfRes.blob();
				pdfViewerFilename = responsePdfFilename(pdfRes);
				if (pdfViewerUrl) URL.revokeObjectURL(pdfViewerUrl);
				pdfViewerUrl = URL.createObjectURL(blob);
				pdfViewerTitle = selectedDocumentEntry?.label ?? 'Dokumen Martikulasi';
				await scrollToViewer();
				toast('PDF Martikulasi berhasil dimuat', 'success');
				return;
			}
			if (documentType === 'jurnal-mengajar') {
				const params = new URLSearchParams({
					tanggal_mulai: jurnalTanggalMulai,
					tanggal_selesai: jurnalTanggalSelesai,
					lingkup: jurnalScope,
					jenis_jadwal: jurnalJenis,
					penandatangan: jurnalPenandatangan
				});
				if (jurnalKelasId) params.set('kelas_id', String(jurnalKelasId));
				if (jurnalMapelId) params.set('mapel_id', String(jurnalMapelId));
				params.set('bg_logo', showBgLogo ? '1' : '0');
				const pdfRes = await fetch(`/api/pdf/jurnal-mengajar?${params}`);
				if (!pdfRes.ok) {
					const message = await pdfRes.text();
					throw new Error(message || 'Gagal memuat PDF Jurnal Mengajar');
				}
				const blob = await pdfRes.blob();
				pdfViewerFilename = responsePdfFilename(pdfRes);
				if (pdfViewerUrl) URL.revokeObjectURL(pdfViewerUrl);
				pdfViewerUrl = URL.createObjectURL(blob);
				pdfViewerTitle = `Jurnal Mengajar ${jurnalScope === 'kelas' ? jurnalKelas?.nama : jurnalMapel?.nama} ${jurnalTanggalMulai} - ${jurnalTanggalSelesai}`;
				await scrollToViewer();
				toast('PDF Jurnal Mengajar berhasil dimuat', 'success');
				return;
			}

			const res = await fetch('/api/pdf/token', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					docType: documentType,
					muridId: murid?.id,
					kelasId: data.kelasId ? Number(data.kelasId) : undefined,
					tpMode: fullTP,
					kriteria: { kritCukup, kritBaik },
					template: documentType === 'piagam' ? selectedTemplate : undefined,
					pdfVariant,
					docLabel,
					bgLogo: showBgLogo,
					raporPeriode:
						documentType === 'rapor' && selectedRaporPeriode ? selectedRaporPeriode : undefined,
					parentSignature: documentType === 'rapor' ? parentSignature : undefined,
					orientation:
						documentType === 'jadwal-pelajaran' || documentType === 'kalender-pendidikan'
							? selectedJadwalOrientation
							: undefined,
					layoutMode: documentType === 'jadwal-pelajaran' ? selectedJadwalLayout : undefined,
					jenjang:
						documentType === 'jadwal-pelajaran' || documentType === 'kalender-pendidikan'
							? selectedJadwalJenjang
							: undefined,
					periodeMode: documentType === 'kalender-pendidikan' ? selectedKalenderPeriode : undefined,
					tahunAjaranId:
						documentType === 'jadwal-pelajaran' || documentType === 'kalender-pendidikan'
							? selectedPrintTahunAjaranId
							: undefined,
					jenisJadwal: documentType === 'jadwal-pelajaran' ? selectedJadwalJenis : undefined,
					semesterId:
						documentType === 'kalender-pendidikan' ? selectedKalenderSemesterId : undefined,
					wakaKurikulumPegawaiId:
						documentType === 'jadwal-pelajaran' || documentType === 'kalender-pendidikan'
							? selectedWakaKurikulumId
							: undefined,
					kartuLayout: documentType === 'kartu-absensi' ? selectedKartuLayout : undefined
				})
			});
			if (!res.ok) throw new Error('Gagal mendapatkan token');
			const { token, slug } = await res.json();

			const pdfRes = await fetch(`/cetak/pdf/${slug}/${token}`);
			if (!pdfRes.ok) throw new Error('Gagal memuat PDF');
			const blob = await pdfRes.blob();
			pdfViewerFilename = responsePdfFilename(pdfRes);

			if (pdfViewerUrl) URL.revokeObjectURL(pdfViewerUrl);
			pdfViewerUrl = URL.createObjectURL(blob);
			pdfViewerTitle = slug
				.split('-')
				.map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
				.join(' ');

			scrollToViewer();

			toast('PDF berhasil dimuat', 'success');
		} catch (err) {
			console.error('Download error:', err);
			toast(err instanceof Error ? err.message : 'Gagal membuka PDF', 'error');
		} finally {
			downloadLoading = false;
		}
	}

	async function navigateMurid(direction: 'prev' | 'next') {
		if (!canNavigateMurid) return;
		const list = navigationMuridIds;
		const currentIndex = selectedMuridIndex;
		if (currentIndex < 0) return;
		const offset = direction === 'next' ? 1 : -1;
		const targetIndex = currentIndex + offset;
		if (targetIndex < 0 || targetIndex >= list.length) return;
		const targetId = list[targetIndex];
		const wasViewerOpen = !!pdfViewerUrl;
		selectedMuridId = targetId;
		await tick();
		if (wasViewerOpen) {
			const murid = selectedMurid;
			if (murid) loadPdf(murid);
		}
	}

	async function requestQrReadiness(action: 'status' | 'generate-missing') {
		const response = await fetch('/api/absensi/kartu-qr', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action,
				muridIds: daftarMurid.map((murid) => murid.id)
			})
		});
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) {
			throw new Error(payload?.message ?? 'Status QR murid tidak dapat diperiksa.');
		}
		return payload as NonNullable<typeof qrReadiness>;
	}

	async function refreshQrReadiness() {
		qrReadinessLoading = true;
		qrReadinessError = null;
		try {
			qrReadiness = await requestQrReadiness('status');
		} catch (err) {
			qrReadiness = null;
			qrReadinessError = err instanceof Error ? err.message : 'Status QR murid tidak tersedia.';
		} finally {
			qrReadinessLoading = false;
		}
	}

	async function generateMissingQr() {
		qrGenerateLoading = true;
		qrReadinessError = null;
		try {
			qrReadiness = await requestQrReadiness('generate-missing');
			toast(
				qrReadiness.generated
					? `${qrReadiness.generated} QR murid berhasil dibuat. QR aktif lainnya tetap dipertahankan.`
					: 'Semua murid sudah memiliki QR aktif yang dapat dicetak.',
				'success'
			);
		} catch (err) {
			qrReadinessError = err instanceof Error ? err.message : 'Gagal membuat QR murid.';
			toast(qrReadinessError, 'error');
		} finally {
			qrGenerateLoading = false;
		}
	}

	async function handleDownloadBulk() {
		const documentType = selectedDocument;
		if (documentType === 'jurnal-mengajar') {
			toast('Jurnal Mengajar dicetak berdasarkan akun guru, bukan per murid.', 'warning');
			return;
		}
		if (!documentType) {
			toast('Pilih dokumen terlebih dahulu', 'warning');
			return;
		}
		if (!isPreviewableDocument(documentType)) {
			return;
		}
		if (
			documentType === 'martikulasi-raport' ||
			documentType === 'martikulasi-sttm'
		) {
			downloadLoading = true;
			try {
				const params = new URLSearchParams({
					jenis: documentType === 'martikulasi-raport' ? 'raport' : 'sttm',
					tahun_ajaran_id: String(selectedPrintTahunAjaranId ?? ''),
					massal: '1'
				});
				if (data.kelasId) params.set('kelas_id', String(data.kelasId));
				params.set('bg_logo', showBgLogo ? '1' : '0');
				const response = await fetch(`/api/pdf/martikulasi?${params}`);
				if (!response.ok) {
					throw new Error(
						await responseErrorMessage(response, 'Gagal membuat PDF Martikulasi massal')
					);
				}
				const blob = await response.blob();
				const url = URL.createObjectURL(blob);
				const anchor = document.createElement('a');
				anchor.href = url;
				anchor.download = responsePdfFilename(response);
				anchor.click();
				setTimeout(() => URL.revokeObjectURL(url), 1000);
				toast('PDF Martikulasi massal berhasil dibuat', 'success');
			} catch (err) {
				toast(err instanceof Error ? err.message : 'Gagal membuat PDF Martikulasi massal', 'error');
			} finally {
				downloadLoading = false;
			}
			return;
		}

		const muridList = isPiagamSelected
			? piagamRankingOptions.map((option) => ({
					id: option.muridId,
					nama: option.nama,
					nis: null,
					nisn: null
				}))
			: daftarMurid;

		if (!muridList.length) {
			const message = isPiagamSelected
				? 'Tidak ada data peringkat piagam untuk kelas ini.'
				: 'Tidak ada murid di kelas ini.';
			toast(message, 'warning');
			return;
		}
		if (documentType === 'kartu-absensi') {
			try {
				const status = await requestQrReadiness('status');
				qrReadiness = status;
				if (status.missing + status.outdated > 0) {
					toast(
						`${status.missing + status.outdated} murid belum memiliki QR siap cetak. Gunakan tombol Buat QR yang Belum Siap.`,
						'warning'
					);
					return;
				}
			} catch (err) {
				const message = err instanceof Error ? err.message : 'Status QR murid tidak tersedia.';
				qrReadinessError = message;
				toast(message, 'error');
				return;
			}
		}

		downloadLoading = true;

		try {
			const res = await fetch('/api/pdf/bulk', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					docType: documentType,
					muridIds: muridList.map((m) => m.id),
					kelasId: data.kelasId ? Number(data.kelasId) : undefined,
					tpMode: fullTP === 'full-desc' ? 'full-desc' : undefined,
					criteria: { kritCukup, kritBaik },
					template: documentType === 'piagam' ? selectedTemplate : undefined,
					pdfVariant,
					docLabel: selectedDocumentEntry?.label ?? documentType,
					kelasLabel: kelasAktifLabel ? kelasAktifLabel.replace(/\s+/g, '') : 'Semua-Kelas',
					bgLogo: showBgLogo,
					raporPeriode:
						documentType === 'rapor' && selectedRaporPeriode ? selectedRaporPeriode : undefined,
					parentSignature: documentType === 'rapor' ? parentSignature : undefined,
					kartuLayout: documentType === 'kartu-absensi' ? selectedKartuLayout : undefined
				})
			});

			if (!res.ok) {
				const errBody = await res.json().catch(() => ({}));
				throw new Error(errBody?.message || 'Gagal membuat PDF bulk');
			}

			const blob = await res.blob();
			const filename = responsePdfFilename(res);
			if (documentType === 'kartu-absensi') {
				if (pdfViewerUrl) URL.revokeObjectURL(pdfViewerUrl);
				pdfViewerUrl = URL.createObjectURL(blob);
				pdfViewerFilename = filename;
				pdfViewerTitle = `Preview Kartu Absensi - ${muridList.length} Murid`;
				await scrollToViewer();
				toast('Preview kartu absensi massal berhasil dimuat.', 'success');
				return;
			}
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);

			toast('PDF berhasil dibuat!', 'success');
		} catch (err) {
			console.error('Bulk download error:', err);
			const errorMsg = err instanceof Error ? err.message : 'Gagal membuat PDF';
			toast(errorMsg, 'error');
		} finally {
			downloadLoading = false;
		}
	}

	function handlePrintableReady(node: HTMLDivElement | null) {
		previewPrintable = node;
	}

	function handleBulkPrintableReady(index: number, node: HTMLDivElement | null) {
		if (node) {
			bulkPrintableNodes[index] = node;
		}
	}

	// Watch for all bulk printable nodes to be ready
	$effect(() => {
		if (!isBulkMode || bulkPreviewData.length === 0) {
			return;
		}

		const nodes = bulkPrintableNodes;
		const expectedCount = bulkPreviewData.length;
		const readyCount = nodes.filter(Boolean).length;

		if (readyCount === expectedCount) {
			// All nodes are ready, but for rapor we need to wait for pagination
			const isRapor = previewDocument === 'rapor';
			const isFullDesc = fullTP === 'full-desc';

			// Delay calculation:
			// - Rapor + Full Desc: 800ms (reduced from 3s)
			// - Rapor + Compact: 600ms (reduced from 1.5s)
			// - Other docs: 200ms (reduced from 300ms)
			let delay = 200;
			if (isRapor) {
				delay = isFullDesc ? 800 : 600;
			}

			const timeoutId = setTimeout(() => {
				const wrapper = document.createElement('div');
				nodes.forEach((n) => {
					if (n) {
						const clone = n.cloneNode(true) as HTMLDivElement;
						wrapper.appendChild(clone);
					}
				});
				previewPrintable = wrapper;
				waitingForPrintable = false;
			}, delay);

			return () => clearTimeout(timeoutId);
		}

		// Safety timeout - if nodes aren't ready after 15 seconds, give up and use what we have
		const timeoutId = setTimeout(() => {
			if (readyCount > 0) {
				const wrapper = document.createElement('div');
				nodes.forEach((n) => {
					if (n) {
						const clone = n.cloneNode(true) as HTMLDivElement;
						wrapper.appendChild(clone);
					}
				});
				previewPrintable = wrapper;
				waitingForPrintable = false;
				console.warn(
					`Bulk preview timeout: only ${readyCount}/${expectedCount} nodes ready, proceeding anyway`
				);
			}
		}, 15000);

		return () => clearTimeout(timeoutId);
	});

	// When bulk mode showBgLogo changes, reset bulk nodes to wait for re-render
	$effect(() => {
		if (!isBulkMode) {
			return;
		}
		void showBgLogo; // track dependency
		bulkPrintableNodes = [];
		waitingForPrintable = true;
	});

	async function handleBgRefresh() {
		bgRefreshKey = Date.now();
	}
</script>

{#if selectedDocument === 'buku-tamu'}
	<div class="card bg-base-100 rounded-lg border border-none p-4 shadow-md">
		<h2 class="mb-1 text-2xl font-bold">Cetak - PDF Buku Tamu Digital</h2>
		<p class="text-base-content/65 mb-5 text-sm">
			Pilih rentang tanggal dan periksa hasil PDF sebelum mengunduh.
		</p>
		<label class="form-control mb-4 min-w-0">
			<span class="label-text mb-1">Pilih Dokumen</span>
			<select class="select select-bordered bg-base-100 w-full" bind:value={selectedDocument}>
				{#each visibleDocumentOptions as option}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</label>
		<GuestPdf />
	</div>
{:else}
<div class="card bg-base-100 rounded-lg border border-none p-4 shadow-md">

	<PreviewHeader
		{headingTitle}
		{kelasAktifLabel}
		{academicContext}
		{canNavigateMurid}
		{hasPrevMurid}
		{hasNextMurid}
		loading={downloadLoading}
		onNavigatePrev={() => navigateMurid('prev')}
		onNavigateNext={() => navigateMurid('next')}
	/>

	<DocumentMuridSelector
		bind:selectedDocument
		bind:selectedTemplate
		bind:selectedRaporPeriode
		bind:selectedMuridId
		{daftarMurid}
		{piagamRankingOptions}
		documentOptions={visibleDocumentOptions}
		onDownload={handleDownloadSingle}
		onBulkDownload={handleDownloadBulk}
		{downloadDisabled}
		{downloadButtonTitle}
		{downloadLoading}
	/>

	{#if isKartuUjianSelected}
		<div class="border-base-300 bg-base-200/35 mt-3 grid items-end gap-3 rounded-lg border p-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,.65fr)_auto]">
			<label class="form-control min-w-0">
				<span class="label-text mb-1">Sesi Ujian</span>
				<select class="select select-bordered bg-base-100 w-full" bind:value={selectedUjianSessionId} disabled={downloadLoading} onchange={() => { selectedUjianKelas = ''; selectedUjianRuang = ''; }}>
					<option value={null}>Pilih sesi ujian</option>
					{#each ujianSessions as session}
						<option value={session.id}>{session.singkatan || session.nama} · {session.tahunAjaran} ({session.participantCount} peserta)</option>
					{/each}
				</select>
			</label>
			<label class="form-control min-w-0">
				<span class="label-text mb-1">Kelas Peserta</span>
				<select class="select select-bordered bg-base-100 w-full" bind:value={selectedUjianKelas} disabled={!selectedUjianSession || downloadLoading}>
					<option value="">Semua kelas</option>
					{#each selectedUjianSession?.classes ?? [] as kelas}
						<option value={kelas}>{kelas}</option>
					{/each}
				</select>
			</label>
			<label class="form-control min-w-0">
				<span class="label-text mb-1">Ruang Ujian</span>
				<select class="select select-bordered bg-base-100 w-full" bind:value={selectedUjianRuang} disabled={!selectedUjianSession || downloadLoading}>
					<option value="">Semua ruang</option>
					{#each selectedUjianSession?.rooms ?? [] as ruang}
						<option value={ruang}>{ruang}</option>
					{/each}
				</select>
			</label>
			<a class="btn btn-soft" href="/ujian"><Icon name="gear" /> Kelola Sesi</a>
			<div class="md:col-span-2 xl:col-span-4 flex flex-wrap items-center gap-2 text-sm">
				<button
					type="button"
					class="btn btn-sm shadow-none"
					class:btn-success={showUjianDeskCard}
					class:btn-soft={!showUjianDeskCard}
					role="switch"
					aria-checked={showUjianDeskCard}
					aria-label="Kartu Ujian Meja"
					title="Gunakan format kartu ujian meja"
					disabled={downloadLoading}
					onclick={() => showUjianDeskCard = !showUjianDeskCard}
				>Kartu Ujian Meja {showUjianDeskCard ? 'ON' : 'OFF'}</button>
				{#if !isKartuUjianMejaSelected}
				<button
					type="button"
					class="btn btn-sm shadow-none"
					class:btn-success={showUjianAttendanceQr}
					class:btn-soft={!showUjianAttendanceQr}
					role="switch"
					aria-checked={showUjianAttendanceQr}
					aria-label="QR Absensi"
					title="Tampilkan QR absensi murid pada kartu ujian"
					disabled={downloadLoading}
					onclick={() => {
						showUjianAttendanceQr = !showUjianAttendanceQr;
						if (pdfViewerUrl) URL.revokeObjectURL(pdfViewerUrl);
						pdfViewerUrl = '';
						pdfViewerTitle = '';
					}}
				>QR Absensi {showUjianAttendanceQr ? 'ON' : 'OFF'}</button>
				{/if}
				<button
					type="button"
					class="btn btn-sm shadow-none"
					class:btn-success={showUjianLmsAccount}
					class:btn-soft={!showUjianLmsAccount}
					role="switch"
					aria-checked={showUjianLmsAccount}
					aria-label="Akun LMS"
					title="Tampilkan username dan password LMS pada kartu ujian"
					disabled={downloadLoading}
					onclick={() => {
						showUjianLmsAccount = !showUjianLmsAccount;
						if (pdfViewerUrl) URL.revokeObjectURL(pdfViewerUrl);
						pdfViewerUrl = '';
						pdfViewerTitle = '';
					}}
				>Akun LMS {showUjianLmsAccount ? 'ON' : 'OFF'}</button>
				{#if isKartuUjianMejaSelected}
					<button
						type="button"
						class="btn btn-sm shadow-none"
						class:btn-success={showUjianDeskPrincipalSignature}
						class:btn-soft={!showUjianDeskPrincipalSignature}
						role="switch"
						aria-checked={showUjianDeskPrincipalSignature}
						aria-label="TTD Kepsek"
						title="Tampilkan blok tanda tangan, nama, dan NIP kepala sekolah"
						disabled={downloadLoading}
						onclick={() => showUjianDeskPrincipalSignature = !showUjianDeskPrincipalSignature}
					>TTD Kepsek {showUjianDeskPrincipalSignature ? 'ON' : 'OFF'}</button>
				{/if}
				<span class="badge badge-outline">A4 Portrait</span>
				<span class="badge badge-outline">{isKartuUjianMejaSelected ? '8' : '4'} kartu per halaman</span>
			</div>
		</div>
	{/if}

	{#if selectedDocument === 'kartu-absensi' && daftarMurid.length}
		<div class="border-base-300 bg-base-200/40 mt-3 rounded-lg border px-4 py-3 text-sm">
			<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
				<div>
					<div class="font-semibold">Model kartu</div>
					<div class="text-base-content/65 text-xs">Ukuran asli 85,6 × 54 mm, 8 kartu per A4.</div>
				</div>
				<div class="join" role="group" aria-label="Model kartu pelajar dan absensi">
					<button
						class:btn-primary={selectedKartuLayout === 'duplex'}
						class="btn join-item btn-sm shadow-none"
						type="button"
						onclick={() => (selectedKartuLayout = 'duplex')}>Dua Sisi</button
					>
					<button
						class:btn-primary={selectedKartuLayout === 'photo-qr'}
						class="btn join-item btn-sm shadow-none"
						type="button"
						onclick={() => (selectedKartuLayout = 'photo-qr')}>Foto + QR</button
					>
					<button
						class:btn-primary={selectedKartuLayout === 'qr-only'}
						class="btn join-item btn-sm shadow-none"
						type="button"
						onclick={() => (selectedKartuLayout = 'qr-only')}>QR Saja</button
					>
				</div>
			</div>
			<div class="flex flex-wrap items-center gap-3">
				<span class="badge badge-outline whitespace-nowrap">A4 · 8 kartu · 85,6 × 54 mm</span>
			{#if qrReadinessLoading}
				<span class="loading loading-spinner loading-sm"></span>
				<span>Memeriksa kesiapan QR {daftarMurid.length} murid...</span>
			{:else if qrReadinessError}
				<Icon name="alert" />
				<span class="min-w-0 flex-1">{qrReadinessError}</span>
				<button class="btn btn-soft btn-sm shadow-none" type="button" onclick={refreshQrReadiness}>
					<Icon name="repeat" />
					Periksa Lagi
				</button>
			{:else if qrReadiness}
				<Icon name={qrNotReadyCount ? 'alert' : 'check'} />
				<div class="min-w-0 flex-1">
					<div class="font-semibold">
						{qrReadiness.ready} dari {qrReadiness.total} QR siap dicetak
					</div>
					{#if qrNotReadyCount}
						<div class="text-base-content/65 text-xs">
							{qrReadiness.missing} belum dibuat dan {qrReadiness.outdated} memakai format lama.
						</div>
					{:else}
						<div class="text-base-content/65 text-xs">
							Semua kartu dapat dicetak tanpa mengganti token QR aktif.
						</div>
					{/if}
				</div>
				{#if qrNotReadyCount}
					<button
						class="btn btn-primary btn-sm shadow-none"
						type="button"
						disabled={qrGenerateLoading}
						onclick={generateMissingQr}
					>
						{#if qrGenerateLoading}
							<span class="loading loading-spinner loading-sm"></span>
						{:else}
							<Icon name="plus" />
						{/if}
						Buat QR yang Belum Siap
					</button>
				{/if}
				{/if}
			</div>
		</div>
	{/if}

	{#if selectedDocument === 'rekap-absensi-kegiatan'}
		<div
			class="border-base-300 bg-base-200/30 mt-3 grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-2 xl:grid-cols-5"
		>
			<label class="form-control min-w-0">
				<span class="label-text mb-1">Tanggal Awal</span>
				<input class="input input-bordered bg-base-100 w-full" type="date" bind:value={absensiTanggalAwal} />
			</label>
			<label class="form-control min-w-0">
				<span class="label-text mb-1">Tanggal Akhir</span>
				<input class="input input-bordered bg-base-100 w-full" type="date" bind:value={absensiTanggalAkhir} />
			</label>
			<label class="form-control min-w-0">
				<span class="label-text mb-1">Kelas</span>
				<select class="select select-bordered bg-base-100 w-full" bind:value={absensiKelasId}>
					<option value={null}>Pilih kelas</option>
					{#each absensiKelasList as kelas (kelas.id)}
						<option value={kelas.id}>{kelas.nama}{kelas.fase ? ` - ${kelas.fase}` : ''}</option>
					{/each}
				</select>
			</label>
			<label class="form-control min-w-0">
				<span class="label-text mb-1">Kegiatan</span>
				<select class="select select-bordered bg-base-100 w-full" bind:value={absensiKegiatanId}>
					<option value={null}>Semua kegiatan</option>
					{#each absensiKegiatanList as kegiatan (kegiatan.id)}
						<option value={kegiatan.id}>{kegiatan.nama}</option>
					{/each}
				</select>
			</label>
			<a
				class="btn btn-outline h-12 min-h-12 w-full whitespace-normal text-center leading-tight"
				href={`/administrasi/absensi/kegiatan/rekap?kelas_id=${absensiKelasId ?? ''}&tanggal_awal=${absensiTanggalAwal}&tanggal_akhir=${absensiTanggalAkhir}${absensiKegiatanId ? `&kegiatan_id=${absensiKegiatanId}` : ''}`}
			>
				Buka Rekap Kegiatan
			</a>
		</div>
	{/if}

	{#if selectedDocument === 'jadwal-pelajaran' || selectedDocument === 'kalender-pendidikan'}
		<div
			class="border-base-300 bg-base-200/30 mt-3 grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-3 {selectedDocument ===
			'jadwal-pelajaran'
				? '2xl:grid-cols-7'
				: '2xl:grid-cols-[minmax(0,.85fr)_minmax(0,1fr)_minmax(0,.9fr)_minmax(0,.9fr)_minmax(0,1.75fr)_minmax(0,1.45fr)_minmax(0,1.25fr)]'}"
		>
			<label class="form-control min-w-0">
				<span class="label-text mb-1">Tahun Ajaran</span>
				<select
					class="select select-bordered bg-base-100 w-full min-w-0 pr-10"
					bind:value={selectedPrintTahunAjaranId}
				>
					{#each tahunAjaranList as tahun}
						<option value={tahun.id}>{tahun.nama}</option>
					{/each}
				</select>
			</label>
			{#if selectedDocument === 'jadwal-pelajaran'}
				<label class="form-control min-w-0">
					<span class="label-text mb-1">Jenis Jadwal</span>
					<select
						class="select select-bordered bg-base-100 w-full min-w-0 pr-10"
						bind:value={selectedJadwalJenis}
					>
						<option value="persiapan">Masa Persiapan</option>
						<option value="ganjil">Semester Ganjil</option>
						<option value="genap">Semester Genap</option>
					</select>
				</label>
			{:else}
				<label class="form-control min-w-0">
					<span class="label-text mb-1">Semester</span>
					<select
						class="select select-bordered bg-base-100 w-full min-w-0 pr-10"
						bind:value={selectedKalenderSemesterId}
					>
						<option value={null}>Semua Semester</option>
						{#each kalenderSemesterOptions as semester}
							<option value={semester.id}>{semester.nama}</option>
						{/each}
					</select>
				</label>
			{/if}
			<label class="form-control min-w-0">
				<span class="label-text mb-1">Jenjang</span>
				<select
					class="select select-bordered bg-base-100 w-full min-w-0 pr-10"
					bind:value={selectedJadwalJenjang}
				>
					<option value="semua">Semua Jenjang</option>
					<option value="srd">SRD</option>
					<option value="srmp">SRMP</option>
					<option value="srma">SRMA</option>
				</select>
			</label>
			<label class="form-control min-w-0">
				<span class="label-text mb-1">Orientasi A4</span>
				<select
					class="select select-bordered bg-base-100 w-full min-w-0 pr-10"
					bind:value={selectedJadwalOrientation}
				>
					<option value="landscape">Landscape</option>
					<option value="portrait">Portrait</option>
				</select>
			</label>
			{#if selectedDocument === 'jadwal-pelajaran'}
				<label class="form-control min-w-0">
					<span class="label-text mb-1">Tampilan Tabel</span>
					<select
						class="select select-bordered bg-base-100 w-full min-w-0 pr-10"
						bind:value={selectedJadwalLayout}
					>
						<option value="padat">Padat (1 Halaman)</option>
						<option value="multi">Mudah Dibaca (Multi Halaman)</option>
					</select>
				</label>
			{/if}
			{#if selectedDocument === 'kalender-pendidikan'}
				<label class="form-control min-w-0">
					<span class="label-text mb-1">Periode Kalender</span>
					<select
						class="select select-bordered bg-base-100 w-full min-w-0 pr-10"
						bind:value={selectedKalenderPeriode}
					>
						<option value="tahun_ajaran">Tahun Ajaran (Juli-Juni)</option>
						<option value="semester_ganjil">Semester Ganjil (Juli-Desember)</option>
						<option value="semester_genap">Semester Genap (Januari-Juni)</option>
					</select>
				</label>
			{/if}
			<label class="form-control min-w-0">
				<span class="label-text mb-1">Waka Kurikulum</span>
				<select
					class="select select-bordered bg-base-100 w-full min-w-0 pr-10"
					bind:value={selectedWakaKurikulumId}
					disabled={!pegawaiGuruList.length}
				>
					<option value={null}>
						{pegawaiGuruList.length ? 'Pilih pegawai guru' : 'Belum ada pegawai guru aktif'}
					</option>
					{#each pegawaiGuruList as pegawai}
						<option value={pegawai.id}>
							{pegawai.nama}{pegawai.jabatan ? ' - ' + pegawai.jabatan : ''}
						</option>
					{/each}
				</select>
			</label>
			<div class="flex min-w-0 items-end">
				<a
					class="btn btn-outline h-12 min-h-12 w-full whitespace-normal text-center leading-tight"
					href={selectedDocument === 'jadwal-pelajaran' ? jadwalSourceHref : kalenderSourceHref}
				>
					Buka sumber di Akademik
				</a>
			</div>
		</div>
	{/if}

	{#if selectedDocument === 'jurnal-mengajar'}
		<div
			class="border-base-300 bg-base-200/30 mt-3 grid gap-3 rounded-lg border p-3 md:grid-cols-2 xl:grid-cols-4"
		>
			<fieldset class="form-control">
				<legend class="label-text mb-1">Lingkup Cetak</legend>
				<div class="join w-full">
					<button
						type="button"
						class="btn join-item flex-1"
						class:btn-primary={jurnalScope === 'kelas'}
						class:btn-soft={jurnalScope !== 'kelas'}
						aria-pressed={jurnalScope === 'kelas'}
						onclick={() => changeJurnalScope('kelas')}>Per Kelas</button
					>
					<button
						type="button"
						class="btn join-item flex-1"
						class:btn-primary={jurnalScope === 'mapel'}
						class:btn-soft={jurnalScope !== 'mapel'}
						aria-pressed={jurnalScope === 'mapel'}
						onclick={() => changeJurnalScope('mapel')}>Per Mapel</button
					>
				</div>
			</fieldset>
			<label class="form-control min-w-0">
				<span class="label-text mb-1"
					>Kelas{jurnalScope === 'mapel' && !jurnalAccess.requiresClass ? ' (Opsional)' : ''}</span
				>
				<select
					class="select select-bordered bg-base-100 w-full min-w-0"
					bind:value={jurnalKelasId}
				>
					<option value={null}
						>{jurnalScope === 'mapel' && !jurnalAccess.requiresClass
							? 'Semua kelas'
							: 'Pilih kelas'}</option
					>
					{#each jurnalKelasList as kelas}
						<option value={kelas.id}>{kelas.nama} · {kelas.semester.nama}</option>
					{/each}
				</select>
			</label>
			<label class="form-control min-w-0">
				<span class="label-text mb-1"
					>Mata Pelajaran{jurnalScope === 'kelas' && jurnalPenandatangan !== 'guru_mapel'
						? ' (Opsional)'
						: ''}</span
				>
				<select
					class="select select-bordered bg-base-100 w-full min-w-0"
					bind:value={jurnalMapelId}
				>
					<option value={null}>{jurnalScope === 'kelas' ? 'Semua mapel' : 'Pilih mapel'}</option>
					{#each jurnalMapelList as mapel}
						<option value={mapel.id}>{mapel.kode} · {mapel.nama}</option>
					{/each}
				</select>
			</label>
			<label class="form-control">
				<span class="label-text mb-1">Jenis Jadwal</span>
				<select class="select select-bordered bg-base-100 w-full" bind:value={jurnalJenis}>
					<option value="persiapan">Masa Persiapan</option>
					<option value="ganjil">Semester Ganjil</option>
					<option value="genap">Semester Genap</option>
				</select>
			</label>
			<label class="form-control">
				<span class="label-text mb-1">Tanggal Mulai</span>
				<input
					class="input input-bordered bg-base-100 w-full"
					type="date"
					bind:value={jurnalTanggalMulai}
				/>
			</label>
			<label class="form-control">
				<span class="label-text mb-1">Tanggal Selesai</span>
				<input
					class="input input-bordered bg-base-100 w-full"
					type="date"
					bind:value={jurnalTanggalSelesai}
				/>
			</label>
			<label class="form-control">
				<span class="label-text mb-1">Penandatangan</span>
				<select class="select select-bordered bg-base-100 w-full" bind:value={jurnalPenandatangan}>
					<option
						value="wali_kelas"
						disabled={!jurnalKelasId || !jurnalAccess.allowedSigners.includes('wali_kelas')}
						>Wali Kelas</option
					>
					<option
						value="guru_mapel"
						disabled={!jurnalMapelId || !jurnalAccess.allowedSigners.includes('guru_mapel')}
						>Guru Mata Pelajaran</option
					>
				</select>
			</label>
			<div class="flex items-end">
				<a class="btn btn-outline h-12 min-h-12 w-full md:w-auto" href="/jurnal-mengajar"
					>Buka sumber di Kurikulum</a
				>
			</div>
			{#if jurnalPenandatangan === 'wali_kelas' && jurnalKelasId && !jurnalKelas?.waliKelas}
				<div class="alert alert-warning py-2 md:col-span-2 xl:col-span-4">
					Wali kelas belum ditentukan pada Data Kelas.
				</div>
			{:else if jurnalPenandatangan === 'guru_mapel' && jurnalMapelId && !jurnalMapel?.guru}
				<div class="alert alert-warning py-2 md:col-span-2 xl:col-span-4">
					Guru belum ditentukan pada Data Mata Pelajaran.
				</div>
			{/if}
		</div>
	{/if}

	{#if isMartikulasiSelected}
		<div class="border-base-300 bg-base-200/30 mt-3 grid gap-3 rounded-lg border p-3 md:grid-cols-[minmax(0,260px)_1fr_auto_auto] md:items-end">
			<label class="form-control min-w-0">
				<span class="label-text mb-1">Tahun Ajaran</span>
				<select class="select select-bordered bg-base-100 w-full" bind:value={selectedPrintTahunAjaranId}>
					{#each tahunAjaranList as tahun}
						<option value={tahun.id}>{tahun.nama}</option>
					{/each}
				</select>
			</label>
			<div class="text-base-content/65 text-sm">
				{#if selectedDocument === 'martikulasi-sk'}
					SK menggunakan susunan tim dan nomor pada Pengaturan Martikulasi.
				{:else if selectedDocument === 'martikulasi-raport'}
					Pilih murid untuk preview atau gunakan Semua Murid untuk satu PDF massal.
				{:else}
					STTM hanya mencetak hasil lengkap. Terbitkan nomor sebelum cetak final.
				{/if}
			</div>
			<a class="btn btn-outline" href="/martikulasi/pengaturan">Pengaturan</a>
			<a class="btn btn-outline" href="/asesmen-martikulasi">Input Nilai</a>
		</div>
	{/if}
	<PreviewFooter
		{hasMurid}
		{muridCount}
		{isPiagamSelected}
		{selectedTemplate}
		isRaporSelected={selectedDocument === 'rapor'}
		isBiodataSelected={selectedDocument === 'biodata'}
		isKeasramaanSelected={selectedDocument === 'keasramaan'}
		isJadwalSelected={selectedDocument === 'jadwal-pelajaran'}
		showStandaloneBgToggle={isJurnalSelected || isMartikulasiSelected}
		doesNotNeedMurid={!documentNeedsMurid}
		showParentSignatureSelect={isSRVariant && selectedDocument === 'rapor'}
		{parentSignature}
		onParentSignatureChange={(value: ParentSignatureChoice) => {
			parentSignature = value;
		}}
		{kritCukup}
		{kritBaik}
		tpMode={fullTP}
		kelasId={data.kelasId ?? null}
		{showBgLogo}
		onToggleBgLogo={(value: boolean) => {
			showBgLogo = value;
			if (pdfViewerUrl) {
				URL.revokeObjectURL(pdfViewerUrl);
				pdfViewerUrl = '';
				pdfViewerTitle = '';
			}
		}}
		onSetKriteria={(cukup: number, baik: number) => {
			// optimistic update in UI
			kritCukup = cukup;
			kritBaik = baik;
			// persist to server (requires sekolah_manage permission)
			fetch('/api/sekolah/rapor-kriteria', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ cukup: kritCukup, baik: kritBaik })
			})
				.then(async (res) => {
					if (res.ok) {
						toast('Kriteria rapor tersimpan di server.', 'success');
					} else {
						const payload = await res.json().catch(() => ({}));
						console.error('Gagal menyimpan kriteria rapor', payload);
						toast(payload?.error ?? 'Gagal menyimpan kriteria rapor.', 'error');
					}
				})
				.catch((err) => {
					console.error('Error saving kriteria rapor', err);
					toast('Gagal menyimpan kriteria rapor (jaringan).', 'error');
				});
		}}
		onToggleFullTP={(value: 'compact' | 'full-desc') => {
			fullTP = value;
		}}
		onBgRefresh={handleBgRefresh}
	/>
</div>

{#if pdfViewerUrl}
	<div class="mt-4 flex flex-wrap items-center justify-between gap-3"><span class="break-all text-sm">{pdfViewerFilename}</span><a class="btn btn-primary" href={pdfViewerUrl} download={pdfViewerFilename}><Icon name="download" /> Unduh PDF</a></div>
	<object
		bind:this={pdfViewerEl}
		data={pdfViewerUrl}
		type="application/pdf"
		class="rounded-box mt-4 h-[85vh] w-full"
		title={pdfViewerTitle}
	>
		<embed src={pdfViewerUrl} type="application/pdf" class="h-full w-full" />
	</object>
{/if}

<PreviewContent
	{previewDocument}
	{previewData}
	{previewError}
	{selectedTemplate}
	{bgRefreshKey}
	{showBgLogo}
	onPrintableReady={handlePrintableReady}
	onBulkPrintableReady={handleBulkPrintableReady}
/>
{/if}
