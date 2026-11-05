<script lang="ts">
	import { resolve } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import { tick } from 'svelte';
	import Icon from '$lib/components/icon.svelte';
	import type { StudentImportPreview } from '$lib/student-exchange';

	const {
		semesterId,
		schoolId,
		enabled
	}: { semesterId: string; schoolId: number | null; enabled: boolean } = $props();
	let input: HTMLInputElement;
	let dialog: HTMLDialogElement;
	let file = $state<File | null>(null);
	let preview = $state<StudentImportPreview | null>(null);
	let selected = $state<number[]>([]);
	let busy = $state(false);
	let message = $state('');
	let success = $state('');
	let currentPage = $state(1);
	const pageSize = 25;
	const readyRows = $derived(preview?.rows.filter((row) => row.action !== 'blocked') ?? []);
	const blockedCount = $derived((preview?.rows.length ?? 0) - readyRows.length);
	const totalPages = $derived(Math.max(1, Math.ceil((preview?.rows.length ?? 0) / pageSize)));
	const visibleRows = $derived(
		preview?.rows.slice((currentPage - 1) * pageSize, currentPage * pageSize) ?? []
	);

	let previewContext = '';
	const context = $derived(`${schoolId}:${semesterId}`);
	$effect(() => {
		if (context !== previewContext) {
			preview = null;
			selected = [];
		}
	});

	async function send(operation: 'preview' | 'commit') {
		if (!file || busy) return;
		const requestContext = context;
		const requestFile = file;
		busy = true;
		message = '';
		success = '';
		try {
			const form = new FormData();
			form.set('file', requestFile);
			form.set('semesterId', semesterId);
			form.set('operation', operation);
			if (operation === 'commit') {
				if (!preview || previewContext !== requestContext)
					throw new Error('Buat pratinjau ulang untuk semester yang dipilih.');
				form.set('token', preview.token);
				for (const row of selected) form.append('rows', String(row));
			}
			const response = await fetch(resolve('/api/rapor/impor-siswa'), {
				method: 'POST',
				body: form
			});
			const payload = await response.json();
			if (!response.ok)
				throw new Error(payload.message ?? 'Impor belum berhasil. Periksa file dan coba lagi.');
			if (requestContext !== context || requestFile !== file)
				throw new Error('Pilihan semester atau file berubah. Buat pratinjau ulang.');
			if (operation === 'preview') {
				previewContext = requestContext;
				preview = payload as StudentImportPreview;
				selected = preview.rows.filter((row) => row.action !== 'blocked').map((row) => row.row);
				currentPage = 1;
				await tick();
				dialog.showModal();
			} else {
				success = String(payload.message);
				dialog.close();
				preview = null;
				file = null;
				input.value = '';
				await invalidateAll();
			}
		} catch (cause) {
			message = cause instanceof Error ? cause.message : 'Periksa koneksi, lalu coba lagi.';
		} finally {
			busy = false;
		}
	}
	function close() {
		if (!busy) dialog.close();
	}
	function toggle(row: number, checked: boolean) {
		selected = checked ? [...selected, row] : selected.filter((value) => value !== row);
	}
</script>

