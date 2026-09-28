<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	let { data, form } = $props();
	let open = $state(false);
	let editing = $state<any>(null);
	let tab = $state<'ruang' | 'pemakaian'>('ruang');
	const labels: Record<string, string> = {
		baik: 'Baik',
		rusak_ringan: 'Rusak Ringan',
		rusak_berat: 'Rusak Berat',
		tidak_aktif: 'Tidak Aktif'
	};
</script>

<div class="space-y-5">
	<header class="flex items-end justify-between">
		<div>
			<h2 class="text-2xl font-bold">Manajemen Ruangan</h2>
			<p class="text-sm opacity-60">Master ruang dan penempatannya pada jadwal aktif.</p>
		</div>
		{#if data.canManage}<button
				class="btn btn-primary"
				type="button"
				onclick={() => {
					editing = null;
					open = true;
				}}><Icon name="plus" /> Tambah Ruangan</button
			>{/if}
	</header>
	{#if form?.fail}<div class="alert alert-error">{form.fail}</div>{/if}{#if form?.message}<div
			class="alert alert-success"
		>
			{form.message}
		</div>{/if}
	<div class="tabs tabs-boxed w-fit">
		<button class:tab-active={tab === 'ruang'} class="tab" onclick={() => (tab = 'ruang')}
			>Daftar Ruangan</button
		><button class:tab-active={tab === 'pemakaian'} class="tab" onclick={() => (tab = 'pemakaian')}
			>Penempatan Jadwal</button
		>
	</div>
	{#if tab === 'ruang'}<div
			class="overflow-x-auto rounded-lg border border-base-300 bg-base-100 shadow-sm"
		>
			<table class="table">
				<thead
					><tr
						><th>Kode</th><th>Nama / Jenis</th><th>Kapasitas</th><th>Lokasi</th><th>Kondisi</th><th
							>Pemakaian</th
						><th>Aksi</th></tr
					></thead
				><tbody
					>{#each data.rooms as room}<tr
							><td class="font-bold">{room.kode}</td><td
								>{room.nama}
								<div class="text-xs opacity-60">{room.jenis}</div></td
							><td>{room.kapasitas || '-'}</td><td>{room.lokasi || '-'}</td><td
								><span class="badge badge-outline">{labels[room.kondisi]}</span></td
							><td>{room.pemakaian} jadwal</td><td
								>{#if data.canManage}<div class="flex gap-1">
										<button
											class="btn btn-soft btn-sm"
											onclick={() => {
												editing = room;
												open = true;
											}}><Icon name="edit" /></button
										>
										<form method="POST" action="?/delete">
											<input type="hidden" name="id" value={room.id} /><button
												class="btn btn-error btn-soft btn-sm"
												disabled={room.pemakaian > 0}><Icon name="del" /></button
											>
										</form>
									</div>{/if}</td
							></tr
						>{:else}<tr
							><td colspan="7" class="py-12 text-center opacity-60">Belum ada ruangan.</td></tr
						>{/each}</tbody
				>
			</table>
		</div>{:else}<div
			class="overflow-x-auto rounded-lg border border-base-300 bg-base-100 shadow-sm"
		>
			<table class="table">
				<thead><tr><th>Hari/Jam</th><th>Kelas</th><th>Pelajaran</th><th>Ruangan</th></tr></thead
				><tbody
					>{#each data.schedules as item}<tr
							><td>{item.hari} · JP {item.jamKe}</td><td>{item.kelas}</td><td
								>{item.mapel || item.kode}</td
							><td
								>{#if data.canManage}<form method="POST" action="?/assign" class="flex gap-2">
										<input type="hidden" name="jadwalId" value={item.id} /><select
											class="select select-bordered select-sm"
											name="ruanganId"
											required
											><option value="">Pilih ruang</option
											>{#each data.rooms.filter((r) => r.kondisi !== 'tidak_aktif') as room}<option
													value={room.id}
													selected={item.ruanganId === room.id}>{room.kode} · {room.nama}</option
												>{/each}</select
										><button class="btn btn-primary btn-sm"><Icon name="save" /></button>
									</form>{:else}{item.ruangan || '-'}{/if}</td
							></tr
						>{:else}<tr
							><td colspan="4" class="py-12 text-center opacity-60"
								>Belum ada jadwal pelajaran aktif.</td
							></tr
						>{/each}</tbody
				>
			</table>
		</div>{/if}
</div>
{#if open}<div class="modal modal-open">
		<div class="modal-box max-w-2xl">
			<h3 class="text-xl font-bold">{editing ? 'Ubah' : 'Tambah'} Ruangan</h3>
			<form
				method="POST"
				action={editing ? '?/update' : '?/create'}
				class="mt-4 grid gap-3 sm:grid-cols-2"
			>
				{#if editing}<input type="hidden" name="id" value={editing.id} />{/if}<label
					class="form-control"
					><span class="label-text">Kode</span><input
						class="input input-bordered"
						name="kode"
						value={editing?.kode ?? ''}
						required
					/></label
				><label class="form-control"
					><span class="label-text">Nama</span><input
						class="input input-bordered"
						name="nama"
						value={editing?.nama ?? ''}
						required
					/></label
				><label class="form-control"
					><span class="label-text">Jenis</span><input
						class="input input-bordered"
						name="jenis"
						value={editing?.jenis ?? 'kelas'}
						required
					/></label
				><label class="form-control"
					><span class="label-text">Kapasitas</span><input
						class="input input-bordered"
						type="number"
						min="1"
						name="kapasitas"
						value={editing?.kapasitas ?? ''}
					/></label
				><label class="form-control"
					><span class="label-text">Lokasi</span><input
						class="input input-bordered"
						name="lokasi"
						value={editing?.lokasi ?? ''}
					/></label
				><label class="form-control"
					><span class="label-text">Kondisi</span><select
						class="select select-bordered"
						name="kondisi"
						>{#each data.conditions as item}<option
								value={item}
								selected={(editing?.kondisi ?? 'baik') === item}>{labels[item]}</option
							>{/each}</select
					></label
				><label class="form-control sm:col-span-2"
					><span class="label-text">Fasilitas</span><input
						class="input input-bordered"
						name="fasilitas"
						value={editing?.fasilitas ?? ''}
						placeholder="Proyektor, AC, papan tulis"
					/></label
				><label class="form-control sm:col-span-2"
					><span class="label-text">Catatan</span><textarea
						class="textarea textarea-bordered"
						name="catatan">{editing?.catatan ?? ''}</textarea
					></label
				>
				<div class="modal-action sm:col-span-2">
					<button class="btn" type="button" onclick={() => (open = false)}>Batal</button><button
						class="btn btn-primary"><Icon name="save" /> Simpan</button
					>
				</div>
			</form>
		</div>
		<button class="modal-backdrop" onclick={() => (open = false)}>Tutup</button>
	</div>{/if}
