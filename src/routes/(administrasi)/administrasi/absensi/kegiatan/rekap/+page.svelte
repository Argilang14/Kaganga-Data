<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { canAttendance } from '$lib/attendance-access';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import AttendanceMonitoringPanel from '$lib/components/absensi/AttendanceMonitoringPanel.svelte';
	import Icon from '$lib/components/icon.svelte';
	import AttendanceSummaryDialog from '$lib/components/absensi/AttendanceSummaryDialog.svelte';

	type StatusKey = 'hadir' | 'terlambat' | 'sakit' | 'izin' | 'alfa' | 'pulang';
	type Kegiatan = { id: number; nama: string; kategori: string };
	type Row = {
		no: number;
		id: number;
		nama: string;
		nis: string;
		nisn: string;
		kelasNama: string;
		counts: Record<StatusKey, number>;
	};
	type DetailRow = {
		tanggal: string;
		kegiatanId: number;
		kegiatanNama: string;
		counts: Record<StatusKey, number>;
	};
	type MonitoringAlert = {
		key: string;
		type: 'sakit_beruntun' | 'sakit_berulang' | 'alfa_berulang' | 'izin_pulang_terlambat';
		title: string;
		description: string;
		severity: 'warning' | 'error';
		muridId: number;
		nama: string;
		nis: string;
		kelasId: number;
		kelasNama: string;
		periodeMulai: string;
		periodeSelesai: string;
		duration: number;
		followUp: null | {
			id: number;
			status: 'baru' | 'diproses' | 'selesai';
			catatan: string | null;
			ditanganiPada: string | null;
		};
	};
	type MonitoringPermit = {
		id: number;
		muridId: number | null;
		nama: string;
		kelasNama: string;
		tanggalKeluar: string;
		rencanaKembali: string;
		tanggalKembali: string | null;
		alasan: string;
		penjemputNama: string | null;
		status: 'sedang_izin' | 'sudah_kembali' | 'terlambat_kembali' | 'dibatalkan';
		duration: number;
	};
	type PageData = {
		tanggalAwal: string;
		tanggalAkhir: string;
		activeSemesterId: number | null;
		kelasId: number | null;
		allKelas: boolean;
		kelasList: Array<{ id: number; nama: string; fase: string | null }>;
		kegiatanId: number | null;
		kegiatanList: Kegiatan[];
		summary: Record<StatusKey, number>;
		rows: Row[];
		detailRows: DetailRow[];
		monitoring: {
			alerts: MonitoringAlert[];
			izinPulang: MonitoringPermit[];
		};
		monitoringToday: string;
		autoAlfaInserted: number;
		canSyncRapor: boolean;
		statusLabels: Record<StatusKey, string>;
	};

	let { data }: { data: PageData } = $props();
	let importSubmitting = $state(false);
	let importDialog: HTMLDialogElement;
	const statusOrder: StatusKey[] = ['hadir', 'terlambat', 'sakit', 'izin', 'alfa', 'pulang'];
	const total = $derived(statusOrder.reduce((sum, status) => sum + data.summary[status], 0));
	const kelasLabel = $derived(
		data.allKelas
			? 'Semua Kelas'
			: (data.kelasList.find((kelas) => kelas.id === data.kelasId)?.nama ?? 'Belum ada kelas')
	);
	const statusIcons: Record<StatusKey, IconName> = {
		hadir: 'check',
		terlambat: 'warning',
		sakit: 'info',
		izin: 'pen',
		alfa: 'alert',
		pulang: 'left'
	};
	function dateLabel(value: string) {
		return new Date(`${value}T00:00:00`).toLocaleDateString('id-ID', {
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		});
	}
	const exportHref = $derived(`/api/administrasi/absensi/kegiatan/rekap/export${page.url.search}`);
	const templateHref = $derived(
		`/api/administrasi/absensi/kegiatan/download-template${page.url.search}`
	);
	const canImport = $derived(
		canAttendance(page.data.user, 'impor') &&
			Boolean(data.activeSemesterId && data.kelasId && data.rows.length)
	);

	function updateFilter(
		key: 'tanggal_awal' | 'tanggal_akhir' | 'kelas_id' | 'kegiatan_id',
		value: string
	) {
		const params = new URLSearchParams(page.url.search);
		if (value) params.set(key, value);
		else params.delete(key);
		void goto(`${page.url.pathname}?${params.toString()}`, {
			replaceState: true,
			keepFocus: true
		});
	}

	async function handleImportSuccess({ form }: { form: HTMLFormElement }) {
		form.reset();
		importDialog?.close();
		await invalidateAll();
	}

	function openImportDialog() {
		if (!canImport) return;
		importDialog.showModal();
	}
