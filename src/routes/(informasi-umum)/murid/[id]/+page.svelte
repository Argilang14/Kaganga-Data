<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- page uses href/goto intentionally for navigation */
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import { jenisKelamin } from '$lib/statics.js';
	import { modalRoute } from '$lib/utils.js';
	import { onMount, onDestroy } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { showModal } from '$lib/components/global-modal.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import MuridPhotoUploadModal from '$lib/components/murid-photo-upload-modal.svelte';
	import { page } from '$app/state';
	import { canEditMurid } from '$lib/murid-permissions';

	let { data } = $props();

	const canEditData = $derived.by(() => {
		return canEditMurid(page.data.user);
	});
	const canManagePhoto = $derived.by(() => {
		const u = page.data.user as { type?: string } | null | undefined;
		return u?.type !== 'wali_asuh' && u?.type !== 'wali_asrama';
	});

	let kelas = $derived(`${data.murid.kelas?.nama || '-'} Fase ${data.murid.kelas?.fase || '-'}`);
	let deletingFoto = $state(false);
	let isUploadModalOpen = $state(false);
	let isRiwayatPertumbuhanOpen = $state(false);
	let isTambahKesehatanOpen = $state(false);

	// Track if data was updated while modal was open
	let dataWasUpdated = $state(false);

	// compute a robust image src for the detail modal:
	// - if `data.murid.foto` is a URL or data URI, use it directly
	// - otherwise fallback to the internal API endpoint and add a cache-busting
	//   query param so updated photos are fetched instead of a cached image
	const photoSrc = $derived(
		!data?.murid?.foto
			? null
			: typeof data.murid.foto === 'string'
				? data.murid.foto.startsWith('http') ||
					data.murid.foto.startsWith('data:') ||
					data.murid.foto.startsWith('/')
					? data.murid.foto
					: `/api/murid-photo/${data.murid.id}?v=${encodeURIComponent(data.murid.foto)}`
				: `/api/murid-photo/${data.murid.id}?t=${Date.now()}`
	);

	let _muridUpdatedHandler: ((e: CustomEvent<Record<string, unknown>>) => void) | null = null;

	onMount(() => {
		_muridUpdatedHandler = (e: CustomEvent<Record<string, unknown>>) => {
			try {
				const detail = (e?.detail ?? null) as Record<string, unknown> | null;
				if (!detail) return;
				// match by id
				if (String(detail.id) === String(data?.murid?.id)) {
					const savedMurid =
						typeof detail.murid === 'object' && detail.murid !== null
							? (detail.murid as typeof data.murid)
							: null;
					// include timestamp in foto field to bust cache when filename unchanged
					const newFoto = detail?.foto ? `${detail.foto}${detail.t ? `?t=${detail.t}` : ''}` : null;
					// reassign `data` so runes reactivity picks up change
					const waliAsramaNama =
						typeof detail.waliAsramaNama === 'string'
							? detail.waliAsramaNama
							: data.murid?.waliAsramaNama;
					const waliAsramaNip =
						typeof detail.waliAsramaNip === 'string'
							? detail.waliAsramaNip
							: data.murid?.waliAsramaNip;
					const waliAsuhNama =
						typeof detail.waliAsuhNama === 'string'
							? detail.waliAsuhNama
							: data.murid?.waliAsuhNama;
					const waliAsuhNip =
						typeof detail.waliAsuhNip === 'string' ? detail.waliAsuhNip : data.murid?.waliAsuhNip;
					data = {
						...data,
						murid: {
							...(savedMurid ?? data.murid ?? {}),
							foto: newFoto,
							waliAsramaNama,
							waliAsramaNip,
							waliAsuhNama,
							waliAsuhNip
						}
					};
					// Mark that data was updated, will force refresh on next modal open
					dataWasUpdated = true;
				}
			} catch (err) {
				console.debug('murid:updated handler error', err);
			}
		};
		window.addEventListener('murid:updated', _muridUpdatedHandler as EventListener);
	});

	onDestroy(() => {
		if (_muridUpdatedHandler)
			window.removeEventListener('murid:updated', _muridUpdatedHandler as EventListener);
		// Invalidate data when component destroys if there were updates
		if (dataWasUpdated) {
			invalidateAll().catch((err) => console.error('Invalidate error:', err));
		}
	});

	async function deleteFoto() {
		if (!data.murid?.id) return;
		showModal({
			title: 'Hapus foto murid',
			body: '<p>Hapus foto murid? Tindakan ini tidak dapat dibatalkan.</p>',
			onPositive: {
				label: 'Hapus',
				icon: 'del',
				action: async ({ close }: { close: () => void }) => {
					deletingFoto = true;
					try {
						const res = await fetch(`/api/murid-photo/${data.murid.id}`, { method: 'DELETE' });
						if (!res.ok) {
							let msg = 'Gagal menghapus foto';
							try {
								const json = await res.json().catch(() => null);
								if (json && typeof json.message === 'string') msg = json.message;
							} catch {
								void 0;
							}
							toast({ message: msg, type: 'warning' });
						} else {
							data = { ...data, murid: { ...data.murid, foto: null } };
							// Dispatch custom event to notify other components
							window.dispatchEvent(
								new CustomEvent('murid:updated', {
									detail: { id: data.murid.id, foto: null, t: Date.now() }
								})
							);
							toast({ message: 'Foto berhasil dihapus', type: 'success' });
							close();
						}
					} catch (err) {
						console.error(err);
						toast({ message: 'Gagal menghapus foto', type: 'error' });
					} finally {
						deletingFoto = false;
					}
				}
			},
			onNegative: { label: 'Batal', icon: 'close' },
			dismissible: true
		});
	}

	function handleUploadSuccess(filename: string) {
		data = { ...data, murid: { ...data.murid, foto: filename } };
	}

	const statusGiziLabel: Record<string, string> = {
		gizi_buruk: 'Gizi Buruk',
		gizi_kurang: 'Gizi Kurang',
		normal: 'Normal',
		gizi_lebih: 'Gizi Lebih',
		obesitas: 'Obesitas'
	};

	function formatTanggal(value?: string | null) {
		if (!value) return '-';
		const date = new Date(`${value}T00:00:00`);
		if (Number.isNaN(date.getTime())) return value;
		return new Intl.DateTimeFormat('id-ID', {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		}).format(date);
	}

	function formatAngka(value?: number | string | null) {
		if (value === null || value === undefined || value === '') return '-';
		const number = Number(value);
		if (!Number.isFinite(number)) return String(value);
		return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(number);
	}

	function formatTinggi(value?: number | string | null) {
		return value === null || value === undefined || value === '' ? '-' : `${formatAngka(value)} cm`;
	}

	function formatBerat(value?: number | string | null) {
		return value === null || value === undefined || value === '' ? '-' : `${formatAngka(value)} kg`;
	}

	function formatStatusGizi(value?: string | null) {
		return value ? (statusGiziLabel[value] ?? value) : 'Belum diisi';
	}

	function formatUsiaPada(tanggal?: string | null) {
		if (!tanggal || !data.murid?.tanggalLahir) return '-';
		const lahir = new Date(`${data.murid.tanggalLahir}T00:00:00`);
		const ukur = new Date(`${tanggal}T00:00:00`);
		if (Number.isNaN(lahir.getTime()) || Number.isNaN(ukur.getTime()) || ukur < lahir) return '-';
		let bulan =
			(ukur.getFullYear() - lahir.getFullYear()) * 12 + (ukur.getMonth() - lahir.getMonth());
		if (ukur.getDate() < lahir.getDate()) bulan -= 1;
		const tahun = Math.floor(bulan / 12);
		const sisaBulan = bulan % 12;
		if (tahun <= 0) return `${sisaBulan} bulan`;
		return `${tahun} tahun ${sisaBulan} bulan`;
	}

	const today = new Date().toISOString().slice(0, 10);

	const kesehatanTerbaru = $derived(data.kesehatanTerbaru ?? null);
	const kesehatanRiwayat = $derived(data.kesehatanRiwayat ?? []);

	async function handleKesehatanSaved() {
		isTambahKesehatanOpen = false;
		await invalidateAll();
	}

	async function handleKesehatanDeleted() {
		await invalidateAll();
	}
