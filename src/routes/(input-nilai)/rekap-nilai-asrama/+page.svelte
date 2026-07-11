<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- URLSearchParams helpers and page navigation */
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import AsramaLegerDownload from '$lib/components/AsramaLegerDownload.svelte';
	import Icon from '$lib/components/icon.svelte';
	import SvelteURLSearchParams from '$lib/svelte-helpers/url-search-params';
	import { searchQueryMarker } from '$lib/utils';
	import { onDestroy } from 'svelte';

	type MatevScore = {
		id: number;
		nama: string;
		score: number | null;
	};

	type Row = {
		id: number;
		nama: string;
		peringkat: number;
		nilaiRataRata: number | null;
		jumlahMatevDinilai: number;
		totalMatev: number;
		matevScores: MatevScore[];
		detailHref: string;
	};

	type PageData = {
		kelasLabel: string | null;
		sekolahNama: string;
		matevList: Array<{ id: number; nama: string }>;
		daftarNilai: Row[];
		legerRows: Row[];
		summary: { totalMurid: number; totalMuridDinilai: number; totalMatev: number };
		page: {
			search: string | null;
			currentPage: number;
			totalPages: number;
		};
	};

	let { data }: { data: PageData } = $props();
	let searchTerm = $state('');
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	const daftarNilai = $derived(data.daftarNilai ?? []);
	const hasRows = $derived(daftarNilai.length > 0);
	const currentPage = $derived(data.page.currentPage ?? 1);
	const totalPages = $derived(Math.max(1, data.page.totalPages ?? 1));
	const pages = $derived.by(() => Array.from({ length: totalPages }, (_, index) => index + 1));
	const kelasAktif = $derived(page.data.kelasAktif ?? null);
	const kelasLabel = $derived.by(() => {
		if (data.kelasLabel) return data.kelasLabel;
		if (!kelasAktif) return null;
		return kelasAktif.fase ? `${kelasAktif.nama} - ${kelasAktif.fase}` : kelasAktif.nama;
	});

	$effect(() => {
		if (searchTimer) return;
		const latestSearchTerm = data.page.search ?? '';
		if (searchTerm !== latestSearchTerm) searchTerm = latestSearchTerm;
	});

	function buildSearchUrl(rawValue: string) {
		const params = new SvelteURLSearchParams(page.url.search);
		const cleaned = rawValue.trim();
		const current = params.get('q') ?? '';
		if (cleaned) params.set('q', cleaned);
		else params.delete('q');
		if (cleaned !== current) params.delete('page');
		const nextQuery = params.toString();
		const nextUrl = `${page.url.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
		const currentUrl = `${page.url.pathname}${page.url.search}`;
		return nextUrl === currentUrl ? null : nextUrl;
	}

	async function applySearch(rawValue: string) {
		const target = buildSearchUrl(rawValue);
		if (!target) return;
		searchTimer = undefined;
		await goto(target, { replaceState: true, keepFocus: true });
	}

	function handleSearchInput(event: Event) {
		const value = (event.currentTarget as HTMLInputElement).value;
		searchTerm = value;
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			searchTimer = undefined;
			void applySearch(value);
		}, 400);
	}

	function submitSearch(event: Event) {
		event.preventDefault();
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = undefined;
		void applySearch(searchTerm);
	}

	function buildPageUrl(pageNumber: number) {
		const params = new SvelteURLSearchParams(page.url.search);
		const sanitized = pageNumber < 1 ? 1 : pageNumber;
		if (sanitized <= 1) params.delete('page');
		else params.set('page', String(sanitized));
		const nextQuery = params.toString();
		const nextUrl = `${page.url.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
		const currentUrl = `${page.url.pathname}${page.url.search}`;
		return nextUrl === currentUrl ? null : nextUrl;
	}

	function handlePageClick(pageNumber: number) {
		if (pageNumber === currentPage) return;
		const target = buildPageUrl(pageNumber);
		if (!target) return;
		void goto(target, { replaceState: true, keepFocus: true });
	}

	function formatScore(value: number | null) {
		if (value == null) return '&mdash;';
		return value.toLocaleString('id-ID', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});
	}

	onDestroy(() => {
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = undefined;
	});
