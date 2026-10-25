<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/icon.svelte';
	import { buildJpNumberBySlot, jadwalSlotKey } from '$lib/jadwal-slots';

	type JadwalHari = 'senin' | 'selasa' | 'rabu' | 'kamis' | 'jumat';
	type JadwalJenjang = 'srd' | 'srmp' | 'srma';
	type JadwalJenis = 'persiapan' | 'ganjil' | 'genap';
	type JamRow = {
		id: number;
		hari: JadwalHari;
		jenjang: JadwalJenjang;
		jamKe: number;
		label: string | null;
		pukulMulai: string;
		pukulSelesai: string;
		tipe: 'pelajaran' | 'kegiatan' | 'istirahat' | 'kosong';
		namaDefault: string | null;
		urutan?: number | null;
		aktif: boolean;
	};
	type KegiatanRow = {
		id: number;
		kode: string;
		nama: string;
		kategori: 'umum' | 'kokurikuler' | 'keagamaan' | 'istirahat';
		warna: string | null;
		aktif: boolean;
	};
	type PageData = {
		tahunAjaranList: { id: number; nama: string }[];
		jenisOptions: { value: JadwalJenis; label: string }[];
		selectedContext: {
			tahunAjaranId: number | null;
			jenis: JadwalJenis;
		};
		selectedJenjang: JadwalJenjang;
		selectedHari: JadwalHari;
		jenjangOptions: { value: JadwalJenjang; label: string }[];
		seedInfo: { jamInserted: number; kegiatanInserted: number };
		hariLabels: Record<JadwalHari, string>;
		jamList: JamRow[];
		kegiatanList: KegiatanRow[];
	};
	type CopyPreview = {
		sourceCount: number;
		targetDayCount: number;
		added: number;
		updated: number;
		unchanged: number;
		removed: number;
		conflicts: string[];
	};
	type CopyRequestState = {
		source: {
			tahunAjaranId: number;
			jenis: JadwalJenis;
			jenjang: JadwalJenjang;
			hari: JadwalHari;
		};
		target: {
			tahunAjaranId: number;
			jenis: JadwalJenis;
			jenjang: JadwalJenjang;
			hari: JadwalHari[];
		};
		scope: 'semua' | 'terpilih';
		policy: 'gabung' | 'ganti';
		selectedJamIds?: number[];
	};

	let {
		data,
		form
	}: {
		data: PageData;
		form?: {
			fail?: string;
			message?: string;
			copyPreview?: CopyPreview;
			copyRequest?: CopyRequestState;
		};
	} = $props();
	let importDialog = $state<HTMLDialogElement | null>(null);
	let jamDialog = $state<HTMLDialogElement | null>(null);
	let copyDialog = $state<HTMLDialogElement | null>(null);
	let kegiatanDialog = $state<HTMLDialogElement | null>(null);
	let editingKegiatan = $state<KegiatanRow | null>(null);
	let selectedJamIds = $state<number[]>([]);
	let activeHariOverride = $state<JadwalHari | null>(null);
	let copyScope = $state<'semua' | 'terpilih'>('semua');
	const activeHari = $derived(activeHariOverride ?? data.selectedHari);
	const failMessage = $derived(typeof form?.fail === 'string' ? form.fail : '');
	const successMessage = $derived(typeof form?.message === 'string' ? form.message : '');
	const hariOrder: JadwalHari[] = ['senin', 'selasa', 'rabu', 'kamis', 'jumat'];
	const selectedJenjangLabel = $derived(
		data.jenjangOptions.find((option) => option.value === data.selectedJenjang)?.label ?? 'SRMA/SRT'
	);
	const visibleJamIds = $derived(
		data.jamList.filter((jam) => jam.hari === activeHari).map((jam) => jam.id)
	);
	const selectedVisibleJamCount = $derived(
		selectedJamIds.filter((id) => visibleJamIds.includes(id)).length
	);
	const allVisibleJamSelected = $derived(
		visibleJamIds.length > 0 && selectedVisibleJamCount === visibleJamIds.length
	);
	const typeLabels = {
		pelajaran: 'Pelajaran',
		kegiatan: 'Kegiatan',
		istirahat: 'Istirahat',
		kosong: 'Kosong'
	};
	const exportJamHref = $derived(
		resolve('/api/jadwal/jam/export') +
			`?tahunAjaranId=${data.selectedContext.tahunAjaranId ?? ''}&jenis=${data.selectedContext.jenis}&jenjang=${data.selectedJenjang}`
	);

	$effect(() => {
		if (!form?.copyPreview) return;
		copyScope = form.copyRequest?.scope ?? 'semua';
		selectedJamIds = form.copyRequest?.selectedJamIds ?? [];
		queueMicrotask(() => copyDialog?.showModal());
	});

	const jpNumberBySlot = $derived.by(() => buildJpNumberBySlot(data.jamList));
	function submitJenjangFilter(event: Event) {
		(event.currentTarget as HTMLSelectElement).form?.requestSubmit();
	}

	function jamByHari(hari: JadwalHari) {
		return data.jamList.filter((jam) => jam.hari === hari);
	}

	function jpForJam(jam: JamRow) {
		return jpNumberBySlot.get(jadwalSlotKey(jam)) ?? null;
	}

	function toggleJamSelection(id: number, checked: boolean) {
		selectedJamIds = checked
			? Array.from(new Set([...selectedJamIds, id]))
			: selectedJamIds.filter((selectedId) => selectedId !== id);
	}

	function toggleAllJamSelection(checked: boolean) {
		selectedJamIds = checked ? visibleJamIds : [];
	}

	function confirmBulkJam(event: SubmitEvent) {
		const form = event.currentTarget as HTMLFormElement;
		const action = new FormData(form).get('bulkAction')?.toString();
		if (
			action === 'hapus' &&
			!confirm('Hapus semua jam terpilih? Slot jadwal pada jam tersebut ikut terhapus.')
		) {
			event.preventDefault();
		}
	}

	function openKegiatanDialog(kegiatan: KegiatanRow | null = null) {
		editingKegiatan = kegiatan;
		kegiatanDialog?.showModal();
	}

	function closeKegiatanDialog() {
		editingKegiatan = null;
		kegiatanDialog?.close();
	}
	function tipeBadge(tipe: JamRow['tipe']) {
		if (tipe === 'pelajaran') return 'badge-primary';
		if (tipe === 'kegiatan') return 'badge-secondary';
		if (tipe === 'istirahat') return 'badge-accent';
		return 'badge-ghost';
	}
