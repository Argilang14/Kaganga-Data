<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- halaman memakai link download dan form route lokal */
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Icon from '$lib/components/icon.svelte';
	import { modalRoute } from '$lib/utils';
	import type { SubmitFunction } from '@sveltejs/kit';
	import DetailPegawai from './[id]/+page.svelte';

	type PegawaiRow = {
		id: number;
		nama: string;
		nip: string;
		jenis: string;
		jabatan: string | null;
		status: string;
		telepon: string | null;
		email: string | null;
		catatan: string | null;
	};

	let { data, form } = $props();
	let formDialog: HTMLDialogElement | null = $state(null);
	let importDialog: HTMLDialogElement | null = $state(null);
	let selectedPegawai = $state<PegawaiRow | null>(null);
	let selectedIds = $state<number[]>([]);

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
		lainnya: 'Lainnya'
	};
	const statusLabels: Record<string, string> = { aktif: 'Aktif', nonaktif: 'Nonaktif' };

	function openCreateModal() {
		selectedPegawai = null;
		formDialog?.showModal();
	}

	function openEditModal(pegawai: PegawaiRow) {
		selectedPegawai = pegawai;
		formDialog?.showModal();
	}

	function openEditFromDetail(pegawai: PegawaiRow) {
		history.back();
		selectedPegawai = pegawai;
		setTimeout(() => formDialog?.showModal(), 0);
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
	const importEnhance = preserveScroll({ closeDialog: () => importDialog?.close() });
</script>

<div class="space-y-6">
	<div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h1 class="text-2xl font-bold">Data Pegawai</h1>
			<p class="text-base-content/70 mt-1 max-w-3xl text-sm">
				Kelola kepala sekolah, guru, operator, TU, keamanan, kebersihan, wali asuh, dan wali asrama.
				Data wali kelas/asrama/asuh pada kelas mengambil nama pegawai dari sini.
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<button class="btn btn-primary shadow-none" type="button" onclick={openCreateModal}>
				<Icon name="plus" />
				Tambah Pegawai
			</button>
			<div class="dropdown dropdown-end">
				<button type="button" tabindex="0" class="btn btn-soft shadow-none">
					<Icon name="down" />
					Data Excel
				</button>
				<ul
					tabindex="-1"
					class="dropdown-content menu bg-base-100 rounded-box border-base-300 z-10 mt-2 w-56 border p-2 shadow-lg"
				>
					<li><a href="/api/pegawai/template"><Icon name="download" /> Template Import</a></li>
					<li>
						<button type="button" onclick={() => importDialog?.showModal()}>
							<Icon name="import" /> Import Data
						</button>
					</li>
					<li><a href="/api/pegawai/export"><Icon name="export" /> Export Data</a></li>
				</ul>
			</div>
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

	<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
		<div class="stats bg-base-100 border-base-200 border shadow-sm">
			<div class="stat py-4">
				<div class="stat-title">Total Pegawai</div>
				<div class="stat-value text-2xl">{data.totals.total}</div>
			</div>
		</div>
		<div class="stats bg-base-100 border-base-200 border shadow-sm">
			<div class="stat py-4">
				<div class="stat-title">Aktif</div>
				<div class="stat-value text-success text-2xl">{data.totals.aktif}</div>
			</div>
		</div>
		<div class="stats bg-base-100 border-base-200 border shadow-sm">
			<div class="stat py-4">
				<div class="stat-title">Guru/Kepala</div>
				<div class="stat-value text-primary text-2xl">{data.totals.guru}</div>
			</div>
		</div>
		<div class="stats bg-base-100 border-base-200 border shadow-sm">
			<div class="stat py-4">
				<div class="stat-title">Asrama</div>
				<div class="stat-value text-secondary text-2xl">{data.totals.asrama}</div>
			</div>
		</div>
	</div>

	<form
		method="GET"
		class="bg-base-100 border-base-200 rounded-box grid gap-3 border p-4 lg:grid-cols-[1fr_220px_180px_auto]"
	>
		<label class="form-control gap-1">
			<span class="label-text font-medium">Cari nama atau NIP</span>
			<input
				class="input input-bordered w-full"
				name="q"
				value={data.filter.q}
				placeholder="Contoh: Budi atau 198..."
			/>
		</label>
		<label class="form-control gap-1">
			<span class="label-text font-medium">Jenis</span>
			<select class="select select-bordered w-full" name="jenis">
				<option value="">Semua jenis</option>
				{#each data.options.jenis as jenis (jenis)}
					<option value={jenis} selected={data.filter.jenis === jenis}>{jenisLabels[jenis]}</option>
				{/each}
			</select>
		</label>
		<label class="form-control gap-1">
			<span class="label-text font-medium">Status</span>
			<select class="select select-bordered w-full" name="status">
				<option value="">Semua status</option>
				{#each data.options.status as status (status)}
					<option value={status} selected={data.filter.status === status}
						>{statusLabels[status]}</option
					>
				{/each}
			</select>
		</label>
		<div class="flex items-end gap-2">
			<button class="btn btn-primary flex-1" type="submit"><Icon name="search" /> Filter</button>
			<a href="/pegawai" class="btn btn-soft" title="Reset filter"><Icon name="repeat" /></a>
		</div>
	</form>

	<div class="bg-base-100 dark:bg-base-200 overflow-hidden rounded-md shadow-md dark:shadow-none">
		<div
			class="border-base-200 dark:border-base-300 flex flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-center md:justify-between"
		>
			<div>
				<h2 class="font-semibold">Daftar Pegawai</h2>
				<p class="text-base-content/60 text-sm">
					{pegawaiList.length} data ditampilkan, {selectedIds.length} dipilih
				</p>
			</div>
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
		<div class="overflow-x-auto">
			<table class="border-base-200 table min-w-[880px] border dark:border-none">
				<colgroup>
					<col class="w-16" />
					<col class="w-16" />
					<col class="w-[34%]" />
					<col class="w-[16%]" />
					<col />
					<col class="w-24" />
					<col class="w-36" />
				</colgroup>
				<thead>
					<tr class="bg-base-200 dark:bg-base-300 text-base-content text-left font-bold">
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
						<tr class="hover:bg-base-200/40 h-[72px] transition-colors">
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
								<div class="font-medium">{pegawai.nama}</div>
								<div class="text-base-content/60 mt-0.5 text-xs">NIP {pegawai.nip}</div>
							</td>
							<td>{jenisLabels[pegawai.jenis] ?? pegawai.jenis}</td>
							<td>{pegawai.jabatan || '-'}</td>
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
									<a
										class="btn btn-sm btn-soft pointer-events-auto rounded-r-none shadow-none"
										href="/pegawai/{pegawai.id}"
										use:modalRoute={'detail-pegawai'}
										title="Lihat informasi pegawai"
										aria-label={'Lihat informasi ' + pegawai.nama}
									>
										<Icon name="eye" />
									</a>
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

{#if page.state.modal?.name === 'detail-pegawai'}
	<dialog
		class="modal"
		open
		onclose={() => history.back()}
		onclick={(event) => {
			const rect = event.currentTarget.querySelector('.modal-box')?.getBoundingClientRect();
			if (
				rect &&
				(event.clientX < rect.left ||
					event.clientX > rect.right ||
					event.clientY < rect.top ||
					event.clientY > rect.bottom)
			) {
				event.currentTarget.close();
			}
		}}
	>
		<div class="modal-box w-11/12 max-w-5xl p-5">
			<DetailPegawai data={page.state.modal.data} onEdit={openEditFromDetail} />
		</div>
		<form method="dialog" class="modal-backdrop"><button>Tutup</button></form>
	</dialog>
{/if}

<dialog class="modal" bind:this={formDialog}>
	<div class="modal-box max-w-5xl">
		<h3 class="text-lg font-bold">{selectedPegawai ? 'Edit Pegawai' : 'Tambah Pegawai'}</h3>
		<p class="text-base-content/60 mt-1 text-sm">
			Isi data pokok pegawai. Jika belum punya NIP, boleh isi tanda minus (-).
		</p>
		<form method="POST" action="?/save" use:enhance={saveEnhance} class="mt-5 space-y-4">
			<input type="hidden" name="id" value={selectedPegawai?.id ?? ''} />
			<div class="grid gap-4 md:grid-cols-2">
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
					><span class="label-text font-medium">Jabatan</span><input
						class="input input-bordered w-full"
						name="jabatan"
						value={selectedPegawai?.jabatan ?? ''}
						placeholder="Contoh: Wali Kelas X-A"
					/></label
				>
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
					><span class="label-text font-medium">Catatan</span><textarea
						class="textarea textarea-bordered min-h-24 w-full"
						name="catatan"
						placeholder="Catatan tambahan jika diperlukan"
						>{selectedPegawai?.catatan ?? ''}</textarea
					></label
				>
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
		<h3 class="text-lg font-bold">Import Data Pegawai</h3>
		<p class="text-base-content/70 mt-1 text-sm">
			Gunakan template Excel agar kolom terbaca rapi. NIP yang sama akan memperbarui data lama.
		</p>
		<form
			method="POST"
			action="?/importExcel"
			use:enhance={importEnhance}
			enctype="multipart/form-data"
			class="mt-4 space-y-4"
		>
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
