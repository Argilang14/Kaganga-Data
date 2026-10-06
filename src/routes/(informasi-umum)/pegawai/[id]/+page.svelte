<script lang="ts">
	import Icon from '$lib/components/icon.svelte';

	type PegawaiRow = {
		id: number;
		nama: string;
		nip: string;
		jenis: string;
		jabatan: string | null;
		status: string;
		telepon: string | null;
		email: string | null;
		catatan: string | null;
		createdAt: string;
		updatedAt: string | null;
	};

	type DetailData = {
		pegawai: PegawaiRow;
		penugasan: {
			kepalaSekolah: string[];
			kelas: Array<{ id: number; nama: string; peran: string[] }>;
			mapel: Array<{
				id: number;
				kode: string;
				nama: string;
				jenjang: string;
				kategori: string;
				aktif: boolean;
			}>;
			jumlahJadwal: number;
		};
		akun: Array<{
			id: number;
			username: string;
			type: string;
			createdAt: string;
			passwordUpdatedAt: string | null;
		}>;
	};

	let {
		data,
		onEdit
	}: {
		data: DetailData;
		onEdit?: (pegawai: PegawaiRow) => void;
	} = $props();

	const jenisLabels: Record<string, string> = {
		guru: 'Guru',
		kepala_sekolah: 'Kepala Sekolah',
		operator: 'Operator',
		tu: 'TU',
		kebersihan: 'Kebersihan',
		keamanan: 'Keamanan',
		wali_asuh: 'Wali Asuh',
		wali_asrama: 'Wali Asrama',
		tim_dapur: 'Tim Dapur',
		lainnya: 'Lainnya'
	};

	const roleLabels: Record<string, string> = {
		admin: 'Administrator',
		wali_kelas: 'Wali Kelas',
		wali_asuh: 'Wali Asuh',
		wali_asrama: 'Wali Asrama',
		tim_dapur: 'Tim Dapur',
		user: 'Guru/User'
	};

	function formatDate(value: string | null | undefined) {
		if (!value) return '-';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		return new Intl.DateTimeFormat('id-ID', {
			day: '2-digit',
			month: 'long',
			year: 'numeric'
		}).format(date);
	}
</script>

