<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- halaman memakai query filter lokal */
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/icon.svelte';

	type JenjangOption = 'semua' | 'srd' | 'srmp' | 'srma';
	type KategoriOption =
		'semua' | 'masa_persiapan' | 'akademik' | 'kokurikuler' | 'keasramaan' | 'muatan_lokal';
	type KategoriValue = Exclude<KategoriOption, 'semua'>;
	type GuruRow = { id: number; nama: string; nip: string; jenis: string; status: string };
	type MapelRow = {
		id: number;
		kode: string;
		nama: string;
		jenjang: JenjangOption;
		fase: string | null;
		kategori: KategoriValue;
		guruPegawaiId: number | null;
		warna: string | null;
		aktif: boolean;
		catatan: string | null;
		jpPerMinggu: number;
		guru: { id: number; nama: string; nip: string } | null;
		totalSlot: number;
	};
	type PageData = {
		filter: { q: string; jenjang: JenjangOption; kategori: KategoriOption };
		options: { jenjang: readonly JenjangOption[]; kategori: readonly KategoriOption[] };
		mapelList: MapelRow[];
		guruList: GuruRow[];
		editMapel: MapelRow | null;
	};

	let { data, form }: { data: PageData; form?: { fail?: string; message?: string } } = $props();
	let formDialog = $state<HTMLDialogElement | null>(null);
	let importDialog = $state<HTMLDialogElement | null>(null);
	let selectedMapel = $state<MapelRow | null>(null);
	let selectedIds = $state<Set<number>>(new Set());
	let openedInitialEdit = $state(false);
	const isEdit = $derived(Boolean(selectedMapel));
	const failMessage = $derived(typeof form?.fail === 'string' ? form.fail : '');
	const successMessage = $derived(typeof form?.message === 'string' ? form.message : '');
	const selectedCount = $derived(selectedIds.size);
	const allRowsSelected = $derived(
		data.mapelList.length > 0 && data.mapelList.every((mapel) => selectedIds.has(mapel.id))
	);
	const jenjangLabels: Record<JenjangOption, string> = {
		semua: 'Semua Jenjang',
		srd: 'SRD',
		srmp: 'SRMP',
		srma: 'SRMA'
	};
	const kategoriLabels: Record<KategoriOption, string> = {
		semua: 'Semua Kategori',
		masa_persiapan: 'Masa Persiapan',
		akademik: 'Akademik',
		kokurikuler: 'Kokurikuler',
		keasramaan: 'Keasramaan',
		muatan_lokal: 'Muatan Lokal'
	};

	$effect(() => {
		if (!openedInitialEdit && data.editMapel && formDialog) {
			selectedMapel = data.editMapel;
			formDialog.showModal();
			openedInitialEdit = true;
		}
	});

	function openCreateModal() {
		selectedMapel = null;
		formDialog?.showModal();
	}

	function openEditModal(mapel: MapelRow) {
		selectedMapel = mapel;
		formDialog?.showModal();
	}

	function confirmDelete(mapel: MapelRow) {
		return confirm(`Hapus mata pelajaran ${mapel.kode} - ${mapel.nama}?`);
	}

	function toggleSelection(id: number) {
		const next = new Set(selectedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedIds = next;
	}

	function toggleAllSelection() {
		selectedIds = allRowsSelected ? new Set() : new Set(data.mapelList.map((mapel) => mapel.id));
	}

	function confirmBulkDelete(event: SubmitEvent) {
		if (!selectedIds.size || !confirm(`Hapus ${selectedIds.size} mata pelajaran terpilih?`)) {
			event.preventDefault();
		}
	}
</script>

<div class="mapel-page bg-base-100 space-y-4 rounded-lg p-4 shadow-md">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
		<div>
			<h1 class="text-xl font-bold">Data Mata Pelajaran</h1>
			<p class="text-base-content/70 text-sm">{data.mapelList.length} mata pelajaran</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<details class="dropdown dropdown-start lg:dropdown-end">
				<summary class="btn btn-soft shadow-none" aria-label="Data Excel mata pelajaran">
					<Icon name="download" /> Excel <Icon name="down" />
				</summary>
				<ul
					class="dropdown-content menu bg-base-100 border-base-300 z-20 mt-1 w-48 rounded-md border p-1 shadow-lg"
				>
					<li>
						<a href="/api/jadwal/mapel/template"><Icon name="download" /> Template Import</a>
					</li>
					<li>
						<button
							type="button"
							onclick={(event) => {
								event.currentTarget.closest('details')?.removeAttribute('open');
								importDialog?.showModal();
							}}
						>
							<Icon name="import" /> Import Data
						</button>
					</li>
					<li><a href="/api/jadwal/mapel/export"><Icon name="export" /> Export Data</a></li>
				</ul>
			</details>
			<button class="btn btn-soft shadow-none" type="button" onclick={openCreateModal}>
				<Icon name="plus" />
				Tambah Mapel
			</button>
			<a class="btn btn-soft shadow-none" href={resolve('/rapor/jadwal-pelajaran')}>
				<Icon name="calendar" /> Jadwal Pelajaran
			</a>
		</div>
	</header>

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
		class="border-base-200 grid items-end gap-3 border-y py-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_160px_180px_auto]"
	>
		<label class="grid min-w-0 gap-2">
			<span class="text-sm font-medium">Cari mapel</span>
			<input
				class="input input-bordered w-full"
				name="q"
				value={data.filter.q}
				placeholder="Kode atau nama mapel"
			/>
		</label>
		<label class="grid min-w-0 gap-2">
			<span class="text-sm font-medium">Jenjang</span>
			<select class="select select-bordered w-full" name="jenjang">
				{#each data.options.jenjang as jenjang (jenjang)}
					<option value={jenjang} selected={data.filter.jenjang === jenjang}
						>{jenjangLabels[jenjang]}</option
					>
				{/each}
			</select>
		</label>
		<label class="grid min-w-0 gap-2">
			<span class="text-sm font-medium">Kategori</span>
			<select class="select select-bordered w-full" name="kategori">
				{#each data.options.kategori as kategori (kategori)}
					<option value={kategori} selected={data.filter.kategori === kategori}
						>{kategoriLabels[kategori]}</option
					>
				{/each}
			</select>
		</label>
		<div class="flex items-end gap-2">
			<button class="btn btn-soft flex-1 shadow-none" type="submit"
				><Icon name="search" /> Filter</button
			>
			<a
				href="/data-mata-pelajaran"
				class="btn btn-soft btn-square shadow-none"
				title="Reset filter"
				aria-label="Reset filter"><Icon name="repeat" /></a
			>
		</div>
	</form>

	<section aria-labelledby="mapel-table-title" class="space-y-3">
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<h2 id="mapel-table-title" class="text-sm font-semibold">Daftar Mata Pelajaran</h2>
			</div>
			<form
				method="POST"
				action="?/deleteBulk"
				onsubmit={confirmBulkDelete}
				class="flex flex-wrap items-center gap-2"
			>
				{#each Array.from(selectedIds) as id (id)}
					<input type="hidden" name="ids" value={id} />
				{/each}
				<span class="badge badge-soft">{selectedCount} dipilih</span>
				<button
					class="btn btn-error btn-soft btn-sm shadow-none"
					type="submit"
					disabled={!selectedCount}
				>
					<Icon name="del" /> Hapus Terpilih
				</button>
			</form>
		</div>
		<div class="border-base-200 overflow-x-auto rounded-md border shadow-sm">
			<table class="table min-w-[1040px] table-fixed" aria-label="Daftar mata pelajaran">
				<colgroup>
					<col style="width:56px" />
					<col style="width:96px" />
					<col />
					<col style="width:120px" />
					<col style="width:132px" />
					<col style="width:104px" />
					<col style="width:160px" />
					<col style="width:104px" />
					<col style="width:112px" />
				</colgroup>
				<thead>
					<tr class="bg-base-200 text-left font-bold">
						<th scope="col"
							><input
								class="checkbox size-6 shrink-0 rounded-md"
								type="checkbox"
								checked={allRowsSelected}
								onchange={toggleAllSelection}
								aria-label="Pilih semua mapel"
							/></th
						><th scope="col">Kode</th><th scope="col">Nama</th><th scope="col">Jenjang/Fase</th><th
							scope="col">Kategori</th
						><th scope="col">JP/Minggu</th><th scope="col">Guru</th><th scope="col">Status</th><th
							scope="col"
							class="text-right">Aksi</th
						>
					</tr>
				</thead>
				<tbody>
					{#each data.mapelList as mapel (mapel.id)}
						<tr class="hover:bg-base-200/40">
							<td
								><input
									class="checkbox size-6 shrink-0 rounded-md"
									type="checkbox"
									checked={selectedIds.has(mapel.id)}
									onchange={() => toggleSelection(mapel.id)}
									aria-label={`Pilih ${mapel.kode}`}
								/>
							</td>
							<td
								><span class="flex items-start gap-2 font-mono text-sm font-semibold"
									><span
										class="mt-1.5 size-2 shrink-0 rounded-full"
										style={`background:${mapel.warna ?? '#dbeafe'}`}
										aria-hidden="true"
									></span><span class="min-w-0 break-words">{mapel.kode}</span></span
								></td
							>
							<td
								><div class="break-words font-semibold">{mapel.nama}</div>
								<div class="text-base-content/60 text-xs">Dipakai {mapel.totalSlot} slot</div></td
							>
							<td class="break-words"
								>{jenjangLabels[mapel.jenjang]}{mapel.fase ? ` / ${mapel.fase}` : ''}</td
							>
							<td
								><span class="badge badge-soft h-auto min-h-6 whitespace-normal py-1"
									>{kategoriLabels[mapel.kategori]}</span
								></td
							>

							<td><span class="badge badge-outline">{mapel.jpPerMinggu} JP</span></td>
							<td class="break-words">{mapel.guru?.nama ?? '-'}</td>
							<td
								><span
									class:badge-success={mapel.aktif}
									class:badge-neutral={!mapel.aktif}
									class="badge badge-soft">{mapel.aktif ? 'Aktif' : 'Nonaktif'}</span
								></td
							>
							<td>
								<div class="flex justify-end">
									<button
										class="btn btn-soft btn-sm rounded-r-none shadow-none"
										type="button"
										title="Edit"
										aria-label={`Edit ${mapel.kode}`}
										onclick={() => openEditModal(mapel)}><Icon name="edit" /></button
									>
									<form
										method="POST"
										action="?/delete"
										onsubmit={(event) => {
											if (!confirmDelete(mapel)) event.preventDefault();
										}}
									>
										<input type="hidden" name="id" value={mapel.id} />
										<button
											class="btn btn-error btn-soft btn-sm rounded-l-none shadow-none"
											type="submit"
											aria-label={`Hapus ${mapel.kode}`}
											title="Hapus"><Icon name="del" /></button
										>
									</form>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if !data.mapelList.length}
			<p class="text-base-content/60 px-3 py-6 text-center text-sm" role="status">
				{data.filter.q || data.filter.jenjang !== 'semua' || data.filter.kategori !== 'semua'
					? 'Tidak ada mata pelajaran yang sesuai dengan filter.'
					: 'Belum ada data mata pelajaran.'}
			</p>
		{/if}
	</section>
</div>

<dialog class="modal" bind:this={formDialog} aria-labelledby="mapel-form-title">
	<div class="modal-box max-w-2xl">
		<h3 id="mapel-form-title" class="text-lg font-bold">
			{isEdit ? 'Edit Mata Pelajaran' : 'Tambah Mata Pelajaran'}
		</h3>
		<form method="POST" action="?/save" class="mt-5 space-y-4">
			<input type="hidden" name="id" value={selectedMapel?.id ?? ''} />
			<div class="grid gap-4 md:grid-cols-2">
				<label class="grid min-w-0 content-start gap-2">
					<span class="text-sm font-semibold">Kode Mapel</span>
					<input
						class="input input-bordered w-full uppercase"
						name="kode"
						value={selectedMapel?.kode ?? ''}
						placeholder="Contoh: BIND"
						required
					/>
				</label>
				<label class="grid min-w-0 content-start gap-2">
					<span class="text-sm font-semibold">Jenjang</span>
					<select class="select select-bordered w-full" name="jenjang">
						{#each data.options.jenjang as jenjang (jenjang)}
							<option value={jenjang} selected={(selectedMapel?.jenjang ?? 'semua') === jenjang}
								>{jenjangLabels[jenjang]}</option
							>
						{/each}
					</select>
				</label>
				<label class="grid min-w-0 content-start gap-2">
					<span class="text-sm font-semibold">Fase</span>
					<input
						class="input input-bordered w-full"
						name="fase"
						value={selectedMapel?.fase ?? ''}
						placeholder="Contoh: Fase E"
					/>
				</label>
				<label class="grid min-w-0 content-start gap-2">
					<span class="text-sm font-semibold">Kategori</span>
					<select class="select select-bordered w-full" name="kategori">
						{#each data.options.kategori.filter((item) => item !== 'semua') as kategori (kategori)}
							<option
								value={kategori}
								selected={(selectedMapel?.kategori ?? 'akademik') === kategori}
								>{kategoriLabels[kategori]}</option
							>
						{/each}
					</select>
				</label>
				<label class="grid min-w-0 content-start gap-2 md:col-span-2">
					<span class="text-sm font-semibold">Nama Mata Pelajaran</span>
					<input
						class="input input-bordered w-full"
						name="nama"
						value={selectedMapel?.nama ?? ''}
						placeholder="Contoh: Bahasa Indonesia"
						required
					/>
				</label>
				<label class="grid min-w-0 content-start gap-2">
					<span class="text-sm font-semibold">JP per Kelas/Minggu (Default)</span>
					<input
						class="input input-bordered w-full"
						name="jpPerMinggu"
						type="number"
						min="0"
						value={selectedMapel?.jpPerMinggu ?? 0}
						placeholder="Contoh: 4"
					/>
				</label>
				<label class="grid min-w-0 content-start gap-2">
					<span class="text-sm font-semibold">Guru Pemangku Default</span>
					<select class="select select-bordered w-full" name="guruPegawaiId">
						<option value="">Belum ditentukan</option>
						{#each data.guruList as guru (guru.id)}
							<option value={guru.id} selected={selectedMapel?.guruPegawaiId === guru.id}
								>{guru.nama}</option
							>
						{/each}
					</select>
				</label>
				<label class="grid min-w-0 content-start gap-2">
					<span class="text-sm font-semibold">Warna</span>
					<input
						class="input input-bordered h-10 w-full"
						name="warna"
						type="color"
						value={selectedMapel?.warna ?? '#dbeafe'}
					/>
				</label>
				<label class="flex min-h-10 cursor-pointer items-center gap-3 self-end">
					<input
						class="toggle toggle-success"
						type="checkbox"
						name="aktif"
						checked={selectedMapel?.aktif ?? true}
					/>
					<span class="text-sm font-medium">Aktif</span>
				</label>
				<label class="grid min-w-0 content-start gap-2 md:col-span-2">
					<span class="text-sm font-semibold">Catatan</span>
					<textarea
						class="textarea textarea-bordered min-h-24 w-full"
						name="catatan"
						placeholder="Opsional">{selectedMapel?.catatan ?? ''}</textarea
					>
				</label>
			</div>
			<div class="modal-action flex-wrap gap-2">
				<button class="btn btn-soft shadow-none" type="button" onclick={() => formDialog?.close()}
					><Icon name="close" /> Batal</button
				>
				<button class="btn btn-primary shadow-none" type="submit"
					><Icon name="save" /> Simpan</button
				>
			</div>
		</form>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button aria-label="Tutup formulir mata pelajaran">Tutup</button>
	</form>
</dialog>

<dialog
	class="modal"
	bind:this={importDialog}
	aria-labelledby="mapel-import-title"
	aria-describedby="mapel-import-description"
>
	<div class="modal-box max-w-2xl">
		<h3 id="mapel-import-title" class="text-lg font-bold">Import Data Mata Pelajaran</h3>
		<p id="mapel-import-description" class="text-base-content/70 mt-2 text-sm">
			Gunakan template Excel agar kolom terbaca rapi. Kode mapel yang sama akan memperbarui data
			lama. ID guru dapat disalin dari lembar Referensi Guru; warna dapat ditulis sebagai kode hex
			atau diberikan sebagai warna isi sel.
		</p>
		<form method="POST" action="?/importExcel" enctype="multipart/form-data" class="mt-4 space-y-4">
			<label class="grid min-w-0 gap-2">
				<span class="text-sm font-semibold">File Excel</span>
				<input
					class="file-input file-input-bordered w-full"
					type="file"
					name="file"
					accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
					required
				/>
			</label>
			<div class="modal-action flex-wrap gap-2">
				<button class="btn btn-soft shadow-none" type="button" onclick={() => importDialog?.close()}
					><Icon name="close" /> Batal</button
				>
				<button class="btn btn-primary shadow-none" type="submit"
					><Icon name="import" /> Import</button
				>
			</div>
		</form>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button aria-label="Tutup import mata pelajaran">Tutup</button>
	</form>
</dialog>
