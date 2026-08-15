<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/icon.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import PendidikanPegawaiSection from './PendidikanPegawai.svelte';
	import DokumenPegawaiSection from './DokumenPegawai.svelte';
	import type { DokumenPegawai, PendidikanPegawai, SertifikasiPegawai } from './types';
	import PegawaiPhotoUploadModal from './PegawaiPhotoUploadModal.svelte';

	type Assignment = {
		id: number;
		tahunAjaranId: number | null;
		tahunAjaran: string | null;
		jenis: string;
		namaJabatan: string | null;
		jenjang: string | null;
		unit: string | null;
		kelasId: number | null;
		kelas: string | null;
		mataPelajaranId: number | null;
		mataPelajaran: string | null;
		tanggalMulai: string | null;
		tanggalSelesai: string | null;
		status: string;
		catatan: string | null;
	};

	type Pegawai = Record<string, unknown> & {
		id: number;
		nama: string;
		nip: string;
		nik: string | null;
		nuptk: string | null;
		jenis: string;
		jabatan: string | null;
		status: string;
		jenisKelamin: string | null;
		tempatLahir: string | null;
		tanggalLahir: string | null;
		agama: string | null;
		statusPerkawinan: string | null;
		telepon: string | null;
		email: string | null;
		alamat: string | null;
		desa: string | null;
		kecamatan: string | null;
		kabupaten: string | null;
		provinsi: string | null;
		kodePos: string | null;
		kontakDaruratNama: string | null;
		kontakDaruratHubungan: string | null;
		kontakDaruratTelepon: string | null;
		statusKepegawaian: string | null;
		tanggalMulaiKerja: string | null;
		unitPenempatan: string | null;
		pangkatGolongan: string | null;
		nomorSk: string | null;
		tanggalSk: string | null;
		foto: string | null;
		catatan: string | null;
		createdAt: string;
		updatedAt: string | null;
	};

	type DetailData = {
		pegawai: Pegawai;
		penugasan: {
			kepalaSekolah: string[];
			kelas: Array<{ id: number; nama: string; peran: string[] }>;
			mapel: Array<{ id: number; kode: string; nama: string; jenjang: string; aktif: boolean }>;
			jumlahJadwal: number;
			riwayat: Assignment[];
		};
		pendidikan: PendidikanPegawai[];
		sertifikasi: SertifikasiPegawai[];
		dokumen: DokumenPegawai[];
		riwayat: Array<Record<string, unknown> & { id: number }>;
		akun: Array<{ id: number; username: string; type: string; createdAt: string }>;
		options: {
			jenisPenugasan: string[];
			tahunAjaran: Array<{ id: number; nama: string; isAktif: boolean }>;
			kelas: Array<{ id: number; nama: string; tahunAjaranId: number }>;
			mataPelajaran: Array<{ id: number; kode: string | null; nama: string; kelas: string }>;
		};
	};

	let {
		data,
		onEdit,
		onClose
	}: {
		data: DetailData;
		onEdit?: (pegawai: Pegawai) => void;
		onClose?: () => void;
	} = $props();

	let editingAssignment = $state<Assignment | null>(null);
	let photoVersion = $state(Date.now());
	let isPhotoUploadOpen = $state(false);
	let deletingPhoto = $state(false);
	let activeTab = $state('data');
	const photoSrc = $derived(
		data.pegawai.foto ? `/api/pegawai-photo/${data.pegawai.id}?v=${photoVersion}` : null
	);

	const jenisLabels: Record<string, string> = {
		guru: 'Guru',
		kepala_sekolah: 'Kepala Sekolah',
		operator: 'Operator',
		tu: 'TU',
		kebersihan: 'Kebersihan',
		keamanan: 'Keamanan',
		wali_asuh: 'Wali Asuh',
		wali_asrama: 'Wali Asrama',
		lainnya: 'Lainnya'
	};
	const assignmentLabels: Record<string, string> = {
		kepala_sekolah: 'Kepala Sekolah',
		wakil_kepala: 'Wakil Kepala',
		wali_kelas: 'Wali Kelas',
		guru_mapel: 'Guru Mata Pelajaran',
		staf: 'Staf',
		wali_asuh: 'Wali Asuh',
		wali_asrama: 'Wali Asrama',
		lainnya: 'Lainnya'
	};
	const roleLabels: Record<string, string> = {
		admin: 'Administrator',
		wali_kelas: 'Wali Kelas',
		wali_asuh: 'Wali Asuh',
		wali_asrama: 'Wali Asrama',
		user: 'Guru/User'
	};

	function formatDate(value: unknown) {
		if (!value || typeof value !== 'string') return '-';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		return new Intl.DateTimeFormat('id-ID', {
			day: '2-digit',
			month: 'long',
			year: 'numeric'
		}).format(date);
	}

	function formText(formData: FormData, name: string) {
		return formData.get(name)?.toString().trim() || null;
	}

	function formId(formData: FormData, name: string) {
		const value = Number(formData.get(name));
		return Number.isInteger(value) && value > 0 ? value : null;
	}

	const saveAssignment: SubmitFunction = ({ formData }) => {
		const snapshot = new FormData();
		for (const [key, value] of formData.entries()) snapshot.append(key, value);
		return async ({ result, formElement }) => {
			if (result.type !== 'success') {
				const message = result.type === 'failure' ? String(result.data?.fail ?? '') : '';
				toast({ message: message || 'Penugasan gagal disimpan.', type: 'error' });
				return;
			}
			const savedId = Number(result.data?.savedId);
			const tahunAjaranId = formId(snapshot, 'tahunAjaranId');
			const kelasId = formId(snapshot, 'kelasId');
			const mataPelajaranId = formId(snapshot, 'mataPelajaranId');
			const saved: Assignment = {
				id: savedId,
				tahunAjaranId,
				tahunAjaran:
					data.options.tahunAjaran.find((item) => item.id === tahunAjaranId)?.nama ?? null,
				jenis: formText(snapshot, 'jenis') ?? 'lainnya',
				namaJabatan: formText(snapshot, 'namaJabatan'),
				jenjang: formText(snapshot, 'jenjang'),
				unit: formText(snapshot, 'unit'),
				kelasId,
				kelas: data.options.kelas.find((item) => item.id === kelasId)?.nama ?? null,
				mataPelajaranId,
				mataPelajaran:
					data.options.mataPelajaran.find((item) => item.id === mataPelajaranId)?.nama ?? null,
				tanggalMulai: formText(snapshot, 'tanggalMulai'),
				tanggalSelesai: formText(snapshot, 'tanggalSelesai'),
				status: formText(snapshot, 'status') ?? 'aktif',
				catatan: formText(snapshot, 'catatan')
			};
			const index = data.penugasan.riwayat.findIndex((item) => item.id === savedId);
			const riwayat = [...data.penugasan.riwayat];
			if (index >= 0) riwayat[index] = saved;
			else riwayat.unshift(saved);
			data = { ...data, penugasan: { ...data.penugasan, riwayat } };
			editingAssignment = null;
			formElement.reset();
			toast({
				message: String(result.data?.message ?? 'Penugasan berhasil disimpan.'),
				type: 'success'
			});
		};
	};

	const deleteAssignment: SubmitFunction = () => {
		return async ({ result }) => {
			if (result.type !== 'success') {
				toast({ message: 'Penugasan gagal dihapus.', type: 'error' });
				return;
			}
			const deletedId = Number(result.data?.deletedId);
			data = {
				...data,
				penugasan: {
					...data.penugasan,
					riwayat: data.penugasan.riwayat.filter((item) => item.id !== deletedId)
				}
			};
			if (editingAssignment?.id === deletedId) editingAssignment = null;
			toast({ message: 'Penugasan berhasil dihapus.', type: 'success' });
		};
	};

	function handlePhotoUploaded(filename: string) {
		data = { ...data, pegawai: { ...data.pegawai, foto: filename } };
		photoVersion = Date.now();
	}

	async function deletePhoto() {
		if (!photoSrc || !confirm('Hapus foto pegawai ini?')) return;
		deletingPhoto = true;
		try {
			const response = await fetch(`/api/pegawai-photo/${data.pegawai.id}`, { method: 'DELETE' });
			const result = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(result.message || 'Foto gagal dihapus.');
			data = { ...data, pegawai: { ...data.pegawai, foto: null } };
			toast({ message: 'Foto pegawai berhasil dihapus.', type: 'success' });
		} catch (error) {
			toast({
				message: error instanceof Error ? error.message : 'Foto gagal dihapus.',
				type: 'error'
			});
		} finally {
			deletingPhoto = false;
		}
	}
