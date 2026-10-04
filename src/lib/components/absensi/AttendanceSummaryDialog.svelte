<script lang="ts">
	import { page } from '$app/state';
	import { onDestroy } from 'svelte';
	import { canAttendance } from '$lib/attendance-access';
	import {
		isSummaryDate,
		type AttendanceSummary,
		type SummaryClass,
		type SummaryScope
	} from '$lib/attendance-summary';
	import Icon from '$lib/components/icon.svelte';

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
		onopen
	}: {
		tanggal?: string;
		kegiatanId?: string | number | null;
		kelasId?: number | null;
		label?: string;
		onopen?: () => void;
	} = $props();
	let dialog: HTMLDialogElement;
	let preview = $state<HTMLTextAreaElement>();
	let options = $state<Options | null>(null);
	let selectedDate = $state('');
	let selectedActivity = $state('');
	let selectedClass = $state('');
	let scope = $state<SummaryScope>('kelas');
	let level = $state('sma');
	let report = $state<AttendanceSummary | null>(null);
	let busy = $state(false);
	let message = $state('');
	let errorMessage = $state('');
	let controller: AbortController | null = null;
	let revision = 0;
	const ready = $derived(
		Boolean(
			options &&
			isSummaryDate(selectedDate) &&
			selectedDate <= options.today &&
			selectedActivity &&
			(scope !== 'kelas' || selectedClass)
		)
	);

	function resetPreview() {
		revision++;
		controller?.abort();
		report = null;
		message = '';
		errorMessage = '';
	}
	function close() {
		resetPreview();
		dialog.close();
	}
	onDestroy(() => controller?.abort());

	async function readResponse<T>(response: Response): Promise<T> {
		const payload = await response.json();
		if (!response.ok) throw new Error(payload.message ?? 'Ringkasan tidak dapat dimuat.');
		return payload;
	}
	async function open() {
		onopen?.();
		resetPreview();
		options = null;
		busy = true;
		scope = 'kelas';
		dialog.showModal();
		const current = revision;
		controller = new AbortController();
		try {
			const result = await readResponse<Options>(
				await fetch('/api/administrasi/absensi/kegiatan/ringkasan?options=1', {
					cache: 'no-store',
					signal: controller.signal
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
		} catch (error) {
			if (current === revision)
				errorMessage =
					error instanceof Error ? error.message : 'Pengaturan ringkasan gagal dimuat.';
		} finally {
			if (current === revision) busy = false;
		}
	}
	async function refresh() {
		if (!ready || busy) return null;
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
		if (scope === 'jenjang') params.set('jenjang', level);
		try {
			const result = await readResponse<AttendanceSummary>(
				await fetch(`/api/administrasi/absensi/kegiatan/ringkasan?${params}`, {
					cache: 'no-store',
					signal: controller.signal
				})
			);
			if (current !== revision) return null;
			report = result;
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

{#if canAttendance(page.data.user, 'export')}
	<button type="button" class="btn btn-soft btn-sm shadow-none" onclick={open}
		><Icon name="export" />{label}</button
	>
{/if}
<dialog class="modal" bind:this={dialog} oncancel={resetPreview}>
	<div class="modal-box flex max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-3xl flex-col rounded-lg">
		<h3 class="mb-4 text-lg font-bold">Ringkasan Kehadiran untuk Grup Guru</h3>
		<div class="min-h-0 overflow-y-auto">
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
							><option value="semua">Seluruh jenjang</option>{/if}</select
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
					disabled={!ready || busy}
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
		<div class="modal-action flex-wrap">
			<button type="button" class="btn btn-ghost" onclick={close} disabled={busy}>Tutup</button>
			<button
				type="button"
				class="btn btn-soft"
				onclick={copy}
				disabled={!report || busy}
				aria-disabled={!report || busy}><Icon name="copy" />Salin Ringkasan</button
			>
			<button
				type="button"
				class="btn btn-primary"
				onclick={share}
				disabled={!report || busy}
				aria-disabled={!report || busy}><Icon name="export" />Bagikan ke WhatsApp</button
			>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button aria-label="Tutup ringkasan" onclick={resetPreview}>close</button>
	</form>
</dialog>