</script>

{#snippet field(label: string, value?: string | null)}
	<!-- use snippet for repeatable elements -->
	<div>
		<span class="text-sm text-gray-500">{label}</span>
		<p class="font-medium">{value || '-'}</p>
	</div>
{/snippet}

{#snippet kesehatanStatusCard(label: string, value: string, detail?: string | null)}
	<div class="bg-error/5 border-error/20 rounded-lg border p-4">
		<div class="flex items-center gap-4">
			<div
				class="bg-error text-error-content flex size-12 shrink-0 items-center justify-center rounded-lg"
			>
				<Icon name="warning" class="size-6" />
			</div>
			<div>
				<p class="text-base-content/55 text-sm font-semibold">{label}</p>
				<p class="text-xl font-bold">{value}</p>
				{#if detail}
					<p class="text-base-content/60 text-sm">{detail}</p>
				{/if}
			</div>
		</div>
	</div>
{/snippet}

{#snippet kesehatanMetric(label: string, value: string)}
	<div>
		<p class="text-base-content/55 text-sm">{label}</p>
		<p class="text-2xl font-bold">{value}</p>
	</div>
{/snippet}

<div class="mb-6 text-xl font-bold">Detail Data Murid</div>
<div class="max-h-[60vh] overflow-y-auto sm:max-h-none sm:overflow-y-visible">
	<div class="join join-vertical w-full max-w-full">
		<div class="tabs tabs-box">
			<!-- data Murid -->
			<input type="radio" name="tab-detil-murid" class="tab" aria-label="Data Murid" checked />
			<div class="tab-content bg-base-100 p-4">
				<div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
					<!-- Foto murid (placeholder) -->
					<div class="flex flex-col justify-between text-center sm:col-span-1 sm:pr-4">
						<div
							class="bg-base-200 flex aspect-3/4 w-full max-w-xs items-center justify-center overflow-hidden rounded-lg object-cover"
						>
							{#if photoSrc}
								<img src={photoSrc} alt="Foto murid" class="h-full w-full object-cover" />
							{:else}
								<!-- Simple placeholder: initials or icon -->
								<div class="p-4 text-center opacity-60">
									<Icon name="user" class="mx-auto text-6xl" />
									<p class="mt-2 text-sm">Foto belum tersedia</p>
								</div>
							{/if}
						</div>
						<div class="mt-4 flex flex-row sm:mx-auto sm:mt-0">
							<button
								class="btn btn-soft rounded-l-md shadow-none"
								type="button"
								onclick={() => (isUploadModalOpen = true)}
								disabled={!canManagePhoto}
								title={!canManagePhoto ? 'Anda tidak memiliki izin untuk mengubah foto' : ''}
								aria-label="Ubah Foto Murid"
							>
								<Icon name="edit" />
								Ubah
							</button>
							<button
								class="btn btn-soft btn-error rounded-r-md shadow-none"
								type="button"
								onclick={deleteFoto}
								disabled={deletingFoto || !photoSrc || !canManagePhoto}
								title={!canManagePhoto ? 'Anda tidak memiliki izin untuk menghapus foto' : ''}
								aria-label="Hapus Foto Murid"
							>
								<Icon name="del" />
								Hapus
							</button>
						</div>
					</div>
					<!-- Data fields (kept as two-column grid inside the right area) -->
					<div class="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-2">
						{@render field('NIS', data.murid.nis)}
						{@render field('NISN', data.murid.nisn)}
						{@render field('Nama', data.murid.nama)}
						{@render field('Kelas', kelas)}
						{@render field('Tempat Lahir', data.murid.tempatLahir)}
						{@render field('Tanggal Lahir', data.murid.tanggalLahir)}
						{@render field('Jenis Kelamin', jenisKelamin[data.murid.jenisKelamin])}
						{@render field('Agama', data.murid.agama)}
						{@render field('Pendidikan Sebelumnya', data.murid.pendidikanSebelumnya)}
						{@render field('Tanggal Masuk Sekolah Ini', data.murid.tanggalMasuk)}
					</div>
				</div>
			</div>
			<!-- data Orang Tua -->
			<input type="radio" name="tab-detil-murid" class="tab" aria-label="Data Orang Tua" />
			<div class="tab-content bg-base-100 p-4">
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					{@render field('Nama Ayah', data.murid.ayah?.nama)}
					{@render field('Pekerjaan Ayah', data.murid.ayah?.pekerjaan)}
					{@render field('Nama Ibu', data.murid.ibu?.nama)}
					{@render field('Pekerjaan Ibu', data.murid.ibu?.pekerjaan)}
					{@render field(
						'Kontak',
						data.murid.ayah?.kontak || data.murid.ibu?.kontak || data.murid.wali?.kontak
					)}
				</div>
			</div>
			<!-- data Alamat Murid -->
			<input type="radio" name="tab-detil-murid" class="tab" aria-label="Data Alamat Murid" />
			<div class="tab-content bg-base-100 p-4">
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					{@render field('Jalan', data.murid.alamat?.jalan)}
					{@render field('Kelurahan/Desa', data.murid.alamat?.desa)}
					{@render field('Kecamatan', data.murid.alamat?.kecamatan)}
					{@render field('Kabupaten/Kota', data.murid.alamat?.kabupaten)}
					{@render field('Provinsi', data.murid.alamat?.provinsi)}
				</div>
			</div>
			<!-- data Wali -->
			<input type="radio" name="tab-detil-murid" class="tab" aria-label="Data Wali" />
			<div class="tab-content bg-base-100 p-4">
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					{@render field('Nama Wali', data.murid.wali?.nama)}
					{@render field('Pekerjaan Wali', data.murid.wali?.pekerjaan)}
					{@render field('Alamat Wali', data.murid.wali?.alamat)}
					{@render field('Kontak', data.murid.wali?.kontak)}
				</div>
			</div>
			<!-- data Wali Asrama -->
			<input type="radio" name="tab-detil-murid" class="tab" aria-label="Wali Asrama" />
			<div class="tab-content bg-base-100 p-4">
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					{@render field('Nama Wali Asrama', data.murid.waliAsramaNama)}
					{@render field('NIP Wali Asrama', data.murid.waliAsramaNip)}
				</div>
			</div>
			<!-- data Kesehatan & Fisik -->
			<input type="radio" name="tab-detil-murid" class="tab" aria-label="Kesehatan & Fisik" />
			<div class="tab-content bg-base-100 p-4">
				<div class="border-base-300 rounded-lg border p-4">
					<div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
						<div>
							<h2 class="text-xl font-bold">Data Kesehatan & Fisik</h2>
							<p class="text-base-content/70 text-sm">
								Update: {kesehatanTerbaru
									? formatTanggal(kesehatanTerbaru.tanggalPengukuran)
									: 'Belum ada data'}
							</p>
						</div>
						<div class="flex flex-col gap-2 sm:flex-row">
							<button
								class="btn btn-soft shadow-none"
								type="button"
								onclick={() => (isRiwayatPertumbuhanOpen = true)}
							>
								<Icon name="calendar" />
								Lihat Riwayat
								<span class="badge badge-primary badge-sm">{kesehatanRiwayat.length}</span>
							</button>
							<button
								class="btn btn-primary shadow-none"
								type="button"
								onclick={() => (isTambahKesehatanOpen = true)}
								disabled={!canEditData}
								title={!canEditData ? 'Anda tidak memiliki izin menambah data kesehatan' : ''}
							>
								<Icon name="edit" />
								Tambah Data Baru
							</button>
						</div>
					</div>

					<div class="grid gap-4 md:grid-cols-2">
						{@render kesehatanStatusCard(
							'Status Gizi',
							formatStatusGizi(kesehatanTerbaru?.statusGizi),
							kesehatanTerbaru?.zScore === null || kesehatanTerbaru?.zScore === undefined
								? null
								: `Z-Score: ${formatAngka(kesehatanTerbaru.zScore)}`
						)}
						{@render kesehatanStatusCard(
							'Kondisi Fisik',
							kesehatanTerbaru?.kondisiFisik || 'Belum diisi'
						)}
					</div>

					<div class="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
						{@render kesehatanMetric('Tinggi Badan', formatTinggi(kesehatanTerbaru?.tinggiBadan))}
						{@render kesehatanMetric('Berat Badan', formatBerat(kesehatanTerbaru?.beratBadan))}
						{@render kesehatanMetric('Ukuran Baju', kesehatanTerbaru?.ukuranBaju || '-')}
						{@render kesehatanMetric('Ukuran Celana', kesehatanTerbaru?.ukuranCelana || '-')}
						{@render kesehatanMetric('Ukuran Sepatu', kesehatanTerbaru?.ukuranSepatu || '-')}
					</div>
				</div>
			</div>
			<!-- data Wali Asuh -->
			<input type="radio" name="tab-detil-murid" class="tab" aria-label="Wali Asuh" />
			<div class="tab-content bg-base-100 p-4">
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					{@render field('Nama Wali Asuh', data.murid.waliAsuhNama)}
					{@render field('NIP Wali Asuh', data.murid.waliAsuhNip)}
				</div>
			</div>
		</div>
	</div>
</div>

<div class="mt-4 flex flex-col gap-2 sm:flex-row">
	<a class="btn btn-soft shadow-none" href="/murid">
		<Icon name="close" />
		Tutup
	</a>
	<div class="flex-1"></div>

	{#if canEditData}
		<a
			class="btn btn-primary btn-soft shadow-none"
			href="/murid/form/{data.murid.id}"
			use:modalRoute={'edit-murid'}
		>
			<Icon name="edit" />
			Edit
		</a>
	{:else}
		<button
			type="button"
			class="btn btn-disabled shadow-none"
			disabled
			title="Anda tidak memiliki izin untuk mengedit"
		>
			<Icon name="edit" />
			Edit
		</button>
	{/if}
</div>

{#if isTambahKesehatanOpen}
	<div class="modal modal-open" role="dialog" aria-modal="true">
		<div class="modal-box max-h-[92vh] w-11/12 max-w-6xl overflow-y-auto rounded-lg">
			<div class="mb-4 flex items-center justify-between gap-3">
				<h3 class="text-xl font-bold">Tambah Data Kesehatan & Fisik</h3>
				<button
					class="btn btn-ghost btn-sm btn-circle"
					type="button"
					onclick={() => (isTambahKesehatanOpen = false)}
					aria-label="Tutup tambah data kesehatan"
				>
					<Icon name="close" />
				</button>
			</div>

			<FormEnhance
				action="?/save-kesehatan"
				init={{ tanggalPengukuran: today }}
				onsuccess={handleKesehatanSaved}
			>
				{#snippet children({ submitting, invalid })}
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<label class="form-control">
							<span class="label-text font-semibold">Tanggal Pengukuran</span>
							<input
								class="input input-bordered w-full"
								type="date"
								name="tanggalPengukuran"
								required
							/>
						</label>
						<label class="form-control">
							<span class="label-text font-semibold">Status Gizi</span>
							<select class="select select-bordered w-full" name="statusGizi">
								<option value="">Pilih Status Gizi</option>
								<option value="gizi_buruk">Gizi Buruk</option>
								<option value="gizi_kurang">Gizi Kurang</option>
								<option value="normal">Normal</option>
								<option value="gizi_lebih">Gizi Lebih</option>
								<option value="obesitas">Obesitas</option>
							</select>
						</label>
						<label class="form-control">
							<span class="label-text font-semibold">Tinggi Badan (cm)</span>
							<input
								class="input input-bordered w-full"
								type="number"
								step="0.1"
								min="0"
								name="tinggiBadan"
								placeholder="Contoh: 154"
							/>
						</label>
						<label class="form-control">
							<span class="label-text font-semibold">Berat Badan (kg)</span>
							<input
								class="input input-bordered w-full"
								type="number"
								step="0.1"
								min="0"
								name="beratBadan"
								placeholder="Contoh: 60"
							/>
						</label>
						<label class="form-control">
							<span class="label-text font-semibold">Z-Score</span>
							<input
								class="input input-bordered w-full"
								type="number"
								step="0.01"
								name="zScore"
								placeholder="Contoh: 1.30"
							/>
						</label>
						<label class="form-control">
							<span class="label-text font-semibold">Kondisi Fisik</span>
							<input
								class="input input-bordered w-full"
								name="kondisiFisik"
								placeholder="Contoh: Sehat"
							/>
						</label>
						<label class="form-control">
							<span class="label-text font-semibold">Ukuran Baju</span>
							<input
								class="input input-bordered w-full"
								name="ukuranBaju"
								placeholder="Contoh: XL"
							/>
						</label>
						<label class="form-control">
							<span class="label-text font-semibold">Ukuran Celana</span>
							<input
								class="input input-bordered w-full"
								name="ukuranCelana"
								placeholder="Contoh: 29"
							/>
						</label>
						<label class="form-control">
							<span class="label-text font-semibold">Ukuran Sepatu</span>
							<input
								class="input input-bordered w-full"
								name="ukuranSepatu"
								placeholder="Contoh: 38 (EUR)"
							/>
						</label>
						<label class="form-control sm:col-span-2">
							<span class="label-text font-semibold">Catatan</span>
							<textarea
								class="textarea textarea-bordered min-h-24 w-full"
								name="catatan"
								placeholder="Catatan tambahan"
							></textarea>
						</label>
					</div>
					<div class="modal-action">
						<button
							class="btn btn-ghost"
							type="button"
							onclick={() => (isTambahKesehatanOpen = false)}
						>
							Batal
						</button>
						<button class="btn btn-primary" type="submit" disabled={submitting || invalid}>
							<Icon name="save" />
							{submitting ? 'Menyimpan...' : 'Simpan'}
						</button>
					</div>
				{/snippet}
			</FormEnhance>
		</div>
		<button
			class="modal-backdrop"
			type="button"
			onclick={() => (isTambahKesehatanOpen = false)}
			aria-label="Tutup tambah data kesehatan"
		>
			Tutup
		</button>
	</div>
{/if}
{#if isRiwayatPertumbuhanOpen}
	<div class="modal modal-open" role="dialog" aria-modal="true">
		<div class="modal-box max-h-[92vh] w-11/12 max-w-6xl overflow-y-auto rounded-lg">
			<div class="mb-4 flex items-center justify-between gap-3">
				<h3 class="flex items-center gap-2 text-xl font-bold">
					<Icon name="calendar" />
					Riwayat Pertumbuhan
				</h3>
				<button
					class="btn btn-ghost btn-sm btn-circle"
					type="button"
					onclick={() => (isRiwayatPertumbuhanOpen = false)}
					aria-label="Tutup riwayat pertumbuhan"
				>
					<Icon name="close" />
				</button>
			</div>

			<div class="border-base-300 overflow-x-auto border">
				<table class="table-zebra table-sm table">
					<thead>
						<tr>
							<th>Tanggal Pengukuran</th>
							<th>Usia</th>
							<th class="text-center">Tinggi Badan</th>
							<th class="text-center">Berat Badan</th>
							<th>Status Gizi</th>
							<th>Kondisi Fisik</th>
							<th class="text-right">Aksi</th>
						</tr>
					</thead>
					<tbody>
						{#each kesehatanRiwayat as item (item.id)}
							<tr>
								<td>
									<div class="flex items-center gap-2">
										<Icon name="calendar" />
										{formatTanggal(item.tanggalPengukuran)}
									</div>
								</td>
								<td>{formatUsiaPada(item.tanggalPengukuran)}</td>
								<td class="text-center font-semibold">{formatTinggi(item.tinggiBadan)}</td>
								<td class="text-center font-semibold">{formatBerat(item.beratBadan)}</td>
								<td>{formatStatusGizi(item.statusGizi)}</td>
								<td>{item.kondisiFisik || '-'}</td>
								<td class="text-right">
									{#if canEditData}
										<FormEnhance action="?/delete-kesehatan" onsuccess={handleKesehatanDeleted}>
											{#snippet children({ submitting })}
												<input type="hidden" name="id" value={item.id} />
												<button
													class="btn btn-error btn-xs shadow-none"
													type="submit"
													disabled={submitting}
												>
													<Icon name="del" />
													{submitting ? 'Menghapus...' : 'Hapus'}
												</button>
											{/snippet}
										</FormEnhance>
									{:else}
										<span class="text-base-content/40 text-xs">-</span>
									{/if}
								</td>
							</tr>
						{:else}
							<tr>
								<td colspan="7" class="py-8 text-center text-base-content/60">
									Belum ada catatan pertumbuhan.
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<div class="border-base-300 text-base-content/60 mt-5 border-t pt-4 text-center">
				Total {kesehatanRiwayat.length} catatan pertumbuhan
			</div>
		</div>
		<button
			class="modal-backdrop"
			type="button"
			onclick={() => (isRiwayatPertumbuhanOpen = false)}
			aria-label="Tutup riwayat pertumbuhan"
		>
			Tutup
		</button>
	</div>
{/if}

<!-- Upload Foto Modal -->
<MuridPhotoUploadModal
	bind:isOpen={isUploadModalOpen}
	muridId={data.murid?.id}
	muridNama={data.murid?.nama}
	onSuccess={handleUploadSuccess}
/>
