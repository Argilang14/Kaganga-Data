<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import AttendanceMonitoringPanel from '$lib/components/absensi/AttendanceMonitoringPanel.svelte';
	import Icon from '$lib/components/icon.svelte';

	type StatusKey = 'hadir' | 'terlambat' | 'sakit' | 'izin' | 'alfa' | 'pulang';
	type Kegiatan = { id: number; nama: string; kategori: string };
	type Row = {
		no: number;
		id: number;
		nama: string;
		nis: string;
		nisn: string;
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
	const exportHref = $derived(`/api/administrasi/absensi/kegiatan/rekap/export${page.url.search}`);
	const templateHref = $derived(
		`/api/administrasi/absensi/kegiatan/download-template${page.url.search}`
	);
	const canImport = $derived(Boolean(data.activeSemesterId && data.kelasId && data.rows.length));

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

<div class="space-y-4">
	<div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h2 class="text-2xl font-bold">Rekap Absensi Kegiatan</h2>
			<p class="text-base-content/70 text-sm">
				Rekap kegiatan asrama, makan, sholat, dan apel berdasarkan rentang tanggal.
			</p>
		</div>
		<div class="flex self-start lg:self-auto">
			<a class="btn btn-soft rounded-r-none shadow-none" href={exportHref}>
				<Icon name="export" />
				Ekspor Rekap
			</a>
			<div class="dropdown dropdown-end">
				<button
					type="button"
					tabindex="0"
					class="btn btn-soft rounded-l-none border-l-base-300 border-l shadow-none"
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
							Absensi Kegiatan
						</a>
					</li>
					<li>
						<a href={resolve('/administrasi/absensi/kegiatan/pengaturan')}>
							<Icon name="gear" />
							Pengaturan Kegiatan
						</a>
					</li>
				</ul>
			</div>
		</div>
	</div>

	<div class="card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm">
		<div class="grid gap-4 xl:grid-cols-[1fr_auto]">
			<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
				<label class="form-control">
					<span class="label-text mb-1">Tanggal Awal</span>
					<input
						class="input input-bordered"
						type="date"
						value={data.tanggalAwal}
						onchange={(event) =>
							updateFilter('tanggal_awal', (event.currentTarget as HTMLInputElement).value)}
					/>
				</label>
				<label class="form-control">
					<span class="label-text mb-1">Tanggal Akhir</span>
					<input
						class="input input-bordered"
						type="date"
						value={data.tanggalAkhir}
						onchange={(event) =>
							updateFilter('tanggal_akhir', (event.currentTarget as HTMLInputElement).value)}
					/>
				</label>
				<label class="form-control">
					<span class="label-text mb-1">Kelas</span>
					<select
						class="select select-bordered"
						value={data.kelasId ?? ''}
						onchange={(event) =>
							updateFilter('kelas_id', (event.currentTarget as HTMLSelectElement).value)}
					>
						{#each data.kelasList as kelas (kelas.id)}
							<option value={kelas.id}>{kelas.nama}{kelas.fase ? ` - ${kelas.fase}` : ''}</option>
						{/each}
					</select>
				</label>
				<label class="form-control">
					<span class="label-text mb-1">Kegiatan</span>
					<select
						class="select select-bordered"
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
				<form method="POST" action="?/syncRapor" class="border-base-200 rounded-lg border p-3">
					<input type="hidden" name="semesterId" value={data.activeSemesterId ?? ''} />
					<input type="hidden" name="kelasId" value={data.kelasId ?? ''} />
					<input type="hidden" name="tanggalAwal" value={data.tanggalAwal} />
					<input type="hidden" name="tanggalAkhir" value={data.tanggalAkhir} />
					<button
						class="btn btn-accent btn-sm w-full shadow-none"
						type="submit"
						disabled={!data.activeSemesterId || !data.kelasId}
					>
						<Icon name="repeat" />
						Sinkronkan ke Kehadiran Rapor
					</button>
					<p class="text-base-content/60 mt-2 max-w-64 text-xs">
						Hanya sakit, izin, dan alfa dari kegiatan bertanda Masuk rapor yang dikirim.
					</p>
				</form>
			{/if}
		</div>
	</div>

	{#if data.autoAlfaInserted}
		<div class="alert alert-warning">
			<Icon name="warning" />
			<span>
				Sistem mengisi {data.autoAlfaInserted} data alfa otomatis pada rentang tanggal ini.
			</span>
		</div>
	{/if}

	<AttendanceMonitoringPanel
		alerts={data.monitoring.alerts}
		permits={data.monitoring.izinPulang}
		students={data.rows.map((row) => ({ id: row.id, nama: row.nama, nis: row.nis }))}
		kelasId={data.kelasId}
		today={data.monitoringToday}
	/>

	<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
		<div class="stats bg-base-100 border-base-200 rounded-lg border shadow-sm">
			<div class="stat p-4">
				<div class="stat-title">Total</div>
				<div class="stat-value text-2xl">{total}</div>
			</div>
		</div>
		{#each statusOrder as status (status)}
			<div class="stats bg-base-100 border-base-200 rounded-lg border shadow-sm">
				<div class="stat p-4">
					<div class="stat-title">{data.statusLabels[status]}</div>
					<div class="stat-value text-2xl">{data.summary[status]}</div>
				</div>
			</div>
		{/each}
	</div>

	<div class="card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm">
		<h3 class="mb-3 font-semibold">Rekap Per Siswa</h3>
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
			<div class="overflow-x-auto">
				<table class="table-zebra table">
					<thead>
						<tr>
							<th>No</th>
							<th>Nama</th>
							{#each statusOrder as status (status)}
								<th class="text-center">{data.statusLabels[status]}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each data.rows as row (row.id)}
							<tr>
								<td>{row.no}</td>
								<td>
									<div class="font-medium">{row.nama}</div>
									<div class="text-base-content/60 text-xs">NIS {row.nis} · NISN {row.nisn}</div>
								</td>
								{#each statusOrder as status (status)}
									<td class="text-center font-semibold">{row.counts[status]}</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>

	<div class="card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm">
		<div class="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<h3 class="font-semibold">Detail Per Tanggal</h3>
				<p class="text-base-content/60 text-sm">
					Rincian jumlah status per kegiatan untuk rentang tanggal yang dipilih.
				</p>
			</div>
			<span class="badge badge-soft">{data.detailRows.length} baris</span>
		</div>
		{#if !data.detailRows.length}
			<div class="alert alert-info">
				<Icon name="info" />
				<span>Belum ada detail absensi kegiatan pada filter ini.</span>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="table-zebra table-sm table">
					<thead>
						<tr>
							<th>Tanggal</th>
							<th>Kegiatan</th>
							{#each statusOrder as status (status)}
								<th class="text-center">{data.statusLabels[status]}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each data.detailRows as row (`${row.tanggal}-${row.kegiatanId}`)}
							<tr>
								<td class="font-medium whitespace-nowrap">{row.tanggal}</td>
								<td>{row.kegiatanNama}</td>
								{#each statusOrder as status (status)}
									<td class="text-center font-semibold">{row.counts[status]}</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>

<dialog class="modal" bind:this={importDialog}>
	<div class="modal-box max-w-lg">
		<div class="mb-5">
			<h3 class="text-xl font-bold">Import Absensi Kegiatan</h3>
			<p class="text-base-content/65 mt-1 text-sm">
				Pilih file Excel yang telah diisi menggunakan template untuk kelas aktif.
			</p>
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
			<label class="form-control w-full">
				<span class="label-text mb-2 font-medium">File Excel</span>
				<input
					class="file-input file-input-bordered w-full"
					type="file"
					name="file"
					accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
					required
					disabled={importSubmitting || !canImport}
				/>
				<span class="text-base-content/60 mt-2 text-xs">
					Gunakan format .xlsx dan jangan mengubah nama kolom pada template.
				</span>
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
				<button
					class="btn btn-primary"
					type="submit"
					disabled={importSubmitting || !canImport}
				>
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
