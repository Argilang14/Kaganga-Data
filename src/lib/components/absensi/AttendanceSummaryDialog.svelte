<script lang="ts">
	import { page } from '$app/state';
	import { beforeNavigate } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import { canAttendance } from '$lib/attendance-access';
	import {
		isSummaryDate,
		type AttendanceSummary,
		type SummaryClass,
		type SummaryScope
	} from '$lib/attendance-summary';
	import Icon from '$lib/components/icon.svelte';
	import { completionStatuses, type CompletionStatus } from '$lib/attendance-completion';
	import { toast } from '$lib/components/toast.svelte';

	type Options = {
		classes: SummaryClass[];
		activities: Array<{ id: number; nama: string }>;
		canAllScopes: boolean;
		restrictedStudents: boolean;
		today: string;
	};
	let {
		tanggal = '',
		kegiatanId = null,
		kelasId = null,
		label = 'Ringkasan WhatsApp',
		onopen,
		finishMode = false,
		pendingCount = 0,
		processing = false,
		online = true,
		onresume
	}: {
		tanggal?: string;
		kegiatanId?: string | number | null;
		kelasId?: number | null;
		label?: string;
		onopen?: () => void;
		finishMode?: boolean;
		pendingCount?: number;
		processing?: boolean;
		online?: boolean;
		onresume?: () => void;
	} = $props();
	let dialog: HTMLDialogElement;
	let preview = $state<HTMLTextAreaElement>();
	let options = $state<Options | null>(null);
	let selectedDate = $state('');
	let selectedActivity = $state('');
	let selectedClass = $state('');
	let selectedClasses = $state<number[]>([]);
	let classLevel = $state('');
	let scope = $state<SummaryScope>('kelas');
	let level = $state('sma');
	let report = $state<AttendanceSummary | null>(null);
	let busy = $state(false);
	let message = $state('');
	let errorMessage = $state('');
	let controller: AbortController | null = null;
	let revision = 0;
	let showMissing = $state(false);
	let search = $state('');
	let visibleLimit = $state(30);
	let drafts = $state<Record<number, { status: CompletionStatus | ''; catatan: string }>>({});
	let notices = $state<string[]>([]);
	let confirming = $state(false);
	let discardPrompt = $state(false);
	const dirty = $derived(Object.values(drafts).some((item) => item.status || item.catatan));
	const selectedEntries = $derived(Object.entries(drafts).filter(([, item]) => item.status));
	const blocked = $derived(!online || pendingCount > 0 || processing);
	const filteredMissing = $derived(
		report?.missingStudents.filter((item) =>
			`${item.nama} ${item.kelas}`.toLocaleLowerCase('id').includes(search.toLocaleLowerCase('id'))
		) ?? []
	);
	const statusLabels = {
		hadir: 'Hadir',
		sakit: 'Sakit',
		izin: 'Izin',
		alfa: 'Alfa',
		pulang: 'Pulang'
	};
	const multiClassOptions = $derived(
		options?.classes.filter((item) => !classLevel || item.jenjang === classLevel) ?? []
	);
	const ready = $derived(
		Boolean(
			options &&
			isSummaryDate(selectedDate) &&
			selectedDate <= options.today &&
			selectedActivity &&
			(scope !== 'kelas' || selectedClass) &&
			(scope !== 'antar_kelas' || selectedClasses.length)
		)
	);

	function resetPreview() {
		revision++;
		controller?.abort();
		report = null;
		message = '';
		errorMessage = '';
		confirming = false;
		showMissing = false;
		notices = [];
	}
	function close(force = false) {
		if (busy || processing) return;
		if (dirty && !force) {
			discardPrompt = true;
			return;
		}
		drafts = {};
		discardPrompt = false;
		resetPreview();
		dialog.close();
	}
	function cancel(event: Event) {
		event.preventDefault();
		close();
	}
	onDestroy(() => controller?.abort());
	beforeNavigate(({ cancel }) => {
		if (dirty || busy) {
			cancel();
			discardPrompt = dirty;
		}
	});

	async function readResponse<T>(response: Response): Promise<T> {
		const payload = await response.json();
		if (!response.ok) throw new Error(payload.message ?? 'Ringkasan tidak dapat dimuat.');
		return payload;
	}
	async function open() {
		if (processing) return;
		onopen?.();
		drafts = {};
		search = '';
		visibleLimit = 30;
		discardPrompt = false;
		resetPreview();
		options = null;
		busy = true;
		scope = 'kelas';
		dialog.showModal();
		const current = revision;
		controller = new AbortController();
		try {
			const params = new URLSearchParams({ options: '1' });
			if (isSummaryDate(tanggal)) params.set('tanggal', tanggal);
			const result = await readResponse<Options>(
				await fetch(`/api/administrasi/absensi/kegiatan/ringkasan?${params}`, {
					cache: 'no-store',
					signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)])
				})
			);
			if (current !== revision) return;
			options = result;
			selectedDate = isSummaryDate(tanggal) ? tanggal : result.today;
			selectedActivity = result.activities.some((item) => String(item.id) === String(kegiatanId))
				? String(kegiatanId)
				: '';
			selectedClass = String(
				result.classes.find((item) => item.id === (kelasId ?? page.data.kelasAktif?.id))?.id ??
					result.classes[0]?.id ??
					''
			);
			level = result.classes.find((item) => item.id === Number(selectedClass))?.jenjang ?? 'sma';
			if (level === 'unknown') level = 'sma';
			selectedClasses = [];
			classLevel = '';
		} catch (error) {
			if (current === revision)
				errorMessage =
					error instanceof Error ? error.message : 'Pengaturan ringkasan gagal dimuat.';
		} finally {
			if (current === revision) busy = false;
		}
		if (finishMode && ready) await refresh();
	}
	function parameters() {
		const params = new URLSearchParams({
			tanggal: selectedDate,
			kegiatan_id: selectedActivity,
			cakupan: scope
		});
		if (scope === 'kelas') params.set('kelas_id', selectedClass);
		if (scope === 'antar_kelas')
			for (const id of selectedClasses) params.append('kelas_ids', String(id));
		if (scope === 'jenjang') params.set('jenjang', level);
		return params;
	}
	async function saveManual() {
		if (busy || blocked || !selectedEntries.length) return;
		busy = true;
		confirming = false;
		errorMessage = '';
		notices = [];
		const names = new Map(report?.missingStudents.map((student) => [student.id, student.nama]));
		try {
			const result = await readResponse<{
				report: AttendanceSummary;
				results: Array<{ muridId: number; code: string; message: string }>;
			}>(
				await fetch(`/api/administrasi/absensi/kegiatan/ringkasan/catat?${parameters()}`, {
					method: 'POST',
					signal: AbortSignal.timeout(30000),
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						entries: selectedEntries.map(([id, item]) => ({ muridId: Number(id), ...item }))
					})
				})
			);
			report = result.report;
			for (const item of result.results) {
				const name = names.get(item.muridId);
				notices.push(`${name ? name + ': ' : ''}${item.message}`);
				if (item.code === 'saved' || item.code === 'changed') delete drafts[item.muridId];
			}
		} catch (cause) {
			errorMessage =
				cause instanceof Error
					? `${cause.message} Pilihan belum dibuang; periksa koneksi lalu simpan ulang.`
					: 'Penyimpanan belum terkonfirmasi. Periksa koneksi lalu coba lagi; pilihan tetap tersimpan di popup.';
		} finally {
			busy = false;
		}
	}
	async function finish() {
		if (dirty || blocked || busy || !report) return;
		const previous = report.missingStudents
			.map((item) => item.id)
			.sort()
			.join(',');
		const accepted = confirming;
		const latest = await refresh();
		if (!latest) return;
		if (
			accepted &&
			previous ===
				latest.missingStudents
					.map((item) => item.id)
					.sort()
					.join(',') &&
			!blocked
		) {
			close(true);
			toast(
				latest.totals.belum
					? `Selesai di perangkat ini. ${latest.totals.belum} murid tetap belum tercatat; lanjutkan konfirmasi kepada wali.`
					: 'Pemeriksaan absensi selesai di perangkat ini.',
				'success'
			);
		} else {
			confirming = true;
		}
	}
	function resume() {
		if (dirty || busy) return;
		close();
		onresume?.();
	}
	function beforeUnload(event: BeforeUnloadEvent) {
		if (dirty) {
			event.preventDefault();
			event.returnValue = '';
		}
	}
	async function refresh() {
		if (!ready || busy || dirty) return null;
		busy = true;
		errorMessage = '';
		message = '';
		report = null;
		const current = revision;
		controller = new AbortController();
		const params = new URLSearchParams({
			tanggal: selectedDate,
			kegiatan_id: selectedActivity,
			cakupan: scope
		});
		if (scope === 'kelas') params.set('kelas_id', selectedClass);
		if (scope === 'antar_kelas')
			for (const id of selectedClasses) params.append('kelas_ids', String(id));
		if (scope === 'jenjang') params.set('jenjang', level);
		try {
			const result = await readResponse<AttendanceSummary>(
				await fetch(`/api/administrasi/absensi/kegiatan/ringkasan?${params}`, {
					cache: 'no-store',
					signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)])
				})
			);
			if (current !== revision) return null;
			report = result;
			confirming = false;
			return result;
		} catch (error) {
			if (current === revision)
				errorMessage = error instanceof Error ? error.message : 'Ringkasan gagal dimuat.';
			return null;
		} finally {
			if (current === revision) busy = false;
		}
	}
	async function copy() {
		const latest = await refresh();
		if (!latest) return;
		try {
			await navigator.clipboard.writeText(latest.text);
			message = 'Ringkasan terbaru disalin. Pilih grup guru sekolah dan tempel pesan di WhatsApp.';
		} catch {
			preview?.focus();
			preview?.select();
			message = 'Clipboard tidak tersedia. Teks dipilih; salin melalui menu perangkat.';
		}
	}
	async function share() {
		// Open from the user gesture, then refresh server data before preparing the message.
		const popup = window.open('about:blank', '_blank');
		if (popup) popup.opener = null;
		const latest = await refresh();
		if (!latest) {
			popup?.close();
			return;
		}
		const url = `https://wa.me/?text=${encodeURIComponent(latest.text)}`;
		if (url.length > 8000) {
			popup?.close();
			try {
				await navigator.clipboard.writeText(latest.text);
				message =
					'Pesan panjang: ringkasan disalin. Buka WhatsApp dan tempel ke grup guru sekolah.';
			} catch {
				preview?.focus();
				preview?.select();
				message = 'Pesan panjang: salin teks pratinjau lalu tempel ke grup guru sekolah.';
			}
			return;
		}
		if (!popup) {
			message = 'Pop-up diblokir. Gunakan Salin Ringkasan lalu tempel di WhatsApp.';
			return;
		}
		popup.location.replace(url);
		message = 'WhatsApp dibuka. Pilih grup guru sekolah dan konfirmasi pengiriman di WhatsApp.';
	}
