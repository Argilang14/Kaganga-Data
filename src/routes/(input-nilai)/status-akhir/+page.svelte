<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- search param helpers and goto usage */
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import SvelteURLSearchParams from '$lib/svelte-helpers/url-search-params';
	import { searchQueryMarker } from '$lib/utils';
	import { onDestroy, tick } from 'svelte';

	let { data } = $props();

	type StatusRow = (typeof data.daftarStatus)[number];

	let searchTerm = $state('');
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	let editingRowId = $state<number | null>(null);
	let editingStatus = $state('');
	let editingTanggal = $state('');
	let editingCatatan = $state('');
	let editingOriginal = $state('');
	let editingSubmitting = $state(false);
	let importSubmitting = $state(false);
	let statusSelect = $state<HTMLSelectElement | null>(null);

	const currentPage = $derived.by(() => data.page.currentPage ?? 1);
	const totalPages = $derived.by(() => Math.max(1, data.page.totalPages ?? 1));
	const pages = $derived.by(() => Array.from({ length: totalPages }, (_, index) => index + 1));

	const kelasAktif = $derived(page.data.kelasAktif ?? null);
	const kelasAktifLabel = $derived.by(() => {
		if (!kelasAktif) return null;
		return kelasAktif.fase ? `${kelasAktif.nama} - ${kelasAktif.fase}` : kelasAktif.nama;
	});

	const canEdit = $derived.by(() => {
		const u = page.data.user as { type?: string } | null | undefined;
		return u?.type !== 'wali_asuh' && u?.type !== 'wali_asrama';
	});

	const editingCurrent = $derived(
		JSON.stringify({
			status: editingStatus.trim(),
			tanggalPenetapan: editingTanggal.trim(),
			catatan: editingCatatan.trim()
		})
	);
	const editingSaveDisabled = $derived.by(
		() => editingRowId === null || editingSubmitting || editingCurrent === editingOriginal
	);

	$effect(() => {
		if (searchTimer) return;
		const latestSearchTerm = data.page.search ?? '';
		if (searchTerm !== latestSearchTerm) {
			searchTerm = latestSearchTerm;
		}
	});

	$effect(() => {
		if (editingRowId === null) return;
		const row = data.daftarStatus.find((item) => item.id === editingRowId);
		if (!row) {
			cancelEdit();
		}
	});

	$effect(() => {
		if (editingRowId !== null) {
			void tick().then(() => statusSelect?.focus());
		}
	});

	function todayInputValue() {
		const date = new Date();
		const offset = date.getTimezoneOffset();
		const localDate = new Date(date.getTime() - offset * 60_000);
		return localDate.toISOString().slice(0, 10);
	}

	function originalPayload(row: StatusRow) {
		return JSON.stringify({
			status: (row.status ?? '').trim(),
			tanggalPenetapan: (row.tanggalPenetapan ?? '').trim(),
			catatan: (row.catatan ?? '').trim()
		});
	}

	function buildSearchUrl(rawValue: string) {
		const params = new SvelteURLSearchParams(page.url.search);
		const cleaned = rawValue.trim();
		const current = params.get('q') ?? '';
		const searchChanged = cleaned !== current;
		if (cleaned) {
			params.set('q', cleaned);
		} else {
			params.delete('q');
		}
		if (searchChanged) {
			params.delete('page');
		}
		const nextQuery = params.toString();
		const nextUrl = `${page.url.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
		const currentUrl = `${page.url.pathname}${page.url.search}`;
		if (nextUrl === currentUrl) {
			return null;
		}
		return nextUrl;
	}

	async function applySearch(rawValue: string) {
		const target = buildSearchUrl(rawValue);
		if (!target) return;
		searchTimer = undefined;
		await goto(target, { replaceState: true, keepFocus: true });
	}

	function buildPageUrl(pageNumber: number) {
		const params = new SvelteURLSearchParams(page.url.search);
		const sanitized = pageNumber < 1 ? 1 : pageNumber;
		if (sanitized <= 1) {
			params.delete('page');
		} else {
			params.set('page', String(sanitized));
		}
		const nextQuery = params.toString();
		const nextUrl = `${page.url.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
		const currentUrl = `${page.url.pathname}${page.url.search}`;
		if (nextUrl === currentUrl) {
			return null;
		}
		return nextUrl;
	}

	async function gotoPage(pageNumber: number) {
		const target = buildPageUrl(pageNumber);
		if (!target) return;
		await goto(target, { replaceState: true, keepFocus: true });
	}

	function handlePageClick(pageNumber: number) {
		if (pageNumber === currentPage) return;
		void gotoPage(pageNumber);
	}

	function handleSearchInput(event: Event) {
		const value = (event.currentTarget as HTMLInputElement).value;
		searchTerm = value;
		if (searchTimer) {
			clearTimeout(searchTimer);
		}
		searchTimer = setTimeout(() => {
			searchTimer = undefined;
			void applySearch(value);
		}, 400);
	}

	function submitSearch(event: Event) {
		event.preventDefault();
		if (searchTimer) {
			clearTimeout(searchTimer);
			searchTimer = undefined;
		}
		void applySearch(searchTerm);
	}

	onDestroy(() => {
		if (searchTimer) {
			clearTimeout(searchTimer);
			searchTimer = undefined;
		}
	});

	function startEdit(row: StatusRow) {
		if (editingRowId === row.id) return;
		editingRowId = row.id;
		editingStatus = row.status ?? '';
		editingTanggal = row.tanggalPenetapan || todayInputValue();
		editingCatatan = row.catatan ?? '';
		editingOriginal = originalPayload({
			...row,
			tanggalPenetapan: row.tanggalPenetapan || todayInputValue()
		});
		editingSubmitting = false;
	}

	function cancelEdit() {
		editingRowId = null;
		editingStatus = '';
		editingTanggal = '';
		editingCatatan = '';
		editingOriginal = '';
		editingSubmitting = false;
	}

	async function handleSaveSuccess() {
		cancelEdit();
		await invalidate('app:status-akhir');
	}

	async function handleImportSuccess({ form }: { form: HTMLFormElement }) {
		form.reset();
		cancelEdit();
		await invalidate('app:status-akhir');
	}

	const hasMurid = $derived.by(() => data.page.totalItems > 0);
</script>

<div class="card bg-base-100 rounded-lg border border-none p-4 shadow-md">
	<div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
		<div>
			<h2 class="text-xl font-bold">Status Akhir Rapor</h2>
			{#if kelasAktifLabel}
				<p class="text-base-content/80 block text-sm">{kelasAktifLabel}</p>
			{/if}
		</div>

		{#if canEdit}
			<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
				<a
					class="btn btn-soft btn-sm shadow-none"
					href="/api/status-akhir/download-template"
					aria-disabled={!hasMurid}
					class:pointer-events-none={!hasMurid}
					class:opacity-50={!hasMurid}
				>
					<Icon name="download" />
					Download Template
				</a>
				<a
					class="btn btn-soft btn-sm shadow-none"
					href="/api/status-akhir/export"
					aria-disabled={!hasMurid}
					class:pointer-events-none={!hasMurid}
					class:opacity-50={!hasMurid}
				>
					<Icon name="export" />
					Ekspor Data
				</a>
				<FormEnhance
					id="import-status-akhir-form"
					action="?/importExcel"
					enctype="multipart/form-data"
					submitStateChange={(value) => (importSubmitting = value)}
					onsuccess={handleImportSuccess}
					showToast
				>
					<div class="join">
						<input
							class="file-input file-input-sm join-item w-full max-w-64"
							type="file"
							name="file"
							accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
							required
							disabled={importSubmitting || !hasMurid}
						/>
						<button
							type="submit"
							class="btn btn-primary btn-sm join-item shadow-none"
							disabled={importSubmitting || !hasMurid}
						>
							{#if importSubmitting}
								<span class="loading loading-spinner loading-xs" aria-hidden="true"></span>
							{/if}
							<Icon name="import" />
							Import
						</button>
					</div>
				</FormEnhance>
			</div>
		{/if}
	</div>

	<form
		class="flex flex-col items-center gap-2 sm:flex-row"
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
		<table class="border-base-200 table min-w-[780px] border dark:border-none">
			<thead>
				<tr class="bg-base-200 dark:bg-base-300 text-left font-bold">
					<th style="width: 60px;">No</th>
					<th style="width: 35%;">Nama Peserta Didik</th>
					<th class="w-full">Hasil Akhir Rapot</th>
					<th style="width: 160px; min-width: 120px;">Edit</th>
				</tr>
			</thead>
			<tbody>
				{#each data.daftarStatus as item (item.id)}
					{@const formId = `edit-status-akhir-form-${item.id}`}
					<tr class={editingRowId === item.id ? 'bg-base-200/40' : undefined}>
						<td class="align-top">{item.no}</td>
						<td class="align-top">{@html searchQueryMarker(data.page.search, item.nama)}</td>
						<td class="align-top">
							{#if item.status}
								<span class="font-medium">{item.status}</span>
							{:else}
								<span class="italic opacity-60">Belum ditetapkan</span>
							{/if}
						</td>
						<td class="align-top">
							<div class="flex justify-end">
								<button
									type="button"
									class="btn btn-sm btn-soft shadow-none"
									onclick={() => startEdit(item)}
									disabled={editingRowId !== null || !canEdit}
									title={!canEdit ? 'Anda tidak memiliki izin untuk mengedit' : ''}
								>
									<Icon name="edit" />
									Edit
								</button>
							</div>
						</td>
					</tr>
					{#if editingRowId === item.id}
						<tr class="bg-base-100 dark:bg-base-200">
							<td colspan="4" class="p-4">
								<FormEnhance
									id={formId}
									action="?/save"
									submitStateChange={(value) => (editingSubmitting = value)}
									onsuccess={() => {
										void handleSaveSuccess();
									}}
								>
									{#snippet children({ submitting, invalid })}
										<input name="muridId" value={item.id} hidden />
										<div class="border-base-300 bg-base-100 rounded-lg border p-4">
											<h3 class="text-base-content/70 mb-4 text-lg font-bold">
												Status Akhir Rapor
											</h3>
											<div class="grid gap-4">
												<label class="form-control w-full">
													<div class="label">
														<span class="label-text font-semibold">Status Kenaikan / Kelulusan</span
														>
													</div>
													<select
														bind:this={statusSelect}
														class="select select-bordered bg-base-100 w-full"
														name="status"
														bind:value={editingStatus}
														aria-invalid={invalid}
													>
														<option value="">Pilih status akhir</option>
														{#each data.statusOptions as option (option)}
															<option value={option}>{option}</option>
														{/each}
													</select>
												</label>

												<label class="form-control w-full">
													<div class="label">
														<span class="label-text font-semibold">Tanggal Penetapan Rapor</span>
													</div>
													<input
														class="input input-bordered bg-base-100 w-full"
														type="date"
														name="tanggalPenetapan"
														bind:value={editingTanggal}
													/>
												</label>

												<label class="form-control w-full">
													<div class="label flex-col items-start gap-1">
														<span class="label-text font-semibold">Catatan Wali Kelas</span>
														<span class="label-text-alt text-base-content/60">
															Berikan motivasi atau catatan khusus
														</span>
													</div>
													<textarea
														class="textarea textarea-bordered bg-base-100 min-h-28 w-full"
														name="catatan"
														bind:value={editingCatatan}
														placeholder={`Tuliskan catatan untuk ${item.nama}`}
														spellcheck="false"
														aria-invalid={invalid}
													></textarea>
												</label>
											</div>

											<div class="mt-4 flex justify-end gap-2">
												<button
													type="button"
													class="btn btn-soft btn-error shadow-none"
													onclick={cancelEdit}
													disabled={submitting}
												>
													<Icon name="close" />
													Batal
												</button>
												<button
													class="btn btn-primary shadow-none"
													type="submit"
													disabled={editingSaveDisabled}
												>
													{#if submitting}
														<span class="loading loading-spinner loading-xs" aria-hidden="true"
														></span>
													{/if}
													<Icon name="save" />
													Simpan
												</button>
											</div>
										</div>
									{/snippet}
								</FormEnhance>
							</td>
						</tr>
					{/if}
				{:else}
					<tr>
						<td class="p-7 text-center italic opacity-60" colspan="4"
							>Belum ada murid pada kelas ini</td
						>
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
				onclick={() => handlePageClick(pageNumber)}
				aria-current={pageNumber === currentPage ? 'page' : undefined}
			>
				{pageNumber}
			</button>
		{/each}
	</div>
</div>
