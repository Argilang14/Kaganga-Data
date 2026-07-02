<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/icon.svelte';

	type Kegiatan = {
		id: number;
		kode: string;
		nama: string;
		kategori: 'sekolah' | 'asrama' | 'makan' | 'sholat';
		jamMulai: string | null;
		batasTerlambat: string | null;
		jamSelesai: string | null;
		autoAlfa: boolean;
		masukRapor: boolean;
		aktif: boolean;
		aksesEdit: string;
	};

	type PageData = {
		kegiatanList: Kegiatan[];
		kategoriLabels: Record<Kegiatan['kategori'], string>;
	};

	let { data }: { data: PageData } = $props();

	function kategoriBadge(kategori: Kegiatan['kategori']) {
		if (kategori === 'sekolah') return 'badge-primary';
		if (kategori === 'asrama') return 'badge-secondary';
		if (kategori === 'makan') return 'badge-accent';
		return 'badge-info';
	}
</script>

<div class="space-y-4">
	<div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h2 class="text-2xl font-bold">Pengaturan Kegiatan</h2>
			<p class="text-base-content/70 text-sm">
				Atur kegiatan absensi, jam kegiatan, batas terlambat, dan auto alfa.
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<a class="btn btn-soft btn-sm shadow-none" href={resolve('/administrasi/absensi/kegiatan')}>
				<Icon name="activity" />
				Absensi Kegiatan
			</a>
			<a
				class="btn btn-soft btn-sm shadow-none"
				href={resolve('/administrasi/absensi/kegiatan/rekap')}
			>
				<Icon name="table" />
				Rekap Kegiatan
			</a>
		</div>
	</div>

	<div class="grid gap-4 xl:grid-cols-2">
		{#each data.kegiatanList as kegiatan (kegiatan.id)}
			<form
				method="POST"
				action="?/updateKegiatan"
				class="card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm"
			>
				<input type="hidden" name="kegiatanId" value={kegiatan.id} />
				<div class="mb-3 flex flex-wrap items-start justify-between gap-2">
					<div>
						<div class="flex flex-wrap items-center gap-2">
							<div class={`badge ${kategoriBadge(kegiatan.kategori)} badge-outline`}>
								{data.kategoriLabels[kegiatan.kategori]}
							</div>
							{#if kegiatan.masukRapor}
								<div class="badge badge-success badge-outline">Masuk rapor</div>
							{/if}
							<div class="badge badge-ghost">{kegiatan.aksesEdit}</div>
						</div>
						<p class="text-base-content/60 mt-1 text-xs">{kegiatan.kode}</p>
					</div>
					<button class="btn btn-primary btn-sm shadow-none" type="submit">
						<Icon name="save" />
						Simpan
					</button>
				</div>

				<div class="grid gap-3 sm:grid-cols-2">
					<label class="form-control sm:col-span-2">
						<span class="label-text mb-1">Nama Kegiatan</span>
						<input
							class="input input-bordered"
							name="nama"
							value={kegiatan.nama}
							placeholder="Nama kegiatan"
							required
						/>
					</label>
					<label class="form-control">
						<span class="label-text mb-1">Jam Mulai</span>
						<input
							class="input input-bordered"
							type="time"
							name="jamMulai"
							value={kegiatan.jamMulai ?? ''}
						/>
					</label>
					<label class="form-control">
						<span class="label-text mb-1">Batas Terlambat</span>
						<input
							class="input input-bordered"
							type="time"
							name="batasTerlambat"
							value={kegiatan.batasTerlambat ?? ''}
						/>
					</label>
					<label class="form-control">
						<span class="label-text mb-1">Jam Selesai</span>
						<input
							class="input input-bordered"
							type="time"
							name="jamSelesai"
							value={kegiatan.jamSelesai ?? ''}
						/>
					</label>
					<div class="flex flex-wrap items-end gap-4">
						<label class="label cursor-pointer justify-start gap-2">
							<input
								class="toggle toggle-primary"
								type="checkbox"
								name="autoAlfa"
								checked={kegiatan.autoAlfa}
							/>
							<span class="label-text">Auto alfa</span>
						</label>
						<label class="label cursor-pointer justify-start gap-2">
							<input
								class="toggle toggle-success"
								type="checkbox"
								name="aktif"
								checked={kegiatan.aktif}
							/>
							<span class="label-text">Aktif</span>
						</label>
					</div>
				</div>
			</form>
		{/each}
	</div>
</div>
