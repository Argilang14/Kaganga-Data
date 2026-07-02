<script lang="ts">
	import Icon from '$lib/components/icon.svelte';

	type Props = {
		isDownloading?: boolean;
		isImporting?: boolean;
		isDownloadingMassal?: boolean;
		isImportingMassal?: boolean;
		disabled?: boolean;
		massalDisabled?: boolean;
		onDownload?: () => void;
		onImport?: () => void;
		onDownloadMassal?: () => void;
		onImportMassal?: () => void;
	};

	let {
		isDownloading = false,
		isImporting = false,
		isDownloadingMassal = false,
		isImportingMassal = false,
		disabled = false,
		massalDisabled = false,
		onDownload,
		onImport,
		onDownloadMassal,
		onImportMassal
	}: Props = $props();
</script>

<div class="mb-4 flex flex-col justify-between gap-2 lg:flex-row lg:items-center">
	<div class="flex flex-col gap-2 sm:flex-row">
		<button
			type="button"
			class="btn btn-soft shadow-none"
			onclick={onDownload}
			disabled={isDownloading || disabled}
		>
			{#if isDownloading}
				<span class="loading loading-spinner loading-sm"></span>
			{:else}
				<Icon name="download" />
			{/if}
			Download template
		</button>
		<button
			type="button"
			class="btn btn-soft shadow-none"
			onclick={onImport}
			disabled={isImporting || disabled}
		>
			{#if isImporting}
				<span class="loading loading-spinner loading-sm"></span>
			{:else}
				<Icon name="import" />
			{/if}
			Import nilai
		</button>
	</div>
	<div class="flex flex-col gap-2 sm:flex-row">
		<button
			type="button"
			class="btn btn-outline shadow-none"
			onclick={onDownloadMassal}
			disabled={isDownloadingMassal || massalDisabled}
		>
			{#if isDownloadingMassal}
				<span class="loading loading-spinner loading-sm"></span>
			{:else}
				<Icon name="download" />
			{/if}
			Template massal
		</button>
		<button
			type="button"
			class="btn btn-outline shadow-none"
			onclick={onImportMassal}
			disabled={isImportingMassal || massalDisabled}
		>
			{#if isImportingMassal}
				<span class="loading loading-spinner loading-sm"></span>
			{:else}
				<Icon name="import" />
			{/if}
			Import massal
		</button>
	</div>
</div>
