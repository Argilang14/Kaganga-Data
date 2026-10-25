<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- halaman memakai link download Excel */
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/icon.svelte';
	import type { SubmitFunction } from '@sveltejs/kit';

	type KelasRow = { id: number; nama: string; fase: string | null };
	type KesehatanRow = {
		id: number;
		tanggalPengukuran: string;
		tinggiBadan: number | null;
		beratBadan: number | null;
		zScore: number | null;
		statusGizi: string | null;
		kondisiFisik: string | null;
		ukuranBaju: string | null;
		ukuranCelana: string | null;
		ukuranSepatu: string | null;
		catatan: string | null;
		murid?: {
			id: number;
			nama: string;
			nis: string | null;
			tanggalLahir: string | null;
			kelas?: { nama: string | null } | null;
		} | null;
		petugas?: { username: string | null } | null;
	};

	let { data, form } = $props();
	let importDialog: HTMLDialogElement | null = $state(null);
	let importing = $state(false);

	const kelasList = $derived((data.kelas ?? []) as KelasRow[]);
	const riwayat = $derived((data.riwayat ?? []) as KesehatanRow[]);
	const failMessage = $derived(typeof form?.fail === 'string' ? form.fail : '');
	const successMessage = $derived(typeof form?.message === 'string' ? form.message : '');
	const queryString = $derived(() => {
		const params = new URLSearchParams();
		if (data.filter?.kelasId) params.set('kelasId', data.filter.kelasId);
		if (data.filter?.q) params.set('q', data.filter.q);
		if (data.filter?.start) params.set('start', data.filter.start);
		if (data.filter?.end) params.set('end', data.filter.end);
		return params.toString();
	});
	const exportUrl = $derived(
		queryString()
			? `/api/riwayat-pertumbuhan/export?${queryString()}`
			: '/api/riwayat-pertumbuhan/export'
	);

	const statusLabels: Record<string, string> = {
		gizi_buruk: 'Gizi Buruk',
		gizi_kurang: 'Gizi Kurang',
		normal: 'Normal',
		gizi_lebih: 'Gizi Lebih',
		obesitas: 'Obesitas'
	};

	function formatTanggal(value: string | null | undefined) {
		if (!value) return '-';
		const date = new Date(`${value}T00:00:00`);
		if (Number.isNaN(date.getTime())) return value;
		return new Intl.DateTimeFormat('id-ID', {
			day: '2-digit',
			month: 'long',
			year: 'numeric'
		}).format(date);
	}

	function formatAngka(value: number | null | undefined, suffix = '') {
		if (value === null || value === undefined) return '-';
		const formatted = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(value);
		return suffix ? `${formatted} ${suffix}` : formatted;
	}

	function formatStatus(value: string | null | undefined) {
		return value ? (statusLabels[value] ?? value) : '-';
	}

	function formatUsia(tanggalLahir: string | null | undefined, tanggalUkur: string) {
		if (!tanggalLahir) return '-';
		const lahir = new Date(`${tanggalLahir}T00:00:00`);
		const ukur = new Date(`${tanggalUkur}T00:00:00`);
		if (Number.isNaN(lahir.getTime()) || Number.isNaN(ukur.getTime()) || ukur < lahir) return '-';
		let tahun = ukur.getFullYear() - lahir.getFullYear();
		let bulan = ukur.getMonth() - lahir.getMonth();
		if (ukur.getDate() < lahir.getDate()) bulan -= 1;
		if (bulan < 0) {
			tahun -= 1;
			bulan += 12;
		}
		return `${tahun} tahun ${bulan} bulan`;
	}

	function preserveImport(): SubmitFunction {
		return () => {
			importing = true;
			return async ({ result, update }) => {
				try {
					await update({ reset: result.type === 'success', invalidateAll: true });
					if (result.type === 'success') importDialog?.close();
				} finally {
					importing = false;
				}
			};
		};
	}

	function resetFilter() {
		goto('/riwayat-pertumbuhan', { keepFocus: true, noScroll: true });
	}
</script>

<svelte:head>
	<title>Riwayat Pertumbuhan</title>
</svelte:head>

