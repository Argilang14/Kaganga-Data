<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/icon.svelte';
	import type { loadDashboardDaily } from '$lib/server/dashboard-daily';
	let {
		scope
	}: { scope: NonNullable<Awaited<ReturnType<typeof loadDashboardDaily>>['leadership']> } =
		$props();
	const labels: Record<string, string> = {
		sd: 'SD / SRD',
		smp: 'SMP / SRMP',
		sma: 'SMA / SRMA',
		unknown: 'Belum ditentukan'
	};
	const available = $derived(
		scope.classes.filter(
			(item) => scope.filters.level === 'semua' || item.jenjang === scope.filters.level
		)
	);
	function changeLevel(event: Event) {
		const select = event.currentTarget as HTMLSelectElement;
		const classes = select.form?.elements.namedItem('kelas_id') as HTMLSelectElement | null;
		if (classes) classes.value = '';
		select.form?.requestSubmit();
	}
</script>

<section
	class="dashboard-filter min-w-0 rounded-lg border border-base-300 p-4"
	aria-label="Filter pengawasan"
>
	<form method="GET" action="/" class="flex flex-col gap-3 sm:flex-row sm:items-end">
		<div class="flex min-w-0 flex-1 items-center gap-2 self-start sm:self-center">
			<Icon name="select" class="size-4 text-info" />
			<h2 class="text-sm font-semibold">Cakupan Pengawasan</h2>
		</div>
		{#each [...page.url.searchParams.entries()].filter(([key]) => !['jenjang', 'kelas_id', 'kelas_page', 'sakit_page', 'izin_page', 'alfa_page', 'izin_pulang_page'].includes(key)) as [key, value], index (index)}
			<input type="hidden" name={key} {value} />
		{/each}
		<label class="min-w-0 sm:w-44">
			<span class="mb-1 block text-xs text-base-content/60">Jenjang</span>
			<select
				name="jenjang"
				class="select select-sm w-full"
				aria-label="Jenjang pengawasan"
				value={scope.filters.level}
				onchange={changeLevel}
			>
				<option value="semua">Semua jenjang</option>
				{#each ['sd', 'smp', 'sma', 'unknown'] as key (key)}
					{#if key !== 'unknown' || scope.classes.some((item) => item.jenjang === key)}<option
							value={key}>{labels[key]}</option
						>{/if}
				{/each}
			</select>
		</label>
		<label class="min-w-0 sm:w-44">
			<span class="mb-1 block text-xs text-base-content/60">Kelas</span>
			<select
				name="kelas_id"
				class="select select-sm w-full"
				aria-label="Kelas pengawasan"
				value={scope.filters.classId ? String(scope.filters.classId) : ''}
				onchange={(event) => event.currentTarget.form?.requestSubmit()}
			>
				<option value="">Semua kelas</option>
				{#each available as item (item.id)}<option value={String(item.id)}>{item.nama}</option
					>{/each}
			</select>
		</label>
		<button
			type="submit"
			class="btn btn-sm btn-square self-end"
			title="Terapkan filter"
			aria-label="Terapkan filter"><Icon name="search" class="size-4" /></button
		>
	</form>
</section>