</script>

{#if !kelasAktif}
	<div class="alert alert-warning alert-soft mb-6 flex items-center gap-3">
		<Icon name="warning" />
		<span>Pilih kelas aktif di bagian atas sebelum melihat rekap nilai asrama.</span>
	</div>
{/if}

<div class="card bg-base-100 rounded-lg border border-none p-4 shadow-md">
	<div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
		<div>
			<h2 class="text-xl font-bold">Rekapitulasi Nilai Asrama</h2>
			{#if kelasLabel}
				<p class="text-base-content/80 block text-sm">{kelasLabel}</p>
			{/if}
		</div>
		<AsramaLegerDownload
			rows={data.legerRows}
			matevList={data.matevList}
			sekolahNama={data.sekolahNama}
			kelasLabel={kelasLabel ?? ''}
		/>
	</div>

	<div class="stats dark:bg-base-200 shadow-md">
		<div class="stat">
			<div class="stat-title">Jumlah Murid</div>
			<div class="stat-value text-lg">{data.summary.totalMurid}</div>
			<div class="stat-desc">{data.summary.totalMuridDinilai} sudah dinilai</div>
		</div>
		<div class="stat">
			<div class="stat-title">Matev Asrama</div>
			<div class="stat-value text-lg">{data.summary.totalMatev}</div>
			<div class="stat-desc text-wrap">Menjadi kolom leger asrama</div>
		</div>
	</div>

	<form
		class="mt-4 flex flex-col gap-2 sm:flex-row"
		data-sveltekit-keepfocus
		data-sveltekit-replacestate
		onsubmit={submitSearch}
	>
		<label class="input bg-base-200 dark:bg-base-300 w-full dark:border-none">
			<Icon name="search" />
			<input
				type="search"
				name="q"
				value={searchTerm}
				spellcheck="false"
				placeholder="Cari nama murid..."
				autocomplete="name"
				oninput={handleSearchInput}
			/>
		</label>
	</form>

	<div
		class="bg-base-100 dark:bg-base-200 mt-4 overflow-x-auto rounded-md shadow-md dark:shadow-none"
	>
		<table class="border-base-200 table border dark:border-none">
			<thead>
				<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
					<th style="width: 80px; min-width: 80px;">Peringkat</th>
					<th class="w-full" style="min-width: 180px;">Nama</th>
					<th style="min-width: 210px;">Rata-rata Nilai Asrama</th>
				</tr>
			</thead>
			<tbody>
				{#if hasRows}
					{#each daftarNilai as murid (murid.id)}
						<tr>
							<td>{murid.peringkat}</td>
							<td>{@html searchQueryMarker(data.page.search, murid.nama)}</td>
							<td>
								<a
									class="btn btn-sm btn-soft items-center gap-3 shadow-none"
									title={`Lihat rekap nilai asrama ${murid.nama}`}
									href={murid.detailHref}
								>
									<Icon name="eye" />
									{@html formatScore(murid.nilaiRataRata)}
									<div>
										{murid.jumlahMatevDinilai}
										{#if murid.totalMatev}
											<span>/&nbsp;{murid.totalMatev}</span>
										{/if}
									</div>
								</a>
							</td>
						</tr>
					{/each}
				{:else}
					<tr>
						<td class="p-8 text-center" colspan="3">
							<em class="opacity-60">Belum ada data nilai asrama untuk ditampilkan.</em>
						</td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>

	<div class="join mx-auto mt-4">
		{#each pages as pageNumber (pageNumber)}
			<button
				type="button"
				class="join-item btn"
				class:btn-active={pageNumber === currentPage}
				disabled={pageNumber === currentPage && totalPages === 1}
				onclick={() => handlePageClick(pageNumber)}
			>
				{pageNumber}
			</button>
		{/each}
	</div>
</div>
