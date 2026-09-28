<script lang="ts">
	import { resolve } from '$app/paths';
	import KartuPelajarAbsensiPreview from '$lib/components/absensi/KartuPelajarAbsensiPreview.svelte';
	import Icon from '$lib/components/icon.svelte';

	type CardPayload = {
		muridId: number;
		nama: string;
		nis: string;
		kelas: string;
		sekolah: string;
		logoUrl: string;
		qrDataUrl: string;
		issuedAt: string;
	};

	type PageData = {
		kelasId: number | null;
		kelasList: Array<{ id: number; nama: string; fase: string | null }>;
		sekolahNama: string;
		sekolahNaungan: string;
		sekolahAlamat: string;
		muridList: Array<{
			id: number;
			nama: string;
			nis: string;
			nisn: string;
			fotoUrl: string | null;
			tempatTanggalLahir: string;
			alamat: string;
			logoUrl: string;
			qr: {
				issuedAt: string;
				tokenVersion: number;
				previewable: boolean;
				qrDataUrl: string | null;
			} | null;
		}>;
	};

	let {
		data,
		form
	}: {
		data: PageData;
		form?: { cards?: CardPayload[]; fail?: string; preview?: boolean; skipped?: number };
	} = $props();

	const kelasLabel = $derived.by(() => {
		const kelas = data.kelasList.find((item) => item.id === data.kelasId);
		if (!kelas) return '-';
		return kelas.fase ? `${kelas.nama} - ${kelas.fase}` : kelas.nama;
	});

</script>

<div class="space-y-4">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<h2 class="text-2xl font-bold">Kartu Absensi Murid</h2>
			<p class="text-base-content/70 text-sm">
				Kartu mengikuti kelas aktif <strong>{kelasLabel}</strong> yang dipilih di bagian atas aplikasi.
			</p>
		</div>
		<a class="btn btn-soft btn-sm shadow-none" href={resolve('/administrasi/absensi')}>
			<Icon name="left" />
			Kembali
		</a>
	</div>

	<div class="card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm print:hidden">
		<div class="flex flex-col gap-3 sm:flex-row sm:justify-end">
			<form method="POST" action="?/previewClass">
				<input type="hidden" name="kelasId" value={data.kelasId ?? ''} />
				<input type="hidden" name="kelasLabel" value={kelasLabel} />
				<button class="btn btn-accent w-full shadow-none" type="submit" disabled={!data.kelasId}>
					<Icon name="eye" />
					Review Cetak Kelas
				</button>
			</form>
			<form method="POST" action="?/generateClass">
				<input type="hidden" name="kelasId" value={data.kelasId ?? ''} />
				<input type="hidden" name="kelasLabel" value={kelasLabel} />
				<button class="btn btn-primary w-full shadow-none" type="submit" disabled={!data.kelasId}>
					<Icon name="repeat" />
					Generate/Perbarui Massal
				</button>
			</form>
		</div>
		<p class="text-base-content/60 mt-3 text-xs">
			Gunakan Review Cetak untuk mencetak ulang kartu aktif tanpa membuat token baru. Generate hanya
			dipakai saat belum ada kartu atau ingin mengganti token QR.
		</p>
	</div>

	{#if form?.fail}
		<div class="alert alert-error print:hidden">
			<Icon name="error" />
			<span>{form.fail}</span>
		</div>
	{/if}

	{#if form?.cards?.length}
		<div class="card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm print:hidden">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div>
					<div class="font-semibold">
						{form.cards.length} kartu siap {form.preview ? 'direview dan dicetak' : 'dicetak'}
					</div>
					<div class="text-base-content/60 text-sm">
						{form.preview
							? 'Kartu diambil dari QR aktif tanpa generate token baru.'
							: 'Token baru dibuat. Setelah ini gunakan Review Cetak untuk cetak ulang.'}
						{form.skipped ? ` ${form.skipped} siswa belum memiliki QR yang bisa direview.` : ''}
					</div>
				</div>
				<a
					class="btn btn-accent shadow-none"
					href={`${resolve('/cetak')}?dokumen=kartu-absensi`}
				>
					<Icon name="print" />
					Buka Cetak Dokumen
				</a>
			</div>
		</div>
	{/if}

	<div class="card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm print:hidden">
		<h3 class="mb-3 font-semibold">Daftar Siswa</h3>
		{#if !data.muridList.length}
			<div class="alert alert-info">
				<Icon name="info" />
				<span>Belum ada siswa pada kelas ini.</span>
			</div>
		{:else}
			<div class="grid gap-5 xl:grid-cols-2">
				{#each data.muridList as murid (murid.id)}
					<div class="space-y-3">
						<KartuPelajarAbsensiPreview
							sekolahNama={data.sekolahNama}
							sekolahNaungan={data.sekolahNaungan}
							sekolahAlamat={data.sekolahAlamat}
							logoUrl={murid.logoUrl}
							muridNama={murid.nama}
							nisn={murid.nisn || murid.nis}
							tempatTanggalLahir={murid.tempatTanggalLahir}
							kelas={kelasLabel}
							alamat={murid.alamat}
							fotoUrl={murid.fotoUrl}
							qrDataUrl={murid.qr?.previewable ? murid.qr.qrDataUrl : null}
						/>

						<div class="mx-auto w-full max-w-[520px] space-y-2">
							<div class="min-w-0 text-left">
								{#if murid.qr}
									<div class="badge badge-success">Aktif v{murid.qr.tokenVersion}</div>
									{#if !murid.qr.previewable}
										<div class="text-warning mt-1 text-xs">
											Perlu generate ulang agar bisa direview.
										</div>
									{/if}
								{:else}
									<div class="badge badge-ghost">Belum ada QR</div>
								{/if}
							</div>
							<div class="grid grid-cols-3 gap-2">
								{#if murid.qr?.previewable}
									<form method="POST" action="?/previewOne">
										<input type="hidden" name="muridId" value={murid.id} />
										<input type="hidden" name="kelasId" value={data.kelasId ?? ''} />
										<input type="hidden" name="kelasLabel" value={kelasLabel} />
										<button class="btn btn-xs btn-accent w-full shadow-none" type="submit">
											<Icon name="eye" />
											Review
										</button>
									</form>
								{:else}
									<div></div>
								{/if}
								<a
									class="btn btn-xs btn-primary w-full shadow-none"
									href={`${resolve('/cetak')}?dokumen=kartu-absensi`}
								>
									<Icon name="print" />
									Cetak
								</a>
								<form method="POST" action="?/generateOne">
									<input type="hidden" name="muridId" value={murid.id} />
									<input type="hidden" name="kelasId" value={data.kelasId ?? ''} />
									<input type="hidden" name="kelasLabel" value={kelasLabel} />
									<button class="btn btn-xs btn-soft w-full shadow-none" type="submit">
										<Icon name="repeat" />
										{murid.qr ? 'Perbarui' : 'Generate'}
									</button>
								</form>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>

</div>
