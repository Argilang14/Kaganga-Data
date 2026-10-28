<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/icon.svelte';
	import { fetchAttendanceSnapshot } from '$lib/attendance-refresh';
	import type { loadDashboardDaily } from '$lib/server/dashboard-daily';
	import type { DashboardTrend } from '$lib/dashboard-trend';
	type Snapshot = Awaited<ReturnType<typeof loadDashboardDaily>>;
	let { summary }: { summary: Snapshot } = $props();
	let result = $state.raw<{ context: Snapshot; query: string; value: DashboardTrend } | null>(null);
	let busy = $state(true);
	let failure = $state('');
	let revision = $state(0);
	const data = $derived(
		result?.context === summary && result.query === page.url.search ? result.value : null
	);
	const dates = $derived(data?.series[0]?.points.map((point) => point.date) ?? []);
	const labels: Record<string, string> = { sd: 'SD', smp: 'SMP', sma: 'SMA', unknown: 'Lainnya' };
	const hasRecords = $derived(
		data?.series.some((item) => item.points.some((point) => point.rate !== null))
	);
	function shortDate(date: string) {
		return new Intl.DateTimeFormat('id-ID', {
			day: 'numeric',
			month: 'short',
			timeZone: 'Asia/Jakarta'
		}).format(new Date(`${date}T12:00:00Z`));
	}
	function path(points: DashboardTrend['series'][number]['points']) {
		let connected = false;
		return points
			.map((point, index) => {
				if (point.rate === null) {
					connected = false;
					return '';
				}
				const command = connected ? 'L' : 'M';
				connected = true;
				return `${command}${10 + (index * 580) / 6},${150 - point.rate * 1.4}`;
			})
			.join(' ');
	}
	$effect(() => {
		const context = summary,
			query = page.url.search;
		void revision;
		const controller = new AbortController();
		let active = true;
		busy = true;
		failure = '';
		const timeout = setTimeout(() => controller.abort(), 15000);
		void fetchAttendanceSnapshot<DashboardTrend>(`/api/dashboard/trend${query}`, controller.signal)
			.then((value) => {
				if (active) result = { context, query, value };
			})
			.catch(() => {
				if (active) failure = 'Grafik kehadiran gagal dimuat. Coba muat ulang.';
			})
			.finally(() => {
				clearTimeout(timeout);
				if (active) busy = false;
			});
		return () => {
			active = false;
			clearTimeout(timeout);
			controller.abort();
		};
	});
</script>

<section
	class="dashboard-panel dashboard-trend min-w-0 overflow-hidden rounded-lg"
	aria-label="Grafik kehadiran murid"
	aria-busy={busy}
>
	<header
		class="dashboard-panel-heading flex flex-wrap items-center justify-between gap-2 border-b border-base-200"
	>
		<div class="flex min-w-0 items-center gap-2">
			<Icon name="activity" class="size-4 text-info" />
			<h2 class="font-bold">Grafik Kehadiran Murid</h2>
		</div>
		<div class="flex items-center gap-2">
			<span class="text-xs text-base-content/60">7 hari kalender</span><button
				class="btn btn-ghost btn-square btn-sm"
				type="button"
				aria-label="Muat ulang grafik"
				title="Muat ulang grafik"
				disabled={busy}
				onclick={() => revision++}
				><Icon name="repeat" class={`size-4 ${busy ? 'animate-spin' : ''}`} /></button
			>
		</div>
	</header>
	<div class="p-4">
		<p class="mb-3 text-xs text-base-content/60">
			{summary.scope} · {data?.source || summary.studentSource?.label || 'Masuk sekolah'}
		</p>
		{#if failure}<p role="status" class="flex min-h-36 items-center text-sm text-warning">
				{failure}
			</p>
		{:else if busy && !data}<div
				class="skeleton h-40 w-full"
				role="status"
				aria-label="Memuat grafik kehadiran"
			></div>
		{:else if !data?.series.length}<p class="py-8 text-sm text-base-content/60">
				Belum ada murid dalam cakupan ini.
			</p>
		{:else}
			{#if hasRecords}
				<div class="dashboard-chart">
					<div class="dashboard-chart-axis" aria-hidden="true">
						{#each [100, 75, 50, 25, 0] as tick (tick)}<span>{tick}%</span>{/each}
					</div>
					<div class="min-w-0">
						<svg
							class="dashboard-chart-plot"
							viewBox="0 0 600 160"
							preserveAspectRatio="none"
							role="img"
							aria-label="Persentase murid hadir terhadap murid aktif, per jenjang"
						>
							{#each [10, 45, 80, 115, 150] as y (y)}<line
									x1="0"
									x2="600"
									y1={y}
									y2={y}
									stroke="currentColor"
									opacity="0.12"
									vector-effect="non-scaling-stroke"
								/>{/each}
							{#each data.series as item (item.level)}<g
									class={`dashboard-chart-series dashboard-chart-series--${item.level}`}
								>
									<path
										d={path(item.points)}
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										vector-effect="non-scaling-stroke"
									/>
									{#each item.points as point, index (point.date)}{#if point.rate !== null}<circle
												cx={10 + (index * 580) / 6}
												cy={150 - point.rate * 1.4}
												r="3.5"
												fill="currentColor"
												><title
													>{labels[item.level]}, {shortDate(point.date)}: {point.present}/{point.total}
													hadir, {point.unrecorded} belum tercatat</title
												></circle
											>{/if}{/each}
								</g>{/each}
						</svg>
						<div class="dashboard-chart-dates" aria-hidden="true">
							{#each dates as date (date)}<span>{shortDate(date)}</span>{/each}
						</div>
					</div>
				</div>
			{:else}
				<p class="flex items-center gap-3 py-4 text-sm text-base-content/65">
					<Icon name="activity" class="size-5 shrink-0 text-info" />Belum ada kehadiran tercatat
					dalam 7 hari ini.
				</p>
			{/if}
			<div class="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
				<div class="flex flex-wrap gap-3">
					{#each data.series as item (item.level)}<span
							class={`dashboard-chart-series dashboard-chart-series--${item.level} inline-flex items-center gap-1.5`}
							><span class="size-2 rounded-full bg-current"></span>{labels[item.level]}</span
						>{/each}
				</div>
				<span class="text-base-content/60"
					>{hasRecords ? 'Hadir termasuk terlambat' : 'Belum tercatat bukan alfa'}</span
				>
			</div>
			<details class="mt-3 border-t border-base-200 pt-2 text-xs">
				<summary class="cursor-pointer py-1 font-medium">Rincian 7 hari</summary>
				<p class="py-2 text-base-content/60">
					Belum tercatat tidak dihitung alfa. Cakupan memakai murid aktif semester berjalan.
				</p>
				<div class="overflow-x-auto">
					<table class="table table-xs min-w-100">
						<caption class="sr-only">Kehadiran murid per tanggal dan jenjang</caption><thead
							><tr
								><th scope="col">Tanggal</th><th scope="col">Jenjang</th><th scope="col"
									>Hadir / murid</th
								><th scope="col">Belum tercatat</th></tr
							></thead
						><tbody
							>{#each dates as date (date)}{#each data.series as item (item.level)}{@const point =
										item.points.find((point) => point.date === date)}{#if point}<tr
											><td>{shortDate(date)}</td><td>{labels[item.level]}</td><td
												>{point.present} / {point.total}</td
											><td>{point.unrecorded}</td></tr
										>{/if}{/each}{/each}</tbody
						>
					</table>
				</div>
			</details>
		{/if}
	</div>
</section>