</script>

<svelte:window onbeforeunload={beforeUnload} />

{#if canAttendance(page.data.user, 'export')}
	<button type="button" class="btn btn-soft btn-sm shadow-none" onclick={open} disabled={processing}
		><Icon name="export" />{label}</button
	>
{/if}
<dialog
	class="modal"
	bind:this={dialog}
	oncancel={cancel}
	aria-label={finishMode ? 'Konfirmasi selesai absensi' : 'Ringkasan kehadiran'}
>
	<div class="modal-box flex max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-3xl flex-col rounded-lg">
		<h3 class="mb-4 text-lg font-bold">
			{finishMode ? 'Konfirmasi Selesai Absensi' : 'Ringkasan Kehadiran untuk Grup Guru'}
		</h3>
		<div class="min-h-0 overflow-y-auto">
			<fieldset class="min-w-0" disabled={dirty || busy}>
				<div class="grid gap-3 sm:grid-cols-2">
					<label class="form-control"
						><span class="mb-1">Tanggal</span><input
							type="date"
							class="input input-bordered w-full"
							aria-label="Tanggal ringkasan"
							bind:value={selectedDate}
							max={options?.today}
							disabled={busy || !options}
							onchange={resetPreview}
						/></label
					>
					<label class="form-control"
						><span class="mb-1">Kegiatan</span><select
							class="select select-bordered w-full"
							aria-label="Kegiatan ringkasan"
							bind:value={selectedActivity}
							disabled={busy || !options}
							onchange={resetPreview}
							><option value="" disabled>Pilih kegiatan</option
							>{#each options?.activities ?? [] as item (item.id)}<option value={String(item.id)}
									>{item.nama}</option
								>{/each}</select
						></label
					>
					<label class="form-control"
						><span class="mb-1">Cakupan</span><select
							class="select select-bordered w-full"
							aria-label="Cakupan ringkasan"
							bind:value={scope}
							disabled={busy || !options}
							onchange={resetPreview}
							><option value="kelas">Per kelas</option>{#if options?.canAllScopes}<option
									value="jenjang">Per jenjang</option
								><option value="semua">Seluruh jenjang</option><option value="antar_kelas"
									>Antar kelas</option
								>{/if}</select
						></label
					>
					{#if scope === 'kelas'}
						<label class="form-control"
							><span class="mb-1">Kelas</span><select
								class="select select-bordered w-full"
								aria-label="Kelas ringkasan"
								bind:value={selectedClass}
								disabled={busy || !options}
								onchange={resetPreview}
								>{#each options?.classes ?? [] as item (item.id)}<option value={String(item.id)}
										>{item.nama}</option
									>{/each}</select
							></label
						>
					{:else if scope === 'jenjang'}
						<label class="form-control"
							><span class="mb-1">Jenjang</span><select
								class="select select-bordered w-full"
								aria-label="Jenjang ringkasan"
								bind:value={level}
								disabled={busy}
								onchange={resetPreview}
								><option value="sd">SD</option><option value="smp">SMP</option><option value="sma"
									>SMA</option
								></select
							></label
						>
					{/if}
				</div>
				{#if scope === 'antar_kelas'}
					<fieldset class="mt-4 min-w-0 space-y-3" disabled={busy || !options}>
						<legend class="text-sm font-medium"
							>Kelas yang direkap ({selectedClasses.length})</legend
						>
						<div class="flex flex-wrap items-end gap-2">
							<label class="flex min-w-0 flex-1 flex-col gap-1 text-sm"
								><span>Jenjang kelas</span>
								<select
									class="select w-full"
									aria-label="Jenjang pilihan antar kelas"
									bind:value={classLevel}
									><option value="">Semua jenjang</option><option value="sd">SD</option><option
										value="smp">SMP</option
									><option value="sma">SMA</option></select
								>
							</label>
							<button
								class="btn btn-soft btn-sm"
								type="button"
								onclick={() => {
									selectedClasses = [
										...new Set([...selectedClasses, ...multiClassOptions.map((item) => item.id)])
									];
									resetPreview();
								}}>Pilih semua</button
							>
							<button
								class="btn btn-ghost btn-sm"
								type="button"
								onclick={() => {
									selectedClasses = [];
									resetPreview();
								}}>Kosongkan</button
							>
						</div>
						<div class="grid max-h-60 gap-2 overflow-y-auto sm:grid-cols-2">
							{#each multiClassOptions as item (item.id)}
								<label
									class="flex cursor-pointer items-center gap-3 rounded-md border border-base-300 p-3 text-sm"
								>
									<input
										type="checkbox"
										class="checkbox checkbox-sm checkbox-primary shrink-0"
										value={item.id}
										bind:group={selectedClasses}
										onchange={resetPreview}
									/>
									<span class="min-w-0 break-words">{item.nama}</span><span
										class="ml-auto text-xs text-base-content/60"
										>{item.jenjang === 'unknown' ? '-' : item.jenjang.toUpperCase()}</span
									>
								</label>
							{/each}
						</div>
					</fieldset>
				{/if}
			</fieldset>
			{#if options?.restrictedStudents}<div class="alert alert-info mt-3 text-sm">
					<Icon name="info" /><span>Jumlah hanya mencakup anak binaan sesuai penugasan.</span>
				</div>{/if}
			{#if options && !options.classes.length}<div class="alert alert-warning mt-3">
					<Icon name="warning" /><span>Belum ada kelas dalam penugasan pada semester aktif.</span>
				</div>{/if}
			{#if options && !options.activities.length}<div class="alert alert-warning mt-3">
					<Icon name="warning" /><span>Belum ada kegiatan yang tersedia untuk akun ini.</span>
				</div>{/if}
			<div class="my-3 flex justify-end">
				<button
					type="button"
					class="btn btn-soft btn-sm"
					onclick={refresh}
					disabled={!ready || busy || dirty}
					aria-disabled={!ready || busy}
					>{#if busy}<span class="loading loading-spinner loading-xs"></span>{:else}<Icon
							name={report ? 'repeat' : 'eye'}
						/>{/if}{report ? 'Perbarui Pratinjau' : 'Pratinjau'}</button
				>
			</div>
			{#if errorMessage}<div class="alert alert-error mb-3" role="alert">
					<Icon name="error" /><span>{errorMessage}</span>
				</div>{/if}
			{#if report}
				{#if finishMode}
					<div class="mb-4 grid grid-cols-3 gap-2" aria-live="polite">
						<div class="rounded-md bg-base-200 p-3">
							<span class="block text-xs">Total murid</span><strong class="mt-1 block text-xl"
								>{report.totals.jumlah}</strong
							>
						</div>
						<div class="rounded-md bg-success/10 p-3">
							<span class="block text-xs">Sudah tercatat</span><strong
								class="mt-1 block text-xl text-success"
								>{report.totals.jumlah - report.totals.belum}</strong
							>
						</div>
						<button
							type="button"
							class="rounded-md bg-warning/10 p-3 text-left focus-visible:outline-2"
							aria-expanded={showMissing}
							onclick={() => {
								showMissing = !showMissing;
								confirming = false;
							}}
							><span class="block text-xs">Belum tercatat</span><strong
								class="mt-1 block text-xl text-warning">{report.totals.belum}</strong
							><span class="text-xs underline">{showMissing ? 'Tutup daftar' : 'Lihat murid'}</span
							></button
						>
					</div>
					<p class="mb-3 text-sm text-base-content/70">
						{report.totals.belum
							? `Masih ada ${report.totals.belum} murid yang perlu diperiksa.`
							: report.totals.jumlah
								? 'Seluruh murid dalam cakupan ini sudah tercatat.'
								: 'Tidak ada murid aktif dalam cakupan ini.'}
					</p>
					{#if showMissing}
						<section class="mb-4 border-y border-base-300 py-4" aria-label="Murid belum tercatat">
							<label class="input input-sm mb-3 w-full"
								><Icon name="search" /><input
									aria-label="Cari murid belum tercatat"
									placeholder="Cari nama atau kelas"
									bind:value={search}
									oninput={() => (visibleLimit = 30)}
								/></label
							>
							<div class="divide-y divide-base-200">
								{#each filteredMissing.slice(0, visibleLimit) as student (student.id)}
									{@const draft = drafts[student.id] ?? { status: '', catatan: '' }}
									<div
										class="grid min-w-0 gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_150px_minmax(0,1fr)] sm:items-center"
									>
										<div class="flex min-w-0 items-center gap-2">
											{#if student.canEdit}<img
													src={`/api/murid-photo/${student.id}`}
													alt=""
													loading="lazy"
													width="36"
													height="36"
													class="h-9 w-9 shrink-0 rounded object-cover"
													onerror={(event) =>
														((event.currentTarget as HTMLImageElement).style.visibility = 'hidden')}
												/>{/if}
											<div class="min-w-0">
												<p class="break-words text-sm font-medium">{student.nama}</p>
												<span class="text-xs text-base-content/60">{student.kelas}</span>
											</div>
										</div>
										<label class="grid gap-1 text-xs"
											><span>Status</span><select
												class="select select-sm w-full"
												aria-label={`Status ${student.nama}`}
												value={draft.status}
												disabled={busy || !student.canEdit || blocked}
												onchange={(event) => {
													drafts[student.id] = {
														...draft,
														status: event.currentTarget.value as CompletionStatus | ''
													};
													confirming = false;
												}}
												><option value="">Belum tercatat</option
												>{#each completionStatuses as status (status)}<option value={status}
														>{statusLabels[status]}</option
													>{/each}</select
											></label
										>
										<label class="grid min-w-0 gap-1 text-xs"
											><span>Keterangan</span><input
												class="input input-sm w-full"
												aria-label={`Keterangan ${student.nama}`}
												maxlength="500"
												value={draft.catatan}
												disabled={busy || !student.canEdit || blocked}
												oninput={(event) => {
													drafts[student.id] = { ...draft, catatan: event.currentTarget.value };
													confirming = false;
												}}
											/></label
										>
										{#if !student.canEdit}<p class="text-xs text-base-content/60 sm:col-span-3">
												{student.reason}
											</p>{/if}
									</div>
								{:else}<p class="py-4 text-sm text-base-content/60">
										{report.totals.belum
											? 'Tidak ada murid yang cocok dengan pencarian.'
											: 'Tidak ada murid yang belum tercatat.'}
									</p>{/each}
							</div>
							{#if filteredMissing.length > visibleLimit}<button
									type="button"
									class="btn btn-ghost btn-sm mt-2"
									onclick={() => (visibleLimit += 30)}>Tampilkan berikutnya</button
								>{/if}
							<div class="mt-3 flex flex-wrap items-center justify-between gap-3">
								{#if dirty}<button
										class="btn btn-ghost btn-sm"
										disabled={busy}
										onclick={() => {
											drafts = {};
											confirming = false;
										}}>Batalkan pilihan</button
									>{/if}
								<span class="text-xs text-base-content/60"
									>{selectedEntries.length} status dipilih</span
								><button
									type="button"
									class="btn btn-soft btn-success btn-sm"
									onclick={saveManual}
									disabled={!selectedEntries.length ||
										selectedEntries.length > 100 ||
										busy ||
										blocked}><Icon name="save" />Simpan &amp; Perbarui</button
								>
							</div>
							{#if selectedEntries.length > 100}<p class="mt-2 text-sm text-error">
									Simpan maksimal 100 murid sekaligus.
								</p>{/if}
						</section>
					{/if}
					{#each notices as notice, index (index)}<p
							class="mb-2 rounded border border-base-300 p-2 text-sm"
							role="status"
						>
							{notice}
						</p>{/each}
					{#if blocked}<div class="alert alert-warning mb-3 text-sm">
							<Icon name="warning" /><span
								>{pendingCount
									? `${pendingCount} scan masih menunggu sinkronisasi. Sinkronkan antrean sebelum konfirmasi selesai.`
									: processing
										? 'Tunggu proses scan atau sinkronisasi selesai.'
										: 'Koneksi terputus. Sambungkan ke server sebelum menyimpan atau menyelesaikan pemeriksaan.'}</span
							>
						</div>{/if}
					{#if confirming}<div
							class="alert mb-3 text-sm"
							class:alert-warning={report.totals.belum > 0}
							class:alert-success={report.totals.belum === 0}
							role="status"
						>
							<Icon name="info" /><span
								>{report.totals.belum
									? `${report.totals.belum} murid tetap belum tercatat dan perlu konfirmasi kepada wali asuh/asrama. Mereka tidak otomatis menjadi alfa.`
									: 'Data terbaru sudah diperiksa.'} Petugas lain tetap dapat melanjutkan absensi.</span
							>
						</div>{/if}
				{/if}
				{#each report.warnings as warning (warning)}<div class="alert alert-warning mb-2 text-sm">
						<Icon name="warning" /><span>{warning}</span>
					</div>{/each}
				<label class="form-control"
					><span class="mb-1 font-medium">Pratinjau Pesan</span><textarea
						class="textarea textarea-bordered h-72 w-full font-mono text-sm"
						aria-label="Pratinjau pesan WhatsApp"
						bind:this={preview}
						value={report.text}
						readonly></textarea></label
				>
			{/if}
			{#if message}<div class="alert alert-info mt-3 text-sm" role="status">
					<Icon name="info" /><span>{message}</span>
				</div>{/if}
		</div>
		{#if discardPrompt}<div class="mt-3 border-t border-warning pt-3 text-sm" role="alert">
				<p>Pilihan belum disimpan. Tetap periksa atau abaikan pilihan?</p>
				<div class="mt-2 flex flex-wrap gap-2">
					<button class="btn btn-sm" onclick={() => (discardPrompt = false)}>Tetap periksa</button
					><button class="btn btn-sm btn-error btn-soft" onclick={() => close(true)}
						>Abaikan pilihan</button
					>
				</div>
			</div>{/if}
		<div
			class={finishMode
				? 'modal-action grid grid-cols-4 gap-2 sm:flex sm:flex-wrap'
				: 'modal-action flex-wrap'}
		>
			<button
				type="button"
				class={finishMode ? 'btn btn-ghost w-full sm:w-auto' : 'btn btn-ghost'}
				onclick={() => close()}
				disabled={busy}>Tutup</button
			>
			{#if finishMode}<button
					type="button"
					class="btn btn-soft w-full sm:w-auto"
					aria-label="Kembali ke Absensi"
					title="Kembali ke Absensi"
					onclick={resume}
					disabled={busy || dirty || processing}
					><Icon name="left" /><span class="sr-only sm:not-sr-only">Kembali ke Absensi</span
					></button
				>{/if}
			<button
				type="button"
				class={finishMode ? 'btn btn-soft w-full sm:w-auto' : 'btn btn-soft'}
				aria-label="Salin Ringkasan"
				title="Salin Ringkasan"
				onclick={copy}
				disabled={!report || busy || dirty}
				aria-disabled={!report || busy}
				><Icon name="copy" /><span class={finishMode ? 'sr-only sm:not-sr-only' : ''}
					>Salin Ringkasan</span
				></button
			>
			<button
				type="button"
				class={finishMode ? 'btn btn-soft w-full sm:w-auto' : 'btn btn-primary'}
				aria-label="Bagikan ke WhatsApp"
				title="Bagikan ke WhatsApp"
				onclick={share}
				disabled={!report || busy || dirty}
				aria-disabled={!report || busy}
				><Icon name="export" /><span class={finishMode ? 'sr-only sm:not-sr-only' : ''}
					>Bagikan ke WhatsApp</span
				></button
			>
			{#if finishMode}<button
					type="button"
					class="btn btn-success col-span-4 sm:col-auto"
					onclick={finish}
					disabled={!report?.totals.jumlah || busy || dirty || blocked}
					>{confirming ? 'Selesai di Perangkat Ini' : 'Konfirmasi Selesai'}</button
				>{/if}
		</div>
	</div>
	<div class="modal-backdrop">
		<button type="button" aria-label="Tutup ringkasan" onclick={() => close()}>close</button>
	</div>
</dialog>
