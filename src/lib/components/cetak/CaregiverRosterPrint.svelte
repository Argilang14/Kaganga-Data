<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- Local PDF blob links. */
	import { onMount, onDestroy } from 'svelte';
	import Icon from '$lib/components/icon.svelte';
	import { responsePdfFilename } from '$lib/pdf-filename';
	import type { RosterContext, RosterScope } from '$lib/caregiver-roster';
	let { initialClassId }: { initialClassId?: number } = $props();
	let context = $state<RosterContext>({ period: '', classes: [], dorms: [], caregivers: [] });
	let scope = $state<RosterScope>('kelas');
	let selectedId = $state('');
	let loading = $state(true),
		busy = $state(false),
		failure = $state(''),
		pdfUrl = $state('');
	let filename = $state('Daftar Murid dan Wali Asuh.pdf');
	let controller: AbortController | undefined;
	let destroyed = false;
	const choices = $derived(
		scope === 'kelas' ? context.classes : scope === 'asrama' ? context.dorms : context.caregivers
	);
	const selected = $derived(choices.find((item) => String(item.id) === selectedId));
	const groupLabel = $derived(
		scope === 'kelas' ? 'Kelas' : scope === 'asrama' ? 'Asrama' : 'Wali asuh'
	);
	function clearPreview() {
		if (pdfUrl) URL.revokeObjectURL(pdfUrl);
		pdfUrl = '';
		failure = '';
	}
	async function responseError(response: Response) {
		const data = await response.json().catch(() => null);
		throw new Error(
			data?.message || 'Data cetak belum dapat dimuat. Periksa koneksi atau masuk kembali.'
		);
	}
	async function load() {
		loading = true;
		clearPreview();
		controller?.abort();
		controller = new AbortController();
		try {
			const response = await fetch('/api/pdf/daftar-wali-asuh', {
				cache: 'no-store',
				signal: controller.signal
			});
			if (!response.ok) await responseError(response);
			const data = await response.json();
			if (destroyed) return;
			context = data;
			const groups =
				scope === 'kelas'
					? context.classes
					: scope === 'asrama'
						? context.dorms
						: context.caregivers;
			selectedId = String(
				(scope === 'kelas' ? groups.find((item) => item.id === initialClassId)?.id : undefined) ??
					groups[0]?.id ??
					''
			);
		} catch (cause) {
			if (!destroyed) failure = (cause as Error).message;
		} finally {
			if (!destroyed) loading = false;
		}
	}
	async function preview(event: SubmitEvent) {
		event.preventDefault();
		if (!selected || busy) return;
		clearPreview();
		busy = true;
		controller = new AbortController();
		try {
			const response = await fetch('/api/pdf/daftar-wali-asuh', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ scope, id: selected.id }),
				signal: controller.signal
			});
			if (!response.ok) await responseError(response);
			if (!response.headers.get('content-type')?.includes('application/pdf'))
				throw new Error('PDF tidak dapat dimuat. Silakan masuk kembali lalu coba lagi.');
			const blob = await response.blob();
			if (!blob.size) throw new Error('PDF kosong. Pilih kembali kelompok lalu coba lagi.');
			if (destroyed) return;
			filename = responsePdfFilename(response, 'Daftar Murid dan Wali Asuh.pdf');
			pdfUrl = URL.createObjectURL(blob);
		} catch (cause) {
			if (!destroyed) failure = (cause as Error).message;
		} finally {
			if (!destroyed) busy = false;
		}
	}
	onMount(() => {
		void load();
	});
	onDestroy(() => {
		destroyed = true;
		controller?.abort();
		if (pdfUrl) URL.revokeObjectURL(pdfUrl);
	});
</script>

<section
	class="min-w-0 space-y-4"
	aria-label="Daftar Murid dan Wali Asuh"
	aria-busy={loading || busy}
