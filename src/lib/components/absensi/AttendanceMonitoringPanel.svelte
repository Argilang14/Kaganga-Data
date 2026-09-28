<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';

	type Alert = {
		key: string;
		type: 'sakit_beruntun' | 'sakit_berulang' | 'alfa_berulang' | 'izin_pulang_terlambat';
		title: string;
		description: string;
		severity: 'warning' | 'error';
		muridId: number;
		nama: string;
		nis: string;
		kelasId: number;
		kelasNama: string;
		periodeMulai: string;
		periodeSelesai: string;
		duration: number;
		followUp: null | {
			id: number;
			status: 'baru' | 'diproses' | 'selesai';
			catatan: string | null;
			ditanganiPada: string | null;
		};
	};

	type Permit = {
		id: number;
		muridId: number | null;
		nama: string;
		kelasNama: string;
		tanggalKeluar: string;
		rencanaKembali: string;
		tanggalKembali: string | null;
		alasan: string;
		penjemputNama: string | null;
		status: 'sedang_izin' | 'sudah_kembali' | 'terlambat_kembali' | 'dibatalkan';
		duration: number;
	};

	let {
		alerts,
		permits,
		students,
		kelasId,
		today
	}: {
		alerts: Alert[];
		permits: Permit[];
		students: Array<{ id: number; nama: string; nis: string }>;
		kelasId: number | null;
		today: string;
	} = $props();
	let permitDialog: HTMLDialogElement;

	const activePermits = $derived(
		permits.filter(
			(item) => !item.tanggalKembali && ['sedang_izin', 'terlambat_kembali'].includes(item.status)
		)
	);
	const unresolvedAlerts = $derived(
		alerts.filter((item) => item.followUp?.status !== 'selesai').length
	);
	const dateLabel = (value: string | null) =>
		value ? new Date(`${value}T00:00:00`).toLocaleDateString('id-ID') : '-';
	const permitLabel = (status: Permit['status']) =>
		({
			sedang_izin: 'Sedang Izin',
			sudah_kembali: 'Sudah Kembali',
			terlambat_kembali: 'Terlambat Kembali',
			dibatalkan: 'Dibatalkan'
		})[status];
	const permitBadge = (status: Permit['status']) =>
		status === 'terlambat_kembali'
			? 'badge-error'
			: status === 'sedang_izin'
				? 'badge-warning'
				: status === 'sudah_kembali'
					? 'badge-success'
					: 'badge-ghost';
	const onSuccess = async () => {
		await invalidateAll();
	};
	const onPermitSuccess = async () => {
		permitDialog?.close();
		await invalidateAll();
	};
	const openPermitDialog = () => {
		if (!kelasId || !students.length) return;
		permitDialog.showModal();
	};
</script>

