<script lang="ts">
	import Icon from '$lib/components/icon.svelte';

	type DocumentType =
		| 'cover'
		| 'biodata'
		| 'rapor'
		| 'piagam'
		| 'keasramaan'
		| 'kartu-absensi'
		| 'jadwal-pelajaran'
		| 'kalender-pendidikan'
	| 'jurnal-mengajar';

	type PreviewPayload = {
		meta?: { title?: string | null } | null;
		coverData?: NonNullable<App.PageData['coverData']> | null;
		biodataData?: NonNullable<App.PageData['biodataData']> | null;
		raporData?: NonNullable<App.PageData['raporData']> | null;
		piagamData?: NonNullable<App.PageData['piagamData']> | null;
		keasramaanData?: NonNullable<App.PageData['keasramaanData']> | null;
		jadwalPelajaranData?: unknown;
		kalenderPendidikanData?: unknown;
	};

	let {
		previewDocument = '',
		previewData = null,
		previewError = null,
		selectedTemplate = '1',
		bgRefreshKey = 0,
		onPrintableReady,
		onBulkPrintableReady,
		showBgLogo = false
	}: {
		previewDocument: DocumentType | '';
		previewData: PreviewPayload | null;
		previewError: string | null;
		selectedTemplate: '1' | '2';
		bgRefreshKey: number;
		onPrintableReady: (node: HTMLDivElement | null) => void;
		onBulkPrintableReady: (index: number, node: HTMLDivElement | null) => void;
		showBgLogo?: boolean;
	} = $props();
	$effect(() => {
		void selectedTemplate;
		void bgRefreshKey;
		void onPrintableReady;
		void onBulkPrintableReady;
		void showBgLogo;
	});
</script>

{#if previewError}
	<div class="alert alert-error mt-6 flex items-center gap-2 text-sm">
		<Icon name="error" />
		<span>{previewError}</span>
	</div>
{:else if previewDocument && previewData}
	<div class="alert alert-info mt-6">
		<Icon name="info" />
		<span>Klik tombol Preview untuk memuat dokumen PDF.</span>
	</div>
{/if}

<style lang="postcss">
</style>
