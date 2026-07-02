<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/icon.svelte';

	type Hari = 'senin' | 'selasa' | 'rabu' | 'kamis' | 'jumat';
	type Guru = { id: number; nama: string; nip: string };
	type Kelas = { id: number; nama: string; fase?: string | null };
	type JadwalSlot = {
		id: number;
		hari: Hari;
		tipe: 'pelajaran' | 'kegiatan' | 'istirahat' | 'kosong';
		label: string;
		catatan?: string | null;
		jam?: { jamKe: number; pukulMulai: string; pukulSelesai: string; label?: string | null } | null;
		kelas?: Kelas | null;
		guru?: Guru | null;
		jadwalMapel?: { nama: string; kode?: string | null } | null;
		mataPelajaran?: { nama: string; kode?: string | null } | null;
		kegiatan?: { nama: string; warna?: string | null } | null;
		kokurikuler?: { kode: string; tujuan: string } | null;
	};
	type Summary = { id: number; nama: string; nip: string; totalJam: number; totalKelas: number };
	type PageData = {
		activeSemesterId: number | null;
		selectedGuruId: number | null;
		selectedKelasId: number | null;
		guruList: Guru[];
		kelasList: Kelas[];
		hariLabels: Record<Hari, string>;
		jadwalList: JadwalSlot[];
		summaryList: Summary[];
		sekolahNama: string;
		userIsGuru: boolean;
	};

	let { data }: { data: PageData } = $props();

	const hariList = ['senin', 'selasa', 'rabu', 'kamis', 'jumat'] as const;
	const selectedGuru = $derived(
		data.guruList.find((guru) => guru.id === data.selectedGuruId) ?? null
	);
	const totalJam = $derived(
		data.jadwalList.filter((slot) => slot.tipe === 'pelajaran' && slot.guru).length
	);
	const totalKelas = $derived(
		new Set(data.jadwalList.map((slot) => slot.kelas?.id).filter(Boolean)).size
	);
	const totalMapel = $derived(
		new Set(
			data.jadwalList
				.map(
					(slot) =>
						slot.jadwalMapel?.kode ||
						slot.jadwalMapel?.nama ||
						slot.mataPelajaran?.kode ||
						slot.mataPelajaran?.nama
				)
				.filter(Boolean)
		).size
	);

	function slotsByHari(hari: Hari) {
		return data.jadwalList.filter((slot) => slot.hari === hari);
	}

	function printPage() {
		window.print();
	}
</script>

<svelte:head>
	<style>
		@media print {
			:global(body) {
				background: white !important;
			}
			:global(.no-print),
			:global(nav),
			:global(aside) {
				display: none !important;
			}
			.print-area {
				padding: 0 !important;
			}
			.print-card {
				box-shadow: none !important;
				border: 1px solid #111 !important;
				break-inside: avoid;
			}
		}
	</style>
</svelte:head>

