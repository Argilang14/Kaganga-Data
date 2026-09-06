<script lang="ts">
	import { hideModal, updateModal } from '$lib/components/global-modal.svelte';
	import { onMount } from 'svelte';

	type Employee = { id: number; nama: string; nip: string; jenis: string };

	let {
		employees,
		isAdmin,
		activeEmployeeId
	}: { employees: Employee[]; isAdmin: boolean; activeEmployeeId: number | null } = $props();
	let formElement: HTMLFormElement;

	onMount(() => {
		updateModal({
			onPositive: {
				label: 'Simpan Pengajuan',
				icon: 'save',
				class: 'btn-primary',
				action: () => formElement.requestSubmit()
			},
			onNeutral: { label: 'Batal', action: () => hideModal() },
			onNegative: undefined
		});
	});
</script>

<form
	bind:this={formElement}
	method="POST"
	action="?/create"
	enctype="multipart/form-data"
	class="grid w-full items-start gap-5 md:grid-cols-2"
>
	{#if isAdmin}
		<label class="grid min-w-0 gap-1.5 md:col-span-2">
			<span class="text-sm font-medium">Pegawai</span>
			<select class="select select-bordered w-full" name="pegawaiId" required>
				<option value="">Pilih pegawai</option>
				{#each employees as employee}
					<option value={employee.id}>{employee.nama} - {employee.nip || '-'}</option>
				{/each}
			</select>
		</label>
	{:else if activeEmployeeId}
		<input type="hidden" name="pegawaiId" value={activeEmployeeId} />
	{:else}
		<div class="alert alert-warning md:col-span-2">
			Akun ini belum terhubung dengan Data Pegawai.
		</div>
	{/if}

	<label class="grid min-w-0 gap-1.5 md:col-span-2">
		<span class="text-sm font-medium">Maksud Perjalanan</span>
		<textarea
			class="textarea textarea-bordered min-h-24 w-full resize-y"
			name="maksud"
			placeholder="Contoh: Menghadiri rapat koordinasi atau kegiatan dinas lainnya"
			required
		></textarea>
	</label>

	<label class="grid min-w-0 gap-1.5 md:col-span-2">
		<span class="text-sm font-medium">Undangan</span>
		<input
			class="file-input file-input-bordered w-full"
			type="file"
			name="undangan"
			accept=".pdf,application/pdf"
		/>
		<span class="text-base-content/55 text-xs">Opsional, berkas PDF maksimal 10 MB.</span>
	</label>

	<label class="grid min-w-0 gap-1.5 md:col-span-2">
		<span class="text-sm font-medium">Tempat Tujuan</span>
		<input class="input input-bordered w-full" name="tempatTujuan" required />
	</label>

	<label class="grid min-w-0 gap-1.5">
		<span class="text-sm font-medium">Tanggal Berangkat</span>
		<input class="input input-bordered w-full" type="date" name="tanggalBerangkat" required />
	</label>
	<label class="grid min-w-0 gap-1.5">
		<span class="text-sm font-medium">Tanggal Kembali</span>
		<input class="input input-bordered w-full" type="date" name="tanggalKembali" required />
	</label>

	<label class="grid min-w-0 gap-1.5 md:col-span-2">
		<span class="text-sm font-medium">Catatan</span>
		<textarea
			class="textarea textarea-bordered min-h-20 w-full resize-y"
			name="catatan"
			placeholder="Catatan tambahan (opsional)"
		></textarea>
	</label>
</form>
