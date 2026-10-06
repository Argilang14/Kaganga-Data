<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/icon.svelte';
	import { onDestroy } from 'svelte';
	import { responsePdfFilename } from '$lib/pdf-filename';
	const today = new Date();
	const end = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
	let startDate = $state(page.url.searchParams.get('tanggal_mulai') ?? `${end.slice(0, 7)}-01`);
	let endDate = $state(page.url.searchParams.get('tanggal_selesai') ?? end);
	let search = $state(page.url.searchParams.get('q') ?? '');
	let previewUrl = $state('');
	let filename = $state('Buku Tamu Digital.pdf');
	let error = $state('');
	let busy = $state(false);
	let controller: AbortController | undefined;
	onDestroy(() => { controller?.abort(); if (previewUrl) URL.revokeObjectURL(previewUrl); });
	async function preview(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		error = '';
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = '';
		controller = new AbortController();
		try {
			if (startDate > endDate) throw new Error('Tanggal mulai tidak boleh setelah tanggal selesai.');
			const response = await fetch(`/api/buku-tamu/print?${new URLSearchParams({ tanggal_mulai: startDate, tanggal_selesai: endDate, q: search })}`, { signal: controller.signal });
			if (!response.ok) throw new Error('PDF Buku Tamu tidak dapat dimuat. Periksa izin dan rentang tanggal.');
			filename = responsePdfFilename(response);
			previewUrl = URL.createObjectURL(await response.blob());
		} catch (e) { if (!controller.signal.aborted) error = e instanceof Error ? e.message : 'Gagal memuat PDF.'; }
		finally { busy = false; }
	}
</script>
<form
	class="border-base-300 bg-base-200/30 grid items-end gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4"
	onsubmit={preview}
>
	<label class="flex min-w-0 flex-col gap-2">Tanggal Mulai<input class="input w-full" type="date" bind:value={startDate} required /></label>
	<label class="flex min-w-0 flex-col gap-2">Tanggal Selesai<input class="input w-full" type="date" bind:value={endDate} required /></label>
	<label class="flex min-w-0 flex-col gap-2">Cari Tamu<input class="input w-full" bind:value={search} /></label>
	<button class="btn btn-primary" disabled={busy}><Icon name="eye" /> {busy ? 'Memuat...' : 'Preview PDF'}</button>
</form>
{#if error}<div class="alert alert-error mt-4" role="alert">{error}</div>{/if}
{#if previewUrl}
	<div class="mt-4 flex flex-wrap items-center justify-between gap-3"><span class="break-all text-sm">{filename}</span><a class="btn btn-primary" href={previewUrl} download={filename}><Icon name="download" /> Unduh PDF</a></div>
	<iframe class="mt-4 h-[80vh] w-full border border-base-300" src={previewUrl} title="Preview PDF Buku Tamu Digital"></iframe>
{/if}