<section class="card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm">
	<div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
		<div>
			<div class="flex items-center gap-2">
				<Icon name="alert" />
				<h3 class="text-lg font-bold">Pemantauan Kehadiran</h3>
			</div>
			<p class="text-base-content/65 mt-1 text-sm">
				Satu murid dihitung satu kali per hari. Hari libur tidak menambah durasi.
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<span class="badge badge-warning badge-lg">{unresolvedAlerts} perlu ditinjau</span>
			<span class="badge badge-info badge-lg">{activePermits.length} sedang izin pulang</span>
		</div>
	</div>

	<div class="mt-4 grid gap-4 xl:grid-cols-[1.25fr_1fr]">
		<div class="border-base-200 rounded-lg border p-3">
			<div class="mb-3 flex items-center justify-between gap-2">
				<div>
					<h4 class="font-semibold">Murid Memerlukan Tindak Lanjut</h4>
					<p class="text-base-content/60 text-xs">Indikator untuk ditinjau, bukan keputusan otomatis.</p>
				</div>
				<span class="badge badge-soft">{alerts.length}</span>
			</div>
			<div class="space-y-2">
				{#each alerts as alert (alert.key)}
					<article
						class={`rounded-lg border p-3 ${
							alert.severity === 'error'
								? 'border-error bg-error/5'
								: 'border-warning bg-warning/5'
						} ${alert.followUp?.status === 'selesai' ? 'opacity-60' : ''}`}
					>
						<div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
							<div class="min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									<strong>{alert.nama}</strong>
									<span class="badge badge-sm">{alert.kelasNama}</span>
									{#if alert.followUp}
										<span class="badge badge-sm badge-success">{alert.followUp.status}</span>
									{/if}
								</div>
								<p class="mt-1 text-sm font-medium">{alert.title}</p>
								<p class="text-base-content/65 text-xs">{alert.description}</p>
								<p class="text-base-content/55 mt-1 text-xs">
									{dateLabel(alert.periodeMulai)}–{dateLabel(alert.periodeSelesai)} · {alert.duration} hari
								</p>
							</div>
							<details class="dropdown dropdown-end">
								<summary class="btn btn-soft btn-xs shadow-none">Tindak lanjut</summary>
								<div class="dropdown-content bg-base-100 border-base-300 z-10 mt-2 w-[min(88vw,22rem)] rounded-lg border p-3 shadow-lg">
									<FormEnhance action="?/saveFollowUp" showToast onsuccess={onSuccess}>
										<input type="hidden" name="muridId" value={alert.muridId} />
										<input type="hidden" name="kelasId" value={alert.kelasId} />
										<input type="hidden" name="jenis" value={alert.type} />
										<input type="hidden" name="periodeMulai" value={alert.periodeMulai} />
										<input type="hidden" name="periodeSelesai" value={alert.periodeSelesai} />
										<label class="form-control">
											<span class="label-text mb-1 text-xs">Status</span>
											<select class="select select-bordered select-sm" name="status" value={alert.followUp?.status ?? 'diproses'}>
												<option value="baru">Baru</option>
												<option value="diproses">Diproses</option>
												<option value="selesai">Selesai</option>
											</select>
										</label>
										<label class="form-control mt-2">
											<span class="label-text mb-1 text-xs">Catatan</span>
											<textarea class="textarea textarea-bordered textarea-sm" name="catatan" rows="3">{alert.followUp?.catatan ?? ''}</textarea>
										</label>
										<button class="btn btn-primary btn-sm mt-3 w-full shadow-none" type="submit">
											<Icon name="save" /> Simpan
										</button>
									</FormEnhance>
								</div>
							</details>
						</div>
					</article>
				{:else}
					<div class="text-base-content/60 rounded-lg border border-dashed p-4 text-center text-sm">
						Belum ada indikator sakit, alfa berulang, atau keterlambatan kembali.
					</div>
				{/each}
			</div>
		</div>

		<div class="border-base-200 rounded-lg border p-3">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<h4 class="font-semibold">Izin Pulang Murid</h4>
					<p class="text-base-content/60 text-xs">Catat keberangkatan dan rencana kembali murid.</p>
				</div>
				<button
					class="btn btn-primary btn-sm shrink-0 shadow-none"
					type="button"
					onclick={openPermitDialog}
					disabled={!kelasId || !students.length}
				>
					<Icon name="plus" /> Catat Izin Pulang
				</button>
			</div>

			<div class="mt-3 space-y-2">
				{#each permits as permit (permit.id)}
					<div class="border-base-200 rounded-lg border p-3">
						<div class="flex flex-wrap items-start justify-between gap-2">
							<div>
								<strong>{permit.nama}</strong>
								<p class="text-base-content/60 text-xs">{permit.alasan}</p>
							</div>
							<span class={`badge badge-sm ${permitBadge(permit.status)}`}>{permitLabel(permit.status)}</span>
						</div>
						<p class="text-base-content/60 mt-2 text-xs">
							Keluar {dateLabel(permit.tanggalKeluar)} · Rencana {dateLabel(permit.rencanaKembali)} · {permit.duration} hari sekolah
						</p>
						{#if !permit.tanggalKembali && ['sedang_izin', 'terlambat_kembali'].includes(permit.status)}
							<div class="mt-2 flex flex-wrap gap-2">
								<FormEnhance action="?/markIzinReturned" showToast onsuccess={onSuccess}>
									<input type="hidden" name="id" value={permit.id} />
									<input type="hidden" name="tanggalKembali" value={today} />
									<button class="btn btn-success btn-xs shadow-none" type="submit">
										<Icon name="check" /> Sudah Kembali
									</button>
								</FormEnhance>
								<FormEnhance action="?/cancelIzinPulang" showToast onsuccess={onSuccess}>
									<input type="hidden" name="id" value={permit.id} />
									<button class="btn btn-ghost btn-xs shadow-none" type="submit">Batalkan</button>
								</FormEnhance>
							</div>
						{/if}
					</div>
				{:else}
					<p class="text-base-content/60 rounded-lg border border-dashed p-3 text-center text-sm">
						Belum ada catatan izin pulang pada periode pemantauan.
					</p>
				{/each}
			</div>
		</div>
	</div>
</section>

<dialog class="modal" bind:this={permitDialog}>
	<div class="modal-box max-h-[90vh] max-w-3xl overflow-y-auto p-0">
		<div class="border-base-200 sticky top-0 z-10 border-b bg-base-100 px-5 py-4 sm:px-6">
			<div class="flex items-start justify-between gap-4">
				<div>
					<h3 class="text-xl font-bold">Catat Izin Pulang</h3>
					<p class="text-base-content/65 mt-1 text-sm">
						Lengkapi data murid, jadwal izin, dan informasi penjemput.
					</p>
				</div>
				<button
					class="btn btn-ghost btn-sm btn-square"
					type="button"
					title="Tutup"
					aria-label="Tutup formulir izin pulang"
					onclick={() => permitDialog.close()}
				>
					<Icon name="close-sm" />
				</button>
			</div>
		</div>

		<FormEnhance action="?/saveIzinPulang" showToast onsuccess={onPermitSuccess}>
			<div class="space-y-6 px-5 py-5 sm:px-6">
				<input type="hidden" name="kelasId" value={kelasId ?? ''} />

				<section>
					<h4 class="mb-3 font-semibold">Murid dan Jadwal Izin</h4>
					<div class="grid gap-4 sm:grid-cols-2">
						<label class="form-control sm:col-span-2">
							<span class="label-text mb-1.5 font-medium">Murid</span>
							<select class="select select-bordered w-full" name="muridId" required>
								<option value="">Pilih murid</option>
								{#each students as student (student.id)}
									<option value={student.id}>{student.nama} · NIS {student.nis}</option>
								{/each}
							</select>
						</label>
						<label class="form-control">
							<span class="label-text mb-1.5 font-medium">Tanggal keluar</span>
							<input class="input input-bordered w-full" type="date" name="tanggalKeluar" value={today} required />
						</label>
						<label class="form-control">
							<span class="label-text mb-1.5 font-medium">Waktu keluar</span>
							<input class="input input-bordered w-full" type="time" name="waktuKeluar" />
						</label>
						<label class="form-control">
							<span class="label-text mb-1.5 font-medium">Rencana kembali</span>
							<input class="input input-bordered w-full" type="date" name="rencanaKembali" value={today} required />
						</label>
						<label class="form-control">
							<span class="label-text mb-1.5 font-medium">Waktu kembali</span>
							<input class="input input-bordered w-full" type="time" name="waktuRencanaKembali" />
						</label>
						<label class="form-control sm:col-span-2">
							<span class="label-text mb-1.5 font-medium">Alasan</span>
							<textarea class="textarea textarea-bordered min-h-24 w-full" name="alasan" rows="3" placeholder="Tuliskan alasan izin pulang" required></textarea>
						</label>
					</div>
				</section>

				<hr class="border-base-200" />

				<section>
					<h4 class="mb-3 font-semibold">Penjemput dan Dokumen</h4>
					<div class="grid gap-4 sm:grid-cols-2">
						<label class="form-control">
							<span class="label-text mb-1.5 font-medium">Nama penjemput</span>
							<input class="input input-bordered w-full" name="penjemputNama" placeholder="Nama lengkap" />
						</label>
						<label class="form-control">
							<span class="label-text mb-1.5 font-medium">Hubungan dengan murid</span>
							<input class="input input-bordered w-full" name="penjemputHubungan" placeholder="Contoh: Orang tua" />
						</label>
						<label class="form-control">
							<span class="label-text mb-1.5 font-medium">Kontak penjemput</span>
							<input class="input input-bordered w-full" name="penjemputKontak" type="tel" placeholder="Nomor telepon" />
						</label>
						<label class="form-control">
							<span class="label-text mb-1.5 font-medium">Nomor dokumen</span>
							<input class="input input-bordered w-full" name="nomorDokumen" placeholder="Opsional" />
						</label>
					</div>
				</section>
			</div>

			<div class="border-base-200 flex flex-col-reverse gap-2 border-t bg-base-200/30 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
				<button class="btn btn-ghost" type="button" onclick={() => permitDialog.close()}>
					Batal
				</button>
				<button class="btn btn-primary" type="submit" disabled={!kelasId || !students.length}>
					<Icon name="save" /> Simpan Izin
				</button>
			</div>
		</FormEnhance>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button aria-label="Tutup formulir izin pulang">close</button>
	</form>
</dialog>
