<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { canAttendance } from '$lib/attendance-access';
	import { attendanceReportSearch } from '$lib/attendance-report-navigation';
	import {
		attendanceKegiatanSearch,
		attendanceKegiatanAction
	} from '$lib/attendance-kegiatan-filters';
	import Icon from '$lib/components/icon.svelte';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import ClearAttendance from '$lib/components/absensi/ClearAttendance.svelte';
	import AttendanceSummaryDialog from '$lib/components/absensi/AttendanceSummaryDialog.svelte';

	type StatusKey = 'hadir' | 'terlambat' | 'sakit' | 'izin' | 'alfa' | 'pulang';
	type Kegiatan = {
		id: number;
		nama: string;
		kode: string;
		kategori: 'sekolah' | 'asrama' | 'makan' | 'sholat';
		jamMulai: string | null;
		batasTerlambat: string | null;
		jamSelesai: string | null;
		autoAlfa: boolean;
		masukRapor: boolean;
		aksesEdit: 'sekolah' | 'asrama' | 'semua';
	};
	type Row = {
		no: number;
		id: number;
		nama: string;
		nis: string;
		nisn: string;
		status: StatusKey | null;
		metode: 'qr' | 'manual' | 'auto' | null;
		waktuScan: string | null;
		catatan: string;
	};
	type PageData = {
		tanggal: string;
		activeSemesterId: number | null;
		kelasId: number | null;
		kelasList: Array<{ id: number; nama: string; fase: string | null }>;
		kegiatanId: number | null;
		kegiatanList: Kegiatan[];
		selectedKegiatan: Kegiatan | null;
		canEditSelected: boolean;
		rows: Row[];
		summary: Record<StatusKey, number>;
		autoAlfaInserted: number;
		statusLabels: Record<StatusKey, string>;
	};

	let { data }: { data: PageData } = $props();

	const statusOrder: StatusKey[] = ['hadir', 'terlambat', 'sakit', 'izin', 'alfa', 'pulang'];
	const totalSudahAbsen = $derived(
		statusOrder.reduce((sum, status) => sum + data.summary[status], 0)
	);
	const kelasAktifLabel = $derived.by(() => {
		const kelas = data.kelasList.find((item) => item.id === data.kelasId);
		if (!kelas) return 'Belum ada kelas aktif';
		return kelas.fase ? `${kelas.nama} - ${kelas.fase}` : kelas.nama;
	});

	function updateFilter(key: 'tanggal' | 'kelas_id' | 'kegiatan_id', value: string) {
		const params = attendanceKegiatanSearch(data);
		if (value) params.set(key, value);
		else params.delete(key);
		void goto(`${page.url.pathname}?${params.toString()}`, {
			replaceState: true,
			keepFocus: true
		});
	}

	function statusBadge(status: StatusKey | null) {
		if (status === 'hadir') return 'badge-success';
		if (status === 'terlambat') return 'badge-warning';
		if (status === 'sakit') return 'badge-info';
		if (status === 'izin') return 'badge-primary';
		if (status === 'alfa') return 'badge-error';
		if (status === 'pulang') return 'badge-secondary';
		return 'badge-ghost';
	}

	function kategoriBadge(kategori: Kegiatan['kategori'] | undefined) {
		if (kategori === 'sekolah') return 'badge-primary';
		if (kategori === 'asrama') return 'badge-secondary';
		if (kategori === 'makan') return 'badge-accent';
		if (kategori === 'sholat') return 'badge-info';
		return 'badge-ghost';
	}
</script>

