<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/icon.svelte';
	import type { loadDashboardAchievements } from '$lib/server/dashboard-achievements';
	let { summary }: { summary: NonNullable<Awaited<ReturnType<typeof loadDashboardAchievements>>> } =
		$props();
	let chosen = $state<{ search: string; tab: string } | null>(null);
	const tab = $derived(
		chosen?.search === page.url.search
			? chosen.tab
			: (summary.monthly && page.url.searchParams.get('prestasi_tab') === 'kehadiran') ||
				  !summary.academic
				? 'kehadiran'
				: 'akademik'
	);
	let dialog: HTMLDialogElement;
	function select(value: string) {
		chosen = { search: page.url.search, tab: value };
	}
	function dateLabel(date: string) {
		return new Intl.DateTimeFormat('id-ID', {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			timeZone: 'Asia/Jakarta'
		}).format(new Date(`${date}T12:00:00+07:00`));
	}
</script>

<section
	id="prestasi-murid"
	class="dashboard-panel dashboard-achievements min-w-0 overflow-hidden rounded-lg shadow-sm"
	aria-label="Prestasi murid"
>
	<header
		class="dashboard-panel-heading flex items-center gap-3 border-b border-base-200 px-5 py-3"
	>
		<span
			class="flex size-9 shrink-0 items-center justify-center rounded-md bg-warning/15 text-warning"
			aria-hidden="true"><Icon name="star" class="size-5" /></span
		>
		<div>
			<h2 class="text-lg font-bold">Prestasi Murid</h2>
			<p class="text-xs text-base-content/55">Sorotan dalam cakupan Anda</p>
		</div>
	</header>
	<div class="flex border-b border-base-200 px-3" role="tablist" aria-label="Jenis prestasi murid">
		{#if summary.academic}<button
				type="button"
				role="tab"
				aria-selected={tab === 'akademik'}
				aria-controls="dashboard-achievement-tab"
				class="flex min-w-0 flex-1 items-center justify-center gap-2 border-b-2 px-2 py-3 text-xs font-semibold"
				class:border-warning={tab === 'akademik'}
				class:border-transparent={tab !== 'akademik'}
				onclick={() => select('akademik')}
			>
				<Icon name="book" class="size-4 shrink-0" />Akademik
			</button>{/if}
		{#if summary.monthly}<button
				type="button"
				role="tab"
				aria-selected={tab === 'kehadiran'}
				aria-controls="dashboard-achievement-tab"
				class="flex min-w-0 flex-1 items-center justify-center gap-2 border-b-2 px-2 py-3 text-xs font-semibold"
				class:border-warning={tab === 'kehadiran'}
				class:border-transparent={tab !== 'kehadiran'}
				onclick={() => select('kehadiran')}
			>
				<Icon name="calendar" class="size-4 shrink-0" />Kehadiran Konsisten
			</button>{/if}
	</div>
	<div
		id="dashboard-achievement-tab"
		role="tabpanel"
		aria-label={tab === 'akademik' ? 'Prestasi akademik' : 'Kehadiran konsisten'}
		class="p-5"
	>
		{#if tab === 'akademik' && summary.academic}
			<p class="text-xs text-base-content/60">Rapor semester · {summary.semester}</p>
			<p class="mt-1 text-xs text-base-content/55">
				Satu sorotan per jenjang dari kelas dengan nilai lengkap.
			</p>
			<ul class="mt-3 divide-y divide-base-200">
				{#each summary.academic.highlights as highlight (highlight.jenjang)}
					<li class="flex items-start gap-3 py-3">
						<span class={`dashboard-level dashboard-level--${highlight.jenjang}`}
							>{highlight.jenjang.toUpperCase()}</span
						>
						<div class="min-w-0 flex-1">
							{#if highlight.student}<p class="break-words text-sm font-semibold">
									{highlight.student.nama}
								</p>
								<p class="mt-1 text-xs text-base-content/60">
									{highlight.student.kelas} · Peringkat 1 di kelas
								</p>
								{#if highlight.tied > 1}<p class="mt-1 text-xs text-warning">
										{highlight.tied} kandidat dengan nilai seri
									</p>{/if}
							{:else}<p class="text-sm text-base-content/60">
									{highlight.incompleteClasses > 0
										? 'Nilai belum lengkap'
										: 'Belum ada sorotan dalam cakupan Anda.'}
								</p>{/if}
							{#if highlight.incompleteClasses > 0}<p class="mt-1 text-xs text-base-content/55">
									{highlight.incompleteClasses} kelas belum lengkap · Sementara
								</p>{/if}
						</div>
						{#if highlight.student}<div class="shrink-0 text-right">
								<strong class="text-lg tabular-nums">
									{highlight.student.nilaiRataRata?.toLocaleString('id-ID', {
										minimumFractionDigits: 2,
										maximumFractionDigits: 2
									})}
								</strong>
								<p class="text-xs text-base-content/55">Rata-rata</p>
							</div>{/if}
					</li>
				{/each}
			</ul>
			{#if !summary.academic.highlights.length}<p class="mt-4 text-sm text-base-content/60">
					Belum ada kelas dengan jenjang SD, SMP, atau SMA dalam cakupan Anda.
				</p>{/if}
		{:else if summary.monthly}
			<p class="text-xs text-base-content/60">
				{dateLabel(summary.monthly.start)} - {dateLabel(summary.monthly.end)} · Sementara
			</p>
			<p class="mt-1 break-words text-xs text-base-content/55">
				Masuk sekolah · {summary.monthly.source}
			</p>
			{#if summary.monthly.available}
				<div class="my-4 flex flex-wrap items-baseline gap-2">
					<strong class="text-3xl text-success tabular-nums">{summary.monthly.consistent}</strong
					><span class="text-sm">murid konsisten</span>
				</div>
				<ul class="divide-y divide-base-200">
					{#each summary.monthly.rows.slice(0, 3) as row (row.id)}<li
							class="flex items-start justify-between gap-3 py-3"
						>
							<div class="min-w-0">
								<p class="break-words text-sm font-semibold">{row.nama}</p>
								<p class="mt-1 text-xs text-base-content/55">{row.kelas}</p>
							</div>
							<span class="shrink-0 text-xs font-semibold text-success">{row.days} hari</span>
						</li>{/each}
				</ul>
				{#if !summary.monthly.rows.length}<p class="text-sm text-base-content/60">
						Belum ada murid yang memenuhi kelengkapan kehadiran periode ini.
					</p>{/if}
				<div class="mt-3 flex flex-wrap items-center justify-between gap-2">
					<span class="text-xs text-base-content/55"
						>{summary.monthly.incomplete + summary.monthly.partial} belum cukup data</span
					>
					{#if summary.monthly.rows.length}<button
							type="button"
							class="btn btn-ghost btn-sm"
							onclick={() => dialog.showModal()}
							>Lihat daftar <Icon name="right" class="size-4" /></button
						>{/if}
				</div>
			{:else}<p class="mt-4 text-sm text-base-content/60">
					Sumber masuk sekolah atau periode semester belum tersedia untuk bulan ini.
				</p>{/if}
		{/if}
	</div>
</section>
<dialog bind:this={dialog} class="modal" aria-labelledby="dashboard-consistency-dialog-title">
	<div class="modal-box max-w-lg">
		<header class="flex items-start justify-between gap-3">
			<h3 id="dashboard-consistency-dialog-title" class="font-bold">
				Kehadiran Konsisten · {summary.monthly?.consistent ?? 0} murid
			</h3>
			<button
				type="button"
				class="btn btn-ghost btn-sm btn-square"
				aria-label="Tutup daftar kehadiran konsisten"
				onclick={() => dialog.close()}><Icon name="close" class="size-4" /></button
			>
		</header>
		<ul class="mt-4 divide-y divide-base-200">
			{#each summary.monthly?.rows ?? [] as row (row.id)}<li
					class="flex items-start justify-between gap-3 py-3 text-sm"
				>
					<div class="min-w-0">
						<p class="break-words font-semibold">{row.nama}</p>
						<p class="text-xs text-base-content/55">{row.kelas}</p>
					</div>
					<span class="shrink-0 text-success">{row.days} hari</span>
				</li>{/each}
		</ul>
		{#if summary.monthly && summary.monthly.pageCount > 1}<nav
				class="mt-3 flex items-center justify-end gap-3 text-sm"
				aria-label="Halaman kehadiran konsisten"
			>
				<span>{summary.monthly.page} / {summary.monthly.pageCount}</span>
				{#if summary.monthly.previous}<a
						class="btn btn-ghost btn-sm btn-square"
						href={resolve(summary.monthly.previous)}
						aria-label="Kehadiran sebelumnya"><Icon name="left" class="size-4" /></a
					>{/if}
				{#if summary.monthly.next}<a
						class="btn btn-ghost btn-sm btn-square"
						href={resolve(summary.monthly.next)}
						aria-label="Kehadiran berikutnya"><Icon name="right" class="size-4" /></a
					>{/if}
			</nav>{/if}
	</div>
	<form method="dialog" class="modal-backdrop">
		<button aria-label="Tutup popup kehadiran">Tutup</button>
	</form>
</dialog>
