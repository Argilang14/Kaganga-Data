<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import type { loadMuridPurgePlan } from '$lib/server/murid-purge';

	let dialogEl: HTMLDialogElement | null = null;
	let target = $state<{ id: number; nama: string } | null>(null);
	let preview = $state<Awaited<ReturnType<typeof loadMuridPurgePlan>> | null>(null);
	let busy = $state(false);
	let confirmName = $state('');
	let reason = $state('');
	let acknowledged = $state(false);
	let previewError = $state('');
	const previewSubmit: SubmitFunction = () => {
		busy = true;
		previewError = '';
		return async ({ result, update }) => {
			try {
				if (result.type === 'success')
					preview = (result.data?.purgePreview as typeof preview) ?? null;
				else if (result.type === 'failure')
					previewError = String(result.data?.fail ?? 'Pemeriksaan gagal.');
				else if (result.type === 'redirect') await update();
				else previewError = 'Pemeriksaan gagal. Muat ulang halaman dan coba lagi.';
			} finally {
				busy = false;
			}
		};
	};
	function reset() {
		target = null;
		preview = null;
		confirmName = '';
		reason = '';
		acknowledged = false;
		previewError = '';
	}
	export function open(row: { id: number; nama: string }) {
		reset();
		target = row;
		requestAnimationFrame(() => dialogEl?.showModal());
	}
	function close() {
		if (!busy) dialogEl?.close();
	}
	async function deleted() {
		await invalidate('app:murid');
		await invalidate('app:murid-arsip');
		dialogEl?.close();
	}
</script>

<dialog
	bind:this={dialogEl}
	class="modal"
	aria-labelledby="purge-murid-title"
	onclose={reset}
	oncancel={(event) => {
		if (busy) event.preventDefault();
	}}
>
	{#if target}
		{@const selected = target}
		<div
			class="modal-box max-h-[90dvh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-lg bg-base-100"
		>
			<header class="flex items-start justify-between gap-3">
				<div>
					<h2 id="purge-murid-title" class="text-lg font-bold">Hapus Permanen</h2>
					<p class="text-sm">{target.nama}</p>
				</div>
				<button
					class="btn btn-ghost btn-sm btn-square"
					type="button"
					onclick={close}
					disabled={busy}
					aria-label="Tutup"><Icon name="close" /></button
				>
			</header>
			{#if !preview}
				{#if previewError}<div class="alert alert-warning">
						<Icon name="warning" /><span>{previewError}</span>
					</div>{/if}
				<form method="POST" action="?/previewPurge" use:enhance={previewSubmit}>
					<input type="hidden" name="lifecycleIds" value={selected.id} />
					<div class="flex justify-end">
						<button type="submit" class="btn btn-soft" disabled={busy}
							><Icon name="eye" /> Periksa Dampak Penghapusan</button
						>
					</div>
				</form>
			{:else}
				{@const plan = preview}
				<dl class="grid grid-cols-[1fr_auto] gap-2 border-y border-base-300 py-3 text-sm">
					<dt>Data murid lintas periode</dt>
					<dd class="font-semibold">{preview.periods}</dd>
					<dt>Riwayat kelas</dt>
					<dd class="font-semibold">{preview.historyCount}</dd>
				</dl>
				{#if preview.dependencies.length}
					<div class="overflow-x-auto">
						<table class="table table-sm">
							<thead><tr><th>Data terkait</th><th>Jumlah</th><th>Dampak</th></tr></thead><tbody
								>{#each preview.dependencies as item, index (`${item.table}-${index}`)}<tr
										><td class="break-all">{item.table.replaceAll('_', ' ')}</td><td
											>{item.count}</td
										><td>{item.effect === 'hapus' ? 'Dihapus' : 'Snapshot dipertahankan'}</td></tr
									>{/each}</tbody
							>
						</table>
					</div>
				{/if}
				{#if preview.blockers.length}
					<div class="alert alert-warning">
						<Icon name="warning" />
						<ul>
							{#each preview.blockers as item (item)}<li>{item}</li>{/each}
						</ul>
					</div>
				{:else}
					<div class="alert alert-error items-start">
						<Icon name="warning" /><span
							>Data murid, nilai, presensi dan riwayat terkait akan dihapus permanen. Pemulihan
							hanya melalui backup database. Foto fisik dan snapshot dokumen tidak dihapus otomatis.</span
						>
					</div>
					<FormEnhance
						action="?/purge"
						submitStateChange={(state) => (busy = state)}
						onsuccess={deleted}
					>
						{#snippet children({ submitting })}
							<input type="hidden" name="lifecycleIds" value={plan.lifecycleId} />
							<input type="hidden" name="fingerprint" value={plan.fingerprint} />
							<div class="space-y-3">
								<label class="block"
									><span class="mb-1 block text-sm">Ketik nama: <strong>{plan.nama}</strong></span
									><input
										class="input w-full"
										name="confirmName"
										bind:value={confirmName}
										required
										autocomplete="off"
									/></label
								>
								<label class="block"
									><span class="mb-1 block text-sm">Alasan Penghapusan</span><textarea
										class="textarea w-full"
										name="alasan"
										bind:value={reason}
										maxlength="500"
										required></textarea></label
								>
								<label class="flex items-start gap-2 text-sm"
									><input
										class="checkbox checkbox-sm"
										type="checkbox"
										name="purgeAck"
										value="true"
										bind:checked={acknowledged}
										required
									/> Saya menyetujui penghapusan permanen seluruh data yang tercantum. Backup database
									otomatis harus berhasil sebelum penghapusan.</label
								>
								<div class="flex flex-wrap justify-end gap-2">
									<button class="btn btn-ghost" type="button" onclick={close} disabled={submitting}
										>Batal</button
									><button
										class="btn btn-error"
										type="submit"
										disabled={submitting ||
											confirmName !== plan.nama ||
											!reason.trim() ||
											!acknowledged}
										>{#if submitting}<span class="loading loading-spinner loading-sm"
											></span>{/if}<Icon name="del" /> Hapus Permanen</button
									>
								</div>
							</div>
						{/snippet}
					</FormEnhance>
				{/if}
			{/if}
		</div>
	{/if}
</dialog>
