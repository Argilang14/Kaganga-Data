<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/icon.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import { showModal } from '$lib/components/global-modal.svelte';

	const { scopes }: { scopes: Array<{ value: string; label: string }> } = $props();
	const assets = [
		{ kind: 'kop-portrait', label: 'Kop portrait' },
		{ kind: 'kop-landscape', label: 'Kop landscape' },
		{ kind: 'ttd', label: 'Tanda tangan kepala sekolah' },
		{ kind: 'stempel', label: 'Stempel sekolah' }
	];
	let scope = $state('induk');
	let status = $state<Record<string, boolean>>({});
	let busy = $state(false);
	let loading = $state(true);
	let failed = $state(false);
	let revision = $state(0);
	const url = (kind?: string) =>
		`/api/sekolah/aset-cetak${kind ? `/${kind}` : ''}?scope=${scope}&v=${revision}`;

	async function refresh() {
		loading = true;
		failed = false;
		try {
			const response = await fetch(url(), { cache: 'no-store' });
			if (!response.ok) throw new Error('Daftar aset belum dapat dimuat. Coba lagi.');
			status = await response.json();
		} catch (cause) {
			failed = true;
			toast(
				cause instanceof Error ? cause.message : 'Daftar aset belum dapat dimuat. Coba lagi.',
				'error'
			);
		} finally {
			loading = false;
		}
	}

	async function mutate(kind: string, file?: File) {
		busy = true;
		try {
			let body: FormData | undefined;
			if (file) {
				body = new FormData();
				body.append('file', file);
			}
			const response = await fetch(url(kind), { method: file ? 'POST' : 'DELETE', body });
			const result = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(result.message || 'Aset belum dapat disimpan. Coba lagi.');
			revision += 1;
			toast(result.message, 'success');
			await refresh();
		} catch (cause) {
			toast(
				cause instanceof Error ? cause.message : 'Aset belum dapat disimpan. Coba lagi.',
				'error'
			);
		} finally {
			busy = false;
		}
	}

	async function upload(kind: string, event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		if (file.type !== 'image/png' || file.size > 2 * 1024 * 1024) {
			toast('Pilih gambar PNG, maksimal 2 MB.', 'warning');
			return;
		}
		await mutate(kind, file);
	}

	function confirmDelete(kind: string) {
		const currentScope = scope;
		showModal({
			title: 'Hapus aset cetak',
			body: 'Hapus gambar ini? Dokumen akan kembali memakai aset bawaan yang tersedia.',
			onNegative: { label: 'Batal', action: ({ close }) => close() },
			onPositive: {
				label: 'Hapus',
				icon: 'del',
				action: async ({ close }) => {
					if (scope === currentScope) await mutate(kind);
					close();
				}
			}
		});
	}
	onMount(() => {
		void refresh();
	});
</script>

<section
	class="bg-base-100 rounded-lg p-5 shadow-md sm:p-6"
	aria-labelledby="print-assets-heading"
	aria-busy={busy || loading}
>
	<header class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h2 id="print-assets-heading" class="text-lg font-semibold">Kop dan pengesahan dokumen</h2>
			<p class="text-base-content/60 mt-1 text-sm">PNG · Maksimal 2 MB per gambar</p>
		</div>
		<label class="grid min-w-0 gap-1.5 text-sm sm:w-64">
			<span>Satuan pendidikan</span>
			<select
				class="select w-full"
				bind:value={scope}
				disabled={busy || loading}
				onchange={() => refresh()}
			>
				{#each scopes as item (item.value)}<option value={item.value}>{item.label}</option>{/each}
			</select>
		</label>
	</header>
	{#if loading}
		<div class="flex min-h-40 items-center justify-center gap-2" role="status">
			<span class="loading loading-spinner loading-sm"></span>Memuat aset cetak...
		</div>
	{:else if failed}
		<div class="mt-5 flex flex-wrap items-center gap-3" role="alert">
			<span>Daftar aset belum dapat dimuat.</span><button
				class="btn btn-sm"
				onclick={() => refresh()}>Coba lagi</button
			>
		</div>
	{:else}
		<div class="divide-base-200 mt-5 divide-y">
			{#each assets as asset (asset.kind)}
				<div
					class="grid min-w-0 gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_minmax(160px,2fr)_auto] sm:items-center"
				>
					<div class="min-w-0">
						<h3 class="text-sm font-medium">{asset.label}</h3>
						<span class:badge-success={status[asset.kind]} class="badge badge-soft badge-sm mt-2"
							>{status[asset.kind] ? 'Tersimpan' : 'Belum diunggah'}</span
						>
					</div>
					<div
						class="border-base-300 flex h-24 min-w-0 items-center justify-center rounded border bg-white p-2"
					>
						{#if status[asset.kind]}<img
								src={url(asset.kind)}
								alt={asset.label}
								class="h-full max-w-full object-contain"
							/>{:else}<span class="text-sm text-gray-500">Belum ada gambar</span>{/if}
					</div>
					<div class="flex items-center gap-2 sm:justify-end">
						<label class="btn btn-sm btn-soft" class:btn-disabled={busy}>
							<Icon name="import" />{status[asset.kind] ? 'Ganti' : 'Unggah'}
							<input
								aria-label={`Unggah ${asset.label}`}
								type="file"
								accept="image/png"
								class="sr-only"
								disabled={busy}
								onchange={(event) => upload(asset.kind, event)}
							/>
						</label>
						<button
							type="button"
							class="btn btn-sm btn-square btn-error btn-soft"
							disabled={busy || !status[asset.kind]}
							aria-label={`Hapus ${asset.label}`}
							title={`Hapus ${asset.label}`}
							onclick={() => confirmDelete(asset.kind)}><Icon name="del" /></button
						>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</section>