<div class="print-area space-y-4">
	<div class="no-print flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<h2 class="text-2xl font-bold">Jadwal Guru</h2>
			<p class="text-base-content/70 text-sm">
				Rekap jadwal mengajar guru dari slot Jadwal Pelajaran yang sudah diisi.
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<a class="btn btn-soft btn-sm shadow-none" href={resolve('/jadwal/pelajaran')}>
				<Icon name="table" />
				Jadwal Pelajaran
			</a>
			<button class="btn btn-primary btn-sm shadow-none" type="button" onclick={printPage}>
				<Icon name="print" />
				Cetak
			</button>
		</div>
	</div>

	{#if !data.activeSemesterId}
		<div class="alert alert-warning items-start">
			<Icon name="warning" />
			<div>
				<div class="font-semibold">Semester aktif belum dipilih.</div>
				<p class="text-sm">Pilih tahun ajaran dan semester aktif terlebih dahulu.</p>
			</div>
		</div>
	{:else}
		<form
			class="no-print rounded-box border-base-300 bg-base-100 grid gap-3 border p-4 md:grid-cols-4"
			method="GET"
			action={resolve('/jadwal/guru')}
		>
			<label class="form-control gap-1">
				<span class="label-text font-medium">Guru</span>
				<select class="select select-bordered w-full" name="guru_id" disabled={data.userIsGuru}>
					<option value="">Semua guru</option>
					{#each data.guruList as guru (guru.id)}
						<option value={guru.id} selected={guru.id === data.selectedGuruId}>{guru.nama}</option>
					{/each}
				</select>
			</label>
			<label class="form-control gap-1">
				<span class="label-text font-medium">Kelas</span>
				<select class="select select-bordered w-full" name="kelas_id">
					<option value="">Semua kelas</option>
					{#each data.kelasList as kelas (kelas.id)}
						<option value={kelas.id} selected={kelas.id === data.selectedKelasId}>
							{kelas.nama}{kelas.fase ? ` - Fase ${kelas.fase}` : ''}
						</option>
					{/each}
				</select>
			</label>
			<div class="flex items-end gap-2">
				<button class="btn btn-primary flex-1 shadow-none" type="submit">Terapkan</button>
				<a class="btn btn-ghost flex-1 shadow-none" href={resolve('/jadwal/guru')}>Reset</a>
			</div>
		</form>

		<section class="print-card rounded-box border-base-300 bg-base-100 border p-4 shadow-sm">
			<div class="mb-4 text-center">
				<p class="text-sm font-semibold tracking-wide uppercase">{data.sekolahNama}</p>
				<h3 class="text-xl font-bold">Jadwal Mengajar Guru</h3>
				<p class="text-base-content/70 text-sm">
					{selectedGuru ? `${selectedGuru.nama} - ${selectedGuru.nip}` : 'Semua guru'}
				</p>
			</div>

			<div class="mb-4 grid gap-3 sm:grid-cols-3">
				<div class="rounded-box bg-base-200 p-3">
					<p class="text-base-content/60 text-xs font-semibold uppercase">Total Jam</p>
					<p class="text-2xl font-bold">{totalJam}</p>
				</div>
				<div class="rounded-box bg-base-200 p-3">
					<p class="text-base-content/60 text-xs font-semibold uppercase">Kelas Terlibat</p>
					<p class="text-2xl font-bold">{totalKelas}</p>
				</div>
				<div class="rounded-box bg-base-200 p-3">
					<p class="text-base-content/60 text-xs font-semibold uppercase">Mapel Terlibat</p>
					<p class="text-2xl font-bold">{totalMapel}</p>
				</div>
			</div>

			{#if data.jadwalList.length === 0}
				<div class="alert alert-info items-start">
					<Icon name="info" />
					<div>
						<div class="font-semibold">Belum ada jadwal yang cocok.</div>
						<p class="text-sm">
							Isi guru pada slot Jadwal Pelajaran terlebih dahulu, atau ubah filter guru/kelas.
						</p>
					</div>
				</div>
			{:else}
				<div class="space-y-4">
					{#each hariList as hari (hari)}
						{@const slots = slotsByHari(hari)}
						{#if slots.length}
							<div class="rounded-box border-base-300 overflow-x-auto border">
								<table class="table-sm table">
									<thead class="bg-base-200">
										<tr>
											<th colspan="6" class="text-base">{data.hariLabels[hari]}</th>
										</tr>
										<tr>
											<th>Jam</th>
											<th>Pukul</th>
											<th>Kelas</th>
											<th>Mapel/Kegiatan</th>
											<th>Guru</th>
											<th>Catatan</th>
										</tr>
									</thead>
									<tbody>
										{#each slots as slot (slot.id)}
											{@const detailMapel = slot.jadwalMapel?.nama || slot.mataPelajaran?.nama}
											<tr>
												<td class="font-semibold">{slot.jam?.jamKe ?? '-'}</td>
												<td
													>{slot.jam
														? `${slot.jam.pukulMulai} - ${slot.jam.pukulSelesai}`
														: '-'}</td
												>
												<td>{slot.kelas?.nama ?? '-'}</td>
												<td>
													<div class="font-semibold">{slot.label}</div>
													{#if detailMapel && slot.label !== detailMapel}
														<div class="text-base-content/60 text-xs">
															{detailMapel}
														</div>
													{/if}
												</td>
												<td>{slot.guru?.nama ?? '-'}</td>
												<td>{slot.catatan || '-'}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					{/each}
				</div>
			{/if}
		</section>

		{#if !selectedGuru && data.summaryList.length}
			<section class="no-print rounded-box border-base-300 bg-base-100 border p-4 shadow-sm">
				<h3 class="mb-3 font-semibold">Ringkasan Per Guru</h3>
				<div class="overflow-x-auto">
					<table class="table-sm table">
						<thead>
							<tr>
								<th>Guru</th>
								<th>NIP</th>
								<th>Total Jam</th>
								<th>Kelas</th>
							</tr>
						</thead>
						<tbody>
							{#each data.summaryList as guru (guru.id)}
								<tr>
									<td class="font-semibold">{guru.nama}</td>
									<td>{guru.nip}</td>
									<td>{guru.totalJam}</td>
									<td>{guru.totalKelas}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		{/if}
	{/if}
</div>
