<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/icon.svelte';

	type Jenjang = 'semua' | 'srd' | 'srmp' | 'srma';
	type KelasRow = {
		id: number;
		nama: string;
		fase: string | null;
		jenjang: Exclude<Jenjang, 'semua'>;
	};
	type JamOption = {
		id: number;
		hari: string;
		jamKe: number;
		pukulMulai: string;
		pukulSelesai: string;
		tipe: 'pelajaran' | 'kegiatan' | 'istirahat' | 'kosong';
		namaDefault: string | null;
	};
	type MapelRow = {
		id: number;
		kode: string;
		nama: string;
		jenjang: Jenjang;
		guruPegawaiId: number | null;
		warna: string | null;
		guru?: { id: number; nama: string; nip: string } | null;
	};
	type DraftRow = {
		id: number;
		kelasId: number;
		jamId: number | null;
		status: 'ok' | 'konflik' | 'belum_terpasang';
		alasanKonflik: string | null;
		jam?: {
			id: number;
			hari: string;
			jamKe: number;
			pukulMulai: string;
			pukulSelesai: string;
		} | null;
		jadwalMapel?: { id: number; kode: string; nama: string; warna: string | null } | null;
		guru?: { id: number; nama: string; nip: string } | null;
	};
	type PageData = {
		activeSemesterId: number | null;
		filter: { jenjang: Jenjang };
		options: { jenjang: readonly Jenjang[] };
		hariLabels: Record<string, string>;
		visibleKelasList: KelasRow[];
		mapelList: MapelRow[];
		bebanMap: Record<string, number>;
		jamPelajaranCount: number;
		jamOptions: JamOption[];
		draftList: DraftRow[];
		conflicts: { key: string; type: string; message: string; draftIds: number[] }[];
		canApplyDraft: boolean;
	};

	let { data, form }: { data: PageData; form?: { fail?: string; message?: string } } = $props();
	const failMessage = $derived(typeof form?.fail === 'string' ? form.fail : '');
	const successMessage = $derived(typeof form?.message === 'string' ? form.message : '');
	const jenjangLabels: Record<Jenjang, string> = {
		semua: 'Semua Jenjang',
		srd: 'SRD',
		srmp: 'SRMP',
		srma: 'SRMA'
	};
	const totalBeban = $derived(
		Object.values(data.bebanMap).reduce((total, value) => total + Number(value || 0), 0)
	);
	let selectedDraftKelasId = $state<number | null>(null);
	const draftOkCount = $derived(data.draftList.filter((draft) => draft.status === 'ok').length);
	const selectedDraftKelas = $derived(
		data.visibleKelasList.find((kelas) => kelas.id === selectedDraftKelasId) ??
			data.visibleKelasList[0] ??
			null
	);

	const visibleJenjangList = $derived.by(() => {
		const order: Exclude<Jenjang, 'semua'>[] = ['srd', 'srmp', 'srma'];
		const present = new Set(data.visibleKelasList.map((kelas) => kelas.jenjang));
		return order.filter((jenjang) => present.has(jenjang));
	});

	function bebanValue(jenjang: Exclude<Jenjang, 'semua'>, mapelId: number) {
		return data.bebanMap[`${jenjang}:${mapelId}`] ?? 0;
	}

	function mapelForJenjang(jenjang: Exclude<Jenjang, 'semua'>) {
		return data.mapelList.filter((mapel) => mapel.jenjang === 'semua' || mapel.jenjang === jenjang);
	}

	function kelasCountForJenjang(jenjang: Exclude<Jenjang, 'semua'>) {
		return data.visibleKelasList.filter((kelas) => kelas.jenjang === jenjang).length;
	}

	function draftRowsForKelas(kelasId: number) {
		return data.draftList.filter((draft) => draft.kelasId === kelasId);
	}

	function conflictCountForKelas(kelasId: number) {
		const draftIds = new Set(draftRowsForKelas(kelasId).map((draft) => draft.id));
		return data.conflicts.filter((conflict) =>
			conflict.draftIds.some((draftId) => draftIds.has(draftId))
		).length;
	}

	function conflictsForKelas(kelasId: number) {
		const draftIds = new Set(draftRowsForKelas(kelasId).map((draft) => draft.id));
		return data.conflicts.filter((conflict) =>
			conflict.draftIds.some((draftId) => draftIds.has(draftId))
		);
	}

	function jamOptionLabel(jam: JamOption) {
		const fixed = jam.tipe !== 'pelajaran' ? ` - ${jam.namaDefault ?? jam.tipe}` : '';
		return `${data.hariLabels[jam.hari]}, Jam ${jam.jamKe} (${jam.pukulMulai}-${jam.pukulSelesai})${fixed}`;
	}