<div class="card bg-base-100 space-y-4 rounded-lg border-none p-4 shadow-md">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<h1 class="text-xl font-bold">Riwayat Pertumbuhan Murid</h1>
			<p class="text-base-content/65 mt-1 text-sm">{riwayat.length} catatan pengukuran</p>
		</div>
		<div class="flex shrink-0 max-sm:w-full">
			<button
				class="btn btn-soft rounded-r-none shadow-none max-sm:flex-1"
				type="button"
				onclick={() => importDialog?.showModal()}
			>
				<Icon name="import" />
				Import Data
			</button>
			<details class="dropdown dropdown-end">
				<summary
					class="btn btn-soft rounded-l-none shadow-none"
					aria-label="Menu data Excel riwayat pertumbuhan"
					title="Menu data Excel riwayat pertumbuhan"
				>
					<Icon name="down" />
				</summary>
				<ul
					class="dropdown-content menu bg-base-100 border-base-300 z-30 mt-2 w-56 rounded-lg border p-2 shadow-lg"
				>
					<li>
						<a href="/api/riwayat-pertumbuhan/template">
							<Icon name="download" /> Template Import
						</a>
					</li>
					<li>
						<a href={exportUrl}><Icon name="export" /> Export Data</a>
					</li>
				</ul>
			</details>
		</div>
	</div>

	{#if failMessage}
		<div class="alert alert-error alert-soft" role="alert">
			<Icon name="warning" /> <span>{failMessage}</span>
		</div>
	{/if}
	{#if successMessage}
		<div class="alert alert-success alert-soft" role="status">
			<Icon name="check" /> <span>{successMessage}</span>
		</div>
	{/if}

	<form
		method="GET"
		class="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(150px,1fr)_minmax(180px,1.4fr)_160px_160px_auto]"
	>
		<label class="flex min-w-0 flex-col gap-1">
			<span class="text-xs font-medium">Kelas</span>
			<select class="select w-full" name="kelasId">
				<option value="">Semua kelas</option>
				{#each kelasList as kelas (kelas.id)}
					<option value={kelas.id} selected={data.filter.kelasId === String(kelas.id)}>
						{kelas.nama}{kelas.fase ? ` - ${kelas.fase}` : ''}
					</option>
				{/each}
			</select>
		</label>
		<label class="flex min-w-0 flex-col gap-1">
			<span class="text-xs font-medium">Cari murid</span>
			<input class="input w-full" name="q" value={data.filter.q} placeholder="Nama atau NIS" />
		</label>
		<label class="flex min-w-0 flex-col gap-1">
			<span class="text-xs font-medium">Tanggal awal</span>
			<input class="input w-full" type="date" name="start" value={data.filter.start} />
		</label>
		<label class="flex min-w-0 flex-col gap-1">
			<span class="text-xs font-medium">Tanggal akhir</span>
			<input class="input w-full" type="date" name="end" value={data.filter.end} />
		</label>
		<div class="flex gap-2 sm:col-span-2 xl:col-span-1">
			<button class="btn btn-soft flex-1 shadow-none" type="submit"
				><Icon name="search" /> Tampilkan</button
			>
			<button
				class="btn btn-soft shadow-none"
				type="button"
				onclick={resetFilter}
				aria-label="Reset filter pertumbuhan"
				title="Reset filter"><Icon name="repeat" /></button
			>
		</div>
	</form>

	<dl class="border-base-200 divide-base-200 grid grid-cols-3 divide-x border-y py-3">
		<div class="min-w-0 pr-3">
			<dt class="text-base-content/65 min-h-8 text-xs sm:min-h-4">Total Catatan</dt>
			<dd class="mt-1 text-xl font-bold tabular-nums">{riwayat.length}</dd>
		</div>
		<div class="min-w-0 px-3">
			<dt class="text-base-content/65 min-h-8 text-xs sm:min-h-4">Normal</dt>
			<dd class="text-success mt-1 text-xl font-bold tabular-nums">
				{riwayat.filter((item) => item.statusGizi === 'normal').length}
			</dd>
		</div>
		<div class="min-w-0 pl-3">
			<dt class="text-base-content/65 min-h-8 text-xs sm:min-h-4">Perlu Pantauan</dt>
			<dd class="text-warning mt-1 text-xl font-bold tabular-nums">
				{riwayat.filter((item) => item.statusGizi && item.statusGizi !== 'normal').length}
			</dd>
		</div>
	</dl>

	<div class="rounded-md shadow-md">
		<div class="overflow-x-auto" role="region" aria-label="Riwayat pengukuran murid" tabindex="0">
			<table class="growth-table table w-full min-w-[1440px] table-fixed">
				<colgroup>
					<col class="w-36" /><col class="w-52" /><col class="w-20" /><col class="w-32" />
					<col class="w-24" /><col class="w-24" /><col class="w-24" /><col class="w-32" />
					<col class="w-32" /><col class="w-40" /><col />
				</colgroup>
				<thead>
					<tr class="bg-base-200">
						<th>Tanggal</th>
						<th>Murid</th>
						<th>Kelas</th>
						<th>Usia</th>
						<th class="text-right">Tinggi</th>
						<th class="text-right">Berat</th>
						<th class="text-right">Z-Score</th>
						<th>Status Gizi</th>
						<th>Kondisi</th>
						<th>Ukuran</th>
						<th>Catatan</th>
					</tr>
				</thead>
				<tbody>
					{#each riwayat as item (item.id)}
						<tr class="hover:bg-base-200/40 transition-colors">
							<td class="font-medium">{formatTanggal(item.tanggalPengukuran)}</td>
							<td>
								<div class="font-semibold">{item.murid?.nama ?? '-'}</div>
								<div class="text-base-content/60 text-xs">NIS {item.murid?.nis ?? '-'}</div>
							</td>
							<td>{item.murid?.kelas?.nama ?? '-'}</td>
							<td>{formatUsia(item.murid?.tanggalLahir, item.tanggalPengukuran)}</td>
							<td class="text-right tabular-nums">{formatAngka(item.tinggiBadan, 'cm')}</td>
							<td class="text-right tabular-nums">{formatAngka(item.beratBadan, 'kg')}</td>
							<td class="text-right tabular-nums">{formatAngka(item.zScore)}</td>
							<td>
								<span
									class="badge badge-soft h-auto min-h-6 max-w-full py-1 text-center text-xs whitespace-normal {item.statusGizi ===
									'normal'
										? 'badge-success'
										: item.statusGizi
											? 'badge-warning'
											: 'badge-ghost'}"
								>
									{formatStatus(item.statusGizi)}
								</span>
							</td>
							<td>{item.kondisiFisik ?? '-'}</td>
							<td class="text-xs">
								<div class="flex flex-wrap gap-x-2 gap-y-1">
									<span>Baju {item.ukuranBaju ?? '-'}</span>
									<span>Celana {item.ukuranCelana ?? '-'}</span>
									<span>Sepatu {item.ukuranSepatu ?? '-'}</span>
								</div>
							</td>
							<td>{item.catatan ?? '-'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if riwayat.length === 0}
			<p class="growth-empty text-base-content/60 px-4 py-12 text-center text-sm" role="status">
				Belum ada data pertumbuhan sesuai filter.
			</p>
		{/if}
	</div>
</div>

<dialog
	class="growth-import modal"
	bind:this={importDialog}
	aria-labelledby="growth-import-title"
	oncancel={(event) => {
		if (importing) event.preventDefault();
	}}
>
	<div class="modal-box w-full max-w-2xl space-y-4 rounded-lg p-4">
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				<h2 id="growth-import-title" class="text-xl font-bold">Import Riwayat Pertumbuhan</h2>
				<p class="text-base-content/65 mt-1 text-sm">Berkas Excel (.xlsx atau .xls)</p>
			</div>
			<form method="dialog">
				<button
					class="btn btn-square btn-ghost btn-sm shrink-0"
					disabled={importing}
					aria-label="Tutup import riwayat pertumbuhan"><Icon name="close" /></button
				>
			</form>
		</div>
		{#if failMessage}
			<div class="alert alert-error alert-soft" role="alert">
				<Icon name="warning" /><span>{failMessage}</span>
			</div>
		{/if}
		<form
			method="POST"
			action="?/import"
			enctype="multipart/form-data"
			use:enhance={preserveImport()}
			class="space-y-4"
			aria-busy={importing}
		>
			<label class="flex min-w-0 flex-col gap-1">
				<span class="text-xs font-medium">File Excel</span>
				<input
					class="file-input w-full"
					type="file"
					name="file"
					accept=".xlsx,.xls"
					required
					disabled={importing}
				/>
			</label>
			<div class="border-base-200 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
				<a class="link flex items-center gap-2 text-sm" href="/api/riwayat-pertumbuhan/template"
					><Icon name="download" /> Template Excel</a
				>
				<div class="flex gap-2 max-sm:w-full">
					<button
						class="btn btn-soft max-sm:flex-1"
						type="button"
						disabled={importing}
						onclick={() => importDialog?.close()}>Batal</button
					>
					<button class="btn btn-primary max-sm:flex-1" type="submit" disabled={importing}>
						{#if importing}<span class="loading loading-spinner loading-xs" aria-hidden="true"
							></span>{:else}<Icon name="import" />{/if}
						{importing ? 'Mengimport...' : 'Import Data'}
					</button>
				</div>
			</div>
		</form>
	</div>
</dialog>

<style>
	.growth-table > :is(thead, tbody) > tr > :is(th, td) {
		overflow-wrap: anywhere;
		white-space: normal;
	}

	.growth-import .modal-box {
		max-height: min(85dvh, calc(100dvh - 1rem));
		overflow-wrap: anywhere;
	}
</style>
