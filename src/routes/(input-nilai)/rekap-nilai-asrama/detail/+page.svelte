<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Icon from '$lib/components/icon.svelte';

	type MatevDetail = {
		no: number;
		matevId: number;
		matev: string;
		nilai: number | null;
		sudahDinilai: boolean;
		tujuanDinilai: number;
		totalTujuan: number;
	};

	type PageData = {
		status: 'empty' | 'not-found' | 'ready';
		murid: { id: number; nama: string } | null;
		daftarNilai: MatevDetail[];
		ringkasan: { rataRata: number | null; matevDinilai: number; totalMatev: number };
		tertinggi: MatevDetail[];
		terendah: MatevDetail[];
	};

	let { data }: { data: PageData } = $props();

	const kelasAktif = $derived(page.data.kelasAktif ?? null);
	const kelasAktifLabel = $derived.by(() => {
		if (!kelasAktif) return null;
		return kelasAktif.fase ? `${kelasAktif.nama} - ${kelasAktif.fase}` : kelasAktif.nama;
	});
	const hasNilai = $derived(data.status === 'ready' && data.ringkasan.totalMatev > 0);

	function formatScore(value: number | null) {
		if (value == null) return '&mdash;';
		return value.toLocaleString('id-ID', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});
	}

	function formatScoreText(value: number | null) {
		return value == null
			? '-'
			: value.toLocaleString('id-ID', {
					minimumFractionDigits: 2,
					maximumFractionDigits: 2
				});
	}

	function highlightText(items: MatevDetail[]) {
		if (!items.length) return 'Belum ada nilai';
		return items.map((item) => `${item.matev} (${formatScoreText(item.nilai)})`).join(', ');
	}
</script>

<div class="card bg-base-100 rounded-lg border border-none p-4 shadow-md">
	<div class="mb-2 flex flex-col gap-2 sm:flex-row">
		<a href={resolve('/rekap-nilai-asrama')} class="btn btn-soft shadow-none">
			<Icon name="left" />
			Kembali
		</a>
	</div>

	{#if data.status === 'ready' && data.murid}
		<div class="border-base-200 flex flex-col gap-2 border-b pb-4 sm:flex-row sm:items-center">
			<div>
				<h2 class="text-xl font-bold">Detail Rekap Nilai Asrama</h2>
				<p class="text-base-content/80">{data.murid.nama}</p>
				{#if kelasAktifLabel}
					<p class="text-base-content/60 text-sm">Kelas {kelasAktifLabel}</p>
				{/if}
			</div>
			<div class="divider sm:divider-horizontal"></div>
			<div class="flex flex-wrap gap-4">
				<div>
					<p class="text-base-content/60 text-sm tracking-wide uppercase">Rata-rata</p>
					<p class="text-3xl font-semibold">{@html formatScore(data.ringkasan.rataRata)}</p>
				</div>
				<div>
					<p class="text-base-content/60 text-sm tracking-wide uppercase">Matev Dinilai</p>
					<p class="text-xl font-semibold">
						{data.ringkasan.matevDinilai}/{data.ringkasan.totalMatev} Matev Asrama
					</p>
				</div>
			</div>
		</div>

		<div class="mt-4 grid gap-3 lg:grid-cols-2">
			<div role="alert" class="alert rounded-box alert-soft alert-success">
				<span class="text-2xl">
					<Icon name="up" />
				</span>
				<span>
					<p class="font-semibold">Matev Asrama Tertinggi</p>
					<p class="text-base-content/80 text-sm">{highlightText(data.tertinggi)}</p>
				</span>
			</div>
			<div role="alert" class="alert rounded-box alert-soft alert-warning">
				<span class="text-2xl">
					<Icon name="down" />
				</span>
				<span>
					<p class="font-semibold">Matev Asrama Terendah</p>
					<p class="text-base-content/80 text-sm">{highlightText(data.terendah)}</p>
				</span>
			</div>
		</div>

		<div
			class="bg-base-100 dark:bg-base-200 mt-4 overflow-x-auto rounded-md shadow-md dark:shadow-none"
		>
			<table class="border-base-200 table border dark:border-none">
				<thead>
					<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
						<th style="width: 50px; min-width: 40px;">No</th>
						<th class="w-full" style="min-width: 180px;">Matev Asrama</th>
						<th style="min-width: 120px;">Nilai</th>
						<th style="min-width: 130px;">Tujuan Dinilai</th>
					</tr>
				</thead>
				<tbody>
					{#if hasNilai}
						{#each data.daftarNilai as nilai (nilai.matevId)}
							<tr>
								<td>{nilai.no}</td>
								<td>{nilai.matev}</td>
								<td
									class={`font-semibold${nilai.sudahDinilai ? '' : ' text-base-content/60 italic'}`}
								>
									{@html formatScore(nilai.nilai)}
								</td>
								<td>{nilai.tujuanDinilai} / {nilai.totalTujuan}</td>
							</tr>
						{/each}
					{:else}
						<tr>
							<td colspan="4" class="p-8 text-center">
								<em class="opacity-60">Belum ada nilai asrama yang terinput untuk murid ini.</em>
							</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
	{:else}
		<div class="alert alert-soft alert-warning mt-4 flex items-start gap-3">
			<Icon name="warning" class="text-xl" />
			<span>
				{#if data.status === 'not-found'}
					<p class="font-semibold">Murid tidak ditemukan.</p>
					<p class="text-base-content/70 text-sm">
						Pastikan Anda memilih murid dari daftar rekap nilai asrama yang sama.
					</p>
				{:else}
					<p class="font-semibold">Pilih murid terlebih dahulu.</p>
					<p class="text-base-content/70 text-sm">
						Gunakan tombol lihat pada halaman Rekap Nilai Asrama untuk membuka rincian.
					</p>
				{/if}
			</span>
		</div>
	{/if}
</div>
