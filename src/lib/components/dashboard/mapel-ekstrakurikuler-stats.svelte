<script lang="ts">
	import Icon from '$lib/components/icon.svelte';

	type MapelStat = {
		total: number;
		wajib: number;
		mulok: number;
		kokurikuler?: number;
		lainnya: number;
	};

	type TotalStat = {
		total: number;
	};

	let { mapel, ekstrakurikuler, keasramaan } = $props<{
		mapel: MapelStat;
		ekstrakurikuler: TotalStat;
		keasramaan: TotalStat;
	}>();

	function mapelParts(m: MapelStat): string {
		const parts: string[] = [];
		if (m.wajib) parts.push(m.wajib + ' Wajib');
		if (m.mulok) parts.push(m.mulok + ' Mulok');
		if (m.lainnya) parts.push(m.lainnya + ' Pilihan');

		if (parts.length === 0) return '—';
		if (parts.length === 1) return parts[0];
		if (parts.length === 2) return parts.join(' & ');

		return parts.slice(0, -1).join(', ') + ' & ' + parts[parts.length - 1];
	}
	const items = $derived([
		{
			label: 'Intrakurikuler',
			value: mapel.total,
			detail: mapelParts(mapel),
			icon: 'book-open' as const,
			color: 'text-success',
			tone: 'green'
		},
		{
			label: 'Kokurikuler',
			value: mapel.kokurikuler ?? 0,
			detail: 'Kelas aktif',
			icon: 'layers' as const,
			color: 'text-info',
			tone: 'blue'
		},
		{
			label: 'Ekstrakurikuler',
			value: ekstrakurikuler.total,
			detail: 'Kelas aktif',
			icon: 'activity' as const,
			color: 'text-warning',
			tone: 'amber'
		},
		{
			label: 'Evaluasi Asrama',
			value: keasramaan.total,
			detail: 'Kelas aktif',
			icon: 'school' as const,
			color: 'text-error',
			tone: 'rose'
		}
	]);
</script>

<div class="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-4" aria-label="Mata pelajaran kelas aktif">
	{#each items as item (item.label)}
		<div
			class={`dashboard-stat dashboard-stat--${item.tone} flex min-w-0 items-start gap-3 rounded-lg px-3 py-3 shadow-sm sm:px-4`}
		>
			<span class={`mt-1 shrink-0 ${item.color}`}><Icon name={item.icon} class="size-4" /></span>
			<div class="min-w-0 flex-1">
				<div class="break-words text-xs font-semibold text-base-content/75">{item.label}</div>
				<strong class="text-xl">{item.value}</strong>
				<p class="mt-0.5 break-words text-[11px] text-base-content/65">{item.detail}</p>
			</div>
		</div>
	{/each}
</div>
