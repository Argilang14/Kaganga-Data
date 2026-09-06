<script lang="ts">
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import { invalidate } from '$app/navigation';

	let { data } = $props();
	let selectedIds = $state<number[]>([]);
	let showBulk = $state(false);
	let bulkAspect = $state(data.aspekAkademik[0]?.kode ?? '');
	let bulkField = $state('ketuntasan');
	let bulkScope = $state<'terpilih' | 'semua'>('semua');
	let searchTerm = $state(data.page.search ?? '');

	const allPageSelected = $derived(
		data.daftarMurid.length > 0 && data.daftarMurid.every((murid) => selectedIds.includes(murid.id))
	);

	function toggle(id: number) {
		selectedIds = selectedIds.includes(id)
			? selectedIds.filter((item) => item !== id)
			: [...selectedIds, id];
	}

	function togglePage() {
		const ids = data.daftarMurid.map((murid) => murid.id);
		selectedIds = allPageSelected
			? selectedIds.filter((id) => !ids.includes(id))
			: [...new Set([...selectedIds, ...ids])];
	}

	function openBulk() {
		bulkScope = selectedIds.length ? 'terpilih' : 'semua';
		showBulk = true;
	}

	function query(extra: Record<string, string | number | null> = {}) {
		const params = new URLSearchParams();
		if (data.page.search) params.set('q', data.page.search);
		if (data.page.currentPage > 1) params.set('page', String(data.page.currentPage));
		for (const [key, value] of Object.entries(extra)) {
			if (value == null || value === '') params.delete(key);
			else params.set(key, String(value));
		}
		const value = params.toString();
		return value ? `/asesmen-martikulasi?${value}` : '/asesmen-martikulasi';
	}

	function levelLabel(value: string | null) {
		return data.levelOptions.find((item) => item.value === value)?.label ?? '-';
	}

	function formatDate(value: string | null) {
		if (!value) return 'Belum pernah';
		return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(
			new Date(value)
		);
	}

	function nilai(aspekKode: string) {
		return (
			data.nilaiByAspek[aspekKode] ?? {
				capaianAwal: '',
				capaianAkhir: '',
				ketuntasan: '',
				catatan: '',
				deskripsiCapaian: ''
			}
		);
	}

	async function refresh() {
		showBulk = false;
		selectedIds = [];
		await invalidate('app:martikulasi');
	}
</script>

<svelte:head><title>Penilaian Martikulasi</title></svelte:head>

