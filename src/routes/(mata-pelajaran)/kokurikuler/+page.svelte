<script lang="ts">
	import { deserialize } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '$lib/components/icon.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import KokurikulerFormModal from '$lib/components/kokurikuler/form-modal.svelte';
	import KokurikulerDeleteModal from '$lib/components/kokurikuler/delete-modal.svelte';
	import {
		profilPelajarPancasilaDimensionLabelByKey,
		profilPelajarPancasilaDimensions,
		type DimensiProfilLulusanKey
	} from '$lib/statics';

	let {
		data
	}: {
		data: {
			kelasId: number | null;
			kokurikuler: Array<Kokurikuler & { dimensi: DimensiProfilLulusanKey[] }>;
			dimensiPilihan: typeof profilPelajarPancasilaDimensions;
			tableReady: boolean;
		};
	} = $props();

	let selectedIds = $state<number[]>([]);
	let selectedDimensions = $state<DimensiProfilLulusanKey[]>([]);
	let selectAllCheckbox: HTMLInputElement | null = null;
	let lastTableReady = $state<boolean | null>(null);
	let modalState = $state<
		| { mode: 'add' }
		| { mode: 'edit'; item: Kokurikuler & { dimensi: DimensiProfilLulusanKey[] } }
		| null
	>(null);
	let deleteDialogState = $state<
		| { source: 'bulk'; ids: number[] }
		| {
				source: 'single';
				ids: number[];
				item: Kokurikuler & { dimensi: DimensiProfilLulusanKey[] };
		  }
		| null
	>(null);
	let kodeInput = $state('');
	let tujuanInput = $state('');
	let importDialog: HTMLDialogElement;
	let importFile = $state<File | null>(null);
	let importPreview = $state<Array<{ baris: number; kode: string; dimensi: string[]; kegiatan: string; masalah: string | null }>>([]);
	let importBusy = $state(false);
	const readyCount = $derived(importPreview.filter((row) => !row.masalah).length);

	async function submitImport(action: 'preview_import' | 'import_kokurikuler') {
		if (!importFile || importBusy) return;
		importBusy = true;
		try {
			const form = new FormData();
			form.set('file', importFile);
			const response = await fetch(`?/` + action, { method: 'POST', body: form });
			const result = deserialize(await response.text());
			const data = ('data' in result ? result.data : {}) as { fail?: string; message?: string; preview?: typeof importPreview };
			if (result.type !== 'success') {
				toast({ message: data?.fail ?? 'Excel tidak dapat diproses.', type: 'error' });
				return;
			}
			if (action === 'preview_import') importPreview = data.preview ?? [];
			else {
				importDialog.close();
				importFile = null;
				importPreview = [];
				await invalidate('app:kokurikuler');
			}
			toast({ message: data.message ?? 'Selesai.', type: 'success' });
		} catch {
			toast({ message: 'Gagal memproses Excel.', type: 'error' });
		} finally {
			importBusy = false;
		}
	}

	const labelByKey = profilPelajarPancasilaDimensionLabelByKey;

	const totalData = $derived.by(() => data.kokurikuler.length);
	const kelasAktifLabel = $derived.by(() => {
		const kelas = page.data.kelasAktif ?? null;
		if (!kelas) return null;
		return kelas.fase ? `${kelas.nama} - ${kelas.fase}` : kelas.nama;
	});
	const anySelected = $derived.by(() => selectedIds.length > 0);
	const allSelected = $derived.by(() => totalData > 0 && selectedIds.length === totalData);
	const canManage = $derived.by(() => data.tableReady && !!data.kelasId);
	// Restrict editing for wali_asuh and user (guru mapel)
	const canEdit = $derived.by(() => {
		const u = page.data.user as { type?: string } | null | undefined;
		return u?.type !== 'wali_asuh' && u?.type !== 'user';
	});
	const dimensionOptions = $derived.by(() => [...data.dimensiPilihan]);
	const isModalOpen = $derived.by(() => modalState !== null);
	const isEditMode = $derived.by(() => modalState?.mode === 'edit');
	const modalItem = $derived.by(() => (modalState?.mode === 'edit' ? modalState.item : null));
	const modalTitle = $derived.by(() => (isEditMode ? 'Edit Kokurikuler' : 'Tambah Kokurikuler'));
	const modalAction = $derived.by(() => (isEditMode ? '?/update' : '?/add'));
	const bulkDeleteDisabled = $derived.by(() => !anySelected || !canManage);
	const isDeleteModalOpen = $derived.by(() => deleteDialogState !== null);
	const deleteModalTitle = $derived.by(() => {
		if (!deleteDialogState) return 'Hapus Kokurikuler';
		return deleteDialogState.source === 'bulk'
			? `Hapus ${deleteDialogState.ids.length} Kokurikuler`
			: 'Hapus Kokurikuler';
	});
	const deleteModalItem = $derived.by(() =>
		deleteDialogState?.source === 'single' ? deleteDialogState.item : null
	);
	const deleteModalIds = $derived.by(() => deleteDialogState?.ids ?? []);
	const deleteModalDisabled = $derived.by(() => deleteModalIds.length === 0 || !canManage);
	const deleteModalMode = $derived.by(() =>
		deleteDialogState?.source === 'single' ? 'single' : 'bulk'
	);

	$effect(() => {
		if (selectAllCheckbox) {
			selectAllCheckbox.indeterminate = selectedIds.length > 0 && selectedIds.length < totalData;
		}
	});

	$effect(() => {
		if (selectedIds.length === 0) return;
		const existingIds = new Set(data.kokurikuler.map((item) => item.id));
		const filtered = selectedIds.filter((id) => existingIds.has(id));
		if (filtered.length !== selectedIds.length) {
			selectedIds = filtered;
		}
	});

	$effect(() => {
		const tableReady = data.tableReady ?? false;
		if (lastTableReady === tableReady) return;
		lastTableReady = tableReady;

		if (!tableReady) {
			if (selectedIds.length) selectedIds = [];
			if (selectedDimensions.length) selectedDimensions = [];
			if (kodeInput) kodeInput = '';
			if (tujuanInput) tujuanInput = '';
			if (modalState) modalState = null;
			if (deleteDialogState) deleteDialogState = null;
		}
	});

	function toggleRowSelection(id: number, checked: boolean) {
		selectedIds = checked
			? [...new Set([...selectedIds, id])]
			: selectedIds.filter((selectedId) => selectedId !== id);
	}

	function handleSelectAll(checked: boolean) {
		selectedIds = checked ? data.kokurikuler.map((item) => item.id) : [];
	}

	function openAddModal() {
		if (!canManage) return;
		if (selectedDimensions.length) selectedDimensions = [];
		kodeInput = '';
		tujuanInput = '';
		modalState = { mode: 'add' };
	}

	function openEditModal(item: Kokurikuler & { dimensi: DimensiProfilLulusanKey[] }) {
		if (!canManage) return;
		selectedDimensions = [...item.dimensi];
		kodeInput = item.kode;
		tujuanInput = item.tujuan;
		modalState = { mode: 'edit', item };
	}

	function openBulkDeleteModal() {
		if (!canManage) return;
		if (!selectedIds.length) return;
		deleteDialogState = { source: 'bulk', ids: [...selectedIds] };
	}

	function openSingleDeleteModal(item: Kokurikuler & { dimensi: DimensiProfilLulusanKey[] }) {
		if (!canManage) return;
		deleteDialogState = { source: 'single', ids: [item.id], item };
	}

	function closeModal() {
		if (modalState === null && !selectedDimensions.length && !kodeInput && !tujuanInput) return;
		modalState = null;
		if (selectedDimensions.length) selectedDimensions = [];
		if (kodeInput) kodeInput = '';
		if (tujuanInput) tujuanInput = '';
	}

	function closeDeleteModal() {
		if (!deleteDialogState) return;
		deleteDialogState = null;
	}

	function toggleDimension(dimension: DimensiProfilLulusanKey, checked: boolean) {
		selectedDimensions = checked
			? [...new Set([...selectedDimensions, dimension])]
			: selectedDimensions.filter((existing) => existing !== dimension);
	}

	function handleKodeChange(value: string) {
		kodeInput = value;
	}

	function handleTujuanChange(value: string) {
		tujuanInput = value;
	}
