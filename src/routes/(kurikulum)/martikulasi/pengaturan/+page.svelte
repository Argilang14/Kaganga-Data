<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';

	let { data } = $props();
	const today = new Date().toISOString().slice(0, 10);
	function changeYear(event: Event) {
		const id = (event.currentTarget as HTMLSelectElement).value;
		goto(`/martikulasi/pengaturan?tahun_ajaran_id=${id}`);
	}
	const refresh = () => invalidate('app:martikulasi-settings');
</script>

<svelte:head><title>Pengaturan Martikulasi</title></svelte:head>

<div class="space-y-4">
	<header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold">Pengaturan Martikulasi</h1>
			<p class="text-base-content/65 text-sm">Periode, tim, serta nomor SK dan STTM per tahun ajaran.</p>
		</div>
		<label class="form-control w-full sm:w-64">
			<span class="label-text mb-1">Tahun Ajaran</span>
			<select class="select select-bordered" value={data.selectedTahun?.id ?? ''} onchange={changeYear}>
				{#each data.tahunAjaranList as tahun}
					<option value={tahun.id}>{tahun.nama}</option>
				{/each}
			</select>
		</label>
	</header>

	{#if !data.selectedTahun}
		<div class="alert alert-warning">Tambahkan tahun ajaran terlebih dahulu.</div>
	{:else}
		<section class="border-base-300 rounded-lg border bg-base-100 p-4">
			<h2 class="mb-3 text-lg font-semibold">Periode dan Penomoran</h2>
			<FormEnhance action="?/simpan" onsuccess={refresh}>
				{#snippet children({ submitting })}
					<input type="hidden" name="tahunAjaranId" value={data.selectedTahun.id} />
					<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
						<label class="form-control"><span class="label-text mb-1">Periode Mulai</span><input class="input input-bordered" type="date" name="periodeMulai" value={data.settings?.periodeMulai ?? ''} /></label>
						<label class="form-control"><span class="label-text mb-1">Periode Selesai</span><input class="input input-bordered" type="date" name="periodeSelesai" value={data.settings?.periodeSelesai ?? ''} /></label>
						<label class="form-control"><span class="label-text mb-1">Nomor SK</span><input class="input input-bordered" name="nomorSk" value={data.settings?.nomorSk ?? ''} placeholder="Contoh: 421.3/001/SR/2026" /></label>
						<label class="form-control"><span class="label-text mb-1">Tanggal SK</span><input class="input input-bordered" type="date" name="tanggalSk" value={data.settings?.tanggalSk ?? ''} /></label>
						<label class="form-control"><span class="label-text mb-1">Tempat Penetapan</span><input class="input input-bordered" name="lokasiPenetapan" value={data.settings?.lokasiPenetapan ?? ''} /></label>
						<label class="form-control"><span class="label-text mb-1">Nomor Urut STTM Berikutnya</span><input class="input input-bordered" type="number" min="1" name="nomorUrutSttmBerikutnya" value={data.settings?.nomorUrutSttmBerikutnya ?? 1} /></label>
						<label class="form-control md:col-span-2 xl:col-span-3"><span class="label-text mb-1">Format Nomor STTM</span><input class="input input-bordered font-mono" name="formatNomorSttm" required value={data.settings?.formatNomorSttm ?? '{urut}/STTM/SR/{bulan_romawi}/{tahun}'} /><span class="text-base-content/60 mt-1 text-xs">Token: {'{urut}'}, {'{tahun}'}, {'{bulan_romawi}'}, {'{tahun_ajaran}'}, {'{nis}'}</span></label>
					</div>
					<div class="mt-4 flex justify-end"><button class="btn btn-primary" type="submit" disabled={submitting || !data.canManage}><Icon name="save" />Simpan Pengaturan</button></div>
				{/snippet}
			</FormEnhance>
		</section>

		<section class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
			<div class="border-base-300 overflow-hidden rounded-lg border bg-base-100">
				<div class="border-base-300 border-b p-4"><h2 class="text-lg font-semibold">Tim Martikulasi</h2></div>
				<div class="overflow-x-auto">
					<table class="table">
						<thead><tr><th>No</th><th>Nama</th><th>Jabatan Tim</th><th>Tugas</th><th class="w-16">Aksi</th></tr></thead>
						<tbody>
							{#each data.settings?.tim ?? [] as anggota, index}
								<tr><td>{index + 1}</td><td><strong>{anggota.namaSnapshot}</strong><br /><span class="text-base-content/60 text-xs">NIP {anggota.nipSnapshot || '-'}</span></td><td>{anggota.jabatanTim}</td><td class="max-w-sm whitespace-normal">{anggota.tugas || '-'}</td><td><FormEnhance action="?/hapusTim" onsuccess={refresh}>{#snippet children({ submitting })}<input type="hidden" name="id" value={anggota.id} /><button class="btn btn-ghost btn-sm text-error" type="submit" disabled={submitting || !data.canManage} title="Hapus anggota"><Icon name="close" /></button>{/snippet}</FormEnhance></td></tr>
							{:else}
								<tr><td colspan="5" class="py-8 text-center text-base-content/60">Belum ada anggota tim.</td></tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
			<div class="border-base-300 rounded-lg border bg-base-100 p-4">
				<h2 class="mb-3 text-lg font-semibold">Tambah Anggota</h2>
				{#if data.settings}
					<FormEnhance action="?/tambahTim" onsuccess={refresh}>
						{#snippet children({ submitting })}
							<input type="hidden" name="settingsId" value={data.settings?.id ?? ''} />
							<div class="space-y-3">
								<label class="form-control"><span class="label-text mb-1">Pegawai</span><select class="select select-bordered" name="pegawaiId" required><option value="">Pilih pegawai</option>{#each data.pegawaiList as pegawai}<option value={pegawai.id}>{pegawai.nama} - {pegawai.jabatan || pegawai.jenis}</option>{/each}</select></label>
								<label class="form-control"><span class="label-text mb-1">Jabatan dalam Tim</span><input class="input input-bordered" name="jabatanTim" required placeholder="Koordinator Akademik" /></label>
								<label class="form-control"><span class="label-text mb-1">Uraian Tugas</span><textarea class="textarea textarea-bordered" name="tugas" rows="3"></textarea></label>
								<label class="form-control"><span class="label-text mb-1">Urutan</span><input class="input input-bordered" type="number" name="urutan" value="0" /></label>
								<button class="btn btn-primary w-full" type="submit" disabled={submitting || !data.canManage}><Icon name="plus" />Tambah Anggota</button>
							</div>
						{/snippet}
					</FormEnhance>
				{:else}<div class="alert alert-info text-sm">Simpan pengaturan terlebih dahulu.</div>{/if}
			</div>
		</section>

		<section class="border-base-300 rounded-lg border bg-base-100 p-4">
			<h2 class="text-lg font-semibold">Penerbitan Nomor STTM</h2>
			<p class="text-base-content/65 mt-1 text-sm">Nomor hanya diberikan kepada hasil yang lengkap dan belum bernomor. Cetak ulang tidak membuat nomor baru.</p>
			<FormEnhance action="?/terbitkanSttm" onsuccess={refresh}>
				{#snippet children({ submitting })}
					<input type="hidden" name="tahunAjaranId" value={data.selectedTahun.id} />
					<div class="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
						<label class="form-control w-full sm:w-64"><span class="label-text mb-1">Tanggal STTM</span><input class="input input-bordered" type="date" name="tanggalSttm" value={today} required /></label>
						<button class="btn btn-primary" type="submit" disabled={submitting || !data.canManage || !data.hasilLengkapBelumBernomor}><Icon name="print" />Terbitkan {data.hasilLengkapBelumBernomor} Nomor</button>
					</div>
				{/snippet}
			</FormEnhance>
		</section>
	{/if}
</div>

<style>
	.form-control {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 0.25rem;
	}

	.form-control > :is(input, select, textarea) {
		width: 100%;
		min-width: 0;
	}
</style>
