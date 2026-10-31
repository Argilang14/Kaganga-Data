<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import Icon from '$lib/components/icon.svelte';
	import { dormPageHref } from '$lib/dormitory';
	import type { PageProps } from '../../../routes/(informasi-umum)/asrama/[bagian]/$types';
	let { data, form }: Pick<PageProps, 'data' | 'form'> = $props();
	const d = $derived({ ...data.dorm, tab: data.section.key });
	let busy = $state(false);
	let selected = $state<number[]>([]);
	let editor: HTMLDialogElement;
	let previewDialog: HTMLDialogElement;
	let mode = $state('building');
	let model = $state({
		id: 0,
		nama: '',
		asramaId: 0,
		kategori: 'putra',
		kapasitas: 20,
		aktif: true,
		versi: 1,
		kamarId: 0,
		pegawaiId: 0,
		peran: 'utama',
		old: 0
	});
	let previewDraft = $state<Awaited<
		ReturnType<typeof import('$lib/server/dormitory').previewPlacement>
	> | null>(null);
	$effect(() => {
		if (form && 'preview' in form && form.preview) previewDraft = form.preview;
	});
	const preview = $derived(form && 'preview' in form ? form.preview : previewDraft);
	function link(view: string, page = 1) {
		const params = new URLSearchParams({
			kamar_id: String(d.room?.id ?? 0),
			page: String(page)
		});
		if (d.q) params.set('q', d.q);
		return dormPageHref(view, params);
	}
	function open(kind: string, row: Record<string, unknown> = {}) {
		mode = kind;
		model = {
			id: Number(row.id ?? 0),
			nama: String(row.nama ?? ''),
			asramaId: Number(row.asramaId ?? 0),
			kategori: String(row.kategori ?? 'putra'),
			kapasitas: Number(row.kapasitas ?? 20),
			aktif: row.aktif === undefined ? true : Number(row.aktif) === 1,
			versi: Number(row.versi ?? 1),
			kamarId: Number(row.kamar_id ?? d.room?.id ?? 0),
			pegawaiId: 0,
			peran: String(row.peran ?? 'utama'),
			old: Number(row.id ?? 0)
		};
		editor.showModal();
	}
	function toggle(id: number, checked: boolean) {
		selected = checked ? [...new Set([...selected, id])] : selected.filter((item) => item !== id);
	}
</script>

