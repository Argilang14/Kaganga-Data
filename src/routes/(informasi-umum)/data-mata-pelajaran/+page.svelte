<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- halaman memakai query filter lokal */
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/icon.svelte';

	type JenjangOption = 'semua' | 'srd' | 'srmp' | 'srma';
	type KategoriOption = 'semua' | 'akademik' | 'kokurikuler' | 'keasramaan' | 'muatan_lokal';
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

<div class="space-y-5">
	<div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h1 class="text-2xl font-bold">Data Mata Pelajaran</h1>
			<p class="text-base-content/70 mt-1 max-w-3xl text-sm">
				Master mapel umum lintas kelas. Kelas dan jadwal mengambil data dari sini agar mapel tidak
				dobel per kelas.
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<button class="btn btn-primary shadow-none" type="button" onclick={openCreateModal}>
				<Icon name="plus" />
				Tambah Mata Pelajaran
			</button>
			<div class="dropdown dropdown-end">
				<button type="button" tabindex="0" class="btn btn-soft shadow-none">
					<Icon name="down" /> Data Excel
				</button>
				<ul
					tabindex="-1"
					class="dropdown-content menu bg-base-100 rounded-box border-base-300 z-10 mt-2 w-60 border p-2 shadow-lg"
				>
					<li>
						<a href="/api/jadwal/mapel/template"><Icon name="download" /> Template Import</a>
					</li>
					<li>
						<button type="button" onclick={() => importDialog?.showModal()}>
							<Icon name="import" /> Import Data
						</button>
					</li>
					<li><a href="/api/jadwal/mapel/export"><Icon name="export" /> Export Data</a></li>
				</ul>
			</div>
			<a class="btn btn-soft shadow-none" href={resolve('/jadwal/pelajaran')}>
				<Icon name="calendar" /> Jadwal Pelajaran
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
		class="bg-base-100 border-base-200 rounded-box grid gap-3 border p-4 lg:grid-cols-[1fr_180px_200px_auto]"
	>
		<label class="form-control gap-1">
			<span class="label-text font-medium">Cari mapel</span>
			<input
				class="input input-bordered w-full"
				name="q"
				value={data.filter.q}
				placeholder="Kode atau nama mapel"
			/>
		</label>
		<label class="form-control gap-1">
			<span class="label-text font-medium">Jenjang</span>
			<select class="select select-bordered w-full" name="jenjang">
				{#each data.options.jenjang as jenjang (jenjang)}
					<option value={jenjang} selected={data.filter.jenjang === jenjang}
						>{jenjangLabels[jenjang]}</option
					>
				{/each}
			</select>
		</label>
		<label class="form-control gap-1">
			<span class="label-text font-medium">Kategori</span>
			<select class="select select-bordered w-full" name="kategori">
				{#each data.options.kategori as kategori (kategori)}
					<option value={kategori} selected={data.filter.kategori === kategori}
						>{kategoriLabels[kategori]}</option
					>
				{/each}
			</select>
		</label>
		<div class="flex items-end gap-2">
			<button class="btn btn-primary flex-1" type="submit"><Icon name="search" /> Filter</button>
			<a href="/data-mata-pelajaran" class="btn btn-soft" title="Reset filter"
				><Icon name="repeat" /></a
			>
		</div>
	</form>

	<div class="bg-base-100 border-base-200 rounded-box overflow-hidden border shadow-sm">
		<div
			class="border-base-200 flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between"
		>
			<div>
				<h2 class="font-semibold">Daftar Data Mata Pelajaran</h2>
				<p class="text-base-content/60 text-sm">{data.mapelList.length} mapel ditampilkan.</p>
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
		<div class="overflow-x-auto">
			<table class="table-zebra table">
				<thead>
					<tr>
						<th class="w-10"
							><input
								class="checkbox checkbox-sm"
								type="checkbox"
								checked={allRowsSelected}
								onchange={toggleAllSelection}
								aria-label="Pilih semua mapel"
							/></th
						><th>Kode</th><th>Nama</th><th>Jenjang/Fase</th><th>Kategori</th><th>JP/Minggu</th><th
							>Guru</th
						><th>Status</th><th class="text-right">Aksi</th>
					</tr>
				</thead>
				<tbody>
					{#each data.mapelList as mapel (mapel.id)}
						<tr>
							<td
								><input
									class="checkbox checkbox-sm"
									type="checkbox"
									checked={selectedIds.has(mapel.id)}
									onchange={() => toggleSelection(mapel.id)}
									aria-label={`Pilih ${mapel.kode}`}
								/>
							</td>
							<td
								><span class="badge font-bold" style={`background:${mapel.warna ?? '#dbeafe'}`}
									>{mapel.kode}</span
								></td
							>
							<td
								><div class="font-semibold">{mapel.nama}</div>
								<div class="text-base-content/60 text-xs">Dipakai {mapel.totalSlot} slot</div></td
							>
							<td>{jenjangLabels[mapel.jenjang]}{mapel.fase ? ` / ${mapel.fase}` : ''}</td>
							<td><span class="badge badge-soft">{kategoriLabels[mapel.kategori]}</span></td>

							<td><span class="badge badge-outline">{mapel.jpPerMinggu} JP</span></td>
							<td>{mapel.guru?.nama ?? '-'}</td>
							<td
								><span
									class:badge-success={mapel.aktif}
									class:badge-neutral={!mapel.aktif}
									class="badge badge-soft">{mapel.aktif ? 'Aktif' : 'Nonaktif'}</span
								></td
							>
							<td>
								<div class="flex justify-end gap-1">
									<button
										class="btn btn-ghost btn-square btn-xs"
										type="button"
										title="Edit"
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
											class="btn btn-error btn-soft btn-square btn-xs"
											type="submit"
											title="Hapus"><Icon name="del" /></button
										>
									</form>
								</div>
							</td>
						</tr>
					{:else}
						<tr
							><td colspan="9" class="text-base-content/60 py-8 text-center"
								>Belum ada Data Mata Pelajaran.</td
							></tr
						>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>

<dialog class="modal" bind:this={formDialog}>
	<div class="modal-box max-w-4xl">
		<h3 class="text-lg font-bold">{isEdit ? 'Edit Mata Pelajaran' : 'Tambah Mata Pelajaran'}</h3>
		<p class="text-base-content/60 mt-1 text-sm">
			Data ini dipakai ulang oleh jadwal dan Mapel Kelas. Kode mapel menjadi kunci saat import
			Excel.
		</p>
		<form method="POST" action="?/save" class="mt-5 space-y-4">
			<input type="hidden" name="id" value={selectedMapel?.id ?? ''} />
			<div class="grid gap-4 md:grid-cols-2">
				<label class="form-control gap-2">
					<span class="label-text font-medium">Kode Mapel</span>
					<input
						class="input input-bordered w-full uppercase"
						name="kode"
						value={selectedMapel?.kode ?? ''}
						placeholder="Contoh: BIND"
						required
					/>
				</label>
				<label class="form-control gap-2">
					<span class="label-text font-medium">Jenjang</span>
					<select class="select select-bordered w-full" name="jenjang">
						{#each data.options.jenjang as jenjang (jenjang)}
							<option value={jenjang} selected={(selectedMapel?.jenjang ?? 'semua') === jenjang}
								>{jenjangLabels[jenjang]}</option
							>
						{/each}
					</select>
				</label>
				<label class="form-control gap-2">
					<span class="label-text font-medium">Fase</span>
					<input
						class="input input-bordered w-full"
						name="fase"
						value={selectedMapel?.fase ?? ''}
						placeholder="Contoh: Fase E"
					/>
				</label>
				<label class="form-control gap-2">
					<span class="label-text font-medium">Kategori</span>
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
				<label class="form-control gap-2 md:col-span-2">
					<span class="label-text font-medium">Nama Mata Pelajaran</span>
					<input
						class="input input-bordered w-full"
						name="nama"
						value={selectedMapel?.nama ?? ''}
						placeholder="Contoh: Bahasa Indonesia"
						required
					/>
				</label>
				<label class="form-control gap-2">
					<span class="label-text font-medium">JP per Minggu</span>
					<input
						class="input input-bordered w-full"
						name="jpPerMinggu"
						type="number"
						min="0"
						value={selectedMapel?.jpPerMinggu ?? 0}
						placeholder="Contoh: 4"
					/>
				</label>
				<label class="form-control gap-2 md:col-span-2">
					<span class="label-text font-medium">Guru Pemangku Default</span>
					<select class="select select-bordered w-full" name="guruPegawaiId">
						<option value="">Belum ditentukan</option>
						{#each data.guruList as guru (guru.id)}
							<option value={guru.id} selected={selectedMapel?.guruPegawaiId === guru.id}
								>{guru.nama}</option
							>
						{/each}
					</select>
				</label>
				<label class="form-control gap-2">
					<span class="label-text font-medium">Warna</span>
					<input
						class="input input-bordered h-12 w-full"
						name="warna"
						type="color"
						value={selectedMapel?.warna ?? '#dbeafe'}
					/>
				</label>
				<label class="label mt-8 cursor-pointer justify-start gap-3">
					<input
						class="toggle toggle-success"
						type="checkbox"
						name="aktif"
						checked={selectedMapel?.aktif ?? true}
					/>
					<span class="label-text">Aktif</span>
				</label>
				<label class="form-control gap-2 md:col-span-2">
					<span class="label-text font-medium">Catatan</span>
					<textarea
						class="textarea textarea-bordered min-h-24 w-full"
						name="catatan"
						placeholder="Opsional">{selectedMapel?.catatan ?? ''}</textarea
					>
				</label>
			</div>
			<div class="modal-action">
				<button class="btn btn-primary" type="submit"><Icon name="save" /> Simpan</button>
				<button class="btn" type="button" onclick={() => formDialog?.close()}>Batal</button>
			</div>
		</form>
	</div>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<dialog class="modal" bind:this={importDialog}>
	<div class="modal-box max-w-lg">
		<h3 class="text-lg font-bold">Import Data Mata Pelajaran</h3>
		<p class="text-base-content/70 mt-1 text-sm">
			Gunakan template Excel agar kolom terbaca rapi. Kode mapel yang sama akan memperbarui data
			lama.
		</p>
		<form method="POST" action="?/importExcel" enctype="multipart/form-data" class="mt-4 space-y-4">
			<input
				class="file-input file-input-bordered w-full"
				type="file"
				name="file"
				accept=".xlsx"
				required
			/>
			<div class="modal-action">
				<button class="btn btn-primary" type="submit"><Icon name="import" /> Import</button>
				<button class="btn" type="button" onclick={() => importDialog?.close()}>Batal</button>
			</div>
		</form>
	</div>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
