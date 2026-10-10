<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import type { loadDashboardDaily } from '$lib/server/dashboard-daily';
	import Icon from '$lib/components/icon.svelte';
	import AttendanceRefresh from '$lib/components/absensi/AttendanceRefresh.svelte';
	import { fetchAttendanceSnapshot } from '$lib/attendance-refresh';
	import ClassAttendanceSummary from './class-attendance-summary.svelte';
	import ActivitySummary from './activity-summary.svelte';
	type Snapshot = Awaited<ReturnType<typeof loadDashboardDaily>>;
	let { summary: initial, children }: { summary: Snapshot; children?: Snippet<[Snapshot]> } =
		$props();
	let live = $state.raw<{ base: Snapshot; data: Snapshot } | null>(null);
	const summary = $derived(live?.base === initial ? live.data : initial);
	async function refresh(signal: AbortSignal) {
		const base = initial,
			search = page.url.search;
		const updated = await fetchAttendanceSnapshot<Snapshot>(
			`/api/dashboard/daily${search}`,
			signal
		);
		if (!signal.aborted && base === initial && search === page.url.search)
			live = { base, data: updated };
	}
	function changeSource(source: string) {
		const params = new URLSearchParams(page.url.search);
		params.set('sumber_masuk', source);
		for (const key of ['sakit_page', 'izin_page', 'alfa_page', 'izin_pulang_page'])
			params.delete(key);
		void goto(`/?${params}#absensi-hari-ini`, { noScroll: true, keepFocus: true });
	}
	function changeTab(tab: string) {
		const params = new URLSearchParams(page.url.search);
		params.set('absensi_tab', tab);
		void goto(`/?${params}#absensi-hari-ini`, { noScroll: true, keepFocus: true });
	}
	const labels: Record<string, string> = {
		hadir: 'Hadir',
		terlambat: 'Terlambat',
		izin: 'Izin',
		izin_pulang: 'Izin Pulang',
		sakit: 'Sakit',
		alfa: 'Alfa',
		pulang: 'Pulang',
		dinas_luar: 'Dinas luar',
		cuti: 'Cuti'
	};
	function attendanceRate(value: { total: number; recorded: number }) {
		return value.total > 0 ? Math.round((value.recorded / value.total) * 100) : 0;
	}
	function formatDashboardDate(value: string) {
		const date = new Date(`${value}T12:00:00+07:00`);
		return Number.isNaN(date.getTime())
			? value
			: new Intl.DateTimeFormat('id-ID', {
					weekday: 'long',
					day: 'numeric',
					month: 'long',
					year: 'numeric',
					timeZone: 'Asia/Jakarta'
				}).format(date);
	}
	const schoolStats = $derived.by(() => {
		const departure = summary.activitySummaries.find((activity) => activity.key === 'pulang');
		return [
			{ name: 'Murid', tone: 'students', value: summary.students },
			{
				name: 'Pulang Sekolah',
				tone: 'departure',
				value: departure
					? {
							total: departure.total,
							recorded: departure.recorded,
							unrecorded: departure.total - departure.recorded,
							rows: Object.entries(departure.counts)
								.filter(([key, count]) => count > 0 && !['belum', 'tanpa_sumber'].includes(key))
								.map(([status, count]) => ({ status, count }))
						}
					: null
			},
			{ name: 'Pegawai Aktif', tone: 'employees', value: summary.employees }
		].filter((item) => item.value !== null);
	});
	let dialog: HTMLDialogElement;
	let selectedStatus = $state<string | null>(null);
	const selectedGroup = $derived(summary.absences.find((group) => group.status === selectedStatus));
	function openAbsence(status: string) {
		selectedStatus = status;
		dialog.showModal();
	}
</script>

