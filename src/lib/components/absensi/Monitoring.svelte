<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/icon.svelte';
	import AttendanceRefresh from './AttendanceRefresh.svelte';
	import { fetchAttendanceSnapshot } from '$lib/attendance-refresh';
	import { monitoringOverview } from '$lib/attendance-monitoring-view';
	import type { loadAttendanceMonitoring } from '$lib/server/attendance-monitoring';
	import type { MonitoringCell, MonitoringStatus } from '$lib/attendance-monitoring';
	type Snapshot = Awaited<ReturnType<typeof loadAttendanceMonitoring>>;
	type Column = Snapshot['columns'][number];
	type Row = Snapshot['rows'][number];
	let { monitoring: initial }: { monitoring: Snapshot } = $props();
	let live = $state.raw<{ base: Snapshot; data: Snapshot } | null>(null);
	let showFilters = $state(false);
	const data = $derived(live?.base === initial ? live.data : initial);
	async function refresh(signal: AbortSignal) {
		const base = initial;
		const search = page.url.search;
		const updated = await fetchAttendanceSnapshot<Snapshot>(
			`/api/administrasi/absensi/monitoring${search}`,
			signal
		);
		if (!signal.aborted && base === initial && search === page.url.search)
			live = { base, data: updated };
	}
	function activityLink(column: Column, classId: number) {
		const params = new URLSearchParams({ kelas_id: String(classId) });
		if (column.activityId) params.set('kegiatan_id', String(column.activityId));
		params.set('tanggal', data.date);
		return `${column.entryPath}?${params}`;
	}
	const selectedSummary = $derived(data.summaries.find((item) => item.key === data.focus)!);
	const overview = $derived(monitoringOverview(selectedSummary.counts, data.total));
	const classes = $derived(
		data.classes.filter((item) => data.level === 'semua' || item.jenjang === data.level)
	);
	const dateLabel = $derived(
		new Intl.DateTimeFormat('id-ID', {
			timeZone: 'Asia/Jakarta',
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		}).format(new Date(`${data.date}T12:00:00+07:00`))
	);
	const absenceNote = $derived(
		(['sakit', 'izin', 'izin_pulang', 'alfa'] as const)
			.filter((status) => selectedSummary.counts[status] > 0)
			.map(
				(status) => `${selectedSummary.counts[status]} ${data.statusLabels[status].toLowerCase()}`
			)
			.join(' · ') || 'Sakit, izin, izin pulang, alfa'
	);
	function filter(key: string, value: string) {
		const params = new URLSearchParams(page.url.search);
		if (value || key.startsWith('sumber_')) params.set(key, value);
		else params.delete(key);
		params.delete('page');
		if (key === 'jenjang') params.delete('kelas_id');
		if (key === 'tab') {
			params.delete('kolom');
			params.delete('status');
			params.delete('perjalanan');
		}
		void goto(`${page.url.pathname}?${params}`, { keepFocus: true, noScroll: true });
	}
	function link(key: string, value: string) {
		const params = new URLSearchParams(page.url.search);
		params.set(key, value);
		if (key === 'perjalanan') params.delete('page');
		if (key === 'tab') {
			params.delete('kolom');
			params.delete('status');
			params.delete('perjalanan');
			params.delete('page');
		}
		return `${page.url.pathname}?${params}`;
	}
	function badge(status: MonitoringStatus) {
		if (status === 'hadir' || status === 'pulang') return 'badge-success badge-soft';
		if (status === 'terlambat') return 'badge-warning badge-soft';
		if (status === 'alfa') return 'badge-error badge-soft';
		if (status === 'sakit' || status === 'izin' || status === 'izin_pulang')
			return 'badge-info badge-soft';
		return 'badge-ghost';
	}
	function statusIcon(status: MonitoringStatus): IconName {
		if (status === 'hadir' || status === 'pulang') return 'check';
		if (status === 'terlambat') return 'activity';
		if (status === 'alfa') return 'warning';
		if (status === 'sakit') return 'info';
		if (status === 'izin' || status === 'izin_pulang') return 'export';
		return 'question';
	}
	function tabIcon(tab: Snapshot['tab']): IconName {
		return tab === 'sholat'
			? 'moon'
			: tab === 'makan'
				? 'coffee'
				: tab === 'asrama'
					? 'users'
					: 'school';
	}
	function time(value: string | null) {
		if (!value) return '';
		const date = new Date(value);
		return Number.isNaN(date.getTime())
			? '-'
			: new Intl.DateTimeFormat('id-ID', {
					timeZone: 'Asia/Jakarta',
					day: '2-digit',
					month: 'short',
					hour: '2-digit',
					minute: '2-digit'
				}).format(date);
	}
</script>

