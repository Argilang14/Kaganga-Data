<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- URL filter dan export memakai query dinamis */
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Icon from '$lib/components/icon.svelte';

	type StatusKey = 'hadir' | 'terlambat' | 'sakit' | 'izin' | 'alfa';
	type Counts = Record<StatusKey, number>;
	type PageData = {
		tanggalAwal: string;
		tanggalAkhir: string;
		kelasId: number | null;
		muridId: number | null;
		kelasList: Array<{ id: number; nama: string; fase: string | null }>;
		muridList: Array<{ id: number; nama: string }>;
		summary: Counts;
		rekapSiswa: Array<{ id: number; nama: string; counts: Counts }>;
		rekapKelas: Array<{ kelas: string; counts: Counts }>;
		statusLabels: Record<StatusKey, string>;
	};

	let { data }: { data: PageData } = $props();
	const statusOrder: StatusKey[] = ['hadir', 'terlambat', 'sakit', 'izin', 'alfa'];

	function updateFilter(key: string, value: string) {
		const params = new URLSearchParams(page.url.search);
		if (value) params.set(key, value);
		else params.delete(key);
		if (key === 'kelas_id') params.delete('murid_id');
		void goto(`${page.url.pathname}?${params.toString()}`, {
			replaceState: true,
			keepFocus: true
		});
	}

	const exportHref = $derived(`/api/administrasi/absensi/rekap/export${page.url.search}`);
</script>

<div class="space-y-4">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<h2 class="text-2xl font-bold">Rekap Absensi</h2>
			<p class="text-base-content/70 text-sm">Ringkasan absensi digital per siswa dan kelas.</p>
		</div>
		<div class="flex gap-2">
			<a class="btn btn-accent btn-sm shadow-none" href={exportHref}>
				<Icon name="export" />
				Ekspor Excel
			</a>
			<a class="btn btn-soft btn-sm shadow-none" href={resolve('/administrasi/absensi')}>
				<Icon name="left" />
				Kembali
			</a>
		</div>
	</div>

	<div class="card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm">
		<div class="grid gap-3 md:grid-cols-4">
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
				<span class="label-text mb-1">Siswa</span>
				<select
					class="select select-bordered"
					value={data.muridId ?? ''}
					onchange={(event) =>
						updateFilter('murid_id', (event.currentTarget as HTMLSelectElement).value)}
				>
					<option value="">Semua siswa</option>
					{#each data.muridList as murid (murid.id)}
						<option value={murid.id}>{murid.nama}</option>
					{/each}
				</select>
			</label>
		</div>
	</div>

	<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
		{#each statusOrder as status (status)}
			<div class="stats bg-base-100 border-base-200 rounded-lg border shadow-sm">
				<div class="stat p-4">
					<div class="stat-title">{data.statusLabels[status]}</div>
					<div class="stat-value text-2xl">{data.summary[status]}</div>
				</div>
			</div>
		{/each}
	</div>

	<div class="grid gap-4 lg:grid-cols-2">
		<div class="card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm">
			<h3 class="mb-3 font-semibold">Rekap Per Siswa</h3>
			<div class="overflow-x-auto">
				<table class="table">
					<thead>
						<tr>
							<th>Nama</th>
							{#each statusOrder as status (status)}
								<th class="text-center">{data.statusLabels[status]}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each data.rekapSiswa as row (row.id)}
							<tr>
								<td>{row.nama}</td>
								{#each statusOrder as status (status)}
									<td class="text-center">{row.counts[status]}</td>
								{/each}
							</tr>
						{:else}
							<tr>
								<td colspan="6">Tidak ada data siswa.</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>

		<div class="card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm">
			<h3 class="mb-3 font-semibold">Rekap Per Kelas</h3>
			<div class="overflow-x-auto">
				<table class="table">
					<thead>
						<tr>
							<th>Kelas</th>
							{#each statusOrder as status (status)}
								<th class="text-center">{data.statusLabels[status]}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each data.rekapKelas as row (row.kelas)}
							<tr>
								<td>{row.kelas}</td>
								{#each statusOrder as status (status)}
									<td class="text-center">{row.counts[status]}</td>
								{/each}
							</tr>
						{:else}
							<tr>
								<td colspan="6">Pilih kelas untuk melihat rekap.</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	</div>
</div>
