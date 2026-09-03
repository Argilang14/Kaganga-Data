<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- local filters and PDF endpoint */
	import Icon from '$lib/components/icon.svelte';
	import { statusLabel, type PresensiPegawaiStatus } from '$lib/presensi-pegawai-utils';
	import type { PresensiPegawaiRow } from '$lib/server/presensi-pegawai';

	let { data, form } = $props();
	const statuses: PresensiPegawaiStatus[] = ['hadir', 'izin', 'sakit', 'dinas_luar', 'cuti'];
	const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
	type MonthlyRow = {
		id: number;
		nama: string;
		nip: string;
		jenis: string;
		statuses: Array<PresensiPegawaiStatus | null>;
		counts: Record<PresensiPegawaiStatus | 'belum', number>;
	};
	const dailyRows = $derived(data.mode === 'harian' ? data.rows as PresensiPegawaiRow[] : []);
	const monthlyRows = $derived(data.mode === 'bulanan' ? data.rows as MonthlyRow[] : []);
	const dailyDate = $derived(data.mode === 'harian' ? (data.tanggal ?? '') : '');
	const monthlyDates = $derived(data.mode === 'bulanan' ? (data.dates ?? []) : []);
	const monthlyWorkdays = $derived(data.mode === 'bulanan' ? (data.workdays ?? []) : []);

	function queryUrl(overrides: Record<string, string | number | null>) {
		const params = new URLSearchParams();
		params.set('mode', data.mode);
		if (data.q) params.set('q', data.q);
		if (data.mode === 'harian') params.set('tanggal', dailyDate);
		else {
			params.set('bulan', String(data.bulan));
			params.set('tahun', String(data.tahun));
		}
		for (const [key, value] of Object.entries(overrides)) {
			if (value === null || value === '') params.delete(key);
			else params.set(key, String(value));
		}
		return `/presensi-pegawai?${params}`;
	}

	function pdfUrl() {
		const params = new URLSearchParams();
		if (data.mode === 'harian') params.set('tanggal', dailyDate);
		else {
			params.set('bulan', String(data.bulan));
			params.set('tahun', String(data.tahun));
		}
		if (data.q) params.set('q', data.q);
		return `/api/pdf/presensi-pegawai?${params}`;
	}

	function dayNumber(date: string) {
		return Number(date.slice(-2));
	}

	function shortStatus(status: PresensiPegawaiStatus | null) {
		return status ? ({ hadir: 'H', izin: 'I', sakit: 'S', dinas_luar: 'DL', cuti: 'C' } as const)[status] : '-';
	}

	function statusClass(status: PresensiPegawaiStatus | null) {
		return status === 'hadir' ? 'bg-success/15 text-success' : status === 'izin' ? 'bg-info/15 text-info' : status === 'sakit' ? 'bg-warning/15 text-warning' : status === 'dinas_luar' ? 'bg-primary/15 text-primary' : status === 'cuti' ? 'bg-secondary/15 text-secondary' : 'opacity-45';
	}
</script>

