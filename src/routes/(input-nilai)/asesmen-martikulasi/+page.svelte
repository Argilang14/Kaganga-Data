<script lang="ts">
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import { invalidate } from '$app/navigation';

	let { data } = $props();
	let filterForm = $state<HTMLFormElement | null>(null);

	function applyFilter(event: Event) {
		const target = event.currentTarget as HTMLSelectElement;
		if (target.name === 'tahun_ajaran_id' || target.name === 'jenjang') {
			const kelas = filterForm?.elements.namedItem('kelas_id') as HTMLSelectElement | null;
			if (kelas) kelas.value = '';
		}
		filterForm?.requestSubmit();
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

	async function handleSaveSuccess() {
		await invalidate('app:martikulasi');
	}
</script>

<svelte:head>
	<title>Penilaian Martikulasi</title>
</svelte:head>

<div class="space-y-4">
	<header class="flex flex-col gap-1">
		<h1 class="text-2xl font-bold">Penilaian Martikulasi</h1>
		<p class="text-base-content/65 text-sm">
			Masa Persiapan dengan ketuntasan yang ditetapkan manual oleh guru.
		</p>
	</header>

	<form
		bind:this={filterForm}
		method="GET"
		class="bg-base-100 grid gap-3 rounded-lg border p-4 md:grid-cols-4"
	>
		<label class="form-control gap-1">
			<span class="text-sm font-medium">Tahun Ajaran</span>
			<select
				class="select select-bordered w-full"
				name="tahun_ajaran_id"
				onchange={applyFilter}
			>
				{#each data.tahunAjaranList as tahun}
					<option value={tahun.id} selected={tahun.id === data.selectedTahunAjaranId}>
						{tahun.nama}{tahun.isAktif ? ' (Aktif)' : ''}
					</option>
				{/each}
			</select>
		</label>

		<label class="form-control gap-1">
			<span class="text-sm font-medium">Jenjang</span>
			<select class="select select-bordered w-full" name="jenjang" onchange={applyFilter}>
				<option value="semua" selected={data.selectedJenjang === 'semua'}>Semua Jenjang</option>
				<option value="srd" selected={data.selectedJenjang === 'srd'}>SRD</option>
				<option value="srmp" selected={data.selectedJenjang === 'srmp'}>SRMP</option>
				<option value="srma" selected={data.selectedJenjang === 'srma'}>SRMA</option>
			</select>
		</label>

		<label class="form-control gap-1 md:col-span-2">
			<span class="text-sm font-medium">Kelas</span>
			<select class="select select-bordered w-full" name="kelas_id" onchange={applyFilter}>
				{#if data.kelasList.length === 0}
					<option value="">Belum ada kelas</option>
				{/if}
				{#each data.kelasList as kelas}
					<option value={kelas.id} selected={kelas.id === data.selectedKelas?.id}>
						{kelas.nama}{kelas.fase ? ` - ${kelas.fase}` : ''}
					</option>
				{/each}
			</select>
		</label>
	</form>

	{#if !data.selectedKelas}
		<div class="alert alert-warning">
			<Icon name="warning" />
			<span>Belum ada kelas untuk tahun ajaran dan jenjang yang dipilih.</span>
		</div>
	{:else if data.daftarMurid.length === 0}
		<div class="alert alert-warning">
			<Icon name="warning" />
			<span>Belum ada murid di kelas {data.selectedKelas.nama}.</span>
		</div>
	{:else}
		<div class="grid min-w-0 gap-4 xl:grid-cols-[17rem_minmax(0,1fr)]">
			<aside class="bg-base-100 max-h-[calc(100vh-16rem)] overflow-y-auto rounded-lg border p-2">
				<div class="border-base-300 sticky top-0 z-10 border-b bg-base-100 px-2 py-2">
					<h2 class="font-semibold">Daftar Murid</h2>
					<p class="text-base-content/60 text-xs">{data.daftarMurid.length} murid</p>
				</div>
				<nav class="mt-2 space-y-1" aria-label="Pilih murid">
					{#each data.daftarMurid as murid}
						<a
							class="flex min-h-12 items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors"
							class:bg-primary={murid.id === data.selectedMurid?.id}
							class:text-primary-content={murid.id === data.selectedMurid?.id}
							class:hover:bg-base-200={murid.id !== data.selectedMurid?.id}
							href={`?tahun_ajaran_id=${data.selectedTahunAjaranId}&jenjang=${data.selectedJenjang}&kelas_id=${data.selectedKelas.id}&murid_id=${murid.id}`}
						>
							<span class="min-w-0">
								<strong class="block truncate">{murid.nama}</strong>
								<span class="block truncate text-xs opacity-70">NIS {murid.nis}</span>
							</span>
							<span
								class="badge badge-sm shrink-0"
								class:badge-success={murid.statusKelengkapan === 'lengkap'}
								class:badge-warning={murid.statusKelengkapan !== 'lengkap'}
							>
								{murid.statusKelengkapan === 'lengkap' ? 'Lengkap' : 'Belum'}
							</span>
						</a>
					{/each}
				</nav>
			</aside>

			<section class="bg-base-100 min-w-0 rounded-lg border p-4">
				<div class="mb-4 flex flex-col gap-2 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h2 class="text-lg font-bold">{data.selectedMurid?.nama}</h2>
						<p class="text-base-content/65 text-sm">
							NIS {data.selectedMurid?.nis} · {data.selectedKelas.nama}
						</p>
					</div>
					<span
						class="badge"
						class:badge-success={data.hasil?.statusKelengkapan === 'lengkap'}
						class:badge-warning={data.hasil?.statusKelengkapan !== 'lengkap'}
					>
						{data.hasil?.statusKelengkapan === 'lengkap' ? 'Data Lengkap' : 'Belum Lengkap'}
					</span>
				</div>

				<FormEnhance action="?/simpan" onsuccess={handleSaveSuccess}>
					{#snippet children({ submitting })}
						<input type="hidden" name="tahunAjaranId" value={data.selectedTahunAjaranId ?? ''} />
						<input type="hidden" name="kelasId" value={data.selectedKelas?.id ?? ''} />
						<input type="hidden" name="muridId" value={data.selectedMurid?.id ?? ''} />

						<div class="space-y-6">
							<section>
								<div class="mb-2">
									<h3 class="font-semibold">Capaian Akademik</h3>
									<p class="text-base-content/60 text-xs">
										Isi capaian awal, akhir, dan pilih ketuntasan secara manual.
									</p>
								</div>
								<div class="overflow-x-auto rounded-md border">
									<table class="table table-sm min-w-[860px]">
										<thead class="bg-base-200">
											<tr>
												<th class="w-44">Aspek</th>
												<th>Capaian Awal</th>
												<th>Capaian Akhir</th>
												<th class="w-48">Ketuntasan</th>
												<th>Catatan</th>
											</tr>
										</thead>
										<tbody>
											{#each data.aspekAkademik as aspek}
												{@const current = nilai(aspek.kode)}
												<tr>
													<th>{aspek.label}</th>
													<td>
														<input class="input input-bordered input-sm w-full" name={`nilai_${aspek.kode}_capaianAwal`} value={current.capaianAwal} />
													</td>
													<td>
														<input class="input input-bordered input-sm w-full" name={`nilai_${aspek.kode}_capaianAkhir`} value={current.capaianAkhir} />
													</td>
													<td>
														<select class="select select-bordered select-sm w-full" name={`nilai_${aspek.kode}_ketuntasan`}>
															<option value="">Pilih</option>
															{#each data.ketuntasanOptions as option}
																<option value={option.value} selected={option.value === current.ketuntasan}>{option.label}</option>
															{/each}
														</select>
													</td>
													<td>
														<input class="input input-bordered input-sm w-full" name={`nilai_${aspek.kode}_catatan`} value={current.catatan} />
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							</section>

							<section>
								<div class="mb-2">
									<h3 class="font-semibold">Karakter, Keagamaan, dan Keasramaan</h3>
									<p class="text-base-content/60 text-xs">Tuliskan deskripsi capaian setiap aspek.</p>
								</div>
								<div class="grid gap-3 lg:grid-cols-2">
									{#each data.aspekKarakter as aspek}
										<label class="form-control gap-1">
											<span class="text-sm font-medium">{aspek.label}</span>
											<textarea class="textarea textarea-bordered min-h-24" name={`nilai_${aspek.kode}_deskripsiCapaian`}>{nilai(aspek.kode).deskripsiCapaian}</textarea>
										</label>
									{/each}
								</div>
							</section>

							<section class="grid gap-3 border-t pt-4 lg:grid-cols-2">
								<label class="form-control gap-1">
									<span class="text-sm font-medium">Level Penempatan</span>
									<select class="select select-bordered w-full" name="levelPenempatan">
										<option value="">Pilih level</option>
										{#each data.levelOptions as option}
											<option value={option.value} selected={option.value === data.hasil?.levelPenempatan}>{option.label}</option>
										{/each}
									</select>
								</label>
								<label class="form-control gap-1">
									<span class="text-sm font-medium">Rekomendasi Tindak Lanjut</span>
									<textarea class="textarea textarea-bordered min-h-24" name="rekomendasi">{data.hasil?.rekomendasi ?? ''}</textarea>
								</label>
								<label class="form-control gap-1 lg:col-span-2">
									<span class="text-sm font-medium">Catatan Umum</span>
									<textarea class="textarea textarea-bordered min-h-20" name="catatanUmum">{data.hasil?.catatanUmum ?? ''}</textarea>
								</label>
							</section>

							<div class="flex justify-end border-t pt-4">
								<button class="btn btn-primary min-w-36" type="submit" disabled={submitting}>
									{#if submitting}<span class="loading loading-spinner loading-sm"></span>{:else}<Icon name="save" />{/if}
									{submitting ? 'Menyimpan' : 'Simpan Semua'}
								</button>
							</div>
						</div>
					{/snippet}
				</FormEnhance>
			</section>
		</div>
	{/if}
</div>
