<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- PDF links use local blob URLs. */
	import { onMount, onDestroy } from 'svelte';
	import Icon from '$lib/components/icon.svelte';
	import { responsePdfFilename } from '$lib/pdf-filename';
	import {
		MAX_INFORMATION_STUDENTS,
		type InformationPrintContext
	} from '$lib/student-profile-print';
	let { initialClassId }: { initialClassId?: number } = $props();
	let context = $state<InformationPrintContext>({ classes: [] });
	let kelasId = $state('');
	let muridId = $state('');
	let scope = $state('single');
	let background = $state('default');
	let maskIdentity = $state(true);
	let backgroundFile = $state<File | null>(null);
	let backgroundUrl = $state('');
	let pdfUrl = $state('');
	let filename = $state('Informasi Siswa.pdf');
	let loading = $state(true);
	let busy = $state(false);
	let failure = $state('');
	let destroyed = false;
	let controller: AbortController | undefined;
	const group = $derived(context.classes.find((item) => item.id === Number(kelasId)));
	const count = $derived(scope === 'class' ? (group?.students.length ?? 0) : muridId ? 1 : 0);
	const ready = $derived(
		!loading &&
			!busy &&
			count > 0 &&
			count <= MAX_INFORMATION_STUDENTS &&
			(background !== 'custom' || backgroundFile !== null)
	);
	function clearPreview() {
		if (pdfUrl) URL.revokeObjectURL(pdfUrl);
		pdfUrl = '';
		failure = '';
	}
	async function result(response: Response) {
		const data = await response.json().catch(() => null);
		if (!response.ok || !data)
			throw new Error(
				data?.message || 'Data cetak belum dapat dimuat. Periksa koneksi atau masuk kembali.'
			);
		return data;
	}
	async function load() {
		loading = true;
		failure = '';
		controller?.abort();
		controller = new AbortController();
		try {
			const data = await result(
				await fetch('/api/pdf/informasi-siswa', { cache: 'no-store', signal: controller.signal })
			);
			if (destroyed) return;
			context = data;
			kelasId = String(
				context.classes.find((item) => item.id === initialClassId)?.id ??
					context.classes[0]?.id ??
					''
			);
			muridId = String(
				context.classes.find((item) => item.id === Number(kelasId))?.students[0]?.id ?? ''
			);
		} catch (cause) {
			if (!destroyed) failure = (cause as Error).message;
		} finally {
			if (!destroyed) loading = false;
		}
	}
	function chooseBackground(event: Event) {
		clearPreview();
		const input = event.currentTarget as HTMLInputElement,
			file = input.files?.[0];
		if (!file) return;
		if (
			!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
			!file.size ||
			file.size > 5 * 1024 * 1024
		) {
			failure = 'Pilih gambar JPG, PNG, atau WebP maksimal 5 MB.';
			input.value = '';
			return;
		}
		if (backgroundUrl) URL.revokeObjectURL(backgroundUrl);
		backgroundFile = file;
		backgroundUrl = URL.createObjectURL(file);
	}
	async function preview(event: SubmitEvent) {
		event.preventDefault();
		if (!ready) return;
		clearPreview();
		busy = true;
		controller = new AbortController();
		try {
			const form = new FormData();
			form.set(
				'options',
				JSON.stringify({
					kelasId: Number(kelasId),
					muridId: scope === 'class' ? null : Number(muridId),
					maskIdentity,
					background
				})
			);
			if (background === 'custom' && backgroundFile) form.set('background', backgroundFile);
			const response = await fetch('/api/pdf/informasi-siswa', {
				method: 'POST',
				body: form,
				signal: controller.signal
			});
			if (!response.ok) {
				await result(response);
				return;
			}
			if (!response.headers.get('content-type')?.includes('application/pdf'))
				throw new Error('PDF tidak dapat dimuat. Silakan masuk kembali lalu coba lagi.');
			const blob = await response.blob();
			if (!blob.size) throw new Error('PDF kosong. Pilih kembali murid lalu coba lagi.');
			if (destroyed) return;
			filename = responsePdfFilename(response, 'Informasi Siswa.pdf');
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
		if (backgroundUrl) URL.revokeObjectURL(backgroundUrl);
	});
</script>