</script>

<dialog bind:this={importDialog} class="modal" onclose={() => { importFile = null; importPreview = []; }}>
	<div class="modal-box max-w-3xl rounded-lg">
		<h3 class="text-lg font-semibold">Impor Kokurikuler</h3>
		<input class="file-input mt-4 w-full" type="file" accept=".xlsx" aria-label="File Excel kokurikuler" onchange={(event) => {
			importFile = event.currentTarget.files?.[0] ?? null;
			importPreview = [];
		}} />
		<p class="text-base-content/60 mt-2 text-sm">Maksimal 2 MB, 500 baris. Kolom: Kode, Dimensi, Kegiatan.</p>
		{#if importPreview.length}
			<p class="mt-4 text-sm font-medium">{readyCount} siap diimpor, {importPreview.length - readyCount} dilewati</p>
			<div class="mt-2 max-h-72 overflow-auto border border-base-300">
				<table class="table table-sm min-w-[620px]">
					<thead><tr><th>Baris</th><th>Kode</th><th>Dimensi</th><th>Kegiatan</th><th>Status</th></tr></thead>
					<tbody>{#each importPreview as row}
						<tr><td>{row.baris}</td><td>{row.kode}</td><td>{row.dimensi.join(', ')}</td><td>{row.kegiatan}</td><td>{row.masalah ?? 'Siap'}</td></tr>
					{/each}</tbody>
				</table>
			</div>
		{/if}
		<div class="modal-action">
			<button type="button" class="btn btn-soft" onclick={() => importDialog.close()}>Batal</button>
			<button type="button" class="btn btn-soft" disabled={!importFile || importBusy} onclick={() => submitImport('preview_import')}><Icon name="search" /> Pratinjau</button>
			<button type="button" class="btn btn-primary" disabled={!readyCount || importBusy} onclick={() => submitImport('import_kokurikuler')}><Icon name="import" /> Simpan {readyCount}</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop"><button aria-label="Tutup">Tutup</button></form>
</dialog>

<KokurikulerFormModal
	open={isModalOpen}
	title={modalTitle}
	action={modalAction}
	kelasId={data.kelasId}
	tableReady={data.tableReady}
	{canManage}
	{isEditMode}
	{modalItem}
	{dimensionOptions}
	{selectedDimensions}
	onToggleDimension={toggleDimension}
	{kodeInput}
	onKodeChange={handleKodeChange}
	{tujuanInput}
	onTujuanChange={handleTujuanChange}
	onClose={closeModal}
	onSuccess={({ form }) => {
		form.reset();
		selectedDimensions = [];
		kodeInput = '';
		tujuanInput = '';
		closeModal();
		invalidate('app:kokurikuler');
	}}
/>

<KokurikulerDeleteModal
	open={isDeleteModalOpen}
	title={deleteModalTitle}
	action="?/delete"
	ids={deleteModalIds}
	mode={deleteModalMode}
	item={deleteModalItem}
	{canManage}
	disabled={deleteModalDisabled}
	onClose={closeDeleteModal}
	onSuccess={() => {
		const ids = deleteDialogState?.ids ?? [];
		if (ids.length) {
			selectedIds = selectedIds.filter((selectedId) => !ids.includes(selectedId));
		}
		closeDeleteModal();
		invalidate('app:kokurikuler');
	}}
/>

<div class="card bg-base-100 rounded-lg border border-none p-4 shadow-md">
	<div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<h2 class="text-xl font-bold">Daftar Kokurikuler</h2>
			{#if kelasAktifLabel}
				<p class="text-base-content/70 text-sm">Kelas aktif: {kelasAktifLabel}</p>
			{:else}
				<p class="text-base-content/60 text-sm">
					Pilih kelas di navbar untuk melihat mata pelajaran intrakurikuler.
				</p>
			{/if}
		</div>
		<div class="flex flex-col gap-2 sm:flex-row">
			<details class="dropdown dropdown-end" class:opacity-50={!canManage || !canEdit}>
				<summary class="btn btn-soft" aria-label="Data Excel kokurikuler" title="Data Excel kokurikuler"><Icon name="download" /> Excel <Icon name="down" /></summary>
				<ul class="dropdown-content menu bg-base-100 z-20 mt-1 w-48 rounded-md border border-base-300 p-1 shadow-lg">
					<li><a href="/kokurikuler/excel?template" class:pointer-events-none={!canManage || !canEdit} aria-disabled={!canManage || !canEdit}><Icon name="download" /> Template</a></li>
					<li><button type="button" disabled={!canManage || !canEdit} onclick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); importDialog.showModal(); }}><Icon name="import" /> Impor</button></li>
					<li><a href="/kokurikuler/excel" class:pointer-events-none={!canManage || !canEdit} aria-disabled={!canManage || !canEdit}><Icon name="export" /> Ekspor</a></li>
				</ul>
			</details>
			{#if anySelected}
				<button
					type="button"
					class={`btn w-full shadow-none sm:w-fit ${bulkDeleteDisabled || !canEdit ? '' : 'btn-soft btn-error'}`}
					disabled={bulkDeleteDisabled || !canEdit}
					onclick={openBulkDeleteModal}
					title={!canEdit ? 'Anda tidak memiliki izin untuk menghapus' : ''}
				>
					<Icon name="del" />
					Hapus
				</button>
			{:else}
				<button
					class="btn btn-soft shadow-none"
					disabled={!canManage || !canEdit}
					onclick={openAddModal}
					title={!canEdit ? 'Anda tidak memiliki izin untuk menambah' : ''}
				>
					<Icon name="plus" />
					Tambah
				</button>
			{/if}
		</div>
	</div>

	{#if !data.kelasId}
		<div
			class="alert border-warning/60 bg-warning/10 text-warning-content mt-6 border border-dashed"
		>
			<Icon name="info" />
			<span>Silakan pilih kelas di navbar sebelum menambah kokurikuler.</span>
		</div>
	{/if}

	{#if !data.tableReady}
		<div class="alert border-error/60 bg-error/10 text-error-content mt-4 border border-dashed">
			<Icon name="warning" />
			<span>
				Database kokurikuler belum siap. Jalankan <code>pnpm db:push</code> untuk menerapkan migrasi terbaru.
			</span>
		</div>
	{/if}

	<div
		class="bg-base-100 dark:bg-base-200 mt-4 overflow-x-auto rounded-md shadow-md dark:shadow-none"
	>
		<table class="border-base-200 table min-w-[720px] border dark:border-none">
			<thead>
				<tr class="bg-base-200 dark:bg-base-300 text-left font-bold">
					<th style="width: 50px; min-width: 40px;">
						<input
							type="checkbox"
							class="checkbox"
							bind:this={selectAllCheckbox}
							disabled={!data.kokurikuler.length || !data.tableReady}
							checked={allSelected}
							onchange={(event) => handleSelectAll(event.currentTarget.checked)}
						/>
					</th>
					<th style="width: 60px;">No</th>
					<th style="width: 100px; min-width: 80px;">Kode</th>
					<th style="min-width: 200px;">8 DPL</th>
					<th class="w-full" style="min-width: 260px;">Kegiatan Kokurikuler</th>
					<th style="width: 140px; min-width: 120px;">Aksi</th>
				</tr>
			</thead>
			<tbody>
				{#each data.kokurikuler as item, index (item.id)}
					<tr>
						<td class="align-top">
							<input
								type="checkbox"
								class="checkbox"
								checked={selectedIds.includes(item.id)}
								disabled={!data.tableReady}
								onchange={(event) => toggleRowSelection(item.id, event.currentTarget.checked)}
							/>
						</td>
						<td class="align-top">{index + 1}</td>
						<td class="align-top font-mono text-sm">{item.kode}</td>
						<td class="align-top">
							{#if item.dimensi.length}
								{item.dimensi
									.map((key) => labelByKey[key as DimensiProfilLulusanKey] ?? key)
									.join(', ')}
							{:else}
								<span class="italic opacity-60">Belum ada dimensi</span>
							{/if}
						</td>
						<td class="align-top">{item.tujuan}</td>
						<td class="flex items-center justify-end">
							<button
								class="btn btn-sm btn-soft rounded-r-none shadow-none"
								type="button"
								title={!canEdit ? 'Anda tidak memiliki izin untuk mengedit' : 'Edit kokurikuler'}
								aria-label="Edit kokurikuler"
								disabled={!canManage || !canEdit}
								onclick={() => openEditModal(item)}
							>
								<Icon name="edit" />
							</button>
							<button
								class="btn btn-sm btn-soft btn-error rounded-l-none shadow-none"
								type="button"
								title={!canEdit ? 'Anda tidak memiliki izin untuk menghapus' : 'Hapus kokurikuler'}
								aria-label="Hapus kokurikuler"
								disabled={!canManage || !canEdit}
								onclick={() => openSingleDeleteModal(item)}
							>
								<Icon name="del" />
							</button>
						</td>
					</tr>
				{:else}
					<tr>
						<td class="py-6 text-center italic opacity-60" colspan="6">
							Belum ada data kokurikuler
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
