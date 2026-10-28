<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { canAttendance } from '$lib/attendance-access';
	import { attendanceReportSearch } from '$lib/attendance-report-navigation';
	import {
		attendanceKegiatanSearch,
		attendanceKegiatanAction
	} from '$lib/attendance-kegiatan-filters';
	import Icon from '$lib/components/icon.svelte';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import ClearAttendance from '$lib/components/absensi/ClearAttendance.svelte';
	import AttendanceSummaryDialog from '$lib/components/absensi/AttendanceSummaryDialog.svelte';

	type StatusKey = 'hadir' | 'terlambat' | 'sakit' | 'izin' | 'alfa' | 'pulang';
	type Kegiatan = {
		id: number;
		nama: string;
		kode: string;
		kategori: 'sekolah' | 'asrama' | 'makan' | 'sholat';
		jamMulai: string | null;
		batasTerlambat: string | null;
		jamSelesai: string | null;
		autoAlfa: boolean;
		masukRapor: boolean;
		aksesEdit: 'sekolah' | 'asrama' | 'semua';
	};
	type Row = {
		no: number;
		id: number;
		nama: string;
		nis: string;
		nisn: string;
		status: StatusKey | null;
		metode: 'qr' | 'manual' | 'auto' | null;
		waktuScan: string | null;
		catatan: string;
		illnessLabel: string;
		canClear: boolean;
	};
	type PageData = {
		tanggal: string;
		activeSemesterId: number | null;
		kelasId: number | null;
		kelasList: Array<{ id: number; nama: string; fase: string | null }>;
		kegiatanId: number | null;
		kegiatanList: Kegiatan[];
		selectedKegiatan: Kegiatan | null;
		canEditSelected: boolean;
		rows: Row[];
		summary: Record<StatusKey, number>;
		autoAlfaInserted: number;
		statusLabels: Record<StatusKey, string>;
	};

	let { data }: { data: PageData } = $props();

	const statusOrder: StatusKey[] = ['hadir', 'terlambat', 'sakit', 'izin', 'alfa', 'pulang'];
	const totalSudahAbsen = $derived(
		statusOrder.reduce((sum, status) => sum + data.summary[status], 0)
	);
	const belumAbsen = $derived(Math.max(0, data.rows.length - totalSudahAbsen));
	const progressAbsen = $derived(
		data.rows.length ? Math.round((totalSudahAbsen / data.rows.length) * 100) : 0
	);
	const statusIcons: Record<StatusKey, IconName> = {
		hadir: 'check',
		terlambat: 'warning',
		sakit: 'info',
		izin: 'pen',
		alfa: 'alert',
		pulang: 'left'
	};
	const kelasAktifLabel = $derived.by(() => {
		const kelas = data.kelasList.find((item) => item.id === data.kelasId);
		if (!kelas) return 'Belum ada kelas aktif';
		return kelas.fase ? `${kelas.nama} - ${kelas.fase}` : kelas.nama;
	});

	function updateFilter(key: 'tanggal' | 'kelas_id' | 'kegiatan_id', value: string) {
		const params = attendanceKegiatanSearch(data);
		if (value) params.set(key, value);
		else params.delete(key);
		void goto(`${page.url.pathname}?${params.toString()}`, {
			replaceState: true,
			keepFocus: true
		});
	}

	function statusBadge(status: StatusKey | null) {
		if (status === 'hadir') return 'badge-success';
		if (status === 'terlambat') return 'badge-warning';
		if (status === 'sakit') return 'badge-info';
		if (status === 'izin') return 'badge-primary';
		if (status === 'alfa') return 'badge-error';
		if (status === 'pulang') return 'badge-secondary';
		return 'badge-ghost';
	}

	function kategoriBadge(kategori: Kegiatan['kategori'] | undefined) {
		if (kategori === 'sekolah') return 'badge-primary';
		if (kategori === 'asrama') return 'badge-secondary';
		if (kategori === 'makan') return 'badge-accent';
		if (kategori === 'sholat') return 'badge-info';
		return 'badge-ghost';
	}