<div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
	<input
		bind:this={input}
		type="file"
		class="file-input file-input-ghost max-w-full"
		accept=".csv,.xlsx"
		aria-label="File data siswa"
		disabled={!enabled || busy}
		onchange={(event) => {
			file = event.currentTarget.files?.[0] ?? null;
			preview = null;
			message = '';
			success = '';
		}}
	/>
	<button
		type="button"
		class="btn btn-soft shadow-none"
		disabled={!enabled || !semesterId || !file || busy}
		onclick={() => send('preview')}
	>
		{#if busy}<span class="loading loading-spinner loading-sm" aria-hidden="true"></span>{/if}
		Pratinjau impor
	</button>
	{#if enabled}
		<a
			class="btn btn-soft shadow-none"
			href={resolve('/api/rapor/import-siswa-kelas-template')}
			download><Icon name="download" />Download template</a
		>
		{#if semesterId}<a
				class="btn btn-soft shadow-none"
				href={resolve(`/api/rapor/unduh-data-siswa?semesterId=${semesterId}`)}
				download><Icon name="download" />Unduh data siswa</a
			>
			<a
				class="btn btn-soft shadow-none"
				href={resolve(`/api/rapor/unduh-data-siswa?semesterId=${semesterId}&format=csv`)}
				download><Icon name="download" />Unduh CSV</a
			>
		{/if}
	{:else}
		<button type="button" class="btn btn-soft shadow-none" disabled
			><Icon name="download" />Download template</button
		>
		<button type="button" class="btn btn-soft shadow-none" disabled
			><Icon name="download" />Unduh data siswa</button
		>
	{/if}
</div>
<p class="text-base-content/70 mt-1 text-xs">
	Gunakan CSV Setara atau template XLSX: 52 kolom Setara beserta kolom Kaganga. Siswa baru masuk
	Murid Pasif; penempatan siswa lama tetap. Kode QR Murid ikut dicadangkan bagi akun yang memiliki
	izin pengelolaan QR. Kolom QR kosong mempertahankan kode lama. Periksa pratinjau sebelum
	menyimpan.
</p>
{#if message}<p class="text-error mt-2 text-sm" role="alert">{message}</p>{/if}
{#if success}<p class="text-success mt-2 text-sm" role="status">{success}</p>{/if}

<dialog
	bind:this={dialog}
	class="modal"
	aria-labelledby="student-import-title"
	oncancel={(event) => {
		if (busy) event.preventDefault();
	}}
>
	<div
		class="modal-box flex max-h-[90vh] w-[calc(100%-2rem)] max-w-5xl flex-col overflow-hidden p-0"
	>
		<header class="border-base-300 shrink-0 border-b p-4">
			<h3 id="student-import-title" class="text-xl font-bold">Pratinjau impor siswa</h3>
			<p class="text-base-content/70 mt-1 break-words text-sm">
				{preview?.filename} · {preview?.semester}
			</p>
		</header>
		<div class="min-h-0 flex-1 overflow-y-auto p-4">
			{#if preview}
				<p class="mb-3 text-sm">
					{preview.rows.filter((row) => row.action === 'new').length} siswa baru · {preview.rows.filter(
						(row) => row.action === 'update'
					).length} pembaruan · {blockedCount} perlu diperiksa.
				</p>
				<p class="text-base-content/70 mb-3 text-sm">
					Kolom rombel pada file disimpan sebagai informasi sumber. Kelas, asrama, wali asuh, status
					mutasi, dan nilai tidak diubah oleh impor.
				</p>
				<div class="border-base-300 overflow-x-auto rounded-box border">
					<table class="table table-sm">
						<thead
							><tr>
								<th
									><input
										type="checkbox"
										class="checkbox checkbox-sm"
										aria-label="Pilih semua baris siap disimpan"
										checked={readyRows.length > 0 && selected.length === readyRows.length}
										disabled={busy || !readyRows.length}
										onchange={(event) => {
											selected = event.currentTarget.checked ? readyRows.map((row) => row.row) : [];
										}}
									/></th
								>
								<th>Baris</th><th>Nama murid</th><th>NIS</th><th>Hasil</th><th>Catatan</th>
							</tr></thead
						>
						<tbody
							>{#each visibleRows as row (row.row)}<tr>
									<td
										><input
											type="checkbox"
											class="checkbox checkbox-sm"
											aria-label={`Pilih baris ${row.row}: ${row.name}`}
											checked={selected.includes(row.row)}
											disabled={busy || row.action === 'blocked'}
											onchange={(event) => toggle(row.row, event.currentTarget.checked)}
										/></td
									>
									<td>{row.row}</td><td class="min-w-40">{row.name || '(Nama kosong)'}</td>
									<td class="whitespace-nowrap"
										>{row.nis}{#if row.temporary}<span class="text-base-content/60 block text-xs"
												>Sementara</span
											>{/if}</td
									>
									<td
										><span class:text-error={row.action === 'blocked'}
											>{row.action === 'new'
												? 'Baru'
												: row.action === 'update'
													? 'Perbarui'
													: 'Periksa'}</span
										></td
									>
									<td class="min-w-64 whitespace-normal">{row.message}</td>
								</tr>{/each}</tbody
						>
					</table>
				</div>
				{#if totalPages > 1}<div class="mt-3 flex items-center justify-end gap-3">
						<button
							type="button"
							class="btn btn-sm btn-soft"
							disabled={currentPage <= 1}
							onclick={() => currentPage--}>Sebelumnya</button
						>
						<span class="text-sm">{currentPage} / {totalPages}</span>
						<button
							type="button"
							class="btn btn-sm btn-soft"
							disabled={currentPage >= totalPages}
							onclick={() => currentPage++}>Berikutnya</button
						>
					</div>{/if}
			{:else}<p class="text-sm">Pilihan berubah. Tutup dialog dan buat pratinjau ulang.</p>{/if}
			{#if message}<p class="text-error mt-3 text-sm" role="alert">{message}</p>{/if}
		</div>
		<footer
			class="border-base-300 flex shrink-0 flex-wrap items-center justify-end gap-2 border-t p-4"
		>
			<span class="mr-auto text-sm">{selected.length} baris dipilih</span>
			<button type="button" class="btn btn-soft shadow-none" disabled={busy} onclick={close}
				>Batal</button
			>
			<button
				type="button"
				class="btn btn-primary btn-soft shadow-none"
				disabled={busy || !preview || !selected.length}
				onclick={() => send('commit')}>{busy ? 'Menyimpan…' : 'Simpan yang dipilih'}</button
			>
		</footer>
	</div>
	<button
		type="button"
		class="modal-backdrop"
		aria-label="Tutup pratinjau impor"
		disabled={busy}
		onclick={close}
	></button>
</dialog>
