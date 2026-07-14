<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import FormEnhance from '$lib/components/form-enhance.svelte';
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
		autoAlfaInserted: number;
		canSyncRapor: boolean;
		statusLabels: Record<StatusKey, string>;
	};

	let { data }: { data: PageData } = $props();
	let importSubmitting = $state(false);
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
		await invalidateAll();
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
		<div class="flex flex-wrap items-center gap-2">
			<a
				class="btn btn-soft btn-sm shadow-none"
				href={templateHref}
				aria-disabled={!canImport}
				class:pointer-events-none={!canImport}
				class:opacity-50={!canImport}
			>
				<Icon name="download" />
				Template Import
			</a>
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
				<div class="join">
					<input
						class="file-input file-input-sm join-item w-full max-w-52"
						type="file"
						name="file"
						accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
						required
						disabled={importSubmitting || !canImport}
					/>
					<button
						class="btn btn-primary btn-sm join-item shadow-none"
						type="submit"
						disabled={importSubmitting || !canImport}
					>
						{#if importSubmitting}
							<span class="loading loading-spinner loading-xs" aria-hidden="true"></span>
						{/if}
						<Icon name="import" />
						Import
					</button>
				</div>
			</FormEnhance>
			<a class="btn btn-accent btn-sm shadow-none" href={exportHref}>
				<Icon name="export" />
				Ekspor Excel
			</a>
			<a class="btn btn-soft btn-sm shadow-none" href={resolve('/administrasi/absensi/kegiatan')}>
				<Icon name="activity" />
				Absensi Kegiatan
			</a>
			<a
				class="btn btn-soft btn-sm shadow-none"
				href={resolve('/administrasi/absensi/kegiatan/pengaturan')}
			>
				<Icon name="gear" />
				Pengaturan
			</a>
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
