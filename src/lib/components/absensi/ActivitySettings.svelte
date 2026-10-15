<script lang="ts">
	import { resolve } from '$app/paths';
	import { tick } from 'svelte';
	import Icon from '$lib/components/icon.svelte';
	import FormEnhance from '$lib/components/form-enhance.svelte';

	type Category = 'sekolah' | 'asrama' | 'makan' | 'sholat';
	type Activity = {
		id: number;
		kode: string;
		nama: string;
		kategori: Category;
		jamMulai: string | null;
		batasTerlambat: string | null;
		jamSelesai: string | null;
		autoAlfa: boolean;
		masukRapor: boolean;
		aktif: boolean;
		aksesEdit: string;
	};
	let { data }: { data: { kegiatanList: Activity[]; kategoriLabels: Record<Category, string> } } =
		$props();
	let search = $state('');
	let category = $state<Category | ''>('');
	let status = $state('');
	let editing = $state<Activity | null>(null);
	let saving = $state(false);
	let dialog: HTMLDialogElement;
	const categories: Category[] = ['sekolah', 'asrama', 'makan', 'sholat'];
	const categoryStyles: Record<Category, { icon: IconName; color: string; badge: string }> = {
		sekolah: { icon: 'school', color: 'bg-info/10 text-info', badge: 'badge-info' },
		asrama: { icon: 'moon', color: 'bg-success/10 text-success', badge: 'badge-success' },
		makan: { icon: 'coffee', color: 'bg-warning/10 text-warning', badge: 'badge-warning' },
		sholat: { icon: 'sun', color: 'bg-secondary/10 text-secondary', badge: 'badge-secondary' }
	};
	const activeCount = $derived(data.kegiatanList.filter((item) => item.aktif).length);
	const autoCount = $derived(data.kegiatanList.filter((item) => item.autoAlfa).length);
	const summaries = $derived([
		{
			label: 'Total kegiatan',
			value: data.kegiatanList.length,
			icon: 'table',
			color: 'text-info',
			surface: 'bg-info/10'
		},
		{
			label: 'Aktif',
			value: activeCount,
			icon: 'success',
			color: 'text-success',
			surface: 'bg-success/10'
		},
		{
			label: 'Nonaktif',
			value: data.kegiatanList.length - activeCount,
			icon: 'pause',
			color: 'text-base-content/60',
			surface: 'bg-base-200'
		},
		{
			label: 'Auto alfa',
			value: autoCount,
			icon: 'warning',
			color: 'text-warning',
			surface: 'bg-warning/10'
		}
	] satisfies { label: string; value: number; icon: IconName; color: string; surface: string }[]);
	const filtered = $derived(
		data.kegiatanList.filter(
			(item) =>
				(!category || item.kategori === category) &&
				(!status || item.aktif === (status === 'aktif')) &&
				`${item.nama} ${item.kode}`
					.toLocaleLowerCase('id-ID')
					.includes(search.trim().toLocaleLowerCase('id-ID'))
		)
	);
	const accessLabels: Record<string, string> = {
		sekolah: 'Sekolah',
		asrama: 'Asrama',
		semua: 'Sekolah & asrama'
	};
	const accessLabel = (value: string) => accessLabels[value] ?? value;
	const timeLabel = (value: string | null) => value?.slice(0, 5) || '-';

	async function open(item: Activity) {
		editing = { ...item };
		await tick();
		dialog.showModal();
	}
	function close() {
		if (!saving) dialog.close();
	}
	function resetFilters() {
		search = '';
		category = '';
		status = '';
	}
</script>

