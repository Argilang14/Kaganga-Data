<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- URL filter dibangun dari route aktif dan query dinamis */
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Icon from '$lib/components/icon.svelte';
	import ClearAttendance from '$lib/components/absensi/ClearAttendance.svelte';

	type StatusKey = 'hadir' | 'terlambat' | 'sakit' | 'izin' | 'alfa';
	type Row = {
		no: number;
		id: number;
		nama: string;
		nis: string;
		nisn: string;
		status: StatusKey | null;
		metode: 'qr' | 'manual' | null;
		waktuScan: string | null;
		catatan: string;
	};

	type PageData = {
		canEdit: boolean;
		canSyncRapor: boolean;
		tanggal: string;
		activeSemesterId: number | null;
		kelasId: number | null;
		kelasList: Array<{ id: number; nama: string; fase: string | null }>;
		rows: Row[];
		summary: Record<StatusKey, number>;
		statusLabels: Record<StatusKey, string>;
	};

	let { data }: { data: PageData } = $props();

	const statusOrder: StatusKey[] = ['hadir', 'terlambat', 'sakit', 'izin', 'alfa'];
	const totalSudahAbsen = $derived(
		statusOrder.reduce((sum, status) => sum + data.summary[status], 0)
	);
	const kelasAktifLabel = $derived.by(() => {
		const kelas = data.kelasList.find((item) => item.id === data.kelasId);
		if (!kelas) return 'Belum ada kelas aktif';
		return kelas.fase ? `${kelas.nama} - ${kelas.fase}` : kelas.nama;
	});

	function updateFilter(key: 'tanggal' | 'kelas_id', value: string) {
		const params = new URLSearchParams(page.url.search);
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
		return 'badge-ghost';
	}

	function statusTextColor(status: StatusKey | null) {
		if (status === 'hadir') return 'text-success';
		if (status === 'terlambat') return 'text-warning';
		if (status === 'sakit') return 'text-info';
		if (status === 'izin') return 'text-primary';
		if (status === 'alfa') return 'text-error';
		return 'text-base-content/60';
	}
</script>

<div class="space-y-4">
	<div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h2 class="text-2xl font-bold">Absensi Digital Harian</h2>
			<p class="text-base-content/70 text-sm">{kelasAktifLabel}</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<a class="btn btn-primary btn-sm shadow-none" href={resolve('/administrasi/absensi/scan')}>
				<Icon name="activity" />
				Scan QR
			</a>
			<a class="btn btn-soft btn-sm shadow-none" href={resolve('/administrasi/absensi/rekap')}>
				<Icon name="table" />
				Rekap
			</a>
			<a class="btn btn-soft btn-sm shadow-none" href={resolve('/administrasi/absensi/kartu-qr')}>
				<Icon name="copy" />
				Kartu QR
			</a>
		</div>
	</div>

	<div class="grid gap-3 lg:grid-cols-[1fr_auto]">
		<div class="card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm">
			<div class="grid gap-3 sm:grid-cols-2">
				<label class="form-control">
					<span class="label-text mb-1">Tanggal</span>
					<input
						class="input input-bordered"
						type="date"
						value={data.tanggal}
						onchange={(event) =>
							updateFilter('tanggal', (event.currentTarget as HTMLInputElement).value)}
					/>
				</label>
				<label class="form-control">
					<span class="label-text mb-1">Kelas</span>
					<select
						class="select select-bordered"
						value={data.kelasId ?? ''}
						onchange={(event) =>
							updateFilter('kelas_id', (event.currentTarget as HTMLSelectElement).value)}
					>
						{#each data.kelasList as kelas (kelas.id)}
							<option value={kelas.id}>{kelas.nama}{kelas.fase ? ` - ${kelas.fase}` : ''}</option>
						{/each}
					</select>
				</label>
			</div>
		</div>

		{#if data.canSyncRapor}<form
				method="POST"
				action="?/syncRapor"
				class="card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm"
			>
				<input type="hidden" name="semesterId" value={data.activeSemesterId ?? ''} />
				<input type="hidden" name="kelasId" value={data.kelasId ?? ''} />
				<button class="btn btn-accent shadow-none" type="submit" disabled={!data.activeSemesterId}>
					<Icon name="repeat" />
					Sinkronkan ke Kehadiran Rapor
				</button>
				<p class="text-base-content/60 mt-2 text-xs">
					Hanya sakit, izin, dan alfa yang dikirim ke rekap rapor lama.
				</p>
			</form>{/if}
	</div>

	<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
			<div class="badge badge-outline">{totalSudahAbsen} sudah absen</div>
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
									<div class="flex min-w-32 flex-col gap-1">
										<div
											class={`badge ${statusBadge(row.status)} w-fit gap-1 px-3 py-3 font-semibold`}
										>
											{row.status ? data.statusLabels[row.status] : 'Belum absen'}
										</div>
										<div class={`text-xs ${statusTextColor(row.status)}`}>
											{row.status ? 'Status tersimpan' : 'Menunggu input'}
										</div>
										{#if row.metode}
											<div class="text-base-content/60 text-xs">
												{row.metode === 'qr' ? 'QR Code' : 'Manual'}
												{row.waktuScan
													? ` · ${new Date(row.waktuScan).toLocaleTimeString('id-ID')}`
													: ''}
											</div>
										{/if}
									</div>
								</td>
								<td class="min-w-52">
									<input
										class="input input-sm input-bordered w-full"
										name="catatan"
										form={`manual-${row.id}`}
										value={row.catatan}
										placeholder="Catatan opsional"
										disabled={!data.canEdit}
									/>
								</td>
								<td class="min-w-56">
									<form id={`manual-${row.id}`} method="POST" action="?/updateManual">
										<input type="hidden" name="tanggal" value={data.tanggal} />
										<input type="hidden" name="kelasId" value={data.kelasId ?? ''} />
										<input type="hidden" name="semesterId" value={data.activeSemesterId ?? ''} />
										<input type="hidden" name="muridId" value={row.id} />
										<div class="join w-full">
											<select
												class="select select-sm select-bordered join-item flex-1"
												name="status"
												disabled={!data.canEdit}
												value={row.status ?? ''}
												aria-label={`Status absensi ${row.nama}`}
												required
											>
												<option value="" disabled>Pilih status</option>
												{#each statusOrder as status (status)}
													<option value={status}>{data.statusLabels[status]}</option>
												{/each}
											</select>
										</div>
									</form>
								</td>
								<td>
									<div class="flex justify-end gap-2">
										<button
											class="btn btn-primary btn-square btn-sm shadow-none"
											type="submit"
											form={`manual-${row.id}`}
											title="Simpan absensi"
											aria-label={`Simpan absensi ${row.nama}`}
											disabled={!data.canEdit}
										>
											<Icon name="save" />
										</button>
										<ClearAttendance
											nama={row.nama}
											disabled={!row.status || !data.canEdit}
											fields={{
												tanggal: data.tanggal,
												kelasId: data.kelasId ?? '',
												semesterId: data.activeSemesterId ?? '',
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
