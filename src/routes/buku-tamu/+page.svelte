<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- filter and export URLs are server endpoints */
	import Icon from '$lib/components/icon.svelte';
	import { toast } from '$lib/components/toast.svelte';

	let { data, form } = $props();
	let detailDialog: HTMLDialogElement;
	let selected = $state<(typeof data.daftar)[number] | null>(null);

	function formatDate(value: string) {
		return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(
			new Date(value)
		);
	}

	function openDetail(item: (typeof data.daftar)[number]) {
		selected = item;
		requestAnimationFrame(() => detailDialog.showModal());
	}

	async function copyPublicUrl() {
		await navigator.clipboard.writeText(data.publicUrl);
		toast('Tautan publik disalin.', 'success');
	}

	function outputUrl(path: string) {
		const params = new URLSearchParams({
			tanggal_mulai: data.filter.tanggalMulai,
			tanggal_selesai: data.filter.tanggalSelesai
		});
		if (data.filter.q) params.set('q', data.filter.q);
		return `${path}?${params}`;
	}

	function pageUrl(pageNumber: number) {
		const params = new URLSearchParams({
			tanggal_mulai: data.filter.tanggalMulai,
			tanggal_selesai: data.filter.tanggalSelesai
		});
		if (data.filter.q) params.set('q', data.filter.q);
		if (pageNumber > 1) params.set('page', String(pageNumber));
		return `/buku-tamu?${params}`;
	}
</script>

