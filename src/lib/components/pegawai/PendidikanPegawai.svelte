<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/icon.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { PendidikanPegawai, SertifikasiPegawai } from './types';

	let {
		pegawaiId,
		pendidikan = $bindable(),
		sertifikasi = $bindable(),
		mode = 'semua'
	}: {
		pegawaiId: number;
		pendidikan: PendidikanPegawai[];
		sertifikasi: SertifikasiPegawai[];
		mode?: 'semua' | 'pendidikan' | 'sertifikasi';
	} = $props();
	let editingPendidikan = $state<PendidikanPegawai | null>(null);
	let editingSertifikasi = $state<SertifikasiPegawai | null>(null);

	function saveEnhance(kind: 'pendidikan' | 'sertifikasi'): SubmitFunction {
		return () =>
			async ({ result, formElement }) => {
				if (result.type !== 'success') {
					toast({
						message:
							result.type === 'failure'
								? String(result.data?.fail ?? 'Data gagal disimpan.')
								: 'Data gagal disimpan.',
						type: 'error'
					});
					return;
				}
				if (kind === 'pendidikan') {
					const saved = result.data?.saved as PendidikanPegawai;
					pendidikan = saved.isTerakhir
						? pendidikan.map((item) => ({ ...item, isTerakhir: item.id === saved.id }))
						: [...pendidikan];
					const index = pendidikan.findIndex((item) => item.id === saved.id);
					if (index >= 0) pendidikan[index] = saved;
					else pendidikan = [saved, ...pendidikan];
					pendidikan = [...pendidikan];
					editingPendidikan = null;
				} else {
					const saved = result.data?.saved as SertifikasiPegawai;
					const index = sertifikasi.findIndex((item) => item.id === saved.id);
					if (index >= 0) sertifikasi[index] = saved;
					else sertifikasi = [saved, ...sertifikasi];
					sertifikasi = [...sertifikasi];
					editingSertifikasi = null;
				}
				formElement.reset();
				toast({
					message: String(result.data?.message ?? 'Data berhasil disimpan.'),
					type: 'success'
				});
			};
	}

	function deleteEnhance(kind: 'pendidikan' | 'sertifikasi'): SubmitFunction {
		return () =>
			async ({ result }) => {
				if (result.type !== 'success') {
					toast({ message: 'Data gagal dihapus.', type: 'error' });
					return;
				}
				const id = Number(result.data?.deletedId);
				if (kind === 'pendidikan') pendidikan = pendidikan.filter((item) => item.id !== id);
				else sertifikasi = sertifikasi.filter((item) => item.id !== id);
				toast({
					message: String(result.data?.message ?? 'Data berhasil dihapus.'),
					type: 'success'
				});
			};
	}
</script>

