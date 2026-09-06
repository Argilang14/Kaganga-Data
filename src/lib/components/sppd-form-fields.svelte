<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import { untrack } from 'svelte';
	type Employee = { id: number; nama: string; nip: string; jenis: string };
	type Follower = { id?: number; nama: string; tempatLahir: string; tanggalLahir: string };
	type Sppd = {
		nomorSurat: string | null;
		tanggalSurat: string | null;
		dasarSurat: string | null;
		maksud: string;
		alatAngkut: string | null;
		tempatBerangkat: string | null;
		tempatTujuan: string;
		lamanya: string | null;
		tanggalBerangkat: string;
		tanggalKembali: string;
		keteranganPengikut: string | null;
		kodeRekening: string | null;
		tingkatBiaya: string | null;
		keteranganLain: string | null;
		keterangan: string | null;
		pelaksana: Array<{ pegawaiId: number | null }>;
		pengikut: Follower[];
	};
	let { employees, item = null }: { employees: Employee[]; item?: Sppd | null } = $props();
	let followers = $state<Follower[]>(
		untrack(() => item?.pengikut.map((follower) => ({ ...follower })) ?? [])
	);
	function addFollower() {
		if (followers.length < 10)
			followers = [...followers, { nama: '', tempatLahir: '', tanggalLahir: '' }];
	}
</script>

<fieldset class="grid min-w-0 gap-1.5 md:col-span-2">
	<legend class="text-sm font-semibold">Pegawai Pelaksana</legend>
	<div class="bg-base-200 grid max-h-48 gap-1 overflow-y-auto rounded border p-2 sm:grid-cols-2">
		{#each employees as employee}
			<label class="hover:bg-base-100 flex cursor-pointer items-center gap-2 rounded px-2 py-1.5">
				<input
					class="checkbox checkbox-primary checkbox-sm"
					type="checkbox"
					name="pegawaiIds"
					value={employee.id}
					checked={item?.pelaksana.some((row) => row.pegawaiId === employee.id) ?? false}
				/>
				<span class="min-w-0 text-sm"
					><strong>{employee.nama}</strong><span class="ml-1 opacity-55">{employee.nip || '-'}</span
					></span
				>
			</label>
		{/each}
	</div>
	<p class="text-base-content/55 mt-1 text-xs">Pilih satu atau lebih pegawai aktif.</p>
</fieldset>

<label class="grid min-w-0 gap-1.5"
	><span class="text-sm font-medium">Nomor Surat Tugas</span><input
		class="input input-bordered w-full"
		name="nomorSurat"
		value={item?.nomorSurat ?? ''}
	/></label
>
<label class="grid min-w-0 gap-1.5"
	><span class="text-sm font-medium">Tanggal Surat</span><input
		class="input input-bordered w-full"
		type="date"
		name="tanggalSurat"
		value={item?.tanggalSurat ?? ''}
	/></label
>
<label class="grid min-w-0 gap-1.5 md:col-span-2"
	><span class="text-sm font-medium">Dasar Surat</span><textarea
		class="textarea textarea-bordered min-h-20 w-full resize-y"
		name="dasarSurat"
		rows="2">{item?.dasarSurat ?? ''}</textarea
	></label
>
<label class="grid min-w-0 gap-1.5 md:col-span-2"
	><span class="text-sm font-medium">Maksud Perjalanan</span><textarea
		class="textarea textarea-bordered min-h-24 w-full resize-y"
		name="maksud"
		required
		rows="2">{item?.maksud ?? ''}</textarea
	></label
>
<label class="grid min-w-0 gap-1.5"
	><span class="text-sm font-medium">Tempat Berangkat</span><input
		class="input input-bordered w-full"
		name="tempatBerangkat"
		value={item?.tempatBerangkat ?? ''}
	/></label
>
<label class="grid min-w-0 gap-1.5"
	><span class="text-sm font-medium">Tempat Tujuan</span><input
		class="input input-bordered w-full"
		name="tempatTujuan"
		value={item?.tempatTujuan ?? ''}
		required
	/></label
>
<label class="grid min-w-0 gap-1.5"
	><span class="text-sm font-medium">Alat Angkut</span><input
		class="input input-bordered w-full"
		name="alatAngkut"
		value={item?.alatAngkut ?? ''}
	/></label
>
<label class="grid min-w-0 gap-1.5"
	><span class="text-sm font-medium">Lamanya Perjalanan</span><input
		class="input input-bordered w-full"
		name="lamanya"
		value={item?.lamanya ?? ''}
		placeholder="Contoh: 2 hari"
	/></label
>
<label class="grid min-w-0 gap-1.5"
	><span class="text-sm font-medium">Tanggal Berangkat</span><input
		class="input input-bordered w-full"
		type="date"
		name="tanggalBerangkat"
		value={item?.tanggalBerangkat ?? ''}
		required
	/></label
>
<label class="grid min-w-0 gap-1.5"
	><span class="text-sm font-medium">Tanggal Kembali</span><input
		class="input input-bordered w-full"
		type="date"
		name="tanggalKembali"
		value={item?.tanggalKembali ?? ''}
		required
	/></label
>
<label class="grid min-w-0 gap-1.5"
	><span class="text-sm font-medium">Kode Rekening</span><input
		class="input input-bordered w-full"
		name="kodeRekening"
		value={item?.kodeRekening ?? ''}
	/></label
>
<label class="grid min-w-0 gap-1.5"
	><span class="text-sm font-medium">Tingkat Biaya</span><input
		class="input input-bordered w-full"
		name="tingkatBiaya"
		value={item?.tingkatBiaya ?? ''}
	/></label
>

<section class="border-base-300 rounded-md border p-3 md:col-span-2">
	<div class="flex items-center justify-between gap-2">
		<div>
			<h3 class="font-semibold">Pengikut</h3>
			<p class="text-xs opacity-60">Opsional, maksimal 10 orang.</p>
		</div>
		<button
			class="btn btn-sm btn-soft"
			type="button"
			onclick={addFollower}
			disabled={followers.length >= 10}><Icon name="plus" /> Tambah</button
		>
	</div>
	<div class="mt-3 space-y-2">
		{#each followers as follower, index}
			<div class="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px_auto]">
				<input
					class="input input-bordered w-full"
					name="pengikutNama"
					bind:value={follower.nama}
					placeholder="Nama"
				/>
				<input
					class="input input-bordered w-full"
					name="pengikutTempatLahir"
					bind:value={follower.tempatLahir}
					placeholder="Tempat lahir"
				/>
				<input
					class="input input-bordered w-full"
					type="date"
					name="pengikutTanggalLahir"
					bind:value={follower.tanggalLahir}
				/>
				<button
					class="btn btn-error btn-soft btn-square"
					type="button"
					aria-label="Hapus pengikut"
					onclick={() => (followers = followers.filter((_, row) => row !== index))}
					><Icon name="del" /></button
				>
			</div>
		{:else}<p class="py-2 text-sm opacity-55">Tidak ada pengikut.</p>{/each}
	</div>
</section>

<label class="grid min-w-0 gap-1.5 md:col-span-2"
	><span class="text-sm font-medium">Keterangan Pengikut</span><input
		class="input input-bordered w-full"
		name="keteranganPengikut"
		value={item?.keteranganPengikut ?? ''}
	/></label
>
<label class="grid min-w-0 gap-1.5 md:col-span-2"
	><span class="text-sm font-medium">Keterangan Lain</span><textarea
		class="textarea textarea-bordered min-h-20 w-full resize-y"
		name="keteranganLain"
		rows="2">{item?.keteranganLain ?? item?.keterangan ?? ''}</textarea
	></label
>
