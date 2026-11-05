<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { tick } from 'svelte';
	import type { DormRoom } from '$lib/dormitory';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';

	let dialog: HTMLDialogElement;
	let target = $state<DormRoom | null>(null);
	let message = $state('');
	let busy = $state(false);

	export async function open(room: DormRoom) {
		target = room;
		message = '';
		await tick();
		dialog.showModal();
	}

	function close() {
		if (!busy) dialog.close();
	}
</script>

<dialog
	bind:this={dialog}
	class="modal"
	aria-labelledby="delete-asrama-title"
	aria-describedby="delete-asrama-description"
	oncancel={(event) => {
		if (busy) event.preventDefault();
	}}
	onclose={() => {
		target = null;
		message = '';
	}}
>
	{#if target}
		{@const room = target}
		<div class="modal-box max-h-[85vh] w-full max-w-2xl overflow-hidden p-0 sm:max-h-[90vh]">
			<FormEnhance
				action="?/save"
				preventDuplicateSubmit
				submitStateChange={(submitting) => {
					busy = submitting;
				}}
				onsuccess={async () => {
					dialog.close();
					await invalidate('app:asrama');
				}}
				onfailure={({ data }) => {
					message = String(data?.message ?? 'Asrama belum dihapus. Muat ulang dan coba lagi.');
				}}
				onerror={() => {
					message = 'Asrama belum dihapus. Periksa koneksi, lalu coba lagi.';
				}}
			>
				{#snippet children({ submitting })}
					<input type="hidden" name="operation" value="delete" />
					<input type="hidden" name="id" value={room.id} />
					<input type="hidden" name="versi" value={room.versi} />
					<input type="hidden" name="confirmDelete" value="true" />
					<div class="flex max-h-[85vh] flex-col sm:max-h-[90vh]">
						<header class="border-base-300 bg-base-100 shrink-0 border-b p-4">
							<div class="flex items-start gap-3">
								<span
									class="bg-error/10 text-error flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
									aria-hidden="true"
								>
									<Icon name="warning" class="text-xl" />
								</span>
								<div class="min-w-0">
									<h3 id="delete-asrama-title" class="text-xl font-bold">Hapus asrama?</h3>
									<p id="delete-asrama-description" class="text-base-content/70 mt-1 text-sm">
										Hapus <strong class="break-words">{room.nama}</strong> dari Data Asrama?
									</p>
								</div>
							</div>
						</header>
						<div class="flex-1 overflow-y-auto p-4">
							<p class="text-base-content/70 text-sm">
								Penempatan murid dan penugasan wali otomatis diakhiri. Murid bisa ditempatkan ke
								asrama lain. Riwayat dan nilai tetap tersimpan.
							</p>
							{#if message}<p class="text-error mt-3 text-sm" role="alert">{message}</p>{/if}
						</div>
						<footer class="border-base-300 bg-base-100 shrink-0 border-t p-4">
							<div class="modal-action mt-0">
								<button
									class="btn btn-soft shadow-none"
									type="button"
									disabled={submitting}
									onclick={close}>Batal</button
								>
								<button
									class="btn btn-error btn-soft shadow-none"
									type="submit"
									disabled={submitting}
								>
									{#if submitting}<span
											class="loading loading-spinner loading-sm"
											aria-hidden="true"
										></span>{:else}<Icon name="del" />{/if}
									{submitting ? 'Menghapus…' : 'Hapus'}
								</button>
							</div>
						</footer>
					</div>
				{/snippet}
			</FormEnhance>
		</div>
		<form method="dialog" class="modal-backdrop">
			<button type="button" onclick={close} disabled={busy} aria-label="Tutup dialog hapus asrama"
				>Tutup</button
			>
		</form>
	{/if}
</dialog>
