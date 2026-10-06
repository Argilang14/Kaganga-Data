<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	let { data, form } = $props();
	let maintenanceOpen = $state(false);
	const today = new Date().toISOString().slice(0, 10);
	const currency = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
	const conditionLabel: Record<string, string> = { baik: 'Baik', rusak_ringan: 'Rusak Ringan', rusak_berat: 'Rusak Berat', hilang: 'Hilang' };
</script>

<div class="space-y-5">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h2 class="text-2xl font-bold">Perawatan Inventaris</h2>
			<p class="text-base-content/65 text-sm">Simpan riwayat pemeriksaan, perbaikan, biaya, dan kondisi terbaru aset.</p>
		</div>
		{#if data.canManage}<button class="btn btn-primary shadow-none" type="button" onclick={() => (maintenanceOpen = true)}><Icon name="plus" /> Catat Perawatan</button>{/if}
	</header>
	{#if form?.fail}<div class="alert alert-error py-2">{form.fail}</div>{/if}
	{#if form?.message}<div class="alert alert-success py-2">{form.message}</div>{/if}

	<form method="GET" class="grid gap-2 rounded-lg border border-base-300 bg-base-100 p-3 shadow-sm md:grid-cols-[1fr_auto]">
		<input class="input input-bordered" name="q" value={data.filters.q} placeholder="Cari aset atau jenis perawatan..." />
		<button class="btn btn-soft" type="submit"><Icon name="search" /> Cari</button>
	</form>

	<div class="overflow-x-auto rounded-lg border border-base-300 bg-base-100 shadow-sm">
		<table class="table">
			<thead><tr><th>Tanggal</th><th>Aset</th><th>Jenis</th><th>Pelaksana</th><th>Biaya</th><th>Keterangan</th></tr></thead>
			<tbody>
				{#each data.maintenance as item}<tr>
					<td>{item.tanggal}</td>
					<td><strong>{item.kode}</strong><div>{item.namaAset}</div></td>
					<td>{item.jenis}</td><td>{item.pegawai || '-'}</td>
					<td>{item.biaya ? currency.format(item.biaya) : '-'}</td><td>{item.keterangan || '-'}</td>
				</tr>{:else}<tr><td colspan="6" class="py-12 text-center opacity-60">Belum ada riwayat perawatan pada filter ini.</td></tr>{/each}
			</tbody>
		</table>
	</div>
	{#if data.page.totalPages > 1}<div class="join flex justify-center">
		{#each Array.from({ length: data.page.totalPages }, (_, i) => i + 1) as page}<a class:btn-active={page === data.page.currentPage} class="btn join-item btn-sm" href={`?q=${encodeURIComponent(data.filters.q)}&page=${page}`}>{page}</a>{/each}
	</div>{/if}
</div>

{#if maintenanceOpen}<div class="modal modal-open">
	<div class="modal-box">
		<h3 class="text-xl font-bold">Catat Perawatan</h3>
		<form method="POST" action="?/create" class="mt-4 space-y-4">
			<label class="form-control"><span class="label-text mb-1">Aset</span><select class="select select-bordered" name="inventarisId" required><option value="">Pilih aset</option>{#each data.assets as item}<option value={item.id}>{item.kode} · {item.nama}</option>{/each}</select></label>
			<div class="grid grid-cols-2 gap-3">
				<label class="form-control"><span class="label-text mb-1">Tanggal</span><input class="input input-bordered" type="date" name="tanggal" value={today} required /></label>
				<label class="form-control"><span class="label-text mb-1">Jenis</span><input class="input input-bordered" name="jenis" placeholder="Perbaikan / pemeriksaan" required /></label>
			</div>
			<label class="form-control"><span class="label-text mb-1">Pelaksana / Penanggung Jawab</span><select class="select select-bordered" name="pegawaiId"><option value="">Tidak dicatat</option>{#each data.employees as item}<option value={item.id}>{item.nama}</option>{/each}</select></label>
			<div class="grid grid-cols-2 gap-3">
				<label class="form-control"><span class="label-text mb-1">Biaya</span><input class="input input-bordered" type="number" min="0" name="biaya" /></label>
				<label class="form-control"><span class="label-text mb-1">Kondisi Setelah Perawatan</span><select class="select select-bordered" name="kondisi"><option value="">Tidak diubah</option>{#each data.conditions as item}<option value={item}>{conditionLabel[item]}</option>{/each}</select></label>
			</div>
			<label class="form-control"><span class="label-text mb-1">Keterangan</span><textarea class="textarea textarea-bordered" name="keterangan" rows="3"></textarea></label>
			<div class="modal-action"><button class="btn" type="button" onclick={() => (maintenanceOpen = false)}>Batal</button><button class="btn btn-primary" type="submit"><Icon name="save" /> Simpan</button></div>
		</form>
	</div>
	<button class="modal-backdrop" type="button" onclick={() => (maintenanceOpen = false)}>Tutup</button>
</div>{/if}
