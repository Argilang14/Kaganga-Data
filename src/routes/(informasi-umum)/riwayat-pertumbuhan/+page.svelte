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
			return async ({ result, update }) => {
				await update({ reset: result.type === 'success', invalidateAll: true });
				if (result.type === 'success') importDialog?.close();
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

<div class="space-y-6">
	<div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h1 class="text-2xl font-bold">Riwayat Pertumbuhan</h1>
			<p class="text-base-content/70 mt-1 max-w-3xl text-sm">
				Pantau data kesehatan dan fisik murid dari seluruh kelas berdasarkan sekolah aktif.
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<a class="btn btn-primary shadow-none" href="/api/riwayat-pertumbuhan/template">
				<Icon name="download" />
				Template Import
			</a>
			<button
				class="btn btn-soft shadow-none"
				type="button"
				onclick={() => importDialog?.showModal()}
			>
				<Icon name="import" />
				Import Data
			</button>
			<a class="btn btn-soft shadow-none" href={exportUrl}>
				<Icon name="export" />
				Export Data
			</a>
		</div>
	</div>

	{#if failMessage}
		<div class="alert alert-error alert-soft">
			<Icon name="warning" /> <span>{failMessage}</span>
		</div>
	{/if}
	{#if successMessage}
		<div class="alert alert-success alert-soft">
			<Icon name="check" /> <span>{successMessage}</span>
		</div>
	{/if}

	<form
		method="GET"
		class="bg-base-100 border-base-200 rounded-box grid gap-3 border p-4 lg:grid-cols-[220px_1fr_180px_180px_auto_auto] lg:items-end"
	>
		<label class="form-control gap-1">
			<span class="label-text font-medium">Kelas</span>
			<select class="select select-bordered w-full" name="kelasId">
				<option value="">Semua kelas</option>
				{#each kelasList as kelas (kelas.id)}
					<option value={kelas.id} selected={data.filter.kelasId === String(kelas.id)}>
						{kelas.nama}{kelas.fase ? ` - ${kelas.fase}` : ''}
					</option>
				{/each}
			</select>
		</label>
		<label class="form-control gap-1">
			<span class="label-text font-medium">Cari murid</span>
			<input
				class="input input-bordered w-full"
				name="q"
				value={data.filter.q}
				placeholder="Nama atau NIS"
			/>
		</label>
		<label class="form-control gap-1">
			<span class="label-text font-medium">Tanggal awal</span>
			<input
				class="input input-bordered w-full"
				type="date"
				name="start"
				value={data.filter.start}
			/>
		</label>
		<label class="form-control gap-1">
			<span class="label-text font-medium">Tanggal akhir</span>
			<input class="input input-bordered w-full" type="date" name="end" value={data.filter.end} />
		</label>
		<button class="btn btn-primary shadow-none" type="submit">Terapkan</button>
		<button class="btn btn-ghost shadow-none" type="button" onclick={resetFilter}>Reset</button>
	</form>

	<div class="stats bg-base-100 border-base-200 w-full border shadow-sm">
		<div class="stat">
			<div class="stat-title">Total Catatan</div>
			<div class="stat-value text-2xl">{riwayat.length}</div>
		</div>
		<div class="stat">
			<div class="stat-title">Normal</div>
			<div class="stat-value text-success text-2xl">
				{riwayat.filter((item) => item.statusGizi === 'normal').length}
			</div>
		</div>
		<div class="stat">
			<div class="stat-title">Perlu Pantauan</div>
			<div class="stat-value text-warning text-2xl">
				{riwayat.filter((item) => item.statusGizi && item.statusGizi !== 'normal').length}
			</div>
		</div>
	</div>

	<div class="bg-base-100 border-base-200 rounded-box overflow-hidden border">
		<div class="overflow-x-auto">
			<table class="table-sm table">
				<thead>
					<tr class="bg-base-200/80">
						<th>Tanggal</th>
						<th>Murid</th>
						<th>Kelas</th>
						<th>Usia</th>
						<th>Tinggi</th>
						<th>Berat</th>
						<th>Z-Score</th>
						<th>Status Gizi</th>
						<th>Kondisi</th>
						<th>Ukuran</th>
						<th>Catatan</th>
					</tr>
				</thead>
				<tbody>
					{#if riwayat.length === 0}
						<tr>
							<td colspan="11" class="text-base-content/60 py-10 text-center">
								Belum ada data pertumbuhan sesuai filter.
							</td>
						</tr>
					{:else}
						{#each riwayat as item (item.id)}
							<tr>
								<td class="font-medium whitespace-nowrap"
									>{formatTanggal(item.tanggalPengukuran)}</td
								>
								<td>
									<div class="font-semibold">{item.murid?.nama ?? '-'}</div>
									<div class="text-base-content/60 text-xs">NIS {item.murid?.nis ?? '-'}</div>
								</td>
								<td>{item.murid?.kelas?.nama ?? '-'}</td>
								<td class="whitespace-nowrap"
									>{formatUsia(item.murid?.tanggalLahir, item.tanggalPengukuran)}</td
								>
								<td>{formatAngka(item.tinggiBadan, 'cm')}</td>
								<td>{formatAngka(item.beratBadan, 'kg')}</td>
								<td>{formatAngka(item.zScore)}</td>
								<td>
									<span
										class="badge badge-soft {item.statusGizi === 'normal'
											? 'badge-success'
											: 'badge-warning'}"
									>
										{formatStatus(item.statusGizi)}
									</span>
								</td>
								<td>{item.kondisiFisik ?? '-'}</td>
								<td class="text-xs whitespace-nowrap">
									Baju {item.ukuranBaju ?? '-'} · Celana {item.ukuranCelana ?? '-'} · Sepatu {item.ukuranSepatu ??
										'-'}
								</td>
								<td class="min-w-48">{item.catatan ?? '-'}</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>

<dialog class="modal" bind:this={importDialog}>
	<div class="modal-box max-w-lg">
		<form method="dialog">
			<button class="btn btn-circle btn-ghost btn-sm absolute top-3 right-3" aria-label="Tutup"
				>x</button
			>
		</form>
		<h2 class="text-xl font-bold">Import Riwayat Pertumbuhan</h2>
		<p class="text-base-content/70 mt-1 text-sm">
			Gunakan template Excel agar kolom tanggal, NIS, tinggi, berat, status gizi, dan ukuran terbaca
			dengan benar.
		</p>
		<form
			method="POST"
			action="?/import"
			enctype="multipart/form-data"
			use:enhance={preserveImport()}
			class="mt-5 space-y-4"
		>
			<label class="form-control gap-1">
				<span class="label-text font-medium">File Excel</span>
				<input
					class="file-input file-input-bordered w-full"
					type="file"
					name="file"
					accept=".xlsx,.xls"
					required
				/>
			</label>
			<div class="modal-action">
				<button class="btn btn-ghost" type="button" onclick={() => importDialog?.close()}
					>Batal</button
				>
				<button class="btn btn-primary" type="submit">Import Data</button>
			</div>
		</form>
	</div>
</dialog>