<section class="min-w-0 space-y-4" aria-label="Cetak informasi siswa" aria-busy={loading || busy}>
	<div class="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 pb-4">
		<h3 class="text-base font-semibold">Informasi Siswa</h3>
		<span class="badge badge-info badge-soft">A4 landscape / 1 murid per halaman</span>
	</div>
	{#if loading}<p class="flex items-center gap-2 py-6 text-sm" role="status">
			<span class="loading loading-spinner loading-sm"></span>Memuat kelas dan murid...
		</p>{/if}
	{#if failure}<div class="alert alert-error alert-soft" role="alert">
			<Icon name="warning" /><span class="min-w-0 break-words">{failure}</span>
		</div>{/if}
	{#if !loading && !context.classes.length}<div
			class="flex flex-wrap items-center justify-between gap-3 border border-dashed border-base-300 p-4"
		>
			<p class="text-sm">Belum ada murid aktif dalam cakupan cetak akun ini.</p>
			<button type="button" class="btn btn-sm" onclick={load}
				><Icon name="repeat" />Muat ulang</button
			>
		</div>
	{:else if !loading}
		<form onsubmit={preview} class="min-w-0 space-y-4">
			<fieldset disabled={busy} class="grid min-w-0 gap-4 sm:grid-cols-2">
				<legend class="sr-only">Pilihan cetak informasi siswa</legend>
				<label class="min-w-0"
					><span class="mb-1 block text-sm font-medium">Kelas</span><select
						class="select h-10 w-full"
						bind:value={kelasId}
						onchange={(event) => {
							clearPreview();
							muridId = String(
								context.classes.find((item) => item.id === Number(event.currentTarget.value))
									?.students[0]?.id ?? ''
							);
						}}
						>{#each context.classes as item (item.id)}<option value={String(item.id)}
								>{item.nama}</option
							>{/each}</select
					></label
				>
				<fieldset class="min-w-0">
					<legend class="mb-1 text-sm font-medium">Cakupan cetak</legend>
					<div class="join flex h-10">
						<label
							class="btn join-item h-10 min-h-10 flex-1 has-focus-visible:outline-2 has-focus-visible:outline-offset-2"
							class:btn-success={scope === 'single'}
							><input
								class="sr-only"
								type="radio"
								name="information-scope"
								value="single"
								bind:group={scope}
								onchange={clearPreview}
							/>Satu murid</label
						>
						<label
							class="btn join-item h-10 min-h-10 flex-1 has-focus-visible:outline-2 has-focus-visible:outline-offset-2"
							class:btn-success={scope === 'class'}
							><input
								class="sr-only"
								type="radio"
								name="information-scope"
								value="class"
								bind:group={scope}
								onchange={clearPreview}
							/>Satu kelas</label
						>
					</div>
				</fieldset>
				{#if scope === 'single'}<label class="min-w-0"
						><span class="mb-1 block text-sm font-medium">Murid</span><select
							class="select h-10 w-full"
							bind:value={muridId}
							onchange={clearPreview}
							>{#each group?.students ?? [] as student (student.id)}<option
									value={String(student.id)}>{student.nama}</option
								>{/each}</select
						></label
					>{:else}<div class="flex min-h-10 items-center gap-2 self-end text-sm">
						<span class="badge badge-success badge-soft">{count} murid</span><span
							class="text-base-content/65">Sesuai cakupan akses akun</span
						>
					</div>{/if}
				<label class="min-w-0"
					><span class="mb-1 block text-sm font-medium">Latar dokumen</span><select
						class="select h-10 w-full"
						bind:value={background}
						onchange={clearPreview}
						><option value="default">Biru / sesuai contoh</option><option value="none"
							>Putih / hemat tinta</option
						><option value="custom">Gambar kustom</option></select
					></label
				>
				{#if background === 'custom'}<div class="min-w-0 sm:col-span-2">
						<label class="block min-w-0"
							><span class="mb-1 block text-sm font-medium"
								>Background kustom (JPG/PNG/WebP, maks. 5 MB)</span
							><input
								type="file"
								class="file-input h-10 w-full"
								accept="image/jpeg,image/png,image/webp"
								onchange={chooseBackground}
							/></label
						>{#if backgroundUrl}<div class="mt-3 flex min-w-0 items-center gap-3">
								<img
									class="h-16 w-24 shrink-0 rounded border border-base-300 object-contain"
									src={backgroundUrl}
									alt="Background terpilih"
								/><span class="min-w-0 break-words text-sm text-base-content/65"
									>{backgroundFile?.name}</span
								>
							</div>{/if}
					</div>{/if}
				<label class="flex min-h-10 cursor-pointer items-center gap-3 text-sm sm:col-span-2"
					><input
						type="checkbox"
						class="checkbox checkbox-sm checkbox-success shrink-0"
						checked={maskIdentity}
						onchange={(event) => {
							if (
								!event.currentTarget.checked &&
								!window.confirm(
									'Tampilkan NIK dan KK lengkap di PDF? Dokumen ini hanya untuk keperluan internal sekolah.'
								)
							) {
								event.currentTarget.checked = true;
								return;
							}
							maskIdentity = event.currentTarget.checked;
							clearPreview();
						}}
					/>Samarkan NIK dan KK</label
				>
			</fieldset>
			{#if !maskIdentity}<p
					class="border-l-2 border-warning pl-3 text-sm text-base-content/75"
					role="status"
				>
					PDF akan memuat NIK dan KK lengkap.
				</p>{/if}
			{#if count > MAX_INFORMATION_STUDENTS}<p class="text-sm text-error" role="alert">
					Maksimal {MAX_INFORMATION_STUDENTS} murid per PDF. Pilih satu murid.
				</p>{/if}
			<div class="flex flex-wrap items-center justify-between gap-3 border-t border-base-300 pt-4">
				<p class="text-sm text-base-content/65">{count} halaman / Data profil terkini</p>
				<button class="btn btn-primary h-10 min-h-10" type="submit" disabled={!ready}
					>{#if busy}<span class="loading loading-spinner loading-sm"></span>Menyiapkan PDF{:else}<Icon
							name="print"
						/>Pratinjau PDF{/if}</button
				>
			</div>
		</form>
	{/if}
	{#if pdfUrl}<div
			class="min-w-0 border-t border-base-300 pt-4"
			aria-label="Pratinjau informasi siswa"
		>
			<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
				<h3 class="text-base font-semibold">Pratinjau Informasi Siswa</h3>
				<div class="flex flex-wrap gap-2">
					<a class="btn btn-sm min-h-10" href={pdfUrl} target="_blank" rel="noopener"
						><Icon name="print" />Buka PDF</a
					><a class="btn btn-success btn-sm min-h-10" href={pdfUrl} download={filename}
						><Icon name="download" />Unduh PDF</a
					>
				</div>
			</div>
			<object
				data={pdfUrl}
				type="application/pdf"
				class="h-[75vh] min-h-96 w-full rounded-lg border border-base-300"
				title="Pratinjau PDF informasi siswa"
				><p class="p-4 text-sm">
					Pratinjau tidak tersedia di browser ini. <a
						class="link"
						href={pdfUrl}
						target="_blank"
						rel="noopener">Buka PDF</a
					>
				</p></object
			>
		</div>{/if}
</section>
