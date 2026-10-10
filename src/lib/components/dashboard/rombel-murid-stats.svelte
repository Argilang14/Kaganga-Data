<script lang="ts">
	import Icon from '$lib/components/icon.svelte';

	type DashboardStatistik = App.DashboardStatistik;

	let { rombel, murid, pegawai } = $props<{
		rombel: DashboardStatistik['rombel'];
		murid: DashboardStatistik['murid'];
		pegawai: DashboardStatistik['pegawai'];
	}>();

	const rombelBadges = $derived.by(() => rombel.perFase);
	const items = $derived([
		{
			label: 'Rombel',
			value: rombel.total,
			icon: 'school' as const,
			color: 'text-info',
			background: 'bg-info/10',
			tone: 'blue'
		},
		{
			label: 'Murid Aktif',
			value: murid.total,
			icon: 'users' as const,
			color: 'text-success',
			background: 'bg-success/10',
			tone: 'green'
		},
		{
			label: 'Pegawai Aktif',
			value: pegawai.total,
			icon: 'briefcase' as const,
			color: 'text-error',
			background: 'bg-error/10',
			tone: 'rose'
		}
	]);
</script>

<div class="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Statistik sekolah">
	{#each items as item, index (item.label)}
		<div
			class={`dashboard-stat dashboard-stat--${item.tone} min-w-0 rounded-lg p-4 shadow-sm ${index === 2 ? 'col-span-2 sm:col-span-1' : ''}`}
		>
			<div class="mb-3 flex h-12 items-start justify-between gap-2 sm:h-8">
				<span class="min-w-0 break-words text-sm font-medium text-base-content/75"
					>{item.label}</span
				><span
					class={`flex size-8 shrink-0 items-center justify-center rounded-md ${item.color} ${item.background}`}
					><Icon name={item.icon} class="size-4" /></span
				>
			</div>
			<div class="text-3xl font-bold tabular-nums">{item.value}</div>
			{#if index === 0}<div class="mt-2 flex flex-wrap gap-1">
					{#each rombelBadges as badge (badge.label)}<span
							class="rounded bg-base-200 px-1 text-[10px] text-base-content/60"
							>{badge.jumlah} {badge.label}</span
						>{/each}
				</div>{/if}
		</div>
	{/each}
</div>
