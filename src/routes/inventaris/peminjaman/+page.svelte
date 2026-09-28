<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	let { data, form } = $props();
	let borrowOpen = $state(false);
	let returnLoan = $state<any>(null);
	let selectedAssetId = $state('');
	const today = new Date().toISOString().slice(0, 10);
	const selectedAsset = $derived(data.assets.find((item) => item.id === Number(selectedAssetId)));
</script>

<div class="space-y-5">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h2 class="text-2xl font-bold">Peminjaman Inventaris</h2>
			<p class="text-base-content/65 text-sm">Catat peminjaman, stok tersedia, dan pengembalian aset sekolah.</p>
		</div>
		{#if data.canManage}<button class="btn btn-primary shadow-none" type="button" onclick={() => (borrowOpen = true)}><Icon name="plus" /> Catat Peminjaman</button>{/if}
	</header>
	{#if form?.fail}<div class="alert alert-error py-2">{form.fail}</div>{/if}
	{#if form?.message}<div class="alert alert-success py-2">{form.message}</div>{/if}

	<form method="GET" class="grid gap-2 rounded-lg border border-base-300 bg-base-100 p-3 shadow-sm md:grid-cols-[1fr_190px_auto]">
		<input class="input input-bordered" name="q" value={data.filters.q} placeholder="Cari aset atau peminjam..." />
		<select class="select select-bordered" name="status">
			<option value="">Semua status</option>
			<option value="dipinjam" selected={data.filters.status === 'dipinjam'}>Sedang dipinjam</option>
			<option value="dikembalikan" selected={data.filters.status === 'dikembalikan'}>Sudah dikembalikan</option>
		</select>
		<button class="btn btn-soft" type="submit"><Icon name="search" /> Cari</button>
	</form>

	<div class="overflow-x-auto rounded-lg border border-base-300 bg-base-100 shadow-sm">
		<table class="table">
			<thead><tr><th>Aset</th><th>Peminjam</th><th>Jumlah</th><th>Tanggal</th><th>Status</th><th class="text-right">Aksi</th></tr></thead>
			<tbody>
				{#each data.loans as item}<tr>
					<td><strong>{item.kode}</strong><div>{item.namaAset}</div></td>
					<td>{item.peminjamNama}</td>
					<td>{item.jumlah} {item.satuan}</td>
					<td>{item.tanggalPinjam}<div class="text-xs opacity-60">{item.status === 'dipinjam' ? `Rencana: ${item.rencanaKembali || '-'}` : `Kembali: ${item.tanggalKembali || '-'}`}</div></td>
					<td><span class:badge-warning={item.status === 'dipinjam'} class:badge-success={item.status === 'dikembalikan'} class="badge badge-sm">{item.status === 'dipinjam' ? 'Dipinjam' : 'Dikembalikan'}</span></td>
					<td class="text-right">{#if item.status === 'dipinjam' && data.canManage}<button class="btn btn-primary btn-soft btn-sm" type="button" onclick={() => (returnLoan = item)}><Icon name="check" /> Kembalikan</button>{/if}</td>
				</tr>{:else}<tr><td colspan="6" class="py-12 text-center opacity-60">Belum ada riwayat peminjaman pada filter ini.</td></tr>{/each}
			</tbody>
		</table>
	</div>
	{#if data.page.totalPages > 1}<div class="join flex justify-center">
		{#each Array.from({ length: data.page.totalPages }, (_, i) => i + 1) as page}<a class:btn-active={page === data.page.currentPage} class="btn join-item btn-sm" href={`?q=${encodeURIComponent(data.filters.q)}&status=${data.filters.status}&page=${page}`}>{page}</a>{/each}
	</div>{/if}
</div>

{#if borrowOpen}<div class="modal modal-open">
	<div class="modal-box">
		<h3 class="text-xl font-bold">Catat Peminjaman</h3>
		<form method="POST" action="?/borrow" class="mt-4 space-y-4">
			<label class="form-control"><span class="label-text mb-1">Aset</span><select class="select select-bordered" name="inventarisId" bind:value={selectedAssetId} required><option value="">Pilih aset</option>{#each data.assets as item}<option value={item.id} disabled={item.jumlah <= item.jumlahDipinjam}>{item.kode} · {item.nama} ({item.jumlah - item.jumlahDipinjam} {item.satuan} tersedia)</option>{/each}</select></label>
			{#if selectedAsset}<div class="rounded-md bg-base-200 px-3 py-2 text-sm">Tersedia: <strong>{selectedAsset.jumlah - selectedAsset.jumlahDipinjam} {selectedAsset.satuan}</strong></div>{/if}
			<label class="form-control"><span class="label-text mb-1">Pegawai Peminjam</span><select class="select select-bordered" name="peminjamPegawaiId"><option value="">Peminjam lain</option>{#each data.employees as item}<option value={item.id}>{item.nama}</option>{/each}</select></label>
			<label class="form-control"><span class="label-text mb-1">Nama Peminjam jika bukan pegawai</span><input class="input input-bordered" name="peminjamNama" /></label>
			<div class="grid grid-cols-2 gap-3">
				<label class="form-control"><span class="label-text mb-1">Jumlah</span><input class="input input-bordered" type="number" min="1" max={selectedAsset ? selectedAsset.jumlah - selectedAsset.jumlahDipinjam : undefined} name="jumlah" value="1" required /></label>
				<label class="form-control"><span class="label-text mb-1">Tanggal Pinjam</span><input class="input input-bordered" type="date" name="tanggalPinjam" value={today} required /></label>
			</div>
			<label class="form-control"><span class="label-text mb-1">Rencana Kembali</span><input class="input input-bordered" type="date" name="rencanaKembali" /></label>
			<label class="form-control"><span class="label-text mb-1">Catatan</span><textarea class="textarea textarea-bordered" name="catatan" rows="2"></textarea></label>
			<div class="modal-action"><button class="btn" type="button" onclick={() => (borrowOpen = false)}>Batal</button><button class="btn btn-primary" type="submit"><Icon name="save" /> Simpan</button></div>
		</form>
	</div>
	<button class="modal-backdrop" type="button" onclick={() => (borrowOpen = false)}>Tutup</button>
</div>{/if}

{#if returnLoan}<div class="modal modal-open">
	<div class="modal-box">
		<h3 class="text-xl font-bold">Pengembalian Aset</h3>
		<p class="mt-1 text-sm opacity-65">{returnLoan.namaAset} · {returnLoan.peminjamNama}</p>
		<form method="POST" action="?/returnLoan" class="mt-4 space-y-4">
			<input type="hidden" name="id" value={returnLoan.id} />
			<label class="form-control"><span class="label-text mb-1">Tanggal Kembali</span><input class="input input-bordered" type="date" name="tanggalKembali" value={today} required /></label>
			<label class="form-control"><span class="label-text mb-1">Kondisi Saat Kembali</span><input class="input input-bordered" name="kondisiKembali" placeholder="Contoh: baik dan lengkap" /></label>
			<div class="modal-action"><button class="btn" type="button" onclick={() => (returnLoan = null)}>Batal</button><button class="btn btn-primary" type="submit"><Icon name="check" /> Kembalikan</button></div>
		</form>
	</div>
	<button class="modal-backdrop" type="button" onclick={() => (returnLoan = null)}>Tutup</button>
</div>{/if}
