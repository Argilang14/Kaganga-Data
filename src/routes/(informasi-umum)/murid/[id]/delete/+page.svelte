<script lang="ts">
	import { invalidate } from '$app/navigation';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import StudentPassiveFields from '$lib/components/murid/student-passive-fields.svelte';
	import Icon from '$lib/components/icon.svelte';
	import { toast } from '$lib/components/toast.svelte';

	let { data } = $props();

	const handleDeleteSuccess = async ({ data: payload }: { data?: Record<string, unknown> }) => {
		await invalidate('app:murid');
		history.back();
		const message = typeof payload?.message === 'string' ? payload.message : 'Murid menjadi pasif';
		toast({ message, type: 'success', persist: true });
	};
</script>

<FormEnhance action="?/delete" onsuccess={handleDeleteSuccess} showToast={false}>
	{#snippet children({ submitting })}
		<h3 class="mb-4 text-xl font-bold">Jadikan murid pasif?</h3>
		<p class="mb-3 text-sm opacity-70">
			Murid dikeluarkan dari daftar aktif. Nilai, presensi, foto, dan QR tetap tersimpan.
		</p>
		<p>NIS: {data.murid.nis}</p>
		<p>NISN: {data.murid.nisn}</p>
		<p>Nama: <b>{data.murid.nama}</b></p>

		<StudentPassiveFields />
		<div class="mt-4 flex justify-end gap-2">
			<button class="btn btn-soft shadow-none" type="button" onclick={() => history.back()}>
				<Icon name="close" />
				Batal
			</button>

			<button class="btn btn-error btn-soft shadow-none" disabled={submitting}>
				{#if submitting}
					<div class="loading loading-spinner"></div>
				{:else}
					<Icon name="del" />
				{/if}
				Jadikan pasif
			</button>
		</div>
	{/snippet}
</FormEnhance>