>
	{#if loading}<p class="py-4 text-sm" role="status">
			<span class="loading loading-spinner loading-sm"></span> Memuat pilihan cetak...
		</p>{/if}
	{#if failure}<div class="alert alert-error alert-soft" role="alert">
			<span class="min-w-0 break-words">{failure}</span><button
				class="btn btn-sm"
				type="button"
				onclick={load}
				disabled={busy}>Muat ulang</button
			>
		</div>{/if}
	{#if !loading}
		<p class="alert alert-info alert-soft text-sm">{context.period || 'Periode belum tersedia'}</p>
		<form onsubmit={preview} class="space-y-4">
			<fieldset disabled={busy} class="grid min-w-0 gap-4 sm:grid-cols-2">
				<legend class="sr-only">Pilihan daftar murid dan wali asuh</legend>
				<label class="min-w-0"
					><span class="mb-1 block text-sm font-medium">Cakupan cetak</span>
					<select
						class="select h-10 w-full"
						bind:value={scope}
						onchange={(event) => {
							clearPreview();
							const value = event.currentTarget.value;
							selectedId = String(
								(value === 'kelas'
									? context.classes
									: value === 'asrama'
										? context.dorms
										: context.caregivers)[0]?.id ?? ''
							);
						}}
						><option value="kelas">Per kelas</option><option value="asrama">Per asrama</option
						><option value="wali-asuh">Per wali asuh</option></select
					>
				</label>
				<label class="min-w-0"
					><span class="mb-1 block text-sm font-medium">{groupLabel}</span>
					<select
						class="select h-10 w-full"
						bind:value={selectedId}
						onchange={clearPreview}
						disabled={!choices.length}
					>
						{#if !choices.length}<option value="">Belum ada pilihan</option>{/if}
						{#each choices as item (item.id)}<option value={String(item.id)}
								>{item.nama} ({item.count} murid)</option
							>{/each}
					</select>
				</label>
			</fieldset>
			{#if !choices.length}<p class="text-sm text-base-content/65" role="status">
					Belum ada murid dalam cakupan ini. Periksa penempatan dan penugasan pada periode aktif.
				</p>{:else}
				<p class="text-sm text-base-content/65">
					{#if scope === 'kelas'}Nama murid, NIS, asrama, dan wali asuh.{:else if scope === 'asrama'}Dikelompokkan
						per wali asuh, disertai kelas setiap anak.{:else}Nama anak, kelas, dan wali kelas.{/if}
				</p>
			{/if}
			<div class="flex flex-wrap items-center justify-between gap-3 border-t border-base-300 pt-4">
				<p class="text-sm text-base-content/65">
					{selected?.count ?? 0} murid / A4 dengan kop sekolah
				</p>
				<button class="btn btn-primary h-10 min-h-10" type="submit" disabled={busy || !selected}
					>{#if busy}<span class="loading loading-spinner loading-sm"></span>Menyiapkan PDF{:else}<Icon
							name="print"
						/>Pratinjau PDF{/if}</button
				>
			</div>
		</form>
	{/if}
	{#if pdfUrl}
		<div class="min-w-0 space-y-3 border-t border-base-300 pt-4">
			<div class="flex flex-wrap justify-between gap-3">
				<h3 class="font-semibold">Pratinjau PDF</h3>
				<div class="flex flex-wrap gap-2">
					<a class="btn btn-sm min-h-10" href={pdfUrl} target="_blank" rel="noopener">Buka PDF</a><a
						class="btn btn-success btn-sm min-h-10"
						href={pdfUrl}
						download={filename}><Icon name="download" />Unduh PDF</a
					>
				</div>
			</div>
			<object
				data={pdfUrl}
				type="application/pdf"
				class="h-[75vh] min-h-96 w-full rounded-lg border border-base-300"
				title="Pratinjau daftar murid dan wali asuh"
				><p class="p-4 text-sm">
					Pratinjau tidak tersedia. Gunakan tombol Buka PDF atau Unduh PDF.
				</p></object
			>
		</div>
	{/if}
</section>