<div class="space-y-5">
	<header class="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
		<div>
			<h1 class="text-2xl font-bold">Buku Tamu Digital</h1>
			<p class="text-base-content/65 mt-1 text-sm">Kelola kunjungan yang tersimpan khusus untuk sekolah aktif.</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<a class="btn btn-soft" href={outputUrl('/api/buku-tamu/export')}><Icon name="export" /> Excel</a>
			<a class="btn btn-primary" href={outputUrl('/api/buku-tamu/print')} target="_blank"><Icon name="print" /> Cetak PDF</a>
		</div>
	</header>

	{#if form?.fail}<div class="alert alert-error py-2"><Icon name="error" /><span>{form.fail}</span></div>{/if}
	{#if form?.message}<div class="alert alert-success py-2"><Icon name="success" /><span>{form.message}</span></div>{/if}

	<section class="border-base-300 bg-base-100 grid gap-4 rounded-lg border p-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
		<div class="min-w-0">
			<span class="mb-1 block text-sm font-medium">Tautan Pengisian Publik</span>
			<div class="join flex w-full"><input class="input input-bordered join-item min-w-0 flex-1" readonly value={data.publicUrl} /><button class="btn btn-soft join-item" type="button" onclick={copyPublicUrl} title="Salin tautan"><Icon name="copy" /></button><a class="btn btn-soft join-item" href={data.publicUrl} target="_blank" title="Buka formulir"><Icon name="eye" /></a></div>
		</div>
		<form method="POST" action="?/rotateToken" onsubmit={(event) => { if (!confirm('Buat tautan baru? Tautan lama langsung tidak berlaku.')) event.preventDefault(); }}><button class="btn btn-soft" type="submit"><Icon name="repeat" /> Ganti Tautan</button></form>
		<div class="xl:col-span-2 border-base-300 flex flex-col gap-3 border-t pt-4 md:flex-row md:items-end">
			<form method="POST" action="?/setPasskey" class="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end">
				<label class="form-control flex-1"><span class="label-text mb-1 font-medium">Passkey Publik</span><input class="input input-bordered w-full" type="password" name="passkey" minlength="4" maxlength="64" placeholder={data.passkeySet ? 'Isi untuk mengganti passkey' : 'Kosong berarti tanpa passkey'} /></label>
				<button class="btn btn-primary" type="submit"><Icon name="key" /> {data.passkeySet ? 'Perbarui' : 'Aktifkan'}</button>
			</form>
			{#if data.passkeySet}<form method="POST" action="?/setPasskey"><input type="hidden" name="passkey" value="" /><button class="btn btn-soft btn-error" type="submit">Nonaktifkan Passkey</button></form>{/if}
		</div>
	</section>

	<form method="GET" class="border-base-300 bg-base-100 grid gap-3 rounded-lg border p-4 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_180px_180px_auto] xl:items-end">
		<label class="form-control"><span class="label-text mb-1">Pencarian</span><label class="input input-bordered flex items-center gap-2"><Icon name="search" /><input class="grow" name="q" value={data.filter.q} placeholder="Nama, instansi, atau keperluan" /></label></label>
		<label class="form-control"><span class="label-text mb-1">Tanggal Mulai</span><input class="input input-bordered" type="date" name="tanggal_mulai" value={data.filter.tanggalMulai} /></label>
		<label class="form-control"><span class="label-text mb-1">Tanggal Selesai</span><input class="input input-bordered" type="date" name="tanggal_selesai" value={data.filter.tanggalSelesai} /></label>
		<button class="btn btn-primary" type="submit"><Icon name="search" /> Terapkan</button>
	</form>

	<div class="border-base-300 bg-base-100 overflow-x-auto rounded-lg border">
		<table class="table table-zebra">
			<thead><tr><th class="w-16">No.</th><th>Nama</th><th>Asal / Instansi</th><th>Keperluan</th><th>Waktu</th><th class="text-right">Aksi</th></tr></thead>
			<tbody>
				{#each data.daftar as item}
					<tr><td>{item.no}</td><td class="font-semibold">{item.nama}</td><td>{item.asalInstansi}</td><td class="max-w-72 truncate">{item.keperluan}</td><td class="whitespace-nowrap">{formatDate(item.createdAt)}</td><td><div class="flex justify-end gap-1"><button class="btn btn-soft btn-sm" type="button" onclick={() => openDetail(item)} title="Lihat detail"><Icon name="eye" /></button><form method="POST" action="?/delete" onsubmit={(event) => { if (!confirm(`Hapus data tamu ${item.nama}?`)) event.preventDefault(); }}><input type="hidden" name="id" value={item.id} /><button class="btn btn-soft btn-error btn-sm" type="submit" title="Hapus"><Icon name="del" /></button></form></div></td></tr>
				{:else}
					<tr><td colspan="6" class="py-12 text-center opacity-60">Belum ada kunjungan pada periode ini.</td></tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p class="text-sm opacity-65">{data.total} kunjungan ditemukan</p>{#if data.filter.totalPages > 1}<div class="join">{#each Array.from({ length: data.filter.totalPages }, (_, index) => index + 1) as pageNumber}<a class:btn-active={pageNumber === data.filter.currentPage} class="btn join-item btn-sm" href={pageUrl(pageNumber)}>{pageNumber}</a>{/each}</div>{/if}</div>
</div>

<dialog bind:this={detailDialog} class="modal">
	<div class="modal-box max-w-2xl">
		<h2 class="text-xl font-bold">Detail Kunjungan</h2>
		{#if selected}<dl class="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2"><div><dt class="text-sm opacity-60">Nama</dt><dd class="font-semibold">{selected.nama}</dd></div><div><dt class="text-sm opacity-60">Waktu</dt><dd>{formatDate(selected.createdAt)}</dd></div><div><dt class="text-sm opacity-60">Asal / Instansi</dt><dd>{selected.asalInstansi}</dd></div><div><dt class="text-sm opacity-60">NIP</dt><dd>{selected.nip || '-'}</dd></div><div class="sm:col-span-2"><dt class="text-sm opacity-60">Keperluan</dt><dd class="whitespace-pre-wrap">{selected.keperluan}</dd></div><div class="sm:col-span-2"><dt class="text-sm opacity-60">Pesan dan Kesan</dt><dd class="whitespace-pre-wrap">{selected.pesanKesan || '-'}</dd></div>{#if selected.tandaTangan}<div class="sm:col-span-2"><dt class="mb-1 text-sm opacity-60">Tanda Tangan</dt><img class="border-base-300 h-28 max-w-full rounded-md border bg-white object-contain p-2" src={`/api/buku-tamu/signature/${selected.id}`} alt="Tanda tangan tamu" /></div>{/if}</dl>{/if}
		<div class="modal-action"><form method="dialog"><button class="btn">Tutup</button></form></div>
	</div>
	<form method="dialog" class="modal-backdrop"><button>Tutup</button></form>
</dialog>