</script>

<div
	class="attendance-workspace bg-base-100 border-base-200 overflow-hidden rounded-lg border shadow-sm"
>
	<header
		class="attendance-header flex flex-col gap-4 p-4 sm:p-5 xl:flex-row xl:items-center xl:justify-between"
	>
		<div class="flex min-w-0 items-center gap-3">
			<span
				class="bg-success/10 text-success flex size-11 shrink-0 items-center justify-center rounded-lg"
			>
				<Icon name="check-square" class="size-6" />
			</span>
			<div class="min-w-0">
				<h2 class="text-xl font-bold">Catat Absensi</h2>
				<p class="text-base-content/65 mt-1 text-sm">{kelasAktifLabel}</p>
			</div>
		</div>
		<div class="attendance-actions flex flex-wrap gap-2">
			<AttendanceSummaryDialog
				tanggal={data.tanggal}
				kegiatanId={data.kegiatanId}
				kelasId={data.kelasId}
			/>
			<a
				class="btn btn-soft btn-sm shadow-none"
				href={resolve('/administrasi/absensi/monitoring') +
					attendanceReportSearch('monitoring', { date: data.tanggal, classId: data.kelasId })}
			>
				<Icon name="table" />
				Monitoring &amp; Rekap
			</a>
			{#if canAttendance(page.data.user, 'pengaturan')}
				<a
					class="btn btn-soft btn-sm shadow-none"
					href={resolve('/administrasi/absensi/kegiatan/pengaturan')}
				>
					<Icon name="gear" />
					Pengaturan
				</a>
			{/if}
		</div>
	</header>

	<section class="border-base-200 border-t p-4 sm:p-5" aria-label="Pilihan absensi">
		<div class="grid gap-4 md:grid-cols-[1fr_1fr_1.4fr]">
			<label class="attendance-field">
				<span class="flex items-center gap-2 text-sm font-medium"
					><Icon name="calendar" />Tanggal</span
				>
				<input
					class="input input-bordered w-full"
					type="date"
					aria-label="Tanggal absensi kegiatan"
					value={data.tanggal}
					onchange={(event) =>
						updateFilter('tanggal', (event.currentTarget as HTMLInputElement).value)}
				/>
			</label>
			<label class="attendance-field">
				<span class="flex items-center gap-2 text-sm font-medium"><Icon name="users" />Kelas</span>
				<select
					class="select select-bordered w-full"
					aria-label="Kelas absensi kegiatan"
					value={data.kelasId ?? ''}
					onchange={(event) =>
						updateFilter('kelas_id', (event.currentTarget as HTMLSelectElement).value)}
				>
					{#if !data.kelasList.length}<option value="">Belum ada kelas</option>{/if}
					{#each data.kelasList as kelas (kelas.id)}
						<option value={kelas.id}>{kelas.nama}{kelas.fase ? ` - ${kelas.fase}` : ''}</option>
					{/each}
				</select>
			</label>
			<label class="attendance-field">
				<span class="flex items-center gap-2 text-sm font-medium"
					><Icon name="activity" />Kegiatan</span
				>
				<select
					class="select select-bordered w-full"
					aria-label="Kegiatan absensi"
					value={data.kegiatanId ?? ''}
					onchange={(event) =>
						updateFilter('kegiatan_id', (event.currentTarget as HTMLSelectElement).value)}
				>
					{#if !data.kegiatanList.length}<option value="">Belum ada kegiatan</option>{/if}
					{#each data.kegiatanList as kegiatan (kegiatan.id)}
						<option value={kegiatan.id}>{kegiatan.nama}</option>
					{/each}
				</select>
			</label>
		</div>

		{#if data.selectedKegiatan}
			<div class="attendance-context mt-4 flex flex-wrap items-center gap-2 text-sm">
				<div class={`badge ${kategoriBadge(data.selectedKegiatan.kategori)} badge-soft capitalize`}>
					{data.selectedKegiatan.kategori}
				</div>
				{#if data.selectedKegiatan.jamMulai}
					<div class="badge badge-ghost">Mulai {data.selectedKegiatan.jamMulai}</div>
				{/if}
				{#if data.selectedKegiatan.batasTerlambat}
					<div class="badge badge-warning badge-outline">
						Terlambat setelah {data.selectedKegiatan.batasTerlambat}
					</div>
				{/if}
				{#if data.selectedKegiatan.masukRapor}
					<div class="badge badge-success badge-outline">Masuk rekap rapor</div>
				{/if}
				{#if data.selectedKegiatan.autoAlfa}
					<div class="badge badge-error badge-outline">
						Auto alfa{data.selectedKegiatan.jamSelesai
							? ` setelah ${data.selectedKegiatan.jamSelesai}`
							: ''}
					</div>
				{/if}
				{#if !data.canEditSelected}
					<div class="badge badge-error badge-outline">Mode lihat saja</div>
				{/if}
			</div>
		{/if}
	</section>

	<section class="attendance-bulk border-base-200 border-t p-4 sm:p-5" aria-labelledby="bulk-title">
		<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
			<div>
				<h3 id="bulk-title" class="flex items-center gap-2 font-semibold">
					<Icon name="edit" />Input Manual Massal
				</h3>
			</div>
			<span class="badge badge-ghost">{data.rows.length} murid</span>
		</div>
		<FormEnhance
			action={attendanceKegiatanAction('bulkUpdateManual', data)}
			class="attendance-bulk-form grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(13rem,0.9fr)]"
		>
			<input type="hidden" name="tanggal" value={data.tanggal} />
			<input type="hidden" name="kelasId" value={data.kelasId ?? ''} />
			<input type="hidden" name="semesterId" value={data.activeSemesterId ?? ''} />
			<input type="hidden" name="kegiatanId" value={data.kegiatanId ?? ''} />
			<label class="attendance-field">
				<span class="text-sm font-medium">Status Massal</span>
				<select
					class="select select-bordered w-full"
					name="status"
					required
					disabled={!data.canEditSelected || !data.rows.length}
				>
					<option value="" disabled selected>Pilih status</option>
					{#each statusOrder as status (status)}
						<option value={status}>{data.statusLabels[status]}</option>
					{/each}
				</select>
			</label>
			<label class="attendance-field">
				<span class="text-sm font-medium">Catatan</span>
				<input
					class="input input-bordered w-full"
					name="catatan"
					placeholder="Catatan opsional"
					disabled={!data.canEditSelected || !data.rows.length}
				/>
			</label>
			<div
				class="flex flex-col justify-end gap-3 md:col-span-2 md:flex-row md:items-center md:justify-between xl:col-span-1 xl:flex-col xl:items-stretch"
			>
				<label class="flex cursor-pointer items-center gap-2 text-sm">
					<input
						class="checkbox checkbox-success checkbox-sm shrink-0"
						type="checkbox"
						name="onlyEmpty"
						checked
						disabled={!data.canEditSelected || !data.rows.length}
					/>
					<span>Hanya yang belum absen</span>
				</label>
				<button
					class="btn btn-success shadow-none"
					type="submit"
					disabled={!data.canEditSelected || !data.rows.length}
				>
					<Icon name="save" />
					Simpan Massal
				</button>
			</div>
		</FormEnhance>
	</section>

	{#if data.autoAlfaInserted}
		<div class="alert alert-warning mx-4 my-4 w-auto sm:mx-5">
			<Icon name="warning" />
			<span>
				Sistem mengisi {data.autoAlfaInserted} data alfa otomatis karena kegiatan sudah melewati jam selesai.
			</span>
		</div>
	{/if}

	<section class="border-base-200 border-t p-4 sm:p-5" aria-label="Ringkasan status absensi">
		<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<h3 class="font-semibold">Ringkasan Absensi</h3>
				<p class="text-base-content/65 mt-1 text-sm">
					<strong class="text-base-content">{totalSudahAbsen}</strong> dari {data.rows.length} murid tercatat
					<span aria-hidden="true">&middot;</span>
					{belumAbsen} belum absen
				</p>
			</div>
			<div class="flex items-center gap-3 sm:w-48">
				<progress
					class="progress progress-success h-2 flex-1"
					value={progressAbsen}
					max="100"
					aria-label="Persentase absensi tercatat"
				></progress>
				<span class="text-sm font-semibold tabular-nums">{progressAbsen}%</span>
			</div>
		</div>
		<div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
			{#each statusOrder as status (status)}
				<div class="attendance-stat stat min-w-0 rounded-lg border p-3" data-status={status}>
					<div class="stat-title flex items-center gap-2 text-xs font-medium sm:text-sm">
						<Icon name={statusIcons[status]} class="size-4 shrink-0" />{data.statusLabels[status]}
					</div>
					<div class="stat-value mt-2 text-2xl font-bold tabular-nums">{data.summary[status]}</div>
				</div>
			{/each}
		</div>
	</section>

	<section
		class="attendance-list border-base-200 border-t p-4 sm:p-5"
		aria-labelledby="attendance-list-title"
	>
		<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
			<h3 id="attendance-list-title" class="flex items-center gap-2 font-semibold">
				<Icon name="users" />Daftar Murid
			</h3>
			<div class="badge badge-warning badge-soft h-auto min-h-6 whitespace-normal">
				{belumAbsen} belum absen
			</div>
		</div>

		{#if !data.activeSemesterId}
			<div class="alert alert-warning">
				<Icon name="alert" />
				<span>Semester aktif belum diatur. Atur melalui menu Data Rapor.</span>
			</div>
		{:else if !data.kelasId}
			<div class="alert alert-warning">
				<Icon name="alert" />
				<span>Belum ada kelas untuk semester aktif.</span>
			</div>
		{:else if !data.kegiatanId}
			<div class="alert alert-warning">
				<Icon name="alert" />
				<span>Belum ada kegiatan absensi aktif.</span>
			</div>
		{:else if !data.rows.length}
			<div class="alert alert-info">
				<Icon name="info" />
				<span>Belum ada siswa pada kelas ini.</span>
			</div>
		{:else}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard access to the scrollable table.) -->
			<div
				class="attendance-table-scroll rounded-lg border border-base-200"
				tabindex="0"
				role="region"
				aria-label="Tabel absensi murid"
			>
				<table class="table attendance-table">
					<thead class="bg-base-200/60 text-base-content">
						<tr>
							<th scope="col">No</th>
							<th scope="col">Nama Murid</th>
							<th scope="col">Status Tercatat</th>
							<th scope="col">Catatan</th>
							<th scope="col">Input Manual</th>
							<th scope="col" class="text-right">Aksi</th>
						</tr>
					</thead>
					<tbody>
						{#each data.rows as row (row.id)}
							<tr>
								<td class="attendance-number text-base-content/50 tabular-nums">{row.no}</td>
								<td class="attendance-student">
									<div class="font-semibold">{row.nama}</div>
									<div class="text-base-content/60 mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
										<span>NIS {row.nis || '-'}</span><span>NISN {row.nisn || '-'}</span>
									</div>
								</td>
								<td class="attendance-status">
									<div
										class={`badge badge-soft ${statusBadge(row.status)} h-auto min-h-7 w-fit gap-1 whitespace-normal px-2 py-1 text-xs font-semibold`}
									>
										{row.status ? data.statusLabels[row.status] : 'Belum absen'}
									</div>
									{#if row.metode}
										<div class="text-base-content/60 mt-1 text-xs">
											{row.metode === 'qr'
												? 'QR Code'
												: row.metode === 'auto'
													? 'Otomatis'
													: 'Manual'}
											{row.waktuScan
												? ` · ${new Date(row.waktuScan).toLocaleTimeString('id-ID')}`
												: ''}
										</div>
									{/if}
									{#if row.illnessLabel}<p class="text-base-content/65 mt-1 text-xs">{row.illnessLabel}</p>{/if}
								</td>
								<td class="attendance-note">
									<label class="attendance-mobile-label" for={`catatan-${row.id}`}>Catatan</label>
									<input
										id={`catatan-${row.id}`}
										aria-label={`Catatan absensi ${row.nama}`}
										class="input input-bordered w-full"
										name="catatan"
										form={`manual-kegiatan-${row.id}`}
										value={row.catatan}
										placeholder="Catatan opsional"
										disabled={!data.canEditSelected}
									/>
									{#if row.illnessLabel && data.selectedKegiatan && ['sekolah', 'asrama'].includes(data.selectedKegiatan.kategori)}
										<label class="mt-2 flex items-start gap-2 text-xs">
											<input type="checkbox" class="checkbox checkbox-sm" name="perpanjangSakit"
												form={`manual-kegiatan-${row.id}`} disabled={!data.canEditSelected || !canAttendance(page.data.user, 'koreksi')} />
											<span>Perpanjang sakit 3 hari dari tanggal terpilih (wajib catatan)</span>
										</label>
									{/if}
								</td>
								<td class="attendance-manual">
									<label class="attendance-mobile-label" for={`status-${row.id}`}
										>Input Manual</label
									>
									<FormEnhance
										id={`manual-kegiatan-${row.id}`}
										action={attendanceKegiatanAction('updateManual', data)}
									>
										<input type="hidden" name="tanggal" value={data.tanggal} />
										<input type="hidden" name="kelasId" value={data.kelasId ?? ''} />
										<input type="hidden" name="semesterId" value={data.activeSemesterId ?? ''} />
										<input type="hidden" name="kegiatanId" value={data.kegiatanId ?? ''} />
										<input type="hidden" name="muridId" value={row.id} />
										<select
											id={`status-${row.id}`}
											class="select select-bordered w-full"
											name="status"
											value={row.status ?? ''}
											aria-label={`Status absensi kegiatan ${row.nama}`}
											required
											disabled={!data.canEditSelected}
										>
											<option value="" disabled>Pilih status</option>
											{#each statusOrder as status (status)}
												<option value={status}>{data.statusLabels[status]}</option>
											{/each}
										</select>
									</FormEnhance>
								</td>
								<td class="attendance-row-actions">
									<div class="flex justify-end gap-2">
										<button
											class="btn btn-success btn-soft btn-square shadow-none"
											type="submit"
											form={`manual-kegiatan-${row.id}`}
											title="Simpan absensi kegiatan"
											aria-label={`Simpan absensi kegiatan ${row.nama}`}
											disabled={!data.canEditSelected}
										>
											<Icon name="save" />
										</button>
										<ClearAttendance
											action={attendanceKegiatanAction('clearStatus', data)}
											nama={row.nama}
											disabled={!row.canClear || !data.canEditSelected}
											fields={{
												tanggal: data.tanggal,
												kelasId: data.kelasId ?? '',
												semesterId: data.activeSemesterId ?? '',
												kegiatanId: data.kegiatanId ?? '',
												muridId: row.id
											}}
										/>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</div>

<style>
	.attendance-workspace {
		min-width: 0;
	}
	.attendance-header {
		background: color-mix(in oklab, var(--color-success) 5%, var(--color-base-100));
	}
	.attendance-field {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 0.5rem;
	}
	.attendance-workspace :global(.input),
	.attendance-workspace :global(.select) {
		height: 2.75rem;
		min-height: 2.75rem;
		border-radius: 0.375rem;
		font-size: 0.875rem;
	}
	.attendance-actions :global(.btn) {
		min-height: 2.5rem;
		height: auto;
		padding-block: 0.5rem;
		white-space: normal;
	}
	.attendance-actions :global(.btn.btn-soft) {
		background: var(--color-base-200);
		color: var(--color-base-content);
		border-color: var(--color-base-300);
	}
	.attendance-context :global(.badge) {
		height: auto;
		min-height: 1.5rem;
		white-space: normal;
		padding-block: 0.25rem;
	}
	.attendance-bulk {
		background: color-mix(in oklab, var(--color-info) 3%, var(--color-base-100));
	}
	.attendance-stat {
		--stat-color: var(--color-success);
		background: color-mix(in oklab, var(--stat-color) 6%, var(--color-base-100));
		border-color: color-mix(in oklab, var(--stat-color) 20%, var(--color-base-200));
	}
	.attendance-stat[data-status='terlambat'] {
		--stat-color: var(--color-warning);
	}
	.attendance-stat[data-status='sakit'] {
		--stat-color: var(--color-info);
	}
	.attendance-stat[data-status='izin'] {
		--stat-color: var(--color-primary);
	}
	.attendance-stat[data-status='alfa'] {
		--stat-color: var(--color-error);
	}
	.attendance-stat[data-status='pulang'] {
		--stat-color: var(--color-secondary);
	}
	.attendance-stat :global(svg) {
		color: color-mix(in oklab, var(--stat-color) 65%, var(--color-base-content));
	}
	.attendance-stat .stat-title {
		color: var(--color-base-content);
		white-space: normal;
	}
	.attendance-stat .stat-value {
		color: color-mix(in oklab, var(--stat-color) 65%, var(--color-base-content));
	}
	.attendance-table-scroll {
		overflow-x: auto;
	}
	.attendance-table {
		width: 100%;
		min-width: 980px;
	}
	.attendance-table th {
		font-size: 0.8125rem;
		font-weight: 600;
	}
	.attendance-table td {
		padding-block: 1rem;
		vertical-align: middle;
	}
	.attendance-table tbody tr:hover {
		background: color-mix(in oklab, var(--color-success) 3%, var(--color-base-100));
	}
	.attendance-student {
		min-width: 220px;
		max-width: 320px;
		overflow-wrap: anywhere;
	}
	.attendance-status {
		min-width: 155px;
	}
	.attendance-note {
		min-width: 200px;
	}
	.attendance-manual {
		min-width: 165px;
	}
	.attendance-mobile-label {
		display: none;
	}
	.attendance-row-actions :global(.btn) {
		width: 2.75rem;
		height: 2.75rem;
		min-height: 2.75rem;
	}
	.attendance-row-actions :global(.btn-success.btn-soft:not(:disabled)) {
		background: color-mix(in oklab, var(--color-success) 10%, var(--color-base-100));
		color: color-mix(in oklab, var(--color-success) 65%, var(--color-base-content));
	}
	@media (max-width: 767px) {
		.attendance-actions > :global(.btn) {
			flex: 1 1 auto;
		}
		.attendance-table-scroll {
			overflow: visible;
			border: 0;
		}
		.attendance-table {
			display: block;
			min-width: 0;
		}
		.attendance-table thead {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
		}
		.attendance-table tbody {
			display: grid;
			gap: 1rem;
		}
		.attendance-table tbody tr {
			display: grid;
			grid-template-columns: minmax(0, 1fr);
			gap: 0.75rem;
			padding: 1rem;
			border: 1px solid var(--color-base-200);
			border-radius: 0.5rem;
		}
		.attendance-workspace .attendance-table td {
			display: block;
			min-width: 0;
			max-width: none;
			padding: 0;
			border-bottom: 0;
		}
		.attendance-table .attendance-number {
			display: none;
		}
		.attendance-mobile-label {
			display: block;
			margin-bottom: 0.375rem;
			font-size: 0.75rem;
			font-weight: 500;
		}
		.attendance-row-actions {
			border-top: 1px solid var(--color-base-200);
			padding-top: 0.75rem !important;
		}
	}
</style>