<div class="min-w-0 space-y-4">
	<section
		id="absensi-hari-ini"
		class="dashboard-panel dashboard-attendance min-w-0 overflow-hidden rounded-lg shadow-sm"
		aria-label="Absensi hari ini"
	>
		<header
			class="dashboard-panel-heading flex flex-wrap items-center justify-between gap-3 border-b border-base-200 px-5 py-3"
		>
			<div class="flex min-w-0 items-center gap-3">
				<span
					class="flex size-9 shrink-0 items-center justify-center rounded-md bg-success/10 text-success"
					aria-hidden="true"><Icon name="users" class="size-5" /></span
				>
				<div class="min-w-0">
					<h2 class="text-lg font-bold">Absensi Hari Ini</h2>
					<p class="text-xs text-base-content/55">Cakupan: {summary.scope}</p>
				</div>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<span class="text-xs text-base-content/65">{formatDashboardDate(summary.date)}</span>
				{#if summary.monitoringHref}<a class="btn btn-ghost btn-sm" href={summary.monitoringHref}
						><Icon name="activity" class="size-4" />Monitoring</a
					>{/if}
			</div>
		</header>
		<div class="flex flex-wrap items-center justify-between gap-x-3 border-b border-base-200 px-4">
			{#if summary.activityTabs.length}<div
					class="flex min-w-0"
					role="tablist"
					aria-label="Jenis absensi hari ini"
				>
					{#each summary.activityTabs as tab (tab.key)}<button
							type="button"
							role="tab"
							aria-selected={summary.activityTab === tab.key}
							aria-controls="dashboard-attendance-tab"
							class="flex min-w-0 items-center justify-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold sm:px-5"
							class:border-success={summary.activityTab === tab.key}
							class:text-success={summary.activityTab === tab.key}
							class:border-transparent={summary.activityTab !== tab.key}
							onclick={() => changeTab(tab.key)}
						>
							<Icon name={tab.icon} class="size-4 shrink-0" />{tab.label}
						</button>{/each}
				</div>{/if}
			<div class="py-2">
				<AttendanceRefresh context={initial} updatedAt={summary.generatedAt} onrefresh={refresh} />
			</div>
		</div>
		<div
			id="dashboard-attendance-tab"
			role="tabpanel"
			aria-label={summary.activityTabs.find((tab) => tab.key === summary.activityTab)?.label ??
				'Sekolah'}
		>
			{#if summary.activityTab === 'sekolah'}
				<div class="px-5 pt-3">
					{#if summary.studentSource}<label
							class="flex min-w-0 flex-wrap items-center gap-2 text-xs"
						>
							<span>Sumber masuk sekolah</span><select
								aria-label="Sumber masuk sekolah"
								class="select select-sm max-w-full"
								value={summary.studentSource.source}
								onchange={(event) => changeSource(event.currentTarget.value)}
							>
								<option value="">Pilih Sumber Kegiatan</option><option value="harian"
									>Absensi Harian Sekolah</option
								>
								{#each summary.sourceOptions as option (option.id)}<option value={String(option.id)}
										>{option.nama}</option
									>{/each}
							</select></label
						>{/if}
					{#if summary.studentSource && !summary.studentSource.source}<p
							class="mt-3 text-sm text-warning"
						>
							Sumber masuk sekolah belum dipilih atau tidak aktif.
						</p>{/if}
					{#if summary.holiday}<p class="mt-3 flex items-center gap-2 text-sm text-warning">
							<Icon name="calendar" class="size-4" />Hari libur atau hari non-efektif.
						</p>{/if}
				</div>
				<div class="dashboard-school-stats" style={`--school-columns: ${schoolStats.length}`}>
					{#each schoolStats as item (item.name)}{#if item.value}
							<div
								class={`dashboard-attendance-summary dashboard-attendance-summary--${item.tone} min-w-0 p-4`}
							>
								<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
									<h3 class="flex items-center gap-2 text-sm font-semibold">
										<Icon name="user" class="size-4" />{item.name}
									</h3>
									<div>
										<strong class="text-xl tabular-nums">{item.value.recorded}</strong><span
											class="text-xs text-base-content/55"
										>
											/ {item.value.total} terisi</span
										>
									</div>
								</div>
								<progress
									class="progress progress-success block h-1.5 w-full"
									value={attendanceRate(item.value)}
									max="100"
									aria-label={`Kelengkapan ${item.name}`}
								></progress>
								<div class="mt-2 flex justify-between gap-2 text-xs">
									<span class="font-semibold text-success"
										>{attendanceRate(item.value)}% tercatat</span
									>
									<span class:text-warning={item.value.unrecorded > 0}
										>{item.value.unrecorded} belum diisi</span
									>
								</div>
								<div class="mt-3 flex flex-wrap gap-1.5 text-xs">
									{#each item.value.rows as row (row.status)}<span
											class={`dashboard-attendance-status dashboard-attendance-status--${row.status}`}
											><strong>{row.count}</strong> {labels[row.status] ?? row.status}</span
										>{/each}
									{#if !item.value.rows.length}<span class="text-base-content/55"
											>Belum ada presensi tercatat</span
										>{/if}
								</div>
							</div>
						{/if}{/each}
				</div>
				{#if summary.students}<div
						class="flex flex-wrap items-center gap-2 border-t border-base-200 px-5 py-3"
					>
						<span class="mr-1 text-xs font-medium text-base-content/60">Tidak hadir</span>
						{#each summary.absences as group (group.status)}<button
								type="button"
								class={`dashboard-status-chip dashboard-attendance-status--${group.status}`}
								aria-label={`${labels[group.status]} ${group.total} anak`}
								onclick={() => openAbsence(group.status)}
							>
								<Icon
									name={group.status === 'alfa'
										? 'warning'
										: group.status === 'sakit'
											? 'info'
											: 'pen'}
									class="size-3.5"
								/>
								{labels[group.status]}<strong>{group.total}</strong>
							</button>{/each}
					</div>{/if}
			{:else}<ActivitySummary activities={summary.activitySummaries} />{/if}
		</div>
	</section>
	{#if children}{@render children(summary)}{:else if summary.leadership}<ClassAttendanceSummary
			scope={summary.leadership}
		/>{/if}
</div>

<dialog bind:this={dialog} class="modal" aria-labelledby="dashboard-absence-dialog-title">
	<div class="modal-box max-w-lg">
		<header class="flex items-start justify-between gap-3">
			<div>
				<h3 id="dashboard-absence-dialog-title" class="font-bold">
					{labels[selectedStatus ?? '']} · {selectedGroup?.total ?? 0} anak
				</h3>
				<p class="mt-1 text-xs text-base-content/60">{formatDashboardDate(summary.date)}</p>
			</div>
			<button
				type="button"
				class="btn btn-ghost btn-sm btn-square"
				aria-label="Tutup daftar ketidakhadiran"
				onclick={() => dialog.close()}><Icon name="close" class="size-4" /></button
			>
		</header>
		{#if selectedGroup?.students.length}
			<ul
				class="mt-4 divide-y divide-base-200"
				aria-label={`Daftar murid ${labels[selectedStatus ?? '']}`}
			>
				{#each selectedGroup.students as student (student.id)}<li
						class="flex items-start justify-between gap-3 py-3 text-sm"
					>
						<span class="min-w-0 break-words">{student.nama}</span><span
							class="shrink-0 text-base-content/55">{student.kelas}</span
						>
					</li>{/each}
			</ul>
			{#if selectedGroup.pageCount > 1}<nav
					class="mt-3 flex items-center justify-end gap-3 text-sm"
					aria-label="Halaman daftar ketidakhadiran"
				>
					<span>{selectedGroup.page} / {selectedGroup.pageCount}</span>
					{#if selectedGroup.previous}<a
							class="btn btn-ghost btn-sm btn-square"
							href={selectedGroup.previous}
							aria-label="Halaman sebelumnya"><Icon name="left" class="size-4" /></a
						>{/if}
					{#if selectedGroup.next}<a
							class="btn btn-ghost btn-sm btn-square"
							href={selectedGroup.next}
							aria-label="Halaman berikutnya"><Icon name="right" class="size-4" /></a
						>{/if}
				</nav>{/if}
		{:else}<p class="mt-4 text-sm text-base-content/60">Tidak ada murid dalam daftar ini.</p>{/if}
	</div>
	<form method="dialog" class="modal-backdrop">
		<button aria-label="Tutup popup ketidakhadiran">Tutup</button>
	</form>
</dialog>
