<script lang="ts">
	import { deserialize } from '$app/forms';
	import Icon from '$lib/components/icon.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import type { GeneratedTpGroup } from '$lib/ai-utils';
	import { onMount } from 'svelte';

	interface Props {
		mapelId: number;
		mapelName: string;
		kelasLabel: string;
		onCancel: () => void;
		onSuccess: (data?: Record<string, unknown>) => void;
	}

	let { mapelId, mapelName, kelasLabel, onCancel, onSuccess }: Props = $props();
	let capaianPembelajaran = $state('');
	let maxLingkupMateri = $state(6);
	let maxTujuanPembelajaran = $state(6);
	let groups = $state<GeneratedTpGroup[]>([]);
	let status = $state<'checking' | 'ready' | 'unconfigured'>('checking');
	let generating = $state(false);
	let saving = $state(false);
	let errorMessage = $state('');
	const hasPreview = $derived(groups.length > 0);

	onMount(async () => {
		try {
			const response = await fetch('/api/ai/status');
			const body = await response.json();
			status = response.ok && body.configured ? 'ready' : 'unconfigured';
		} catch {
			status = 'unconfigured';
		}
	});

	async function generate() {
		errorMessage = '';
		if (status !== 'ready') {
			errorMessage = 'Generator AI belum dikonfigurasi oleh admin.';
			return;
		}
		if (!capaianPembelajaran.trim()) {
			errorMessage = 'Capaian Pembelajaran wajib diisi.';
			return;
		}
		generating = true;
		try {
			const response = await fetch('/api/ai/generate-tp', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					mapelId,
					capaianPembelajaran: capaianPembelajaran.trim(),
					maxLingkupMateri,
					maxTujuanPembelajaran
				})
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) {
				errorMessage = body.message || 'Generator AI gagal diproses.';
				return;
			}
			groups = (body.data?.groups ?? []) as GeneratedTpGroup[];
			if (!groups.length) errorMessage = 'AI tidak menghasilkan data yang dapat ditinjau.';
		} catch {
			errorMessage = 'Layanan AI tidak dapat dihubungi.';
		} finally {
			generating = false;
		}
	}

	function updateGroup(index: number, value: string) {
		groups = groups.map((group, current) =>
			current === index ? { ...group, lingkupMateri: value } : group
		);
	}

	function updateItem(groupIndex: number, itemIndex: number, value: string) {
		groups = groups.map((group, current) =>
			current === groupIndex
				? {
						...group,
						deskripsi: group.deskripsi.map((item, index) => (index === itemIndex ? value : item))
					}
				: group
		);
	}

	function addItem(groupIndex: number) {
		groups = groups.map((group, current) =>
			current === groupIndex && group.deskripsi.length < 12
				? { ...group, deskripsi: [...group.deskripsi, ''] }
				: group
		);
	}

	function removeItem(groupIndex: number, itemIndex: number) {
		groups = groups.map((group, current) =>
			current === groupIndex
				? { ...group, deskripsi: group.deskripsi.filter((_, index) => index !== itemIndex) }
				: group
		);
	}

	function addGroup() {
		if (groups.length < 12) groups = [...groups, { lingkupMateri: '', deskripsi: [''] }];
	}

	function removeGroup(groupIndex: number) {
		groups = groups.filter((_, index) => index !== groupIndex);
	}

	async function save() {
		errorMessage = '';
		const cleaned = groups
			.map((group) => ({
				lingkupMateri: group.lingkupMateri.trim(),
				deskripsi: group.deskripsi.map((item) => item.trim()).filter(Boolean)
			}))
			.filter((group) => group.lingkupMateri && group.deskripsi.length);
		if (!cleaned.length) {
			errorMessage = 'Minimal satu lingkup materi dan tujuan pembelajaran harus tersedia.';
			return;
		}
		const form = new FormData();
		cleaned.forEach((group, groupIndex) => {
			form.append(`groups.${groupIndex}.lingkupMateri`, group.lingkupMateri);
			group.deskripsi.forEach((item, itemIndex) => {
				form.append(`groups.${groupIndex}.deskripsi.${itemIndex}`, item);
			});
		});
		saving = true;
		try {
			const response = await fetch('?/aigenerate', { method: 'POST', body: form });
			const result = deserialize(await response.text());
			const data = ('data' in result ? result.data : {}) as Record<string, unknown>;
			if (result.type !== 'success') {
				errorMessage = String(data.fail ?? data.message ?? 'Hasil tidak dapat disimpan.');
				return;
			}
			toast(String(data.message ?? 'Tujuan pembelajaran berhasil disimpan.'), 'success');
			onSuccess(data);
		} catch {
			errorMessage = 'Terjadi kesalahan saat menyimpan hasil.';
		} finally {
			saving = false;
		}
	}
</script>

