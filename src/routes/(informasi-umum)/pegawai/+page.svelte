<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- halaman memakai link download dan form route lokal */
	import { enhance } from '$app/forms';
	import { preloadData, pushState } from '$app/navigation';
	import Icon from '$lib/components/icon.svelte';
	import DetailPegawai from '$lib/components/pegawai/DetailPegawai.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { ComponentProps } from 'svelte';

	type PegawaiRow = {
		id: number;
		nama: string;
		nip: string;
		nik: string | null;
		nuptk: string | null;
		jenis: string;
		jabatan: string | null;
		status: string;
		jenisKelamin: string | null;
		tempatLahir: string | null;
		tanggalLahir: string | null;
		agama: string | null;
		statusPerkawinan: string | null;
		telepon: string | null;
		email: string | null;
		alamat: string | null;
		desa: string | null;
		kecamatan: string | null;
		kabupaten: string | null;
		provinsi: string | null;
		kodePos: string | null;
		kontakDaruratNama: string | null;
		kontakDaruratHubungan: string | null;
		kontakDaruratTelepon: string | null;
		statusKepegawaian: string | null;
		tanggalMulaiKerja: string | null;
		unitPenempatan: string | null;
		pangkatGolongan: string | null;
		nomorSk: string | null;
		tanggalSk: string | null;
		foto: string | null;
		catatan: string | null;
	};
	type DetailPegawaiData = ComponentProps<typeof DetailPegawai>['data'];

	let { data, form } = $props();
	let formDialog: HTMLDialogElement | null = $state(null);
	let pegawaiForm: HTMLFormElement | null = $state(null);
	let importDialog: HTMLDialogElement | null = $state(null);
	let importForm: HTMLFormElement | null = $state(null);
	let excelDropdown: HTMLDetailsElement | null = $state(null);
	let selectedPegawai = $state<PegawaiRow | null>(null);
	let formActiveTab = $state(0);
	let selectedIds = $state<number[]>([]);
	const formTabs = ['Data Pegawai', 'Kontak & Alamat', 'Kepegawaian', 'Catatan'];
	type ImportPreview = {
		fileName: string;
		legacyFormat: boolean;
		sourceFormat?: string;
		peringatan: number;
		total: number;
		baru: number;
		perbarui: number;
		bermasalah: number;
		rows: Array<{
			rowNumber: number;
			nama: string;
			nip: string;
			nik: string | null;
			jenis: string;
			action: 'baru' | 'perbarui' | 'bermasalah';
			errors: string[];
			warnings: string[];
		}>;
	};
	let importPreview = $state<ImportPreview | null>(null);
	let importError = $state('');
	let importBusy = $state(false);
	let skipInvalid = $state(false);
	let openingDetailId = $state<number | null>(null);
	let detailData = $state<DetailPegawaiData | null>(null);

	const pegawaiList = $derived((data.pegawai ?? []) as PegawaiRow[]);
	const failMessage = $derived(typeof form?.fail === 'string' ? form.fail : '');
	const successMessage = $derived(typeof form?.message === 'string' ? form.message : '');
	const allSelected = $derived(
		pegawaiList.length > 0 && pegawaiList.every((pegawai) => selectedIds.includes(pegawai.id))
	);
	const currentPage = $derived(data.page?.currentPage ?? 1);
	const totalPages = $derived(Math.max(1, data.page?.totalPages ?? 1));
	const pageStart = $derived(
		data.page?.totalItems ? (currentPage - 1) * (data.page?.perPage ?? 20) + 1 : 0
	);
	const pageEnd = $derived(
		Math.min(currentPage * (data.page?.perPage ?? 20), data.page?.totalItems ?? 0)
	);

	const jenisLabels: Record<string, string> = {
		guru: 'Guru',
		kepala_sekolah: 'Kepala Sekolah',
		operator: 'Operator',
		tu: 'TU',
		kebersihan: 'Kebersihan',
		keamanan: 'Keamanan',
		wali_asuh: 'Wali Asuh',
		wali_asrama: 'Wali Asrama',
		tim_dapur: 'Tim Dapur',
		lainnya: 'Lainnya'
	};
	const statusLabels: Record<string, string> = { aktif: 'Aktif', nonaktif: 'Nonaktif' };

	function openCreateModal() {
		closeExcelDropdown();
		selectedPegawai = null;
		formActiveTab = 0;
		formDialog?.showModal();
	}

	function openEditFromDetail(pegawai: PegawaiRow) {
		closeDetailModal();
		selectedPegawai = pegawai;
		formActiveTab = 0;
		setTimeout(() => formDialog?.showModal(), 0);
	}

	async function openDetailModal(pegawai: PegawaiRow) {
		if (openingDetailId !== null) return;
		openingDetailId = pegawai.id;
		try {
			const href = `/pegawai/${pegawai.id}`;
			const result = await preloadData(href);
			if (result.type !== 'loaded' || result.status < 200 || result.status >= 300) {
				throw new Error('Data pegawai tidak dapat dimuat.');
			}
			detailData = result.data as DetailPegawaiData;
			pushState(href, { modal: { data: result.data, name: 'detail-pegawai' } });
		} catch (error) {
			toast({
				message: error instanceof Error ? error.message : 'Data pegawai tidak dapat dimuat.',
				type: 'error'
			});
		} finally {
			openingDetailId = null;
		}
	}

	function closeDetailModal() {
		detailData = null;
		if (location.pathname.startsWith('/pegawai/')) history.back();
	}

	function openDetailDialog(dialog: HTMLDialogElement) {
		dialog.showModal();
	}

	function handleFormTabKey(event: KeyboardEvent, index: number) {
		const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
		if (!keys.includes(event.key)) return;
		event.preventDefault();
		formActiveTab = event.key === 'Home' ? 0 : event.key === 'End' ? formTabs.length - 1
			: (index + (event.key === 'ArrowRight' ? 1 : -1) + formTabs.length) % formTabs.length;
		(event.currentTarget as HTMLElement).parentElement
			?.querySelector<HTMLButtonElement>(`#pegawai-form-tab-${formActiveTab}`)?.focus();
	}

	function nextFormTab() {
		if (formActiveTab === 0 && !pegawaiForm?.reportValidity()) return;
		formActiveTab = Math.min(formActiveTab + 1, formTabs.length - 1);
	}

	function validatePegawaiForm(event: SubmitEvent) {
		const nama = pegawaiForm?.elements.namedItem('nama') as HTMLInputElement | null;
		const nip = pegawaiForm?.elements.namedItem('nip') as HTMLInputElement | null;
		if (nama?.value.trim() && nip?.value.trim()) return;
		event.preventDefault();
		formActiveTab = 0;
		requestAnimationFrame(() => pegawaiForm?.reportValidity());
	}

	function pageHref(pageNumber: number) {
		const params = new URLSearchParams();
		if (data.filter.q) params.set('q', data.filter.q);
		if (data.filter.jenis) params.set('jenis', data.filter.jenis);
		if (data.filter.status) params.set('status', data.filter.status);
		if (pageNumber > 1) params.set('page', String(pageNumber));
		return params.size ? `/pegawai?${params}` : '/pegawai';
	}

	function toggleRow(id: number, checked: boolean) {
		selectedIds = checked
			? Array.from(new Set([...selectedIds, id]))
			: selectedIds.filter((selectedId) => selectedId !== id);
	}

	function toggleAll(checked: boolean) {
		selectedIds = checked ? pegawaiList.map((pegawai) => pegawai.id) : [];
	}

	function confirmDelete(nama: string) {
		return confirm(
			'Hapus data pegawai ' + nama + '? Data yang masih terhubung akan otomatis ditolak sistem.'
		);
	}

	function confirmBulkDelete(event: SubmitEvent) {
		if (
			!selectedIds.length ||
			!confirm('Hapus ' + selectedIds.length + ' data pegawai terpilih?')
		) {
			event.preventDefault();
		}
	}

	type ScrollSnapshot = { top: number; left: number; windowTop: number; windowLeft: number };
	type PreserveScrollOptions = { closeDialog?: () => void; clearSelected?: boolean };

	function getScrollContainer() {
		return document.querySelector('.max-h-\\[calc\\(100vh-4\\.2rem\\)\\]') as HTMLElement | null;
	}

	function captureScroll(): ScrollSnapshot {
		const scrollContainer = getScrollContainer();
		return {
			top: scrollContainer?.scrollTop ?? 0,
			left: scrollContainer?.scrollLeft ?? 0,
			windowTop: window.scrollY,
			windowLeft: window.scrollX
		};
	}

	function restoreScroll(snapshot: ScrollSnapshot) {
		requestAnimationFrame(() => {
			const scrollContainer = getScrollContainer();
			if (scrollContainer) {
				scrollContainer.scrollTo({ top: snapshot.top, left: snapshot.left, behavior: 'auto' });
			}
			window.scrollTo(snapshot.windowLeft, snapshot.windowTop);
		});
	}

	function preserveScroll(options: PreserveScrollOptions = {}): SubmitFunction {
		return () => {
			const snapshot = captureScroll();
			return async ({ result, update }) => {
				await update({ reset: false, invalidateAll: true });
				if (result.type === 'success') {
					options.closeDialog?.();
					if (options.clearSelected) selectedIds = [];
				}
				restoreScroll(snapshot);
			};
		};
	}

	const tableActionEnhance = preserveScroll();
	const bulkDeleteEnhance = preserveScroll({ clearSelected: true });
	const saveEnhance = preserveScroll({ closeDialog: () => formDialog?.close() });
	const importEnhance: SubmitFunction = ({ action }) => {
		const isPreview = action.search.includes('/previewImport');
		importBusy = true;
		importError = '';
		return async ({ result, update }) => {
			importBusy = false;
			if (result.type === 'failure') {
				importError = String(result.data?.fail ?? 'File pegawai tidak dapat diproses.');
				return;
			}
			if (result.type === 'success' && isPreview) {
				importPreview = (result.data?.preview as ImportPreview | undefined) ?? null;
				return;
			}
			await update({ reset: true, invalidateAll: true });
			if (result.type === 'success') {
				importPreview = null;
				importDialog?.close();
			}
		};
	};

	function resetImportPreview() {
		skipInvalid = false;
		importPreview = null;
		importError = '';
	}

	function openImportDialog() {
		closeExcelDropdown();
		importForm?.reset();
		resetImportPreview();
		importDialog?.showModal();
	}

	function closeImportDialog() {
		importForm?.reset();
		resetImportPreview();
	}

	function closeExcelDropdown() {
		if (excelDropdown) excelDropdown.open = false;
	}