</script>

{#snippet field(label: string, value: unknown)}
	<div class="min-w-0">
		<p class="text-base-content/55 text-xs font-medium">{label}</p>
		<p class="mt-1 break-words text-sm font-semibold">{value || '-'}</p>
	</div>
{/snippet}

<div class="flex items-start justify-between gap-4">
	<div class="min-w-0">
		<h2 class="truncate text-xl font-bold">Detail Data Pegawai</h2>
		<p class="text-base-content/65 mt-1 truncate text-sm">{data.pegawai.nama}</p>
	</div>
	<span class:badge-success={data.pegawai.status === 'aktif'} class="badge badge-soft shrink-0">
		{data.pegawai.status === 'aktif' ? 'Aktif' : 'Nonaktif'}
	</span>
</div>

<div class="mt-5 max-h-[72vh] overflow-y-auto">
	<div class="tabs tabs-box w-full">
		<input type="radio" name="tab-detail-pegawai-v2" class="tab" aria-label="Data Pegawai" value="data" bind:group={activeTab} />
		<div class="tab-content bg-base-100 p-4">
			{#if activeTab === 'data'}
			<div class="grid gap-5 md:grid-cols-[180px_1fr]">
				<div>
					<div
						class="bg-base-200 flex aspect-3/4 items-center justify-center overflow-hidden rounded-md"
					>
						{#if photoSrc}
							<img
								src={photoSrc}
								alt="Foto {data.pegawai.nama}"
								loading="lazy"
								decoding="async"
								class="h-full w-full object-cover"
							/>
						{:else}
							<div class="text-base-content/50 text-center">
								<Icon name="user" class="mx-auto text-5xl" />
								<p class="mt-2 text-xs">Foto belum tersedia</p>
							</div>
						{/if}
					</div>
					<div class="mt-2 grid grid-cols-2 gap-2">
						<button
							class="btn btn-soft btn-sm"
							type="button"
							onclick={() => (isPhotoUploadOpen = true)}><Icon name="edit" /> Ubah</button
						>
						<button
							class="btn btn-error btn-soft btn-sm"
							type="button"
							disabled={!photoSrc || deletingPhoto}
							onclick={deletePhoto}><Icon name="del" /> Hapus</button
						>
					</div>
					<p class="text-base-content/50 mt-2 text-center text-xs">JPG/PNG, maksimal 500 KB</p>
				</div>
				<div class="grid content-start gap-4 sm:grid-cols-2">
					{@render field('Nama Lengkap', data.pegawai.nama)}
					{@render field('NIP', data.pegawai.nip)}
					{@render field('NIK', data.pegawai.nik)}
					{@render field('NUPTK', data.pegawai.nuptk)}
					{@render field('Jenis Kelamin', data.pegawai.jenisKelamin)}
					{@render field('Tempat Lahir', data.pegawai.tempatLahir)}
					{@render field('Tanggal Lahir', formatDate(data.pegawai.tanggalLahir))}
					{@render field('Agama', data.pegawai.agama)}
					{@render field('Status Perkawinan', data.pegawai.statusPerkawinan)}
					{@render field('Terdaftar Sejak', formatDate(data.pegawai.createdAt))}
				</div>
			</div>
			{/if}
		</div>

		<input type="radio" name="tab-detail-pegawai-v2" class="tab" aria-label="Kontak & Alamat" value="kontak" bind:group={activeTab} />
		<div class="tab-content bg-base-100 p-4">
			{#if activeTab === 'kontak'}
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{@render field('Telepon', data.pegawai.telepon)}
				{@render field('Email', data.pegawai.email)}
				{@render field('Alamat', data.pegawai.alamat)}
				{@render field('Desa/Kelurahan', data.pegawai.desa)}
				{@render field('Kecamatan', data.pegawai.kecamatan)}
				{@render field('Kabupaten/Kota', data.pegawai.kabupaten)}
				{@render field('Provinsi', data.pegawai.provinsi)}
				{@render field('Kode Pos', data.pegawai.kodePos)}
				{@render field('Kontak Darurat', data.pegawai.kontakDaruratNama)}
				{@render field('Hubungan', data.pegawai.kontakDaruratHubungan)}
				{@render field('Telepon Darurat', data.pegawai.kontakDaruratTelepon)}
			</div>
			{/if}
		</div>

		<input type="radio" name="tab-detail-pegawai-v2" class="tab" aria-label="Kepegawaian" value="kepegawaian" bind:group={activeTab} />
		<div class="tab-content bg-base-100 p-4">
			{#if activeTab === 'kepegawaian'}
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{@render field('Jenis Pegawai', jenisLabels[data.pegawai.jenis] ?? data.pegawai.jenis)}
				{@render field('Status Kepegawaian', data.pegawai.statusKepegawaian)}
				{@render field('Jabatan Ringkas', data.pegawai.jabatan)}
				{@render field('Tanggal Mulai Kerja', formatDate(data.pegawai.tanggalMulaiKerja))}
				{@render field('Unit Penempatan', data.pegawai.unitPenempatan)}
				{@render field('Pangkat/Golongan', data.pegawai.pangkatGolongan)}
				{@render field('Nomor SK', data.pegawai.nomorSk)}
				{@render field('Tanggal SK', formatDate(data.pegawai.tanggalSk))}
				{@render field('Status Data', data.pegawai.status === 'aktif' ? 'Aktif' : 'Nonaktif')}
			</div>
			<div class="mt-5">{@render field('Catatan', data.pegawai.catatan)}</div>
			{/if}
		</div>

		<input type="radio" name="tab-detail-pegawai-v2" class="tab" aria-label="Penugasan" value="penugasan" bind:group={activeTab} />
		<div class="tab-content bg-base-100 p-4">
			{#if activeTab === 'penugasan'}
			<div class="alert alert-info alert-soft mb-4 text-sm">
				<Icon name="info" /><span
					>Riwayat penugasan tidak mengubah role akun, wali kelas aktif, atau kepala sekolah aktif.</span
				>
			</div>
			<form
				method="POST"
				action={`/pegawai/${data.pegawai.id}?/savePenugasan`}
				use:enhance={saveAssignment}
				class="border-base-200 rounded-md border p-4"
			>
				<input type="hidden" name="id" value={editingAssignment?.id ?? ''} />
				<div class="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
					<label class="form-control gap-1"
						><span class="label-text">Jenis Penugasan</span><select
							class="select select-bordered w-full"
							name="jenis"
							required
							>{#each data.options.jenisPenugasan as jenis}<option
									value={jenis}
									selected={editingAssignment?.jenis === jenis}
									>{assignmentLabels[jenis] ?? jenis}</option
								>{/each}</select
						></label
					>
					<label class="form-control gap-1"
						><span class="label-text">Nama Jabatan</span><input
							class="input input-bordered w-full"
							name="namaJabatan"
							value={editingAssignment?.namaJabatan ?? ''}
							placeholder="Contoh: Waka Kurikulum"
						/></label
					>
					<label class="form-control gap-1"
						><span class="label-text">Tahun Ajaran</span><select
							class="select select-bordered w-full"
							name="tahunAjaranId"
							><option value="">Tidak ditentukan</option
							>{#each data.options.tahunAjaran as tahun}<option
									value={tahun.id}
									selected={editingAssignment?.tahunAjaranId === tahun.id}
									>{tahun.nama}{tahun.isAktif ? ' - Aktif' : ''}</option
								>{/each}</select
						></label
					>
					<label class="form-control gap-1"
						><span class="label-text">Status</span><select
							class="select select-bordered w-full"
							name="status"
							><option value="aktif" selected={editingAssignment?.status !== 'selesai'}
								>Aktif</option
							><option value="selesai" selected={editingAssignment?.status === 'selesai'}
								>Selesai</option
							></select
						></label
					>
					<label class="form-control gap-1"
						><span class="label-text">Jenjang</span><select
							class="select select-bordered w-full"
							name="jenjang"
							><option value="">Semua/Tidak ditentukan</option
							>{#each ['srd', 'srmp', 'srma'] as jenjang}<option
									value={jenjang}
									selected={editingAssignment?.jenjang === jenjang}>{jenjang.toUpperCase()}</option
								>{/each}</select
						></label
					>
					<label class="form-control gap-1"
						><span class="label-text">Unit</span><input
							class="input input-bordered w-full"
							name="unit"
							value={editingAssignment?.unit ?? ''}
							placeholder="Contoh: Kurikulum"
						/></label
					>
					<label class="form-control gap-1"
						><span class="label-text">Kelas</span><select
							class="select select-bordered w-full"
							name="kelasId"
							><option value="">Tanpa kelas</option>{#each data.options.kelas as kelas}<option
									value={kelas.id}
									selected={editingAssignment?.kelasId === kelas.id}>{kelas.nama}</option
								>{/each}</select
						></label
					>
					<label class="form-control gap-1"
						><span class="label-text">Mata Pelajaran</span><select
							class="select select-bordered w-full"
							name="mataPelajaranId"
							><option value="">Tanpa mata pelajaran</option
							>{#each data.options.mataPelajaran as mapel}<option
									value={mapel.id}
									selected={editingAssignment?.mataPelajaranId === mapel.id}
									>{mapel.kode ? `${mapel.kode} - ` : ''}{mapel.nama} ({mapel.kelas})</option
								>{/each}</select
						></label
					>
					<label class="form-control gap-1"
						><span class="label-text">Mulai</span><input
							class="input input-bordered w-full"
							type="date"
							name="tanggalMulai"
							value={editingAssignment?.tanggalMulai ?? ''}
						/></label
					>
					<label class="form-control gap-1"
						><span class="label-text">Selesai</span><input
							class="input input-bordered w-full"
							type="date"
							name="tanggalSelesai"
							value={editingAssignment?.tanggalSelesai ?? ''}
						/></label
					>
					<label class="form-control gap-1 md:col-span-2"
						><span class="label-text">Catatan</span><input
							class="input input-bordered w-full"
							name="catatan"
							value={editingAssignment?.catatan ?? ''}
						/></label
					>
				</div>
				<div class="mt-3 flex justify-end gap-2">
					<button class="btn btn-primary btn-sm" type="submit"
						><Icon name="save" /> {editingAssignment ? 'Perbarui' : 'Tambah'} Penugasan</button
					>{#if editingAssignment}<button
							class="btn btn-soft btn-sm"
							type="button"
							onclick={() => (editingAssignment = null)}>Batal Edit</button
						>{/if}
				</div>
			</form>

			<div class="mt-4 overflow-x-auto">
				<table class="table-sm table min-w-[820px]">
					<thead
						><tr
							><th>Penugasan</th><th>Tahun/Unit</th><th>Kelas/Mapel</th><th>Periode</th><th
								>Status</th
							><th>Aksi</th></tr
						></thead
					><tbody>
						{#each data.penugasan.riwayat as item (item.id)}<tr
								><td
									><b>{item.namaJabatan || assignmentLabels[item.jenis] || item.jenis}</b>
									<div class="text-base-content/55 text-xs">
										{assignmentLabels[item.jenis] || item.jenis}
									</div></td
								><td
									>{item.tahunAjaran || '-'}
									<div class="text-base-content/55 text-xs">
										{item.unit || item.jenjang?.toUpperCase() || '-'}
									</div></td
								><td
									>{item.kelas || '-'}
									<div class="text-base-content/55 text-xs">{item.mataPelajaran || '-'}</div></td
								><td>{formatDate(item.tanggalMulai)} - {formatDate(item.tanggalSelesai)}</td><td
									><span class:badge-success={item.status === 'aktif'} class="badge badge-soft"
										>{item.status}</span
									></td
								><td
									><div class="flex">
										<button
											class="btn btn-soft btn-sm rounded-r-none"
											type="button"
											title="Edit penugasan"
											onclick={() => (editingAssignment = item)}><Icon name="edit" /></button
										>
										<form
											method="POST"
											action={`/pegawai/${data.pegawai.id}?/deletePenugasan`}
											use:enhance={deleteAssignment}
											onsubmit={(event) => {
												if (!confirm('Hapus riwayat penugasan ini?')) event.preventDefault();
											}}
										>
											<input type="hidden" name="id" value={item.id} /><button
												class="btn btn-error btn-soft btn-sm rounded-l-none"
												type="submit"
												title="Hapus penugasan"><Icon name="del" /></button
											>
										</form>
									</div></td
								></tr
							>{:else}<tr
								><td colspan="6" class="text-base-content/55 py-6 text-center"
									>Belum ada riwayat penugasan.</td
								></tr
							>{/each}
					</tbody>
				</table>
			</div>
			{/if}
		</div>

		<input type="radio" name="tab-detail-pegawai-v2" class="tab" aria-label="Pendidikan" value="pendidikan" bind:group={activeTab} />
		<div class="tab-content bg-base-100 p-4">
			{#if activeTab === 'pendidikan'}
			<PendidikanPegawaiSection
				pegawaiId={data.pegawai.id}
				bind:pendidikan={data.pendidikan}
				bind:sertifikasi={data.sertifikasi}
				mode="pendidikan"
			/>
			{/if}
		</div>

		<input type="radio" name="tab-detail-pegawai-v2" class="tab" aria-label="Sertifikasi" value="sertifikasi" bind:group={activeTab} />
		<div class="tab-content bg-base-100 p-4">
			{#if activeTab === 'sertifikasi'}
			<PendidikanPegawaiSection
				pegawaiId={data.pegawai.id}
				bind:pendidikan={data.pendidikan}
				bind:sertifikasi={data.sertifikasi}
				mode="sertifikasi"
			/>
			{/if}
		</div>

		<input type="radio" name="tab-detail-pegawai-v2" class="tab" aria-label="Dokumen" value="dokumen" bind:group={activeTab} />
		<div class="tab-content bg-base-100 p-4">
			{#if activeTab === 'dokumen'}
			<DokumenPegawaiSection pegawaiId={data.pegawai.id} bind:dokumen={data.dokumen} />
			{/if}
		</div>

		<input type="radio" name="tab-detail-pegawai-v2" class="tab" aria-label="Riwayat" value="riwayat" bind:group={activeTab} />
		<div class="tab-content bg-base-100 p-4">
			{#if activeTab === 'riwayat'}
			<h3 class="font-bold">Akun Sistem</h3>
			{#if data.akun.length}<div class="mt-2 overflow-x-auto">
					<table class="table-sm table">
						<thead><tr><th>Username</th><th>Role</th><th>Dibuat</th></tr></thead><tbody
							>{#each data.akun as akun (akun.id)}<tr
									><td>{akun.username}</td><td>{roleLabels[akun.type] ?? akun.type}</td><td
										>{formatDate(akun.createdAt)}</td
									></tr
								>{/each}</tbody
						>
					</table>
				</div>{:else}<p class="text-base-content/55 mt-2 text-sm">
					Belum terhubung dengan akun pengguna.
				</p>{/if}
			<h3 class="mt-5 font-bold">Riwayat Perubahan</h3>
			{#if data.riwayat.length}<div class="mt-2 space-y-2">
					{#each data.riwayat as item (item.id)}<div class="border-base-200 rounded-md border p-3">
							<div class="flex justify-between gap-3">
								<b>{item.ringkasan || item.aksi}</b><span class="text-base-content/55 text-xs"
									>{formatDate(item.createdAt)}</span
								>
							</div>
							<p class="text-base-content/60 mt-1 text-xs">{item.bagian}</p>
						</div>{/each}
				</div>{:else}<p class="text-base-content/55 mt-2 text-sm">
					Belum ada riwayat perubahan tercatat.
				</p>{/if}
			{/if}
		</div>
	</div>
</div>

<PegawaiPhotoUploadModal
	bind:isOpen={isPhotoUploadOpen}
	pegawaiId={data.pegawai.id}
	pegawaiNama={data.pegawai.nama}
	onSuccess={handlePhotoUploaded}
/>

<div class="mt-5 flex justify-end gap-2">
	<button class="btn btn-soft" type="button" onclick={() => (onClose ? onClose() : history.back())}
		><Icon name="close" /> Tutup</button
	>
	{#if onEdit}<button class="btn btn-primary" type="button" onclick={() => onEdit?.(data.pegawai)}
			><Icon name="edit" /> Edit Biodata</button
		>{/if}
</div>
