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
	let selectedLevel = $state('all');
	let hiddenLevels = $state<string[]>([]);
	let activePoint = $state<{ level: string; date: string } | null>(null);
	const data = $derived(
		result?.context === summary && result.query === page.url.search ? result.value : null
	);
	const dates = $derived(data?.series[0]?.points.map((point) => point.date) ?? []);
	const labels: Record<string, string> = { sd: 'SD', smp: 'SMP', sma: 'SMA', unknown: 'Lainnya' };
	const visibleSeries = $derived(
		(data?.series ?? []).filter((item) =>
			selectedLevel === 'all' ? !hiddenLevels.includes(item.level) : item.level === selectedLevel
		)
	);
	const hasRecords = $derived(
		visibleSeries.some((item) => item.points.some((point) => point.rate !== null))
	);
	const detail = $derived.by(() => {
		const series = visibleSeries.find((item) => item.level === activePoint?.level);
		const point = series?.points.find((item) => item.date === activePoint?.date);
		if (point && series) return { level: series.level, point };
		const latestSeries = visibleSeries[0];
		const latestPoint = latestSeries?.points.at(-1);
		return latestSeries && latestPoint ? { level: latestSeries.level, point: latestPoint } : null;
	});
	function toggleLevel(level: string) {
		const hidden = (data?.series ?? [])
			.filter((item) => !visibleSeries.includes(item))
			.map((item) => item.level);
		selectedLevel = 'all';
		hiddenLevels = hidden.includes(level)
			? hidden.filter((item) => item !== level)
			: [...hidden, level];
		activePoint = null;
	}
	$effect(() => {
		if (
			data &&
			selectedLevel !== 'all' &&
			!data.series.some((item) => item.level === selectedLevel)
		)
			selectedLevel = 'all';
	});
	function describePoint(level: string, point: DashboardTrend['series'][number]['points'][number]) {
		return `${labels[level] ?? level}, ${shortDate(point.date)}: ${point.rate === null ? 'Belum ada data' : `${point.rate}% hadir`}, ${point.present} dari ${point.total} murid, ${point.unrecorded} belum tercatat`;
	}
	function shortDate(date: string) {
		return new Intl.DateTimeFormat('id-ID', {
			day: 'numeric',
			month: 'short',
			timeZone: 'Asia/Jakarta'
		}).format(new Date(`${date}T12:00:00Z`));
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
			<Icon name="chart" class="size-4 text-info" />
			<h2 class="font-bold">Grafik Kehadiran Murid</h2>
		</div>
		<div class="flex items-center gap-2">
			{#if data?.series.length}
				<select
					class="select select-sm w-36 text-xs"
					aria-label="Jenjang grafik kehadiran"
					bind:value={selectedLevel}
					onchange={() => {
						hiddenLevels = [];
						activePoint = null;
					}}
				>
					<option value="all">Semua jenjang</option>
					{#each data.series as item (item.level)}
						<option value={item.level}>{labels[item.level] ?? item.level}</option>
					{/each}
				</select>
			{/if}
			<button
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
			{summary.scope} · {data?.source || summary.studentSource?.label || 'Masuk sekolah'} · 7 hari kalender
		</p>
		{#if failure}<p role="status" class="flex min-h-36 items-center text-sm text-warning">
				{failure}
			</p>
		{:else if busy && !data}<div
				class="skeleton h-56 w-full"
				role="status"
				aria-label="Memuat grafik kehadiran"
			></div>
		{:else if !data?.series.length}<p class="py-8 text-sm text-base-content/60">
				Belum ada murid dalam cakupan ini.
			</p>
		{:else}
			<div class="attendance-columns" aria-label="Kehadiran tujuh hari, skala 0 sampai 100 persen">
				<div class="column-axis" aria-hidden="true">
					{#each [100, 75, 50, 25, 0] as tick (tick)}
						<span style:top={`${100 - tick}%`}>{tick}%</span>
					{/each}
				</div>
				<div class="column-scroll" role="region" aria-label="Grafik batang kehadiran per tanggal">
					<div
						class="column-plot"
						class:column-plot--grouped={visibleSeries.length > 1}
						style:--days={dates.length || 7}
					>
						<div class="column-grid" aria-hidden="true">
							{#each [100, 75, 50, 25, 0] as tick (tick)}
								<span style:top={`${100 - tick}%`}></span>
							{/each}
						</div>
						{#each dates as date (date)}
							<div class="column-day">
								<div class="column-bars">
									{#each visibleSeries as item (item.level)}
										{@const point = item.points.find((point) => point.date === date)}
										{#if point}
											<button
												type="button"
												class={`column-hit attendance-series attendance-series--${item.level}`}
												class:column-hit--active={detail?.level === item.level &&
													detail?.point.date === date}
												aria-label={describePoint(item.level, point)}
												aria-pressed={detail?.level === item.level && detail?.point.date === date}
												data-level={item.level}
												data-date={date}
												data-rate={point.rate === null ? 'missing' : point.rate}
												onpointerenter={(event) => {
													if (event.pointerType === 'mouse')
														activePoint = { level: item.level, date };
												}}
												onfocus={() => (activePoint = { level: item.level, date })}
												onclick={() => (activePoint = { level: item.level, date })}
											>
												{#if point.rate === null}
													<span class="column-missing" aria-hidden="true">-</span>
												{:else}
													<span
														class="column-bar"
														class:column-bar--zero={point.rate === 0}
														style:height={`${point.rate}%`}
														aria-hidden="true"
													></span>
												{/if}
											</button>
										{/if}
									{/each}
								</div>
								<span class="column-date">{shortDate(date)}</span>
							</div>
						{/each}
					</div>
				</div>
			</div>
			<div
				class="column-detail mt-2 rounded-sm bg-base-200/60 px-3 py-2 text-xs"
				role="status"
				aria-live="polite"
				aria-atomic="true"
			>
				{#if detail}
					<div class="flex items-center justify-between gap-2">
						<span class="font-semibold"
							>{labels[detail.level] ?? detail.level} · {shortDate(detail.point.date)}</span
						>
						<strong class="text-sm"
							>{detail.point.rate === null ? 'Belum ada data' : `${detail.point.rate}%`}</strong
						>
					</div>
					<p class="mt-1 text-base-content/65">
						Hadir {detail.point.present}/{detail.point.total} · Belum tercatat {detail.point
							.unrecorded}
					</p>
				{:else}<span>Tidak ada jenjang dipilih.</span>{/if}
			</div>
			<div class="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
				<div class="flex flex-wrap gap-1" aria-label="Legenda jenjang">
					{#each data.series as item (item.level)}
						<button
							type="button"
							class="btn btn-ghost btn-sm gap-1.5 px-2 text-xs"
							aria-pressed={visibleSeries.some((series) => series.level === item.level)}
							onclick={() => toggleLevel(item.level)}
						>
							<span
								class={`attendance-series attendance-series--${item.level}`}
								class:opacity-30={!visibleSeries.some((series) => series.level === item.level)}
								aria-hidden="true"><span class="block size-2.5 rounded-xs bg-current"></span></span
							>
							{labels[item.level] ?? item.level}
						</button>
					{/each}
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
											><td>{shortDate(date)}</td><td>{labels[item.level] ?? item.level}</td><td
												>{point.rate === null
													? 'Belum ada data'
													: `${point.present} / ${point.total}`}</td
											><td>{point.unrecorded}</td></tr
										>{/if}{/each}{/each}</tbody
						>
					</table>
				</div>
			</details>
		{/if}
	</div>
</section>

<style>
	.attendance-columns {
		--plot-height: 144px;
		display: grid;
		grid-template-columns: 34px minmax(0, 1fr);
		gap: 6px;
		padding-top: 8px;
	}
	.column-axis {
		position: relative;
		height: var(--plot-height);
		font-size: 11px;
		color: color-mix(in oklab, var(--color-base-content) 65%, transparent);
	}
	.column-axis > span {
		position: absolute;
		right: 0;
		transform: translateY(-50%);
	}
	.column-scroll {
		min-width: 0;
		overflow-x: auto;
		padding: 2px 2px 4px;
	}
	.column-plot {
		position: relative;
		display: grid;
		grid-template-columns: repeat(var(--days), minmax(0, 1fr));
		gap: 6px;
	}
	.column-plot--grouped {
		min-width: 350px;
	}
	.column-grid {
		position: absolute;
		inset: 0 0 auto;
		height: var(--plot-height);
		pointer-events: none;
	}
	.column-grid > span {
		position: absolute;
		width: 100%;
		border-top: 1px dashed color-mix(in oklab, var(--color-base-content) 12%, transparent);
	}
	.column-day {
		min-width: 0;
		position: relative;
	}
	.column-bars {
		display: flex;
		gap: 2px;
		justify-content: center;
		height: var(--plot-height);
	}
	.column-hit {
		position: relative;
		flex: 1;
		min-width: 0;
		max-width: 28px;
		height: 100%;
		cursor: pointer;
		border-radius: 4px;
		background: transparent;
		padding: 0;
		border: 0;
	}
	.column-hit:hover,
	.column-hit--active {
		background: color-mix(in oklab, currentColor 7%, transparent);
	}
	.column-hit:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 0;
	}
	.column-bar {
		position: absolute;
		bottom: 0;
		left: 14%;
		width: 72%;
		border-radius: 4px 4px 0 0;
		background: currentColor;
		opacity: 0.82;
	}
	.column-hit:hover .column-bar,
	.column-hit--active .column-bar {
		opacity: 1;
	}
	.column-bar--zero {
		height: 2px !important;
		border-radius: 0;
	}
	.column-missing {
		position: absolute;
		bottom: -4px;
		left: 0;
		width: 100%;
		color: color-mix(in oklab, var(--color-base-content) 55%, transparent);
		font-size: 16px;
		line-height: 16px;
		text-align: center;
	}
	.column-date {
		display: block;
		min-height: 24px;
		padding-top: 6px;
		text-align: center;
		font-size: 11px;
		line-height: 1.4;
		color: color-mix(in oklab, var(--color-base-content) 70%, transparent);
	}
	.column-detail {
		min-height: 56px;
	}
	.attendance-series {
		color: var(--dashboard-blue);
	}
	.attendance-series--smp {
		color: var(--dashboard-green);
	}
	.attendance-series--sma {
		color: var(--dashboard-amber);
	}
	.attendance-series--unknown {
		color: var(--color-base-content);
	}
</style>
