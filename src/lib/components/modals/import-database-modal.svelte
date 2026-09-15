<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { hideModal } from '$lib/components/global-modal.svelte';
	import { DATABASE_IMPORT_MAX_BYTES, DATABASE_IMPORT_MAX_LABEL } from '$lib/database-import';
	import Icon from '../icon.svelte';
	import { toast } from '../toast.svelte';

	const inputId = 'import-database-file';

	let submitting = $state(false);
	let fileInput: HTMLInputElement | null = null;

	async function handleSubmit() {
		const file = fileInput?.files?.[0];
		if (!file) return;
		if (file.size > DATABASE_IMPORT_MAX_BYTES) {
			toast(`Ukuran backup maksimal ${DATABASE_IMPORT_MAX_LABEL}.`, 'error');
			return;
		}

		submitting = true;

		try {
			const response = await fetch('/api/database/import', {
				method: 'POST',
				headers: { 'Content-Type': 'application/vnd.sqlite3' },
				body: file,
				redirect: 'error'
			});

			if (!response.ok) {
				if (response.status === 413) {
					throw new Error(`Ukuran backup melebihi batas ${DATABASE_IMPORT_MAX_LABEL}.`);
				}
				const err = await response.json().catch(() => ({ message: 'Gagal mengimpor database' }));
				throw new Error(err.message ?? `Error ${response.status}`);
			}

			const data = await response.json();
			hideModal();
			toast(data.message || 'Database berhasil diimport.', 'success');

			if (data.logout) {
				setTimeout(() => {
					window.location.href = data.loginPath ?? '/login';
				}, 1400);
			} else {
				invalidateAll().catch((error) => {
					console.warn('Gagal melakukan refresh data setelah import', error);
					toast('Database berhasil diimport, tetapi data tidak berhasil dimuat ulang.', 'warning');
				});
			}
		} catch (e) {
			const message = e instanceof Error ? e.message : 'Gagal mengimpor database';
			toast(message, 'error');
		} finally {
			submitting = false;
		}
	}
</script>

<div class="space-y-4">
	<div class="form-control fieldset">
		<label class="fieldset-legend" for={inputId}>
			<span class="label-text font-semibold">Pilih berkas database</span>
		</label>
		<input
			required
			bind:this={fileInput}
			name="database"
			type="file"
			accept=".sqlite3"
			class="file-input file-input-ghost"
			id={inputId}
		/>
		<div class="label">
			<span class="label-text-alt text-base-content/70">
				File `.sqlite3`, maksimal {DATABASE_IMPORT_MAX_LABEL}.
			</span>
		</div>
	</div>

	<div role="alert" class="alert alert-warning">
		<Icon name="warning" />
		<span
			>Berkas yang diunggah akan menggantikan database saat ini. Backup otomatis dibuat sebelum
			proses import.</span
		>
	</div>

	<div class="flex justify-end gap-2 pt-2">
		<button type="button" class="btn" onclick={hideModal} disabled={submitting}> Batal </button>
		<button type="button" class="btn btn-primary" onclick={handleSubmit} disabled={submitting}>
			{submitting ? 'Mengunggah…' : 'Import'}
		</button>
	</div>
</div>