{#snippet attendanceCell(cell: MonitoringCell, column: Column, row: Row)}
	<div class="monitoring-cell">
		<span class={`badge h-auto min-h-6 gap-1 whitespace-normal py-1 text-xs ${badge(cell.status)}`}>
			<Icon name={statusIcon(cell.status)} class="h-3.5 w-3.5 shrink-0" />
			{data.statusLabels[cell.status]}
		</span>
		{#if cell.linkedFrom}<span class="monitoring-cell-note">Info dari {cell.linkedFrom}</span>{/if}
		{#if cell.time || cell.method}
			<span class="monitoring-cell-note">
				{#if cell.time}<time datetime={cell.time}>{time(cell.time)}</time>{/if}
				{#if cell.time && cell.method}<span aria-hidden="true"> · </span>{/if}
				{#if cell.method}{cell.method === 'qr'
						? 'Scan QR'
						: cell.method === 'auto'
							? 'Otomatis'
							: 'Manual'}{/if}
			</span>
		{/if}
		{#if column.entryPath}
			<a
				class="btn btn-ghost btn-xs btn-square monitoring-entry"
				title={`Catat ${column.label}`}
				aria-label={`Catat ${column.label} - ${row.nama}`}
				href={activityLink(column, row.kelasId)}><Icon name="edit" class="h-3.5 w-3.5" /></a
			>
		{/if}
	</div>
{/snippet}

{#snippet journeys(row: Row)}
	<div class="monitoring-journeys">
		{#each row.journeys as journey (journey.key)}
			<div class="monitoring-journey" data-status={journey.status}>
				<Icon
					name={journey.status === 'tiba'
						? 'check'
						: journey.status === 'periksa'
							? 'warning'
							: journey.status === 'menunggu'
								? 'activity'
								: 'question'}
					class="monitoring-journey-icon h-3.5 w-3.5 shrink-0"
				/>
				<div class="min-w-0">
					<span class="monitoring-journey-title"
						>{journey.key === 'pergi' ? 'Menuju sekolah' : 'Kembali ke asrama'}</span
					>
					<span
						class="mt-1 block text-xs font-semibold"
						class:text-success={journey.status === 'tiba'}
						class:text-warning={journey.status === 'menunggu'}
						class:text-error={journey.status === 'periksa'}>{journey.label}</span
					>
					{#if journey.note}<span class="monitoring-cell-note mt-1 block">{journey.note}</span>{/if}
				</div>
			</div>
		{/each}
	</div>
{/snippet}

<section class="monitoring min-w-0" aria-label="Monitoring Absensi">
	<header class="monitoring-header mb-5">
		<div class="monitoring-heading">
			<span class="monitoring-heading-icon" aria-hidden="true"
				><Icon name="activity" class="h-5 w-5" /></span
			>
			<div class="min-w-0">
				<h1 class="text-xl font-bold">Monitoring Absensi</h1>
				<p class="monitoring-date">
					<Icon name="calendar" class="h-3.5 w-3.5 shrink-0" />{dateLabel}
				</p>
			</div>
		</div>
		<div class="monitoring-refresh">
			<AttendanceRefresh context={initial} updatedAt={data.generatedAt} onrefresh={refresh} />
		</div>
	</header>
	<nav class="monitoring-tabs mb-4" aria-label="Jenis monitoring">
		{#each data.tabs as tab (tab.key)}
			<a
				class="btn btn-ghost min-w-0 border-0 shadow-none"
				class:monitoring-tab-active={data.tab === tab.key}
				data-tab={tab.key}
				aria-current={data.tab === tab.key ? 'page' : undefined}
				href={link('tab', tab.key)}
				><Icon name={tabIcon(tab.key)} class="h-4 w-4 shrink-0" />{tab.label}</a
			>
		{/each}
	</nav>
	<div class="monitoring-filters mb-3">
		<label class="flex min-w-0 flex-col gap-1.5 text-sm">
			<span>Tanggal</span>
			<input
				class="input w-full"
				type="date"
				value={data.date}
				max={data.today}
				onchange={(event) => filter('tanggal', event.currentTarget.value)}
			/>
		</label>
		<label class="flex min-w-0 flex-col gap-1.5 text-sm">
			<span>Kelas</span>
			<select
				class="select w-full"
				value={data.classId ?? ''}
				onchange={(event) => filter('kelas_id', event.currentTarget.value)}
			>
				<option value="">Semua Kelas yang Diizinkan</option>
				{#each classes as kelas (kelas.id)}<option value={kelas.id}>{kelas.nama}</option>{/each}
			</select>
		</label>
		<form
			class="monitoring-search flex min-w-0 flex-col gap-1.5 text-sm"
			onsubmit={(event) => {
				event.preventDefault();
				filter('q', String(new FormData(event.currentTarget).get('q') ?? ''));
			}}
		>
			<label for="monitoring-search">Nama Murid</label>
			<div class="join w-full">
				<input
					id="monitoring-search"
					class="input join-item min-w-0 w-full"
					name="q"
					value={data.query}
					maxlength="100"
					placeholder="Cari nama murid"
				/>
				<button
					class="btn join-item btn-square"
					type="submit"
					title="Cari murid"
					aria-label="Cari murid"
				>
					<Icon name="search" class="h-4 w-4" />
				</button>
			</div>
		</form>
		<button
			class="btn monitoring-filter-button"
			type="button"
			aria-expanded={showFilters}
			aria-controls="monitoring-extra-filters"
			onclick={() => (showFilters = !showFilters)}
		>
			<Icon name="gear" class="h-4 w-4" />Filter
			<Icon name={showFilters ? 'up' : 'down'} class="h-3.5 w-3.5" />
		</button>
	</div>
	<div id="monitoring-extra-filters" class="monitoring-extra-filters" hidden={!showFilters}>
		<label class="flex min-w-0 flex-col gap-1.5 text-sm">
			<span>Jenjang</span>
			<select
				class="select w-full"
				value={data.level}
				onchange={(event) => filter('jenjang', event.currentTarget.value)}
			>
				<option value="semua">Semua Jenjang</option><option value="sd">SD</option>
				<option value="smp">SMP</option><option value="sma">SMA</option>
				<option value="unknown">Belum Ditentukan</option>
			</select>
		</label>
		{#each data.columns as column, index (column.key)}
			<label class="flex min-w-0 flex-col gap-1.5 text-sm">
				<span>Sumber {column.label}</span>
				<select
					class="select w-full"
					value={column.source}
					data-source-key={column.key}
					onchange={(event) => filter(`sumber_${column.key}`, event.currentTarget.value)}
				>
					<option value="">Pilih Sumber Kegiatan</option>
					{#if column.key === 'masuk'}<option value="harian">Absensi Harian Sekolah</option>{/if}
					{#each data.sourceOptions[index].options as activity (activity.id)}<option
							value={String(activity.id)}>{activity.nama}</option
						>{/each}
				</select>
			</label>
		{/each}
	</div>
	{#if !data.activeSemesterId}
		<div class="alert alert-warning my-4" role="status">
			<Icon name="warning" class="h-4 w-4 shrink-0" /><span>Semester aktif belum tersedia.</span>
		</div>
	{/if}
	{#if data.columns.some((column) => !column.source)}
		<div class="alert alert-warning my-4" role="status">
			<Icon name="warning" class="h-4 w-4 shrink-0" />
			<span>Beberapa sumber kegiatan belum dipilih atau tidak aktif.</span>
			<button class="btn btn-sm" type="button" onclick={() => (showFilters = true)}
				>Pilih Sumber</button
			>
		</div>
	{/if}
	{#if data.connection}
		<section class="monitoring-connection my-4" aria-label="Hubungan Sekolah dan Asrama">
			<h2 class="flex items-center gap-2 text-sm font-semibold">
				<Icon name="users" class="h-4 w-4" />Sekolah &amp; Asrama
			</h2>
			<div class="monitoring-connection-counts">
				<a
					href={link('perjalanan', 'menunggu_sekolah')}
					class="monitoring-metric monitoring-connection-card monitoring-connection-school"
					aria-current={data.travel === 'menunggu_sekolah' ? 'true' : undefined}
				>
					<span class="monitoring-metric-title"
						><Icon name="school" class="h-4 w-4 shrink-0" />Belum tiba di sekolah</span
					>
					<strong class="monitoring-number">{data.connection.toSchool}</strong>
					<span class="monitoring-metric-note">Sudah berangkat dari asrama</span>
					<Icon name="right" class="monitoring-connection-arrow h-4 w-4" />
				</a>
				<a
					href={link('perjalanan', 'menunggu_asrama')}
					class="monitoring-metric monitoring-connection-card monitoring-connection-dorm"
					aria-current={data.travel === 'menunggu_asrama' ? 'true' : undefined}
				>
					<span class="monitoring-metric-title"
						><Icon name="users" class="h-4 w-4 shrink-0" />Belum tiba di asrama</span
					>
					<strong class="monitoring-number">{data.connection.toDorm}</strong>
					<span class="monitoring-metric-note">Sudah pulang dari sekolah</span>
					<Icon name="right" class="monitoring-connection-arrow h-4 w-4" />
				</a>
				<a
					href={link('perjalanan', 'periksa')}
					class="monitoring-metric monitoring-connection-card monitoring-connection-review"
					aria-current={data.travel === 'periksa' ? 'true' : undefined}
				>
					<span class="monitoring-metric-title"
						><Icon name="warning" class="h-4 w-4 shrink-0" />Perlu diperiksa</span
					>
					<strong class="monitoring-number">{data.connection.review}</strong>
					<span class="monitoring-metric-note">Catatan atau waktu berbeda</span>
					<Icon name="right" class="monitoring-connection-arrow h-4 w-4" />
				</a>
			</div>
		</section>
	{/if}
	<dl class="monitoring-metrics mt-5" aria-label={`Ringkasan ${selectedSummary.label}`}>
		<div class="monitoring-metric monitoring-metric-total">
			<dt><Icon name="users" class="h-4 w-4 shrink-0" />Total Murid</dt>
			<dd class="monitoring-number">{data.total}</dd>
			<dd class="monitoring-metric-note">Cakupan kelas dan akses</dd>
		</div>
		<div class="monitoring-metric monitoring-metric-present">
			<dt>
				<Icon name="check" class="h-4 w-4 shrink-0 text-success" />{data.focus === 'pulang'
					? 'Sudah Pulang'
					: data.focus === 'asrama_tiba'
						? 'Sudah Tiba'
						: data.focus === 'asrama_berangkat'
							? 'Sudah Berangkat'
							: 'Hadir'}
			</dt>
			<dd class="monitoring-number" data-count="present">{overview.present}</dd>
			<dd class="monitoring-metric-note">
				{selectedSummary.counts.terlambat
					? `${selectedSummary.counts.terlambat} terlambat`
					: selectedSummary.label}
			</dd>
		</div>
		<div class="monitoring-metric monitoring-metric-absent">
			<dt><Icon name="info" class="h-4 w-4 shrink-0 text-info" />Tidak Hadir</dt>
			<dd class="monitoring-number" data-count="absent">{overview.absent}</dd>
			<dd class="monitoring-metric-note">{absenceNote}</dd>
		</div>
		<div class="monitoring-metric monitoring-metric-pending">
			<dt><Icon name="question" class="h-4 w-4 shrink-0 text-warning" />Belum Tercatat</dt>
			<dd class="monitoring-number" data-count="pending">{overview.pending}</dd>
			<dd class="monitoring-metric-note">
				{selectedSummary.counts.tanpa_sumber ? 'Sumber belum dipilih' : 'Bukan otomatis alfa'}
			</dd>
		</div>
	</dl>
	<div class="monitoring-progress my-4">
		<span class="min-w-0 break-words">{selectedSummary.label}</span>
		<progress
			class="progress progress-success min-w-0"
			value={overview.percentage}
			max="100"
			aria-label={`Persentase tercatat ${selectedSummary.label}`}
		></progress>
		<span class="whitespace-nowrap tabular-nums">{overview.percentage}% tercatat</span>
	</div>
	<section class="monitoring-register" aria-label="Pemantauan murid">
		<div class="monitoring-list-heading">
			<div class="monitoring-list-title">
				<span class="monitoring-list-icon" aria-hidden="true"
					><Icon name="users" class="h-5 w-5" /></span
				>
				<div class="min-w-0">
					<h3 class="text-base font-bold">Daftar Murid</h3>
					<p class="mt-0.5 text-xs text-base-content/65" aria-live="polite">
						{data.matched} murid sesuai filter
					</p>
					<div class="mt-1 flex flex-wrap gap-x-3 gap-y-2 text-xs text-base-content/65">
						<p class="min-w-0 break-words">Sumber: {selectedSummary.sourceLabel}</p>
					</div>
				</div>
			</div>
			<div class="monitoring-list-controls">
				{#if data.columns.length > 1}
					<label class="flex min-w-0 flex-col gap-1 text-sm" for="monitoring-focus">
						<span>Kolom Pemantauan</span>
						<select
							id="monitoring-focus"
							class="select select-sm w-full"
							value={data.focus}
							onchange={(event) => filter('kolom', event.currentTarget.value)}
						>
							{#each data.columns as column (column.key)}<option value={column.key}
									>{column.label}</option
								>{/each}
						</select>
					</label>
				{/if}
				<label class="flex min-w-0 flex-col gap-1 text-sm">
					<span>Status</span>
					<select
						class="select select-sm w-full"
						value={data.status}
						aria-label="Filter status monitoring"
						onchange={(event) => filter('status', event.currentTarget.value)}
					>
						<option value="">Semua Status</option>
						{#each Object.entries(data.statusLabels) as [status, label] (status)}
							<option value={status}
								>{label} ({selectedSummary.counts[status as MonitoringStatus]})</option
							>
						{/each}
					</select>
				</label>
				{#if data.connection}
					<label class="monitoring-travel-filter flex min-w-0 flex-col gap-1 text-sm">
						<span>Perjalanan</span>
						<select
							class="select select-sm w-full"
							aria-label="Filter perjalanan"
							value={data.travel}
							onchange={(event) => filter('perjalanan', event.currentTarget.value)}
						>
							<option value="">Semua Perjalanan</option>
							<option value="menunggu_sekolah">Belum tiba di sekolah</option>
							<option value="menunggu_asrama">Belum tiba di asrama</option>
							<option value="periksa">Perlu diperiksa</option>
						</select>
					</label>
				{/if}
			</div>
		</div>
		<div class="monitoring-table-wrap rounded-lg border border-base-300">
			<table class="table" aria-label="Daftar monitoring absensi">
				<thead>
					<tr
						><th class="monitoring-no">No</th><th class="monitoring-name">Nama Murid</th><th
							class="monitoring-class">Kelas</th
						>
						{#each data.columns as column, index (column.key)}
							<th class="monitoring-activity" class:monitoring-focused={data.focus === column.key}>
								<span>{column.label}</span>
								<span class="mt-1 block text-xs font-normal text-base-content/60">
									{monitoringOverview(data.summaries[index].counts, data.total).present} / {data.total}
								</span>
							</th>
						{/each}
						{#if data.connection}<th class="monitoring-journey-heading">Perjalanan</th>{/if}
					</tr>
				</thead>
				<tbody>
					{#each data.rows as row, index (row.id)}
						<tr
							><td class="monitoring-no text-base-content/60">{(data.page - 1) * 30 + index + 1}</td
							>
							<td class="monitoring-name"
								><span class="break-words font-semibold">{row.nama}</span></td
							>
							<td class="monitoring-class whitespace-normal"
								><span class="monitoring-class-label">{row.kelas}</span></td
							>
							{#each row.cells as cell, cellIndex (data.columns[cellIndex].key)}
								<td class:monitoring-focused={data.focus === data.columns[cellIndex].key}
									>{@render attendanceCell(cell, data.columns[cellIndex], row)}</td
								>
							{/each}
							{#if data.connection}<td>{@render journeys(row)}</td>{/if}
						</tr>
					{:else}
						<tr
							><td
								colspan={3 + data.columns.length + (data.connection ? 1 : 0)}
								class="py-10 text-center text-base-content/60"
							>
								Tidak ada murid sesuai filter dan penugasan.
							</td></tr
						>
					{/each}
				</tbody>
			</table>
		</div>
		<div
			class="monitoring-mobile-list rounded-lg border border-base-300"
			aria-label="Daftar monitoring murid"
		>
			{#each data.rows as row, index (row.id)}
				<article class="monitoring-student" aria-label={`Monitoring ${row.nama}`}>
					<header class="mb-3 flex items-start justify-between gap-3">
						<div class="min-w-0">
							<h4 class="break-words font-semibold">{row.nama}</h4>
							<p class="mt-0.5 text-xs text-base-content/65">Kelas {row.kelas}</p>
						</div>
						<span class="pt-0.5 text-xs text-base-content/50"
							>{(data.page - 1) * 30 + index + 1}</span
						>
					</header>
					<dl class="monitoring-student-cells">
						{#each row.cells.slice(0, 2) as cell, cellIndex (data.columns[cellIndex].key)}
							<div class="min-w-0">
								<dt class="mb-1.5 text-xs text-base-content/65">{data.columns[cellIndex].label}</dt>
								<dd>{@render attendanceCell(cell, data.columns[cellIndex], row)}</dd>
							</div>
						{/each}
					</dl>
					{#if row.cells.length > 2}
						<details class="monitoring-student-details mt-3">
							<summary class="text-sm text-base-content/65"
								>{row.cells.length - 2} waktu lainnya</summary
							>
							<dl class="monitoring-student-cells mt-3">
								{#each row.cells.slice(2) as cell, cellIndex (data.columns[cellIndex + 2].key)}
									<div class="min-w-0">
										<dt class="mb-1.5 text-xs text-base-content/65">
											{data.columns[cellIndex + 2].label}
										</dt>
										<dd>{@render attendanceCell(cell, data.columns[cellIndex + 2], row)}</dd>
									</div>
								{/each}
							</dl>
						</details>
					{/if}
					{#if data.connection}<div class="mt-3 border-t border-base-300 pt-3">
							{@render journeys(row)}
						</div>{/if}
				</article>
			{:else}
				<p class="px-4 py-10 text-center text-sm text-base-content/60">
					Tidak ada murid sesuai filter dan penugasan.
				</p>
			{/each}
		</div>
		<nav class="monitoring-pagination mt-4" aria-label="Halaman monitoring">
			<span class="min-w-0 text-sm text-base-content/65">
				{data.matched ? (data.page - 1) * 30 + 1 : 0}-{Math.min(data.page * 30, data.matched)} dari {data.matched}
				murid
			</span>
			<div class="flex shrink-0 items-center gap-2">
				{#if data.page > 1}<a
						class="btn btn-sm btn-square"
						title="Halaman sebelumnya"
						aria-label="Halaman sebelumnya"
						href={link('page', String(data.page - 1))}><Icon name="left" class="h-4 w-4" /></a
					>
				{:else}<button
						class="btn btn-sm btn-square"
						type="button"
						disabled
						aria-disabled="true"
						aria-label="Halaman sebelumnya"
					>
						<Icon name="left" class="h-4 w-4" /></button
					>{/if}
				<span class="text-sm tabular-nums">{data.page} / {data.pageCount}</span>
				{#if data.page < data.pageCount}<a
						class="btn btn-sm btn-square"
						title="Halaman berikutnya"
						aria-label="Halaman berikutnya"
						href={link('page', String(data.page + 1))}><Icon name="right" class="h-4 w-4" /></a
					>
				{:else}<button
						class="btn btn-sm btn-square"
						type="button"
						disabled
						aria-disabled="true"
						aria-label="Halaman berikutnya"
					>
						<Icon name="right" class="h-4 w-4" /></button
					>{/if}
			</div>
		</nav>
	</section>
</section>

<style>
	.monitoring-connection {
		padding-block: 0.5rem;
	}
	.monitoring-connection-counts {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0.75rem;
		margin-top: 0.75rem;
	}
	.monitoring-connection-card {
		position: relative;
		display: flex;
		flex-direction: column;
		text-decoration: none;
		box-shadow: 0 2px 4px #00000005;
		transition:
			background-color 150ms,
			border-color 150ms;
	}
	.monitoring-connection-card:hover,
	.monitoring-connection-card[aria-current='true'] {
		background: color-mix(in oklab, var(--metric-color) 12%, var(--color-base-100));
		border-color: var(--metric-color);
	}
	.monitoring-connection-card:focus-visible {
		outline: 2px solid var(--metric-color);
		outline-offset: 3px;
	}
	.monitoring-connection-card.monitoring-connection-school {
		--metric-color: #0e7490;
	}
	.monitoring-connection-card.monitoring-connection-dorm {
		--metric-color: #a16207;
	}
	.monitoring-connection-card.monitoring-connection-review {
		--metric-color: #be123c;
	}
	.monitoring-connection-card :global(.monitoring-connection-arrow) {
		position: absolute;
		right: 1rem;
		bottom: 1rem;
		color: var(--metric-color);
	}
	.monitoring-connection-card .monitoring-metric-note {
		padding-right: 1.5rem;
	}
	.monitoring-journeys {
		display: grid;
		gap: 0.625rem;
		overflow-wrap: anywhere;
	}
	.monitoring-journey {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		border-left: 2px solid var(--color-base-300);
		padding-left: 0.625rem;
	}
	.monitoring-journey-title {
		display: block;
		font-size: 0.6875rem;
		color: color-mix(in oklab, var(--color-base-content) 65%, transparent);
	}
	.monitoring-journey[data-status='tiba'] {
		border-color: var(--color-success);
	}
	.monitoring-journey[data-status='menunggu'] {
		border-color: var(--color-warning);
	}
	.monitoring-journey[data-status='periksa'] {
		border-color: var(--color-error);
	}
	.monitoring-journey :global(.monitoring-journey-icon) {
		margin-top: 0.125rem;
		color: var(--color-base-content);
	}
	.monitoring-journey-heading {
		min-width: 13rem;
	}
	.monitoring-travel-filter {
		min-width: 0;
	}

	.monitoring :global(svg:not([fill])) {
		fill: currentColor;
	}
	.monitoring-header {
		padding: 1.25rem;
		background: #0b6e62;
		color: #fff;
		border-radius: 0.5rem;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.monitoring-heading {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		min-width: 0;
	}
	.monitoring-heading-icon {
		display: grid;
		place-items: center;
		flex: 0 0 2.5rem;
		height: 2.5rem;
		border-radius: 0.5rem;
		background: #ffffff20;
	}
	.monitoring-date {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-top: 0.375rem;
		font-size: 0.8125rem;
		color: #e3f3ee;
	}
	.monitoring-refresh {
		min-width: 0;
		max-width: 22rem;
	}
	.monitoring-refresh :global(.text-base-content\/60) {
		color: #e3f3ee;
	}
	.monitoring-refresh :global(.btn) {
		background: #fff;
		color: #0b6e62;
		border-color: #ffffff40;
	}
	.monitoring-refresh :global(.text-warning) {
		color: #ffe3a2;
	}
	.monitoring-tabs {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.25rem;
		border: 1px solid var(--color-base-300);
		border-radius: 0.5rem;
		padding: 0.25rem;
		background: var(--color-base-100);
	}
	.monitoring-tabs a {
		--tab-color: #2563eb;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		min-height: 2.75rem;
	}
	.monitoring-tabs a[data-tab='sholat'] {
		--tab-color: #15803d;
	}
	.monitoring-tabs a[data-tab='makan'] {
		--tab-color: #b45309;
	}
	.monitoring-tabs a[data-tab='asrama'] {
		--tab-color: #be185d;
	}
	.monitoring-tabs .monitoring-tab-active {
		color: var(--tab-color);
		background: color-mix(in oklab, var(--tab-color) 12%, var(--color-base-100));
		box-shadow: inset 0 -2px var(--tab-color);
	}
	.monitoring-tabs :global(a) {
		color: var(--color-base-content);
	}
	.monitoring-tabs :global(svg:not([fill])) {
		fill: currentColor;
	}
	.monitoring-filters {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		align-items: end;
		gap: 0.75rem;
		padding: 1rem;
		background: color-mix(in oklab, #2563eb 3%, var(--color-base-100));
		border-block: 1px solid var(--color-base-300);
	}
	.monitoring-search {
		grid-column: 1 / -1;
	}
	.monitoring-filter-button {
		grid-column: 1 / -1;
		justify-self: start;
	}
	.monitoring-extra-filters {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0.75rem;
		margin: 1rem 0;
		padding: 1rem 0;
		border-block: 1px solid var(--color-base-300);
	}
	.monitoring-extra-filters[hidden] {
		display: none;
	}
	.monitoring-metrics {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
	}
	.monitoring-metric {
		--metric-color: #2563eb;
		min-width: 0;
		padding: 1rem;
		border: 1px solid color-mix(in oklab, var(--metric-color) 18%, var(--color-base-300));
		border-top: 3px solid var(--metric-color);
		border-radius: 0.5rem;
		background: color-mix(in oklab, var(--metric-color) 6%, var(--color-base-100));
	}
	.monitoring-metric-present {
		--metric-color: #15803d;
	}
	.monitoring-metric-absent {
		--metric-color: #be123c;
	}
	.monitoring-metric-pending {
		--metric-color: #a16207;
	}
	.monitoring-metric dt,
	.monitoring-metric-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 1.5rem;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-base-content);
	}
	.monitoring-metric dt :global(svg),
	.monitoring-metric-title :global(svg) {
		color: var(--metric-color);
	}
	.monitoring-number {
		margin: 0.5rem 0 0.25rem;
		font-size: 1.75rem;
		line-height: 1.25;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--metric-color);
	}
	.monitoring-metric-note {
		font-size: 0.75rem;
		color: color-mix(in oklab, var(--color-base-content) 70%, transparent);
		overflow-wrap: anywhere;
	}
	.monitoring-progress {
		padding: 0.875rem 1rem;
		background: color-mix(in oklab, #15803d 4%, var(--color-base-100));
		border-left: 3px solid #15803d;
		display: grid;
		grid-template-columns: auto minmax(2rem, 1fr) auto;
		align-items: center;
		gap: 0.625rem;
		font-size: 0.75rem;
		color: color-mix(in oklab, var(--color-base-content) 65%, transparent);
	}
	.monitoring-progress :global(progress) {
		background-color: var(--color-base-300);
	}
	.monitoring-list-heading {
		padding: 1rem;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1rem;
		align-items: center;
	}
	.monitoring-list-controls {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		align-items: end;
		gap: 0.75rem;
	}
	.monitoring-list-controls > :only-child {
		grid-column: 1 / -1;
	}
	.monitoring-register {
		min-width: 0;
		background: var(--color-base-100);
		border-block: 1px solid var(--color-base-300);
	}
	.monitoring-list-title {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		min-width: 0;
	}
	.monitoring-list-icon {
		display: grid;
		place-items: center;
		width: 2.5rem;
		height: 2.5rem;
		flex-shrink: 0;
		border-radius: 0.375rem;
		color: #0e7490;
		background: color-mix(in oklab, #0e7490 10%, var(--color-base-100));
	}
	.monitoring-list-controls :global(.select) {
		min-height: 2.75rem;
		font-size: 0.875rem;
	}
	.monitoring-class-label {
		display: inline-block;
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		background: var(--color-base-200);
		font-size: 0.75rem;
		font-weight: 600;
	}
	.monitoring-register .monitoring-pagination {
		padding: 1rem;
		margin-top: 0;
	}
	.monitoring :global(select) {
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.monitoring-table-wrap {
		display: none;
	}
	.monitoring-mobile-list {
		overflow: hidden;
		background: var(--color-base-100);
	}
	.monitoring-student {
		padding: 1rem;
		border-left: 3px solid color-mix(in oklab, #2563eb 45%, var(--color-base-300));
		border-bottom: 1px solid var(--color-base-300);
	}
	.monitoring-student:last-child {
		border-bottom: 0;
	}
	.monitoring-student-cells {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.875rem 0.75rem;
	}
	.monitoring-student-details summary {
		cursor: pointer;
		padding-block: 0.5rem;
	}
	.monitoring-cell {
		display: flex;
		position: relative;
		align-items: start;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
		padding-right: 1.5rem;
	}
	.monitoring-cell :global(.badge) {
		max-width: 100%;
	}
	.monitoring-cell :global(.badge-success) {
		color: color-mix(in oklab, var(--color-success) 55%, var(--color-base-content));
	}
	.monitoring-cell :global(.badge-info) {
		color: color-mix(in oklab, var(--color-info) 55%, var(--color-base-content));
	}
	.monitoring-cell :global(.badge-warning) {
		color: color-mix(in oklab, var(--color-warning) 55%, var(--color-base-content));
	}
	.monitoring-cell :global(.badge-error) {
		color: color-mix(in oklab, var(--color-error) 55%, var(--color-base-content));
	}
	.monitoring-cell-note {
		font-size: 0.75rem;
		color: color-mix(in oklab, var(--color-base-content) 60%, transparent);
		overflow-wrap: anywhere;
	}
	.monitoring-entry {
		position: absolute;
		top: 0;
		right: 0;
	}
	.monitoring-pagination {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}
	@media (min-width: 640px) {
		.monitoring-connection-counts {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
		.monitoring-tabs {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
		.monitoring-extra-filters {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.monitoring-list-heading {
			grid-template-columns: minmax(0, 1fr);
		}
		.monitoring-list-controls {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
		.monitoring-metrics {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
	@media (min-width: 1024px) {
		.monitoring-filters {
			grid-template-columns: minmax(9rem, 1fr) minmax(10rem, 1fr) minmax(12rem, 1.35fr) auto;
		}
		.monitoring-search,
		.monitoring-filter-button {
			grid-column: auto;
		}
		.monitoring-extra-filters {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
		.monitoring-mobile-list {
			display: none;
		}
		.monitoring-table-wrap {
			display: block;
			max-width: 100%;
			overflow: auto;
		}
		.monitoring-table-wrap :global(table) {
			font-size: 0.875rem;
		}
		.monitoring-table-wrap :global(th),
		.monitoring-table-wrap :global(td) {
			vertical-align: top;
			padding: 0.875rem 0.75rem;
		}
		.monitoring-table-wrap :global(thead th) {
			background: var(--color-base-200);
			color: color-mix(in oklab, var(--color-base-content) 70%, transparent);
		}
		.monitoring-table-wrap :global(thead th.monitoring-focused) {
			box-shadow: inset 0 3px #0e7490;
			color: var(--color-base-content);
		}
		.monitoring-table-wrap :global(tbody td.monitoring-focused) {
			background: color-mix(in oklab, #0e7490 3%, var(--color-base-100));
		}
		.monitoring-table-wrap :global(tbody td) {
			background: var(--color-base-100);
		}
		.monitoring-table-wrap :global(tbody tr:hover td) {
			background: var(--color-base-200);
		}
		.monitoring-table-wrap :global(.monitoring-no) {
			width: 3rem;
			min-width: 3rem;
		}
		.monitoring-table-wrap :global(.monitoring-name) {
			position: sticky;
			left: 0;
			z-index: 1;
			min-width: 11rem;
			max-width: 16rem;
		}
		.monitoring-table-wrap :global(.monitoring-class) {
			min-width: 5rem;
			max-width: 8rem;
		}
		.monitoring-table-wrap :global(.monitoring-activity) {
			min-width: 8rem;
		}
	}
	@media (min-width: 1280px) {
		.monitoring-list-heading {
			grid-template-columns: minmax(12rem, 1fr) minmax(0, 2fr);
		}
	}
	:global([data-theme='dark']) .monitoring-connection-school,
	:global([data-theme='dark']) .monitoring-list-icon {
		--metric-color: #67e8f9;
		color: #67e8f9;
	}
	:global([data-theme='dark']) .monitoring-connection-dorm {
		--metric-color: #fbbf24;
	}
	:global([data-theme='dark']) .monitoring-connection-review {
		--metric-color: #fb7185;
	}
	:global([data-theme='dark']) .monitoring-metric-total,
	:global([data-theme='dark']) .monitoring-tabs a[data-tab='sekolah'] {
		--metric-color: #60a5fa;
		--tab-color: #60a5fa;
	}
	:global([data-theme='dark']) .monitoring-metric-present,
	:global([data-theme='dark']) .monitoring-tabs a[data-tab='sholat'] {
		--metric-color: #34d399;
		--tab-color: #34d399;
	}
	:global([data-theme='dark']) .monitoring-metric-absent,
	:global([data-theme='dark']) .monitoring-tabs a[data-tab='asrama'] {
		--metric-color: #fb7185;
		--tab-color: #fb7185;
	}
	:global([data-theme='dark']) .monitoring-metric-pending,
	:global([data-theme='dark']) .monitoring-tabs a[data-tab='makan'] {
		--metric-color: #fbbf24;
		--tab-color: #fbbf24;
	}
	@media (max-width: 639px) {
		.monitoring-header {
			padding: 1rem;
		}
		.monitoring-metric {
			padding: 0.75rem;
		}
		.monitoring-metric dt {
			font-size: 0.75rem;
		}
		.monitoring-date {
			align-items: flex-start;
		}
		.monitoring-filters {
			padding: 0.875rem;
		}
		.monitoring-refresh {
			width: 100%;
		}
		.monitoring :global(.input),
		.monitoring :global(.select) {
			font-size: 1rem;
			min-height: 2.75rem;
		}
		.monitoring :global(.btn) {
			min-height: 2.75rem;
		}
		.monitoring :global(.btn-square) {
			min-width: 2.75rem;
		}
		.monitoring-student-details summary {
			min-height: 2.75rem;
		}
		.monitoring-cell {
			padding-right: 0;
		}
		.monitoring-entry {
			position: static;
			margin-top: 0.125rem;
		}
		.monitoring-progress {
			grid-template-columns: minmax(0, 1fr) auto;
		}
		.monitoring-progress :global(progress) {
			grid-column: 1 / -1;
			grid-row: 2;
		}
	}
</style>
