<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	let { data, form } = $props();
	let showForm = $state(false);
	let editing = $state<any>(null);
	const badge: Record<string, string> = { draft: 'badge-ghost', diajukan: 'badge-warning', disetujui: 'badge-success', ditolak: 'badge-error', diarsipkan: 'badge-info' };
	function openForm(item: any = null) { editing = item; showForm = true; }
	function closeForm() { showForm = false; editing = null; }
	function date(value: string | null) { return value ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`)) : '-'; }
</script>

<div class="space-y-4">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div><h2 class="text-2xl font-bold">Surat Masuk & Keluar</h2><p class="text-base-content/65 text-sm">Arsip surat dengan persetujuan dan snapshot dokumen per sekolah.</p></div>
		<button class="btn btn-primary btn-soft shadow-none" type="button" onclick={() => openForm()}><Icon name="plus" /> Tambah Surat</button>
	</header>
	{#if form?.fail}<div class="alert alert-error py-2">{form.fail}</div>{/if}
	{#if form?.message}<div class="alert alert-success py-2">{form.message}</div>{/if}

	<form method="GET" class="grid gap-2 rounded-lg border border-base-300 bg-base-100 p-3 shadow-sm md:grid-cols-[1fr_180px_180px_auto]">
		<input class="input input-bordered w-full" name="q" value={data.filters.q} placeholder="Cari nomor, pihak, atau perihal..." />
		<select class="select select-bordered" name="arah"><option value="">Semua jenis</option><option value="masuk" selected={data.filters.arah === 'masuk'}>Surat Masuk</option><option value="keluar" selected={data.filters.arah === 'keluar'}>Surat Keluar</option></select>
		<select class="select select-bordered" name="status"><option value="">Semua status</option>{#each ['draft','diajukan','disetujui','ditolak','diarsipkan'] as status}<option value={status} selected={data.filters.status === status}>{status}</option>{/each}</select>
		<button class="btn btn-soft" type="submit"><Icon name="search" /> Cari</button>
	</form>

	<div class="overflow-x-auto rounded-lg border border-base-300 bg-base-100 shadow-sm">
		<table class="table table-zebra"><thead><tr><th>No.</th><th>Jenis/Tanggal</th><th>Nomor & Perihal</th><th>Pengirim/Penerima</th><th>Status</th><th class="text-right">Aksi</th></tr></thead>
		<tbody>{#each data.rows as item, index}<tr>
			<td>{(data.page.currentPage - 1) * 20 + index + 1}</td>
			<td><span class="badge badge-outline">{item.arah}</span><div class="mt-1 text-xs opacity-65">{date(item.tanggalSurat)}</div></td>
			<td class="max-w-md"><strong>{item.nomorSurat || 'Tanpa nomor'}</strong><div>{item.perihal}</div>{#if item.ringkasan}<div class="line-clamp-2 text-xs opacity-60">{item.ringkasan}</div>{/if}</td>
			<td>{item.pengirimPenerima}</td>
			<td><span class={`badge ${badge[item.status] ?? 'badge-ghost'}`}>{item.status}</span>{#if item.catatanPersetujuan}<div class="mt-1 max-w-48 text-xs opacity-60">{item.catatanPersetujuan}</div>{/if}</td>
			<td><div class="flex flex-wrap justify-end gap-1">
				{#if item.status === 'draft' || item.status === 'ditolak'}<button class="btn btn-soft btn-sm" type="button" onclick={() => openForm(item)}><Icon name="edit" /> Edit</button><form method="POST" action="?/submit"><input type="hidden" name="id" value={item.id}/><button class="btn btn-primary btn-soft btn-sm" type="submit">Ajukan</button></form><form method="POST" action="?/delete"><input type="hidden" name="id" value={item.id}/><button class="btn btn-error btn-soft btn-sm" type="submit" aria-label="Hapus"><Icon name="del" /></button></form>{/if}
				{#if item.status === 'diajukan' && data.canApprove}<form method="POST" action="?/decide" class="flex gap-1"><input type="hidden" name="id" value={item.id}/><input class="input input-bordered input-sm w-36" name="catatan" placeholder="Catatan"/><button class="btn btn-success btn-soft btn-sm" name="decision" value="disetujui">Setujui</button><button class="btn btn-error btn-soft btn-sm" name="decision" value="ditolak">Tolak</button></form>{/if}
				{#if item.status === 'disetujui'}<form method="POST" action="?/archive"><input type="hidden" name="id" value={item.id}/><button class="btn btn-info btn-soft btn-sm" type="submit">Arsipkan</button></form>{/if}
			</div></td>
		</tr>{:else}<tr><td colspan="6" class="py-12 text-center opacity-60">Belum ada surat.</td></tr>{/each}</tbody></table>
	</div>
	{#if data.page.totalPages > 1}<div class="join flex justify-center">{#each Array.from({length:data.page.totalPages},(_,i)=>i+1) as page}<a class:btn-active={page===data.page.currentPage} class="btn join-item btn-sm" href={`?q=${encodeURIComponent(data.filters.q)}&arah=${data.filters.arah}&status=${data.filters.status}&page=${page}`}>{page}</a>{/each}</div>{/if}
</div>

{#if showForm}<div class="modal modal-open"><div class="modal-box max-w-3xl"><h3 class="text-xl font-bold">{editing ? 'Edit Draft Surat' : 'Tambah Draft Surat'}</h3><form method="POST" action={editing ? '?/update' : '?/create'} class="mt-4 grid gap-4 md:grid-cols-2" onsubmit={closeForm}>{#if editing}<input type="hidden" name="id" value={editing.id}/>{/if}<label class="form-control"><span class="label-text mb-1">Jenis Surat</span><select class="select select-bordered" name="arah" required><option value="masuk" selected={!editing || editing.arah === 'masuk'}>Surat Masuk</option><option value="keluar" selected={editing?.arah === 'keluar'}>Surat Keluar</option></select></label><label class="form-control"><span class="label-text mb-1">Nomor Surat</span><input class="input input-bordered" name="nomorSurat" value={editing?.nomorSurat ?? ''}/></label><label class="form-control"><span class="label-text mb-1">Tanggal Surat</span><input class="input input-bordered" type="date" name="tanggalSurat" value={editing?.tanggalSurat ?? ''} required/></label><label class="form-control"><span class="label-text mb-1">Tanggal Diterima (surat masuk)</span><input class="input input-bordered" type="date" name="tanggalDiterima" value={editing?.tanggalDiterima ?? ''}/></label><label class="form-control md:col-span-2"><span class="label-text mb-1">Pengirim / Penerima</span><input class="input input-bordered" name="pengirimPenerima" value={editing?.pengirimPenerima ?? ''} required/></label><label class="form-control md:col-span-2"><span class="label-text mb-1">Perihal</span><input class="input input-bordered" name="perihal" value={editing?.perihal ?? ''} required/></label><label class="form-control md:col-span-2"><span class="label-text mb-1">Ringkasan</span><textarea class="textarea textarea-bordered" name="ringkasan" rows="3">{editing?.ringkasan ?? ''}</textarea></label><div class="modal-action md:col-span-2"><button class="btn" type="button" onclick={closeForm}>Batal</button><button class="btn btn-primary" type="submit"><Icon name="save" /> Simpan Draft</button></div></form></div><button class="modal-backdrop" type="button" onclick={closeForm}>Tutup</button></div>{/if}