<svelte:head><title>{data.section.title} - Kaganga</title></svelte:head>
<div class="dorm-page min-w-0" data-section={d.tab}>
	<section class="dorm-panel bg-base-100 rounded-lg p-4 shadow-md">
		<header
			class="dorm-header mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
		>
			<div>
				<h1 class="text-xl font-bold">{data.section.title}</h1>
				<p class="text-base-content/60 mt-1 text-sm">
					{#if d.tab === 'gedung'}{d.buildings.length} gedung / blok
					{:else if d.tab === 'penugasan'}{d.staff.length} penugasan aktif
					{:else if ['penghuni', 'pemetaan', 'riwayat'].includes(d.tab)}{d.total}
						{d.tab === 'riwayat' ? 'catatan' : 'murid'}
					{:else}{d.rooms.length} kamar · {d.rooms.reduce((sum, r) => sum + Number(r.penghuni), 0)} penghuni{/if}
				</p>
			</div>
			<div class="dorm-page-actions flex flex-wrap gap-2">
				{#if d.manage && d.tab === 'gedung'}<button
						class="btn btn-soft shadow-none"
						onclick={() => open('building')}><Icon name="plus" />Tambah Asrama</button
					>{/if}
				{#if d.manage && d.tab === 'kamar'}<button
						class="btn btn-soft shadow-none"
						onclick={() => open('room')}
						disabled={!d.buildings.some((b) => Number(b.aktif) === 1)}
						><Icon name="plus" />Tambah Kamar</button
					>{/if}
				{#if d.assign && d.tab === 'penugasan'}<button
						class="btn btn-soft shadow-none"
						onclick={() => open('staff')}><Icon name="plus" />Tugaskan Wali</button
					>{/if}
				{#if d.place && d.tab === 'penghuni'}<a
						href={link('pemetaan')}
						class="btn btn-soft shadow-none"><Icon name="plus" />Tempatkan Murid</a
					>{/if}
			</div>
		</header>
		{#if form && 'message' in form}<div
				class:alert-success={form.success}
				class:alert-error={!form.success}
				class="alert text-sm"
				role="status"
			>
				{form.message}
			</div>{/if}
		<div class="dorm-toolbar mb-4 flex flex-wrap items-end gap-3">
			{#if d.tab !== 'gedung'}
				<form class="dorm-room-filter flex w-full min-w-0 flex-col gap-1.5 sm:w-72" method="GET">
					<label class="text-sm" for="dorm-room">Kamar</label><select
						class="select min-w-0 w-full"
						id="dorm-room"
						name="kamar_id"
						value={d.room?.id ?? 0}
						onchange={(event) => event.currentTarget.form?.requestSubmit()}
					>
						<option value={0}>Semua kamar yang diizinkan</option
						>{#each d.rooms as room (room.id)}<option value={room.id}
								>{room.asrama} / {room.nama}{!room.aktif ? ' (nonaktif)' : ''}</option
							>{/each}
					</select><noscript><button class="btn">Tampilkan</button></noscript>
				</form>
			{/if}
			{#if ['penghuni', 'riwayat', 'pemetaan'].includes(d.tab)}
				<form class="dorm-search flex min-w-0 flex-1 items-end gap-2" method="GET">
					<input type="hidden" name="kamar_id" value={d.room?.id ?? 0} />
					<label class="grid min-w-0 flex-1 gap-1.5 text-sm" for="dorm-search"
						>Cari Murid<input
							id="dorm-search"
							class="input w-full"
							name="q"
							value={d.q}
							placeholder="Nama, NIS, atau NISN"
							maxlength="100"
						/></label
					>
					<button
						class="btn btn-soft btn-square shadow-none"
						type="submit"
						title="Cari murid"
						aria-label="Cari murid"><Icon name="search" /></button
					>
				</form>
			{/if}
		</div>
		{#if d.tab === 'kamar'}
			{@const rooms = d.rooms.filter((r) => !d.room || r.id === d.room.id)}
			{#if rooms.length}
				<div class="grid grid-cols-2 gap-3 border-b border-base-200 pb-4 mb-4 lg:grid-cols-4">
					{#each [['Kamar Aktif', rooms.filter((r) => r.aktif).length], ['Kapasitas', rooms.reduce((n, r) => n + Number(r.kapasitas), 0)], ['Penghuni', rooms.reduce((n, r) => n + Number(r.penghuni), 0)], ['Tempat Tersedia', rooms
								.filter((r) => r.aktif)
								.reduce((n, r) => n + Math.max(0, Number(r.kapasitas) - Number(r.penghuni)), 0)]] as stat (stat[0])}
						<div class="border-base-200 border-l-2 px-3 py-1">
							<div class="text-base-content/60 text-xs">{stat[0]}</div>
							<div class="mt-1 text-xl font-bold">{stat[1]}</div>
						</div>
					{/each}
				</div>
				<!-- svelte-ignore a11y_no_noninteractive_tabindex (Allow keyboard scrolling of the table.) -->
				<div class="dorm-table-scroll" tabindex="0" role="region" aria-label="Daftar kamar">
					<table class="table border-base-200 border dark:border-none">
						<colgroup
							><col class="dorm-col-name" /><col class="dorm-col-category" /><col /><col
								class="dorm-col-occupancy"
							/><col class="dorm-col-status" /><col class="dorm-col-action" /></colgroup
						>
						<thead
							><tr
								><th>Asrama / Kamar</th><th>Kategori</th><th>Wali Asrama</th><th class="w-44"
									>Penghuni</th
								><th>Status</th><th class="w-24 text-right">Aksi</th></tr
							></thead
						>
						<tbody
							>{#each rooms as room (room.id)}<tr
									><td
										><span class="font-semibold">{room.nama}</span>
										<div class="text-base-content/60 text-xs">{room.asrama}</div></td
									><td class="capitalize">{room.kategori}</td><td
										>{room.wali ?? 'Belum ditugaskan'}</td
									><td
										><span class:text-warning={room.penghuni >= room.kapasitas}
											>{room.penghuni} / {room.kapasitas}</span
										><progress
											class="progress progress-success mt-1 h-1.5 w-full"
											value={room.penghuni}
											max={room.kapasitas}
											aria-label={`Keterisian ${room.nama}`}
										></progress></td
									><td
										><span
											class="badge badge-sm"
											class:badge-success={!!room.aktif}
											class:badge-ghost={!room.aktif}>{room.aktif ? 'Aktif' : 'Nonaktif'}</span
										></td
									><td class="text-right"
										>{#if d.manage}<button
												class="btn btn-soft btn-sm btn-square shadow-none"
												title={`Ubah kamar ${room.nama}`}
												aria-label={`Ubah kamar ${room.nama}`}
												onclick={() => open('room', room)}><Icon name="pen" /></button
											>{:else}<a
												class="btn btn-ghost btn-sm"
												href={dormPageHref(
													'penghuni',
													new URLSearchParams({ kamar_id: String(room.id) })
												)}>Lihat</a
											>{/if}</td
									></tr
								>{/each}</tbody
						>
					</table>
				</div>
			{:else}<div class="p-8 text-center">
					<Icon name="users" class="mx-auto mb-3 size-7 text-primary" />
					<h2 class="font-semibold">Belum ada kamar yang dapat ditampilkan</h2>
					<p class="text-base-content/60 mt-1 text-sm">
						{d.manage
							? 'Tambahkan asrama dan kamar terlebih dahulu.'
							: 'Hubungi operator untuk memeriksa penugasan asrama.'}
					</p>
				</div>{/if}
		{:else if d.tab === 'gedung'}
			{#if d.buildings.length}<div class="dorm-table-scroll">
					<div class="overflow-x-auto">
						<table class="table border-base-200 border dark:border-none">
							<colgroup
								><col /><col class="dorm-col-date" /><col class="dorm-col-date" /><col
									class="dorm-col-action"
								/></colgroup
							>
							<thead
								><tr
									><th>Nama</th><th>Kategori</th><th>Status</th><th class="text-right">Aksi</th></tr
								></thead
							><tbody
								>{#each d.buildings as b (b.id)}<tr
										><td>{b.nama}</td><td class="capitalize">{b.kategori}</td><td
											>{Number(b.aktif) ? 'Aktif' : 'Nonaktif'}</td
										><td class="text-right"
											><button
												class="btn btn-ghost btn-sm btn-square"
												title="Ubah asrama"
												aria-label={`Ubah asrama ${b.nama}`}
												onclick={() => open('building', b)}><Icon name="pen" /></button
											></td
										></tr
									>{/each}</tbody
							>
						</table>
					</div>
				</div>{:else}<p class="text-base-content/60 p-7 text-center" role="status">
					Belum ada data gedung atau blok asrama.
				</p>{/if}
		{:else if d.tab === 'penugasan'}
			{#if d.staff.length}
				<!-- svelte-ignore a11y_no_noninteractive_tabindex (Allow keyboard scrolling of the table.) -->
				<div
					class="dorm-table-scroll"
					tabindex="0"
					role="region"
					aria-label="Penugasan wali asrama"
				>
					<table class="table border-base-200 border dark:border-none">
						<colgroup
							><col class="dorm-col-name" /><col /><col class="dorm-col-date" /><col
								class="dorm-col-date"
							/>{#if d.assign}<col class="dorm-col-action" />{/if}</colgroup
						>
						<thead
							><tr
								><th>Nama Pegawai</th><th>Asrama / Kamar</th><th>Peran</th><th>Sejak</th
								>{#if d.assign}<th class="text-right">Aksi</th>{/if}</tr
							></thead
						><tbody
							>{#each d.staff as staff (staff.id)}<tr
									><td class="font-semibold">{staff.nama}</td><td>{staff.asrama} / {staff.kamar}</td
									><td>{staff.peran === 'utama' ? 'Wali Utama' : 'Pendamping'}</td><td
										class="whitespace-nowrap">{staff.mulai}</td
									>{#if d.assign}<td class="text-right"
											><button
												class="btn btn-soft btn-sm btn-square shadow-none"
												title={`Ubah penugasan ${staff.nama}`}
												aria-label={`Ubah penugasan ${staff.nama}`}
												onclick={() => open('staff', staff)}><Icon name="pen" /></button
											></td
										>{/if}</tr
								>{/each}</tbody
						>
					</table>
				</div>{:else}<p class="text-base-content/60 p-8 text-center text-sm">
					Belum ada wali asrama yang ditugaskan pada kamar ini.
				</p>{/if}
			{#if d.assign || d.manage}
				<details class="border-base-200 border-t">
					<summary class="cursor-pointer p-4 text-sm font-semibold"
						>Riwayat Penugasan ({d.staffHistoryTotal})</summary
					>
					<div class="overflow-x-auto">
						<table class="table border-base-200 border dark:border-none">
							<thead
								><tr
									><th>Wali</th><th>Asrama / Kamar</th><th>Peran</th><th>Periode</th><th
										>Alasan / Petugas</th
									></tr
								></thead
							><tbody
								>{#each d.staffHistory as staff (staff.id)}<tr
										><td>{staff.nama_snapshot}</td><td>{staff.asrama} / {staff.kamar}</td><td
											>{staff.peran}</td
										><td>{staff.mulai} s.d. {staff.selesai}</td><td
											>{staff.alasan}
											<div class="text-base-content/60 text-xs">{staff.petugas ?? '-'}</div></td
										></tr
									>{/each}</tbody
							>
						</table>
					</div>
					<div class="flex items-center justify-end gap-2 p-3">
						<a class="btn btn-sm" href={link('penugasan', Math.max(1, d.page - 1))}>Sebelumnya</a
						><span class="text-sm"
							>{d.page} / {Math.max(1, Math.ceil(d.staffHistoryTotal / 20))}</span
						><a
							class="btn btn-sm"
							href={link(
								'penugasan',
								Math.min(Math.max(1, Math.ceil(d.staffHistoryTotal / 20)), d.page + 1)
							)}>Berikutnya</a
						>
					</div>
				</details>
			{/if}
		{:else}
			{#if d.tab === 'pemetaan'}
				<form
					class="dorm-placement-form border-base-200 bg-base-200/40 mb-4 grid gap-3 rounded-md border p-4 md:grid-cols-2 xl:grid-cols-4"
					method="POST"
					action="?/save"
					use:enhance={() => {
						busy = true;
						return async ({ result, update }) => {
							try {
								await update({ reset: false });
								if (result.type === 'success' && result.data?.preview) {
									await tick();
									previewDialog.showModal();
								}
							} finally {
								busy = false;
							}
						};
					}}
				>
					<input type="hidden" name="operation" value="preview" />{#each selected as id (id)}<input
							type="hidden"
							name="muridId"
							value={id}
						/>{/each}
					<label class="grid gap-1 text-sm"
						>Kamar Tujuan<select class="select w-full" name="kamarId" required
							><option value="">Pilih kamar</option
							>{#each d.rooms.filter((r) => r.aktif) as r (r.id)}<option value={r.id}
									>{r.asrama} / {r.nama} ({r.penghuni}/{r.kapasitas})</option
								>{/each}</select
						></label
					>
					<label class="grid gap-1 text-sm"
						>Tanggal Penempatan<input
							class="input w-full"
							type="date"
							name="tanggal"
							value={d.today}
							max={d.today}
							required
						/></label
					>
					<label class="grid gap-1 text-sm"
						>Alasan<input
							class="input w-full"
							name="alasan"
							maxlength="300"
							required
							placeholder="Penempatan awal atau pindah kamar"
						/></label
					>
					<button class="btn btn-primary self-end" disabled={busy || !selected.length}
						>{#if busy}<span class="loading loading-spinner loading-xs"></span>{:else}<Icon
								name="check"
							/>{/if}Pratinjau ({selected.length})</button
					>
				</form>
			{/if}
			{#if d.list.length}
				<!-- svelte-ignore a11y_no_noninteractive_tabindex (Allow keyboard scrolling of the table.) -->
				<div
					class="dorm-table-scroll"
					tabindex="0"
					role="region"
					aria-label={d.tab === 'riwayat' ? 'Riwayat penempatan' : 'Daftar murid asrama'}
				>
					<table class="table border-base-200 border dark:border-none">
						<colgroup
							>{#if d.tab === 'pemetaan'}<col class="dorm-col-select" />{/if}<col
								class="dorm-col-name"
							/><col class="dorm-col-class" /><col /><col class="dorm-col-date" /><col
								class="dorm-col-date"
							/>{#if d.place && ['penghuni', 'riwayat'].includes(d.tab)}<col
									class="dorm-col-action"
								/>{/if}</colgroup
						>
						<thead
							><tr
								>{#if d.tab === 'pemetaan'}<th class="w-12"
										><input
											class="checkbox checkbox-sm"
											type="checkbox"
											aria-label="Pilih murid di halaman ini"
											checked={d.list.every((r) => selected.includes(Number(r.id)))}
											onchange={(event) => {
												for (const row of d.list)
													toggle(Number(row.id), event.currentTarget.checked);
											}}
										/></th
									>{/if}<th>Nama Murid</th><th>Kelas</th><th
									>{d.tab === 'riwayat' ? 'Asal / Tujuan' : 'Asrama / Kamar'}</th
								><th>{d.tab === 'riwayat' ? 'Tanggal' : 'Penugasan Lama'}</th><th
									>{d.tab === 'riwayat' ? 'Alasan / Petugas' : 'Status'}</th
								>{#if d.place && ['penghuni', 'riwayat'].includes(d.tab)}<th class="text-right"
										>Aksi</th
									>{/if}</tr
							></thead
						>
						<tbody
							>{#each d.list as row (row.id)}<tr
									>{#if d.tab === 'pemetaan'}<td
											><input
												type="checkbox"
												class="checkbox checkbox-sm"
												aria-label={`Pilih ${row.nama}`}
												checked={selected.includes(Number(row.id))}
												onchange={(event) => toggle(Number(row.id), event.currentTarget.checked)}
											/></td
										>{/if}
									<td
										><div class="font-semibold">
											{d.tab === 'riwayat' ? row.nama_snapshot : row.nama}
										</div>
										{#if d.tab !== 'riwayat'}<div class="text-base-content/60 text-xs">
												NISN {row.nisn || '-'}
											</div>{/if}</td
									>
									<td>{d.tab === 'riwayat' ? row.kelas_snapshot : row.kelas}</td><td
										>{#if d.tab === 'riwayat' && row.asal}<div class="text-base-content/60 text-xs">
												Dari {row.asal}
											</div>{/if}{row.asrama ?? '-'} / {row.kamar ?? '-'}</td
									>
									<td
										>{#if d.tab === 'riwayat'}<div class="whitespace-nowrap">{row.mulai}</div>
											<div class="text-base-content/60 text-xs">
												s.d. {row.selesai ?? 'sekarang'}
											</div>{:else}{row.waliLama || '-'}{/if}</td
									>
									<td
										>{#if d.tab === 'riwayat'}<div>{row.alasan}</div>
											{#if row.selesai_alasan}<div class="text-base-content/60 text-xs">
													Berakhir: {row.selesai_alasan}
												</div>{/if}
											<div class="text-base-content/60 text-xs">
												{row.petugas ?? '-'}
											</div>{:else}<span
												class="badge badge-sm"
												class:badge-success={!!row.penempatanId}
												class:badge-warning={!row.penempatanId}
												>{row.penempatanId ? 'Ditempatkan' : 'Belum ditempatkan'}</span
											>{#if !Number(row.aktif)}<div class="text-warning mt-1 text-xs">
													Tidak aktif di sekolah
												</div>{/if}{/if}</td
									>
									{#if d.place && ['penghuni', 'riwayat'].includes(d.tab)}<td class="text-right">
											{#if d.tab !== 'riwayat' || !row.selesai}<button
													class="btn btn-ghost btn-sm"
													onclick={() =>
														open('close', {
															id: d.tab === 'riwayat' ? row.id : row.penempatanId,
															nama: d.tab === 'riwayat' ? row.nama_snapshot : row.nama
														})}>Akhiri</button
												>{/if}
										</td>
									{/if}</tr
								>{/each}</tbody
						>
					</table>
				</div>{:else}<p class="text-base-content/60 p-8 text-center text-sm">
					{d.tab === 'pemetaan'
						? 'Tidak ada murid aktif yang cocok.'
						: 'Belum ada data pada pilihan ini.'}
				</p>{/if}
			<footer
				class="border-base-200 flex flex-wrap items-center justify-between gap-3 border-t p-4 text-sm"
			>
				<span class="text-base-content/60"
					>{d.total} murid / catatan{d.tab === 'pemetaan'
						? ` · ${selected.length} dipilih`
						: ''}</span
				>
				<div class="join">
					<a
						class="btn join-item shadow-none"
						href={link(d.tab, Math.max(1, d.page - 1))}
						aria-label="Halaman sebelumnya">‹</a
					><span class="btn join-item pointer-events-none shadow-none"
						>{d.page} / {d.pageCount}</span
					><a
						class="btn join-item shadow-none"
						href={link(d.tab, Math.min(d.pageCount, d.page + 1))}
						aria-label="Halaman berikutnya">›</a
					>
				</div>
			</footer>
		{/if}
	</section>
</div>

<dialog class="modal" bind:this={editor} aria-labelledby="dorm-editor-title">
	<div class="modal-box w-[calc(100%-2rem)] max-w-2xl rounded-lg p-4">
		<div class="mb-4 flex items-center justify-between gap-3">
			<h2 class="text-xl font-bold" id="dorm-editor-title">
				{mode === 'building'
					? 'Data Asrama'
					: mode === 'room'
						? 'Data Kamar'
						: mode === 'staff'
							? 'Penugasan Wali Asrama'
							: 'Akhiri Penempatan'}
			</h2>
			<button
				type="button"
				class="btn btn-ghost btn-sm btn-square"
				title="Tutup"
				aria-label="Tutup"
				onclick={() => editor.close()}
				disabled={busy}><Icon name="close" /></button
			>
		</div>
		<form
			method="POST"
			action="?/save"
			class="space-y-4"
			use:enhance={() => {
				busy = true;
				return async ({ result, update }) => {
					try {
						await update({ reset: false });
						if (result.type === 'success' && result.data?.success) editor.close();
					} finally {
						busy = false;
					}
				};
			}}
		>
			<input type="hidden" name="operation" value={mode} /><input
				type="hidden"
				name="id"
				value={model.id}
			/><input type="hidden" name="versi" value={model.versi} />
			{#if form && 'message' in form && !form.success}<p
					class="alert alert-error text-sm"
					role="alert"
				>
					{form.message}
				</p>{/if}
			{#if mode === 'building' || mode === 'room'}
				<div class="grid gap-4 sm:grid-cols-2">
					<label class="grid gap-1.5 text-sm sm:col-span-2"
						>{mode === 'building' ? 'Nama Gedung / Blok' : 'Nama Kamar'}<input
							class="input w-full"
							name="nama"
							bind:value={model.nama}
							required
							maxlength="100"
						/></label
					>
					{#if mode === 'building'}<label class="grid gap-1.5 text-sm"
							>Kategori<select class="select w-full" name="kategori" bind:value={model.kategori}
								><option value="putra">Putra</option><option value="putri">Putri</option></select
							></label
						>{:else}
						<label class="grid gap-1.5 text-sm"
							>Gedung / Blok{#if model.id}<span class="input flex w-full items-center bg-base-200"
									>{d.rooms.find((r) => r.id === model.id)?.asrama}</span
								>{:else}<select class="select w-full" name="asramaId" required
									><option value="">Pilih asrama</option
									>{#each d.buildings.filter((b) => Number(b.aktif) === 1) as b (b.id)}<option
											value={String(b.id)}>{b.nama}</option
										>{/each}</select
								>{/if}</label
						><label class="grid gap-1.5 text-sm"
							>Kapasitas<input
								class="input w-full"
								type="number"
								name="kapasitas"
								bind:value={model.kapasitas}
								min="1"
								max="1000"
								required
							/></label
						>{/if}
					<label class="flex items-center gap-3 self-end py-2 text-sm"
						><input
							class="toggle toggle-success"
							name="aktif"
							type="checkbox"
							bind:checked={model.aktif}
						/>Aktif</label
					>
				</div>
			{:else}
				{#if mode === 'staff'}<div class="grid gap-4 sm:grid-cols-2">
						<label class="grid gap-1.5 text-sm"
							>Kamar<select
								class="select w-full"
								name="kamarId"
								bind:value={model.kamarId}
								required
								disabled={!!model.old}
								><option value={0} disabled>Pilih kamar</option
								>{#each d.rooms.filter((r) => r.aktif) as r (r.id)}<option value={r.id}
										>{r.asrama} / {r.nama}</option
									>{/each}</select
							>{#if model.old}<input
									type="hidden"
									name="kamarId"
									value={model.kamarId}
								/>{/if}</label
						>
						<label class="grid gap-1.5 text-sm"
							>Peran<select
								class="select w-full"
								name="peran"
								bind:value={model.peran}
								disabled={!!model.old}
								><option value="utama">Wali Utama</option><option value="pendamping"
									>Pendamping</option
								></select
							>{#if model.old}<input type="hidden" name="peran" value={model.peran} />{/if}</label
						>
						<input
							type="hidden"
							name="old"
							value={model.old ||
								Number(
									d.staff.find(
										(s) =>
											Number(s.kamar_id) === model.kamarId &&
											s.peran === 'utama' &&
											model.peran === 'utama'
									)?.id ?? 0
								)}
						/>
						<label class="grid gap-1.5 text-sm sm:col-span-2"
							>Pegawai<select class="select w-full" name="pegawaiId" bind:value={model.pegawaiId}
								><option value={0}
									>{model.old ? 'Akhiri penugasan tanpa pengganti' : 'Pilih pegawai'}</option
								>{#each d.employees as employee (employee.id)}<option value={Number(employee.id)}
										>{employee.nama} · {employee.nip || `ID ${employee.id}`}</option
									>{/each}</select
							></label
						>
					</div>{:else}<p class="border-base-200 rounded-lg border p-3 font-semibold">
						{model.nama}
					</p>{/if}
				<div class="grid gap-4 sm:grid-cols-2">
					<label class="grid gap-1.5 text-sm"
						>Tanggal<input
							class="input w-full"
							type="date"
							name="tanggal"
							value={d.today}
							max={d.today}
							required
						/></label
					><label class="grid gap-1.5 text-sm"
						>Alasan<input class="input w-full" name="alasan" required maxlength="300" /></label
					>
				</div>
			{/if}
			<div class="modal-action border-base-200 border-t pt-4">
				<button class="btn btn-ghost" type="button" onclick={() => editor.close()} disabled={busy}
					>Batal</button
				><button
					class="btn btn-primary"
					disabled={busy || (mode === 'staff' && !model.old && !model.pegawaiId)}
					>{#if busy}<span class="loading loading-spinner loading-xs"></span>{:else}<Icon
							name="check"
						/>{/if}Simpan</button
				>
			</div>
		</form>
	</div>
</dialog>

<dialog class="modal" bind:this={previewDialog} aria-labelledby="dorm-preview-title">
	<div class="modal-box w-[calc(100%-2rem)] max-w-2xl rounded-lg p-4">
		<h2 class="text-xl font-bold" id="dorm-preview-title">Konfirmasi Penempatan</h2>
		{#if preview}
			<p class="mt-2 text-sm">{preview.room.gedung} / {preview.room.nama} · {preview.input.date}</p>
			<p class="text-base-content/60 mt-1 text-sm">
				Wali Asrama: {preview.room.wali ?? 'Belum ditugaskan'}
			</p>
			<div class="my-4 overflow-x-auto">
				<table class="table table-sm">
					<thead><tr><th>Murid / Kelas</th><th>Kamar Sebelumnya</th><th>Wali Lama</th></tr></thead
					><tbody
						>{#each preview.students as student (student.id)}<tr
								><td
									>{student.nama}
									<div class="text-base-content/60 text-xs">{student.kelas}</div></td
								><td>{student.kamar_lama ?? 'Belum ditempatkan'}</td><td
									>{student.wali_lama || '-'}</td
								></tr
							>{/each}</tbody
					>
				</table>
			</div>
			<p class="alert alert-warning text-sm">
				Penempatan berlaku untuk {preview.students.length} murid. Data kelas dan penugasan wali asuh tidak
				berubah.
			</p>
			{#if form && 'message' in form && !form.success}<p
					class="alert alert-error mt-3 text-sm"
					role="alert"
				>
					{form.message}
				</p>{/if}
			<form
				method="POST"
				action="?/save"
				use:enhance={() => {
					busy = true;
					return async ({ result, update }) => {
						try {
							await update({ reset: false });
							if (result.type === 'success' && result.data?.success) {
								selected = [];
								previewDialog.close();
							}
						} finally {
							busy = false;
						}
					};
				}}
			>
				<input type="hidden" name="operation" value="place" /><input
					type="hidden"
					name="kamarId"
					value={preview.input.room}
				/><input type="hidden" name="tanggal" value={preview.input.date} /><input
					type="hidden"
					name="alasan"
					value={preview.input.reason}
				/><input
					type="hidden"
					name="token"
					value={preview.token}
				/>{#each preview.input.ids as id (id)}<input
						type="hidden"
						name="muridId"
						value={id}
					/>{/each}
				<div class="modal-action">
					<button
						class="btn btn-ghost"
						type="button"
						onclick={() => previewDialog.close()}
						disabled={busy}>Batal</button
					><button class="btn btn-success" disabled={busy}
						>{#if busy}<span class="loading loading-spinner loading-xs"></span>{:else}<Icon
								name="check"
							/>{/if}Konfirmasi Penempatan</button
					>
				</div>
			</form>
		{/if}
	</div>
</dialog>

<style>
	.dorm-page {
		--app-page-max-width: 100%;
	}
	.dorm-table-scroll {
		container: dorm-table / inline-size;
		max-width: 100%;
		overflow-x: auto;
		border-radius: var(--app-radius);
	}
	.dorm-table-scroll:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: -2px;
	}
	.dorm-page :global(td) {
		overflow-wrap: anywhere;
		vertical-align: middle;
	}
	.dorm-page :global(th) {
		white-space: nowrap;
	}
	.dorm-page :global(table) {
		min-width: 54rem;
		table-layout: fixed;
	}
	.dorm-page :global(thead) {
		background: var(--color-base-200);
		color: var(--color-base-content);
	}
	.dorm-page :global(thead th) {
		font-weight: 700;
	}
	.dorm-page :global(.dorm-col-name) {
		width: 26%;
	}
	.dorm-page :global(.dorm-col-category) {
		width: 5rem;
	}
	.dorm-page :global(.dorm-col-date),
	.dorm-page :global(.dorm-col-occupancy) {
		width: 9rem;
	}
	.dorm-page :global(.dorm-col-status) {
		width: 6rem;
	}
	.dorm-page :global(.dorm-col-action) {
		width: 6.5rem;
	}
	.dorm-page :global(.dorm-col-select) {
		width: 3.25rem;
	}
	.dorm-page :global(.dorm-col-class) {
		width: 6rem;
	}
	.dorm-page :global(.checkbox) {
		width: 1.5rem;
		height: 1.5rem;
		flex-shrink: 0;
	}
	.dorm-search {
		flex-basis: 18rem;
		max-width: 36rem;
	}
	@container dorm-table (min-width:100rem) {
		.dorm-page :global(.dorm-col-name) {
			width: 30rem;
		}
	}
	.modal-box {
		max-height: min(85dvh, 850px);
		max-width: var(--app-modal-width, 42rem);
		border-radius: var(--app-radius);
	}
	@media (max-width: 639px) {
		.dorm-page-actions {
			width: 100%;
		}
		.dorm-page-actions :global(.btn) {
			flex: 1;
		}
		.modal-action {
			flex-wrap: wrap;
		}
	}
	@media (max-width: 767px) {
		.dorm-page :global(.dorm-col-name) {
			width: 12rem;
		}
	}
</style>
