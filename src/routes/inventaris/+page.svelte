<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	let { data, form } = $props();
	let assetOpen = $state(false);
	let editing = $state<any>(null);
	const conditionLabel: Record<string, string> = {
		baik: 'Baik',
		rusak_ringan: 'Rusak Ringan',
		rusak_berat: 'Rusak Berat',
		hilang: 'Hilang'
	};
	const conditionTone: Record<string, string> = {
		baik: 'badge-success',
		rusak_ringan: 'badge-warning',
		rusak_berat: 'badge-error',
		hilang: 'badge-neutral'
	};
	const number = new Intl.NumberFormat('id-ID');
	function openAsset(item: any = null) {
		editing = item;
		assetOpen = true;
	}
</script>

<div class="space-y-5">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h2 class="text-2xl font-bold">Inventaris dan Sarana Prasarana</h2>
			<p class="text-base-content/65 text-sm">
				Kelola daftar aset, kondisi, penanggung jawab, lampiran, dan label QR sekolah.
			</p>
		</div>
		{#if data.canManage}<button
				class="btn btn-primary shadow-none"
				type="button"
				onclick={() => openAsset()}><Icon name="plus" /> Tambah Aset</button
			>{/if}
	</header>
	{#if form?.fail}<div class="alert alert-error py-2">{form.fail}</div>{/if}
	{#if form?.message}<div class="alert alert-success py-2">{form.message}</div>{/if}

	<form
			method="GET"
			class="grid gap-2 rounded-lg border border-base-300 bg-base-100 p-3 shadow-sm md:grid-cols-[1fr_190px_180px_auto]"
		>
			<input
				class="input input-bordered"
				name="q"
				value={data.filters.q}
				placeholder="Cari kode, nama, atau lokasi..."
			/>
			<select class="select select-bordered" name="kategori"
				><option value="">Semua kategori</option>{#each data.categories as item}<option
						value={item}
						selected={data.filters.kategori === item}>{item}</option
					>{/each}</select
			>
			<select class="select select-bordered" name="kondisi"
				><option value="">Semua kondisi</option>{#each data.conditions as item}<option
						value={item}
						selected={data.filters.kondisi === item}>{conditionLabel[item]}</option
					>{/each}</select
			>
			<button class="btn btn-soft" type="submit"><Icon name="search" /> Cari</button>
		</form>
		<div class="overflow-x-auto rounded-lg border border-base-300 bg-base-100 shadow-sm">
			<table class="table">
				<thead
					><tr
						><th>Kode dan Aset</th><th>Kategori / Lokasi</th><th>Kondisi</th><th>Jumlah</th><th
							>Penanggung Jawab</th
						><th class="text-right">Aksi</th></tr
					></thead
				><tbody>
					{#each data.assets as item}<tr>
							<td
								><strong>{item.kode}</strong>
								<div>{item.nama}</div>
								{#if item.sumberDana}<div class="text-xs opacity-55">
										{item.sumberDana}{item.tahunPerolehan ? ` · ${item.tahunPerolehan}` : ''}
									</div>{/if}</td
							>
							<td
								>{item.kategori}
								<div class="text-xs opacity-60">{item.lokasi || 'Lokasi belum diisi'}</div></td
							>
							<td
								><span class={`badge badge-sm ${conditionTone[item.kondisi]}`}
									>{conditionLabel[item.kondisi]}</span
								></td
							>
							<td
								><strong>{number.format(item.jumlah - item.jumlahDipinjam)}</strong> tersedia
								<div class="text-xs opacity-60">
									{item.jumlahDipinjam} dipinjam · {item.jumlah}
									{item.satuan}
								</div></td
							>
							<td>{item.penanggungJawab || '-'}</td>
							<td
								><div class="flex justify-end gap-1 whitespace-nowrap">
									<a
										class="btn btn-soft btn-sm"
										href={`/inventaris/label?id=${item.id}`}
										title="Cetak label QR"><Icon name="grid" /></a
									>
									<a
										class="btn btn-soft btn-sm"
										href={`/berkas?type=inventaris&q=${encodeURIComponent(item.kode)}`}
										title={`${item.jumlahBerkas} berkas`}
										><Icon name="database" /> {item.jumlahBerkas}</a
									>
									{#if data.canManage}<button
											class="btn btn-soft btn-sm"
											type="button"
											onclick={() => openAsset(item)}><Icon name="edit" /></button
										>
										<form
											method="POST"
											action="?/delete"
											onsubmit={(event) => {
												if (!confirm(`Hapus aset ${item.nama}?`)) event.preventDefault();
											}}
										>
											<input type="hidden" name="id" value={item.id} /><button
												class="btn btn-error btn-soft btn-sm"
												type="submit"><Icon name="del" /></button
											>
										</form>{/if}
								</div></td
							>
						</tr>{:else}<tr
							><td colspan="6" class="py-12 text-center opacity-60"
								>Belum ada aset pada filter ini.</td
							></tr
						>{/each}
				</tbody>
			</table>
		</div>
	{#if data.page.totalPages > 1}<div class="join flex justify-center">
				{#each Array.from({ length: data.page.totalPages }, (_, i) => i + 1) as page}<a
						class:btn-active={page === data.page.currentPage}
						class="btn join-item btn-sm"
						href={`?q=${encodeURIComponent(data.filters.q)}&kategori=${encodeURIComponent(data.filters.kategori)}&kondisi=${data.filters.kondisi}&page=${page}`}
						>{page}</a
					>{/each}
		</div>{/if}
</div>

{#if assetOpen}<div class="modal modal-open">
		<div class="modal-box max-w-4xl">
			<h3 class="text-xl font-bold">{editing ? 'Ubah Aset' : 'Tambah Aset'}</h3>
			<form
				method="POST"
				action={editing ? '?/update' : '?/create'}
				class="mt-4 grid gap-4 md:grid-cols-2"
			>
				{#if editing}<input type="hidden" name="id" value={editing.id} />{/if}<label
					class="form-control"
					><span class="label-text mb-1">Kode Aset</span><input
						class="input input-bordered"
						name="kode"
						value={editing?.kode ?? ''}
						required
					/></label
				><label class="form-control"
					><span class="label-text mb-1">Nama Aset</span><input
						class="input input-bordered"
						name="nama"
						value={editing?.nama ?? ''}
						required
					/></label
				><label class="form-control"
					><span class="label-text mb-1">Kategori</span><input
						class="input input-bordered"
						name="kategori"
						list="asset-categories"
						value={editing?.kategori ?? ''}
						required
					/><datalist id="asset-categories"
						>{#each data.categories as item}<option value={item}></option>{/each}</datalist
					></label
				><label class="form-control"
					><span class="label-text mb-1">Lokasi</span><input
						class="input input-bordered"
						name="lokasi"
						value={editing?.lokasi ?? ''}
					/></label
				><label class="form-control"
					><span class="label-text mb-1">Kondisi</span><select
						class="select select-bordered"
						name="kondisi"
						>{#each data.conditions as item}<option
								value={item}
								selected={(editing?.kondisi ?? 'baik') === item}>{conditionLabel[item]}</option
							>{/each}</select
					></label
				>
				<div class="grid grid-cols-2 gap-3">
					<label class="form-control"
						><span class="label-text mb-1">Jumlah</span><input
							class="input input-bordered"
							type="number"
							min="1"
							name="jumlah"
							value={editing?.jumlah ?? 1}
							required
						/></label
					><label class="form-control"
						><span class="label-text mb-1">Satuan</span><input
							class="input input-bordered"
							name="satuan"
							value={editing?.satuan ?? 'unit'}
							required
						/></label
					>
				</div>
				<label class="form-control"
					><span class="label-text mb-1">Sumber Dana</span><input
						class="input input-bordered"
						name="sumberDana"
						value={editing?.sumberDana ?? ''}
					/></label
				>
				<div class="grid grid-cols-2 gap-3">
					<label class="form-control"
						><span class="label-text mb-1">Tahun Perolehan</span><input
							class="input input-bordered"
							type="number"
							min="1900"
							max="2100"
							name="tahunPerolehan"
							value={editing?.tahunPerolehan ?? ''}
						/></label
					><label class="form-control"
						><span class="label-text mb-1">Nilai Perolehan</span><input
							class="input input-bordered"
							type="number"
							min="0"
							name="nilaiPerolehan"
							value={editing?.nilaiPerolehan ?? ''}
						/></label
					>
				</div>
				<label class="form-control md:col-span-2"
					><span class="label-text mb-1">Penanggung Jawab</span><select
						class="select select-bordered"
						name="penanggungJawabId"
						><option value="">Belum ditentukan</option>{#each data.employees as item}<option
								value={item.id}
								selected={editing?.penanggungJawabId === item.id}
								>{item.nama} · {item.nip || '-'}</option
							>{/each}</select
					></label
				><label class="form-control md:col-span-2"
					><span class="label-text mb-1">Catatan</span><textarea
						class="textarea textarea-bordered"
						name="catatan"
						rows="3">{editing?.catatan ?? ''}</textarea
					></label
				>
				<div class="modal-action md:col-span-2">
					<button class="btn" type="button" onclick={() => (assetOpen = false)}>Batal</button
					><button class="btn btn-primary" type="submit"><Icon name="save" /> Simpan</button>
				</div>
			</form>
		</div>
		<button class="modal-backdrop" type="button" onclick={() => (assetOpen = false)}>Tutup</button>
	</div>{/if}
