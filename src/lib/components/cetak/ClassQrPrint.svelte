<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- PDF links use local blob URLs, not application routes. */
	import Icon from '$lib/components/icon.svelte';
	import { onDestroy, untrack } from 'svelte';
	import { responsePdfFilename } from '$lib/pdf-filename';
	import type { ClassQrPrintContext } from '$lib/class-monitoring';

	let { context }: { context: ClassQrPrintContext } = $props();
	let selected = $state<number[]>(untrack(() => context.kelasList.map((item) => item.id)));
	let readyIds = $state<number[]>([]);
	let busy = $state(false);
	let errorMessage = $state('');
	let pdfUrl = $state('');
	let filename = $state('QR Kelas.pdf');
	let resetClassId = $state('');
	let confirmReset = $state(false);
	let picker = $state<HTMLDetailsElement>();
	let controller: AbortController | undefined;
	let destroyed = false;
	const resetClass = $derived(context.kelasList.find((item) => item.id === Number(resetClassId)));
	const pdfReady = $derived(selected.length > 0 && selected.every((id) => readyIds.includes(id)));
	const selectionLabel = $derived(
		selected.length === context.kelasList.length
			? 'Semua kelas'
			: selected.length === 1
				? (context.kelasList.find((item) => item.id === selected[0])?.nama ?? '1 kelas')
				: selected.length + ' kelas dipilih'
	);

	function clearPreview() {
		if (pdfUrl) URL.revokeObjectURL(pdfUrl);
		pdfUrl = '';
		readyIds = [];
		errorMessage = '';
	}
	function toggleClass(id: number) {
		clearPreview();
		selected = selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
	}
	async function responseError(response: Response) {
		const payload = await response.json().catch(() => null);
		return payload?.message || payload?.error || 'Dokumen gagal dibuat. Silakan coba lagi.';
	}
	async function createPreview() {
		if (busy || !selected.length) return;
		if (picker) picker.open = false;
		clearPreview();
		busy = true;
		controller = new AbortController();
		const requestedIds = [...selected];
		try {
			const response = await fetch('/api/pdf/qr-kelas', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ kelasIds: requestedIds }),
				signal: controller.signal
			});
			if (!response.ok) throw new Error(await responseError(response));
			if (!response.headers.get('content-type')?.includes('application/pdf'))
				throw new Error('PDF tidak dapat dimuat. Silakan masuk kembali dan coba lagi.');
			const blob = await response.blob();
			if (!blob.size) throw new Error('PDF kosong. Silakan coba lagi.');
			if (destroyed) return;
			pdfUrl = URL.createObjectURL(blob);
			filename = responsePdfFilename(response, 'QR Kelas.pdf');
			readyIds = requestedIds;
		} catch (cause) {
			if (!destroyed)
				errorMessage =
					cause instanceof Error ? cause.message : 'PDF gagal dibuat. Silakan coba lagi.';
		} finally {
			if (!destroyed) busy = false;
		}
	}
	async function resetQr() {
		if (busy || !resetClass || !confirmReset) return;
		busy = true;
		clearPreview();
		controller = new AbortController();
		try {
			const response = await fetch('/api/administrasi/absensi/monitoring-kelas', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'resetQr', kelasId: resetClass.id }),
				signal: controller.signal
			});
			if (!response.ok) throw new Error(await responseError(response));
			confirmReset = false;
		} catch (cause) {
			if (!destroyed)
				errorMessage =
					cause instanceof Error ? cause.message : 'QR gagal dibuat ulang. Silakan coba lagi.';
		} finally {
			if (!destroyed) busy = false;
		}
	}
	onDestroy(() => {
		destroyed = true;
		controller?.abort();
		if (pdfUrl) URL.revokeObjectURL(pdfUrl);
	});
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape' && picker?.open && picker.contains(document.activeElement)) {
			picker.open = false;
			picker.querySelector('summary')?.focus();
		}
	}}
	onclick={(event) => {
		if (picker?.open && event.target instanceof Node && !picker.contains(event.target))
			picker.open = false;
	}}
/>