</script>

<div class="space-y-4">
	<div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h2 class="text-2xl font-bold">Aturan Generate Jadwal</h2>
			<p class="text-base-content/70 text-sm">
				Atur beban jam mapel per jenjang, buat draft otomatis, cek konflik, lalu terapkan ke jadwal
				aktif.
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<a class="btn btn-soft btn-sm shadow-none" href={resolve('/jadwal/pelajaran')}>
				<Icon name="book" /> Jadwal Pelajaran
			</a>
			<a class="btn btn-soft btn-sm shadow-none" href={resolve('/data-mata-pelajaran')}>
				<Icon name="table" /> Data Mata Pelajaran
			</a>
			<a class="btn btn-soft btn-sm shadow-none" href={resolve('/jadwal/pengaturan')}>
				<Icon name="gear" /> Pengaturan
			</a>
		</div>
	</div>

	{#if failMessage}
		<div class="alert alert-error alert-soft">
			<Icon name="warning" /><span>{failMessage}</span>
		</div>
	{/if}
	{#if successMessage}
		<div class="alert alert-success alert-soft">
			<Icon name="check" /><span>{successMessage}</span>
		</div>
	{/if}

	<div class="grid gap-3 md:grid-cols-4">
		<div class="stats bg-base-100 border-base-200 border shadow-sm">
			<div class="stat py-4">
				<div class="stat-title">Kelas</div>
				<div class="stat-value text-2xl">{data.visibleKelasList.length}</div>
			</div>
		</div>
		<div class="stats bg-base-100 border-base-200 border shadow-sm">
			<div class="stat py-4">
				<div class="stat-title">Mapel</div>
				<div class="stat-value text-2xl">{data.mapelList.length}</div>
			</div>
		</div>
		<div class="stats bg-base-100 border-base-200 border shadow-sm">
			<div class="stat py-4">
				<div class="stat-title">Target Jam</div>
				<div class="stat-value text-2xl">{totalBeban}</div>
			</div>
		</div>
		<div class="stats bg-base-100 border-base-200 border shadow-sm">
			<div class="stat py-4">
				<div class="stat-title">Draft OK</div>
				<div class="stat-value text-2xl">{draftOkCount}</div>
			</div>
		</div>
	</div>

	<div class="card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm">
		<form method="GET" class="grid gap-3 md:grid-cols-[220px_auto]">
			<label class="form-control gap-1">
				<span class="label-text font-medium">Jenjang</span>
				<select class="select select-bordered select-sm" name="jenjang" value={data.filter.jenjang}>
					{#each data.options.jenjang as jenjang (jenjang)}
						<option value={jenjang}>{jenjangLabels[jenjang]}</option>
					{/each}
				</select>
			</label>
			<div class="flex items-end gap-2">
				<button class="btn btn-primary btn-sm" type="submit"
					><Icon name="search" /> Tampilkan</button
				>
				<a class="btn btn-soft btn-sm" href={resolve('/jadwal/generate')}><Icon name="repeat" /></a>
			</div>
		</form>
	</div>

	{#if !data.activeSemesterId}
		<div class="alert alert-warning alert-soft">
			<Icon name="warning" /><span>Semester aktif belum tersedia.</span>
		</div>
	{:else}
		<form
			method="POST"
			action="?/saveBeban"
			class="card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm"
		>
			<input type="hidden" name="semesterId" value={data.activeSemesterId} />
			<input type="hidden" name="jenjang" value={data.filter.jenjang} />
			<div class="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
				<div>
					<h3 class="font-semibold">Beban Jam Mapel per Jenjang</h3>
					<p class="text-base-content/60 text-sm">
						Isi target jam per minggu. Nilai jenjang diterapkan otomatis ke semua kelas dalam
						jenjang tersebut.
					</p>
				</div>
				<button class="btn btn-primary btn-sm" type="submit"
					><Icon name="save" /> Simpan Beban Jam</button
				>
			</div>
			<div class="space-y-4">
				{#each visibleJenjangList as jenjang (jenjang)}
					<div class="border-base-200 rounded-lg border">
						<div class="bg-base-200/70 flex items-center justify-between rounded-t-lg px-3 py-2">
							<div class="font-semibold">{jenjangLabels[jenjang]}</div>
							<div class="badge badge-soft">{kelasCountForJenjang(jenjang)} kelas</div>
						</div>
						<div class="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
							{#each mapelForJenjang(jenjang) as mapel (mapel.id)}
								<label class="border-base-200 rounded-lg border p-2">
									<div class="flex items-start justify-between gap-2">
										<div class="min-w-0">
											<div class="truncate text-sm font-semibold">{mapel.kode} - {mapel.nama}</div>
											<div class="text-base-content/60 truncate text-xs">
												{mapel.guru?.nama ?? 'Guru belum diisi'}
											</div>
										</div>
										<input
											class="input input-bordered input-sm w-20"
											type="number"
											min="0"
											max="20"
											name={`beban:${jenjang}:${mapel.id}`}
											value={bebanValue(jenjang, mapel.id)}
										/>
									</div>
								</label>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</form>

		<div class="card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm">
			<div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
				<div>
					<h3 class="font-semibold">Aturan Slot Tetap</h3>
					<p class="text-base-content/60 text-sm">
						Jam yang disetel sebagai kegiatan/istirahat di Pengaturan Jadwal otomatis dilewati
						generator.
					</p>
				</div>
				<a class="btn btn-soft btn-sm shadow-none" href={resolve('/jadwal/pengaturan')}>
					<Icon name="gear" /> Atur Jam
				</a>
			</div>
			<div class="mt-3 flex flex-wrap gap-2 text-xs">
				{#each data.jamOptions.filter((jam) => jam.tipe !== 'pelajaran') as jam (jam.id)}
					<span class="badge badge-outline gap-1 px-3 py-3">
						<Icon name="calendar" />
						{jamOptionLabel(jam)}
					</span>
				{:else}
					<span class="text-base-content/60"
						>Belum ada slot tetap. Semua jam aktif dianggap pelajaran.</span
					>
				{/each}
			</div>
		</div>

		<div class="grid gap-4 xl:grid-cols-[360px_1fr]">
			<div class="card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm">
				<h3 class="font-semibold">Generate Draft Jadwal</h3>
				<p class="text-base-content/60 mt-1 text-sm">
					Generator memakai {data.jamPelajaranCount} slot pelajaran aktif. Draft tidak mengubah jadwal
					aktif sampai tombol terapkan ditekan.
				</p>
				<div class="mt-4 flex flex-col gap-2">
					<form method="POST" action="?/generateDraft">
						<input type="hidden" name="semesterId" value={data.activeSemesterId} />
						<input type="hidden" name="jenjang" value={data.filter.jenjang} />
						<button class="btn btn-secondary w-full shadow-none" type="submit">
							<Icon name="calendar" /> Generate Draft Jadwal
						</button>
					</form>
					<form method="POST" action="?/applyDraft">
						<input type="hidden" name="semesterId" value={data.activeSemesterId} />
						<input type="hidden" name="jenjang" value={data.filter.jenjang} />
						<button
							class="btn btn-primary w-full shadow-none"
							type="submit"
							disabled={!data.canApplyDraft}
						>
							<Icon name="check" /> Terapkan Draft ke Jadwal Aktif
						</button>
					</form>
				</div>
				{#if data.conflicts.length}
					<div class="alert alert-warning alert-soft mt-4 items-start">
						<Icon name="warning" />
						<div>
							<div class="font-semibold">
								{data.conflicts.length === 1
									? 'Ada 1 konflik yang perlu dibereskan.'
									: `${data.conflicts.length} konflik perlu diperbaiki sebelum diterapkan.`}
							</div>
							<div class="text-sm">
								Pilih kelas yang bertanda konflik, lalu gunakan kolom Perbaikan untuk memindahkan
								mapel ke jam pelajaran lain yang kosong.
							</div>
						</div>
					</div>
				{/if}
			</div>

			<div class="card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm">
				<div class="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<div>
						<h3 class="font-semibold">Hasil Draft dan Konflik</h3>
						<p class="text-base-content/60 text-sm">
							Pilih kelas untuk melihat slot draft dan konflik yang perlu dibereskan.
						</p>
					</div>
					<div class="badge badge-soft">{data.draftList.length} baris draft</div>
				</div>

				<div class="mb-4 flex flex-wrap gap-2">
					{#each data.visibleKelasList as kelas (kelas.id)}
						<button
							class:btn-primary={selectedDraftKelas?.id === kelas.id}
							class:btn-soft={selectedDraftKelas?.id !== kelas.id}
							class="btn btn-sm shadow-none"
							type="button"
							onclick={() => (selectedDraftKelasId = kelas.id)}
						>
							{kelas.nama}
							<span class="badge badge-xs">{draftRowsForKelas(kelas.id).length}</span>
							{#if conflictCountForKelas(kelas.id) > 0}
								<span class="badge badge-error badge-xs">{conflictCountForKelas(kelas.id)}</span>
							{/if}
						</button>
					{/each}
				</div>

				{#if selectedDraftKelas}
					{@const kelasConflicts = conflictsForKelas(selectedDraftKelas.id)}
					{#if kelasConflicts.length}
						<div class="mb-4 space-y-2">
							{#each kelasConflicts as conflict (conflict.key)}
								<div class="alert alert-warning alert-soft py-2 text-sm">
									<Icon name="warning" /><span>{conflict.message}</span>
								</div>
							{/each}
						</div>
					{/if}

					<div class="border-base-200 rounded-lg border">
						<div class="bg-base-200/70 flex items-center justify-between rounded-t-lg px-3 py-2">
							<div class="font-semibold">Draft {selectedDraftKelas.nama}</div>
							<div class="badge badge-soft">
								{draftRowsForKelas(selectedDraftKelas.id).length} slot
							</div>
						</div>
						<div class="overflow-x-auto">
							<table class="table-sm table">
								<thead>
									<tr
										><th>Hari/Jam</th><th>Mapel</th><th>Guru</th><th>Status</th><th
											class="text-right">Perbaikan</th
										></tr
									>
								</thead>
								<tbody>
									{#each draftRowsForKelas(selectedDraftKelas.id) as draft (draft.id)}
										<tr>
											<td>
												{draft.jam
													? `${data.hariLabels[draft.jam.hari]}, Jam ${draft.jam.jamKe}`
													: '-'}
											</td>
											<td>
												<div class="font-semibold">{draft.jadwalMapel?.kode ?? '-'}</div>
												<div class="text-base-content/60 text-xs">
													{draft.jadwalMapel?.nama ?? draft.alasanKonflik ?? '-'}
												</div>
											</td>
											<td>{draft.guru?.nama ?? '-'}</td>
											<td>
												<span
													class:badge-success={draft.status === 'ok'}
													class:badge-warning={draft.status !== 'ok'}
													class="badge badge-soft badge-sm"
												>
													{draft.status === 'ok' ? 'OK' : 'Konflik'}
												</span>
											</td>
											<td class="min-w-72 text-right">
												<form
													method="POST"
													action="?/updateDraftSlot"
													class="flex justify-end gap-2"
												>
													<input type="hidden" name="draftId" value={draft.id} />
													<select
														class="select select-bordered select-xs w-full"
														name="jamId"
														value={draft.jamId ?? ''}
													>
														<option value="">Pilih jam...</option>
														{#each data.jamOptions.filter((jam) => jam.tipe === 'pelajaran') as jam (jam.id)}
															<option value={jam.id}>{jamOptionLabel(jam)}</option>
														{/each}
													</select>
													<button class="btn btn-primary btn-xs shadow-none" type="submit">
														<Icon name="save" />
													</button>
												</form>
											</td>
										</tr>
									{:else}
										<tr>
											<td colspan="5" class="text-base-content/60 py-6 text-center">
												Belum ada draft untuk kelas ini.
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				{:else}
					<div class="text-base-content/60 rounded-lg border border-dashed p-6 text-center">
						Belum ada kelas pada filter ini.
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