</script>

<div class="card bg-base-100 space-y-4 rounded-lg border-none p-4 shadow-md">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<h1 class="text-xl font-bold">Formulir Dan Tabel Isian Data Pegawai</h1>
			<p class="text-base-content/70 mt-1 text-sm">Guru dan tenaga kependidikan sekolah.</p>
		</div>
		<div class="flex shrink-0 max-sm:w-full">
			<button class="btn btn-soft rounded-r-none shadow-none max-sm:flex-1" type="button" onclick={openCreateModal}>
				<Icon name="plus" />
				Tambah Pegawai
			</button>
			<details class="dropdown dropdown-end" bind:this={excelDropdown}>
				<summary class="btn btn-soft rounded-l-none shadow-none" aria-label="Menu data Excel pegawai" title="Menu data Excel pegawai"><Icon name="down" /></summary>
				<ul class="dropdown-content menu bg-base-100 border-base-300 z-30 mt-2 w-56 rounded-lg border p-2 shadow-lg">
					<li><a href="/api/pegawai/template" onclick={closeExcelDropdown}><Icon name="download" /> Download Template</a></li>
					<li><button type="button" onclick={openImportDialog}><Icon name="import" /> Import Data Pegawai</button></li>
					<li><a href="/api/pegawai/export" onclick={closeExcelDropdown}><Icon name="export" /> Export Data Pegawai</a></li>
				</ul>
			</details>
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

	<dl class="grid grid-cols-2 gap-2 sm:grid-cols-4">
		<div class="border-base-300 bg-base-200/50 rounded-md border-l-2 px-3 py-2">
			<dt class="text-base-content/65 text-xs">Total Pegawai</dt>
			<dd class="mt-1 text-xl font-bold tabular-nums">{data.totals.total}</dd>
		</div>
		<div class="border-success bg-success/5 rounded-md border-l-2 px-3 py-2">
			<dt class="text-base-content/65 text-xs">Aktif</dt>
			<dd class="text-success mt-1 text-xl font-bold tabular-nums">{data.totals.aktif}</dd>
		</div>
		<div class="border-info bg-info/5 rounded-md border-l-2 px-3 py-2">
			<dt class="text-base-content/65 text-xs">Guru/Kepala</dt>
			<dd class="mt-1 text-xl font-bold tabular-nums">{data.totals.guru}</dd>
		</div>
		<div class="border-warning bg-warning/5 rounded-md border-l-2 px-3 py-2">
			<dt class="text-base-content/65 text-xs">Asrama</dt>
			<dd class="mt-1 text-xl font-bold tabular-nums">{data.totals.asrama}</dd>
		</div>
	</dl>

	<form
		method="GET"
		class="grid grid-cols-2 items-end gap-3 lg:grid-cols-[minmax(0,1fr)_180px_140px_auto]"
	>
		<label class="col-span-2 flex min-w-0 flex-col gap-1 lg:col-span-1">
			<span class="text-xs font-medium">Cari pegawai</span>
			<input
				class="input input-bordered w-full"
				name="q"
				value={data.filter.q}
				placeholder="Nama, NIP, atau NIK"
			/>
		</label>
		<label class="flex min-w-0 flex-col gap-1">
			<span class="text-xs font-medium">Jenis</span>
			<select class="select select-bordered w-full" name="jenis">
				<option value="">Semua jenis</option>
				{#each data.options.jenis as jenis (jenis)}
					<option value={jenis} selected={data.filter.jenis === jenis}>{jenisLabels[jenis]}</option>
				{/each}
			</select>
		</label>
		<label class="flex min-w-0 flex-col gap-1">
			<span class="text-xs font-medium">Status</span>
			<select class="select select-bordered w-full" name="status">
				<option value="">Semua status</option>
				{#each data.options.status as status (status)}
					<option value={status} selected={data.filter.status === status}
						>{statusLabels[status]}</option
					>
				{/each}
			</select>
		</label>
		<div class="col-span-2 flex items-end gap-2 lg:col-span-1">
			<button class="btn btn-soft flex-1 shadow-none" type="submit"><Icon name="search" /> Filter</button>
			<a href="/pegawai" class="btn btn-soft shadow-none" title="Reset filter" aria-label="Reset filter pegawai"><Icon name="repeat" /></a>
		</div>
	</form>

	<div class="bg-base-100 overflow-hidden rounded-md shadow-md">
		{#if selectedIds.length}
		<div
			class="border-base-200 bg-base-200/50 flex items-center justify-between gap-3 border-b px-3 py-2"
		>
			<p class="text-sm font-medium" aria-live="polite">{selectedIds.length} pegawai dipilih</p>
			<form
				method="POST"
				action="?/deleteBulk"
				use:enhance={bulkDeleteEnhance}
				onsubmit={confirmBulkDelete}
			>
				{#each selectedIds as id (id)}
					<input type="hidden" name="ids" value={id} />
				{/each}
				<button class="btn btn-error btn-soft btn-sm" type="submit" disabled={!selectedIds.length}>
					<Icon name="del" /> Hapus Terpilih
				</button>
			</form>
		</div>
		{/if}
		<div class="overflow-x-auto">
			<table class="pegawai-table table min-w-[760px]">
				<colgroup>
					<col class="w-14" />
					<col class="w-12" />
					<col class="w-[34%]" />
					<col class="w-[16%]" />
					<col />
					<col class="w-24" />
					<col class="w-36" />
				</colgroup>
				<thead>
					<tr class="bg-base-200 text-base-content text-left font-bold">
						<th>
							<input
								class="checkbox"
								type="checkbox"
								checked={allSelected}
								onchange={(event) => toggleAll(event.currentTarget.checked)}
								aria-label="Pilih semua pegawai pada halaman ini"
							/>
						</th>
						<th>No</th>
						<th>Nama</th>
						<th>Jenis</th>
						<th>Jabatan</th>
						<th>Status</th>
						<th>Aksi</th>
					</tr>
				</thead>
				<tbody>
					{#each pegawaiList as pegawai, index (pegawai.id)}
						<tr class="hover:bg-base-200/40 transition-colors">
							<td>
								<input
									class="checkbox"
									type="checkbox"
									checked={selectedIds.includes(pegawai.id)}
									onchange={(event) => toggleRow(pegawai.id, event.currentTarget.checked)}
									aria-label={'Pilih ' + pegawai.nama}
								/>
							</td>
							<td>{(currentPage - 1) * (data.page?.perPage ?? 20) + index + 1}</td>
							<td>
								<div class="break-words font-medium">{pegawai.nama}</div>
								<div class="text-base-content/60 mt-0.5 text-xs">NIP {pegawai.nip}</div>
							</td>
							<td>{jenisLabels[pegawai.jenis] ?? pegawai.jenis}</td>
							<td class="break-words">{pegawai.jabatan || '-'}</td>
							<td>
								<span
									class:badge-success={pegawai.status === 'aktif'}
									class:badge-neutral={pegawai.status !== 'aktif'}
									class="badge badge-soft"
								>
									{statusLabels[pegawai.status] ?? pegawai.status}
								</span>
							</td>
							<td>
								<div class="flex flex-nowrap">
									<button
										class="btn btn-sm btn-soft pointer-events-auto rounded-r-none shadow-none"
										type="button"
										onclick={() => openDetailModal(pegawai)}
										disabled={openingDetailId !== null}
										title="Lihat informasi pegawai"
										aria-label={'Lihat informasi ' + pegawai.nama}
									>
										{#if openingDetailId === pegawai.id}
											<span class="loading loading-spinner loading-xs"></span>
										{:else}
											<Icon name="eye" />
										{/if}
									</button>
									<form method="POST" action="?/setStatus" use:enhance={tableActionEnhance}>
										<input type="hidden" name="id" value={pegawai.id} />
										<input
											type="hidden"
											name="status"
											value={pegawai.status === 'aktif' ? 'nonaktif' : 'aktif'}
										/>
										<button
											class="btn btn-sm btn-soft rounded-none shadow-none"
											type="submit"
											title={pegawai.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'}
											aria-label={pegawai.status === 'aktif'
												? 'Nonaktifkan ' + pegawai.nama
												: 'Aktifkan ' + pegawai.nama}
										>
											<Icon name={pegawai.status === 'aktif' ? 'close' : 'check'} />
										</button>
									</form>
									<form
										method="POST"
										action="?/delete"
										use:enhance={tableActionEnhance}
										onsubmit={(event) => {
											if (!confirmDelete(pegawai.nama)) event.preventDefault();
										}}
									>
										<input type="hidden" name="id" value={pegawai.id} />
										<button
											class="btn btn-sm btn-error btn-soft rounded-l-none shadow-none"
											type="submit"
											title="Hapus"
											aria-label={'Hapus ' + pegawai.nama}
										>
											<Icon name="del" />
										</button>
									</form>
								</div>
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="7" class="text-base-content/60 py-10 text-center">
								Belum ada data pegawai sesuai filter.
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<div
			class="border-base-200 flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
		>
			<p class="text-base-content/60 text-sm">
				Menampilkan {pageStart}-{pageEnd} dari {data.page?.totalItems ?? 0} pegawai
			</p>
			<div class="join">
				{#if currentPage > 1}
					<a
						class="join-item btn btn-sm btn-soft"
						href={pageHref(currentPage - 1)}
						title="Halaman sebelumnya"
						aria-label="Halaman sebelumnya"
					>
						<Icon name="left" />
					</a>
				{:else}
					<button
						class="join-item btn btn-sm btn-soft"
						type="button"
						disabled
						aria-label="Tidak ada halaman sebelumnya"
					>
						<Icon name="left" />
					</button>
				{/if}
				<span class="join-item btn btn-sm pointer-events-none">
					{currentPage} / {totalPages}
				</span>
				{#if currentPage < totalPages}
					<a
						class="join-item btn btn-sm btn-soft"
						href={pageHref(currentPage + 1)}
						title="Halaman berikutnya"
						aria-label="Halaman berikutnya"
					>
						<Icon name="right" />
					</a>
				{:else}
					<button
						class="join-item btn btn-sm btn-soft"
						type="button"
						disabled
						aria-label="Tidak ada halaman berikutnya"
					>
						<Icon name="right" />
					</button>
				{/if}
			</div>
		</div>
	</div>
</div>

{#if detailData}
	<dialog
		class="modal"
		aria-labelledby="pegawai-detail-title"
		use:openDetailDialog
		onclose={closeDetailModal}
	>
		<div class="pegawai-detail-modal modal-box w-full max-w-2xl p-4">
			<DetailPegawai data={detailData} onEdit={openEditFromDetail} onClose={closeDetailModal} />
		</div>
		<button type="button" class="modal-backdrop" onclick={closeDetailModal}>Tutup</button>
	</dialog>
{/if}

<dialog class="modal" bind:this={formDialog} aria-labelledby="pegawai-form-title" aria-describedby="pegawai-form-description">
	<div class="pegawai-form-modal modal-box flex w-full max-w-2xl flex-col p-4">
		<h3 id="pegawai-form-title" class="shrink-0 text-xl font-bold">
			{selectedPegawai ? 'Formulir Edit Pegawai Manual' : 'Formulir Tambah Pegawai Manual'}
		</h3>
		<p id="pegawai-form-description" class="text-base-content/60 mt-1 shrink-0 text-sm">
			Isi data pokok pegawai. Jika belum punya NIP, boleh isi tanda minus (-).
		</p>
		<div class="bg-base-200 mt-4 flex shrink-0 gap-1 overflow-x-auto rounded-md p-1" role="tablist" aria-label="Bagian biodata pegawai">
			{#each formTabs as tab, index (tab)}
				<button
					type="button"
					role="tab"
					id="pegawai-form-tab-{index}"
					aria-controls="pegawai-form-panel-{index}"
					aria-selected={formActiveTab === index}
					tabindex={formActiveTab === index ? 0 : -1}
					class="btn btn-sm shrink-0 border-0 shadow-none"
					class:bg-base-100={formActiveTab === index}
					class:btn-ghost={formActiveTab !== index}
					onkeydown={(event) => handleFormTabKey(event, index)}
					onclick={() => (formActiveTab = index)}>{tab}</button
				>
			{/each}
		</div>
		<form
			bind:this={pegawaiForm}
			method="POST"
			action="?/save"
			use:enhance={saveEnhance}
			novalidate
			onsubmit={validatePegawaiForm}
			class="pegawai-form mt-3 flex min-h-0 flex-1 flex-col"
		>
			<input type="hidden" name="id" value={selectedPegawai?.id ?? ''} />
			<div class="min-h-0 flex-1 overflow-y-auto p-1">
				<div id="pegawai-form-panel-0" role="tabpanel" aria-labelledby="pegawai-form-tab-0" tabindex="0" class="grid gap-3 sm:grid-cols-2" class:hidden={formActiveTab !== 0}>
				<label class="form-control gap-2"
					><span class="label-text font-medium">Nama Pegawai</span><input
						class="input input-bordered w-full"
						name="nama"
						value={selectedPegawai?.nama ?? ''}
						placeholder="Contoh: Adis Munandar"
						required
					/></label
				>
				<label class="form-control gap-2"
					><span class="label-text font-medium">NIP</span><input
						class="input input-bordered w-full"
						name="nip"
						value={selectedPegawai?.nip ?? ''}
						placeholder="Contoh: 198... atau -"
						required
					/></label
				>
				<label class="form-control gap-2"
					><span class="label-text font-medium">NIK</span><input
						class="input input-bordered w-full"
						name="nik"
						value={selectedPegawai?.nik ?? ''}
						inputmode="numeric"
					/></label
				>
				<label class="form-control gap-2"
					><span class="label-text font-medium">NUPTK</span><input
						class="input input-bordered w-full"
						name="nuptk"
						value={selectedPegawai?.nuptk ?? ''}
					/></label
				>
				<label class="form-control gap-2"
					><span class="label-text font-medium">Jenis Pegawai</span><select
						class="select select-bordered w-full"
						name="jenis"
						>{#each data.options.jenis as jenis (jenis)}<option
								value={jenis}
								selected={(selectedPegawai?.jenis ?? 'guru') === jenis}>{jenisLabels[jenis]}</option
							>{/each}</select
					></label
				>
				<label class="form-control gap-2"
					><span class="label-text font-medium">Status</span><select
						class="select select-bordered w-full"
						name="status"
						>{#each data.options.status as status (status)}<option
								value={status}
								selected={(selectedPegawai?.status ?? 'aktif') === status}
								>{statusLabels[status]}</option
							>{/each}</select
					></label
				>
				<label class="form-control gap-2"
					><span class="label-text font-medium">Jenis Kelamin</span><select
						class="select select-bordered w-full"
						name="jenisKelamin"
						><option value="">Belum diisi</option><option
							value="laki-laki"
							selected={selectedPegawai?.jenisKelamin === 'laki-laki'}>Laki-laki</option
						><option value="perempuan" selected={selectedPegawai?.jenisKelamin === 'perempuan'}
							>Perempuan</option
						></select
					></label
				>
				<label class="form-control gap-2"
					><span class="label-text font-medium">Tempat Lahir</span><input
						class="input input-bordered w-full"
						name="tempatLahir"
						value={selectedPegawai?.tempatLahir ?? ''}
					/></label
				>
				<label class="form-control gap-2"
					><span class="label-text font-medium">Tanggal Lahir</span><input
						class="input input-bordered w-full"
						type="date"
						name="tanggalLahir"
						value={selectedPegawai?.tanggalLahir ?? ''}
					/></label
				>
				<label class="form-control gap-2"
					><span class="label-text font-medium">Agama</span><input
						class="input input-bordered w-full"
						name="agama"
						value={selectedPegawai?.agama ?? ''}
					/></label
				>
				<label class="form-control gap-2"
					><span class="label-text font-medium">Status Perkawinan</span><select
						class="select select-bordered w-full"
						name="statusPerkawinan"
						><option value="">Belum diisi</option
						>{#each ['Belum Kawin', 'Kawin', 'Cerai Hidup', 'Cerai Mati'] as status (status)}<option
								value={status}
								selected={selectedPegawai?.statusPerkawinan === status}>{status}</option
							>{/each}</select
					></label
				>
				</div>
				<div id="pegawai-form-panel-2" role="tabpanel" aria-labelledby="pegawai-form-tab-2" tabindex="0" class="grid gap-3 sm:grid-cols-2" class:hidden={formActiveTab !== 2}>
				<label class="form-control gap-2"
					><span class="label-text font-medium">Jabatan</span><input
						class="input input-bordered w-full"
						name="jabatan"
						value={selectedPegawai?.jabatan ?? ''}
						placeholder="Contoh: Wali Kelas X-A"
					/></label
				>
				<label class="form-control gap-2"
					><span class="label-text font-medium">Status Kepegawaian</span><input
						class="input input-bordered w-full"
						name="statusKepegawaian"
						value={selectedPegawai?.statusKepegawaian ?? ''}
						placeholder="Contoh: PNS, PPPK, Honorer"
					/></label
				>
				<label class="form-control gap-2"
					><span class="label-text font-medium">Tanggal Mulai Kerja</span><input
						class="input input-bordered w-full"
						type="date"
						name="tanggalMulaiKerja"
						value={selectedPegawai?.tanggalMulaiKerja ?? ''}
					/></label
				>
				<label class="form-control gap-2"
					><span class="label-text font-medium">Unit Penempatan</span><input
						class="input input-bordered w-full"
						name="unitPenempatan"
						value={selectedPegawai?.unitPenempatan ?? ''}
					/></label
				>
				<label class="form-control gap-2"
					><span class="label-text font-medium">Pangkat/Golongan</span><input
						class="input input-bordered w-full"
						name="pangkatGolongan"
						value={selectedPegawai?.pangkatGolongan ?? ''}
					/></label
				>
				<label class="form-control gap-2"
					><span class="label-text font-medium">Nomor SK</span><input
						class="input input-bordered w-full"
						name="nomorSk"
						value={selectedPegawai?.nomorSk ?? ''}
					/></label
				>
				<label class="form-control gap-2"
					><span class="label-text font-medium">Tanggal SK</span><input
						class="input input-bordered w-full"
						type="date"
						name="tanggalSk"
						value={selectedPegawai?.tanggalSk ?? ''}
					/></label
				>
				</div>
				<div id="pegawai-form-panel-1" role="tabpanel" aria-labelledby="pegawai-form-tab-1" tabindex="0" class="grid gap-3 sm:grid-cols-2" class:hidden={formActiveTab !== 1}>
				<label class="form-control gap-2"
					><span class="label-text font-medium">Telepon</span><input
						class="input input-bordered w-full"
						name="telepon"
						value={selectedPegawai?.telepon ?? ''}
						placeholder="Contoh: 08..."
					/></label
				>
				<label class="form-control gap-2"
					><span class="label-text font-medium">Email</span><input
						class="input input-bordered w-full"
						type="email"
						name="email"
						value={selectedPegawai?.email ?? ''}
						placeholder="Contoh: guru@sekolah.sch.id"
					/></label
				>
				<label class="form-control gap-2 md:col-span-2"
					><span class="label-text font-medium">Alamat</span><textarea
						class="textarea textarea-bordered min-h-20 w-full"
						name="alamat">{selectedPegawai?.alamat ?? ''}</textarea
					></label
				>
				<label class="form-control gap-2"
					><span class="label-text font-medium">Desa/Kelurahan</span><input
						class="input input-bordered w-full"
						name="desa"
						value={selectedPegawai?.desa ?? ''}
					/></label
				>
				<label class="form-control gap-2"
					><span class="label-text font-medium">Kecamatan</span><input
						class="input input-bordered w-full"
						name="kecamatan"
						value={selectedPegawai?.kecamatan ?? ''}
					/></label
				>
				<label class="form-control gap-2"
					><span class="label-text font-medium">Kabupaten/Kota</span><input
						class="input input-bordered w-full"
						name="kabupaten"
						value={selectedPegawai?.kabupaten ?? ''}
					/></label
				>
				<label class="form-control gap-2"
					><span class="label-text font-medium">Provinsi</span><input
						class="input input-bordered w-full"
						name="provinsi"
						value={selectedPegawai?.provinsi ?? ''}
					/></label
				>
				<label class="form-control gap-2"
					><span class="label-text font-medium">Kode Pos</span><input
						class="input input-bordered w-full"
						name="kodePos"
						value={selectedPegawai?.kodePos ?? ''}
						inputmode="numeric"
					/></label
				>
				</div>
				<div id="pegawai-form-panel-3" role="tabpanel" aria-labelledby="pegawai-form-tab-3" tabindex="0" class="grid gap-3 sm:grid-cols-2" class:hidden={formActiveTab !== 3}>
				<label class="form-control gap-2"
					><span class="label-text font-medium">Nama Kontak</span><input
						class="input input-bordered w-full"
						name="kontakDaruratNama"
						value={selectedPegawai?.kontakDaruratNama ?? ''}
					/></label
				>
				<label class="form-control gap-2"
					><span class="label-text font-medium">Hubungan</span><input
						class="input input-bordered w-full"
						name="kontakDaruratHubungan"
						value={selectedPegawai?.kontakDaruratHubungan ?? ''}
					/></label
				>
				<label class="form-control gap-2"
					><span class="label-text font-medium">Telepon Darurat</span><input
						class="input input-bordered w-full"
						name="kontakDaruratTelepon"
						value={selectedPegawai?.kontakDaruratTelepon ?? ''}
					/></label
				>
				<label class="form-control gap-2 md:col-span-2"
					><span class="label-text font-medium">Catatan</span><textarea
						class="textarea textarea-bordered min-h-24 w-full"
						name="catatan"
						placeholder="Catatan tambahan jika diperlukan"
						>{selectedPegawai?.catatan ?? ''}</textarea
					></label
				>
				</div>
			</div>
			<div class="border-base-200 mt-4 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t pt-3">
				<button class="btn" type="button" onclick={() => formDialog?.close()}>Batal</button>
				<div class="flex gap-2">
					{#if formActiveTab > 0}
						<button class="btn btn-soft" type="button" onclick={() => (formActiveTab -= 1)}>
							<Icon name="left" /> Sebelumnya
						</button>
					{/if}
					{#if formActiveTab < formTabs.length - 1}
						<button class="btn btn-primary" type="button" onclick={nextFormTab}>
							Selanjutnya <Icon name="right" />
						</button>
					{:else}
						<button class="btn btn-primary" type="submit"><Icon name="save" /> Simpan</button>
					{/if}
				</div>
			</div>
		</form>
	</div>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<dialog class="modal" bind:this={importDialog} onclose={closeImportDialog} aria-labelledby="pegawai-import-title">
	<div class="modal-box w-full p-4" class:max-w-2xl={!importPreview} class:max-w-4xl={!!importPreview}>
		<h3 id="pegawai-import-title" class="text-xl font-bold">Import Data Pegawai</h3>
		<p class="text-base-content/70 mt-1 text-sm">
			Data lama dicocokkan melalui NIP dan NIK. Identitas yang bertentangan harus diperiksa terlebih dahulu.
		</p>
		<div class="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
			<div class="bg-primary text-primary-content rounded-md px-2 py-2 font-semibold">1. Pilih File</div>
			<div class="rounded-md px-2 py-2 font-semibold" class:bg-primary={!!importPreview} class:text-primary-content={!!importPreview} class:bg-base-200={!importPreview}>2. Periksa</div>
			<div class="bg-base-200 rounded-md px-2 py-2 font-semibold">3. Simpan</div>
		</div>
		<form
			bind:this={importForm}
			method="POST"
			action="?/previewImport"
			use:enhance={importEnhance}
			enctype="multipart/form-data"
			class="mt-4 space-y-4"
		>
			<label class="block space-y-2">
				<span class="text-sm font-medium">File pegawai</span>
			<input
				class="file-input file-input-bordered w-full"
				type="file"
				name="file"
				accept=".xlsx,.csv"
				disabled={importBusy}
				onchange={resetImportPreview}
				required
			/>
			</label>
			<p class="text-base-content/55 text-xs">
				XLSX Kaganga atau CSV Guru/Tendik Setara. Maksimal 5 MB dan 2.000 pegawai per file.
			</p>
			{#if importError}
				<div class="alert alert-error alert-soft text-sm">
					<Icon name="warning" />
					{importError}
				</div>
			{/if}
			{#if importPreview}
				<p class="text-base-content/65 text-sm">
					File: <strong>{importPreview.fileName}</strong>
				</p>
				{#if importPreview.sourceFormat?.startsWith('setara-')}
					<div class="alert alert-info alert-soft text-sm" role="status">
						<Icon name="info" />
						<span>CSV {importPreview.sourceFormat === 'setara-guru' ? 'Guru' : 'Tendik'} Setara. Isian kosong tidak menimpa biodata lama. Nama, jenis, jabatan, dan status pegawai lama tetap. Mapel, NRG, RT/RW disimpan pada Catatan; akun dan penugasan tidak diubah.</span>
					</div>
				{/if}
				{#if importPreview.peringatan > 0}
					<div class="alert alert-warning alert-soft text-sm" role="status">
						<Icon name="warning" /><span>{importPreview.peringatan} baris memuat tanggal SK/TMT yang perlu diperiksa. Tanggal sumber tetap dipertahankan.</span>
					</div>
				{/if}
				{#if importPreview.bermasalah > 0 && importPreview.sourceFormat?.startsWith('setara-')}
					<label class="border-warning/40 bg-warning/5 flex items-start gap-3 rounded-md border p-3 text-sm">
						<input type="checkbox" name="skipInvalid" class="checkbox checkbox-sm mt-0.5 shrink-0" bind:checked={skipInvalid} disabled={importBusy} />
						<span>Impor hanya baris valid. {importPreview.bermasalah} baris bermasalah dilewati dan tidak mengubah data lama.</span>
					</label>
				{/if}
				<div class="border-base-200 rounded-md border">
					<div class="border-base-200 grid grid-cols-2 gap-3 border-b p-3 sm:grid-cols-4">
						<div>
							<p class="text-base-content/55 text-xs">Total</p>
							<p class="font-bold">{importPreview.total}</p>
						</div>
						<div>
							<p class="text-base-content/55 text-xs">Data Baru</p>
							<p class="text-success font-bold">{importPreview.baru}</p>
						</div>
						<div>
							<p class="text-base-content/55 text-xs">Diperbarui</p>
							<p class="text-info font-bold">{importPreview.perbarui}</p>
						</div>
						<div>
							<p class="text-base-content/55 text-xs">Bermasalah</p>
							<p class="text-error font-bold">{importPreview.bermasalah}</p>
						</div>
					</div>
					{#if importPreview.legacyFormat}
						<div class="alert alert-info alert-soft m-3 text-sm">
							Format lama terdeteksi. Kolom biodata baru tidak akan dikosongkan.
						</div>
					{/if}
					<div class="max-h-72 overflow-auto">
						<table class="table-sm table min-w-[720px]">
							<thead
								><tr><th>Baris</th><th>Nama</th><th>NIP/NIK</th><th>Jenis</th><th>Status</th><th>Keterangan</th></tr
								></thead
							>
							<tbody>
								{#each importPreview.rows as row (row.rowNumber)}
									<tr>
										<td>{row.rowNumber}</td>
										<td class="font-medium">{row.nama || '-'}</td>
										<td>{row.nip}<div class="text-base-content/55 text-xs">{row.nik || '-'}</div></td>
										<td>{jenisLabels[row.jenis] ?? row.jenis}</td>
										<td
											><span
												class:badge-success={row.action === 'baru'}
												class:badge-info={row.action === 'perbarui'}
												class:badge-error={row.action === 'bermasalah'}
												class="badge badge-soft">{row.action}</span
											></td
										>
										<td class="text-xs">
											{#if row.errors.length}<p class="text-error">{row.errors.join(' ')}</p>{/if}
											{#if row.warnings.length}<p class="text-warning">{row.warnings.join(' ')}</p>{/if}
											{#if !row.errors.length && !row.warnings.length}-{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					{#if importPreview.total > importPreview.rows.length}
						<p class="text-base-content/55 border-base-200 border-t p-3 text-xs">
							Pratinjau menampilkan 100 baris pertama.
						</p>
					{/if}
				</div>
			{/if}
			<div class="modal-action">
				<button
					class="btn btn-soft"
					type="submit"
					formaction="?/previewImport"
					disabled={importBusy}
				>
					{#if importBusy}<span class="loading loading-spinner loading-sm"></span>{:else}<Icon name="eye" />{/if} Periksa Data
				</button>
				<button
					class="btn btn-primary"
					type="submit"
					formaction="?/importExcel"
					disabled={importBusy || !importPreview || (importPreview.bermasalah > 0 && !skipInvalid) || (importPreview.baru + importPreview.perbarui === 0)}
				>
					<Icon name="import" /> Simpan Import
				</button>
				<button class="btn" type="button" disabled={importBusy} onclick={() => importDialog?.close()}>Batal</button>
			</div>
		</form>
	</div>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<style>
	.pegawai-table :global(tbody td) {
		padding-block: 0.625rem;
	}

	.pegawai-form-modal {
		max-height: min(85dvh, 56rem);
		overflow: hidden;
	}

	.pegawai-form label {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 0.375rem;
		font-size: 0.875rem;
	}

	.pegawai-form :is(input:not([type='hidden']), select, textarea) {
		background-color: var(--color-base-200);
	}

	@media (max-width: 639px) {
		.pegawai-form-modal {
			max-height: calc(100dvh - 1rem);
		}
	}
</style>
