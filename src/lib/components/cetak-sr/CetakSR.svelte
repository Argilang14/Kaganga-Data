<script lang="ts">
	/* eslint-disable @typescript-eslint/no-unused-vars */
	import { page } from '$app/state';
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
			daftarMurid?: Array<{ id: number; nama: string; nis?: string | null; nisn?: string | null }>;
			piagamRankingOptions?: Array<{
				muridId: number;
				peringkat: number;
				nama: string;
				nilaiRataRata: number | null;
			}>;
		};
		pdfVariant?: 'default' | 'sr';
	};

	let { data, pdfVariant: pdfVariantProp }: Props = $props();
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
		{ value: 'jadwal-pelajaran', label: 'Jadwal Pelajaran' },
		{ value: 'kalender-pendidikan', label: 'Kalender Pendidikan' }
	];
	const currentUserType = $derived((page.data.user as { type?: string } | null | undefined)?.type);
	const visibleDocumentOptions = $derived.by(() => {
		if (currentUserType === 'wali_asrama') {
			return documentOptions.filter((option) => option.value === 'keasramaan');
		}
		return documentOptions.filter(
			(option) =>
				(option.value !== 'kartu-absensi' &&
					option.value !== 'jadwal-pelajaran' &&
					option.value !== 'kalender-pendidikan') ||
				isSRVariant
		);
	});

	let selectedDocument = $state<DocumentType | ''>('');
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
	let selectedJadwalOrientation = $state<'landscape' | 'portrait'>('landscape');
	let selectedJadwalJenjang = $state<'semua' | 'srd' | 'srmp' | 'srma'>('semua');
	let selectedKalenderPeriode = $state<
		'tahun_kalender' | 'tahun_ajaran' | 'semester_ganjil' | 'semester_genap'
	>('tahun_ajaran');
	const tahunAjaranList = $derived(data.tahunAjaranList ?? []);
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

	let pdfViewerUrl = $state('');
	let pdfViewerTitle = $state('');
	let pdfViewerEl = $state<HTMLElement | null>(null);

	// show TP listing: 'compact' | 'full-desc'
	let fullTP = $state<'compact' | 'full-desc'>('compact');
	let parentSignature = $state<ParentSignatureChoice>('auto');

	// Kriteria intrakurikuler (defaults per spec)

	let kritCukup = $state<number>(DEFAULT_RAPOR_CRITERIA.kritCukup);
	let kritBaik = $state<number>(DEFAULT_RAPOR_CRITERIA.kritBaik);

	// Load persisted criteria from localStorage (if available)
	// Load persisted criteria from server (if available). Falls back to defaults.
	onMount(async () => {
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
	const documentNeedsMurid = $derived.by(
		() => selectedDocument !== 'jadwal-pelajaran' && selectedDocument !== 'kalender-pendidikan'
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
				documentType === 'piagam'
					? 'Tidak ada data peringkat piagam untuk kelas ini.'
					: 'Tidak ada murid di kelas ini.';
			toast(message, 'warning');
			return;
		}
		const murid = selectedMurid;
		if (documentType === 'jadwal-pelajaran' || documentType === 'kalender-pendidikan') {
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

	async function loadPdf(murid: MuridData | null) {
		const documentType = selectedDocument;
		if (!documentType) return;
		downloadLoading = true;
		try {
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
						documentType === 'kalender-pendidikan' ? selectedKalenderSemesterId : undefined
				})
			});
			if (!res.ok) throw new Error('Gagal mendapatkan token');
			const { token, slug } = await res.json();

			const pdfRes = await fetch(`/cetak/pdf/${slug}/${token}`);
			if (!pdfRes.ok) throw new Error('Gagal memuat PDF');
			const blob = await pdfRes.blob();

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
			toast('Gagal membuka PDF', 'error');
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

	async function handleDownloadBulk() {
		const documentType = selectedDocument;
		if (!documentType) {
			toast('Pilih dokumen terlebih dahulu', 'warning');
			return;
		}
		if (!isPreviewableDocument(documentType)) {
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
					parentSignature: documentType === 'rapor' ? parentSignature : undefined
				})
			});

			if (!res.ok) {
				const errBody = await res.json().catch(() => ({}));
				throw new Error(errBody?.message || 'Gagal membuat PDF bulk');
			}

			const blob = await res.blob();
			const filename = `${selectedDocumentEntry?.label || documentType}-${kelasAktifLabel ? kelasAktifLabel.replace(/\s+/g, '') : 'Semua-Kelas'}-${muridList.length}murid.pdf`;
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

