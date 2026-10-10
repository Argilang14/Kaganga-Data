<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import Icon from '$lib/components/icon.svelte';
	import type { loadDashboardDaily } from '$lib/server/dashboard-daily';
	let {
		scope
	}: { scope: NonNullable<Awaited<ReturnType<typeof loadDashboardDaily>>['leadership']> } =
		$props();
	const labels: Record<string, string> = { sd: 'SD', smp: 'SMP', sma: 'SMA', unknown: '-' };
	let expanded = $state(false);
</script>

<section
	id="pengawasan-kelas"
	class="dashboard-panel dashboard-leadership min-w-0 overflow-hidden rounded-lg shadow-sm"
	aria-label="Pengawasan per kelas"
>
	<header
		class="dashboard-panel-heading flex items-center justify-between gap-3 border-b border-base-200 px-5 py-3"
	>
		<div class="flex min-w-0 items-center gap-3">
			<span class="flex size-9 shrink-0 items-center justify-center rounded-md bg-info/10 text-info"
				><Icon name="school" class="size-5" /></span
			>
			<div>
				<h2 class="text-lg font-bold">Pengawasan Per Kelas</h2>
				<p class="text-xs text-base-content/55">Kehadiran masuk sekolah</p>
			</div>
		</div>
		<span class="badge badge-soft shrink-0">{scope.pagination.total} kelas</span>
	</header>
	{#if scope.classSummary === null}
		<p class="p-5 text-sm text-base-content/60">Izin melihat absensi belum diberikan.</p>
	{:else if scope.classSummary.length === 0}
		<div class="flex flex-col items-center gap-2 p-8 text-center text-base-content/55">
			<Icon name="school" class="size-7" />
			<p class="text-sm">Belum ada kelas pada cakupan ini.</p>
		</div>
	{:else}
		<div class="dashboard-class-list" class:dashboard-class-list--expanded={expanded}>
			<div class="hidden overflow-x-auto sm:block">
				<table class="table table-sm min-w-[530px]" aria-label="Ringkasan kehadiran per kelas">
					<thead class="bg-base-200/40"
						><tr
							><th>Kelas / Wali Kelas</th><th class="text-right">Murid</th><th class="text-right"
								>Hadir</th
							><th class="text-right">Tidak Hadir</th><th class="text-right">Belum</th><th
								class="w-32">Tercatat</th
							></tr
						></thead
					>
					<tbody
						>{#each scope.classSummary as item (item.id)}<tr>
								<td
									><div class="font-semibold">
										{item.nama}
										<span class="ml-1 text-xs font-normal text-base-content/45"
											>{labels[item.jenjang]}</span
										>
									</div>
									<div
										class="max-w-44 truncate text-xs text-base-content/55"
										title={item.waliKelas}
									>
										{item.waliKelas}
									</div></td
								>
								<td class="text-right font-medium">{item.total}</td><td
									class="text-right font-semibold text-success">{item.hadir}</td
								><td class="text-right font-semibold" class:text-error={item.tidakHadir > 0}
									>{item.tidakHadir}</td
								><td class="text-right" class:text-warning={item.belum > 0}>{item.belum}</td>
								<td
									><div class="mb-1 flex justify-between text-xs">
										<span>{item.recorded}/{item.total}</span><strong>{item.percentage}%</strong>
									</div>
									<progress
										class="progress progress-success block h-1.5 w-full"
										value={item.percentage}
										max="100"
										aria-label={`Absensi tercatat ${item.nama}`}
									></progress></td
								>
							</tr>{/each}</tbody
					>
				</table>
			</div>
			<div class="divide-y divide-base-200 sm:hidden">
				{#each scope.classSummary as item (item.id)}
					<article class="px-4 py-3">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0">
								<h3 class="font-semibold">
									{item.nama}
									<span class="text-xs font-normal text-base-content/50"
										>{labels[item.jenjang]}</span
									>
								</h3>
								<p class="truncate text-xs text-base-content/55" title={item.waliKelas}>
									{item.waliKelas}
								</p>
							</div>
							<span class="shrink-0 text-xs text-base-content/60">{item.total} murid</span>
						</div>
						<div class="mt-3 grid grid-cols-3 text-xs">
							<span><strong class="text-success">{item.hadir}</strong> Hadir</span><span
								><strong class:text-error={item.tidakHadir > 0}>{item.tidakHadir}</strong> Tidak hadir</span
							><span class="text-right"
								><strong class:text-warning={item.belum > 0}>{item.belum}</strong> Belum</span
							>
						</div>
						<div class="mt-2 flex items-center gap-3">
							<progress
								class="progress progress-success h-1.5 min-w-0 flex-1"
								value={item.percentage}
								max="100"
								aria-label={`Absensi tercatat ${item.nama}`}
							></progress><span class="text-xs font-medium">{item.percentage}%</span>
						</div>
					</article>
				{/each}
			</div>
		</div>
		{#if scope.classSummary.length > 6}
			<div class="border-t border-base-200 px-4 py-2 text-center">
				<button
					class="btn btn-ghost btn-sm"
					type="button"
					aria-expanded={expanded}
					onclick={() => (expanded = !expanded)}
					>{expanded ? 'Ringkas daftar' : 'Lihat semua kelas'}<Icon
						name={expanded ? 'up' : 'down'}
						class="size-4"
					/></button
				>
			</div>
		{/if}
		{#if scope.pagination.pageCount > 1}
			<nav
				class="flex items-center justify-between gap-3 border-t border-base-200 px-4 py-3 text-xs"
				aria-label="Halaman pengawasan kelas"
			>
				<span>{scope.pagination.page} / {scope.pagination.pageCount}</span>
				<div class="flex gap-2">
					{#if scope.pagination.previous}<a
							class="btn btn-sm btn-square"
							href={scope.pagination.previous}
							title="Kelas sebelumnya"
							aria-label="Kelas sebelumnya"><Icon name="left" class="size-4" /></a
						>{/if}
					{#if scope.pagination.next}<a
							class="btn btn-sm btn-square"
							href={scope.pagination.next}
							title="Kelas berikutnya"
							aria-label="Kelas berikutnya"><Icon name="right" class="size-4" /></a
						>{/if}
				</div>
			</nav>
		{/if}
	{/if}
</section>
