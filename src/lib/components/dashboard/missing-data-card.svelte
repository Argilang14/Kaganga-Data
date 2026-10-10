<script lang="ts">
	import { resolve } from '$app/paths';
	import type { loadDashboardDaily } from '$lib/server/dashboard-daily';
	import Icon from '$lib/components/icon.svelte';

	let { summary }: { summary: Awaited<ReturnType<typeof loadDashboardDaily>> } = $props();

	const items = $derived([
		{
			label: 'Foto murid',
			value: summary.missing.photo,
			icon: 'image' as const,
			color: 'text-info',
			background: 'bg-info/10'
		},
		{
			label: 'QR murid',
			value: summary.missing.qr,
			icon: 'grid' as const,
			color: 'text-success',
			background: 'bg-success/10'
		},
		...(summary.missing.homeroom !== null
			? [
					{
						label: 'Wali kelas',
						value: summary.missing.homeroom,
						icon: 'school' as const,
						color: 'text-warning',
						background: 'bg-warning/10'
					}
				]
			: []),
		...(summary.missing.employee !== null
			? [
					{
						label: 'Identitas pegawai',
						value: summary.missing.employee,
						icon: 'user' as const,
						color: 'text-secondary',
						background: 'bg-secondary/10'
					}
				]
			: [])
	]);

	const totalMissing = $derived(items.reduce((total, item) => total + item.value, 0));
</script>

<section
	class="dashboard-panel dashboard-missing min-w-0 overflow-hidden rounded-lg shadow-sm"
	aria-label="Data belum lengkap"
>
	<div
		class="dashboard-panel-heading flex flex-wrap items-center justify-between gap-3 border-b border-base-200 px-5 py-4"
	>
		<div class="flex min-w-0 items-center gap-3">
			<span
				class="bg-info/10 text-info flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
				aria-hidden="true"
			>
				<Icon name="table" class="h-5 w-5" />
			</span>
			<div class="min-w-0">
				<h2 class="text-lg font-bold">Data Belum Lengkap</h2>
				<p class="text-xs text-base-content/55">Ringkasan data yang perlu dilengkapi</p>
			</div>
		</div>
		<span
			class:badge-success={totalMissing === 0}
			class:badge-warning={totalMissing > 0}
			class="badge badge-soft shrink-0"
		>
			{totalMissing === 0 ? 'Lengkap' : `${totalMissing} temuan`}
		</span>
	</div>

	<div class="grid grid-cols-2">
		{#each items as item, index (item.label)}
			<div
				class="flex min-w-0 items-center gap-3 border-base-200 px-4 py-3"
				class:border-t={index >= 2}
				class:border-l={index % 2 === 1}
			>
				<span
					class={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${item.background} ${item.color}`}
					aria-hidden="true"
				>
					<Icon name={item.icon} class="h-4 w-4" />
				</span>
				<div class="min-w-0">
					<div class="break-words text-xs text-base-content/75">{item.label}</div>
					<div class="flex items-baseline gap-1">
						<strong class="text-lg leading-tight">{item.value}</strong>
						<span class="text-[11px] text-base-content/45"
							>{item.value === 0 ? 'lengkap' : 'belum'}</span
						>
					</div>
				</div>
			</div>
		{/each}
	</div>

	{#if summary.admin}
		<div class="grid grid-cols-2 gap-2 border-t border-base-200 bg-base-200/25 px-4 py-3">
			<a
				class="btn btn-sm btn-ghost justify-start shadow-none"
				href={resolve('/murid?kelas_id=semua&belum_lengkap=foto')}
			>
				<Icon name="image" class="h-4 w-4" />
				Tanpa foto
			</a>
			<a
				class="btn btn-sm btn-ghost justify-start shadow-none"
				href={resolve('/murid?kelas_id=semua&belum_lengkap=qr')}
			>
				<Icon name="grid" class="h-4 w-4" />
				Tanpa QR
			</a>
		</div>
	{/if}
</section>