<section class="min-w-0 space-y-4" aria-label="Cetak QR kelas" aria-busy={busy}>
	<div class="flex flex-wrap items-center justify-between gap-3 border-b border-base-200 pb-4">
		<p class="min-w-0 break-words text-sm text-base-content/65">{context.contextLabel}</p>
		<span class="badge badge-info badge-soft">A4 · 4 QR per halaman</span>
	</div>
	{#if !context.kelasList.length}
		<div class="alert alert-info" role="status">
			<Icon name="info" /><span>Belum ada kelas pada tahun ajaran aktif.</span>
		</div>
	{:else}
		<div class="grid min-w-0 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
			<div class="min-w-0">
				<span id="qr-class-picker-label" class="mb-1 block text-sm font-medium"
					>Kelas yang dicetak</span
				>
				<details bind:this={picker} class="dropdown w-full">
					<summary
						class="btn min-h-11 w-full flex-nowrap justify-between text-left font-normal"
						class:btn-success={pdfReady}
						aria-labelledby="qr-class-picker-label qr-class-selection"
						aria-disabled={busy}
						onclick={(event) => {
							if (busy) event.preventDefault();
						}}
					>
						<Icon name="grid" class="size-4 shrink-0" /><span
							id="qr-class-selection"
							class="min-w-0 flex-1 break-words">{selectionLabel}</span
						>
						{#if pdfReady}<Icon name="check" class="size-4 shrink-0" />{/if}
						<Icon name="down" class="size-4 shrink-0" />
					</summary>
					<div
						class="dropdown-content z-20 mt-2 w-full rounded-lg border border-base-300 bg-base-100 p-2 shadow-lg"
					>
						<fieldset disabled={busy} class="min-w-0">
							<legend class="sr-only">Pilih kelas yang dicetak</legend>
							<label
								class="flex min-h-11 cursor-pointer items-center gap-3 border-b border-base-200 px-2 pb-2 text-sm font-semibold"
							>
								<input
									class="checkbox checkbox-sm"
									type="checkbox"
									checked={selected.length === context.kelasList.length}
									indeterminate={selected.length > 0 && selected.length < context.kelasList.length}
									onchange={() => {
										clearPreview();
										selected =
											selected.length === context.kelasList.length
												? []
												: context.kelasList.map((item) => item.id);
									}}
								/> Semua kelas
							</label>
							<div class="max-h-60 overflow-y-auto overscroll-contain">
								{#each context.kelasList as kelas (kelas.id)}
									<label
										class={`flex min-h-11 min-w-0 cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-base-200 ${readyIds.includes(kelas.id) ? 'bg-success/10' : ''}`}
									>
										<input
											type="checkbox"
											class="checkbox checkbox-sm shrink-0"
											checked={selected.includes(kelas.id)}
											onchange={() => toggleClass(kelas.id)}
										/><span class="min-w-0 break-words">{kelas.nama}</span>
									</label>
								{/each}
							</div>
						</fieldset>
					</div>
				</details>
			</div>
			<button
				class="btn min-h-11"
				type="button"
				onclick={createPreview}
				disabled={busy || !selected.length}
			>
				{#if busy}<span class="loading loading-spinner loading-xs"></span>{:else}<Icon
						name="print"
					/>{/if} Cetak
			</button>
		</div>
		<div class="flex flex-wrap items-center justify-between gap-3">
			<span class="badge badge-soft" class:badge-success={pdfReady} role="status"
				>{pdfReady ? 'PDF siap' : selected.length + ' kelas dipilih'}</span
			>
			<details class="min-w-0 text-sm">
				<summary class="cursor-pointer py-2 text-base-content/65">Buat ulang QR</summary>
				<div class="mt-2 flex min-w-0 flex-wrap items-end gap-2">
					<label class="block min-w-0 flex-1"
						><span class="mb-1 block">Kelas</span><select
							class="select w-full"
							bind:value={resetClassId}
							disabled={busy}
							onchange={() => (confirmReset = false)}
							><option value="">Pilih kelas</option
							>{#each context.kelasList as kelas (kelas.id)}<option value={kelas.id}
									>{kelas.nama}</option
								>{/each}</select
						></label
					>
					<button
						class="btn btn-error btn-soft min-h-11"
						type="button"
						disabled={busy || !resetClass}
						onclick={() => (confirmReset = true)}><Icon name="repeat" /> Buat ulang</button
					>
				</div>
			</details>
		</div>
	{/if}
	{#if confirmReset && resetClass}
		<div class="alert alert-warning items-start">
			<Icon name="warning" />
			<div class="min-w-0">
				<p class="break-words font-semibold">Buat ulang QR {resetClass.nama}?</p>
				<p class="mt-1 text-sm">QR lama tidak berlaku lagi setelah diganti.</p>
				<div class="mt-3 flex flex-wrap gap-2">
					<button
						class="btn btn-error btn-sm min-h-10"
						type="button"
						onclick={resetQr}
						disabled={busy}>Konfirmasi</button
					><button
						class="btn btn-sm min-h-10"
						type="button"
						onclick={() => (confirmReset = false)}
						disabled={busy}>Batal</button
					>
				</div>
			</div>
		</div>
	{/if}
	{#if errorMessage}<div class="alert alert-error" role="alert">
			<Icon name="error" /><span>{errorMessage}</span>
		</div>{/if}
	{#if pdfUrl}
		<div class="border-t border-base-200 pt-4" aria-label="Pratinjau PDF QR kelas">
			<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
				<h3 class="text-base font-semibold">Preview QR Kelas</h3>
				<div class="flex flex-wrap gap-2">
					<a class="btn btn-sm min-h-10" href={pdfUrl} target="_blank" rel="noopener"
						><Icon name="print" /> Buka PDF</a
					><a class="btn btn-success btn-sm min-h-10" href={pdfUrl} download={filename}
						><Icon name="download" /> Unduh PDF</a
					>
				</div>
			</div>
			<object
				data={pdfUrl}
				type="application/pdf"
				class="h-[75vh] min-h-96 w-full rounded-lg border border-base-300"
				title="Preview PDF QR Kelas"
				><p class="p-4 text-sm">
					Pratinjau PDF tidak tersedia di browser ini. <a
						class="link"
						href={pdfUrl}
						target="_blank"
						rel="noopener">Buka PDF</a
					>
				</p></object
			>
		</div>
	{/if}
</section>
