<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import { invalidateAll } from '$app/navigation';
	let {
		fields,
		nama,
		disabled = false
	}: { fields: Record<string, string | number>; nama: string; disabled?: boolean } = $props();
	let dialog: HTMLDialogElement;
	let submitting = $state(false);
</script>

<button
	class="btn btn-error btn-outline btn-square btn-sm shadow-none"
	type="button"
	{disabled}
	title="Hapus status absensi"
	aria-label={`Hapus status absensi ${nama}`}
	onclick={() => dialog.showModal()}
>
	<Icon name="del" />
</button>
<dialog class="modal" bind:this={dialog}>
	<div class="modal-box max-w-md rounded-lg">
		<h3 class="text-lg font-bold">Hapus Status Absensi</h3>
		<p class="mt-2">{nama}</p>
		<FormEnhance
			action="?/clearStatus"
			submitStateChange={(value) => (submitting = value)}
			onsuccess={async () => {
				dialog.close();
				await invalidateAll();
			}}
		>
			{#each Object.entries(fields) as [name, value] (name)}<input
					type="hidden"
					{name}
					{value}
				/>{/each}
			<label class="form-control mt-4"
				><span class="mb-1">Alasan Koreksi</span><textarea
					class="textarea textarea-bordered w-full"
					name="catatan"
					required
					maxlength="500"
					rows="3"></textarea></label
			>
			<div class="modal-action">
				<button
					class="btn btn-ghost"
					type="button"
					disabled={submitting}
					onclick={() => dialog.close()}>Batal</button
				>
				<button class="btn btn-error" type="submit" disabled={submitting}
					><Icon name="del" /> Hapus Status</button
				>
			</div>
		</FormEnhance>
	</div>
</dialog>