<div class="space-y-4">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h1 class="text-2xl font-bold">Presensi Pegawai</h1>
			<p class="text-base-content/65 mt-1 text-sm">Kehadiran guru dan pegawai berdasarkan sekolah aktif.</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<div class="join">
				<a class:btn-active={data.mode === 'harian'} class="btn join-item btn-sm" href={queryUrl({ mode: 'harian', page: null })}>Harian</a>
				<a class:btn-active={data.mode === 'bulanan'} class="btn join-item btn-sm" href={queryUrl({ mode: 'bulanan', page: null })}>Bulanan</a>
			</div>
			<a class="btn btn-primary btn-sm" href={pdfUrl()} target="_blank"><Icon name="print" /> Cetak PDF</a>
		</div>
	</header>

	{#if form?.fail}<div class="alert alert-error py-2"><Icon name="error" /><span>{form.fail}</span></div>{/if}
	{#if form?.message}<div class="alert alert-success py-2"><Icon name="success" /><span>{form.message}</span></div>{/if}
	{#if data.disabled}<div class="alert alert-warning"><Icon name="warning" /><span>Presensi pegawai dinonaktifkan pada Pengaturan Presensi tahun ajaran aktif.</span></div>{/if}

	<form method="GET" class="border-base-300 bg-base-100 grid gap-3 rounded-lg border p-4 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_180px_180px_auto] xl:items-end">
		<input type="hidden" name="mode" value={data.mode} />
		<label class="form-control"><span class="label-text mb-1">Cari Pegawai</span><label class="input input-bordered flex items-center gap-2"><Icon name="search" /><input class="grow" name="q" value={data.q} placeholder="Nama atau NIP" /></label></label>
		{#if data.mode === 'harian'}
			<label class="form-control"><span class="label-text mb-1">Tanggal</span><input class="input input-bordered" type="date" name="tanggal" value={data.tanggal} /></label>
		{:else}
			<label class="form-control"><span class="label-text mb-1">Bulan</span><select class="select select-bordered" name="bulan" value={data.bulan}>{#each monthNames as month, index}<option value={index + 1}>{month}</option>{/each}</select></label>
			<label class="form-control"><span class="label-text mb-1">Tahun</span><input class="input input-bordered" type="number" name="tahun" min="2000" max="2200" value={data.tahun} /></label>
		{/if}
		<button class="btn btn-primary" type="submit"><Icon name="search" /> Tampilkan</button>
	</form>

	{#if data.mode === 'harian'}
		{#if !data.isWorkday}<div class="alert alert-info py-2"><Icon name="info" /><span>Tanggal ini termasuk hari libur. Admin tetap dapat mencatat izin, sakit, dinas luar, atau cuti bila diperlukan.</span></div>{/if}
		{#if dailyRows.length}
			<form method="POST" action="?/bulkSave" class="border-base-300 bg-base-100 flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-end">
				<input type="hidden" name="tanggal" value={dailyDate} />
				<input type="hidden" name="pegawaiIds" value={dailyRows.map((row) => row.pegawaiId).join(',')} />
				<label class="form-control flex-1"><span class="label-text mb-1">Isi seluruh pegawai yang terlihat</span><select class="select select-bordered" name="status">{#each statuses as status}<option value={status}>{statusLabel(status)}</option>{/each}</select></label>
				<button class="btn btn-soft" type="submit" disabled={data.disabled} onclick={(event) => { if (!confirm(`Isi ${dailyRows.length} pegawai sekaligus?`)) event.preventDefault(); }}><Icon name="save" /> Isi Sekaligus</button>
			</form>
		{/if}

		<div class="border-base-300 bg-base-100 overflow-x-auto rounded-lg border">
			<table class="table table-zebra">
				<thead><tr><th>Nama Pegawai</th><th>Jenis</th><th>Status</th><th>Jam Masuk</th><th>Jam Pulang</th><th>Keterangan</th><th class="text-right">Aksi</th></tr></thead>
				<tbody>
					{#each dailyRows as row}
						<tr>
							<td><div class="font-semibold">{row.nama}</div><div class="text-xs opacity-60">{row.nip || '-'}</div></td>
							<td class="capitalize">{row.jenis.replaceAll('_', ' ')}</td>
							<td colspan="5" class="p-2">
								<form method="POST" action="?/save" class="grid min-w-[760px] grid-cols-[145px_110px_110px_minmax(190px,1fr)_auto] items-center gap-2">
									<input type="hidden" name="pegawaiId" value={row.pegawaiId} />
									<input type="hidden" name="tanggal" value={dailyDate} />
									<select class="select select-bordered select-sm" name="status" value={row.status ?? 'hadir'} disabled={data.disabled}>{#each statuses as status}<option value={status}>{statusLabel(status)}</option>{/each}</select>
									<input class="input input-bordered input-sm" type="time" name="waktuMasuk" value={row.waktuMasuk ?? ''} disabled={data.disabled} />
									<input class="input input-bordered input-sm" type="time" name="waktuPulang" value={row.waktuPulang ?? ''} disabled={data.disabled} />
									<input class="input input-bordered input-sm" name="keterangan" maxlength="500" value={row.keterangan ?? ''} placeholder={row.inferredFromDinasLuar ? 'Terhubung dari Dinas Luar' : 'Opsional'} disabled={data.disabled} />
									<div class="flex justify-end gap-1"><button class="btn btn-primary btn-sm" type="submit" disabled={data.disabled}><Icon name="save" /></button>{#if row.status && !row.inferredFromDinasLuar}<button class="btn btn-soft btn-error btn-sm" type="submit" formaction="?/delete" title="Kosongkan" disabled={data.disabled}><Icon name="del" /></button>{/if}</div>
								</form>
							</td>
						</tr>
					{:else}<tr><td colspan="7" class="py-12 text-center opacity-60">Tidak ada pegawai aktif.</td></tr>{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<div class="border-base-300 bg-base-100 overflow-x-auto rounded-lg border">
			<table class="table table-xs table-pin-rows table-pin-cols">
				<thead><tr><th class="min-w-48">Pegawai</th>{#each monthlyDates as date}<th class:opacity-40={!monthlyWorkdays.includes(date)} class="w-9 text-center">{dayNumber(date)}</th>{/each}<th>H</th><th>I</th><th>S</th><th>DL</th><th>C</th><th>-</th></tr></thead>
				<tbody>{#each monthlyRows as row}<tr><th><div class="font-semibold">{row.nama}</div><div class="text-xs font-normal opacity-55">{row.nip || '-'}</div></th>{#each row.statuses as status, index}<td class:opacity-25={!monthlyWorkdays.includes(monthlyDates[index])} class="text-center"><span class={`inline-flex min-h-6 min-w-6 items-center justify-center rounded px-1 text-[10px] font-bold ${statusClass(status)}`}>{shortStatus(status)}</span></td>{/each}<td>{row.counts.hadir}</td><td>{row.counts.izin}</td><td>{row.counts.sakit}</td><td>{row.counts.dinas_luar}</td><td>{row.counts.cuti}</td><td>{row.counts.belum}</td></tr>{:else}<tr><td colspan={monthlyDates.length + 7} class="py-12 text-center opacity-60">Tidak ada pegawai aktif.</td></tr>{/each}</tbody>
			</table>
		</div>
		<div class="flex flex-wrap gap-2 text-xs"><span class="badge badge-success badge-soft">H Hadir</span><span class="badge badge-info badge-soft">I Izin</span><span class="badge badge-warning badge-soft">S Sakit</span><span class="badge badge-primary badge-soft">DL Dinas Luar</span><span class="badge badge-secondary badge-soft">C Cuti</span></div>
	{/if}

	<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p class="text-sm opacity-65">{data.page.total} pegawai ditemukan</p>{#if data.page.totalPages > 1}<div class="join">{#each Array.from({ length: data.page.totalPages }, (_, index) => index + 1) as page}<a class:btn-active={page === data.page.currentPage} class="btn join-item btn-sm" href={queryUrl({ page })}>{page}</a>{/each}</div>{/if}</div>
</div>
