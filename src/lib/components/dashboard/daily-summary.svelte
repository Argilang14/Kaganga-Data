<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import type { loadDashboardDaily } from '$lib/server/dashboard-daily';
	import Icon from '$lib/components/icon.svelte';
	import AttendanceRefresh from '$lib/components/absensi/AttendanceRefresh.svelte';
	import { fetchAttendanceSnapshot } from '$lib/attendance-refresh';

	type Snapshot = Awaited<ReturnType<typeof loadDashboardDaily>>;
	let { summary: initial }: { summary: Snapshot } = $props();
	let live = $state.raw<{ base: Snapshot; data: Snapshot } | null>(null);
	const summary = $derived(live?.base === initial ? live.data : initial);
	async function refresh(signal: AbortSignal) {
		const base = initial;
		const search = page.url.search;
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

	const labels: Record<string, string> = {
		hadir: 'Hadir',
		terlambat: 'Terlambat',
		izin: 'Izin',
		izin_pulang: 'Izin Pulang',
		sakit: 'Sakit',
		alfa: 'Alfa',
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

	function absenceIconClass(status: string) {
		const base = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-md';
		if (status === 'alfa') return `${base} bg-error/10 text-error`;
		if (status === 'sakit') return `${base} bg-warning/10 text-warning`;
		return `${base} bg-info/10 text-info`;
	}

	const absenceTotal = $derived(summary.absences.reduce((total, group) => total + group.total, 0));
</script>

<div class="min-w-0 space-y-4">
	<section
		id="absensi-hari-ini"
		class="min-w-0 overflow-hidden rounded-lg bg-base-100 shadow-sm"
		aria-label="Absensi hari ini"
	>
		<div class="border-b border-base-200 px-5 py-4">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="flex min-w-0 items-center gap-3">
					<span
						class="bg-success/10 text-success flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
						aria-hidden="true"
					>
						<Icon name="users" class="h-5 w-5" />
					</span>
					<div class="min-w-0">
						<h2 class="text-lg font-bold">Absensi Hari Ini</h2>
						<p class="truncate text-xs text-base-content/55">Cakupan: {summary.scope}</p>
					</div>
				</div>
				<div
					class="flex items-center gap-2 rounded-md bg-base-200/60 px-3 py-2 text-sm font-medium"
				>
					<span class="text-primary" aria-hidden="true"
						><Icon name="calendar" class="h-4 w-4" /></span
					>
					<span>{formatDashboardDate(summary.date)}</span>
				</div>
			</div>
			<div class="mt-3 flex flex-wrap items-center justify-between gap-3">
				{#if summary.studentSource}<label class="flex min-w-0 flex-wrap items-center gap-2 text-xs">
						<span>Sumber masuk sekolah</span><select
							aria-label="Sumber masuk sekolah"
							class="select select-sm max-w-full"
							value={summary.studentSource.source}
							onchange={(event) => changeSource(event.currentTarget.value)}
						>
							<option value="">Pilih Sumber Kegiatan</option><option value="harian"
								>Absensi Harian Sekolah</option
							>
							{#each summary.sourceOptions as option}<option value={String(option.id)}
									>{option.nama}</option
								>{/each}
						</select></label
					>{/if}
				<AttendanceRefresh context={initial} updatedAt={summary.generatedAt} onrefresh={refresh} />
				{#if summary.monitoringHref}<a class="btn btn-ghost btn-sm" href={summary.monitoringHref}
						><Icon name="activity" class="h-4 w-4" />Monitoring</a
					>{/if}
			</div>
		</div>

		<div class="px-5 pt-4">
			{#if summary.studentSource && !summary.studentSource.source}
				<div class="alert alert-warning alert-soft mb-4 py-2 text-sm">
					<Icon name="warning" class="h-4 w-4" /><span
						>Sumber masuk sekolah belum dipilih atau tidak aktif.</span
					>
				</div>
			{/if}
			{#if summary.holiday}
				<div class="alert alert-warning alert-soft mb-4 py-2 text-sm">
					<Icon name="calendar" class="h-4 w-4" />
					<span>Hari libur atau hari non-efektif.</span>
				</div>
			{/if}

			<div class="grid overflow-hidden rounded-lg border border-base-200 sm:grid-cols-2">
				{#each [{ name: 'Murid', value: summary.students }, { name: 'Pegawai', value: summary.employees }] as item, index}
					{#if item.value}
						<div
							class="p-4 sm:border-t-0 sm:border-l sm:first:border-l-0"
							class:border-t={index > 0}
						>
							<div class="mb-3 flex items-center justify-between gap-3">
								<div class="flex items-center gap-2 font-semibold">
									<span class="text-primary" aria-hidden="true"
										><Icon name="user" class="h-4 w-4" /></span
									>
									{item.name}
								</div>
								<div class="text-right">
									<strong class="text-xl leading-none">{item.value.recorded}</strong>
									<span class="text-xs text-base-content/55"> / {item.value.total} terisi</span>
								</div>
							</div>
							<div class="h-2 overflow-hidden rounded-full bg-base-200" aria-hidden="true">
								<div
									class="bg-success h-full rounded-full transition-[width]"
									style={`width: ${attendanceRate(item.value)}%`}
								></div>
							</div>
							<div class="mt-2 flex items-center justify-between gap-2 text-xs">
								<span class="font-semibold text-success"
									>{attendanceRate(item.value)}% tercatat</span
								>
								<span class:text-warning={item.value.unrecorded > 0} class="text-base-content/55">
									{item.value.unrecorded} belum diisi
								</span>
							</div>
							<div class="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-base-content/65">
								{#each item.value.rows as row}
									<span
										><strong class="text-base-content">{row.count}</strong>
										{labels[row.status] ?? row.status}</span
									>
								{/each}
								{#if item.value.rows.length === 0}
									<span>Belum ada presensi tercatat</span>
								{/if}
							</div>
						</div>
					{/if}
				{/each}
			</div>
		</div>

		{#if summary.students}<div class="px-5 pt-5 pb-5">
				<div class="mb-3 flex items-center justify-between gap-3">
					<div>
						<h3 class="font-semibold">Ketidakhadiran Murid</h3>
						<p class="text-xs text-base-content/55">Klik status untuk melihat nama dan kelas.</p>
					</div>
					<span class="badge badge-neutral badge-soft">{absenceTotal} anak</span>
				</div>

				<div class="overflow-hidden rounded-lg border border-base-200">
					{#each summary.absences as group}
						<details class="group border-b border-base-200 last:border-b-0" open={group.total > 0}>
							<summary
								class="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden"
							>
								<span class={absenceIconClass(group.status)} aria-hidden="true">
									<Icon
										name={group.status === 'alfa'
											? 'warning'
											: group.status === 'sakit'
												? 'info'
												: 'pen'}
										class="h-4 w-4"
									/>
								</span>
								<span class="min-w-0 flex-1">
									<span class="block text-sm font-semibold">{labels[group.status]}</span>
									<span class="text-xs text-base-content/55">{group.total} anak</span>
								</span>
								<span
									class="text-base-content/40 transition-transform group-open:rotate-180"
									aria-hidden="true"
								>
									<Icon name="down" class="h-4 w-4" />
								</span>
							</summary>

							{#if group.students.length}
								<div class="border-t border-base-200 px-3 pb-3">
									<div class="overflow-x-auto">
										<table
											class="table table-sm"
											aria-label={`Daftar murid ${labels[group.status]}`}
										>
											<thead><tr><th>Nama Murid</th><th>Kelas</th></tr></thead>
											<tbody>
												{#each group.students as student}
													<tr
														><td class="break-words">{student.nama}</td><td>{student.kelas}</td></tr
													>
												{/each}
											</tbody>
										</table>
									</div>
									{#if group.pageCount > 1}
										<nav
											class="mt-2 flex items-center justify-end gap-3 text-sm"
											aria-label={`Halaman daftar ${labels[group.status]}`}
										>
											<span>{group.page} / {group.pageCount}</span>
											{#if group.previous}
												<a
													class="btn btn-ghost btn-sm btn-square"
													href={group.previous}
													title="Halaman sebelumnya"
													aria-label="Halaman sebelumnya"><Icon name="left" class="h-4 w-4" /></a
												>
											{/if}
											{#if group.next}
												<a
													class="btn btn-ghost btn-sm btn-square"
													href={group.next}
													title="Halaman berikutnya"
													aria-label="Halaman berikutnya"><Icon name="right" class="h-4 w-4" /></a
												>
											{/if}
										</nav>
									{/if}
								</div>
							{:else}
								<p class="border-t border-base-200 px-3 py-3 text-xs text-base-content/60">
									Tidak ada murid {labels[group.status].toLowerCase()} yang tercatat hari ini.
								</p>
							{/if}
						</details>
					{/each}
				</div>
			</div>{/if}
	</section>
</div>
