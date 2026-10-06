<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- local filters and PDF endpoint */
	import Icon from '$lib/components/icon.svelte';
	import { enhance } from '$app/forms';
	import { statusLabel, pegawaiJenisLabels, pegawaiJenisLabel, type PresensiPegawaiStatus } from '$lib/presensi-pegawai-utils';
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
		if (data.jenis) params.set('jenis', data.jenis);
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
		if (data.jenis) params.set('jenis', data.jenis);
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

<div class="card bg-base-100 space-y-5 rounded-lg border border-none p-4 shadow-md">
	<header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<h1 class="text-xl font-bold">Formulir Dan Tabel Presensi Pegawai</h1>
			<p class="text-base-content/65 text-sm">Kelola kehadiran pegawai berdasarkan tanggal dan jenis pegawai.</p>
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

	<form method="GET" class="bg-base-200/35 grid items-end gap-3 rounded-md p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
		<input type="hidden" name="mode" value={data.mode} />
		<label class="flex min-w-0 flex-col gap-2 xl:col-span-2"><span>Cari Pegawai</span><input class="input w-full" name="q" value={data.q} placeholder="Nama atau NIP" /></label>
		<label class="flex min-w-0 flex-col gap-2"><span>Jenis Pegawai</span><select class="select w-full" name="jenis" value={data.jenis}><option value="">Semua jenis</option>{#each Object.entries(pegawaiJenisLabels) as [value, label]}<option {value}>{label}</option>{/each}</select></label>
		{#if data.mode === 'harian'}
			<label class="flex min-w-0 flex-col gap-2"><span>Tanggal</span><input class="input w-full" type="date" name="tanggal" value={data.tanggal} /></label>
		{:else}
			<div class="grid grid-cols-2 gap-2"><label class="flex min-w-0 flex-col gap-2"><span>Bulan</span><select class="select w-full" name="bulan" value={data.bulan}>{#each monthNames as month, index}<option value={index + 1}>{month}</option>{/each}</select></label>
			<label class="flex min-w-0 flex-col gap-2"><span>Tahun</span><input class="input w-full" type="number" name="tahun" min="2000" max="2200" value={data.tahun} /></label></div>
		{/if}
		<button class="btn btn-primary" type="submit"><Icon name="search" /> Tampilkan</button>
	</form>

	{#if data.mode === 'harian'}
		{#if !data.isWorkday}<div class="alert alert-info py-2"><Icon name="info" /><span>Tanggal ini termasuk hari libur. Admin tetap dapat mencatat izin, sakit, dinas luar, atau cuti bila diperlukan.</span></div>{/if}
		{#if dailyRows.length}
			<form method="POST" action="?/bulkSave" use:enhance class="bg-base-200/30 flex flex-col gap-3 rounded-md p-3 sm:flex-row sm:items-end">
				<input type="hidden" name="tanggal" value={dailyDate} />
				<input type="hidden" name="pegawaiIds" value={dailyRows.map((row) => row.pegawaiId).join(',')} />
				<label class="flex flex-col gap-2 sm:w-64"><span>Status Massal</span><select class="select w-full" name="status">{#each statuses as status}<option value={status}>{statusLabel(status)}</option>{/each}</select></label>
				<button class="btn btn-soft" type="submit" disabled={data.disabled} onclick={(event) => { if (!confirm(`Isi ${dailyRows.length} pegawai sekaligus?`)) event.preventDefault(); }}><Icon name="save" /> Isi Sekaligus</button>
			</form>
		{/if}

		<div class="border-base-200 overflow-x-auto rounded-md border">
			<table class="table w-full min-w-[1040px]">
				<thead class="bg-base-200/60"><tr><th>No</th><th class="min-w-48">Nama Pegawai</th><th>Jenis Pegawai</th><th class="w-40">Status</th><th class="w-32">Jam Masuk</th><th class="w-32">Jam Pulang</th><th class="min-w-44">Keterangan</th><th class="text-right">Aksi</th></tr></thead>
				<tbody>
					{#each dailyRows as row, index (row.pegawaiId)}
						<tr>
							<td>{(data.page.currentPage - 1) * 25 + index + 1}</td>
							<td><div class="font-semibold">{row.nama}</div><div class="text-xs opacity-60">{row.nip || '-'}</div></td>
							<td class="whitespace-nowrap">{pegawaiJenisLabel(row.jenis)}</td>
							<td>
								<form id={`presensi-${row.pegawaiId}`} method="POST" action="?/save" use:enhance>
									<input type="hidden" name="pegawaiId" value={row.pegawaiId} />
									<input type="hidden" name="tanggal" value={dailyDate} />
									<select class="select select-sm w-full" name="status" value={row.status ?? 'hadir'} aria-label={`Status ${row.nama}`} disabled={data.disabled}>{#each statuses as status}<option value={status}>{statusLabel(status)}</option>{/each}</select>
								</form>
								{#if !row.status}<span class="text-xs text-base-content/60">Belum diisi</span>{/if}
							</td>
							<td><input form={`presensi-${row.pegawaiId}`} class="input input-sm w-full" type="time" name="waktuMasuk" aria-label={`Jam masuk ${row.nama}`} value={row.waktuMasuk ?? ''} disabled={data.disabled} /></td>
							<td><input form={`presensi-${row.pegawaiId}`} class="input input-sm w-full" type="time" name="waktuPulang" aria-label={`Jam pulang ${row.nama}`} value={row.waktuPulang ?? ''} disabled={data.disabled} /></td>
							<td><input form={`presensi-${row.pegawaiId}`} class="input input-sm w-full" name="keterangan" aria-label={`Keterangan ${row.nama}`} maxlength="500" value={row.keterangan ?? ''} placeholder={row.inferredFromDinasLuar ? 'Terhubung dari Dinas Luar' : 'Opsional'} disabled={data.disabled} /></td>
							<td><div class="flex justify-end gap-1"><button form={`presensi-${row.pegawaiId}`} class="btn btn-soft btn-sm" type="submit" title="Simpan presensi" aria-label={`Simpan presensi ${row.nama}`} disabled={data.disabled}><Icon name="save" /></button>{#if row.status && !row.inferredFromDinasLuar}<button form={`presensi-${row.pegawaiId}`} class="btn btn-soft btn-error btn-sm" type="submit" formaction="?/delete" title="Kosongkan presensi" aria-label={`Kosongkan presensi ${row.nama}`} disabled={data.disabled}><Icon name="del" /></button>{/if}</div></td>
						</tr>
					{:else}<tr><td colspan="8" class="py-12 text-center opacity-60">Tidak ada pegawai aktif sesuai filter.</td></tr>{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<div class="border-base-200 overflow-x-auto rounded-md border">
			<table class="table table-xs table-pin-rows table-pin-cols">
				<thead class="bg-base-200/60"><tr><th class="min-w-48">Pegawai</th><td class="whitespace-nowrap">Jenis Pegawai</td>{#each monthlyDates as date}<td class:opacity-40={!monthlyWorkdays.includes(date)} class="min-w-9 text-center">{dayNumber(date)}</td>{/each}<td>H</td><td>I</td><td>S</td><td>DL</td><td>C</td><td>-</td></tr></thead>
				<tbody>{#each monthlyRows as row (row.id)}<tr><th><div class="font-semibold">{row.nama}</div><div class="text-xs font-normal opacity-55">{row.nip || '-'}</div></th><td class="whitespace-nowrap">{pegawaiJenisLabel(row.jenis)}</td>{#each row.statuses as status, index}<td class:opacity-25={!monthlyWorkdays.includes(monthlyDates[index])} class="text-center"><span class={`inline-flex min-h-6 min-w-6 items-center justify-center rounded px-1 text-[10px] font-bold ${statusClass(status)}`}>{shortStatus(status)}</span></td>{/each}<td>{row.counts.hadir}</td><td>{row.counts.izin}</td><td>{row.counts.sakit}</td><td>{row.counts.dinas_luar}</td><td>{row.counts.cuti}</td><td>{row.counts.belum}</td></tr>{:else}<tr><td colspan={monthlyDates.length + 8} class="py-12 text-center opacity-60">Tidak ada pegawai aktif sesuai filter.</td></tr>{/each}</tbody>
			</table>
		</div>
		<div class="flex flex-wrap gap-2 text-xs"><span class="badge badge-success badge-soft">H Hadir</span><span class="badge badge-info badge-soft">I Izin</span><span class="badge badge-warning badge-soft">S Sakit</span><span class="badge badge-primary badge-soft">DL Dinas Luar</span><span class="badge badge-secondary badge-soft">C Cuti</span></div>
	{/if}

	<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p class="text-sm opacity-65">{data.page.total} pegawai ditemukan</p>{#if data.page.totalPages > 1}<div class="join">{#each Array.from({ length: data.page.totalPages }, (_, index) => index + 1) as page}<a class:btn-active={page === data.page.currentPage} class="btn join-item btn-sm" href={queryUrl({ page })}>{page}</a>{/each}</div>{/if}</div>
</div>
