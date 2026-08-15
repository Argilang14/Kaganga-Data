<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import { onDestroy } from 'svelte';

	type Props = {
		isOpen?: boolean;
		pegawaiId: number;
		pegawaiNama: string;
		onSuccess?: (filename: string) => void;
	};

	let { isOpen = $bindable(false), pegawaiId, pegawaiNama, onSuccess }: Props = $props();
	let dialogRef: HTMLDialogElement | null = $state(null);
	let inputRef: HTMLInputElement | null = $state(null);
	let selectedFile: File | null = $state(null);
	let previewUrl: string | null = $state(null);
	let uploading = $state(false);

	function clearPreview() {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = null;
		selectedFile = null;
		if (inputRef) inputRef.value = '';
	}

	function closeModal() {
		if (uploading) return;
		clearPreview();
		isOpen = false;
		dialogRef?.close();
	}

	function handleFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		clearPreview();
		if (!file) return;

		if (!['image/png', 'image/jpeg'].includes(file.type)) {
			toast({ message: 'Foto harus berformat JPG atau PNG.', type: 'error' });
			return;
		}
		if (file.size > 500 * 1024) {
			toast({ message: 'Ukuran foto maksimal 500 KB.', type: 'error' });
			return;
		}

		selectedFile = file;
		previewUrl = URL.createObjectURL(file);
	}

	async function savePhoto() {
		if (!selectedFile || uploading) return;
		uploading = true;
		try {
			const body = new FormData();
			body.append('foto', selectedFile);
			const response = await fetch(`/api/pegawai-photo/${pegawaiId}`, { method: 'POST', body });
			const result = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(result.message || 'Foto pegawai gagal disimpan.');

			onSuccess?.(String(result.foto));
			toast({
				message: String(result.message || 'Foto pegawai berhasil diperbarui.'),
				type: 'success'
			});
			clearPreview();
			isOpen = false;
			dialogRef?.close();
		} catch (error) {
			toast({
				message: error instanceof Error ? error.message : 'Foto pegawai gagal disimpan.',
				type: 'error'
			});
		} finally {
			uploading = false;
		}
	}

	$effect(() => {
		if (isOpen && dialogRef && !dialogRef.open) dialogRef.showModal();
		if (!isOpen && dialogRef?.open) dialogRef.close();
	});

	onDestroy(clearPreview);
</script>

<dialog
	bind:this={dialogRef}
	class="modal"
	onclose={() => {
		if (isOpen) closeModal();
	}}
>
	<div class="modal-box max-w-2xl rounded-lg">
		<h3 class="mb-6 text-xl font-bold">Upload Foto {pegawaiNama}</h3>

		<div class="grid gap-5 sm:grid-cols-[240px_1fr]">
			<div
				class="bg-base-200 flex aspect-3/4 w-full items-center justify-center overflow-hidden rounded-md"
			>
				{#if previewUrl}
					<img src={previewUrl} alt={`Pratinjau foto ${pegawaiNama}`} class="h-full w-full object-cover" />
				{:else}
					<div class="p-4 text-center opacity-55">
						<Icon name="image" class="mx-auto text-4xl" />
						<p class="mt-2 text-sm">Foto belum dipilih</p>
					</div>
				{/if}
			</div>

			<fieldset class="fieldset self-start">
				<legend class="fieldset-legend">Pilih File</legend>
				<input
					bind:this={inputRef}
					type="file"
					accept="image/png,image/jpeg"
					class="file-input w-full"
					onchange={handleFileChange}
					disabled={uploading}
					aria-label="Pilih foto pegawai"
				/>
				<p class="label">JPG atau PNG. Ukuran maksimal 500 KB.</p>
			</fieldset>
		</div>

		<div class="modal-action gap-2">
			<button type="button" class="btn btn-error btn-soft" onclick={closeModal} disabled={uploading}>
				Batal
			</button>
			<button
				type="button"
				class="btn btn-primary"
				onclick={savePhoto}
				disabled={!selectedFile || uploading}
			>
				{#if uploading}<span class="loading loading-spinner"></span>{:else}<Icon name="save" />{/if}
				Simpan
			</button>
		</div>
	</div>
	<button type="button" class="modal-backdrop" onclick={closeModal} aria-label="Tutup popup"></button>
</dialog>
