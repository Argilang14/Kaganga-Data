<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import type { loadStudentRegistry } from '$lib/server/student-registry';
	import './student-workspace.css';

	let {
		registry,
		activeClassId = null
	}: {
		registry: Awaited<ReturnType<typeof loadStudentRegistry>>['registry'];
		activeClassId?: string | null;
	} = $props();
	let dialog: HTMLDialogElement;
	let message = $state('');
	let selected = $state<string[]>([]);
	let destination = $state('');
	let submitting = $state(false);
	const targetLabel = $derived(registry.view === 'kelas' ? 'kelas' : 'asrama');

	function openPlacement() {
		destination = registry.view === 'kelas' ? (activeClassId ?? '') : String(registry.roomId ?? '');
		message = '';
		dialog.showModal();
	}
	$effect(() => {
		if (registry.poolQuery && dialog && !dialog.open) openPlacement();
	});
	$effect(() => {
		const available = new Set(registry.candidates.map((student) => String(student.id)));
		const valid = selected.filter((id) => available.has(id));
		if (valid.length !== selected.length) selected = valid;
	});
</script>

<button class="btn btn-primary gap-2" type="button" onclick={openPlacement}
	><Icon name="plus" />Ambil murid</button
>
<dialog
	class="modal"
	bind:this={dialog}
	aria-labelledby="student-placement-title"
	aria-busy={submitting}
	oncancel={(event) => {
		if (submitting) event.preventDefault();
	}}
>
	<div class="modal-box student-dialog student-workspace flex flex-col">
		<header
			class="flex shrink-0 items-start justify-between gap-3 border-b border-base-300 p-4 sm:px-6"
		>
			<div>
				<h3 id="student-placement-title" class="text-lg font-bold">Ambil dari Murid Pasif</h3>
				<p class="mt-1 text-sm text-base-content/60">
					Tempatkan murid ke {targetLabel} yang Anda kelola.
				</p>
			</div>
			<button
				class="btn btn-sm btn-ghost btn-square"
				type="button"
				disabled={submitting}
				aria-label="Tutup penempatan"
				onclick={() => dialog.close()}><Icon name="close" /></button
			>
		</header>
		<div class="student-dialog-body">
			<form method="GET" class="mb-4 flex items-end gap-2">
				{#each [...page.url.searchParams].filter(([key]) => key !== 'pool_q' && key !== 'page') as [key, value], index (index)}<input
						type="hidden"
						name={key}
						{value}
					/>{/each}
				<label class="fieldset min-w-0 flex-1"
					><span class="fieldset-legend">Cari murid pasif</span><input
						class="input w-full"
						name="pool_q"
						type="search"
						value={registry.poolQuery}
						placeholder="Nama atau NIS"
					/></label
				><button class="btn btn-soft" type="submit" disabled={submitting}>Cari</button>
			</form>
			<FormEnhance
				action="?/assign"
				preventDuplicateSubmit
				submitStateChange={(value) => {
					submitting = value;
				}}
				onsuccess={async () => {
					selected = [];
					await invalidate('app:murid');
					dialog.close();
					if (page.url.searchParams.has('pool_q')) {
						const url = new URL(page.url);
						url.searchParams.delete('pool_q');
						// page.url already includes the configured base path.
						// eslint-disable-next-line svelte/no-navigation-without-resolve
						await goto(url, { replaceState: true, noScroll: true, keepFocus: true });
					}
				}}
				onfailure={({ data }) => {
					message = String(data?.message ?? 'Penempatan gagal. Periksa pilihan lalu coba lagi.');
				}}
			>
				{#snippet children({ submitting: saving })}
					<label class="fieldset mb-4"
						><span class="fieldset-legend"
							>{registry.view === 'kelas' ? 'Kelas tujuan' : 'Asrama tujuan'}</span
						><select
							class="select w-full"
							name={registry.view === 'kelas' ? 'kelasId' : 'kamarId'}
							bind:value={destination}
							required
							disabled={saving}
							><option value="">Pilih {targetLabel}</option
							>{#if registry.view === 'kelas'}{#each registry.classes as item (item.id)}<option
										value={String(item.id)}>{item.nama}</option
									>{/each}{:else}{#each registry.rooms as item (item.id)}<option
										value={String(item.id)}
										>{item.asrama === item.nama
											? item.nama
											: item.asrama + ' / ' + item.nama}</option
									>{/each}{/if}</select
						></label
					>
					<div class="mb-2 flex items-center justify-between gap-2 text-sm">
						<span class="font-semibold">Pilih murid</span><span class="text-base-content/60"
							>{selected.length} dipilih · maksimal 100</span
						>
					</div>
					{#if registry.candidates.length}
						<div class="max-h-64 overflow-y-auto rounded-lg border border-base-300">
							{#each registry.candidates as student (student.id)}<label
									class="flex cursor-pointer items-center gap-3 border-b border-base-200 px-4 py-3 last:border-b-0 hover:bg-base-200"
									><input
										class="checkbox checkbox-sm shrink-0"
										name="muridId"
										type="checkbox"
										value={String(student.id)}
										bind:group={selected}
										disabled={saving ||
											(selected.length >= 100 && !selected.includes(String(student.id)))}
									/><span class="min-w-0"
										><span class="block break-words text-sm font-medium">{student.nama}</span><span
											class="mt-0.5 block text-xs text-base-content/60"
											>NIS: {student.nis || '—'}</span
										></span
									></label
								>{/each}
						</div>
					{:else}<p class="rounded-lg bg-base-200 p-4 text-sm text-base-content/65">
							Belum ada murid yang dapat ditempatkan. Tambahkan murid melalui Murid Pasif, atau ubah
							pencarian.
						</p>{/if}
					<p class="mt-3 text-xs leading-relaxed text-base-content/60">
						Hanya murid aktif yang belum mendapat {registry.view === 'kelas'
							? 'kelas pada semester aktif'
							: 'asrama'} dapat dipilih. Menunggu pindah kelas memakai semester yang sama; menunggu naik
						kelas memakai semester berbeda. Murid pindah, keluar, atau lulus perlu diaktifkan kembali
						melalui Semua Murid, tab Status & alumni.
					</p>
					{#if registry.candidates.length === 200}<p class="mt-2 text-xs text-base-content/60">
							Menampilkan 200 hasil pertama. Persempit pencarian untuk menemukan murid lainnya.
						</p>{/if}
					{#if message}<p class="mt-4 rounded-lg bg-error/10 p-3 text-sm text-error" role="alert">
							{message}
						</p>{/if}
					<footer
						class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-base-300 pt-4"
					>
						<a class="link text-sm" href={resolve('/murid/pasif')}>Buka Murid Pasif</a>
						<div class="flex gap-2">
							<button class="btn" type="button" disabled={saving} onclick={() => dialog.close()}
								>Batal</button
							><button
								class="btn btn-primary"
								type="submit"
								disabled={saving || !selected.length || !destination}
								>{saving
									? 'Menyimpan…'
									: selected.length
										? 'Tempatkan (' + selected.length + ')'
										: 'Tempatkan'}</button
							>
						</div>
					</footer>
				{/snippet}
			</FormEnhance>
		</div>
	</div>
</dialog>
