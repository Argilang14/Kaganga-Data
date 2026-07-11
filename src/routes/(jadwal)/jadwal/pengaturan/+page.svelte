<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/icon.svelte';

	type JadwalHari = 'senin' | 'selasa' | 'rabu' | 'kamis' | 'jumat';
	type JadwalJenjang = 'srd' | 'srmp' | 'srma';
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
	let selectedJamIds = $state<number[]>([]);
	const failMessage = $derived(typeof form?.fail === 'string' ? form.fail : '');
	const successMessage = $derived(typeof form?.message === 'string' ? form.message : '');
	const hariOrder: JadwalHari[] = ['senin', 'selasa', 'rabu', 'kamis', 'jumat'];
	const selectedJenjangLabel = $derived(
		data.jenjangOptions.find((option) => option.value === data.selectedJenjang)?.label ?? 'SRMA/SRT'
	);
	const visibleJamIds = $derived(data.jamList.map((jam) => jam.id));
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

	function submitJenjangFilter(event: Event) {
		(event.currentTarget as HTMLSelectElement).form?.requestSubmit();
	}

	function jamByHari(hari: JadwalHari) {
		return data.jamList.filter((jam) => jam.hari === hari);
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

	function tipeBadge(tipe: JamRow['tipe']) {
		if (tipe === 'pelajaran') return 'badge-primary';
		if (tipe === 'kegiatan') return 'badge-secondary';
		if (tipe === 'istirahat') return 'badge-accent';
		return 'badge-ghost';
	}
</script>

<div class="space-y-4">
	<div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
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
		<div class="flex flex-wrap items-center gap-2 sm:flex-nowrap">
			<a class="btn btn-soft btn-sm shadow-none" href={resolve('/jadwal')}>
				<Icon name="left" />
				Jadwal
			</a>
			<a class="btn btn-soft btn-sm shadow-none" href={resolve('/jadwal/pelajaran')}>
				<Icon name="book" />
				Jadwal Pelajaran
			</a>
			<a class="btn btn-soft btn-sm shadow-none" href={resolve('/jadwal/kalender')}>
				<Icon name="calendar" />
				Kaldik
			</a>
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

	<div class="card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm">
		<div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
			<div class="min-w-0">
				<h3 class="font-semibold">Pengaturan Slot Jadwal</h3>
				<p class="text-base-content/60 text-sm">
					Pilih jenjang, tambah slot jam, kelola data Excel, dan siapkan kegiatan non-mapel dari
					panel ini.
				</p>
			</div>
			<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
				<form method="GET" class="flex items-center gap-2">
					<label class="text-sm font-semibold whitespace-nowrap" for="jenjang-filter">Jenjang</label
					>
					<select
						id="jenjang-filter"
						class="select select-bordered select-sm w-52"
						name="jenjang"
						value={data.selectedJenjang}
						onchange={submitJenjangFilter}
					>
						{#each data.jenjangOptions as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</form>
				<div class="flex flex-wrap items-center gap-2 sm:flex-nowrap">
					<button
						class="btn btn-primary btn-sm shadow-none"
						type="button"
						onclick={() => jamDialog?.showModal()}
					>
						<Icon name="plus" />
						Tambah Jam
					</button>
					<button
						class="btn btn-primary btn-sm shadow-none"
						type="button"
						onclick={() => kegiatanDialog?.showModal()}
					>
						<Icon name="plus" />
						Tambah Kegiatan
					</button>
					<div class="dropdown dropdown-end">
						<button type="button" tabindex="0" class="btn btn-soft btn-sm shadow-none">
							<Icon name="down" />
							Data Excel
						</button>
						<ul
							tabindex="-1"
							class="dropdown-content menu bg-base-100 rounded-box border-base-300 z-10 mt-2 w-56 border p-2 shadow-xl"
						>
							<li>
								<a href={resolve('/api/jadwal/jam/template')}
									><Icon name="download" /> Template Import</a
								>
							</li>
							<li>
								<button type="button" onclick={() => importDialog?.showModal()}>
									<Icon name="import" /> Import Data
								</button>
							</li>
							<li>
								<a href={resolve('/api/jadwal/jam/export')}><Icon name="export" /> Export Data</a>
							</li>
						</ul>
					</div>
				</div>
			</div>
		</div>

		<div class="border-base-200 mt-4 border-t pt-4">
			<div class="mb-2 flex items-center justify-between gap-2">
				<div>
					<div class="text-sm font-semibold">Kegiatan Non-Mapel</div>
					<div class="text-base-content/60 text-xs">
						Dipakai untuk Upacara, Sholat Dhuha, Istirahat, Ishoma, dan Kokurikuler.
					</div>
				</div>
				<div class="badge badge-soft">{data.kegiatanList.length} kegiatan</div>
			</div>
			<div
				class="grid max-h-56 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
			>
				{#each data.kegiatanList as kegiatan (kegiatan.id)}
					<div
						class="border-base-200 grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-lg border p-3"
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
						<div class="badge badge-outline">{kegiatan.kategori}</div>
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
				{/each}
			</div>
		</div>
	</div>

	<div class="space-y-4">
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
						<button class="btn btn-soft btn-sm shadow-none" type="submit">
							<Icon name="repeat" />
							Cek Default
						</button>
					</form>
				</div>
			</div>

			<div class="space-y-4">
				{#each hariOrder as hari (hari)}
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
													toggleAllJamSelection((event.currentTarget as HTMLInputElement).checked)}
												title="Pilih semua jam"
											/>
										</th>
										<th>Jam</th>
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
											<td class="font-semibold">{jam.jamKe}</td>
											<td>
												<form
													id={`jam-form-${jam.id}`}
													method="POST"
													action={`?/updateJam&jenjang=${data.selectedJenjang}`}
													class="contents"
												>
													<input type="hidden" name="jamId" value={jam.id} />
													<input type="hidden" name="jenjang" value={data.selectedJenjang} />
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
														<button
															class="btn btn-error btn-outline btn-xs shadow-none"
															type="submit"
															title="Hapus jam"
															onclick={(event) => {
																if (
																	!confirm('Hapus jam ini? Slot jadwal pada jam ini ikut terhapus.')
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
						placeholder="Misal Apel Pagi, Istirahat"
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
			<h3 class="text-lg font-bold">Tambah Kegiatan Jadwal</h3>
			<p class="text-base-content/70 mt-1 text-sm">
				Tambahkan kegiatan non-mapel untuk dipakai pada slot jadwal.
			</p>
			<form method="POST" action="?/createKegiatan" class="mt-5 grid gap-4 md:grid-cols-2">
				<label class="form-control">
					<span class="label-text mb-1">Kode Kegiatan</span>
					<input class="input input-bordered" name="kode" placeholder="apel_pagi" required />
				</label>
				<label class="form-control">
					<span class="label-text mb-1">Nama Kegiatan</span>
					<input class="input input-bordered" name="nama" placeholder="Apel Pagi" required />
				</label>
				<label class="form-control">
					<span class="label-text mb-1">Kategori</span>
					<select class="select select-bordered" name="kategori" required>
						<option value="umum">Umum</option>
						<option value="kokurikuler">Kokurikuler</option>
						<option value="keagamaan">Keagamaan</option>
						<option value="istirahat">Istirahat</option>
					</select>
				</label>
				<label class="form-control">
					<span class="label-text mb-1">Warna</span>
					<input class="input input-bordered h-12" name="warna" type="color" value="#8BC34A" />
				</label>
				<label class="label cursor-pointer justify-start gap-3">
					<input class="toggle toggle-success" type="checkbox" name="aktif" checked />
					<span class="label-text">Aktif</span>
				</label>
				<div class="modal-action md:col-span-2">
					<button class="btn btn-primary" type="submit"><Icon name="plus" /> Tambah Kegiatan</button
					>
					<button class="btn" type="button" onclick={() => kegiatanDialog?.close()}>Batal</button>
				</div>
			</form>
		</div>
		<form method="dialog" class="modal-backdrop"><button>Tutup</button></form>
	</dialog>

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