<div class="space-y-4">
	<header class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold">Penilaian Martikulasi</h1>
			<p class="text-base-content/65 text-sm">Masa Persiapan dengan ketuntasan manual oleh guru.</p>
		</div>
		{#if data.selectedKelas}
			<div class="text-left sm:text-right">
				<p class="font-semibold">
					{data.selectedKelas.nama}{data.selectedKelas.fase ? ` - ${data.selectedKelas.fase}` : ''}
				</p>
				<p class="text-base-content/60 text-sm">
					{data.selectedJenjang?.toUpperCase()} - Tahun Ajaran {data.selectedTahunAjaranNama}
				</p>
			</div>
		{/if}
	</header>

	{#if !data.selectedKelas}
		<div class="alert alert-warning">
			<Icon name="warning" /><span>Pilih kelas melalui menu Ganti Kelas di bagian atas.</span>
		</div>
	{:else}
		<section class="grid grid-cols-1 gap-3 sm:grid-cols-3">
			<div class="bg-base-100 rounded-md border p-4">
				<p class="text-base-content/60 text-sm">Total Murid</p>
				<p class="text-2xl font-bold">{data.jumlahMurid}</p>
			</div>
			<div class="bg-base-100 rounded-md border p-4">
				<p class="text-base-content/60 text-sm">Data Lengkap</p>
				<p class="text-success text-2xl font-bold">{data.jumlahLengkap}</p>
			</div>
			<div class="bg-base-100 rounded-md border p-4">
				<p class="text-base-content/60 text-sm">Belum Lengkap</p>
				<p class="text-warning text-2xl font-bold">{data.jumlahMurid - data.jumlahLengkap}</p>
			</div>
		</section>

		<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
			<form method="GET" class="flex min-w-0 flex-1 gap-2">
				<label class="input bg-base-100 w-full"
					><Icon name="search" /><input
						name="q"
						bind:value={searchTerm}
						placeholder="Cari nama, NIS, atau NISN"
					/></label
				>
				<button class="btn btn-soft" type="submit"
					><Icon name="search" /><span class="hidden sm:inline">Cari</span></button
				>
			</form>
			<button
				class="btn btn-primary"
				type="button"
				disabled={!data.canEdit || data.jumlahMurid === 0}
				onclick={openBulk}
			>
				<Icon name="edit" /> Isi Massal
			</button>
		</div>

		<div class="bg-base-100 overflow-x-auto rounded-md border">
			<table class="table min-w-[760px]">
				<thead class="bg-base-200"
					><tr>
						<th
							><input
								class="checkbox checkbox-sm"
								type="checkbox"
								checked={allPageSelected}
								onchange={togglePage}
								aria-label="Pilih semua murid pada halaman"
							/></th
						>
						<th>No</th><th>Nama Murid</th><th>Status</th><th>Level Penempatan</th><th
							>Terakhir Diperbarui</th
						><th>Aksi</th>
					</tr></thead
				>
				<tbody>
					{#each data.daftarMurid as murid, index (murid.id)}
						<tr>
							<td
								><input
									class="checkbox checkbox-sm"
									type="checkbox"
									checked={selectedIds.includes(murid.id)}
									onchange={() => toggle(murid.id)}
									aria-label={`Pilih ${murid.nama}`}
								/></td
							>
							<td>{(data.page.currentPage - 1) * data.page.perPage + index + 1}</td>
							<td
								><strong>{murid.nama}</strong><span class="text-base-content/60 block text-xs"
									>NIS {murid.nis || '-'}</span
								></td
							>
							<td
								><span
									class:badge-success={murid.statusKelengkapan === 'lengkap'}
									class:badge-warning={murid.statusKelengkapan !== 'lengkap'}
									class="badge badge-sm"
									>{murid.statusKelengkapan === 'lengkap' ? 'Lengkap' : 'Belum Lengkap'}</span
								></td
							>
							<td>{levelLabel(murid.levelPenempatan)}</td>
							<td class="text-sm">{formatDate(murid.updatedAt)}</td>
							<td
								><a class="btn btn-sm btn-soft" href={query({ murid_id: murid.id })}
									><Icon name={data.canEdit ? 'edit' : 'eye'} />
									{data.canEdit ? 'Input/Edit' : 'Lihat'}</a
								></td
							>
						</tr>
					{:else}
						<tr
							><td colspan="7" class="py-10 text-center text-base-content/60"
								>Tidak ada murid yang sesuai.</td
							></tr
						>
					{/each}
				</tbody>
			</table>
		</div>

		{#if data.page.totalPages > 1}
			<footer class="flex items-center justify-between">
				<p class="text-sm text-base-content/60">
					Halaman {data.page.currentPage} dari {data.page.totalPages}
				</p>
				<div class="join">
					<a
						class="btn btn-sm join-item"
						class:btn-disabled={data.page.currentPage <= 1}
						href={query({ page: Math.max(1, data.page.currentPage - 1) })}><Icon name="left" /></a
					>
					<a
						class="btn btn-sm join-item"
						class:btn-disabled={data.page.currentPage >= data.page.totalPages}
						href={query({ page: Math.min(data.page.totalPages, data.page.currentPage + 1) })}
						><Icon name="right" /></a
					>
				</div>
			</footer>
		{/if}
	{/if}
</div>

{#if showBulk && data.selectedKelas}
	<div class="modal modal-open">
		<div class="modal-box max-h-[92vh] max-w-2xl overflow-y-auto">
			<h2 class="text-xl font-bold">Isi Nilai Martikulasi Massal</h2>
			<p class="text-base-content/65 mt-1 text-sm">
				Hanya bidang yang dipilih yang akan diperbarui. Data lain tetap aman.
			</p>
			<FormEnhance action="?/isi_massal" onsuccess={refresh}>
				{#snippet children({ submitting })}
					<input type="hidden" name="kelasId" value={data.selectedKelas?.id ?? ''} />
					<input type="hidden" name="tahunAjaranId" value={data.selectedTahunAjaranId ?? ''} />
					<input type="hidden" name="muridIds" value={JSON.stringify(selectedIds)} />
					<div class="mt-5 grid gap-4">
						<label class="form-control gap-1"
							><span class="font-medium">Target Murid</span>
							<select class="select select-bordered" name="scope" bind:value={bulkScope}
								><option value="terpilih">Murid terpilih ({selectedIds.length})</option><option
									value="semua">Semua murid dalam kelas ({data.jumlahMurid})</option
								></select
							>
						</label>
						<label class="form-control gap-1"
							><span class="font-medium">Aspek</span>
							<select class="select select-bordered" name="aspekKode" bind:value={bulkAspect}>
								<optgroup label="Akademik"
									>{#each data.aspekAkademik as aspek}<option value={aspek.kode}
											>{aspek.label}</option
										>{/each}</optgroup
								>
								<optgroup label="Karakter"
									>{#each data.aspekKarakter as aspek}<option value={aspek.kode}
											>{aspek.label}</option
										>{/each}</optgroup
								>
							</select>
						</label>
						<label class="form-control gap-1"
							><span class="font-medium">Bidang</span>
							<select class="select select-bordered" name="field" bind:value={bulkField}>
								<option value="capaianAwal">Capaian Awal</option><option value="capaianAkhir"
									>Capaian Akhir</option
								>
								<option value="ketuntasan">Ketuntasan</option><option value="catatan"
									>Catatan Aspek</option
								>
								<option value="deskripsiCapaian">Deskripsi Capaian</option><option
									value="levelPenempatan">Level Penempatan</option
								>
								<option value="rekomendasi">Rekomendasi Tindak Lanjut</option><option
									value="catatanUmum">Catatan Umum</option
								>
							</select>
						</label>
						<label class="form-control gap-1"
							><span class="font-medium">Nilai yang Diterapkan</span>
							{#if bulkField === 'ketuntasan'}
								<select class="select select-bordered" name="value"
									><option value="">Kosongkan</option
									>{#each data.ketuntasanOptions as option}<option value={option.value}
											>{option.label}</option
										>{/each}</select
								>
							{:else if bulkField === 'levelPenempatan'}
								<select class="select select-bordered" name="value"
									><option value="">Kosongkan</option>{#each data.levelOptions as option}<option
											value={option.value}>{option.label}</option
										>{/each}</select
								>
							{:else}
								<textarea
									class="textarea textarea-bordered min-h-24"
									name="value"
									placeholder="Isi nilai atau teks yang sama"></textarea>
							{/if}
						</label>
					</div>
					<div class="modal-action">
						<button class="btn btn-soft" type="button" onclick={() => (showBulk = false)}
							>Batal</button
						><button
							class="btn btn-primary"
							type="submit"
							disabled={submitting || (bulkScope === 'terpilih' && selectedIds.length === 0)}
							><Icon name="save" /> {submitting ? 'Menyimpan...' : 'Terapkan'}</button
						>
					</div>
				{/snippet}
			</FormEnhance>
		</div>
	</div>
{/if}

{#if data.selectedMurid && data.selectedKelas}
	<div class="modal modal-open">
		<div class="modal-box max-h-[94vh] w-[min(96vw,72rem)] max-w-6xl overflow-y-auto">
			<div class="flex items-start justify-between gap-3">
				<div>
					<h2 class="text-xl font-bold">Nilai Martikulasi - {data.selectedMurid.nama}</h2>
					<p class="text-base-content/60 text-sm">
						NIS {data.selectedMurid.nis} - {data.selectedKelas.nama}
					</p>
				</div>
				<a
					class="btn btn-sm btn-circle btn-ghost"
					href={query({ murid_id: null })}
					aria-label="Tutup"><Icon name="close" /></a
				>
			</div>
			<FormEnhance action="?/simpan" onsuccess={refresh}>
				{#snippet children({ submitting })}
					<input
						type="hidden"
						name="tahunAjaranId"
						value={data.selectedTahunAjaranId ?? ''}
					/><input type="hidden" name="kelasId" value={data.selectedKelas?.id ?? ''} /><input
						type="hidden"
						name="muridId"
						value={data.selectedMurid?.id ?? ''}
					/>
					<fieldset disabled={!data.canEdit || submitting} class="mt-5 space-y-6">
						<section>
							<h3 class="mb-2 font-semibold">Capaian Akademik</h3>
							<div class="overflow-x-auto rounded-md border">
								<table class="table table-sm min-w-[850px]">
									<thead class="bg-base-200"
										><tr
											><th>Aspek</th><th>Capaian Awal</th><th>Capaian Akhir</th><th>Ketuntasan</th
											><th>Catatan</th></tr
										></thead
									><tbody>
										{#each data.aspekAkademik as aspek}{@const current = nilai(aspek.kode)}<tr
												><th>{aspek.label}</th><td
													><input
														class="input input-bordered input-sm w-full"
														name={`nilai_${aspek.kode}_capaianAwal`}
														value={current.capaianAwal}
													/></td
												><td
													><input
														class="input input-bordered input-sm w-full"
														name={`nilai_${aspek.kode}_capaianAkhir`}
														value={current.capaianAkhir}
													/></td
												><td
													><select
														class="select select-bordered select-sm w-full"
														name={`nilai_${aspek.kode}_ketuntasan`}
														><option value="">Pilih</option
														>{#each data.ketuntasanOptions as option}<option
																value={option.value}
																selected={option.value === current.ketuntasan}
																>{option.label}</option
															>{/each}</select
													></td
												><td
													><input
														class="input input-bordered input-sm w-full"
														name={`nilai_${aspek.kode}_catatan`}
														value={current.catatan}
													/></td
												></tr
											>{/each}
									</tbody>
								</table>
							</div>
						</section>
						<section>
							<h3 class="mb-2 font-semibold">Karakter, Keagamaan, dan Keasramaan</h3>
							<div class="grid gap-3 md:grid-cols-2">
								{#each data.aspekKarakter as aspek}<label class="form-control gap-1"
										><span class="text-sm font-medium">{aspek.label}</span><textarea
											class="textarea textarea-bordered min-h-24"
											name={`nilai_${aspek.kode}_deskripsiCapaian`}
											>{nilai(aspek.kode).deskripsiCapaian}</textarea
										></label
									>{/each}
							</div>
						</section>
						<section class="grid gap-3 border-t pt-4 md:grid-cols-2">
							<label class="form-control gap-1"
								><span class="font-medium">Level Penempatan</span><select
									class="select select-bordered"
									name="levelPenempatan"
									><option value="">Pilih level</option>{#each data.levelOptions as option}<option
											value={option.value}
											selected={option.value === data.hasil?.levelPenempatan}>{option.label}</option
										>{/each}</select
								></label
							><label class="form-control gap-1"
								><span class="font-medium">Rekomendasi Tindak Lanjut</span><textarea
									class="textarea textarea-bordered min-h-24"
									name="rekomendasi">{data.hasil?.rekomendasi ?? ''}</textarea
								></label
							><label class="form-control gap-1 md:col-span-2"
								><span class="font-medium">Catatan Umum</span><textarea
									class="textarea textarea-bordered"
									name="catatanUmum">{data.hasil?.catatanUmum ?? ''}</textarea
								></label
							>
						</section>
					</fieldset>
					<div class="modal-action">
						<a class="btn btn-soft" href={query({ murid_id: null })}>Tutup</a
						>{#if data.canEdit}<button class="btn btn-primary" type="submit" disabled={submitting}
								><Icon name="save" /> {submitting ? 'Menyimpan...' : 'Simpan'}</button
							>{/if}
					</div>
				{/snippet}
			</FormEnhance>
		</div>
	</div>
{/if}
