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
</script>

<div class="stats stats-vertical xl:stats-horizontal rounded-box bg-base-100 w-full shadow-md">
	<div class="stat min-w-0">
		<div class="stat-figure text-primary">
			<span class="text-3xl">
				<Icon name="book-open" />
			</span>
		</div>
		<div class="stat-title">Intrakurikuler</div>
		<div class="stat-value">{mapel.total}</div>
		<div class="stat-desc text-wrap">{mapelParts(mapel)}</div>
	</div>

	<div class="stat min-w-0">
		<div class="stat-figure text-error">
			<span class="text-3xl">
				<Icon name="layers" />
			</span>
		</div>
		<div class="stat-title">Kokurikuler</div>
		<div class="stat-value">{mapel.kokurikuler ?? 0}</div>
		<div class="stat-desc">{mapel.kokurikuler ? 'Total di kelas ini' : 'Belum ada data'}</div>
	</div>

	<div class="stat min-w-0">
		<div class="stat-figure text-warning">
			<span class="text-3xl">
				<Icon name="activity" />
			</span>
		</div>
		<div class="stat-title">Ekstrakurikuler</div>
		<div class="stat-value">{ekstrakurikuler.total}</div>
		<div class="stat-desc">
			{ekstrakurikuler.total ? 'Total di kelas ini' : 'Belum ada data'}
		</div>
	</div>

	<div class="stat min-w-0">
		<div class="stat-figure text-accent">
			<span class="text-3xl">
				<Icon name="school" />
			</span>
		</div>
		<div class="stat-title text-wrap">Mata Evaluasi Asrama</div>
		<div class="stat-value">{keasramaan.total}</div>
		<div class="stat-desc">{keasramaan.total ? 'Total di kelas ini' : 'Belum ada data'}</div>
	</div>
</div>
