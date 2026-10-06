<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import { hideModal, showModal } from '$lib/components/global-modal.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import TambahJurnalModal from '$lib/components/jurnal-mengajar/tambah-jurnal-modal.svelte';
	import SvelteURLSearchParams from '$lib/svelte-helpers/url-search-params';

	let { data } = $props();

	const currentPage = $derived.by(() => data.page.currentPage ?? 1);
	const totalPages = $derived.by(() => Math.max(1, data.page.totalPages ?? 1));
	const pages = $derived.by(() => Array.from({ length: totalPages }, (_, index) => index + 1));

	const hariList = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
	const bulanList = [
		'Januari',
		'Februari',
		'Maret',
		'April',
		'Mei',
		'Juni',
		'Juli',
		'Agustus',
		'September',
		'Oktober',
		'November',
		'Desember'
	];

	const tanggalLabel = $derived.by(() => {
		if (!data.tanggal) return '';
		const d = new Date(data.tanggal + 'T00:00:00');
		return `${hariList[d.getDay()]}, ${d.getDate()} ${bulanList[d.getMonth()]} ${d.getFullYear()}`;
	});

	const userType = $derived(page.data.user?.type ?? '');

	const canEdit = $derived(userType !== 'wali_asuh');
	const filledScheduleValues = $derived(
		new Set(
			data.daftarJurnal
				.map((item) => {
					try {
						return JSON.parse(item.jadwalPelajaranIds ?? '[]').join(',');
					} catch {
						return '';
					}
				})
				.filter(Boolean)
		)
	);
	const pendingScheduleOptions = $derived(
		currentPage === 1
			? data.scheduleOptions.filter((option) => !filledScheduleValues.has(option.value))
			: []
	);

	let selectedTanggal = $state(data.tanggal ?? '');

	$effect(() => {
		selectedTanggal = data.tanggal ?? '';
	});

	const isToday = $derived.by(() => {
		const d = new Date();
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		return data.tanggal === `${y}-${m}-${day}`;
	});

	function applyNavigation(update: (params: SvelteURLSearchParams) => void) {
		const params = new SvelteURLSearchParams(page.url.search);
		update(params);
		params.delete('page');
		const nextQuery = params.toString();
		void goto(`${page.url.pathname}${nextQuery ? `?${nextQuery}` : ''}`, {
			replaceState: true,
			keepFocus: true
		});
	}

	function viewDate() {
		applyNavigation((params) => {
			if (selectedTanggal) {
				params.set('tanggal', selectedTanggal);
			} else {
				params.delete('tanggal');
			}
		});
	}

	function resetToToday() {
		applyNavigation((params) => {
			params.delete('tanggal');
		});
	}

	function buildPageUrl(pageNumber: number) {
		const params = new SvelteURLSearchParams(page.url.search);
		const sanitized = pageNumber < 1 ? 1 : pageNumber;
		if (sanitized <= 1) {
			params.delete('page');
		} else {
			params.set('page', String(sanitized));
		}
		const nextQuery = params.toString();
		const nextUrl = `${page.url.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
		const currentUrl = `${page.url.pathname}${page.url.search}`;
		if (nextUrl === currentUrl) return null;
		return nextUrl;
	}

	async function gotoPage(pageNumber: number) {
		const target = buildPageUrl(pageNumber);
		if (!target) return;
		await goto(target, { replaceState: true, keepFocus: true });
	}

	function handlePageClick(pageNumber: number) {
		if (pageNumber === currentPage) return;
		void gotoPage(pageNumber);
	}

	function openTambahModal(
		editData?: {
			id: number;
			kelasId: number;
			mataPelajaranId: number | null;
			jadwalMapelId: number | null;
			lingkupMateri: string;
			tujuanPembelajaranId: number | null;
			tujuanPembelajaranManual: string;
			catatan: string;
		},
		initialJadwalIds = ''
	) {
		let actions: { submit: () => void };
		showModal({
			title: editData ? 'Edit Jurnal' : 'Tambah Jurnal',
			body: TambahJurnalModal,
			bodyProps: {
				editData: editData ?? null,
				kelasId: data.page.kelasId ? Number(data.page.kelasId) : undefined,
				tanggal: data.tanggal ?? undefined,
				mapelId: data.mapelId,
				mataPelajaranList: data.mataPelajaranList,
				scheduleOptions: data.scheduleOptions,
				jenisJadwal: data.scheduleContext?.jenis ?? 'ganjil',
				initialJadwalIds,
				tujuanPembelajaranList: data.tujuanPembelajaranList,
				lingkupMateriList: data.lingkupMateriList,
				userType: data.userType ?? '',
				onAction: (a: { submit: () => void }) => {
					actions = a;
				},
				onSuccess: async () => {
					hideModal();
				}
			},
			onPositive: {
				label: editData ? 'Simpan' : 'Tambah',
				action: () => actions!.submit()
			},
			onNegative: {
				label: 'Batal'
			},
			dismissible: true
		});
	}

	function handleTambahClick() {
		if (!data.page.kelasId) {
			toast('Pilih kelas terlebih dahulu', 'warning');
			return;
		}
		if (!data.hasAnyMapel) {
			toast('Tidak ada mata pelajaran yang terjadwal pada tanggal dan jenis jadwal ini', 'warning');
			return;
		}
		openTambahModal();
	}

	function confirmDelete(id: number) {
		const formId = `delete-jurnal-form-${id}`;
		showModal({
			title: 'Hapus Jurnal',
			body: '<p class="text-base-content/70">Apakah Anda yakin ingin menghapus jurnal ini?</p>',
			onPositive: {
				label: 'Hapus',
				class: 'btn-error',
				action: () => {
					(document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit();
				}
			},
			onNegative: { label: 'Batal' },
			dismissible: true
		});
	}

	async function handleDeleteSuccess() {
		hideModal();
	}
</script>

<div class="card bg-base-100 rounded-lg border border-none p-4 shadow-md">
	<div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<h2 class="text-xl font-bold">
				Jurnal Mengajar
				{#if tanggalLabel}
					- <span class="text-primary">{tanggalLabel}</span>
				{/if}
			</h2>
			{#if data.scheduleContext}
				<p class="text-base-content/60 mt-1 text-sm">
					{data.scheduleContext.tahunAjaranNama} · {data.scheduleContext.jenisLabel}
				</p>
			{/if}
		</div>
		<button
			type="button"
			class="btn btn-primary btn-soft gap-2 self-start shadow-none max-sm:w-full sm:self-center"
			onclick={handleTambahClick}
			disabled={!canEdit || !data.page.kelasId || !data.hasAnyMapel}
			title={!canEdit ? 'Anda tidak memiliki izin' : 'Tambah jurnal baru'}
		>
			<Icon name="plus" />
			<span>Tambah Jurnal</span>
		</button>
	</div>

	<div class="mb-4 flex flex-wrap items-end gap-2">
		<label class="form-control gap-1">
			<span class="label-text text-xs font-medium">Tanggal</span>
			<div class="join">
				<input
					type="date"
					class="input bg-base-200 dark:bg-base-300 join-item w-full max-w-48 dark:border-none"
					bind:value={selectedTanggal}
					onchange={viewDate}
				/>
				<button
					type="button"
					class="btn btn-soft join-item shadow-none"
					aria-label="Lihat jurnal"
					title="Lihat jurnal"
					onclick={viewDate}
				>
					<Icon name="eye" />
				</button>
				<button
					type="button"
					class="btn btn-soft join-item shadow-none"
					aria-label="Kembali ke hari ini"
					title="Kembali ke hari ini"
					onclick={resetToToday}
					disabled={!data.tanggal}
				>
					<Icon name="repeat" />
				</button>
			</div>
		</label>
		<label class="form-control gap-1">
			<span class="label-text text-xs font-medium">Jenis Jadwal</span>
			<select
				class="select bg-base-200 dark:bg-base-300 dark:border-none"
				value={data.scheduleContext?.jenis ?? 'ganjil'}
				onchange={(event) =>
					applyNavigation((params) => params.set('jenis_jadwal', event.currentTarget.value))}
			>
				<option value="persiapan">Masa Persiapan</option>
				<option value="ganjil">Semester Ganjil</option>
				<option value="genap">Semester Genap</option>
			</select>
		</label>
	</div>

	{#if data.scheduleSummary}
		<div
			class="border-base-300 bg-base-200/35 mb-4 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
		>
			<span class="font-semibold"
				>{data.scheduleSummary.kelasNama} · {data.scheduleSummary.hariLabel}</span
			>
			<span class="badge badge-primary badge-soft"
				>{data.scheduleSummary.blokPelajaran} blok mapel</span
			>
			<span class="badge badge-ghost">{data.scheduleSummary.slotPelajaran} slot pelajaran</span>
			<span class="badge badge-ghost">{data.scheduleSummary.slotKegiatan} kegiatan</span>
			{#if data.scheduleSummary.kegiatan.length}
				<span class="text-base-content/60 text-xs">{data.scheduleSummary.kegiatan.join(', ')}</span>
			{/if}
		</div>
	{/if}

	<div
		class="bg-base-100 dark:bg-base-200 mt-4 overflow-x-auto rounded-md shadow-md dark:shadow-none"
	>
		<table class="border-base-200 table border dark:border-none">
			<thead>
				<tr class="bg-base-200 dark:bg-base-300 text-left font-bold">
					<th style="width: 50px;">No</th>
					<th style="min-width: 120px;">Mata Pelajaran</th>
					<th style="min-width: 100px;">Kelas</th>
					<th style="width: 120px;">JP / Waktu</th>
					<th style="min-width: 140px;">Materi</th>
					<th style="min-width: 140px;">Tujuan Pembelajaran</th>
					<th style="width: 100px;">Aksi</th>
				</tr>
			</thead>
			<tbody>
				{#each data.daftarJurnal as item (item.id)}
					<tr>
						<td class="align-top">{item.no}</td>
						<td class="align-top">{item.mapelNama}</td>
						<td class="align-top">{item.kelasNama}</td>
						<td class="align-top">
							<div class="font-medium">JP {item.jamPelajaran}</div>
							<div class="text-base-content/55 text-xs">{item.pukul || '-'}</div>
						</td>
						<td class="align-top">{item.lingkupMateri}</td>
						<td class="max-w-[160px] truncate align-top" title={item.tpDeskripsi}>
							{item.tpDeskripsi || '-'}
						</td>
						<td class="align-top">
							<div class="flex gap-1">
								<button
									type="button"
									class="btn btn-sm btn-soft shadow-none"
									onclick={() =>
										openTambahModal({
											id: item.id,
											kelasId: item.kelasId,
											mataPelajaranId: item.mataPelajaranId,
											jadwalMapelId: item.jadwalMapelId,
											lingkupMateri: item.lingkupMateri,
											tujuanPembelajaranId: item.tpId,
											tujuanPembelajaranManual: item.tujuanPembelajaranManual,
											catatan: item.catatan
										})}
									disabled={!canEdit}
									title={!canEdit ? 'Anda tidak memiliki izin' : 'Edit jurnal'}
								>
									<Icon name="edit" />
								</button>
								<FormEnhance
									id={`delete-jurnal-form-${item.id}`}
									action="?/delete"
									onsuccess={handleDeleteSuccess}
								>
									{#snippet children()}
										<input type="hidden" name="id" value={item.id} />
									{/snippet}
								</FormEnhance>
								<button
									type="button"
									class="btn btn-sm btn-soft btn-error shadow-none"
									onclick={() => confirmDelete(item.id)}
									disabled={!canEdit}
									title={!canEdit ? 'Anda tidak memiliki izin' : 'Hapus jurnal'}
								>
									<Icon name="del" />
								</button>
							</div>
						</td>
					</tr>
				{/each}
				{#each pendingScheduleOptions as option, index (`pending-${option.value}`)}
					<tr class="bg-warning/5">
						<td class="align-top">{data.daftarJurnal.length + index + 1}</td>
						<td class="align-top font-medium">{option.nama}</td>
						<td class="align-top">{data.page.kelasNama ?? '-'}</td>
						<td class="align-top">
							<div class="font-medium">JP {option.jamPelajaran}</div>
							<div class="text-base-content/55 text-xs">{option.pukul || '-'}</div>
						</td>
						<td class="align-top"
							><span class="badge badge-warning badge-soft">Belum diisi</span></td
						>
						<td class="text-base-content/50 align-top">-</td>
						<td class="align-top">
							<button
								type="button"
								class="btn btn-primary btn-soft btn-sm shadow-none"
								onclick={() => openTambahModal(undefined, option.value)}
								disabled={!canEdit}
								title="Isi jurnal untuk blok ini"
							>
								<Icon name="edit" /> Isi
							</button>
						</td>
					</tr>
				{/each}
				{#if data.daftarJurnal.length === 0 && pendingScheduleOptions.length === 0}
					<tr>
						<td class="p-7 text-center italic opacity-60" colspan="7">
							{data.scheduleOptions.length
								? 'Semua jurnal pada jadwal ini sudah diisi'
								: data.emptyScheduleMessage}
						</td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>

	<div class="join mt-4 sm:mx-auto">
		{#each pages as pageNumber (pageNumber)}
			<button
				type="button"
				class="join-item btn pointer-events-auto"
				class:btn-active={pageNumber === currentPage}
				onclick={() => handlePageClick(pageNumber)}
				aria-current={pageNumber === currentPage ? 'page' : undefined}
			>
				{pageNumber}
			</button>
		{/each}
	</div>
</div>
