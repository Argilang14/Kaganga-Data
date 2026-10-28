<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/icon.svelte';
	import { emptyStudentProfile, type StudentProfileValues } from '$lib/murid-profile';
	import {
		studentProfileGroups,
		studentProfileDraft,
		parseStudentProfileDraft,
		studentProfileCompleteness
	} from '$lib/student-profile-form';

	let { muridId, ondirty = () => {} }: { muridId: number; ondirty?: (dirty: boolean) => void } =
		$props();
	type Photo = { id: number; jenis: string; updatedAt: string | null };
	type ProfileData = {
		values: StudentProfileValues;
		revisi: number;
		editable: boolean;
		photos: Photo[];
		staff: { id: number; nama: string }[];
		surveyorName: string | null;
		health: {
			tanggalPengukuran: string;
			kondisiFisik: string | null;
			ukuranBaju: string | null;
			ukuranCelana: string | null;
			ukuranSepatu: string | null;
		} | null;
	};
	let loaded = $state<ProfileData | null>(null);
	let draft = $state<Record<string, string>>({});
	let kinds = $state<string[]>([]);
	let initial = $state('');
	let loading = $state(true);
	let busy = $state(false);
	let message = $state('');
	let failure = $state('');
	let conflict = $state(false);
	let removeKind = $state<string | null>(null);
	let candidates = $state<Record<string, { file: File; url: string }>>({});
	const dirty = $derived(!!loaded && initial !== JSON.stringify([draft, kinds]));
	const availability = $derived(
		studentProfileCompleteness(loaded?.values ?? emptyStudentProfile, loaded?.photos.length ?? 0)
	);
	const slots = [
		{ kind: 'murid_tambahan', label: 'Foto murid tambahan' },
		{ kind: 'rumah', label: 'Foto rumah' },
		{ kind: 'orang_tua', label: 'Foto orang tua/wali' }
	];
	const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
	$effect(() => {
		ondirty(dirty || Object.keys(candidates).length > 0);
	});

	async function responseData(response: Response) {
		const result = await response.json().catch(() => null);
		if (!response.ok) {
			if (response.status === 409) conflict = true;
			throw new Error(
				result?.message ?? 'Profil tidak dapat dimuat. Periksa koneksi lalu coba lagi.'
			);
		}
		return result;
	}
	async function load() {
		if (
			(dirty || Object.keys(candidates).length) &&
			!window.confirm('Muat ulang profil? Isian dan foto yang belum disimpan akan dibuang.')
		)
			return;
		loading = true;
		failure = '';
		conflict = false;
		message = '';
		try {
			loaded = await responseData(
				await fetch(`/api/murid-profil/${muridId}`, { cache: 'no-store' })
			);
			draft = studentProfileDraft(loaded!.values);
			kinds = [...loaded!.values.jenisBansos];
			initial = JSON.stringify([draft, kinds]);
			for (const candidate of Object.values(candidates)) URL.revokeObjectURL(candidate.url);
			candidates = {};
		} catch (cause) {
			failure = (cause as Error).message;
		} finally {
			loading = false;
		}
	}
	onMount(() => {
		void load();
		return () => {
			for (const item of Object.values(candidates)) URL.revokeObjectURL(item.url);
			ondirty(false);
		};
	});
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (!loaded || busy || conflict) return;
		failure = '';
		message = '';
		busy = true;
		try {
			const values = parseStudentProfileDraft(draft, kinds);
			const patch = Object.fromEntries(
				Object.entries(values).filter(
					([key, value]) =>
						JSON.stringify(value) !==
						JSON.stringify(loaded!.values[key as keyof StudentProfileValues])
				)
			);
			if (!Object.keys(patch).length) {
				initial = JSON.stringify([draft, kinds]);
				message = 'Tidak ada perubahan untuk disimpan.';
				return;
			}
			const saved = await responseData(
				await fetch(`/api/murid-profil/${muridId}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ values: patch, revisi: loaded.revisi })
				})
			);
			loaded = { ...loaded, values, revisi: saved.revisi };
			initial = JSON.stringify([draft, kinds]);
			message = 'Informasi tambahan tersimpan.';
		} catch (cause) {
			failure = (cause as Error).message;
		} finally {
			busy = false;
		}
	}
	function choose(kind: string, event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		if (
			!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
			file.size > 5 * 1024 * 1024 ||
			!file.size
		) {
			failure = 'Pilih foto JPG, PNG, atau WebP, maksimal 5 MB.';
			input.value = '';
			return;
		}
		cancelPhoto(kind);
		candidates[kind] = { file, url: URL.createObjectURL(file) };
		failure = '';
		message = '';
		input.value = '';
	}
	function cancelPhoto(kind: string) {
		if (candidates[kind]) URL.revokeObjectURL(candidates[kind].url);
		delete candidates[kind];
	}
	async function changePhoto(kind: string, remove = false) {
		if (!loaded || busy || conflict) return;
		busy = true;
		failure = '';
		message = '';
		try {
			const data = new FormData();
			data.set('revisi', String(loaded.revisi));
			if (!remove) data.set('foto', candidates[kind].file);
			const result = await responseData(
				await fetch(`/api/murid-profil/${muridId}/foto/${kind}`, {
					method: remove ? 'DELETE' : 'POST',
					headers: remove ? { 'Content-Type': 'application/json' } : undefined,
					body: remove ? JSON.stringify({ revisi: loaded.revisi }) : data
				})
			);
			loaded = { ...loaded, revisi: result.revisi, photos: result.photos };
			cancelPhoto(kind);
			removeKind = null;
			message = remove ? 'Foto dihapus dari profil.' : 'Foto tersimpan.';
		} catch (cause) {
			failure = (cause as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<svelte:window
	onbeforeunload={(event) => {
		if (dirty || Object.keys(candidates).length) {
			event.preventDefault();
			event.returnValue = '';
		}
	}}
/>

<section
	aria-label="Informasi tambahan murid"
	class="min-w-0 space-y-5 text-sm"
	aria-busy={loading || busy}
>
	{#if loading}<p role="status" class="flex items-center gap-2 py-8">
			<span class="loading loading-spinner loading-sm"></span>Memuat informasi tambahan...
		</p>{/if}
	{#if failure}<div role="alert" class="alert alert-error alert-soft break-words">
			<Icon name="warning" /><span>{failure}</span>
		</div>{/if}
	{#if message}<p role="status" class="text-success font-medium">{message}</p>{/if}
	{#if !loading}
		<div class="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 pb-3">
			<div>
				<h3 class="font-semibold">Informasi tambahan</h3>
				<p class="text-base-content/60 mt-1">
					{availability.filled} dari {availability.total} data tersedia
					<span class="text-base-content/40">/</span> Isian opsional
				</p>
			</div>
			<button
				type="button"
				class="btn btn-sm btn-ghost"
				onclick={load}
				disabled={busy}
				title="Muat ulang profil"><Icon name="repeat" />Muat ulang</button
			>
		</div>
		{#if loaded}
			{#if !loaded.editable}<p class="border-l-2 border-info pl-3 text-base-content/70">
					Profil ini hanya dapat dibaca. Hubungi admin untuk perubahan data.
				</p>{/if}
			<form onsubmit={save} class="space-y-5">
				{#each studentProfileGroups as group (group.title)}
					<fieldset
						class="fieldset min-w-0 border-b border-base-300 pb-5"
						disabled={!loaded.editable || busy}
					>
						<legend class="fieldset-legend text-sm">{group.title}</legend>
						<div class="grid min-w-0 grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
							{#each group.fields as field (field.key)}
								<label
									class={`flex min-w-0 flex-col gap-1.5 text-sm ${field.type === 'textarea' ? 'sm:col-span-2' : ''}`}
								>
									<span class="font-medium">{field.label}</span>
									{#if field.options}
										<select class="select w-full min-w-0 bg-base-200" bind:value={draft[field.key]}>
											<option value="">Belum diisi</option>
											{#if field.key === 'petugasPendataanId'}
												{#if draft.petugasPendataanId && !loaded.staff.some((staff) => String(staff.id) === draft.petugasPendataanId)}<option
														value={draft.petugasPendataanId}
														>{loaded.surveyorName ?? 'Petugas lama'} (tidak aktif)</option
													>{/if}
												{#each loaded.staff as staff (staff.id)}<option value={String(staff.id)}
														>{staff.nama}</option
													>{/each}
											{:else}{#each field.options as [value, label] (value)}<option {value}
														>{label}</option
													>{/each}{/if}
										</select>
									{:else if field.type === 'textarea'}<textarea
											class="textarea w-full resize-y bg-base-200"
											rows="3"
											maxlength={field.maxLength}
											bind:value={draft[field.key]}></textarea>
									{:else}<input
											class="input w-full min-w-0 bg-base-200"
											type={field.type ?? 'text'}
											value={draft[field.key] ?? ''}
											oninput={(event) => {
												draft[field.key] = event.currentTarget.value;
											}}
											min={field.min}
											max={field.type === 'date' ? today : field.max}
											step={field.step ?? (field.type === 'number' ? '1' : undefined)}
											maxlength={field.maxLength}
											pattern={field.pattern}
											inputmode={field.pattern ? 'numeric' : undefined}
										/>{/if}
								</label>
							{/each}
						</div>
						{#if group.title === 'Keluarga & bantuan sosial'}
							<fieldset class="fieldset mt-3">
								<legend class="fieldset-legend text-sm">Jenis bantuan sosial</legend>
								<div class="flex flex-wrap gap-x-5 gap-y-3">
									{#each [['pkh', 'PKH'], ['sembako', 'Sembako'], ['pip', 'PIP'], ['lainnya', 'Lainnya']] as [kind, label] (kind)}<label
											class="flex items-center gap-2"
											><input
												class="checkbox checkbox-sm"
												type="checkbox"
												value={kind}
												bind:group={kinds}
											/>{label}</label
										>{/each}
								</div>
							</fieldset>
						{/if}
					</fieldset>
				{/each}
				{#if loaded.editable}<div class="flex flex-wrap items-center justify-end gap-3">
						<span class="text-base-content/60 mr-auto"
							>{dirty ? 'Ada perubahan belum disimpan' : 'Tidak ada perubahan'}</span
						><button
							class="btn btn-primary min-h-10"
							type="submit"
							disabled={busy || !dirty || conflict}
							><Icon name="save" />{busy ? 'Menyimpan...' : 'Simpan informasi'}</button
						>
					</div>{/if}
			</form>
			<section class="border-t border-base-300 pt-4" aria-label="Kondisi fisik dan perlengkapan">
				<h3 class="mb-3 font-semibold">Kondisi fisik & perlengkapan</h3>
				<dl class="grid grid-cols-2 gap-3 sm:grid-cols-4">
					{#each [['Kondisi fisik', loaded.health?.kondisiFisik], ['Ukuran baju', loaded.health?.ukuranBaju], ['Ukuran celana', loaded.health?.ukuranCelana], ['Ukuran sepatu', loaded.health?.ukuranSepatu]] as [label, value] (label)}<div
						>
							<dt class="text-base-content/60">{label}</dt>
							<dd class="mt-1 break-words font-medium">{value || 'Belum diisi'}</dd>
						</div>{/each}
				</dl>
				{#if loaded.health}<p class="mt-3 text-xs text-base-content/60">
						Tanggal pengukuran: {loaded.health.tanggalPengukuran}
					</p>{/if}
			</section>
			<section class="border-t border-base-300 pt-4" aria-label="Dokumentasi murid">
				<h3 class="mb-3 font-semibold">Dokumentasi</h3>
				<div class="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
					{#each slots as slot (slot.kind)}
						{@const photo = loaded.photos.find((photo) => photo.jenis === slot.kind)}
						<div class="min-w-0 rounded-lg border border-base-300 p-3">
							<h4 class="min-h-10 font-medium">{slot.label}</h4>
							<div
								class="my-3 flex aspect-[4/3] items-center justify-center overflow-hidden rounded bg-base-200"
							>
								{#if candidates[slot.kind] || photo}<img
										class="h-full w-full object-contain"
										src={candidates[slot.kind]?.url ??
											`/api/murid-profil/${muridId}/foto/${slot.kind}?v=${loaded.revisi}`}
										alt={slot.label}
									/>{:else}<span class="text-base-content/50">Belum ada foto</span>{/if}
							</div>
							{#if loaded.editable}<label class="block"
									><span class="sr-only">Pilih {slot.label.toLowerCase()}</span><input
										class="file-input file-input-sm w-full"
										type="file"
										accept="image/jpeg,image/png,image/webp"
										disabled={busy || conflict}
										onchange={(event) => choose(slot.kind, event)}
									/></label
								>
								{#if candidates[slot.kind]}<div class="mt-2 flex flex-wrap gap-2">
										<button
											type="button"
											class="btn btn-sm btn-success"
											disabled={busy || conflict}
											onclick={() => changePhoto(slot.kind)}>Simpan foto</button
										><button
											type="button"
											class="btn btn-sm btn-ghost"
											disabled={busy}
											onclick={() => cancelPhoto(slot.kind)}>Batal</button
										>
									</div>{:else if photo}<button
										type="button"
										class="btn btn-sm btn-ghost text-error mt-2"
										disabled={busy || conflict}
										onclick={() => (removeKind = slot.kind)}><Icon name="del" />Hapus foto</button
									>{/if}
								{#if removeKind === slot.kind}<div
										class="mt-2 space-y-2 border-t border-base-300 pt-2"
									>
										<p>Hapus {slot.label.toLowerCase()} dari profil?</p>
										<div class="flex flex-wrap gap-2">
											<button
												type="button"
												class="btn btn-sm btn-error"
												disabled={busy}
												onclick={() => changePhoto(slot.kind, true)}>Hapus</button
											><button
												type="button"
												class="btn btn-sm btn-ghost"
												disabled={busy}
												onclick={() => (removeKind = null)}>Batal</button
											>
										</div>
									</div>{/if}
							{/if}
						</div>
					{/each}
				</div>
			</section>
		{/if}
	{/if}
</section>
