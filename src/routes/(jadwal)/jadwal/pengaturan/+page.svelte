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
		activeTahunAjaranId: number | null;
		activeSemesterId: number | null;
		tahunAjaranList: { id: number; nama: string }[];
		jenisOptions: { value: JadwalJenis; label: string }[];
		selectedContext: {
			tahunAjaranId: number | null;
			jenis: JadwalJenis;
			semesterId: number | null;
		};
		selectedJenjang: JadwalJenjang;
		jenjangOptions: { value: JadwalJenjang; label: string }[];
		seedInfo: { jamInserted: number; kegiatanInserted: number };
		hariLabels: Record<JadwalHari, string>;
		jamList: JamRow[];
		kegiatanList: KegiatanRow[];
	};

	let { data, form }: { data: PageData; form?: { fail?: string; message?: string } } = $props();
	let importDialog = $state<HTMLDialogElement | null>(null);
	let jamDialog = $state<HTMLDialogElement | null>(null);
	let kegiatanDialog = $state<HTMLDialogElement | null>(null);
	let editingKegiatan = $state<KegiatanRow | null>(null);
	let selectedJamIds = $state<number[]>([]);
	let activeHari = $state<JadwalHari>('senin');
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

<div class="space-y-4">
	<div class="flex flex-col gap-3">
		<div>
			<h2 class="text-2xl font-bold">Pengaturan Jadwal</h2>
			<p class="text-base-content/70 text-sm">
				Atur fondasi jadwal Senin-Jumat untuk jadwal pelajaran, guru, dan kalender pendidikan.
			</p>
			<p class="text-base-content/60 mt-1 text-xs">
				Tahun ajaran aktif ID: {data.activeTahunAjaranId ?? '-'} · Semester aktif ID: {data.activeSemesterId ??
					'-'}
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<form method="GET" class="flex flex-wrap items-center gap-2">
				<label class="text-sm font-semibold whitespace-nowrap" for="tahun-filter"
					>Tahun Ajaran</label
				>
				<select
					id="tahun-filter"
					class="select select-bordered select-sm w-36"
					name="tahunAjaranId"
					value={data.selectedContext.tahunAjaranId ?? ''}
					onchange={submitJenjangFilter}
				>
					{#each data.tahunAjaranList as tahun (tahun.id)}
						<option value={tahun.id}>{tahun.nama}</option>
					{/each}
				</select>
				<label class="text-sm font-semibold whitespace-nowrap" for="jenis-filter">Jadwal</label>
				<select
					id="jenis-filter"
					class="select select-bordered select-sm w-44"
					name="jenis"
					value={data.selectedContext.jenis}
					onchange={submitJenjangFilter}
				>
					{#each data.jenisOptions as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
				<label class="text-sm font-semibold whitespace-nowrap" for="jenjang-filter">Jenjang</label>
				<select
					id="jenjang-filter"
					class="select select-bordered select-sm w-36"
					name="jenjang"
					value={data.selectedJenjang}
					onchange={submitJenjangFilter}
				>
					{#each data.jenjangOptions as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</form>
			<button
				class="btn btn-primary btn-sm shadow-none"
				type="button"
				onclick={() => jamDialog?.showModal()}
			>
				<Icon name="plus" /> Tambah Jam
			</button>
			<button
				class="btn btn-primary btn-sm shadow-none"
				type="button"
				onclick={() => openKegiatanDialog()}
			>
				<Icon name="plus" /> Tambah Kegiatan
			</button>
			<div class="dropdown dropdown-end">
				<button type="button" tabindex="0" class="btn btn-soft btn-sm shadow-none"
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
						<a href={resolve('/api/jadwal/jam/export')}><Icon name="export" /> Export Data</a>
					</li>
				</ul>
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

	<div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px] xl:items-start">
		<div
			class="card bg-base-100 border-base-200 rounded-lg border p-3 order-2 shadow-sm xl:sticky xl:top-4"
		>
			<div>
				<div class="mb-2 flex items-center justify-between gap-2">
					<div>
						<div class="text-sm font-semibold">Kegiatan Non-Mapel</div>
						<div class="text-base-content/60 text-xs">
							Dipakai untuk Upacara, Sholat Dhuha, Istirahat, Ishoma, dan Kokurikuler.
						</div>
					</div>
					<div class="badge badge-soft">{data.kegiatanList.length} kegiatan</div>
				</div>
				<div class="grid max-h-[calc(100vh-16rem)] gap-2 overflow-y-auto pr-1">
					{#each data.kegiatanList as kegiatan (kegiatan.id)}
						<div
							class="border-base-200 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 rounded-lg border p-2"
						>
							<div class="min-w-0">
								<div class="flex items-center gap-2">
									<span
										class="h-3 w-3 rounded-full border"
										style={`background:${kegiatan.warna ?? 'transparent'}`}
									></span>
									<div class="truncate font-medium">{kegiatan.nama}</div>
								</div>
								<div class="text-base-content/60 text-xs">{kegiatan.kode}</div>
							</div>
							<div class="badge badge-outline max-w-20 truncate text-[10px]">
								{kegiatan.kategori}
							</div>
							<div class="flex items-center gap-1">
								<button
									class="btn btn-primary btn-outline btn-xs shadow-none"
									type="button"
									title="Edit kegiatan"
									onclick={() => openKegiatanDialog(kegiatan)}
								>
									<Icon name="edit" />
								</button>
								<form method="POST" action="?/deleteKegiatan">
									<input type="hidden" name="kegiatanId" value={kegiatan.id} />
									<button
										class="btn btn-error btn-outline btn-xs shadow-none"
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
		</div>

		<div class="order-1 space-y-4">
			<div class="card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm">
				<div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h3 class="font-semibold">Jam Pelajaran Senin-Jumat</h3>
						<p class="text-base-content/60 text-sm">
							Slot yang tampil adalah milik {selectedJenjangLabel}. Jumat tetap bisa diatur berbeda.
						</p>
					</div>
					<div class="flex flex-wrap items-center justify-end gap-2">
						<form
							method="POST"
							action={`?/bulkJam&jenjang=${data.selectedJenjang}`}
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
						<form method="POST" action={`?/resetDefault&jenjang=${data.selectedJenjang}`}>
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

				<div class="tabs tabs-box mb-3 w-fit max-w-full overflow-x-auto">
					{#each hariOrder as hari (hari)}
						<button
							class="tab whitespace-nowrap"
							class:tab-active={activeHari === hari}
							type="button"
							onclick={() => {
								activeHari = hari;
								selectedJamIds = [];
							}}>{data.hariLabels[hari]}</button
						>
					{/each}
				</div>
				<div class="space-y-4">
					{#each [activeHari] as hari (hari)}
						<div class="border-base-200 rounded-lg border">
							<div class="bg-base-200/70 rounded-t-lg px-3 py-2 font-semibold">
								{data.hariLabels[hari]}
							</div>
							<div class="overflow-x-auto">
								<table class="table-sm table">
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
														action={`?/updateJam&jenjang=${data.selectedJenjang}`}
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
																value={jam.pukulMulai}
																required
															/>
															<input
																class="input input-bordered input-xs join-item w-24"
																type="time"
																name="pukulSelesai"
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
															form={`jam-form-${jam.id}`}
															value={jam.label ?? ''}
															placeholder="Label"
														/>
														<input
															class="input input-bordered input-xs"
															name="namaDefault"
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
															action={`?/deleteJam&jenjang=${data.selectedJenjang}`}
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

	<dialog class="modal" bind:this={jamDialog}>
		<div class="modal-box max-w-3xl">
			<h3 class="text-lg font-bold">Tambah Jam Jadwal</h3>
			<p class="text-base-content/70 mt-1 text-sm">
				Slot baru akan dibuat untuk {selectedJenjangLabel}.
			</p>
			<form
				method="POST"
				action={`?/createJam&jenjang=${data.selectedJenjang}`}
				class="mt-5 grid gap-4 md:grid-cols-2"
			>
				<input type="hidden" name="jenjang" value={data.selectedJenjang} />
				<input
					type="hidden"
					name="tahunAjaranId"
					value={data.selectedContext.tahunAjaranId ?? ''}
				/>
				<input type="hidden" name="jenis" value={data.selectedContext.jenis} />
				<label class="form-control">
					<span class="label-text mb-1">Hari</span>
					<select class="select select-bordered" name="hari" required>
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
				<div class="modal-action md:col-span-2">
					<button class="btn btn-primary" type="submit"><Icon name="plus" /> Tambah Jam</button>
					<button class="btn" type="button" onclick={() => jamDialog?.close()}>Batal</button>
				</div>
			</form>
		</div>
		<form method="dialog" class="modal-backdrop"><button>Tutup</button></form>
	</dialog>

	<dialog class="modal" bind:this={kegiatanDialog}>
		<div class="modal-box max-w-3xl">
			<h3 class="text-lg font-bold">
				{editingKegiatan ? 'Edit Kegiatan Jadwal' : 'Tambah Kegiatan Jadwal'}
			</h3>
			<p class="text-base-content/70 mt-1 text-sm">
				Kegiatan ini dipakai bersama oleh Pengaturan Jadwal, Item Jadwal, dan jadwal tersimpan.
			</p>
			<form
				method="POST"
				action={editingKegiatan ? '?/updateKegiatan' : '?/createKegiatan'}
				class="mt-5 grid gap-4 md:grid-cols-2"
			>
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
				<div class="modal-action md:col-span-2">
					<button class="btn btn-primary" type="submit">
						<Icon name={editingKegiatan ? 'save' : 'plus'} />
						{editingKegiatan ? 'Simpan Perubahan' : 'Tambah Kegiatan'}
					</button>
					<button class="btn" type="button" onclick={closeKegiatanDialog}>Batal</button>
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

	<dialog class="modal" bind:this={importDialog}>
		<div class="modal-box max-w-lg">
			<h3 class="text-lg font-bold">Import Jam Jadwal</h3>
			<p class="text-base-content/70 mt-1 text-sm">
				Gunakan template Excel agar kolom hari, jam ke, waktu, dan tipe terbaca rapi.
			</p>
			<form
				method="POST"
				action={`?/importJam&jenjang=${data.selectedJenjang}`}
				enctype="multipart/form-data"
				class="mt-4 space-y-4"
			>
				<input type="hidden" name="jenjang" value={data.selectedJenjang} />
				<input
					type="hidden"
					name="tahunAjaranId"
					value={data.selectedContext.tahunAjaranId ?? ''}
				/>
				<input type="hidden" name="jenis" value={data.selectedContext.jenis} />
				<input
					class="file-input file-input-bordered w-full"
					type="file"
					name="file"
					accept=".xlsx,.xls"
					required
				/>
				<div class="modal-action">
					<button class="btn btn-primary" type="submit"><Icon name="import" /> Import</button>
					<button class="btn" type="button" onclick={() => importDialog?.close()}>Batal</button>
				</div>
			</form>
		</div>
		<form method="dialog" class="modal-backdrop"><button>Tutup</button></form>
	</dialog>
</div>
