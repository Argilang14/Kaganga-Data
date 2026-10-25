<script lang="ts">
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import { invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';

	let { data } = $props();
	let selectedIds = $state<number[]>([]);
	let showBulk = $state(false);
	let bulkAspect = $state(data.aspekAkademik[0]?.kode ?? '');
	let bulkField = $state('ketuntasan');
	let bulkScope = $state<'terpilih' | 'semua'>('semua');
	let searchTerm = $state(data.page.search ?? '');
	let bulkDialog = $state<HTMLDialogElement | null>(null);
	let gradeDialog = $state<HTMLDialogElement | null>(null);
	let bulkSaving = $state(false);
	let gradeSaving = $state(false);

	$effect(() => {
		if (showBulk && bulkDialog && !bulkDialog.open) bulkDialog.showModal();
	});
	$effect(() => {
		if (data.selectedMurid && gradeDialog && !gradeDialog.open) gradeDialog.showModal();
	});

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

	function query(
		extra: Record<string, string | number | null> = {}
	): '/asesmen-martikulasi' | `/asesmen-martikulasi?${string}` {
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

<div class="card bg-base-100 min-w-0 cursor-default rounded-lg border-none p-4 shadow-md">
	<header class="mb-4 flex flex-wrap items-center justify-between gap-2">
		<div class="min-w-0">
			<h1 class="text-xl font-bold">Daftar Nilai Martikulasi</h1>
			{#if data.selectedKelas}
				<p class="text-base-content/75 text-sm">
					Kelas aktif: {data.selectedKelas.nama}{data.selectedKelas.fase
						? ` - ${data.selectedKelas.fase}`
						: ''}
				</p>
			{:else}
				<p class="text-base-content/65 text-sm">
					Masa Persiapan dengan ketuntasan manual oleh guru.
				</p>
			{/if}
		</div>
		<button
			class="btn btn-soft shadow-none max-sm:w-full"
			type="button"
			disabled={!data.selectedKelas || !data.canEdit || data.jumlahMurid === 0}
			aria-disabled={!data.selectedKelas || !data.canEdit || data.jumlahMurid === 0}
			title={!data.canEdit
				? 'Anda tidak memiliki izin mengubah nilai'
				: 'Isi nilai Martikulasi massal'}
			onclick={openBulk}
		>
			<Icon name="edit" /> Isi Massal
		</button>
	</header>

	{#if !data.selectedKelas}
		<div class="alert alert-soft alert-warning">
			<Icon name="warning" /><span>Pilih kelas melalui menu Ganti Kelas di bagian atas.</span>
		</div>
	{:else}
		<div class="flex flex-wrap items-center justify-between gap-2 text-sm">
			<dl class="flex flex-wrap items-center gap-x-4 gap-y-2">
				<div class="flex items-center gap-2">
					<dt class="text-base-content/65">Total murid</dt>
					<dd class="font-semibold">{data.jumlahMurid}</dd>
				</div>
				<div class="flex items-center gap-2">
					<dt class="text-base-content/65">Lengkap</dt>
					<dd class="text-success font-semibold">{data.jumlahLengkap}</dd>
				</div>
				<div class="flex items-center gap-2">
					<dt class="text-base-content/65">Belum lengkap</dt>
					<dd class="text-warning font-semibold">{data.jumlahMurid - data.jumlahLengkap}</dd>
				</div>
			</dl>
			<p class="text-base-content/65">
				{data.selectedJenjang?.toUpperCase()} - {data.selectedTahunAjaranNama}
			</p>
		</div>

		<div class="mt-2">
			<form method="GET" class="flex min-w-0 gap-2" role="search">
				<label class="input bg-base-200 w-full"
					><Icon name="search" /><input
						type="search"
						name="q"
						bind:value={searchTerm}
						aria-label="Cari murid berdasarkan nama, NIS, atau NISN"
						placeholder="Cari nama, NIS, atau NISN"
					/></label
				>
				<button
					class="btn btn-soft btn-square shrink-0 shadow-none"
					type="submit"
					aria-label="Cari murid"
					title="Cari murid"><Icon name="search" /></button
				>
			</form>
		</div>
		{#if selectedIds.length}
			<div class="mt-3 flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
				<span class="badge badge-soft badge-info">{selectedIds.length} murid dipilih</span>
				<button class="btn btn-xs btn-ghost" type="button" onclick={() => (selectedIds = [])}
					>Batalkan pilihan</button
				>
			</div>
		{/if}

		<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard access to the horizontal table scrollbar.) -->
		<div
			class="bg-base-100 mt-4 overflow-x-auto rounded-md shadow-md"
			tabindex="0"
			role="region"
			aria-label="Daftar nilai Martikulasi"
		>
			<table class="table min-w-[58rem] border border-base-200">
				<thead class="bg-base-200 text-base-content text-left font-bold"
					><tr>
						<th scope="col" class="w-12"
							><input
								class="checkbox checkbox-sm"
								indeterminate={data.daftarMurid.some((murid) => selectedIds.includes(murid.id)) &&
									!allPageSelected}
								type="checkbox"
								checked={allPageSelected}
								onchange={togglePage}
								aria-label="Pilih semua murid pada halaman"
							/></th
						>
						<th scope="col" class="w-12">No</th><th scope="col" class="min-w-48">Nama</th><th
							scope="col"
							class="min-w-36">Status</th
						><th scope="col" class="min-w-40">Level Penempatan</th><th scope="col" class="min-w-44"
							>Terakhir Diperbarui</th
						><th scope="col" class="min-w-32">Aksi</th>
					</tr></thead
				>
				<tbody>
					{#each data.daftarMurid as murid, index (murid.id)}
						<tr class={selectedIds.includes(murid.id) ? 'bg-base-200/40' : 'hover:bg-base-200/40'}>
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
								><span class="font-medium">{murid.nama}</span><span
									class="text-base-content/60 block text-xs">NIS {murid.nis || '-'}</span
								></td
							>
							<td
								><span
									class:badge-success={murid.statusKelengkapan === 'lengkap'}
									class:badge-warning={murid.statusKelengkapan !== 'lengkap'}
									class="badge badge-soft badge-sm whitespace-nowrap"
									>{murid.statusKelengkapan === 'lengkap' ? 'Lengkap' : 'Belum Lengkap'}</span
								></td
							>
							<td>{levelLabel(murid.levelPenempatan)}</td>
							<td class="text-base-content/65 text-sm">{formatDate(murid.updatedAt)}</td>
							<td
								><a
									class="btn btn-sm btn-soft shadow-none"
									href={resolve(query({ murid_id: murid.id }))}
									><Icon name={data.canEdit ? 'edit' : 'eye'} />
									{data.canEdit ? 'Nilai' : 'Lihat'}</a
								></td
							>
						</tr>
					{:else}
						<tr
							><td colspan="7" class="py-10 text-center text-base-content/60"
								>{data.page.search
									? 'Tidak ditemukan murid yang sesuai dengan pencarian.'
									: 'Belum ada murid dalam kelas ini.'}</td
							></tr
						>
					{/each}
				</tbody>
			</table>
		</div>

		<footer class="mt-4 flex flex-wrap items-center justify-between gap-3">
			<p class="text-sm text-base-content/60">
				{data.page.totalItems} murid ditemukan · Halaman {data.page.currentPage} dari {data.page
					.totalPages}
			</p>
			{#if data.page.totalPages > 1}<nav class="join" aria-label="Halaman daftar nilai Martikulasi">
					<a
						class="btn join-item shadow-none"
						aria-label="Halaman sebelumnya"
						aria-disabled={data.page.currentPage <= 1}
						tabindex={data.page.currentPage <= 1 ? -1 : undefined}
						class:btn-disabled={data.page.currentPage <= 1}
						href={resolve(query({ page: Math.max(1, data.page.currentPage - 1) }))}
						><Icon name="left" /></a
					>
					<span class="btn join-item btn-active pointer-events-none" aria-current="page"
						>{data.page.currentPage}</span
					>
					<a
						class="btn join-item shadow-none"
						aria-label="Halaman berikutnya"
						aria-disabled={data.page.currentPage >= data.page.totalPages}
						tabindex={data.page.currentPage >= data.page.totalPages ? -1 : undefined}
						class:btn-disabled={data.page.currentPage >= data.page.totalPages}
						href={resolve(
							query({ page: Math.min(data.page.totalPages, data.page.currentPage + 1) })
						)}><Icon name="right" /></a
					>
				</nav>{/if}
		</footer>
	{/if}
</div>

{#if showBulk && data.selectedKelas}
	<dialog
		bind:this={bulkDialog}
		class="app-modal modal"
		style="--app-modal-width:32rem"
		aria-labelledby="martikulasi-bulk-title"
		aria-busy={bulkSaving}
		oncancel={(event) => event.preventDefault()}
	>
		<div class="app-modal-box modal-box">
			<h2 id="martikulasi-bulk-title" class="app-modal-title">Isi Nilai Martikulasi Massal</h2>
			<FormEnhance
				action="?/isi_massal"
				onsuccess={refresh}
				class="flex min-h-0 flex-col overflow-hidden"
				submitStateChange={(saving) => (bulkSaving = saving)}
			>
				{#snippet children({ submitting })}
					<input type="hidden" name="kelasId" value={data.selectedKelas?.id ?? ''} />
					<input type="hidden" name="tahunAjaranId" value={data.selectedTahunAjaranId ?? ''} />
					<input type="hidden" name="muridIds" value={JSON.stringify(selectedIds)} />
					<div class="app-modal-body space-y-4">
						<p class="text-base-content/65 text-sm">
							Hanya bidang yang dipilih yang akan diperbarui.
						</p>
						<fieldset disabled={submitting} class="grid min-w-0 gap-4">
							<label class="grid min-w-0 gap-1.5 text-sm"
								><span class="font-medium">Target Murid</span>
								<select class="select bg-base-200 w-full" name="scope" bind:value={bulkScope}
									><option value="terpilih">Murid terpilih ({selectedIds.length})</option><option
										value="semua">Semua murid dalam kelas ({data.jumlahMurid})</option
									></select
								>
							</label>
							<label class="grid min-w-0 gap-1.5 text-sm"
								><span class="font-medium">Aspek</span>
								<select class="select bg-base-200 w-full" name="aspekKode" bind:value={bulkAspect}>
									<optgroup label="Akademik"
										>{#each data.aspekAkademik as aspek (aspek.kode)}<option value={aspek.kode}
												>{aspek.label}</option
											>{/each}</optgroup
									>
									<optgroup label="Karakter"
										>{#each data.aspekKarakter as aspek (aspek.kode)}<option value={aspek.kode}
												>{aspek.label}</option
											>{/each}</optgroup
									>
								</select>
							</label>
							<label class="grid min-w-0 gap-1.5 text-sm"
								><span class="font-medium">Bidang</span>
								<select class="select bg-base-200 w-full" name="field" bind:value={bulkField}>
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
							<label class="grid min-w-0 gap-1.5 text-sm"
								><span class="font-medium">Nilai yang Diterapkan</span>
								{#if bulkField === 'ketuntasan'}
									<select class="select bg-base-200 w-full" name="value"
										><option value="">Kosongkan</option
										>{#each data.ketuntasanOptions as option (option.value)}<option
												value={option.value}>{option.label}</option
											>{/each}</select
									>
								{:else if bulkField === 'levelPenempatan'}
									<select class="select bg-base-200 w-full" name="value"
										><option value="">Kosongkan</option
										>{#each data.levelOptions as option (option.value)}<option value={option.value}
												>{option.label}</option
											>{/each}</select
									>
								{:else}
									<textarea
										class="textarea bg-base-200 min-h-24 w-full"
										name="value"
										placeholder="Isi nilai atau teks yang sama"></textarea>
								{/if}
							</label>
						</fieldset>
					</div>
					<div class="app-modal-actions modal-action">
						<button
							class="btn btn-soft shadow-none"
							type="button"
							disabled={submitting}
							onclick={() => (showBulk = false)}>Batal</button
						><button
							class="btn btn-primary shadow-none"
							type="submit"
							disabled={submitting || (bulkScope === 'terpilih' && selectedIds.length === 0)}
							><Icon name="save" /> {submitting ? 'Menyimpan...' : 'Terapkan'}</button
						>
					</div>
				{/snippet}
			</FormEnhance>
		</div>
	</dialog>
{/if}

{#if data.selectedMurid && data.selectedKelas}
	<dialog
		bind:this={gradeDialog}
		class="app-modal modal"
		style="--app-modal-width:64rem"
		aria-labelledby="martikulasi-grade-title"
		aria-busy={gradeSaving}
		oncancel={(event) => event.preventDefault()}
	>
		<div class="app-modal-box modal-box">
			<div class="flex shrink-0 items-start justify-between gap-3">
				<div class="min-w-0">
					<h2 id="martikulasi-grade-title" class="app-modal-title">
						Nilai Martikulasi - {data.selectedMurid.nama}
					</h2>
					<p class="text-base-content/60 text-sm">
						NIS {data.selectedMurid.nis} - {data.selectedKelas.nama}
					</p>
				</div>
				<a
					class="btn btn-sm btn-square btn-ghost shrink-0"
					class:btn-disabled={gradeSaving}
					aria-disabled={gradeSaving}
					tabindex={gradeSaving ? -1 : undefined}
					href={resolve(query({ murid_id: null }))}
					aria-label="Tutup"><Icon name="close" /></a
				>
			</div>
			<FormEnhance
				action="?/simpan"
				onsuccess={refresh}
				class="flex min-h-0 flex-col overflow-hidden"
				submitStateChange={(saving) => (gradeSaving = saving)}
			>
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
					<div class="app-modal-body martikulasi-grade-body">
						<fieldset disabled={!data.canEdit || submitting} class="min-w-0 space-y-6">
							<section>
								<h3 class="mb-2 font-semibold">Capaian Akademik</h3>
								<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard access to the horizontal table scrollbar.) -->
								<div
									class="overflow-x-auto rounded-md border border-base-200"
									role="region"
									tabindex="0"
									aria-label="Capaian akademik"
								>
									<table class="table min-w-[850px]">
										<thead class="bg-base-200"
											><tr
												><th>Aspek</th><th>Capaian Awal</th><th>Capaian Akhir</th><th>Ketuntasan</th
												><th>Catatan</th></tr
											></thead
										><tbody>
											{#each data.aspekAkademik as aspek (aspek.kode)}{@const current = nilai(
													aspek.kode
												)}<tr
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
															>{#each data.ketuntasanOptions as option (option.value)}<option
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
									{#each data.aspekKarakter as aspek (aspek.kode)}<label class="form-control gap-1"
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
										><option value="">Pilih level</option
										>{#each data.levelOptions as option (option.value)}<option
												value={option.value}
												selected={option.value === data.hasil?.levelPenempatan}
												>{option.label}</option
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
					</div>
					<div class="app-modal-actions modal-action">
						<a
							class="btn btn-soft shadow-none"
							class:btn-disabled={submitting}
							aria-disabled={submitting}
							tabindex={submitting ? -1 : undefined}
							href={resolve(query({ murid_id: null }))}>Tutup</a
						>{#if data.canEdit}<button class="btn btn-primary" type="submit" disabled={submitting}
								><Icon name="save" /> {submitting ? 'Menyimpan...' : 'Simpan'}</button
							>{/if}
					</div>
				{/snippet}
			</FormEnhance>
		</div>
	</dialog>
{/if}

<style>
	:global(.martikulasi-grade-body .form-control) {
		display: grid;
		min-width: 0;
		gap: 0.375rem;
		font-size: 0.875rem;
	}
	:global(.martikulasi-grade-body :is(input, select, textarea)) {
		width: 100%;
		background: var(--color-base-200);
	}
	:global(.martikulasi-grade-body :is(input, select)) {
		min-height: 2.5rem;
	}
</style>