</script>

<div class="settings-page space-y-4">
	<div class="settings-header">
		<div>
			<h2 class="text-xl font-bold">Pengaturan Jadwal</h2>
			<p class="text-base-content/70 text-sm">
				Atur fondasi jadwal Senin-Jumat untuk jadwal pelajaran, guru, dan kalender pendidikan.
			</p>
			<p class="text-base-content/60 mt-1 text-xs">
				{data.tahunAjaranList.find((tahun) => tahun.id === data.selectedContext.tahunAjaranId)
					?.nama ?? '-'}
				&middot; {data.jenisOptions.find((jenis) => jenis.value === data.selectedContext.jenis)
					?.label ?? '-'}
				&middot; {selectedJenjangLabel}
			</p>
		</div>
		<div class="settings-toolbar">
			<form method="GET" class="settings-filters">
				<input type="hidden" name="hari" value={activeHari} />
				<div class="settings-field">
					<label class="text-sm font-medium" for="tahun-filter">Tahun Ajaran</label>
					<select
						id="tahun-filter"
						class="select select-bordered w-full"
						name="tahunAjaranId"
						value={data.selectedContext.tahunAjaranId ?? ''}
						onchange={submitJenjangFilter}
					>
						{#each data.tahunAjaranList as tahun (tahun.id)}
							<option value={tahun.id}>{tahun.nama}</option>
						{/each}
					</select>
				</div>
				<div class="settings-field">
					<label class="text-sm font-medium" for="jenis-filter">Jenis jadwal</label>
					<select
						id="jenis-filter"
						class="select select-bordered w-full"
						name="jenis"
						value={data.selectedContext.jenis}
						onchange={submitJenjangFilter}
					>
						{#each data.jenisOptions as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</div>
				<div class="settings-field">
					<label class="text-sm font-medium" for="jenjang-filter">Jenjang</label>
					<select
						id="jenjang-filter"
						class="select select-bordered w-full"
						name="jenjang"
						value={data.selectedJenjang}
						onchange={submitJenjangFilter}
					>
						{#each data.jenjangOptions as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</div>
			</form>
			<div class="settings-primary-actions">
				<button
					class="btn btn-primary shadow-none"
					type="button"
					onclick={() => jamDialog?.showModal()}
				>
					<Icon name="plus" /> Tambah Jam
				</button>
				<button class="btn btn-soft shadow-none" type="button" onclick={() => openKegiatanDialog()}>
					<Icon name="plus" /> Tambah Kegiatan
				</button>
				<div class="dropdown dropdown-end settings-excel">
					<button type="button" tabindex="0" class="btn btn-soft shadow-none"
						><Icon name="down" /> Data Excel</button
					>
					<ul
						tabindex="-1"
						class="dropdown-content menu bg-base-100 rounded-box border-base-300 z-20 mt-2 w-56 border p-2 shadow-xl"
					>
						<li>
							<a href={resolve('/api/jadwal/jam/template')}
								><Icon name="download" /> Template Import</a
							>
						</li>
						<li>
							<button type="button" onclick={() => importDialog?.showModal()}
								><Icon name="import" /> Import Data</button
							>
						</li>
						<li>
							<!-- URL is resolved above before appending the active context. -->
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
							<a href={exportJamHref}><Icon name="export" /> Export Konteks Aktif</a>
						</li>
					</ul>
				</div>
			</div>
		</div>
	</div>

	{#if failMessage}
		<div class="alert alert-error alert-soft">
			<Icon name="warning" />
			<span>{failMessage}</span>
		</div>
	{/if}
	{#if successMessage}
		<div class="alert alert-success alert-soft">
			<Icon name="check" />
			<span>{successMessage}</span>
		</div>
	{/if}

	{#if data.seedInfo.jamInserted || data.seedInfo.kegiatanInserted}
		<div class="alert alert-success">
			<Icon name="check" />
			<span>
				Fondasi jadwal dibuat: {data.seedInfo.jamInserted} jam dan {data.seedInfo.kegiatanInserted} kegiatan
				default.
			</span>
		</div>
	{/if}

	<div class="settings-workspace">
		<details class="settings-activities">
			<summary>
				<span class="font-semibold">Kegiatan Non-Mapel</span>
				<span class="badge badge-soft badge-info">{data.kegiatanList.length} kegiatan</span>
				<Icon name="down" />
			</summary>
			<div class="settings-activity-body">
				<div class="settings-activity-list">
					{#each data.kegiatanList as kegiatan (kegiatan.id)}
						<div class="settings-activity-item">
							<div class="min-w-0">
								<div class="flex items-center gap-2">
									<span
										class="h-3 w-3 rounded-full border"
										style={`background:${kegiatan.warna ?? 'transparent'}`}
									></span>
									<div class="font-medium break-words">{kegiatan.nama}</div>
								</div>
								<div class="text-base-content/60 mt-1 text-xs break-all">{kegiatan.kode}</div>
								<div class="badge badge-ghost badge-sm mt-2">{kegiatan.kategori}</div>
							</div>
							<div class="flex items-center gap-1">
								<button
									class="btn btn-soft btn-sm btn-square shadow-none"
									type="button"
									title="Edit kegiatan"
									onclick={() => openKegiatanDialog(kegiatan)}
								>
									<Icon name="edit" />
								</button>
								<form method="POST" action="?/deleteKegiatan">
									<input type="hidden" name="kegiatanId" value={kegiatan.id} />
									<button
										class="btn btn-error btn-soft btn-sm btn-square shadow-none"
										type="submit"
										title="Hapus kegiatan"
										onclick={(event) => {
											if (!confirm('Hapus kegiatan non-mapel ini?')) event.preventDefault();
										}}
									>
										<Icon name="del" />
									</button>
								</form>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</details>

		<div class="min-w-0 space-y-4">
			<div class="settings-editor">
				<div class="settings-editor-heading">
					<div>
						<h3 class="font-semibold">Jam Pelajaran Senin-Jumat</h3>
						<p class="text-base-content/60 text-sm">
							{selectedJenjangLabel} &middot; {jamByHari(activeHari).length} slot pada {data
								.hariLabels[activeHari]}
						</p>
					</div>
					<div class="settings-editor-actions">
						<button
							class="btn btn-soft btn-sm shadow-none"
							type="button"
							onclick={() => copyDialog?.showModal()}
						>
							<Icon name="copy" /> Salin Susunan Jam
						</button>
						<div class="settings-bulk">
							<form
								method="POST"
								action={`?/bulkJam&jenjang=${data.selectedJenjang}&hari=${activeHari}`}
								class="flex flex-wrap items-center justify-end gap-2"
								onsubmit={confirmBulkJam}
							>
								<input type="hidden" name="jenjang" value={data.selectedJenjang} />
								<input
									type="hidden"
									name="tahunAjaranId"
									value={data.selectedContext.tahunAjaranId ?? ''}
								/>
								<input type="hidden" name="jenis" value={data.selectedContext.jenis} />
								{#each selectedJamIds as jamId (jamId)}
									<input type="hidden" name="jamIds" value={jamId} />
								{/each}
								<select
									class="select select-bordered select-sm w-36"
									aria-label="Tindakan untuk jam terpilih"
									name="bulkAction"
									disabled={selectedVisibleJamCount === 0}
								>
									<option value="aktif">Aktifkan</option>
									<option value="nonaktif">Nonaktifkan</option>
									<option value="hapus">Hapus</option>
								</select>
								<button
									class="btn btn-primary btn-sm shadow-none"
									type="submit"
									disabled={selectedVisibleJamCount === 0}
								>
									Terapkan ({selectedVisibleJamCount})
								</button>
							</form>
						</div>
						<form
							method="POST"
							action={`?/resetDefault&jenjang=${data.selectedJenjang}&hari=${activeHari}`}
						>
							<input type="hidden" name="jenjang" value={data.selectedJenjang} />
							<input
								type="hidden"
								name="tahunAjaranId"
								value={data.selectedContext.tahunAjaranId ?? ''}
							/>
							<input type="hidden" name="jenis" value={data.selectedContext.jenis} />
							<button class="btn btn-soft btn-sm shadow-none" type="submit">
								<Icon name="repeat" />
								Cek Default
							</button>
						</form>
					</div>
				</div>

				<div class="settings-days tabs tabs-box mb-3">
					{#each hariOrder as hari (hari)}
						<button
							class="tab whitespace-nowrap"
							class:tab-active={activeHari === hari}
							aria-pressed={activeHari === hari}
							type="button"
							onclick={() => {
								activeHariOverride = hari;
								selectedJamIds = [];
							}}>{data.hariLabels[hari]}</button
						>
					{/each}
				</div>
				<div class="space-y-4">
					{#each [activeHari] as hari (hari)}
						<div class="settings-table-frame">
							<div class="settings-day-heading">
								{data.hariLabels[hari]}
							</div>
							<!-- Keyboard access to horizontal table scrolling. -->
							<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
							<div
								class="settings-table-scroll"
								role="region"
								aria-label={`Jam jadwal ${data.hariLabels[hari]}`}
								tabindex="0"
							>
								<table class="settings-table table-sm table">
									<colgroup
										><col class="col-check" /><col class="col-slot" /><col class="col-time" /><col
											class="col-type"
										/><col class="col-label" /><col class="col-status" /><col
											class="col-actions"
										/></colgroup
									>
									<thead>
										<tr>
											<th class="w-10">
												<input
													class="checkbox checkbox-sm"
													type="checkbox"
													checked={allVisibleJamSelected}
													onchange={(event) =>
														toggleAllJamSelection(
															(event.currentTarget as HTMLInputElement).checked
														)}
													title="Pilih semua jam"
												/>
											</th>
											<th>Slot / JP</th>
											<th>Pukul</th>
											<th>Tipe</th>
											<th>Label</th>
											<th>Status</th>
											<th class="text-right">Aksi</th>
										</tr>
									</thead>
									<tbody>
										{#each jamByHari(hari) as jam (jam.id)}
											<tr>
												<td>
													<input
														class="checkbox checkbox-sm"
														type="checkbox"
														aria-label={`Pilih slot ${jam.jamKe}`}
														checked={selectedJamIds.includes(jam.id)}
														onchange={(event) =>
															toggleJamSelection(
																jam.id,
																(event.currentTarget as HTMLInputElement).checked
															)}
													/>
												</td>
												<td>
													<div class="font-semibold">Slot {jam.jamKe}</div>
													<div class="text-base-content/60 text-xs">
														{jpForJam(jam) ? `JP ${jpForJam(jam)}` : 'Non-JP'}
													</div>
												</td>
												<td>
													<form
														id={`jam-form-${jam.id}`}
														method="POST"
														action={`?/updateJam&jenjang=${data.selectedJenjang}&hari=${activeHari}`}
														class="contents"
													>
														<input type="hidden" name="jamId" value={jam.id} />
														<input type="hidden" name="jenjang" value={data.selectedJenjang} />
														<input
															type="hidden"
															name="tahunAjaranId"
															value={data.selectedContext.tahunAjaranId ?? ''}
														/>
														<input type="hidden" name="jenis" value={data.selectedContext.jenis} />
														<div class="join">
															<input
																class="input input-bordered input-xs join-item w-24"
																type="time"
																name="pukulMulai"
																aria-label={`Pukul mulai slot ${jam.jamKe}`}
																value={jam.pukulMulai}
																required
															/>
															<input
																class="input input-bordered input-xs join-item w-24"
																type="time"
																name="pukulSelesai"
																aria-label={`Pukul selesai slot ${jam.jamKe}`}
																value={jam.pukulSelesai}
																required
															/>
														</div>
													</form>
												</td>
												<td>
													<select
														class="select select-bordered select-xs w-32"
														name="tipe"
														aria-label={`Tipe slot ${jam.jamKe}`}
														form={`jam-form-${jam.id}`}
														value={jam.tipe}
														required
													>
														{#each Object.entries(typeLabels) as [key, label] (key)}
															<option value={key}>{label}</option>
														{/each}
													</select>
												</td>
												<td>
													<div class="flex min-w-52 flex-col gap-1">
														<input
															class="input input-bordered input-xs"
															name="label"
															aria-label={`Label slot ${jam.jamKe}`}
															form={`jam-form-${jam.id}`}
															value={jam.label ?? ''}
															placeholder="Label"
														/>
														<input
															class="input input-bordered input-xs"
															name="namaDefault"
															aria-label={`Nama default slot ${jam.jamKe}`}
															list="kegiatan-default-options"
															form={`jam-form-${jam.id}`}
															value={jam.namaDefault ?? ''}
															placeholder="Nama default, misal Istirahat"
														/>
													</div>
												</td>
												<td>
													<div class={`badge ${tipeBadge(jam.tipe)} badge-outline`}>
														{typeLabels[jam.tipe]}
													</div>
													<label class="mt-1 flex items-center gap-1 text-xs">
														<input
															class="toggle toggle-success toggle-xs"
															type="checkbox"
															name="aktif"
															form={`jam-form-${jam.id}`}
															checked={jam.aktif}
														/>
														Aktif
													</label>
												</td>
												<td class="text-right">
													<div class="flex justify-end gap-1">
														<button
															class="btn btn-primary btn-xs shadow-none"
															type="submit"
															form={`jam-form-${jam.id}`}
															title="Simpan jam"
														>
															<Icon name="save" />
														</button>
														<form
															method="POST"
															action={`?/deleteJam&jenjang=${data.selectedJenjang}&hari=${activeHari}`}
														>
															<input type="hidden" name="jamId" value={jam.id} />
															<input type="hidden" name="jenjang" value={data.selectedJenjang} />
															<input
																type="hidden"
																name="tahunAjaranId"
																value={data.selectedContext.tahunAjaranId ?? ''}
															/>
															<input
																type="hidden"
																name="jenis"
																value={data.selectedContext.jenis}
															/>
															<button
																class="btn btn-error btn-outline btn-xs shadow-none"
																type="submit"
																title="Hapus jam"
																onclick={(event) => {
																	if (
																		!confirm(
																			'Hapus jam ini? Slot jadwal pada jam ini ikut terhapus.'
																		)
																	)
																		event.preventDefault();
																}}
															>
																<Icon name="del" />
															</button>
														</form>
													</div>
												</td>
											</tr>
										{:else}
											<tr
												><td colspan="7" class="settings-empty"
													>Belum ada jam jadwal pada hari ini.</td
												></tr
											>
										{/each}
									</tbody>
								</table>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>

	<dialog class="modal app-modal settings-dialog" aria-labelledby="jam-title" bind:this={jamDialog}>
		<div class="modal-box app-modal-box settings-modal-wide">
			<h3 id="jam-title" class="app-modal-title">Tambah Jam Jadwal</h3>
			<p class="text-base-content/70 mt-1 text-sm">
				Slot baru akan dibuat untuk {selectedJenjangLabel}.
			</p>
			<form
				method="POST"
				action={`?/createJam&jenjang=${data.selectedJenjang}&hari=${activeHari}`}
				class="settings-modal-form"
			>
				<div class="app-modal-body settings-form-grid">
					<input type="hidden" name="jenjang" value={data.selectedJenjang} />
					<input
						type="hidden"
						name="tahunAjaranId"
						value={data.selectedContext.tahunAjaranId ?? ''}
					/>
					<input type="hidden" name="jenis" value={data.selectedContext.jenis} />
					<label class="form-control">
						<span class="label-text mb-1">Hari</span>
						<select class="select select-bordered" name="hari" value={activeHari} required>
							{#each hariOrder as hari (hari)}
								<option value={hari}>{data.hariLabels[hari]}</option>
							{/each}
						</select>
					</label>
					<label class="form-control">
						<span class="label-text mb-1">Jam ke</span>
						<input
							class="input input-bordered"
							name="jamKe"
							type="number"
							min="1"
							step="1"
							placeholder="13"
							required
						/>
					</label>
					<label class="form-control">
						<span class="label-text mb-1">Pukul mulai</span>
						<input class="input input-bordered" name="pukulMulai" type="time" required />
					</label>
					<label class="form-control">
						<span class="label-text mb-1">Pukul selesai</span>
						<input class="input input-bordered" name="pukulSelesai" type="time" required />
					</label>
					<label class="form-control">
						<span class="label-text mb-1">Tipe</span>
						<select class="select select-bordered" name="tipe" required>
							{#each Object.entries(typeLabels) as [key, label] (key)}
								<option value={key}>{label}</option>
							{/each}
						</select>
					</label>
					<label class="form-control">
						<span class="label-text mb-1">Label</span>
						<input class="input input-bordered" name="label" placeholder="Jam 13" />
					</label>
					<label class="form-control md:col-span-2">
						<span class="label-text mb-1">Nama default</span>
						<input
							class="input input-bordered"
							name="namaDefault"
							list="kegiatan-default-options"
							placeholder="Pilih kegiatan, misal Istirahat"
						/>
					</label>
					<label class="label cursor-pointer justify-start gap-3">
						<input class="toggle toggle-success" type="checkbox" name="aktif" checked />
						<span class="label-text">Aktif</span>
					</label>
				</div>
				<div class="modal-action app-modal-actions">
					<button class="btn" type="button" onclick={() => jamDialog?.close()}>Batal</button>
					<button class="btn btn-primary" type="submit"><Icon name="plus" /> Tambah Jam</button>
				</div>
			</form>
		</div>
		<form method="dialog" class="modal-backdrop"><button>Tutup</button></form>
	</dialog>

	<dialog
		class="modal app-modal settings-dialog"
		aria-labelledby="copy-title"
		bind:this={copyDialog}
	>
		<div class="modal-box app-modal-box settings-modal-copy">
			<h3 id="copy-title" class="app-modal-title">Salin Susunan Jam</h3>
			<p class="text-base-content/70 mt-1 text-sm">
				Salin struktur waktu dan tipe slot tanpa menyalin mata pelajaran, guru, atau isi jadwal
				kelas.
			</p>
			<form method="POST" action="?/copyJam" class="settings-modal-form">
				<div class="app-modal-body space-y-5">
					<div class="grid gap-4 lg:grid-cols-2">
						<fieldset class="border-base-300 grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
							<legend class="px-2 font-semibold">Sumber</legend>
							<label class="form-control">
								<span class="label-text mb-1">Tahun ajaran</span>
								<select class="select select-bordered" name="sourceTahunAjaranId" required>
									{#each data.tahunAjaranList as tahun (tahun.id)}
										<option
											value={tahun.id}
											selected={tahun.id ===
												(form?.copyRequest?.source.tahunAjaranId ??
													data.selectedContext.tahunAjaranId)}>{tahun.nama}</option
										>
									{/each}
								</select>
							</label>
							<label class="form-control">
								<span class="label-text mb-1">Jenis jadwal</span>
								<select class="select select-bordered" name="sourceJenis" required>
									{#each data.jenisOptions as option (option.value)}
										<option
											value={option.value}
											selected={option.value ===
												(form?.copyRequest?.source.jenis ?? data.selectedContext.jenis)}
											>{option.label}</option
										>
									{/each}
								</select>
							</label>
							<label class="form-control">
								<span class="label-text mb-1">Jenjang</span>
								<select class="select select-bordered" name="sourceJenjang" required>
									{#each data.jenjangOptions as option (option.value)}
										<option
											value={option.value}
											selected={option.value ===
												(form?.copyRequest?.source.jenjang ?? data.selectedJenjang)}
											>{option.label}</option
										>
									{/each}
								</select>
							</label>
							<label class="form-control">
								<span class="label-text mb-1">Hari</span>
								<select class="select select-bordered" name="sourceHari" required>
									{#each hariOrder as hari (hari)}
										<option
											value={hari}
											selected={hari === (form?.copyRequest?.source.hari ?? activeHari)}
											>{data.hariLabels[hari]}</option
										>
									{/each}
								</select>
							</label>
							<label class="form-control sm:col-span-2">
								<span class="label-text mb-1">Cakupan</span>
								<select class="select select-bordered" name="scope" bind:value={copyScope}>
									<option value="semua">Seluruh susunan hari</option>
									<option value="terpilih"
										>Hanya slot yang dicentang ({selectedVisibleJamCount})</option
									>
								</select>
							</label>
							{#each selectedJamIds as jamId (jamId)}
								<input type="hidden" name="selectedJamIds" value={jamId} />
							{/each}
						</fieldset>

						<fieldset class="border-base-300 grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
							<legend class="px-2 font-semibold">Tujuan</legend>
							<label class="form-control">
								<span class="label-text mb-1">Tahun ajaran</span>
								<select class="select select-bordered" name="targetTahunAjaranId" required>
									{#each data.tahunAjaranList as tahun (tahun.id)}
										<option
											value={tahun.id}
											selected={tahun.id ===
												(form?.copyRequest?.target.tahunAjaranId ??
													data.selectedContext.tahunAjaranId)}>{tahun.nama}</option
										>
									{/each}
								</select>
							</label>
							<label class="form-control">
								<span class="label-text mb-1">Jenis jadwal</span>
								<select class="select select-bordered" name="targetJenis" required>
									{#each data.jenisOptions as option (option.value)}
										<option
											value={option.value}
											selected={option.value ===
												(form?.copyRequest?.target.jenis ?? data.selectedContext.jenis)}
											>{option.label}</option
										>
									{/each}
								</select>
							</label>
							<label class="form-control sm:col-span-2">
								<span class="label-text mb-1">Jenjang</span>
								<select class="select select-bordered" name="targetJenjang" required>
									{#each data.jenjangOptions as option (option.value)}
										<option
											value={option.value}
											selected={option.value ===
												(form?.copyRequest?.target.jenjang ?? data.selectedJenjang)}
											>{option.label}</option
										>
									{/each}
								</select>
							</label>
							<div class="sm:col-span-2">
								<div class="label-text mb-2">Hari tujuan</div>
								<div class="flex flex-wrap gap-3">
									{#each hariOrder as hari (hari)}
										<label class="label cursor-pointer gap-2 p-0">
											<input
												class="checkbox checkbox-sm"
												type="checkbox"
												name="targetHari"
												value={hari}
												checked={form?.copyRequest?.target.hari?.includes(hari) ??
													hari !== activeHari}
											/>
											<span>{data.hariLabels[hari]}</span>
										</label>
									{/each}
								</div>
							</div>
							<label class="form-control sm:col-span-2">
								<span class="label-text mb-1">Cara menyimpan</span>
								<select class="select select-bordered" name="policy" required>
									<option
										value="gabung"
										selected={(form?.copyRequest?.policy ?? 'gabung') === 'gabung'}
										>Gabungkan dan perbarui slot yang sama</option
									>
									<option
										value="ganti"
										disabled={copyScope === 'terpilih'}
										selected={form?.copyRequest?.policy === 'ganti'}
										>Ganti seluruh susunan hari tujuan</option
									>
								</select>
							</label>
						</fieldset>
					</div>

					{#if form?.copyPreview}
						<div class="border-base-300 rounded-lg border p-4">
							<div class="font-semibold">Pratinjau Penyalinan</div>
							<div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
								<div>
									<div class="text-base-content/60 text-xs">Sumber</div>
									<strong>{form.copyPreview.sourceCount}</strong>
								</div>
								<div>
									<div class="text-base-content/60 text-xs">Hari tujuan</div>
									<strong>{form.copyPreview.targetDayCount}</strong>
								</div>
								<div>
									<div class="text-base-content/60 text-xs">Baru</div>
									<strong>{form.copyPreview.added}</strong>
								</div>
								<div>
									<div class="text-base-content/60 text-xs">Diperbarui</div>
									<strong>{form.copyPreview.updated}</strong>
								</div>
								<div>
									<div class="text-base-content/60 text-xs">Tetap</div>
									<strong>{form.copyPreview.unchanged}</strong>
								</div>
								<div>
									<div class="text-base-content/60 text-xs">Dihapus</div>
									<strong>{form.copyPreview.removed}</strong>
								</div>
							</div>
							{#if form.copyPreview.conflicts.length}
								<div class="alert alert-error alert-soft mt-3">
									<Icon name="warning" />
									<div>
										<div class="font-semibold">Konflik perlu diselesaikan</div>
										{#each form.copyPreview.conflicts as conflict (conflict)}
											<div class="text-sm">{conflict}</div>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/if}
				</div>
				<div class="modal-action app-modal-actions">
					<button class="btn" type="button" onclick={() => copyDialog?.close()}>Batal</button>
					<button class="btn btn-soft" type="submit" name="intent" value="preview">
						<Icon name="eye" /> Pratinjau
					</button>
					{#if form?.copyPreview && form.copyPreview.conflicts.length === 0}
						<button class="btn btn-primary" type="submit" name="intent" value="apply">
							<Icon name="copy" /> Terapkan Penyalinan
						</button>
					{/if}
				</div>
			</form>
		</div>
		<form method="dialog" class="modal-backdrop"><button>Tutup</button></form>
	</dialog>

	<dialog
		class="modal app-modal settings-dialog"
		aria-labelledby="kegiatan-title"
		bind:this={kegiatanDialog}
	>
		<div class="modal-box app-modal-box settings-modal-wide">
			<h3 id="kegiatan-title" class="app-modal-title">
				{editingKegiatan ? 'Edit Kegiatan Jadwal' : 'Tambah Kegiatan Jadwal'}
			</h3>
			<p class="text-base-content/70 mt-1 text-sm">
				Kegiatan ini dipakai bersama oleh Pengaturan Jadwal, Item Jadwal, dan jadwal tersimpan.
			</p>
			<form
				method="POST"
				action={editingKegiatan ? '?/updateKegiatan' : '?/createKegiatan'}
				class="settings-modal-form"
			>
				<div class="app-modal-body settings-form-grid">
					{#if editingKegiatan}
						<input type="hidden" name="kegiatanId" value={editingKegiatan.id} />
					{/if}
					<label class="form-control">
						<span class="label-text mb-1">Kode Kegiatan</span>
						<input
							class="input input-bordered"
							name="kode"
							placeholder="APEL_PAGI"
							value={editingKegiatan?.kode ?? ''}
							required
						/>
					</label>
					<label class="form-control">
						<span class="label-text mb-1">Nama Kegiatan</span>
						<input
							class="input input-bordered"
							name="nama"
							placeholder="Apel Pagi"
							value={editingKegiatan?.nama ?? ''}
							required
						/>
					</label>
					<label class="form-control">
						<span class="label-text mb-1">Kategori</span>
						<select
							class="select select-bordered"
							name="kategori"
							value={editingKegiatan?.kategori ?? 'umum'}
							required
						>
							<option value="umum">Umum</option>
							<option value="kokurikuler">Kokurikuler</option>
							<option value="keagamaan">Keagamaan</option>
							<option value="istirahat">Istirahat</option>
						</select>
					</label>
					<label class="form-control">
						<span class="label-text mb-1">Warna</span>
						<input
							class="input input-bordered h-12"
							name="warna"
							type="color"
							value={editingKegiatan?.warna ?? '#8BC34A'}
						/>
					</label>
					<label class="label cursor-pointer justify-start gap-3">
						<input
							class="toggle toggle-success"
							type="checkbox"
							name="aktif"
							checked={editingKegiatan?.aktif ?? true}
						/>
						<span class="label-text">Aktif</span>
					</label>
				</div>
				<div class="modal-action app-modal-actions">
					<button class="btn" type="button" onclick={closeKegiatanDialog}>Batal</button>
					<button class="btn btn-primary" type="submit">
						<Icon name={editingKegiatan ? 'save' : 'plus'} />
						{editingKegiatan ? 'Simpan Perubahan' : 'Tambah Kegiatan'}
					</button>
				</div>
			</form>
		</div>
		<form method="dialog" class="modal-backdrop">
			<button onclick={() => (editingKegiatan = null)}>Tutup</button>
		</form>
	</dialog>

	<datalist id="kegiatan-default-options">
		{#each data.kegiatanList.filter((item) => item.aktif) as kegiatan (kegiatan.id)}
			<option value={kegiatan.nama}>{kegiatan.kode}</option>
		{/each}
	</datalist>

	<dialog
		class="modal app-modal settings-dialog"
		aria-labelledby="import-title"
		bind:this={importDialog}
	>
		<div class="modal-box app-modal-box settings-modal-import">
			<h3 id="import-title" class="app-modal-title">Import Jam Jadwal</h3>
			<p class="text-base-content/70 mt-1 text-sm">
				Gunakan template Excel agar kolom hari, jam ke, waktu, dan tipe terbaca rapi.
			</p>
			<form
				method="POST"
				action={`?/importJam&jenjang=${data.selectedJenjang}`}
				enctype="multipart/form-data"
				class="settings-modal-form"
			>
				<div class="app-modal-body">
					<input type="hidden" name="jenjang" value={data.selectedJenjang} />
					<input
						type="hidden"
						name="tahunAjaranId"
						value={data.selectedContext.tahunAjaranId ?? ''}
					/>
					<input type="hidden" name="jenis" value={data.selectedContext.jenis} />
					<label class="form-control"
						><span class="label-text">Berkas Excel</span><input
							class="file-input file-input-bordered w-full"
							type="file"
							name="file"
							accept=".xlsx,.xls"
							required
						/></label
					>
				</div>
				<div class="modal-action app-modal-actions">
					<button class="btn" type="button" onclick={() => importDialog?.close()}>Batal</button>
					<button class="btn btn-primary" type="submit"><Icon name="import" /> Import</button>
				</div>
			</form>
		</div>
		<form method="dialog" class="modal-backdrop"><button>Tutup</button></form>
	</dialog>
</div>

<style>
	.settings-page {
		min-width: 0;
	}
	.settings-header,
	.settings-editor,
	.settings-activities {
		min-width: 0;
		border: 1px solid var(--color-base-200);
		border-radius: var(--app-radius);
		background: var(--color-base-100);
		box-shadow: 0 1px 3px #0000000d;
	}
	.settings-header,
	.settings-editor {
		padding: 1rem;
	}
	.settings-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 1rem;
		margin-top: 1rem;
	}
	.settings-filters {
		display: grid;
		flex: 1 1 30rem;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.75rem;
		min-width: 0;
	}
	.settings-field,
	.settings-dialog .form-control {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0.5rem;
		min-width: 0;
	}
	.settings-primary-actions,
	.settings-editor-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
	}
	.settings-header .btn,
	.settings-header .select {
		height: 2.5rem;
		min-height: 2.5rem;
		font-size: 0.875rem;
	}
	.settings-workspace {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1rem;
	}
	.settings-activities > summary {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-height: 3.5rem;
		padding: 0.75rem 1rem;
		cursor: pointer;
		list-style: none;
	}
	.settings-activities > summary::-webkit-details-marker {
		display: none;
	}
	.settings-activities > summary :global(svg:last-child) {
		margin-left: auto;
		flex-shrink: 0;
		transition: transform 0.15s;
	}
	.settings-activities[open] > summary :global(svg:last-child) {
		transform: rotate(180deg);
	}
	.settings-activity-body {
		padding: 0 1rem 1rem;
	}
	.settings-activity-list {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.75rem;
		max-height: 30rem;
		overflow-y: auto;
	}
	.settings-activity-item {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: start;
		gap: 0.5rem;
		border: 1px solid var(--color-base-200);
		border-radius: var(--app-radius);
		padding: 0.75rem;
	}
	.settings-editor-heading {
		display: flex;
		flex-wrap: wrap;
		align-items: start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
	}
	.settings-editor-actions {
		flex: 1 1 100%;
		padding: 0.75rem 0;
		border-top: 1px solid var(--color-base-200);
		border-bottom: 1px solid var(--color-base-200);
	}
	.settings-editor-actions > button {
		order: 1;
	}
	.settings-editor-actions > form {
		order: 2;
	}
	.settings-bulk {
		order: 3;
		margin-left: auto;
	}
	.settings-days {
		display: flex;
		width: 100%;
		min-width: 0;
		overflow-x: auto;
		background: var(--color-base-200);
	}
	.settings-days .tab {
		flex: 1 0 auto;
		height: 2.5rem;
	}
	.settings-days .tab-active {
		color: var(--color-primary);
		font-weight: 600;
	}
	.settings-table-frame {
		min-width: 0;
		overflow: hidden;
		border: 1px solid var(--color-base-200);
		border-radius: var(--app-radius);
	}
	.settings-day-heading {
		padding: 0.75rem;
		font-size: 0.875rem;
		font-weight: 600;
		background: color-mix(in oklab, var(--color-primary) 6%, var(--color-base-100));
	}
	.settings-table-scroll {
		width: 100%;
		overflow-x: auto;
		overscroll-behavior-x: contain;
	}
	.settings-table {
		table-layout: fixed;
		width: 100%;
		min-width: 1024px;
	}
	.col-check {
		width: 52px;
	}
	.col-slot {
		width: 84px;
	}
	.col-time {
		width: 228px;
	}
	.col-type {
		width: 144px;
	}
	.col-label {
		width: auto;
	}
	.col-status {
		width: 124px;
	}
	.col-actions {
		width: 96px;
	}
	.settings-table th,
	.settings-table td {
		padding: 0.75rem;
		vertical-align: middle;
	}
	.settings-table thead {
		background: var(--color-base-200);
		color: var(--color-base-content);
	}
	.settings-table th {
		height: 44px;
		font-weight: 600;
	}
	.settings-table tbody tr:hover {
		background: color-mix(in oklab, var(--color-base-200) 45%, transparent);
	}
	.settings-page .checkbox {
		width: 24px;
		height: 24px;
		min-width: 24px;
		flex-shrink: 0;
		border-radius: 0.375rem;
	}
	.settings-table .input,
	.settings-table .select,
	.settings-table .btn {
		height: 2rem;
		min-height: 2rem;
		font-size: 0.8125rem;
	}
	.settings-table .input,
	.settings-table .select {
		width: 100%;
		min-width: 0;
	}
	.settings-table .join .input {
		width: 102px;
	}
	.settings-table .btn {
		width: 2rem;
		padding: 0;
	}
	.settings-table td:nth-child(5) > div {
		min-width: 0;
		gap: 0.5rem;
	}
	.settings-table .badge {
		max-width: 100%;
		font-size: 0.75rem;
	}
	.settings-empty {
		height: 7rem;
		text-align: center;
		color: color-mix(in oklab, var(--color-base-content) 65%, transparent);
	}
	.settings-modal-wide {
		--app-modal-width: 48rem;
	}
	.settings-modal-copy {
		--app-modal-width: 64rem;
	}
	.settings-modal-import {
		--app-modal-width: 32rem;
	}
	.settings-modal-form {
		display: flex;
		flex: 1 1 auto;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
	}
	.settings-form-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
	}
	.settings-dialog .input,
	.settings-dialog .select,
	.settings-dialog .file-input {
		min-width: 0;
		width: 100%;
		height: 2.5rem;
		min-height: 2.5rem;
		font-size: 0.875rem;
	}
	.settings-dialog .label-text {
		margin: 0;
		font-size: 0.875rem;
	}
	.settings-dialog fieldset {
		min-width: 0;
	}
	.settings-dialog .checkbox {
		width: 24px;
		height: 24px;
		min-width: 24px;
	}
	.settings-activities > summary:focus-visible,
	.settings-table-scroll:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}
	@media (max-width: 1100px) {
		.settings-activity-list {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 639px) {
		.settings-filters {
			grid-template-columns: minmax(0, 1fr);
		}
		.settings-toolbar,
		.settings-primary-actions {
			width: 100%;
		}
		.settings-primary-actions > button {
			flex: 1 1 auto;
		}
		.settings-excel {
			flex: 1 1 100%;
		}
		.settings-excel > button {
			width: 100%;
		}
		.settings-excel .dropdown-content {
			left: 0;
			right: auto;
			width: 100%;
		}
		.settings-bulk {
			margin-left: 0;
			flex: 1 1 100%;
			padding-top: 0.5rem;
		}
		.settings-bulk form {
			justify-content: start;
		}
		.settings-bulk .select {
			flex: 1;
			min-width: 0;
		}
		.settings-activity-list {
			grid-template-columns: minmax(0, 1fr);
		}
		.settings-form-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.settings-form-grid > :global(*) {
			grid-column: auto;
		}
		.settings-dialog .app-modal-actions {
			justify-content: end;
			gap: 0.5rem;
		}
		.settings-dialog .app-modal-actions .btn {
			flex: 1 1 auto;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.settings-activities > summary :global(svg) {
			transition: none;
		}
	}
</style>