{#snippet field(label: string, value: string | number | null | undefined)}
	<div class="min-w-0">
		<p class="text-base-content/55 text-xs font-medium">{label}</p>
		<p class="mt-1 break-words text-sm font-semibold">{value || '-'}</p>
	</div>
{/snippet}

<div class="flex items-start justify-between gap-4">
	<div class="min-w-0">
		<h2 class="truncate text-xl font-bold">Informasi Pegawai</h2>
		<p class="text-base-content/65 mt-1 truncate text-sm">{data.pegawai.nama}</p>
	</div>
	<span class="badge badge-soft shrink-0">Baca-saja</span>
</div>

<div class="mt-5 max-h-[65vh] overflow-y-auto">
	<div class="tabs tabs-box w-full">
		<input type="radio" name="tab-detail-pegawai" class="tab" aria-label="Data Pegawai" checked />
		<div class="tab-content bg-base-100 p-4">
			<div class="grid gap-4 sm:grid-cols-2">
				{@render field('Nama', data.pegawai.nama)}
				{@render field('NIP', data.pegawai.nip)}
				{@render field('Jenis Pegawai', jenisLabels[data.pegawai.jenis] ?? data.pegawai.jenis)}
				{@render field('Jabatan', data.pegawai.jabatan)}
				{@render field('Status', data.pegawai.status === 'aktif' ? 'Aktif' : 'Nonaktif')}
				{@render field('Terdaftar Sejak', formatDate(data.pegawai.createdAt))}
			</div>
		</div>

		<input type="radio" name="tab-detail-pegawai" class="tab" aria-label="Kontak" />
		<div class="tab-content bg-base-100 p-4">
			<div class="grid gap-4 sm:grid-cols-2">
				{@render field('Nomor Telepon', data.pegawai.telepon)}
				{@render field('Email', data.pegawai.email)}
			</div>
		</div>

		<input type="radio" name="tab-detail-pegawai" class="tab" aria-label="Penugasan" />
		<div class="tab-content bg-base-100 p-4">
			<div class="space-y-5">
				<section>
					<h3 class="text-sm font-bold">Jabatan Sekolah</h3>
					{#if data.penugasan.kepalaSekolah.length}
						<ul class="mt-2 space-y-1 text-sm">
							{#each data.penugasan.kepalaSekolah as sekolah}
								<li>Kepala Sekolah - {sekolah}</li>
							{/each}
						</ul>
					{:else}
						<p class="text-base-content/55 mt-2 text-sm">Tidak ada penugasan kepala sekolah.</p>
					{/if}
				</section>

				<section>
					<h3 class="text-sm font-bold">Kelas</h3>
					{#if data.penugasan.kelas.length}
						<div class="mt-2 overflow-x-auto">
							<table class="table-sm table">
								<thead><tr><th>Kelas</th><th>Peran</th></tr></thead>
								<tbody>
									{#each data.penugasan.kelas as kelas (kelas.id)}
										<tr><td>{kelas.nama}</td><td>{kelas.peran.join(', ')}</td></tr>
									{/each}
								</tbody>
							</table>
						</div>
					{:else}
						<p class="text-base-content/55 mt-2 text-sm">Tidak ada penugasan kelas.</p>
					{/if}
				</section>

				<section>
					<div class="flex items-center justify-between gap-3">
						<h3 class="text-sm font-bold">Mata Pelajaran</h3>
						<span class="badge badge-soft">{data.penugasan.jumlahJadwal} slot jadwal</span>
					</div>
					{#if data.penugasan.mapel.length}
						<div class="mt-2 overflow-x-auto">
							<table class="table-sm table">
								<thead><tr><th>Kode</th><th>Mata Pelajaran</th><th>Jenjang</th></tr></thead>
								<tbody>
									{#each data.penugasan.mapel as mapel (mapel.id)}
										<tr class:opacity-50={!mapel.aktif}>
											<td class="font-semibold">{mapel.kode}</td>
											<td>{mapel.nama}</td>
											<td class="uppercase">{mapel.jenjang}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{:else}
						<p class="text-base-content/55 mt-2 text-sm">Tidak ada penugasan mata pelajaran.</p>
					{/if}
				</section>
			</div>
		</div>

		<input type="radio" name="tab-detail-pegawai" class="tab" aria-label="Akun Sistem" />
		<div class="tab-content bg-base-100 p-4">
			{#if data.akun.length}
				<div class="overflow-x-auto">
					<table class="table-sm table">
						<thead><tr><th>Username</th><th>Role</th><th>Dibuat</th></tr></thead>
						<tbody>
							{#each data.akun as akun (akun.id)}
								<tr>
									<td class="font-semibold">{akun.username}</td>
									<td>{roleLabels[akun.type] ?? akun.type}</td>
									<td>{formatDate(akun.createdAt)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<p class="text-base-content/55 mt-3 text-xs">
					Perubahan username, role, dan password tetap dilakukan melalui Manajemen Pengguna.
				</p>
			{:else}
				<p class="text-base-content/55 text-sm">Pegawai ini belum terhubung dengan akun pengguna.</p>
			{/if}
		</div>

		<input type="radio" name="tab-detail-pegawai" class="tab" aria-label="Catatan" />
		<div class="tab-content bg-base-100 p-4">
			<div class="space-y-4">
				{@render field('Catatan', data.pegawai.catatan)}
				{@render field('Terakhir Diperbarui', formatDate(data.pegawai.updatedAt))}
			</div>
		</div>
	</div>
</div>

<div class="mt-5 flex items-center justify-end gap-2">
	<button class="btn btn-soft" type="button" onclick={() => history.back()}>
		<Icon name="close" />
		Tutup
	</button>
	{#if onEdit}
		<button class="btn btn-primary" type="button" onclick={() => onEdit?.(data.pegawai)}>
			<Icon name="edit" />
			Edit
		</button>
	{/if}
</div>