{#if mode !== 'sertifikasi'}
<section>
	<h3 class="font-bold">Pendidikan Formal</h3>
	<form
		method="POST"
		action={`/pegawai/${pegawaiId}?/savePendidikan`}
		use:enhance={saveEnhance('pendidikan')}
		class="bg-base-200/45 mt-3 rounded-md p-3"
	>
		<input type="hidden" name="id" value={editingPendidikan?.id ?? ''} />
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			<label class="form-control gap-1"
				><span class="label-text">Jenjang</span><input
					class="input input-bordered w-full"
					name="jenjang"
					value={editingPendidikan?.jenjang ?? ''}
					placeholder="S1"
					required
				/></label
			>
			<label class="form-control gap-1 sm:col-span-2"
				><span class="label-text">Institusi</span><input
					class="input input-bordered w-full"
					name="institusi"
					value={editingPendidikan?.institusi ?? ''}
					required
				/></label
			>
			<label class="form-control gap-1"
				><span class="label-text">Program Studi</span><input
					class="input input-bordered w-full"
					name="programStudi"
					value={editingPendidikan?.programStudi ?? ''}
				/></label
			>
			<label class="form-control gap-1"
				><span class="label-text">Tahun Lulus</span><input
					class="input input-bordered w-full"
					type="number"
					min="1900"
					max="2100"
					name="tahunLulus"
					value={editingPendidikan?.tahunLulus ?? ''}
				/></label
			>
			<label class="form-control gap-1"
				><span class="label-text">Nomor Ijazah</span><input
					class="input input-bordered w-full"
					name="nomorIjazah"
					value={editingPendidikan?.nomorIjazah ?? ''}
				/></label
			>
		</div>
		<div class="mt-3 flex flex-wrap items-center justify-between gap-2">
			<label class="label cursor-pointer gap-2"
				><input
					class="checkbox checkbox-sm"
					type="checkbox"
					name="isTerakhir"
					checked={editingPendidikan?.isTerakhir ?? false}
				/><span class="label-text">Pendidikan terakhir</span></label
			>
			<div class="flex gap-2">
				<button class="btn btn-primary btn-sm" type="submit"
					><Icon name="save" /> {editingPendidikan ? 'Perbarui' : 'Tambah'}</button
				>{#if editingPendidikan}<button
						class="btn btn-soft btn-sm"
						type="button"
						onclick={() => (editingPendidikan = null)}>Batal</button
					>{/if}
			</div>
		</div>
	</form>
	<div class="mt-3 overflow-x-auto">
		<table class="table-sm table min-w-[720px]">
			<thead
				><tr><th>Jenjang</th><th>Institusi</th><th>Program Studi</th><th>Tahun</th><th>Aksi</th></tr
				></thead
			>
			<tbody
				>{#each pendidikan as item (item.id)}<tr
						><td
							><b>{item.jenjang}</b>{#if item.isTerakhir}<span
									class="badge badge-success badge-xs ml-2">Terakhir</span
								>{/if}</td
						><td>{item.institusi}</td><td>{item.programStudi || '-'}</td><td
							>{item.tahunLulus || '-'}</td
						><td
							><div class="flex">
								<button
									class="btn btn-soft btn-sm rounded-r-none"
									type="button"
									title="Edit pendidikan"
									onclick={() => (editingPendidikan = item)}><Icon name="edit" /></button
								>
								<form
									method="POST"
									action={`/pegawai/${pegawaiId}?/deletePendidikan`}
									use:enhance={deleteEnhance('pendidikan')}
									onsubmit={(event) => {
										if (!confirm('Hapus riwayat pendidikan ini?')) event.preventDefault();
									}}
								>
									<input type="hidden" name="id" value={item.id} /><button
										class="btn btn-error btn-soft btn-sm rounded-l-none"
										type="submit"
										title="Hapus pendidikan"><Icon name="del" /></button
									>
								</form>
							</div></td
						></tr
					>{:else}<tr
						><td colspan="5" class="text-base-content/55 py-5 text-center"
							>Belum ada data pendidikan.</td
						></tr
					>{/each}</tbody
			>
		</table>
	</div>
</section>
{/if}

{#if mode !== 'pendidikan'}
<section class:border-t={mode === 'semua'} class:mt-6={mode === 'semua'} class:pt-5={mode === 'semua'} class="border-base-200">
	<h3 class="font-bold">Sertifikasi dan Pelatihan</h3>
	<form
		method="POST"
		action={`/pegawai/${pegawaiId}?/saveSertifikasi`}
		use:enhance={saveEnhance('sertifikasi')}
		class="bg-base-200/45 mt-3 rounded-md p-3"
	>
		<input type="hidden" name="id" value={editingSertifikasi?.id ?? ''} />
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			<label class="form-control gap-1"
				><span class="label-text">Jenis</span><input
					class="input input-bordered w-full"
					name="jenis"
					value={editingSertifikasi?.jenis ?? ''}
					placeholder="Sertifikasi/Pelatihan"
					required
				/></label
			>
			<label class="form-control gap-1 sm:col-span-2"
				><span class="label-text">Nama</span><input
					class="input input-bordered w-full"
					name="nama"
					value={editingSertifikasi?.nama ?? ''}
					required
				/></label
			>
			<label class="form-control gap-1"
				><span class="label-text">Penyelenggara</span><input
					class="input input-bordered w-full"
					name="penyelenggara"
					value={editingSertifikasi?.penyelenggara ?? ''}
				/></label
			>
			<label class="form-control gap-1"
				><span class="label-text">Nomor</span><input
					class="input input-bordered w-full"
					name="nomor"
					value={editingSertifikasi?.nomor ?? ''}
				/></label
			>
			<label class="form-control gap-1"
				><span class="label-text">Mulai</span><input
					class="input input-bordered w-full"
					type="date"
					name="tanggalMulai"
					value={editingSertifikasi?.tanggalMulai ?? ''}
				/></label
			>
			<label class="form-control gap-1"
				><span class="label-text">Selesai</span><input
					class="input input-bordered w-full"
					type="date"
					name="tanggalSelesai"
					value={editingSertifikasi?.tanggalSelesai ?? ''}
				/></label
			>
			<label class="form-control gap-1"
				><span class="label-text">Berlaku Sampai</span><input
					class="input input-bordered w-full"
					type="date"
					name="berlakuSampai"
					value={editingSertifikasi?.berlakuSampai ?? ''}
				/></label
			>
			<label class="form-control gap-1 sm:col-span-2"
				><span class="label-text">Catatan</span><input
					class="input input-bordered w-full"
					name="catatan"
					value={editingSertifikasi?.catatan ?? ''}
				/></label
			>
		</div>
		<div class="mt-3 flex justify-end gap-2">
			<button class="btn btn-primary btn-sm" type="submit"
				><Icon name="save" /> {editingSertifikasi ? 'Perbarui' : 'Tambah'}</button
			>{#if editingSertifikasi}<button
					class="btn btn-soft btn-sm"
					type="button"
					onclick={() => (editingSertifikasi = null)}>Batal</button
				>{/if}
		</div>
	</form>
	<div class="mt-3 overflow-x-auto">
		<table class="table-sm table min-w-[760px]">
			<thead
				><tr
					><th>Jenis/Nama</th><th>Penyelenggara</th><th>Periode</th><th>Berlaku</th><th>Aksi</th
					></tr
				></thead
			>
			<tbody
				>{#each sertifikasi as item (item.id)}<tr
						><td
							><b>{item.nama}</b>
							<div class="text-base-content/55 text-xs">{item.jenis}</div></td
						><td>{item.penyelenggara || '-'}</td><td
							>{item.tanggalMulai || '-'} - {item.tanggalSelesai || '-'}</td
						><td>{item.berlakuSampai || '-'}</td><td
							><div class="flex">
								<button
									class="btn btn-soft btn-sm rounded-r-none"
									type="button"
									title="Edit sertifikasi"
									onclick={() => (editingSertifikasi = item)}><Icon name="edit" /></button
								>
								<form
									method="POST"
									action={`/pegawai/${pegawaiId}?/deleteSertifikasi`}
									use:enhance={deleteEnhance('sertifikasi')}
									onsubmit={(event) => {
										if (!confirm('Hapus sertifikasi ini?')) event.preventDefault();
									}}
								>
									<input type="hidden" name="id" value={item.id} /><button
										class="btn btn-error btn-soft btn-sm rounded-l-none"
										type="submit"
										title="Hapus sertifikasi"><Icon name="del" /></button
									>
								</form>
							</div></td
						></tr
					>{:else}<tr
						><td colspan="5" class="text-base-content/55 py-5 text-center"
							>Belum ada sertifikasi atau pelatihan.</td
						></tr
					>{/each}</tbody
			>
		</table>
	</div>
</section>
{/if}
