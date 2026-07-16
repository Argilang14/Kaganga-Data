<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- URL filter dibangun dari route aktif dan query dinamis */
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import SvelteURLSearchParams from '$lib/svelte-helpers/url-search-params';
	import { searchQueryMarker } from '$lib/utils';
	import { onDestroy } from 'svelte';

	type KehadiranRow = {
		id: number;
		no: number;
		nama: string;
		hadir: number;
		sakit: number;
		izin: number;
		alfa: number;
		updatedAt: string | null;
	};

	type PageState = {
		search: string | null;
		currentPage: number;
		totalPages: number;
	};

	type Draft = {
		hadir: string;
		sakit: string;
		izin: string;
		alfa: string;
	};

	type PageData = {
		page: PageState;
		daftarMurid: KehadiranRow[];
		tableReady: boolean;
		totalMurid: number;
		muridCount: number;
	};

	let { data }: { data: PageData } = $props();

	const kelasAktif = $derived(page.data.kelasAktif ?? null);
	const kelasAktifLabel = $derived.by(() => {
		if (!kelasAktif) return null;
		return kelasAktif.fase ? `${kelasAktif.nama} - ${kelasAktif.fase}` : kelasAktif.nama;
	});

	const canEdit = $derived.by(() => {
		const u = page.data.user as { type?: string } | null | undefined;
		return u?.type !== 'wali_asuh';
	});

	const currentPage = $derived.by(() => data.page?.currentPage ?? 1);
	const totalPages = $derived.by(() => Math.max(1, data.page?.totalPages ?? 1));
	const pages = $derived.by(() => Array.from({ length: totalPages }, (_, index) => index + 1));
	const hasMurid = $derived.by(() => data.muridCount > 0);
	const hasFilteredMurid = $derived.by(() => data.totalMurid > 0);

	let searchTerm = $state('');
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	let editingRowId = $state<number | null>(null);
	let draft = $state<Draft>({ hadir: '0', sakit: '0', izin: '0', alfa: '0' });
	let submitting = $state(false);

	$effect(() => {
		if (searchTimer) return;
		const latestSearchTerm = data.page.search ?? '';
		if (searchTerm !== latestSearchTerm) {
			searchTerm = latestSearchTerm;
		}
	});

	function buildUrl(updateParams: (params: SvelteURLSearchParams) => void) {
		const params = new SvelteURLSearchParams(page.url.search);
		updateParams(params);
		const nextQuery = params.toString();
		const nextUrl = `${page.url.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
		const currentUrl = `${page.url.pathname}${page.url.search}`;
		return nextUrl === currentUrl ? null : nextUrl;
	}

	async function applyNavigation(updateParams: (params: SvelteURLSearchParams) => void) {
		const target = buildUrl(updateParams);
		if (!target) return;
		await goto(target, { replaceState: true, keepFocus: true });
	}

	function handleSearchInput(event: Event) {
		const value = (event.currentTarget as HTMLInputElement).value;
		searchTerm = value;
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			searchTimer = undefined;
			void applyNavigation((params) => {
				const cleaned = value.trim();
				if (cleaned) {
					params.set('q', cleaned);
				} else {
					params.delete('q');
				}
				params.delete('page');
			});
		}, 400);
	}

	function submitSearch(event: Event) {
		event.preventDefault();
		if (searchTimer) {
			clearTimeout(searchTimer);
			searchTimer = undefined;
		}
		void applyNavigation((params) => {
			const cleaned = searchTerm.trim();
			if (cleaned) {
				params.set('q', cleaned);
			} else {
				params.delete('q');
			}
			params.delete('page');
		});
	}

	onDestroy(() => {
		if (searchTimer) clearTimeout(searchTimer);
	});

	function gotoPage(pageNumber: number) {
		const sanitized = pageNumber < 1 ? 1 : pageNumber;
		void applyNavigation((params) => {
			if (sanitized <= 1) {
				params.delete('page');
			} else {
				params.set('page', String(sanitized));
			}
		});
	}

	function displayCount(value: number | null | undefined) {
		if (!value) return '-';
		return value;
	}

	function sanitizeCount(value: string) {
		return value.replace(/[^0-9]/g, '');
	}

	function startEdit(row: KehadiranRow) {
		editingRowId = row.id;
		draft = {
			hadir: String(row.hadir ?? 0),
			sakit: String(row.sakit ?? 0),
			izin: String(row.izin ?? 0),
			alfa: String(row.alfa ?? 0)
		};
	}

	function cancelEdit() {
		editingRowId = null;
		draft = { hadir: '0', sakit: '0', izin: '0', alfa: '0' };
	}

	function updateDraft(key: keyof Draft, value: string) {
		draft = { ...draft, [key]: sanitizeCount(value) };
	}

	function parseDraftValue(raw: string) {
		if (!raw.trim()) return 0;
		const parsed = Number(raw);
		if (!Number.isInteger(parsed) || parsed < 0) return null;
		return parsed;
	}

	function isDraftInvalid() {
		return (
			parseDraftValue(draft.hadir) == null ||
			parseDraftValue(draft.sakit) == null ||
			parseDraftValue(draft.izin) == null ||
			parseDraftValue(draft.alfa) == null
		);
	}

	async function handleSaveSuccess() {
		await invalidate('app:absen');
		editingRowId = null;
	}
</script>

{#if !data.tableReady}
	<div class="alert alert-soft alert-warning mb-6 flex items-center gap-3">
		<Icon name="alert" />
		<span>
			Tabel kehadiran belum tersedia. Jalankan <strong>pnpm db:push</strong> untuk menerapkan migrasi
			terbaru.
		</span>
	</div>
{/if}

<div class="card bg-base-100 rounded-lg border border-none p-4 shadow-md">
	<div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
		<div>
			<h2 class="text-xl font-bold">Rekapitulasi Kehadiran Murid</h2>
			{#if kelasAktifLabel}
				<p class="text-base-content/80 block text-sm">{kelasAktifLabel}</p>
			{/if}
		</div>
	</div>

	<form
		class="flex flex-col gap-2 sm:flex-row"
		data-sveltekit-keepfocus
		data-sveltekit-replacestate
		autocomplete="off"
		spellcheck="false"
		onsubmit={submitSearch}
	>
		<label class="input bg-base-200 dark:bg-base-300 w-full dark:border-none">
			<Icon name="search" />
			<input
				type="search"
				name="q"
				value={searchTerm}
				placeholder="Cari nama murid..."
				oninput={handleSearchInput}
				autocomplete="off"
			/>
		</label>
	</form>

	{#if !hasMurid}
		<div class="alert alert-soft alert-warning mt-6">
			<Icon name="alert" />
			<span>Belum ada murid di kelas ini. Tambahkan murid terlebih dahulu.</span>
		</div>
	{:else if !hasFilteredMurid}
		<div class="alert alert-soft alert-info mt-6">
			<Icon name="info" />
			<span>Tidak ada murid yang cocok dengan pencarian.</span>
		</div>
	{:else}
		<div
			class="bg-base-100 dark:bg-base-200 mt-4 overflow-x-auto rounded-md shadow-md dark:shadow-none"
		>
			<table class="border-base-200 table border dark:border-none">
				<thead>
					<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
						<th style="width: 50px; min-width: 40px;">No</th>
						<th class="w-full" style="min-width: 160px;">Nama</th>
						<th class="text-center" style="min-width: 90px;">Hadir</th>
						<th class="text-center" style="min-width: 90px;">Sakit</th>
						<th class="text-center" style="min-width: 90px;">Izin</th>
						<th class="text-center" style="min-width: 90px;">Alfa</th>
						<th class="text-center" style="min-width: 120px;">Aksi</th>
					</tr>
				</thead>
				<tbody>
					{#each data.daftarMurid as murid (murid.id)}
						{@const isEditing = editingRowId === murid.id}
						<tr class={isEditing ? 'bg-base-200/40' : undefined}>
							<td>{murid.no}</td>
							<td>{@html searchQueryMarker(data.page.search, murid.nama)}</td>

							{#if isEditing}
								<FormEnhance
									id={`kehadiran-form-${murid.id}`}
									action="?/update"
									submitStateChange={(value) => (submitting = value)}
									onsuccess={handleSaveSuccess}
									showToast
								>
									<input type="hidden" name="muridId" value={murid.id} />
									<input type="hidden" name="kelasId" value={kelasAktif?.id ?? ''} />
								</FormEnhance>
								{#each ['hadir', 'sakit', 'izin', 'alfa'] as key (key)}
									<td class="text-center">
										<input
											class="input input-sm bg-base-100 dark:bg-base-300 w-full text-center dark:border-none"
											type="text"
											inputmode="numeric"
											name={key}
											form={`kehadiran-form-${murid.id}`}
											value={draft[key as keyof Draft]}
											oninput={(event) =>
												updateDraft(
													key as keyof Draft,
													(event.currentTarget as HTMLInputElement).value
												)}
											placeholder="0"
											maxlength="3"
										/>
									</td>
								{/each}
								<td>
									<div class="flex items-center justify-center gap-2">
										<button
											type="submit"
											class="btn btn-primary btn-sm shadow-none"
											form={`kehadiran-form-${murid.id}`}
											disabled={submitting || isDraftInvalid()}
										>
											<Icon name="save" />
											Simpan
										</button>
										<button
											type="button"
											class="btn btn-soft btn-sm btn-error shadow-none"
											onclick={cancelEdit}
											disabled={submitting}
										>
											<Icon name="close" />
										</button>
									</div>
								</td>
							{:else}
								<td class="text-center">{displayCount(murid.hadir)}</td>
								<td class="text-center">{displayCount(murid.sakit)}</td>
								<td class="text-center">{displayCount(murid.izin)}</td>
								<td class="text-center">{displayCount(murid.alfa)}</td>
								<td>
									<div class="flex items-center justify-center gap-2">
										<button
											type="button"
											class="btn btn-soft btn-sm shadow-none"
											onclick={() => startEdit(murid)}
											disabled={!data.tableReady || !canEdit}
											title={!canEdit ? 'Anda tidak memiliki izin untuk mengedit' : ''}
										>
											<Icon name="edit" />
											Edit
										</button>
									</div>
								</td>
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="join mt-4 sm:mx-auto">
			{#each pages as pageNumber (pageNumber)}
				<button
					type="button"
					class="join-item btn"
					class:btn-active={pageNumber === currentPage}
					onclick={() => gotoPage(pageNumber)}
					aria-current={pageNumber === currentPage ? 'page' : undefined}
				>
					{pageNumber}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	:global(form[id^='kehadiran-form-']) {
		display: contents;
	}
</style>
