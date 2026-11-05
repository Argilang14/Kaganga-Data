<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import DeleteAsramaModal from '$lib/components/asrama/delete-asrama-modal.svelte';
	import '$lib/components/murid/student-workspace.css';
	let { data } = $props();
	let dialog: HTMLDialogElement;
	let deleteModal = $state<DeleteAsramaModal>();
	let id = $state(0);
	let version = $state(1);
	let name = $state('');
	let category = $state('putra');
	let capacity = $state(30);
	let employee = $state('0');
	let message = $state('');
	function edit(room?: (typeof data.rooms)[number]) {
		id = room?.id ?? 0;
		version = room?.versi ?? 1;
		name = room?.nama ?? '';
		category = room?.kategori ?? 'putra';
		capacity = room?.kapasitas ?? 30;
		employee = String(room?.pegawaiId ?? 0);
		message = '';
		dialog.showModal();
	}
</script>

<div class="student-workspace mb-6 flex flex-wrap items-start justify-between gap-3">
	<div>
		<h2 class="text-xl font-bold">Data Asrama</h2>
		<p class="mt-1 text-sm text-base-content/65">
			{data.rooms.length} asrama · penugasan wali dan kapasitas penghuni
		</p>
	</div>
	{#if data.manage}<button class="btn btn-primary" onclick={() => edit()}>Tambah asrama</button
		>{/if}
</div>
<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
	{#each data.rooms as room (room.id)}<section
			class="card min-w-0 bg-base-100 rounded-box shadow-md"
		>
			<div class="flex items-start justify-between gap-3 border-b border-base-200 p-4">
				<div class="min-w-0">
					<h3 class="card-title break-words text-xl">
						{room.asrama === room.nama ? room.nama : `${room.asrama} / ${room.nama}`}
					</h3>
					<p class="text-base-content/70 text-sm">
						{room.kategori === 'putra' ? 'Asrama putra' : 'Asrama putri'}
					</p>
				</div>
				<span class="badge badge-sm badge-soft shrink-0" class:badge-success={Boolean(room.aktif)}
					>{room.aktif ? 'Aktif' : 'Nonaktif'}</span
				>
			</div>
			<div class="flex flex-1 flex-col p-4">
				<p class="text-base-content/60 text-sm">Wali Asrama</p>
				<p class="mt-1 break-words font-semibold">{room.wali ?? 'Belum ditetapkan'}</p>
				<p class="mt-3 text-sm text-base-content/65">
					<strong class="text-base-content">{room.penghuni}</strong> dari {room.kapasitas} tempat terisi
				</p>
				<div class="mt-auto flex flex-wrap items-center gap-2 pt-5">
					{#if data.manage}<button class="btn btn-soft" onclick={() => edit(room)}>Edit</button>
						<FormEnhance
							action="?/save"
							preventDuplicateSubmit
							onsuccess={async () => {
								await invalidate('app:asrama');
							}}
						>
							{#snippet children({ submitting })}<input
									type="hidden"
									name="operation"
									value="room"
								/><input type="hidden" name="id" value={room.id} /><input
									type="hidden"
									name="versi"
									value={room.versi}
								/><input type="hidden" name="nama" value={room.nama} /><input
									type="hidden"
									name="kapasitas"
									value={room.kapasitas}
								/>{#if !room.aktif}<input type="hidden" name="aktif" value="on" />{/if}<button
									class="btn btn-soft"
									type="submit"
									disabled={submitting || Boolean(room.aktif && room.penghuni)}
									title={room.aktif && room.penghuni
										? 'Pindahkan atau akhiri penempatan murid terlebih dahulu.'
										: undefined}>{room.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button
								>{/snippet}
						</FormEnhance>
						<button
							class="btn btn-error btn-soft shadow-none"
							onclick={() => deleteModal?.open(room)}
						>
							<Icon name="del" /> Hapus
						</button>
					{/if}<a class="btn btn-soft" href={resolve(`/murid/asrama?kamar_id=${room.id}`)}
						>Lihat murid</a
					>
				</div>
			</div>
		</section>{:else}<p class="bg-base-100 rounded-lg p-6 text-center">
			Belum ada asrama. {data.manage
				? 'Gunakan Tambah asrama untuk membuat data.'
				: 'Hubungi admin untuk menetapkan asrama Anda.'}
		</p>{/each}
</div>
{#if data.manage}<DeleteAsramaModal bind:this={deleteModal} />{/if}
<dialog bind:this={dialog} class="modal" aria-labelledby="asrama-form-title">
	<div class="modal-box w-full max-w-2xl p-4">
		<h3 id="asrama-form-title" class="mb-4 text-xl font-bold">
			{id ? 'Edit asrama' : 'Tambah asrama'}
		</h3>
		<FormEnhance
			action="?/save"
			preventDuplicateSubmit
			onsuccess={async () => {
				dialog.close();
				await invalidate('app:asrama');
			}}
			onfailure={({ data: result }) => {
				message = String(result?.message ?? 'Data belum tersimpan. Periksa isian.');
			}}
		>
			{#snippet children({ submitting })}
				<input type="hidden" name="operation" value="directory" /><input
					type="hidden"
					name="id"
					value={id}
				/><input type="hidden" name="versi" value={version} />
				<label class="fieldset"
					><span class="fieldset-legend">Nama asrama</span><input
						class="input w-full"
						name="nama"
						bind:value={name}
						required
						maxlength="100"
					/></label
				>
				<div class="grid gap-3 sm:grid-cols-2">
					<label class="fieldset"
						><span class="fieldset-legend">Kategori</span><select
							class="select w-full"
							name="kategori"
							bind:value={category}
							disabled={Boolean(id)}
							><option value="putra">Putra</option><option value="putri">Putri</option></select
						></label
					><label class="fieldset"
						><span class="fieldset-legend">Kapasitas</span><input
							class="input w-full"
							name="kapasitas"
							type="number"
							min="1"
							max="1000"
							bind:value={capacity}
							required
						/></label
					>
				</div>
				<label class="fieldset"
					><span class="fieldset-legend">Wali asrama</span><select
						class="select w-full"
						name="pegawaiId"
						bind:value={employee}
						><option value="0">Belum ditetapkan</option
						>{#each data.employees as person (person.id)}<option value={String(person.id)}
								>{person.nama}{person.nip ? ` · ${person.nip}` : ''}</option
							>{/each}</select
					><span class="text-base-content/70 text-xs"
						>Diambil dari pegawai aktif berjenis Wali Asrama.</span
					></label
				>
				{#if message}<p class="text-error my-3 text-sm" role="alert">{message}</p>{/if}
				<div class="modal-action">
					<button class="btn" type="button" disabled={submitting} onclick={() => dialog.close()}
						>Batal</button
					><button class="btn btn-primary" type="submit" disabled={submitting}
						>{submitting ? 'Menyimpan…' : 'Simpan'}</button
					>
				</div>
			{/snippet}
		</FormEnhance>
	</div>
</dialog>
