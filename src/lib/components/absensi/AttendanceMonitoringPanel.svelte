<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import { page } from '$app/state';
	import { canAttendance } from '$lib/attendance-access';

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
		penjemputHubungan?: string | null;
		updatedAt?: string | null;
		keberangkatanTerkonfirmasi?: boolean;
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
	let followUpDialog: HTMLDialogElement;
	let pickupDialog: HTMLDialogElement;
	let pickupPermit = $state<Permit | null>(null);
	let selectedAlertKey = $state<string | null>(null);
	const selectedAlert = $derived(alerts.find((alert) => alert.key === selectedAlertKey));
	const alertGroups = $derived([
		{
			id: 'sakit',
			title: 'Sering Sakit',
			description: 'Sakit beruntun atau berulang',
			icon: 'activity' as const,
			accent: 'border-warning',
			tint: 'bg-warning/10',
			badge: 'badge-warning',
			items: alerts.filter((alert) => ['sakit_beruntun', 'sakit_berulang'].includes(alert.type))
		},
		{
			id: 'pulang',
			title: 'Izin Pulang',
			description: 'Catatan izin dan keterlambatan kembali',
			icon: 'calendar' as const,
			accent: 'border-info',
			tint: 'bg-info/10',
			badge: 'badge-info',
			items: alerts.filter((alert) => alert.type === 'izin_pulang_terlambat')
		},
		{
			id: 'alfa',
			title: 'Sering Alfa',
			description: 'Alfa berulang dalam 30 hari terakhir',
			icon: 'alert' as const,
			accent: 'border-error',
			tint: 'bg-error/10',
			badge: 'badge-error',
			items: alerts.filter((alert) => alert.type === 'alfa_berulang')
		}
	]);
	const followUpLabel = (status: NonNullable<Alert['followUp']>['status']) =>
		({ baru: 'Baru', diproses: 'Diproses', selesai: 'Selesai' })[status];
	const followUpBadge = (status: NonNullable<Alert['followUp']>['status']) =>
		({ baru: 'badge-warning', diproses: 'badge-info', selesai: 'badge-success' })[status];

	const activePermits = $derived(
		permits.filter(
			(item) => !item.tanggalKembali && ['sedang_izin', 'terlambat_kembali'].includes(item.status)
		)
	);
	const unresolvedAlerts = $derived(
		alerts.filter((item) => item.followUp?.status !== 'selesai').length
	);
	const permitStudentCount = $derived(
		new Set([
			...permits.map((permit) => permit.muridId).filter((id) => id != null),
			...alerts
				.filter((alert) => alert.type === 'izin_pulang_terlambat')
				.map((alert) => alert.muridId)
		]).size
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
	const onFollowUpSuccess = async () => {
		followUpDialog.close();
		await invalidateAll();
	};
	const openFollowUpDialog = (alert: Alert) => {
		selectedAlertKey = alert.key;
		followUpDialog.showModal();
	};
	const openPermitDialog = () => {
		if (!kelasId || !students.length) return;
		permitDialog.showModal();
	};
</script>

<section class="min-w-0 p-4 sm:p-5" aria-labelledby="attendance-follow-up-heading">
	<div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
		<div>
			<div class="flex items-center gap-2">
				<Icon name="alert" />
				<h3 id="attendance-follow-up-heading" class="text-lg font-bold">Tindak Lanjut Kehadiran</h3>
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

	<div class="mt-5 grid min-w-0 gap-5 xl:grid-cols-3" data-attendance-follow-up>
		{#each alertGroups as group (group.id)}
			<section
				class={`min-w-0 border-t-2 ${group.accent}`}
				aria-labelledby={`follow-up-${group.id}`}
			>
				<header class={`flex min-h-24 items-start justify-between gap-3 p-4 ${group.tint}`}>
					<div class="min-w-0">
						<h4 id={`follow-up-${group.id}`} class="flex items-center gap-2 font-bold">
							<Icon name={group.icon} class="size-4 shrink-0" />{group.title}
						</h4>
						<p class="text-base-content/70 mt-1 text-xs">{group.description}</p>
					</div>
					<span class={`badge badge-soft shrink-0 ${group.badge}`}>
						{group.id === 'pulang'
							? permitStudentCount
							: new Set(group.items.map((alert) => alert.muridId)).size} murid
					</span>
				</header>
				{#if group.id === 'pulang'}
					<div class="border-base-200 space-y-2 border-b px-4 py-3">
						<button
							class="btn btn-primary btn-sm min-h-10 w-full shadow-none"
							type="button"
							onclick={openPermitDialog}
							disabled={!kelasId ||
								!students.length ||
								!canAttendance(page.data.user, 'izin_pulang')}
						>
							<Icon name="plus" /> Catat Izin Pulang
						</button>
						{#if !kelasId}
							<p class="text-base-content/65 text-xs">
								Pilih satu kelas untuk mencatat izin pulang.
							</p>
						{/if}
					</div>
				{/if}
				{#if group.id !== 'pulang' || group.items.length}
					<ul class="divide-base-200 divide-y" data-follow-up-alerts>
						{#each group.items as alert (alert.key)}
							<li class="min-w-0 space-y-3 px-4 py-4">
								<div class="flex items-start justify-between gap-2">
									<div class="min-w-0">
										<p class="font-semibold wrap-anywhere">{alert.nama}</p>
										<p class="text-base-content/65 mt-0.5 text-xs wrap-anywhere">
											{alert.kelasNama} · NIS {alert.nis || '-'}
										</p>
									</div>
									<span
										class={`badge badge-soft badge-sm shrink-0 ${followUpBadge(alert.followUp?.status ?? 'baru')}`}
									>
										{followUpLabel(alert.followUp?.status ?? 'baru')}
									</span>
								</div>
								<div>
									<p class="text-sm font-medium">{alert.title}</p>
									<p class="text-base-content/70 mt-1 text-xs leading-relaxed wrap-anywhere">
										{alert.description}
									</p>
									<p class="text-base-content/65 mt-2 text-xs">
										{dateLabel(alert.periodeMulai)} – {dateLabel(alert.periodeSelesai)}
									</p>
								</div>
								{#if alert.followUp?.catatan}
									<p
										class="text-base-content/75 border-base-300 border-l-2 pl-2 text-xs leading-relaxed wrap-anywhere"
									>
										{alert.followUp.catatan}
									</p>
								{/if}
								<div class="flex flex-wrap items-center justify-between gap-2">
									<span
										class={`badge badge-soft ${alert.severity === 'error' ? 'badge-error' : 'badge-warning'}`}
									>
										{alert.duration} hari sekolah
									</span>
									<button
										type="button"
										class="btn btn-soft btn-sm min-h-10 shadow-none"
										onclick={() => openFollowUpDialog(alert)}
										aria-label={`Tindak lanjut ${alert.nama}: ${alert.title}`}
									>
										<Icon name="edit" class="size-4" /> Tindak lanjut
									</button>
								</div>
							</li>
						{:else}
							<li
								class="text-base-content/60 flex min-h-36 flex-col items-center justify-center gap-2 px-4 py-6 text-center text-sm"
							>
								<Icon name="check" class="size-5 text-success" />
								Belum ada indikator {group.id === 'sakit'
									? 'sakit'
									: group.id === 'alfa'
										? 'alfa berulang'
										: 'keterlambatan kembali'}.
							</li>
						{/each}
					</ul>
				{/if}
				{#if group.id === 'pulang'}
					<section class="border-base-200 border-t" aria-labelledby="attendance-permits-heading">
						<h5 id="attendance-permits-heading" class="px-4 pt-4 text-sm font-semibold">
							Catatan Izin Pulang
						</h5>
						<div class="divide-base-200 divide-y" data-permit-records>
							{#each permits as permit (permit.id)}
								<div class="min-w-0 space-y-2 p-4 wrap-anywhere">
									<div class="flex flex-wrap items-start justify-between gap-2">
										<div>
											<strong>{permit.nama}</strong>
											<p class="text-base-content/60 text-xs">{permit.alasan}</p>
										</div>
										<span class={`badge badge-sm ${permitBadge(permit.status)}`}
											>{permitLabel(permit.status)}</span
										>
									</div>
									<p class="text-base-content/60 mt-2 text-xs">
										Keluar {dateLabel(permit.tanggalKeluar)} · Rencana {dateLabel(
											permit.rencanaKembali
										)} ·
										{permit.duration} hari sekolah
									</p>
									{#if permit.tanggalKembali}
										<p class="text-base-content/65 text-xs">
											Kembali {dateLabel(permit.tanggalKembali)}
										</p>
									{/if}
									<p class="text-base-content/70 text-xs">Penjemput: {permit.penjemputNama || 'Belum dilengkapi'} · {permit.penjemputHubungan || 'Hubungan belum dilengkapi'}</p>
									{#if !permit.tanggalKembali && ['sedang_izin', 'terlambat_kembali'].includes(permit.status)}
										<div class="mt-2 flex flex-wrap gap-2">
											{#if canAttendance(page.data.user, 'izin_pulang') && !permit.keberangkatanTerkonfirmasi}
												<button type="button" class="btn btn-soft btn-sm min-h-10" onclick={() => { pickupPermit = permit; pickupDialog.showModal(); }}><Icon name="edit" />Ubah Penjemput</button>
											{/if}
											<FormEnhance action="?/markIzinReturned" showToast onsuccess={onSuccess}>
												<input type="hidden" name="id" value={permit.id} />
												<input type="hidden" name="tanggalKembali" value={today} />
												<button
													class="btn btn-success btn-sm min-h-10 shadow-none"
													type="submit"
													disabled={!canAttendance(page.data.user, 'izin_pulang')}
												>
													<Icon name="check" /> Sudah Kembali
												</button>
											</FormEnhance>
											<FormEnhance action="?/cancelIzinPulang" showToast onsuccess={onSuccess}>
												<input type="hidden" name="id" value={permit.id} />
												<button
													class="btn btn-ghost btn-sm min-h-10 shadow-none"
													type="submit"
													disabled={!canAttendance(page.data.user, 'izin_pulang')}>Batalkan</button
												>
											</FormEnhance>
										</div>
									{/if}
								</div>
							{:else}
								<p class="text-base-content/60 px-4 py-6 text-center text-sm">
									Belum ada catatan izin pulang pada periode pemantauan.
								</p>
							{/each}
						</div>
					</section>
				{/if}
			</section>
		{/each}
	</div>
</section>

<dialog
	id="attendance-follow-up-dialog"
	class="modal"
	bind:this={followUpDialog}
	aria-labelledby="follow-up-dialog-heading"
	onclose={() => (selectedAlertKey = null)}
>
	<div class="modal-box max-h-[90dvh] max-w-lg overflow-y-auto rounded-lg p-0">
		<header class="border-base-200 flex items-start justify-between gap-3 border-b px-5 py-4">
			<h3 id="follow-up-dialog-heading" class="text-lg font-bold">Tindak Lanjut Kehadiran</h3>
			<button
				class="btn btn-ghost btn-square btn-sm min-h-10 min-w-10"
				type="button"
				title="Tutup"
				aria-label="Tutup tindak lanjut"
				onclick={() => followUpDialog.close()}><Icon name="close-sm" /></button
			>
		</header>
		{#if selectedAlert}
			{#key selectedAlert.key}
				<FormEnhance action="?/saveFollowUp" showToast onsuccess={onFollowUpSuccess}>
					{#snippet children({ submitting })}
						<div class="space-y-4 px-5 py-4">
							<div>
								<p class="font-semibold wrap-anywhere">{selectedAlert.nama}</p>
								<p class="text-base-content/70 mt-1 text-sm">
									{selectedAlert.kelasNama} · {selectedAlert.title}
								</p>
								<p class="text-base-content/65 mt-1 text-xs">
									{dateLabel(selectedAlert.periodeMulai)} – {dateLabel(
										selectedAlert.periodeSelesai
									)}
								</p>
							</div>
							<input type="hidden" name="muridId" value={selectedAlert.muridId} />
							<input type="hidden" name="kelasId" value={selectedAlert.kelasId} />
							<input type="hidden" name="jenis" value={selectedAlert.type} />
							<input type="hidden" name="periodeMulai" value={selectedAlert.periodeMulai} />
							<input type="hidden" name="periodeSelesai" value={selectedAlert.periodeSelesai} />
							<label class="grid gap-1.5 text-sm font-medium">
								Status
								<select
									class="select min-h-11 w-full font-normal"
									name="status"
									value={selectedAlert.followUp?.status ?? 'diproses'}
								>
									<option value="baru">Baru</option>
									<option value="diproses">Diproses</option>
									<option value="selesai">Selesai</option>
								</select>
							</label>
							<label class="grid gap-1.5 text-sm font-medium">
								Catatan tindak lanjut
								<textarea class="textarea min-h-28 w-full font-normal" name="catatan" rows="4"
									>{selectedAlert.followUp?.catatan ?? ''}</textarea
								>
							</label>
						</div>
						<footer
							class="border-base-200 flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end"
						>
							<button class="btn min-h-11" type="button" onclick={() => followUpDialog.close()}
								>Batal</button
							>
							<button
								class="btn btn-primary min-h-11"
								type="submit"
								disabled={submitting || !canAttendance(page.data.user, 'koreksi')}
							>
								<Icon name="save" />{submitting ? 'Menyimpan...' : 'Simpan'}
							</button>
						</footer>
					{/snippet}
				</FormEnhance>
			{/key}
		{/if}
	</div>
	<form method="dialog" class="modal-backdrop">
		<button aria-label="Tutup tindak lanjut">Tutup</button>
	</form>
</dialog>

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
							<input
								class="input input-bordered w-full"
								type="date"
								name="tanggalKeluar"
								value={today}
								required
							/>
						</label>
						<label class="form-control">
							<span class="label-text mb-1.5 font-medium">Waktu keluar</span>
							<input class="input input-bordered w-full" type="time" name="waktuKeluar" />
						</label>
						<label class="form-control">
							<span class="label-text mb-1.5 font-medium">Rencana kembali</span>
							<input
								class="input input-bordered w-full"
								type="date"
								name="rencanaKembali"
								value={today}
								required
							/>
						</label>
						<label class="form-control">
							<span class="label-text mb-1.5 font-medium">Waktu kembali</span>
							<input class="input input-bordered w-full" type="time" name="waktuRencanaKembali" />
						</label>
						<label class="form-control sm:col-span-2">
							<span class="label-text mb-1.5 font-medium">Alasan</span>
							<textarea
								class="textarea textarea-bordered min-h-24 w-full"
								name="alasan"
								rows="3"
								placeholder="Tuliskan alasan izin pulang"
								required></textarea>
						</label>
					</div>
				</section>

				<hr class="border-base-200" />

				<section>
					<h4 class="mb-3 font-semibold">Penjemput dan Dokumen</h4>
					<div class="grid gap-4 sm:grid-cols-2">
						<label class="form-control">
							<span class="label-text mb-1.5 font-medium">Nama penjemput</span>
							<input
								class="input input-bordered w-full"
								name="penjemputNama"
								required maxlength="150"
								placeholder="Nama lengkap"
							/>
						</label>
						<label class="form-control">
							<span class="label-text mb-1.5 font-medium">Hubungan dengan murid</span>
							<input
								class="input input-bordered w-full"
								name="penjemputHubungan"
								required maxlength="100"
								placeholder="Contoh: Orang tua"
							/>
						</label>
						<label class="form-control">
							<span class="label-text mb-1.5 font-medium">Kontak penjemput</span>
							<input
								class="input input-bordered w-full"
								name="penjemputKontak"
								type="tel"
								placeholder="Nomor telepon"
							/>
						</label>
						<label class="form-control">
							<span class="label-text mb-1.5 font-medium">Nomor dokumen</span>
							<input
								class="input input-bordered w-full"
								name="nomorDokumen"
								placeholder="Opsional"
							/>
						</label>
					</div>
				</section>
			</div>

			<div
				class="border-base-200 flex flex-col-reverse gap-2 border-t bg-base-200/30 px-5 py-4 sm:flex-row sm:justify-end sm:px-6"
			>
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

<dialog class="modal" bind:this={pickupDialog} aria-label="Ubah penjemput">
	<div class="modal-box max-w-lg rounded-lg">
		<h3 class="text-lg font-semibold">Ubah Penjemput</h3>
		{#if pickupPermit}
			{@const selected = pickupPermit}
			<p class="text-base-content/65 mt-1 text-sm">{pickupPermit.nama} · {pickupPermit.kelasNama}</p>
			{#key pickupPermit.id}
				<FormEnhance action="?/updatePenjemput" onsuccess={() => { pickupDialog.close(); onSuccess(); }}>
					{#snippet children({ submitting })}
						<input type="hidden" name="id" value={selected.id} />
						<input type="hidden" name="revision" value={selected.updatedAt ?? ''} />
						<div class="my-4 grid gap-4">
							<label class="grid gap-1 text-sm"><span>Nama penjemput</span><input class="input w-full" name="penjemputNama" value={selected.penjemputNama ?? ''} required maxlength="150" /></label>
							<label class="grid gap-1 text-sm"><span>Hubungan dengan murid</span><input class="input w-full" name="penjemputHubungan" value={selected.penjemputHubungan ?? ''} required maxlength="100" /></label>
						</div>
						<div class="flex flex-wrap justify-end gap-2"><button class="btn" type="button" disabled={submitting} onclick={() => pickupDialog.close()}>Batal</button><button type="submit" class="btn btn-primary" disabled={submitting}><Icon name="save" />{submitting ? 'Menyimpan...' : 'Simpan'}</button></div>
					{/snippet}
				</FormEnhance>
			{/key}
		{/if}
	</div>
	<form method="dialog" class="modal-backdrop"><button aria-label="Tutup ubah penjemput">Tutup</button></form>
</dialog>
