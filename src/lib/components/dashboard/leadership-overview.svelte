<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import Icon from '$lib/components/icon.svelte';
	import type { loadLeadershipOverview } from '$lib/server/dashboard-leadership';
	let {
		summary,
		scopeLabel
	}: {
		summary: NonNullable<Awaited<ReturnType<typeof loadLeadershipOverview>>>;
		scopeLabel?: string;
	} = $props();
	const items = $derived([
		{
			label: 'Nilai Intrakurikuler',
			value: summary.academic,
			icon: 'book-open' as const,
			color: 'progress-success',
			foreground: 'text-success',
			background: 'bg-success/10'
		},
		{
			label: 'Nilai Keasramaan',
			value: summary.dormitory,
			icon: 'layers' as const,
			color: 'progress-info',
			foreground: 'text-info',
			background: 'bg-info/10'
		}
	]);
</script>

<section
	class="dashboard-panel dashboard-leadership min-w-0 overflow-hidden rounded-lg shadow-sm"
	aria-label="Ringkasan pengawasan penilaian"
>
	<header
		class="dashboard-panel-heading flex items-center gap-3 border-b border-base-200 px-5 py-4"
	>
		<span
			class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary/10 text-secondary"
			><Icon name="bar-chart" class="size-5" /></span
		>
		<div>
			<h2 class="text-lg font-bold">Ringkasan Penilaian</h2>
			<p class="text-xs text-base-content/70">
				Murid yang sudah mulai dinilai{scopeLabel ? ` · ${scopeLabel}` : ''}
			</p>
		</div>
	</header>
	<div class="divide-y divide-base-200 px-5">
		{#each items as item (item.label)}
			<div class="py-4">
				<div class="mb-3 flex items-center justify-between gap-3">
					<div class="flex min-w-0 items-center gap-2">
						<span
							class={`flex size-8 shrink-0 items-center justify-center rounded-md ${item.foreground} ${item.background}`}
							><Icon name={item.icon} class="size-4" /></span
						><span class="text-sm font-medium">{item.label}</span>
					</div>
					<span class="shrink-0 text-sm"
						><strong>{item.value}</strong><span class="text-base-content/50">
							/ {summary.total}</span
						></span
					>
				</div>
				<progress
					class={`progress block h-2 w-full ${item.color}`}
					value={summary.total ? Math.round((item.value / summary.total) * 100) : 0}
					max="100"
					aria-label={item.label}
				></progress>
			</div>
		{/each}
	</div>
	{#if summary.pendingDocuments !== null}
		<a
			href="/persetujuan"
			class="flex items-center justify-between gap-3 border-t border-base-200 bg-base-200/20 px-5 py-4 hover:bg-base-200/50"
			><div class="flex items-center gap-2 text-sm">
				<Icon name="check-square" class="size-4 text-warning" />Dokumen Menunggu<span
					class="hidden text-xs text-base-content/45 xl:inline">Sekolah</span
				>
			</div>
			<span class="badge badge-warning badge-soft">{summary.pendingDocuments}</span><Icon
				name="right"
				class="size-4 text-base-content/45"
			/></a
		>
	{/if}
</section>