{#snippet identity(item: Activity)}
	<div class="flex min-w-0 items-start gap-3">
		<span
			class={`flex size-10 shrink-0 items-center justify-center rounded-lg ${categoryStyles[item.kategori].color}`}
		>
			<Icon
				name={categoryStyles[item.kategori].icon}
				class={`size-5 ${item.kategori !== 'makan' ? 'fill-current' : ''}`}
			/>
		</span>
		<div class="min-w-0">
			<p class="font-semibold break-words leading-snug">{item.nama}</p>
			<p class="mt-1 text-xs text-base-content/55 break-all">{item.kode}</p>
			<div class={`badge badge-soft badge-sm mt-2 ${categoryStyles[item.kategori].badge}`}>
				{data.kategoriLabels[item.kategori]}
			</div>
		</div>
	</div>
{/snippet}

<div class="activity-settings min-w-0 space-y-5" data-ui-revision="kaganga-ui-activity-settings-2">
	<header class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div class="flex min-w-0 items-center gap-3">
			<span
				class="flex size-11 shrink-0 items-center justify-center rounded-lg bg-info/10 text-info border border-info/15"
				><Icon name="gear" class="size-6" /></span
			>
			<div class="min-w-0">
				<h1 class="text-xl font-bold">Pengaturan Kegiatan</h1>
				<p class="mt-1 text-sm text-base-content/60">Kegiatan absensi murid</p>
			</div>
		</div>
		<nav class="flex flex-wrap gap-2 shrink-0" aria-label="Navigasi absensi">
			<a class="btn btn-sm min-h-10" href={resolve('/administrasi/absensi/kegiatan')}
				><Icon name="check-square" />Catat Absensi</a
			>
			<a class="btn btn-sm min-h-10" href={resolve('/administrasi/absensi/monitoring')}
				><Icon name="chart" />Monitoring</a
			>
		</nav>
	</header>

	<dl
		class="grid grid-cols-2 gap-px overflow-hidden border-y border-base-300 bg-base-300 sm:grid-cols-4"
	>
		{#each summaries as summary (summary.label)}
			<div class="flex min-w-0 items-center gap-3 bg-base-100 px-3 py-4 sm:px-5">
				<span
					class={`flex size-9 shrink-0 items-center justify-center rounded-lg ${summary.surface} ${summary.color}`}
					aria-hidden="true"
				>
					<Icon name={summary.icon} class="size-4" />
				</span>
				<div class="min-w-0">
					<dt class="text-xs text-base-content/65">{summary.label}</dt>
					<dd class="mt-1 text-2xl font-bold tabular-nums leading-none">
						{summary.value}
					</dd>
				</div>
			</div>
		{/each}
	</dl>

	<section class="min-w-0 bg-base-100" aria-label="Daftar kegiatan">
		<div
			class="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-base-200 p-4 sm:grid-cols-[minmax(0,1fr)_11rem_auto] sm:p-5"
		>
			<label class="col-span-2 flex min-w-0 flex-col gap-1.5 text-sm font-medium sm:col-span-1">
				<span>Cari kegiatan</span>
				<span class="input w-full font-normal"
					><Icon name="search" /><input
						type="search"
						class="min-w-0 grow"
						aria-label="Cari kegiatan"
						name="cariKegiatan"
						autocomplete="off"
						placeholder="Nama atau kode kegiatan"
						bind:value={search}
					/></span
				>
			</label>
			<label class="flex min-w-0 flex-col gap-1.5 text-sm font-medium"
				><span>Status kegiatan</span><select
					class="select w-full font-normal"
					aria-label="Status kegiatan"
					name="statusKegiatan"
					bind:value={status}
					><option value="">Semua status</option><option value="aktif">Aktif</option><option
						value="nonaktif">Nonaktif</option
					></select
				></label
			>
			<button
				class="btn btn-square self-end"
				type="button"
				title="Reset filter"
				aria-label="Reset filter"
				onclick={resetFilters}
				disabled={!search && !category && !status}><Icon name="repeat" /></button
			>
		</div>
		<div
			class="flex max-w-full gap-2 overflow-x-auto border-b border-base-200 p-3 sm:px-5"
			role="group"
			aria-label="Kategori kegiatan"
		>
			<button
				class={`btn btn-sm min-h-10 shrink-0 ${category === '' ? 'btn-info btn-soft' : 'btn-ghost'}`}
				type="button"
				aria-pressed={category === ''}
				onclick={() => (category = '')}
				>Semua <span class="text-xs opacity-65">{data.kegiatanList.length}</span></button
			>
			{#each categories as key (key)}
				<button
					class={`btn btn-sm min-h-10 shrink-0 ${category === key ? 'btn-info btn-soft' : 'btn-ghost'}`}
					type="button"
					aria-pressed={category === key}
					onclick={() => (category = key)}
					><Icon
						name={categoryStyles[key].icon}
						class={key !== 'makan' ? 'fill-current' : undefined}
					/>{data.kategoriLabels[key]}<span class="text-xs opacity-65"
						>{data.kegiatanList.filter((item) => item.kategori === key).length}</span
					></button
				>
			{/each}
		</div>
		<div class="flex flex-wrap items-center justify-between gap-2 px-4 py-4 sm:px-5">
			<h2 class="text-sm font-semibold">Daftar Kegiatan</h2>
			<p class="text-xs text-base-content/60" role="status">
				{filtered.length} dari {data.kegiatanList.length} kegiatan
			</p>
		</div>

		{#if !filtered.length}
			<div class="flex flex-col items-center gap-3 border-y border-base-200 px-4 py-12 text-center">
				<span class="text-base-content/40"><Icon name="search" class="size-8" /></span>
				<p class="font-medium">
					{data.kegiatanList.length ? 'Tidak ada kegiatan yang sesuai' : 'Belum ada kegiatan'}
				</p>
				{#if search || category || status}<button
						type="button"
						class="btn btn-soft btn-sm"
						onclick={resetFilters}><Icon name="repeat" />Reset filter</button
					>{/if}
			</div>
		{:else}
			<div class="hidden overflow-x-auto xl:block">
				<table class="table table-sm w-full min-w-[880px]">
					<caption class="sr-only">Jadwal dan pengaturan kegiatan absensi</caption>
					<thead class="border-y border-base-200 bg-base-200/50 text-xs text-base-content/70">
						<tr
							><th scope="col" class="w-[28%]">Kegiatan</th><th scope="col" class="text-center"
								>Mulai</th
							><th scope="col" class="text-center">Batas terlambat</th><th
								scope="col"
								class="text-center">Selesai</th
							><th scope="col">Ketentuan</th><th scope="col">Status</th><th
								scope="col"
								class="text-right">Aksi</th
							></tr
						>
					</thead>
					<tbody>
						{#each filtered as item (item.id)}
							<tr class="hover:bg-info/5">
								<td class="py-4 pl-5 align-top">{@render identity(item)}</td>
								<td class="text-center font-medium tabular-nums">{timeLabel(item.jamMulai)}</td>
								<td class="text-center tabular-nums"
									><span class={item.batasTerlambat ? 'font-medium' : 'text-base-content/40'}
										>{timeLabel(item.batasTerlambat)}</span
									></td
								>
								<td class="text-center font-medium tabular-nums">{timeLabel(item.jamSelesai)}</td>
								<td
									><div class="flex flex-wrap gap-1">
										<span
											class={`badge badge-soft badge-sm ${item.autoAlfa ? 'badge-warning' : 'badge-ghost'}`}
											>Auto alfa {item.autoAlfa ? 'on' : 'off'}</span
										>{#if item.masukRapor}<span class="badge badge-soft badge-info badge-sm"
												>Masuk rapor</span
											>{/if}
									</div>
									<p class="mt-2 text-xs text-base-content/55">
										Petugas: {accessLabel(item.aksesEdit)}
									</p></td
								>
								<td
									><span
										class={`badge badge-soft badge-sm ${item.aktif ? 'badge-success' : 'badge-ghost'}`}
										>{item.aktif ? 'Aktif' : 'Nonaktif'}</span
									></td
								>
								<td class="text-right"
									><button
										type="button"
										class="btn btn-sm min-h-10"
										aria-label={`Atur ${item.nama}`}
										onclick={() => open(item)}><Icon name="edit" />Atur</button
									></td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="grid gap-3 px-4 pb-4 sm:px-5 sm:pb-5 md:grid-cols-2 xl:hidden">
				{#each filtered as item (item.id)}
					<article
						class={`min-w-0 rounded-lg border border-base-300 border-t-2 p-4 ${item.aktif ? 'border-t-info/50' : 'border-t-base-300'}`}
					>
						<div class="flex items-start justify-between gap-3">
							{@render identity(item)}<button
								type="button"
								class="btn btn-square btn-sm size-10 shrink-0"
								title={`Atur ${item.nama}`}
								aria-label={`Atur ${item.nama}`}
								onclick={() => open(item)}><Icon name="edit" /></button
							>
						</div>
						<dl class="mt-4 grid grid-cols-3 gap-2 border-y border-base-200 py-3 text-center">
							<div>
								<dt class="text-xs text-base-content/55">Mulai</dt>
								<dd class="mt-1 text-sm font-semibold tabular-nums">{timeLabel(item.jamMulai)}</dd>
							</div>
							<div>
								<dt class="text-xs text-base-content/55">Terlambat</dt>
								<dd class="mt-1 text-sm font-semibold tabular-nums">
									{timeLabel(item.batasTerlambat)}
								</dd>
							</div>
							<div>
								<dt class="text-xs text-base-content/55">Selesai</dt>
								<dd class="mt-1 text-sm font-semibold tabular-nums">
									{timeLabel(item.jamSelesai)}
								</dd>
							</div>
						</dl>
						<div class="mt-3 flex flex-wrap gap-2">
							<span
								class={`badge badge-soft badge-sm ${item.aktif ? 'badge-success' : 'badge-ghost'}`}
								>{item.aktif ? 'Aktif' : 'Nonaktif'}</span
							><span
								class={`badge badge-soft badge-sm ${item.autoAlfa ? 'badge-warning' : 'badge-ghost'}`}
								>Auto alfa {item.autoAlfa ? 'on' : 'off'}</span
							>{#if item.masukRapor}<span class="badge badge-soft badge-info badge-sm"
									>Masuk rapor</span
								>{/if}
						</div>
						<p class="mt-3 text-xs text-base-content/55">Petugas: {accessLabel(item.aksesEdit)}</p>
					</article>
				{/each}
			</div>
		{/if}
	</section>
</div>

<dialog
	id="activity-settings-dialog"
	bind:this={dialog}
	class="modal"
	aria-labelledby="activity-settings-title"
	oncancel={(event) => {
		if (saving) event.preventDefault();
	}}
	onclose={() => {
		if (!dialog.open) editing = null;
	}}
>
	<div
		class="modal-box flex max-h-[90dvh] w-[calc(100%_-_1.5rem)] max-w-2xl flex-col rounded-lg p-0"
	>
		{#if editing}
			{@const selected = editing}
			<header
				class="flex items-start justify-between gap-3 border-b border-base-200 bg-base-200/35 p-4 sm:p-5"
			>
				<div class="flex min-w-0 items-start gap-3">
					<span
						class={`flex size-10 shrink-0 items-center justify-center rounded-lg ${categoryStyles[selected.kategori].color}`}
						aria-hidden="true"
						><Icon
							name={categoryStyles[selected.kategori].icon}
							class={`size-5 ${selected.kategori !== 'makan' ? 'fill-current' : ''}`}
						/></span
					>
					<div class="min-w-0">
						<h2 id="activity-settings-title" class="text-lg font-bold">Atur Kegiatan</h2>
						<p class="mt-1 break-words text-sm text-base-content/60">{editing.nama}</p>
					</div>
				</div>
				<button
					class="btn btn-ghost btn-square btn-sm size-10 shrink-0"
					type="button"
					aria-label="Tutup pengaturan kegiatan"
					title="Tutup"
					onclick={close}
					disabled={saving}><Icon name="close" /></button
				>
			</header>
			<FormEnhance
				action="?/updateKegiatan"
				class="flex min-h-0 flex-col overflow-hidden"
				init={{ ...editing }}
				submitStateChange={(value) => (saving = value)}
				onsuccess={() => dialog.close()}
			>
				{#snippet children({ submitting, invalid })}
					<div class="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5">
						<input type="hidden" name="kegiatanId" value={selected.id} />
						<div class="mb-5 flex flex-wrap gap-2">
							<span class={`badge badge-soft ${categoryStyles[selected.kategori].badge}`}
								>{data.kategoriLabels[selected.kategori]}</span
							><span class="badge badge-ghost">{accessLabel(selected.aksesEdit)}</span
							>{#if selected.masukRapor}<span class="badge badge-soft badge-info">Masuk rapor</span
								>{/if}
						</div>
						<fieldset disabled={submitting} class="min-w-0 space-y-5">
							<label class="flex flex-col gap-2 text-sm font-medium"
								><span>Nama kegiatan</span><input
									class="input w-full font-normal"
									name="nama"
									id="activity-name"
									autocomplete="off"
									value={selected.nama}
									required
								/></label
							>
							<fieldset class="min-w-0">
								<legend class="mb-3 text-sm font-semibold">Waktu kegiatan</legend>
								<div class="grid gap-4 sm:grid-cols-3">
									<label class="flex min-w-0 flex-col gap-2 text-sm"
										><span>Jam mulai</span><input
											class="input w-full min-w-0 tabular-nums"
											type="time"
											name="jamMulai"
											id="activity-start"
											value={selected.jamMulai ?? ''}
										/></label
									>
									<label class="flex min-w-0 flex-col gap-2 text-sm"
										><span>Batas terlambat</span><input
											class="input w-full min-w-0 tabular-nums"
											type="time"
											name="batasTerlambat"
											id="activity-late"
											value={selected.batasTerlambat ?? ''}
										/></label
									>
									<label class="flex min-w-0 flex-col gap-2 text-sm"
										><span>Jam selesai</span><input
											class="input w-full min-w-0 tabular-nums"
											type="time"
											name="jamSelesai"
											id="activity-end"
											value={selected.jamSelesai ?? ''}
										/></label
									>
								</div>
							</fieldset>
							<div class="divide-y divide-base-200 border-y border-base-200">
								<label class="flex cursor-pointer items-center justify-between gap-4 py-4 text-sm"
									><span class="flex items-center gap-2 font-medium"
										><span class="text-warning" aria-hidden="true"><Icon name="warning" /></span
										>Auto alfa</span
									><input
										class="toggle toggle-warning shrink-0"
										type="checkbox"
										name="autoAlfa"
										checked={selected.autoAlfa}
									/></label
								>
								<label class="flex cursor-pointer items-center justify-between gap-4 py-4 text-sm"
									><span class="flex items-center gap-2 font-medium"
										><span class="text-success" aria-hidden="true"><Icon name="power" /></span
										>Kegiatan aktif</span
									><input
										class="toggle toggle-success shrink-0"
										type="checkbox"
										name="aktif"
										checked={selected.aktif}
									/></label
								>
							</div>
						</fieldset>
					</div>
					<footer
						class="flex shrink-0 justify-end gap-2 border-t border-base-200 bg-base-100 p-4 sm:px-5"
					>
						<button class="btn btn-ghost" type="button" onclick={close} disabled={submitting}
							>Batal</button
						><button
							class="btn btn-success"
							type="submit"
							disabled={submitting || invalid}
							aria-disabled={submitting || invalid}
							>{#if submitting}<span class="loading loading-spinner loading-sm"></span>{:else}<Icon
									name="save"
								/>{/if}{submitting ? 'Menyimpan...' : 'Simpan perubahan'}</button
						>
					</footer>
				{/snippet}
			</FormEnhance>
		{/if}
	</div>
	<form
		method="dialog"
		class="modal-backdrop"
		onsubmit={(event) => {
			if (saving) event.preventDefault();
		}}
	>
		<button aria-label="Tutup pengaturan" disabled={saving}>close</button>
	</form>
</dialog>

<style>
	.activity-settings :global(.table th),
	.activity-settings :global(.table td) {
		white-space: normal;
	}
</style>