<div class="card bg-base-100 rounded-lg border border-none p-4 shadow-md">
	{#if isSRVariant}
		<div class="border-info/25 bg-info/10 mb-3 rounded-lg border px-4 py-3 text-sm">
			<strong>Cetak Dokumen SR</strong>
			<span class="ml-1"
				>menggunakan data yang sama dengan Cetak Dokumen, dengan format PDF SR.</span
			>
		</div>
	{/if}

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

	{#if selectedDocument === 'jadwal-pelajaran' || selectedDocument === 'kalender-pendidikan'}
		<div
			class="border-base-300 bg-base-200/30 mt-3 grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-3 {selectedDocument ===
			'jadwal-pelajaran'
				? 'xl:grid-cols-5'
				: 'xl:grid-cols-6'}"
		>
			<label class="form-control">
				<span class="label-text mb-1">Tahun Ajaran</span>
				<select class="select select-bordered bg-base-100" bind:value={selectedPrintTahunAjaranId}>
					{#each tahunAjaranList as tahun}
						<option value={tahun.id}>{tahun.nama}</option>
					{/each}
				</select>
			</label>
			{#if selectedDocument === 'jadwal-pelajaran'}
				<label class="form-control">
					<span class="label-text mb-1">Jenis Jadwal</span>
					<select class="select select-bordered bg-base-100" bind:value={selectedJadwalJenis}>
						<option value="persiapan">Masa Persiapan</option>
						<option value="ganjil">Semester Ganjil</option>
						<option value="genap">Semester Genap</option>
					</select>
				</label>
			{:else}
				<label class="form-control">
					<span class="label-text mb-1">Semester</span>
					<select class="select select-bordered bg-base-100" bind:value={selectedKalenderSemesterId}>
						<option value={null}>Semua Semester</option>
						{#each kalenderSemesterOptions as semester}
							<option value={semester.id}>{semester.nama}</option>
						{/each}
					</select>
				</label>
			{/if}
			<label class="form-control">
				<span class="label-text mb-1">Jenjang</span>
				<select class="select select-bordered bg-base-100" bind:value={selectedJadwalJenjang}>
					<option value="semua">Semua Jenjang</option>
					<option value="srd">SRD</option>
					<option value="srmp">SRMP</option>
					<option value="srma">SRMA</option>
				</select>
			</label>
			<label class="form-control">
				<span class="label-text mb-1">Orientasi A4</span>
				<select class="select select-bordered bg-base-100" bind:value={selectedJadwalOrientation}>
					<option value="landscape">Landscape</option>
					<option value="portrait">Portrait</option>
				</select>
			</label>
			{#if selectedDocument === 'kalender-pendidikan'}
				<label class="form-control">
					<span class="label-text mb-1">Periode Kalender</span>
					<select class="select select-bordered bg-base-100" bind:value={selectedKalenderPeriode}>
						<option value="tahun_ajaran">Tahun Ajaran (Juli-Juni)</option>
						<option value="semester_ganjil">Semester Ganjil (Juli-Desember)</option>
						<option value="semester_genap">Semester Genap (Januari-Juni)</option>
					</select>
				</label>
			{/if}
			<div class="flex items-end">
				<a class="btn btn-outline h-12 min-h-12 w-full" href={selectedDocument === 'jadwal-pelajaran' ? jadwalSourceHref : kalenderSourceHref}>
					Buka sumber di Akademik
				</a>
			</div>
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