<div class="space-y-4">
	<div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h2 class="text-2xl font-bold">Catat Absensi</h2>
			<p class="text-base-content/70 text-sm">{kelasAktifLabel}</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<AttendanceSummaryDialog
				tanggal={data.tanggal}
				kegiatanId={data.kegiatanId}
				kelasId={data.kelasId}
			/>
			<a
				class="btn btn-soft btn-sm shadow-none"
				href={resolve('/administrasi/absensi/monitoring') +
					attendanceReportSearch('monitoring', { date: data.tanggal, classId: data.kelasId })}
			>
				<Icon name="table" />
				Monitoring &amp; Rekap Absensi
			</a>
			{#if canAttendance(page.data.user, 'pengaturan')}
				<a
					class="btn btn-soft btn-sm shadow-none"
					href={resolve('/administrasi/absensi/kegiatan/pengaturan')}
				>
					<Icon name="gear" />
					Pengaturan
				</a>
			{/if}
		</div>
	</div>

	<div class="card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm">
		<div class="grid gap-3 md:grid-cols-3">
			<label class="form-control gap-1">
				<span class="label-text font-medium">Tanggal</span>
				<input
					class="input input-bordered w-full"
					type="date"
					aria-label="Tanggal absensi kegiatan"
					value={data.tanggal}
					onchange={(event) =>
						updateFilter('tanggal', (event.currentTarget as HTMLInputElement).value)}
				/>
			</label>
			<label class="form-control gap-1">
				<span class="label-text font-medium">Kelas</span>
				<select
					class="select select-bordered w-full"
					aria-label="Kelas absensi kegiatan"
					value={data.kelasId ?? ''}
					onchange={(event) =>
						updateFilter('kelas_id', (event.currentTarget as HTMLSelectElement).value)}
				>
					{#each data.kelasList as kelas (kelas.id)}
						<option value={kelas.id}>{kelas.nama}{kelas.fase ? ` - ${kelas.fase}` : ''}</option>
					{/each}
				</select>
			</label>
			<label class="form-control gap-1">
				<span class="label-text font-medium">Kegiatan</span>
				<select
					class="select select-bordered w-full"
					aria-label="Kegiatan absensi"
					value={data.kegiatanId ?? ''}
					onchange={(event) =>
						updateFilter('kegiatan_id', (event.currentTarget as HTMLSelectElement).value)}
				>
					{#each data.kegiatanList as kegiatan (kegiatan.id)}
						<option value={kegiatan.id}>{kegiatan.nama}</option>
					{/each}
				</select>
			</label>
		</div>

		{#if data.selectedKegiatan}
			<div class="mt-4 flex flex-wrap items-center gap-2 text-sm">
				<div class={`badge ${kategoriBadge(data.selectedKegiatan.kategori)} badge-outline`}>
					{data.selectedKegiatan.kategori}
				</div>
				{#if data.selectedKegiatan.jamMulai}
					<div class="badge badge-ghost">Mulai {data.selectedKegiatan.jamMulai}</div>
				{/if}
				{#if data.selectedKegiatan.batasTerlambat}
					<div class="badge badge-warning badge-outline">
						Terlambat setelah {data.selectedKegiatan.batasTerlambat}
					</div>
				{/if}
				{#if data.selectedKegiatan.masukRapor}
					<div class="badge badge-success badge-outline">Masuk rekap rapor</div>
				{/if}
				{#if data.selectedKegiatan.autoAlfa}
					<div class="badge badge-error badge-outline">
						Auto alfa{data.selectedKegiatan.jamSelesai
							? ` setelah ${data.selectedKegiatan.jamSelesai}`
							: ''}
					</div>
				{/if}
				{#if !data.canEditSelected}
					<div class="badge badge-error badge-outline">Mode lihat saja</div>
				{/if}
			</div>
		{/if}
	</div>

	<div class="card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm">
		<div class="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<h3 class="font-semibold">Input Manual Massal</h3>
				<p class="text-base-content/60 text-sm">
					Gunakan saat scan QR bermasalah atau absensi perlu diisi cepat untuk satu kelas.
				</p>
			</div>
			<span class="badge badge-soft">{data.rows.length} siswa</span>
		</div>
		<FormEnhance
			action={attendanceKegiatanAction('bulkUpdateManual', data)}
			class="grid gap-3 lg:grid-cols-[1fr_1fr_auto]"
		>
			<input type="hidden" name="tanggal" value={data.tanggal} />
			<input type="hidden" name="kelasId" value={data.kelasId ?? ''} />
			<input type="hidden" name="semesterId" value={data.activeSemesterId ?? ''} />
			<input type="hidden" name="kegiatanId" value={data.kegiatanId ?? ''} />
			<label class="form-control gap-1">
				<span class="label-text mb-1">Status Massal</span>
				<select
					class="select select-bordered w-full"
					name="status"
					required
					disabled={!data.canEditSelected || !data.rows.length}
				>
					<option value="" disabled selected>Pilih status</option>
					{#each statusOrder as status (status)}
						<option value={status}>{data.statusLabels[status]}</option>
					{/each}
				</select>
			</label>
			<label class="form-control gap-1">
				<span class="label-text mb-1">Catatan</span>
				<input
					class="input input-bordered w-full"
					name="catatan"
					placeholder="Opsional, misalnya scan QR error"
					disabled={!data.canEditSelected || !data.rows.length}
				/>
			</label>
			<div class="flex flex-col justify-end gap-2">
				<label class="label cursor-pointer justify-start gap-2 py-0">
					<input
						class="checkbox checkbox-sm"
						type="checkbox"
						name="onlyEmpty"
						checked
						disabled={!data.canEditSelected || !data.rows.length}
					/>
					<span class="label-text">Hanya yang belum absen</span>
				</label>
				<button
					class="btn btn-primary shadow-none"
					type="submit"
					disabled={!data.canEditSelected || !data.rows.length}
				>
					<Icon name="save" />
					Simpan Massal
				</button>
			</div>
		</FormEnhance>
	</div>

	{#if data.autoAlfaInserted}
		<div class="alert alert-warning">
			<Icon name="warning" />
			<span>
				Sistem mengisi {data.autoAlfaInserted} data alfa otomatis karena kegiatan sudah melewati jam selesai.
			</span>
		</div>
	{/if}

	<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
		{#each statusOrder as status (status)}
			<div class="stats bg-base-100 border-base-200 rounded-lg border shadow-sm">
				<div class="stat p-4">
					<div class="stat-title">{data.statusLabels[status]}</div>
					<div class="stat-value text-2xl">{data.summary[status]}</div>
				</div>
			</div>
		{/each}
	</div>

	<div class="card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm">
		<div class="mb-3 flex items-center justify-between gap-2">
			<h3 class="font-semibold">Daftar Siswa</h3>
			<div class="badge badge-outline">{totalSudahAbsen} sudah tercatat</div>
		</div>

		{#if !data.activeSemesterId}
			<div class="alert alert-warning">
				<Icon name="alert" />
				<span>Semester aktif belum diatur. Atur melalui menu Data Rapor.</span>
			</div>
		{:else if !data.kelasId}
			<div class="alert alert-warning">
				<Icon name="alert" />
				<span>Belum ada kelas untuk semester aktif.</span>
			</div>
		{:else if !data.kegiatanId}
			<div class="alert alert-warning">
				<Icon name="alert" />
				<span>Belum ada kegiatan absensi aktif.</span>
			</div>
		{:else if !data.rows.length}
			<div class="alert alert-info">
				<Icon name="info" />
				<span>Belum ada siswa pada kelas ini.</span>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="table">
					<thead>
						<tr>
							<th>No</th>
							<th>Nama</th>
							<th>Status</th>
							<th>Catatan</th>
							<th>Input Manual</th>
							<th class="text-right">Aksi</th>
						</tr>
					</thead>
					<tbody>
						{#each data.rows as row (row.id)}
							<tr>
								<td>{row.no}</td>
								<td>
									<div class="font-medium">{row.nama}</div>
									<div class="text-base-content/60 text-xs">NIS {row.nis} · NISN {row.nisn}</div>
								</td>
								<td>
									<div
										class={`badge ${statusBadge(row.status)} w-fit gap-1 px-3 py-3 font-semibold`}
									>
										{row.status ? data.statusLabels[row.status] : 'Belum absen'}
									</div>
									{#if row.metode}
										<div class="text-base-content/60 mt-1 text-xs">
											{row.metode === 'qr'
												? 'QR Code'
												: row.metode === 'auto'
													? 'Otomatis'
													: 'Manual'}
											{row.waktuScan
												? ` · ${new Date(row.waktuScan).toLocaleTimeString('id-ID')}`
												: ''}
										</div>
									{/if}
								</td>
								<td class="min-w-52">
									<input
										class="input input-sm input-bordered w-full"
										name="catatan"
										form={`manual-kegiatan-${row.id}`}
										value={row.catatan}
										placeholder="Catatan opsional"
										disabled={!data.canEditSelected}
									/>
								</td>
								<td class="min-w-56">
									<FormEnhance
										id={`manual-kegiatan-${row.id}`}
										action={attendanceKegiatanAction('updateManual', data)}
									>
										<input type="hidden" name="tanggal" value={data.tanggal} />
										<input type="hidden" name="kelasId" value={data.kelasId ?? ''} />
										<input type="hidden" name="semesterId" value={data.activeSemesterId ?? ''} />
										<input type="hidden" name="kegiatanId" value={data.kegiatanId ?? ''} />
										<input type="hidden" name="muridId" value={row.id} />
										<select
											class="select select-sm select-bordered w-full"
											name="status"
											value={row.status ?? ''}
											aria-label={`Status absensi kegiatan ${row.nama}`}
											required
											disabled={!data.canEditSelected}
										>
											<option value="" disabled>Pilih status</option>
											{#each statusOrder as status (status)}
												<option value={status}>{data.statusLabels[status]}</option>
											{/each}
										</select>
									</FormEnhance>
								</td>
								<td>
									<div class="flex justify-end gap-2">
										<button
											class="btn btn-primary btn-square btn-sm shadow-none"
											type="submit"
											form={`manual-kegiatan-${row.id}`}
											title="Simpan absensi kegiatan"
											aria-label={`Simpan absensi kegiatan ${row.nama}`}
											disabled={!data.canEditSelected}
										>
											<Icon name="save" />
										</button>
										<ClearAttendance
											action={attendanceKegiatanAction('clearStatus', data)}
											nama={row.nama}
											disabled={!row.status || !data.canEditSelected}
											fields={{
												tanggal: data.tanggal,
												kelasId: data.kelasId ?? '',
												semesterId: data.activeSemesterId ?? '',
												kegiatanId: data.kegiatanId ?? '',
												muridId: row.id
											}}
										/>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>
