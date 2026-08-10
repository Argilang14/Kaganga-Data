<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/icon.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { DokumenPegawai } from './types';

	let { pegawaiId, dokumen = $bindable() }: { pegawaiId: number; dokumen: DokumenPegawai[] } =
		$props();
	let editing = $state<DokumenPegawai | null>(null);

	const saveEnhance: SubmitFunction =
		() =>
		async ({ result, formElement }) => {
			if (result.type !== 'success') {
				toast({
					message:
						result.type === 'failure'
							? String(result.data?.fail ?? 'Dokumen gagal disimpan.')
							: 'Dokumen gagal disimpan.',
					type: 'error'
				});
				return;
			}
			const saved = result.data?.saved as DokumenPegawai;
			const index = dokumen.findIndex((item) => item.id === saved.id);
			if (index >= 0) dokumen[index] = saved;
			else dokumen = [saved, ...dokumen];
			dokumen = [...dokumen];
			editing = null;
			formElement.reset();
			toast({
				message: String(result.data?.message ?? 'Dokumen berhasil disimpan.'),
				type: 'success'
			});
		};

	const deleteEnhance: SubmitFunction =
		() =>
		async ({ result }) => {
			if (result.type !== 'success') {
				toast({ message: 'Dokumen gagal dihapus.', type: 'error' });
				return;
			}
			const id = Number(result.data?.deletedId);
			dokumen = dokumen.filter((item) => item.id !== id);
			if (editing?.id === id) editing = null;
			toast({
				message: String(result.data?.message ?? 'Dokumen berhasil dihapus.'),
				type: 'success'
			});
		};

	function sizeLabel(size: number | null) {
		if (!size) return '-';
		return size < 1024 * 1024
			? `${Math.ceil(size / 1024)} KB`
			: `${(size / 1024 / 1024).toFixed(1)} MB`;
	}
</script>

<form
	method="POST"
	action={`/pegawai/${pegawaiId}?/saveDokumen`}
	use:enhance={saveEnhance}
	enctype="multipart/form-data"
	class="bg-base-200/45 rounded-md p-3"
>
	<input type="hidden" name="id" value={editing?.id ?? ''} />
	<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
		<label class="form-control gap-1"
			><span class="label-text">Jenis Dokumen</span><input
				class="input input-bordered w-full"
				name="jenis"
				value={editing?.jenis ?? ''}
				placeholder="SK/Ijazah/Sertifikat"
				required
			/></label
		>
		<label class="form-control gap-1 sm:col-span-2"
			><span class="label-text">Nama Dokumen</span><input
				class="input input-bordered w-full"
				name="nama"
				value={editing?.nama ?? ''}
				required
			/></label
		>
		<label class="form-control gap-1"
			><span class="label-text">Nomor</span><input
				class="input input-bordered w-full"
				name="nomor"
				value={editing?.nomor ?? ''}
			/></label
		>
		<label class="form-control gap-1"
			><span class="label-text">Tanggal</span><input
				class="input input-bordered w-full"
				type="date"
				name="tanggal"
				value={editing?.tanggal ?? ''}
			/></label
		>
		<label class="form-control gap-1"
			><span class="label-text">Berkas {editing ? '(opsional)' : ''}</span><input
				class="file-input file-input-bordered w-full"
				type="file"
				name="file"
				accept="application/pdf,image/jpeg,image/png"
				required={!editing}
			/></label
		>
	</div>
	<p class="text-base-content/55 mt-2 text-xs">
		PDF, JPG, atau PNG maksimal 2 MB. Saat edit, kosongkan berkas jika tidak ingin menggantinya.
	</p>
	<div class="mt-3 flex justify-end gap-2">
		<button class="btn btn-primary btn-sm" type="submit"
			><Icon name="save" /> {editing ? 'Perbarui' : 'Tambah'} Dokumen</button
		>{#if editing}<button class="btn btn-soft btn-sm" type="button" onclick={() => (editing = null)}
				>Batal</button
			>{/if}
	</div>
</form>

<div class="mt-4 overflow-x-auto">
	<table class="table-sm table min-w-[760px]">
		<thead
			><tr><th>Jenis/Nama</th><th>Nomor</th><th>Tanggal</th><th>Berkas</th><th>Aksi</th></tr></thead
		>
		<tbody
			>{#each dokumen as item (item.id)}<tr
					><td
						><b>{item.nama}</b>
						<div class="text-base-content/55 text-xs">{item.jenis}</div></td
					><td>{item.nomor || '-'}</td><td>{item.tanggal || '-'}</td><td
						><a
							class="link link-primary"
							href={`/api/pegawai-document/${item.id}`}
							target="_blank"
							rel="noreferrer">Buka ({sizeLabel(item.ukuran)})</a
						></td
					><td
						><div class="flex">
							<button
								class="btn btn-soft btn-sm rounded-r-none"
								type="button"
								title="Edit dokumen"
								onclick={() => (editing = item)}><Icon name="edit" /></button
							>
							<form
								method="POST"
								action={`/pegawai/${pegawaiId}?/deleteDokumen`}
								use:enhance={deleteEnhance}
								onsubmit={(event) => {
									if (!confirm('Hapus dokumen beserta berkasnya?')) event.preventDefault();
								}}
							>
								<input type="hidden" name="id" value={item.id} /><button
									class="btn btn-error btn-soft btn-sm rounded-l-none"
									type="submit"
									title="Hapus dokumen"><Icon name="del" /></button
								>
							</form>
						</div></td
					></tr
				>{:else}<tr
					><td colspan="5" class="text-base-content/55 py-6 text-center"
						>Belum ada dokumen pegawai.</td
					></tr
				>{/each}</tbody
		>
	</table>
</div>