<dialog class="modal" open onclose={onCancel}>
	<div class="modal-box max-w-4xl rounded-lg">
		<header class="mb-4">
			<h3 class="text-xl font-bold">Generate Lingkup Materi dan TP</h3>
			<p class="text-base-content/70 mt-1 text-sm">{mapelName} · {kelasLabel}</p>
		</header>

		{#if errorMessage}
			<div class="alert alert-error alert-soft mb-4" role="alert">
				<Icon name="error" />
				<span>{errorMessage}</span>
			</div>
		{/if}
		{#if status === 'checking'}
			<div class="alert alert-info alert-soft mb-4"><span class="loading loading-spinner loading-sm"></span><span>Memeriksa konfigurasi...</span></div>
		{:else if status === 'unconfigured'}
			<div class="alert alert-warning alert-soft mb-4"><Icon name="warning" /><span>Generator belum aktif. Admin dapat mengaturnya pada menu Pengaturan.</span></div>
		{/if}

		{#if !hasPreview}
			<fieldset class="fieldset">
				<legend class="fieldset-legend">Capaian Pembelajaran</legend>
				<textarea class="textarea bg-base-200 h-40 w-full" bind:value={capaianPembelajaran} maxlength="12000" disabled={status !== 'ready'} placeholder="Tempelkan Capaian Pembelajaran di sini"></textarea>
				<p class="text-base-content/60 text-right text-xs">{capaianPembelajaran.length}/12000</p>
			</fieldset>
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<fieldset class="fieldset"><legend class="fieldset-legend">Maksimal lingkup materi</legend><input class="input bg-base-200 w-full" type="number" min="1" max="12" bind:value={maxLingkupMateri} /></fieldset>
				<fieldset class="fieldset"><legend class="fieldset-legend">Maksimal TP per lingkup</legend><input class="input bg-base-200 w-full" type="number" min="1" max="12" bind:value={maxTujuanPembelajaran} /></fieldset>
			</div>
		{:else}
			<div class="alert alert-info alert-soft mb-3 py-2"><Icon name="info" /><span>Tinjau dan sunting hasil sebelum disimpan. AI dapat menghasilkan informasi yang kurang tepat.</span></div>
			<div class="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
				{#each groups as group, groupIndex (groupIndex)}
					<section class="border-base-300 rounded-lg border p-3">
						<div class="mb-2 flex items-center gap-2">
							<input class="input bg-base-200 min-w-0 flex-1" value={group.lingkupMateri} maxlength="150" aria-label={`Lingkup materi ${groupIndex + 1}`} oninput={(event) => updateGroup(groupIndex, event.currentTarget.value)} />
							<button class="btn btn-ghost btn-error btn-sm btn-square" type="button" title="Hapus lingkup" onclick={() => removeGroup(groupIndex)}><Icon name="del" /></button>
						</div>
						<div class="space-y-2">
							{#each group.deskripsi as item, itemIndex (itemIndex)}
								<div class="flex items-start gap-2">
									<textarea class="textarea bg-base-200 min-h-16 flex-1" value={item} maxlength="100" aria-label={`Tujuan pembelajaran ${itemIndex + 1}`} oninput={(event) => updateItem(groupIndex, itemIndex, event.currentTarget.value)}></textarea>
									<button class="btn btn-ghost btn-error btn-sm btn-square" type="button" title="Hapus tujuan" onclick={() => removeItem(groupIndex, itemIndex)}><Icon name="del" /></button>
								</div>
							{/each}
						</div>
						<button class="btn btn-ghost btn-sm mt-2" type="button" onclick={() => addItem(groupIndex)} disabled={group.deskripsi.length >= 12}><Icon name="plus" />Tambah TP</button>
					</section>
				{/each}
				<button class="btn btn-soft btn-sm w-full" type="button" onclick={addGroup} disabled={groups.length >= 12}><Icon name="plus" />Tambah Lingkup Materi</button>
			</div>
		{/if}

		<div class="modal-action justify-between">
			<button class="btn btn-soft" type="button" onclick={onCancel} disabled={generating || saving}>Batal</button>
			<div class="flex gap-2">
				{#if hasPreview}
					<button class="btn btn-soft" type="button" onclick={() => (groups = [])} disabled={saving}>Kembali</button>
					<button class="btn btn-primary" type="button" onclick={save} disabled={saving}>{#if saving}<span class="loading loading-spinner loading-sm"></span>{:else}<Icon name="save" />{/if}Simpan Hasil</button>
				{:else}
					<button class="btn btn-primary" type="button" onclick={generate} disabled={generating || status !== 'ready'}>{#if generating}<span class="loading loading-spinner loading-sm"></span>{:else}<Icon name="sparkles" />{/if}Generate</button>
				{/if}
			</div>
		</div>
	</div>
</dialog>