</script>

<div class="recap-workspace bg-base-100 border-base-200 min-w-0 rounded-lg border shadow-sm">
	<header
		class="recap-header flex flex-col gap-4 rounded-t-lg p-4 sm:p-5 xl:flex-row xl:items-center xl:justify-between"
	>
		<div class="flex min-w-0 items-center gap-3">
			<span
				class="bg-info/10 text-info flex size-11 shrink-0 items-center justify-center rounded-lg"
				><Icon name="bar-chart" class="size-6" /></span
			>
			<div class="min-w-0">
				<h1 class="text-xl font-bold">Rekap Absensi</h1>
				<p class="text-base-content/65 mt-1 text-sm">
					{kelasLabel} <span aria-hidden="true">&middot;</span>
					{dateLabel(data.tanggalAwal)} &ndash; {dateLabel(data.tanggalAkhir)}
				</p>
			</div>
		</div>
		<div class="recap-actions flex flex-wrap items-center gap-2">
			<AttendanceSummaryDialog
				tanggal={data.tanggalAkhir}
				kegiatanId={data.kegiatanId}
				kelasId={data.kelasId}
			/>
			<div class="join">
				<a class="btn btn-info btn-soft join-item shadow-none" href={exportHref}>
					<Icon name="export" />
					Ekspor Rekap
				</a>
				<div class="dropdown dropdown-end">
					<button
						type="button"
						tabindex="0"
						class="btn btn-info btn-soft join-item btn-square border-l-base-300 border-l shadow-none"
						title="Menu rekap absensi kegiatan"
						aria-label="Buka menu rekap absensi kegiatan"
					>
						<Icon name="down" />
					</button>
					<ul
						tabindex="-1"
						class="dropdown-content menu bg-base-100 border-base-300 z-50 mt-2 w-64 rounded-md border p-2 shadow-lg"
					>
						<li>
							<a
								href={templateHref}
								aria-disabled={!canImport}
								class:pointer-events-none={!canImport}
								class:opacity-50={!canImport}
							>
								<Icon name="download" />
								Template Import
							</a>
						</li>
						<li>
							<button type="button" onclick={openImportDialog} disabled={!canImport}>
								<Icon name="import" />
								Import Excel
							</button>
						</li>
						<li><hr class="border-base-200 my-1" /></li>
						<li>
							<a href={resolve('/administrasi/absensi/kegiatan')}>
								<Icon name="activity" />
								Catat Absensi
							</a>
						</li>
						{#if canAttendance(page.data.user, 'pengaturan')}
							<li>
								<a href={resolve('/administrasi/absensi/kegiatan/pengaturan')}>
									<Icon name="gear" />
									Pengaturan Kegiatan
								</a>
							</li>
						{/if}
					</ul>
				</div>
			</div>
		</div>
	</header>

	<section class="border-base-200 border-t p-4 sm:p-5" aria-label="Filter rekap absensi">
		<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
			<label class="recap-field">
				<span class="flex items-center gap-2 text-sm font-medium"
					><Icon name="calendar" />Tanggal Awal</span
				>
				<input
					class="input w-full"
					type="date"
					aria-label="Tanggal awal rekap"
					value={data.tanggalAwal}
					onchange={(event) =>
						updateFilter('tanggal_awal', (event.currentTarget as HTMLInputElement).value)}
				/>
			</label>
			<label class="recap-field">
				<span class="flex items-center gap-2 text-sm font-medium"
					><Icon name="calendar" />Tanggal Akhir</span
				>
				<input
					class="input w-full"
					type="date"
					aria-label="Tanggal akhir rekap"
					value={data.tanggalAkhir}
					onchange={(event) =>
						updateFilter('tanggal_akhir', (event.currentTarget as HTMLInputElement).value)}
				/>
			</label>
			<label class="recap-field">
				<span class="flex items-center gap-2 text-sm font-medium"><Icon name="users" />Kelas</span>
				<select
					class="select w-full"
					value={data.allKelas ? 'all' : (data.kelasId ?? '')}
					aria-label="Kelas rekap"
					title={data.allKelas ? 'Semua kelas yang diizinkan untuk akun ini' : undefined}
					onchange={(event) =>
						updateFilter('kelas_id', (event.currentTarget as HTMLSelectElement).value)}
				>
					<option value="all">Semua Kelas</option>
					{#each data.kelasList as kelas (kelas.id)}
						<option value={kelas.id}>{kelas.nama}{kelas.fase ? ` - ${kelas.fase}` : ''}</option>
					{/each}
				</select>
			</label>
			<label class="recap-field">
				<span class="flex items-center gap-2 text-sm font-medium"
					><Icon name="activity" />Kegiatan</span
				>
				<select
					class="select w-full"
					aria-label="Kegiatan rekap"
					value={data.kegiatanId ?? ''}
					onchange={(event) =>
						updateFilter('kegiatan_id', (event.currentTarget as HTMLSelectElement).value)}
				>
					<option value="">Semua kegiatan</option>
					{#each data.kegiatanList as kegiatan (kegiatan.id)}
						<option value={kegiatan.id}>{kegiatan.nama}</option>
					{/each}
				</select>
			</label>
		</div>
		{#if data.canSyncRapor}
			<form
				method="POST"
				action="?/syncRapor"
				class="recap-sync border-base-200 mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"
			>
				<input type="hidden" name="semesterId" value={data.activeSemesterId ?? ''} />
				<input type="hidden" name="kelasId" value={data.kelasId ?? ''} />
				<input type="hidden" name="tanggalAwal" value={data.tanggalAwal} />
				<input type="hidden" name="tanggalAkhir" value={data.tanggalAkhir} />
				<button
					class="btn btn-success btn-soft shadow-none"
					type="submit"
					disabled={!data.activeSemesterId || !data.kelasId}
				>
					<Icon name="repeat" />
					Sinkronkan ke Kehadiran Rapor
				</button>
				<span class="text-base-content/65 text-xs">Kehadiran rapor: sakit, izin, alfa</span>
			</form>
		{/if}
	</section>

	{#if data.autoAlfaInserted}
		<div class="alert alert-warning mx-4 my-4 w-auto sm:mx-5">
			<Icon name="warning" />
			<span>
				Sistem mengisi {data.autoAlfaInserted} data alfa otomatis pada rentang tanggal ini.
			</span>
		</div>
	{/if}

	<section
		class="recap-summary border-base-200 border-t p-4 sm:p-5"
		aria-labelledby="recap-summary-title"
	>
		<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
			<h2 id="recap-summary-title" class="font-semibold">Ringkasan Kehadiran</h2>
			<div class="flex flex-wrap items-center gap-2 text-sm">
				<span class="badge badge-info badge-soft h-auto min-h-7 whitespace-normal"
					><strong class="tabular-nums">{total}</strong> catatan absensi</span
				><span class="text-base-content/65">{data.rows.length} murid</span>
			</div>
		</div>
		<div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
			{#each statusOrder as status (status)}
				<div class="recap-stat stat min-w-0 rounded-lg border p-3" data-status={status}>
					<div class="stat-title flex items-center gap-2 text-xs font-medium sm:text-sm">
						<Icon name={statusIcons[status]} class="size-4 shrink-0" />{data.statusLabels[status]}
					</div>
					<div class="stat-value mt-2 text-2xl font-bold tabular-nums">{data.summary[status]}</div>
				</div>
			{/each}
		</div>
	</section>

	<section class="border-base-200 border-t p-4 sm:p-5" aria-labelledby="recap-students-title">
		<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
			<h2 id="recap-students-title" class="flex items-center gap-2 font-semibold">
				<Icon name="users" />Rekap Per Murid
			</h2>
			<span class="badge badge-ghost">{data.rows.length} murid</span>
		</div>
		{#if !data.activeSemesterId}
			<div class="alert alert-warning">
				<Icon name="alert" />
				<span>Semester aktif belum diatur. Atur melalui menu Data Rapor.</span>
			</div>
		{:else if !data.rows.length}
			<div class="alert alert-info">
				<Icon name="info" />
				<span>Belum ada siswa atau data absensi pada filter ini.</span>
			</div>
		{:else}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard access to the scrollable table.) -->
			<div
				class="recap-table-scroll rounded-lg border border-base-200"
				tabindex="0"
				role="region"
				aria-label="Rekap absensi per murid"
			>
				<table class="recap-table recap-students-table table">
					<thead class="bg-base-200/60 text-base-content">
						<tr>
							<th scope="col">No</th>
							<th scope="col">Nama Murid</th>
							{#each statusOrder as status (status)}
								<th scope="col" class="text-center">{data.statusLabels[status]}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each data.rows as row (row.id)}
							<tr>
								<td class="recap-number text-base-content/50 tabular-nums">{row.no}</td>
								<td class="recap-identity">
									<div class="font-semibold">{row.nama}</div>
									{#if data.allKelas}<div class="text-info mt-1 text-xs font-medium">
											{row.kelasNama}
										</div>{/if}
									<div class="text-base-content/60 mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
										<span>NIS {row.nis || '-'}</span><span>NISN {row.nisn || '-'}</span>
									</div>
								</td>
								{#each statusOrder as status (status)}
									<td
										class="recap-count text-center"
										data-status={status}
										data-positive={row.counts[status] > 0}
										><span class="recap-mobile-label">{data.statusLabels[status]}</span><span
											class="recap-count-number font-semibold tabular-nums"
											>{row.counts[status]}</span
										></td
									>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<section class="border-base-200 border-t p-4 sm:p-5" aria-labelledby="recap-daily-title">
		<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
			<h2 id="recap-daily-title" class="flex items-center gap-2 font-semibold">
				<Icon name="calendar" />Detail Per Tanggal
			</h2>
			<span class="badge badge-ghost">{data.detailRows.length} baris</span>
		</div>
		{#if !data.detailRows.length}
			<div class="alert alert-info">
				<Icon name="info" />
				<span>Belum ada detail absensi kegiatan pada filter ini.</span>
			</div>
		{:else}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard access to the scrollable table.) -->
			<div
				class="recap-table-scroll rounded-lg border border-base-200"
				tabindex="0"
				role="region"
				aria-label="Detail absensi per tanggal"
			>
				<table class="recap-table recap-daily-table table">
					<thead class="bg-base-200/60 text-base-content">
						<tr>
							<th scope="col">Tanggal</th>
							<th scope="col">Kegiatan</th>
							{#each statusOrder as status (status)}
								<th scope="col" class="text-center">{data.statusLabels[status]}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each data.detailRows as row (`${row.tanggal}-${row.kegiatanId}`)}
							<tr>
								<td class="recap-date font-medium whitespace-nowrap">{dateLabel(row.tanggal)}</td>
								<td class="recap-activity font-semibold">{row.kegiatanNama}</td>
								{#each statusOrder as status (status)}
									<td
										class="recap-count text-center"
										data-status={status}
										data-positive={row.counts[status] > 0}
										><span class="recap-mobile-label">{data.statusLabels[status]}</span><span
											class="recap-count-number font-semibold tabular-nums"
											>{row.counts[status]}</span
										></td
									>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
	<div class="recap-monitoring border-base-200 border-t">
		<AttendanceMonitoringPanel
			alerts={data.monitoring.alerts}
			permits={data.monitoring.izinPulang}
			students={data.rows.map((row) => ({ id: row.id, nama: row.nama, nis: row.nis }))}
			kelasId={data.kelasId}
			today={data.monitoringToday}
		/>
	</div>
</div>

<dialog class="modal" bind:this={importDialog}>
	<div class="recap-import modal-box max-w-lg rounded-lg">
		<div class="mb-5">
			<h3 class="text-xl font-bold">Import Absensi Kegiatan</h3>
		</div>
		<FormEnhance
			id="import-absensi-kegiatan-form"
			action="?/importExcel"
			enctype="multipart/form-data"
			submitStateChange={(value) => (importSubmitting = value)}
			onsuccess={handleImportSuccess}
			showToast
		>
			<input type="hidden" name="semesterId" value={data.activeSemesterId ?? ''} />
			<input type="hidden" name="kelasId" value={data.kelasId ?? ''} />
			<label class="recap-field w-full">
				<span class="text-sm font-medium">File Excel</span>
				<input
					class="file-input file-input-bordered w-full"
					type="file"
					name="file"
					accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
					required
					disabled={importSubmitting || !canImport}
				/>
				<span class="text-base-content/60 text-xs">.xlsx</span>
			</label>
			<div class="modal-action mt-6">
				<button
					class="btn btn-ghost"
					type="button"
					disabled={importSubmitting}
					onclick={() => importDialog.close()}
				>
					Batal
				</button>
				<button class="btn btn-success" type="submit" disabled={importSubmitting || !canImport}>
					{#if importSubmitting}
						<span class="loading loading-spinner loading-sm" aria-hidden="true"></span>
					{:else}
						<Icon name="import" />
					{/if}
					{importSubmitting ? 'Mengimpor...' : 'Import Data'}
				</button>
			</div>
		</FormEnhance>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button aria-label="Tutup dialog import">close</button>
	</form>
</dialog>

<style>
	.recap-header {
		position: relative;
		z-index: 10;
		background: color-mix(in oklab, var(--color-info) 5%, var(--color-base-100));
	}
	.recap-field {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 0.5rem;
	}
	.recap-field .input,
	.recap-field .select {
		height: 2.75rem;
		min-height: 2.75rem;
		border-radius: 0.375rem;
		font-size: 0.875rem;
	}
	.recap-actions :global(.btn) {
		height: auto;
		min-height: 2.75rem;
		padding-block: 0.5rem;
		white-space: normal;
	}
	.recap-actions :global(.btn.btn-soft:not(.btn-info)) {
		background: var(--color-base-200);
		color: var(--color-base-content);
		border-color: var(--color-base-300);
	}
	.recap-workspace .recap-actions .join {
		min-width: 0;
		overflow: visible;
	}
	.recap-actions .join > .btn {
		border-top-right-radius: 0;
		border-bottom-right-radius: 0;
	}
	.recap-actions .dropdown > .btn {
		border-top-left-radius: 0;
		border-bottom-left-radius: 0;
	}
	.recap-actions .dropdown-content {
		max-width: calc(100vw - 2rem);
	}
	.recap-actions :global(.btn-info.btn-soft) {
		background: color-mix(in oklab, var(--color-info) 12%, var(--color-base-100));
		color: color-mix(in oklab, var(--color-info) 55%, var(--color-base-content));
		border-color: color-mix(in oklab, var(--color-info) 25%, var(--color-base-200));
	}
	.recap-stat,
	.recap-count {
		--status-color: var(--color-success);
	}
	[data-status='terlambat'] {
		--status-color: var(--color-warning);
	}
	[data-status='sakit'] {
		--status-color: var(--color-info);
	}
	[data-status='izin'] {
		--status-color: var(--color-primary);
	}
	[data-status='alfa'] {
		--status-color: var(--color-error);
	}
	[data-status='pulang'] {
		--status-color: var(--color-secondary);
	}
	.recap-stat {
		background: color-mix(in oklab, var(--status-color) 6%, var(--color-base-100));
		border-color: color-mix(in oklab, var(--status-color) 20%, var(--color-base-200));
	}
	.recap-stat .stat-title {
		color: var(--color-base-content);
		white-space: normal;
	}
	.recap-stat :global(svg),
	.recap-stat .stat-value {
		color: color-mix(in oklab, var(--status-color) 65%, var(--color-base-content));
	}
	.recap-table-scroll {
		overflow-x: auto;
	}
	.recap-table {
		width: 100%;
		min-width: 850px;
	}
	.recap-table th {
		padding-block: 0.875rem;
		font-size: 0.8125rem;
		font-weight: 600;
	}
	.recap-table td {
		padding-block: 0.875rem;
		vertical-align: middle;
	}
	.recap-table tbody tr:hover {
		background: color-mix(in oklab, var(--color-info) 3%, var(--color-base-100));
	}
	.recap-identity {
		min-width: 240px;
		max-width: 360px;
		overflow-wrap: anywhere;
	}
	.recap-activity {
		min-width: 180px;
		overflow-wrap: anywhere;
	}
	.recap-count-number {
		display: inline-flex;
		min-width: 2rem;
		min-height: 2rem;
		align-items: center;
		justify-content: center;
		border-radius: 0.375rem;
		color: color-mix(in oklab, var(--color-base-content) 55%, var(--color-base-100));
	}
	.recap-count[data-positive='true'] .recap-count-number {
		color: color-mix(in oklab, var(--status-color) 65%, var(--color-base-content));
		background: color-mix(in oklab, var(--status-color) 10%, var(--color-base-100));
	}
	.recap-mobile-label {
		display: none;
	}
	.recap-monitoring :global(section.card) {
		border: 0;
		border-radius: 0;
		background: transparent;
		box-shadow: none;
		padding: 1.25rem;
	}
	.recap-monitoring :global(section.card > .mt-4 > div) {
		min-width: 0;
		border: 0;
		border-radius: 0;
		padding: 0;
	}
	.recap-monitoring :global(.form-control) {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}
	.recap-monitoring :global(.badge) {
		height: auto;
		min-height: 1.5rem;
		white-space: normal;
	}
	.recap-monitoring :global(.btn) {
		height: auto;
		min-height: 2.5rem;
		white-space: normal;
	}
	@media (max-width: 767px) {
		.recap-actions {
			align-items: stretch;
		}
		.recap-actions > :global(.btn),
		.recap-actions > .join {
			flex: 1 1 auto;
		}
		.recap-actions .join > .btn {
			flex: 1;
		}
		.recap-table-scroll {
			border: 0;
		}
		.recap-table {
			display: block;
			min-width: 0;
		}
		.recap-table thead {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
		}
		.recap-table tbody {
			display: grid;
			gap: 0.875rem;
		}
		.recap-table tbody tr {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 0.625rem;
			padding: 0.875rem;
			border: 1px solid var(--color-base-200);
			border-radius: 0.5rem;
		}
		.recap-workspace .recap-table td {
			display: block;
			min-width: 0;
			max-width: none;
			padding: 0;
			border-bottom: 0;
		}
		.recap-workspace .recap-table .recap-number {
			display: none;
		}
		.recap-identity,
		.recap-date,
		.recap-activity {
			grid-column: 1 / -1;
		}
		.recap-workspace .recap-table .recap-identity {
			padding-bottom: 0.375rem;
		}
		.recap-workspace .recap-table .recap-count {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 0.25rem;
			padding: 0.5rem;
			background: color-mix(in oklab, var(--color-base-200) 35%, var(--color-base-100));
			border-radius: 0.375rem;
		}
		.recap-workspace .recap-table .recap-count[data-positive='true'] {
			background: color-mix(in oklab, var(--status-color) 6%, var(--color-base-100));
		}
		.recap-mobile-label {
			display: block;
			font-size: 0.75rem;
			color: var(--color-base-content);
			overflow-wrap: anywhere;
		}
		.recap-count-number {
			font-size: 1rem;
			min-height: 1.5rem;
		}
		.recap-count[data-positive='true'] .recap-count-number {
			background: transparent;
		}
		.recap-monitoring :global(section.card) {
			padding: 1rem;
		}
	}
	@media (min-width: 480px) and (max-width: 767px) {
		.recap-table tbody tr {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
</style>
