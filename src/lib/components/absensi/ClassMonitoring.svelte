<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/icon.svelte';
	import { onDestroy, onMount, untrack } from 'svelte';

	type Journal = { id: number | null; url: string | null; canWrite: boolean };
	type Meeting = {
		key: string;
		kelasId: number;
		templateId: number | null;
		scheduleIds: number[];
		mapelNama: string;
		guruNama: string;
		guruPegawaiId: number | null;
		jamPelajaran: string | number | number[];
		pukulMulai: string;
		pukulSelesai: string;
		state: string;
		scannedAt: string | null;
		actualGuruNama: string | null;
		absenceReason: string | null;
		absenceNote?: string | null;
		substitutePegawaiId: number | null;
		substituteGuruNama?: string | null;
		canScan: boolean;
		journal: Journal | null;
	};
	type ClassRow = {
		id: number;
		nama: string;
		jenjang: string;
		holidayLabel?: string;
		meetings: Meeting[];
	};
	type Option = { id: number; nama: string; jenjang?: string };
	type Monitoring = {
		tanggal: string;
		sekolahNama: string;
		jenis: string;
		serverNow: string;
		contextLabel: string;
		kelasList: Option[];
		guruList: Option[];
		capabilities: { canScan: boolean; canManage: boolean };
		rows: ClassRow[];
		summary: Record<string, unknown>;
		qrClassId?: number;
	};
	type PageData = { monitoring: Monitoring };
	type QrCard = { kelasId: number; nama: string; token: string; payload: string };
	type ApiPayload = { ok?: boolean; message?: string; error?: string; cards?: QrCard[] };

	let { data }: { data: PageData } = $props();
	let tanggal = $state(untrack(() => data.monitoring.tanggal));
	let jenis = $state(untrack(() => data.monitoring.jenis));
	let jenjang = $state(page.url.searchParams.get('jenjang') ?? '');
	let kelasId = $state(page.url.searchParams.get('kelas_id') ?? '');
	let refreshing = $state(false);
	let filtering = $state(false);
	let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	let scanDialog = $state<HTMLDialogElement>();
	let absenceDialog = $state<HTMLDialogElement>();
	let qrDialog = $state<HTMLDialogElement>();
	let videoEl = $state<HTMLVideoElement>();
	let selectedMeeting = $state<Meeting | null>(null);
	let scannerStarting = $state(false);
	let scannerActive = $state(false);
	let scanOpen = $state(false);
	let absenceOpen = $state(false);
	let qrOpen = $state(false);
	let scanToken = $state('');
	let scanError = $state('');
	let submittingScan = $state(false);
	let controls: { stop: () => void } | null = null;
	let scannerGeneration = 0;
	let destroyed = false;

	let absenceReason = $state<'sakit' | 'izin'>('sakit');
	let substitutePegawaiId = $state('');
	let absenceNote = $state('');
	let submittingAbsence = $state(false);

	let qrSelection = $state<number[]>([]);
	let qrCards = $state<QrCard[]>([]);
	let qrBusy = $state(false);
	let qrError = $state('');
	let resetTarget = $state<Option | null>(null);

	const monitoring = $derived(data.monitoring);
	const maxMeetings = $derived(Math.max(0, ...monitoring.rows.map((row) => row.meetings.length)));
	const meetingColumns = $derived(Array.from({ length: maxMeetings }, (_, index) => index));
	const jenjangOptions = $derived(
		[...new Set(monitoring.kelasList.map((item) => item.jenjang).filter(Boolean))].sort()
	);
	const filteredClasses = $derived(
		jenjang ? monitoring.kelasList.filter((item) => item.jenjang === jenjang) : monitoring.kelasList
	);
	const isDialogBusy = $derived(
		scanOpen || absenceOpen || qrOpen || submittingScan || submittingAbsence || qrBusy
	);
	const computedSummary = $derived.by(() => {
		const meetings = monitoring.rows.flatMap((row) => row.meetings);
		return {
			total: meetings.length,
			scanned: meetings.filter((item) => stateKind(item.state) === 'scanned').length,
			ongoing: meetings.filter((item) => stateKind(item.state) === 'ongoing').length,
			missing: meetings.filter((item) => stateKind(item.state) === 'elapsed').length,
			journals: meetings.filter((item) => item.journal?.id).length
		};
	});
	const dateLabel = $derived(
		new Intl.DateTimeFormat('id-ID', {
			timeZone: 'Asia/Jakarta',
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		}).format(new Date(`${monitoring.tanggal}T12:00:00+07:00`))
	);
	const statusLegend = [
		{ kind: 'scanned', label: 'Dipindai' },
		{ kind: 'ongoing', label: 'Berlangsung' },
		{ kind: 'elapsed', label: 'Belum dipindai' },
		{ kind: 'excused', label: 'Sakit / izin' },
		{ kind: 'future', label: 'Mendatang' }
	];
	const summaryItems = $derived([
		{
			label: 'Pertemuan',
			value: summaryValue(['total', 'totalMeetings', 'jumlah'], computedSummary.total),
			icon: 'book-open',
			tone: 'info'
		},
		{
			label: 'Dipindai',
			value: summaryValue(['scanned', 'hadir', 'sudahScan'], computedSummary.scanned),
			icon: 'check-square',
			tone: 'success'
		},
		{
			label: 'Berlangsung',
			value: summaryValue(['ongoing', 'berlangsung'], computedSummary.ongoing),
			icon: 'activity',
			tone: 'warning'
		},
		{
			label: 'Terlewat',
			value: summaryValue(['missing', 'elapsed', 'belumScan'], computedSummary.missing),
			icon: 'warning',
			tone: 'error'
		}
	] satisfies { label: string; value: number; icon: IconName; tone: string }[]);

	function stateKind(state: string): 'scanned' | 'ongoing' | 'elapsed' | 'future' | 'excused' {
		const value = state.toLowerCase().replaceAll('-', '_');
		if (['present', 'scanned', 'hadir'].includes(value)) return 'scanned';
		if (value === 'excused') return 'excused';
		if (['running', 'ongoing', 'berlangsung'].includes(value)) return 'ongoing';
		if (['ended', 'elapsed', 'not_scanned', 'terlewat'].includes(value)) return 'elapsed';
		return 'future';
	}

	function stateLabel(meeting: Meeting) {
		if (stateKind(meeting.state) === 'excused') {
			return meeting.absenceReason === 'sakit'
				? 'Sakit'
				: meeting.absenceReason === 'izin'
					? 'Izin'
					: 'Berhalangan';
		}
		const labels = {
			scanned: 'Dipindai',
			ongoing: 'Berlangsung',
			elapsed: 'Belum dipindai',
			future: 'Mendatang',
			excused: 'Berhalangan'
		};
		return labels[stateKind(meeting.state)];
	}

	function badgeClass(meeting: Meeting) {
		return {
			scanned: 'badge-success',
			ongoing: 'badge-warning',
			elapsed: 'badge-error',
			future: 'badge-ghost',
			excused: 'badge-info'
		}[stateKind(meeting.state)];
	}

	function stateIcon(meeting: Meeting): IconName {
		return {
			scanned: 'check',
			ongoing: 'activity',
			elapsed: 'warning',
			future: 'calendar',
			excused: 'info'
		}[stateKind(meeting.state)] as IconName;
	}

	function classScanned(row: ClassRow) {
		return row.meetings.filter((meeting) => stateKind(meeting.state) === 'scanned').length;
	}

	function summaryValue(names: string[], fallback: number) {
		for (const name of names) {
			const value = monitoring.summary?.[name];
			if (typeof value === 'number') return value;
		}
		return fallback;
	}

	function formatTime(value: string | null | undefined) {
		if (!value) return '-';
		if (/^\d{1,2}:\d{2}/.test(value)) return value.slice(0, 5);
		const parsed = new Date(value);
		return Number.isNaN(parsed.getTime())
			? value
			: parsed.toLocaleTimeString('id-ID', {
					timeZone: 'Asia/Jakarta',
					hour: '2-digit',
					minute: '2-digit'
				});
	}

	function jamLabel(value: Meeting['jamPelajaran']) {
		if (Array.isArray(value)) return value.join(', ');
		return String(value ?? '-');
	}

	function friendlyError(error: unknown, fallback: string) {
		if (error instanceof Error && error.message) return error.message;
		return fallback;
	}

	async function readResponse(response: Response): Promise<ApiPayload> {
		const payload = (await response.json().catch(() => ({}))) as ApiPayload;
		if (!response.ok || payload.ok === false) {
			throw new Error(payload.message || payload.error || `Permintaan gagal (${response.status}).`);
		}
		return payload;
	}

	async function applyFilters() {
		if (filtering) return;
		const params = new URLSearchParams();
		if (tanggal) params.set('tanggal', tanggal);
		if (jenis) params.set('jenis', jenis);
		if (jenjang) params.set('jenjang', jenjang);
		if (kelasId) params.set('kelas_id', kelasId);
		filtering = true;
		message = null;
		try {
			await goto(resolve(`/administrasi/absensi/monitoring-kelas?${params.toString()}`), {
				keepFocus: true,
				noScroll: true
			});
		} catch (error) {
			message = {
				type: 'error',
				text: friendlyError(error, 'Filter gagal diterapkan. Coba lagi.')
			};
		} finally {
			filtering = false;
		}
	}

	function journalQuery(url: string): `?${string}` {
		return `?${new URL(url, page.url).searchParams.toString()}`;
	}

	async function refresh() {
		if (refreshing || filtering || isDialogBusy) return;
		refreshing = true;
		message = null;
		try {
			await invalidateAll();
		} catch (error) {
			message = { type: 'error', text: friendlyError(error, 'Data monitoring gagal diperbarui.') };
		} finally {
			refreshing = false;
		}
	}

	function openScan(meeting: Meeting) {
		selectedMeeting = meeting;
		scanToken = '';
		scanError = '';
		scanOpen = true;
		scanDialog?.showModal();
	}

	function stopScanner() {
		scannerGeneration += 1;
		controls?.stop();
		controls = null;
		if (typeof MediaStream !== 'undefined' && videoEl?.srcObject instanceof MediaStream) {
			for (const track of videoEl.srcObject.getTracks()) track.stop();
			videoEl.srcObject = null;
		}
		scannerActive = false;
		scannerStarting = false;
	}

	async function startScanner() {
		if (scannerActive || scannerStarting) return;
		scanError = '';
		if (!window.isSecureContext && !['localhost', '127.0.0.1', '::1'].includes(location.hostname)) {
			scanError = 'Kamera hanya tersedia melalui HTTPS atau localhost.';
			return;
		}
		if (!navigator.mediaDevices?.getUserMedia) {
			scanError = 'Browser ini tidak mendukung akses kamera.';
			return;
		}
		if (!videoEl) return;
		scannerStarting = true;
		const generation = ++scannerGeneration;
		try {
			const { BrowserQRCodeReader } = await import('@zxing/browser');
			const reader = new BrowserQRCodeReader(undefined, {
				delayBetweenScanAttempts: 100,
				delayBetweenScanSuccess: 1000,
				tryPlayVideoTimeout: 5000
			});
			const nextControls = await reader.decodeFromConstraints(
				{ audio: false, video: { facingMode: { ideal: 'environment' } } },
				videoEl,
				(result, error) => {
					if (result && generation === scannerGeneration && !destroyed) {
						scanToken = result.getText();
						stopScanner();
					}
					if (error && error.name !== 'NotFoundException')
						console.debug('[monitoring kelas] decode', error);
				}
			);
			if (destroyed || generation !== scannerGeneration || !scanOpen) {
				nextControls.stop();
				return;
			}
			controls = nextControls;
			scannerActive = true;
		} catch (error) {
			stopScanner();
			scanError = `Kamera tidak dapat dibuka: ${friendlyError(error, 'periksa izin kamera.')}`;
		} finally {
			scannerStarting = false;
		}
	}

	function closeScan() {
		scanOpen = false;
		stopScanner();
		scanDialog?.close();
	}

	async function confirmScan() {
		if (!selectedMeeting || !scanToken.trim() || submittingScan) return;
		submittingScan = true;
		scanError = '';
		try {
			const response = await fetch('/api/administrasi/absensi/monitoring-kelas', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					action: 'scan',
					key: selectedMeeting.key,
					qr: scanToken.trim(),
					tanggal: monitoring.tanggal,
					jenis: monitoring.jenis
				})
			});
			const payload = await readResponse(response);
			closeScan();
			message = { type: 'success', text: payload.message || 'Kehadiran guru berhasil dicatat.' };
			await invalidateAll();
		} catch (error) {
			scanError = friendlyError(error, 'Scan gagal disimpan.');
		} finally {
			submittingScan = false;
		}
	}

	function openAbsence(meeting: Meeting) {
		selectedMeeting = meeting;
		absenceReason = meeting.absenceReason === 'izin' ? 'izin' : 'sakit';
		substitutePegawaiId = meeting.substitutePegawaiId ? String(meeting.substitutePegawaiId) : '';
		absenceNote = meeting.absenceNote ?? '';
		scanError = '';
		absenceOpen = true;
		absenceDialog?.showModal();
	}

	async function saveAbsence() {
		if (!selectedMeeting || submittingAbsence) return;
		submittingAbsence = true;
		scanError = '';
		try {
			const response = await fetch('/api/administrasi/absensi/monitoring-kelas', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					action: 'absence',
					key: selectedMeeting.key,
					tanggal: monitoring.tanggal,
					jenis: monitoring.jenis,
					reason: absenceReason,
					substitutePegawaiId: substitutePegawaiId ? Number(substitutePegawaiId) : undefined,
					note: absenceNote.trim() || undefined
				})
			});
			const payload = await readResponse(response);
			absenceOpen = false;
			absenceDialog?.close();
			message = { type: 'success', text: payload.message || 'Keterangan guru berhasil disimpan.' };
			await invalidateAll();
		} catch (error) {
			scanError = friendlyError(error, 'Keterangan gagal disimpan.');
		} finally {
			submittingAbsence = false;
		}
	}

	function openQrManager() {
		qrSelection = monitoring.qrClassId
			? [monitoring.qrClassId]
			: monitoring.kelasList.map((item) => item.id);
		qrCards = [];
		qrError = '';
		resetTarget = null;
		qrOpen = true;
		qrDialog?.showModal();
	}

	function toggleQrClass(id: number) {
		qrSelection = qrSelection.includes(id)
			? qrSelection.filter((item) => item !== id)
			: [...qrSelection, id];
	}

	async function loadQrCards() {
		if (!qrSelection.length || qrBusy) return;
		qrBusy = true;
		qrError = '';
		try {
			const response = await fetch('/api/administrasi/absensi/monitoring-kelas', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'qr', kelasIds: qrSelection })
			});
			const payload = await readResponse(response);
			qrCards = payload.cards ?? [];
		} catch (error) {
			qrError = friendlyError(error, 'QR kelas gagal dimuat.');
		} finally {
			qrBusy = false;
		}
	}

	async function resetQr() {
		if (!resetTarget || qrBusy) return;
		const targetId = resetTarget.id;
		qrBusy = true;
		qrError = '';
		try {
			const response = await fetch('/api/administrasi/absensi/monitoring-kelas', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'resetQr', kelasId: resetTarget.id })
			});
			const payload = await readResponse(response);
			if (payload.cards?.length) {
				qrCards = [...qrCards.filter((card) => card.kelasId !== targetId), ...payload.cards];
			} else {
				qrCards = qrCards.filter((card) => card.kelasId !== targetId);
			}
			resetTarget = null;
		} catch (error) {
			qrError = friendlyError(error, 'QR kelas gagal dibuat ulang.');
		} finally {
			qrBusy = false;
		}
	}

	function escapeHtml(value: unknown) {
		return String(value)
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#039;');
	}

	async function printQrCards() {
		if (!qrCards.length || qrBusy) return;
		const popup = window.open('', '_blank');
		if (!popup) {
			qrError = 'Jendela cetak diblokir browser. Izinkan pop-up lalu coba lagi.';
			return;
		}
		popup.opener = null;
		popup.document.write('<title>Menyiapkan QR kelas...</title>');
		try {
			qrBusy = true;
			const QRCode = await import('qrcode');
			const rendered = await Promise.all(
				qrCards.map(async (card) => ({
					...card,
					image: await QRCode.toDataURL(card.payload, {
						scale: 12,
						margin: 4,
						errorCorrectionLevel: 'M'
					})
				}))
			);
			const labels = rendered
				.map(
					(card) =>
						`<article><p>${escapeHtml(monitoring.sekolahNama)}</p><h1>${escapeHtml(card.nama)}</h1><img src="${escapeHtml(card.image)}" alt="QR ${escapeHtml(card.nama)}"><p>${escapeHtml(monitoring.contextLabel)}</p></article>`
				)
				.join('');
			popup.document.open();
			popup.document.write(
				`<!doctype html><html><head><title>QR Kelas</title><style>@page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;display:grid;grid-template-columns:repeat(2,1fr);gap:8mm}article{break-inside:avoid;border:1px dashed #777;min-height:125mm;padding:10mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}h1{font-size:22px;margin:0 0 6mm}img{width:72mm;height:72mm;image-rendering:auto}p{font-size:12px;margin:5mm 0 0;color:#444}@media print{body{gap:8mm}}</style></head><body>${labels}</body></html>`
			);
			popup.document.close();
			await Promise.all(Array.from(popup.document.images).map((image) => image.decode()));
			if (!popup.closed) {
				popup.focus();
				popup.print();
			}
		} catch (error) {
			popup.close();
			qrError = friendlyError(error, 'Dokumen cetak gagal dibuat.');
		} finally {
			qrBusy = false;
		}
	}

	onMount(() => {
		const timer = window.setInterval(() => {
			if (document.visibilityState === 'visible' && !isDialogBusy) void refresh();
		}, 60_000);
		const onVisible = () => {
			if (document.visibilityState === 'visible' && !isDialogBusy) void refresh();
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			window.clearInterval(timer);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});

	onDestroy(() => {
		destroyed = true;
		stopScanner();
	});
</script>

{#snippet meetingCard(meeting: Meeting)}
	<div class="meeting-card" data-status={stateKind(meeting.state)} data-testid="meeting-card">
		<div class="meeting-content">
			<div class="meeting-heading">
				<h4 class="meeting-subject">{meeting.mapelNama}</h4>
				<span class={`meeting-status badge badge-soft badge-sm ${badgeClass(meeting)}`}>
					<Icon name={stateIcon(meeting)} class="h-3 w-3 shrink-0" />{stateLabel(meeting)}
				</span>
			</div>
			<div class="meeting-teacher">
				<Icon name="user" class="h-3.5 w-3.5 shrink-0" />
				<span>{meeting.actualGuruNama || meeting.guruNama}</span>
			</div>
			{#if meeting.substituteGuruNama && !meeting.scannedAt}
				<div class="meeting-substitute">Pengganti: {meeting.substituteGuruNama}</div>
			{/if}
			<div class="meeting-time">
				<span class="meeting-jp">JP {jamLabel(meeting.jamPelajaran)}</span>
				<span class="tabular-nums"
					>{formatTime(meeting.pukulMulai)}–{formatTime(meeting.pukulSelesai)}</span
				>
				{#if meeting.scannedAt}
					<span class="meeting-scan"
						><Icon name="check" class="h-3 w-3" />Scan {formatTime(meeting.scannedAt)}</span
					>
				{/if}
			</div>
		</div>
		<div class="meeting-footer">
			{#if meeting.journal?.id && meeting.journal.canWrite && meeting.journal.url}<a
					class="meeting-journal btn btn-ghost btn-sm text-success"
					href={resolve(`/jurnal-mengajar${journalQuery(meeting.journal.url)}`)}
					><Icon name="book-open" class="h-3.5 w-3.5 shrink-0" /> Jurnal</a
				>{:else if meeting.journal?.id}<span class="meeting-journal text-success"
					><Icon name="book-open" class="h-3.5 w-3.5 shrink-0" /> Jurnal terisi</span
				>{:else if meeting.journal?.canWrite && meeting.journal.url}<a
					class="meeting-journal btn btn-ghost btn-sm text-info"
					href={resolve(`/jurnal-mengajar${journalQuery(meeting.journal.url)}`)}
					><Icon name="pen" class="h-3.5 w-3.5 shrink-0" /> Isi jurnal</a
				>{:else}<span class="meeting-journal text-base-content/55"
					><Icon name="book-open" class="h-3.5 w-3.5 shrink-0" />Belum ada jurnal</span
				>{/if}
			<div class="flex gap-1">
				{#if monitoring.capabilities.canManage}<button
						class="btn btn-ghost btn-sm btn-square size-10"
						type="button"
						title="Catat sakit atau izin"
						aria-label={`Catat sakit atau izin: ${meeting.mapelNama}`}
						onclick={() => openAbsence(meeting)}><Icon name="calendar" class="h-4 w-4" /></button
					>{/if}
				{#if monitoring.capabilities.canScan && meeting.canScan}<button
						class="btn btn-info btn-soft btn-sm btn-square size-10"
						type="button"
						title="Scan kehadiran guru"
						aria-label={`Scan kehadiran guru: ${meeting.mapelNama}`}
						onclick={() => openScan(meeting)}><Icon name="grid" class="h-4 w-4" /></button
					>{/if}
			</div>
		</div>
	</div>
{/snippet}

<div
	class="class-monitoring w-full min-w-0 space-y-5"
	data-ui-revision="kaganga-ui-class-monitoring-2"
>
	<header class="monitoring-heading-bar">
		<div class="flex min-w-0 items-start gap-3">
			<span class="monitoring-heading-icon" aria-hidden="true"
				><Icon name="school" class="size-5 fill-current" /></span
			>
			<div class="min-w-0">
				<h1 class="text-xl font-bold">Monitoring Kelas</h1>
				<p class="monitoring-context">{monitoring.contextLabel}</p>
				<p class="monitoring-date">
					<Icon name="calendar" class="h-3.5 w-3.5 shrink-0" />{dateLabel}
				</p>
			</div>
		</div>
		<div class="monitoring-actions flex gap-2">
			{#if monitoring.capabilities.canManage}
				<button class="btn btn-sm min-h-10" type="button" onclick={openQrManager}>
					<Icon name="grid" class="h-4 w-4" /> Kelola QR
				</button>
			{/if}
			<button
				class="btn btn-square btn-sm size-10"
				type="button"
				onclick={refresh}
				disabled={refreshing || filtering || isDialogBusy}
				aria-disabled={refreshing || filtering || isDialogBusy}
				aria-label="Perbarui data"
				title="Perbarui data"
			>
				{#if refreshing}<span class="loading loading-spinner loading-xs"></span>{:else}<Icon
						name="repeat"
						class="h-4 w-4"
					/>{/if}
			</button>
		</div>
	</header>

	{#if message}
		<div
			class={`alert py-2 ${message.type === 'success' ? 'alert-success' : 'alert-error'}`}
			role="status"
		>
			<Icon name={message.type === 'success' ? 'success' : 'error'} /><span>{message.text}</span>
		</div>
	{/if}

	<dl class="summary-grid" aria-label="Ringkasan pertemuan">
		{#each summaryItems as item (item.label)}
			<div class="summary-item" data-tone={item.tone}>
				<span class="summary-icon" aria-hidden="true"><Icon name={item.icon} class="size-4" /></span
				>
				<div class="min-w-0">
					<dt class="summary-label">{item.label}</dt>
					<dd class="summary-value">{item.value}</dd>
				</div>
			</div>
		{/each}
	</dl>

	<form
		class="monitoring-filters"
		aria-label="Filter monitoring kelas"
		aria-busy={filtering}
		onsubmit={(event) => {
			event.preventDefault();
			void applyFilters();
		}}
	>
		<label class="filter-field"
			><span>Tanggal</span><input
				class="input input-bordered w-full"
				type="date"
				name="tanggal"
				required
				disabled={filtering}
				bind:value={tanggal}
			/></label
		>
		<label class="filter-field"
			><span>Jenis jadwal</span><select
				class="select w-full"
				name="jenis"
				bind:value={jenis}
				disabled={filtering}
				><option value="persiapan">Persiapan</option><option value="ganjil">Ganjil</option><option
					value="genap">Genap</option
				></select
			></label
		>
		<label class="filter-field"
			><span>Jenjang</span><select
				class="select select-bordered w-full"
				bind:value={jenjang}
				name="jenjang"
				disabled={filtering}
				onchange={() => {
					if (kelasId && !filteredClasses.some((item) => String(item.id) === kelasId)) kelasId = '';
				}}
				><option value="">Semua jenjang</option>{#each jenjangOptions as item (item)}<option
						value={item}>{item}</option
					>{/each}</select
			></label
		>
		<label class="filter-field"
			><span>Kelas</span><select
				class="select w-full"
				name="kelas_id"
				bind:value={kelasId}
				disabled={filtering}
				><option value="">Semua kelas</option>{#each filteredClasses as item (item.id)}<option
						value={String(item.id)}>{item.nama}</option
					>{/each}</select
			></label
		>
		<button class="filter-submit btn btn-info btn-soft self-end" type="submit" disabled={filtering}
			>{#if filtering}<span class="loading loading-spinner loading-sm"></span>{:else}<Icon
					name="search"
					class="size-4"
				/>{/if}{filtering ? 'Memuat...' : 'Terapkan'}</button
		>
	</form>

	<section class="monitoring-results min-w-0" aria-label="Pemantauan kelas">
		<header class="results-header">
			<div class="flex min-w-0 flex-wrap items-center gap-2">
				<Icon name="table" class="h-4 w-4 text-info" />
				<h2 class="font-semibold">Pemantauan kelas</h2>
				<span class="badge badge-ghost badge-sm">{monitoring.rows.length} kelas</span>
			</div>
			<span class="results-journals"
				><Icon name="book-open" class="h-3.5 w-3.5" />{computedSummary.journals} jurnal terisi</span
			>
		</header>
		<div class="status-legend" aria-label="Status pertemuan">
			{#each statusLegend as status (status.kind)}
				<span
					><i class="status-dot" data-status={status.kind} aria-hidden="true"
					></i>{status.label}</span
				>
			{/each}
		</div>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex (The scrollable timetable needs keyboard focus.) -->
		<div
			class="matrix-scroll hidden max-w-full overflow-x-auto lg:block"
			role="region"
			aria-label="Tabel pertemuan setiap kelas"
			tabindex="0"
		>
			<table
				class="class-matrix table table-sm w-full table-fixed border-separate border-spacing-0"
				style:min-width={`${164 + maxMeetings * 288}px`}
			>
				<caption class="sr-only">Kehadiran guru dan jurnal mengajar pada {dateLabel}</caption>
				<colgroup
					><col style="width: 164px" />{#each meetingColumns as column (column)}<col
						/>{/each}</colgroup
				>
				<thead
					><tr class="bg-base-200/70"
						><th
							class="sticky left-0 z-20 w-44 min-w-44 border-r border-base-300 bg-base-200 px-4 py-3"
							scope="col">Kelas</th
						>{#each meetingColumns as column (column)}<th
								class="border-r border-base-300 px-4 py-3 text-left"
								scope="col">Pertemuan {column + 1}</th
							>{/each}</tr
					></thead
				>
				<tbody>
					{#each monitoring.rows as row (row.id)}
						<tr>
							<th
								class="class-label sticky left-0 z-10 border-r border-t border-base-300 bg-base-100 px-4 py-4 align-top"
								scope="row"
								><div class="break-words whitespace-normal text-sm font-bold">{row.nama}</div>
								<div class="text-base-content/65 mt-2 text-xs font-normal">
									{row.jenjang.toUpperCase()}
								</div>
								{#if row.meetings.length}
									<div class="class-progress">
										<progress
											class="progress progress-success"
											max={row.meetings.length}
											value={classScanned(row)}
											aria-label={`Pertemuan dipindai di ${row.nama}`}
										></progress>
										<span>{classScanned(row)}/{row.meetings.length} dipindai</span>
									</div>
								{/if}
								{#if row.holidayLabel}<div
										class="mt-2 whitespace-normal text-xs font-normal text-info"
									>
										{row.holidayLabel}
									</div>
								{:else if !row.meetings.length}<div
										class="mt-2 text-xs font-normal text-base-content/55"
									>
										Tidak ada jadwal
									</div>{/if}</th
							>
							{#each meetingColumns as column (column)}
								{@const meeting = row.meetings[column]}
								<td
									class="meeting-cell border-r border-t border-base-300 align-top"
									class:empty-meeting={!meeting}
								>
									{#if meeting}
										{@render meetingCard(meeting)}
									{:else}<div class="empty-slot">
											<span aria-label="Tidak ada pertemuan">-</span>
										</div>{/if}
								</td>
							{/each}
						</tr>
					{/each}
					{#if !monitoring.rows.length}<tr
							><td colspan={maxMeetings + 1} class="py-12 text-center text-base-content/60"
								><div class="flex flex-col items-center gap-3">
									<Icon name="calendar" class="h-6 w-6 text-base-content/40" /><span
										>Tidak ada jadwal untuk filter ini.</span
									>
								</div></td
							></tr
						>{/if}
				</tbody>
			</table>
		</div>
		<div class="mobile-classes divide-base-200 divide-y lg:hidden">
			{#each monitoring.rows as row (row.id)}
				<section class="min-w-0 py-4">
					<header
						class="mb-4 flex min-w-0 items-start justify-between gap-3 rounded-md bg-base-200/50 p-3"
					>
						<div class="min-w-0">
							<h3 class="min-w-0 break-words text-sm font-semibold">{row.nama}</h3>
							{#if row.meetings.length}<p class="mt-1 text-xs text-base-content/60">
									{classScanned(row)}/{row.meetings.length} pertemuan dipindai
								</p>{/if}
						</div>
						<span class="badge badge-info badge-soft badge-sm shrink-0"
							>{row.jenjang.toUpperCase()}</span
						>
					</header>
					{#if row.holidayLabel}<p class="mb-3 text-xs text-info">{row.holidayLabel}</p>{/if}
					<div class="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-3">
						{#each row.meetings as meeting (meeting.key)}{@render meetingCard(meeting)}
						{:else}<p class="text-sm text-base-content/55">Tidak ada jadwal</p>{/each}
					</div>
				</section>
			{:else}<p class="p-6 text-center text-sm text-base-content/60">
					Tidak ada jadwal untuk filter ini.
				</p>{/each}
		</div>
	</section>
	<div class="monitoring-sync">
		<Icon name="repeat" class="h-3.5 w-3.5 shrink-0" />Diperbarui {new Date(
			monitoring.serverNow
		).toLocaleString('id-ID', {
			timeZone: 'Asia/Jakarta'
		})}
	</div>
</div>

<dialog
	class="modal"
	id="class-monitoring-scan"
	aria-labelledby="class-monitoring-scan-title"
	bind:this={scanDialog}
	oncancel={(event) => {
		if (submittingScan) event.preventDefault();
	}}
	onclose={() => {
		scanOpen = false;
		stopScanner();
	}}
>
	<div
		class="modal-box flex max-h-[90dvh] w-[calc(100%_-_1.5rem)] max-w-xl flex-col rounded-lg p-0"
	>
		<div
			class="flex shrink-0 items-start justify-between gap-3 border-b border-base-200 bg-base-200/35 p-4 sm:p-5"
		>
			<div class="min-w-0">
				<h2 id="class-monitoring-scan-title" class="text-lg font-bold">Scan Kehadiran Guru</h2>
				<p class="mt-1 break-words text-sm text-base-content/65">
					{selectedMeeting?.mapelNama} · {selectedMeeting?.guruNama}
				</p>
			</div>
			<button
				class="btn btn-ghost btn-sm btn-square size-10 shrink-0"
				type="button"
				title="Tutup"
				aria-label="Tutup scan kehadiran guru"
				disabled={submittingScan}
				aria-disabled={submittingScan}
				onclick={closeScan}><Icon name="close" /></button
			>
		</div>
		<div class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-5">
			<div class="bg-base-200 relative aspect-video overflow-hidden rounded-lg">
				<video class="h-full w-full object-cover" bind:this={videoEl} muted playsinline autoplay
				></video>
				<div class="pointer-events-none absolute inset-0 grid place-items-center">
					<div
						class="border-primary size-40 rounded-lg border-2 shadow-[0_0_0_999px_rgba(0,0,0,.2)]"
					></div>
				</div>
			</div>
			<div class="flex flex-wrap gap-2">
				<button
					class="btn btn-sm min-h-10"
					type="button"
					onclick={startScanner}
					disabled={scannerActive || scannerStarting}
					>{#if scannerStarting}<span class="loading loading-spinner loading-xs"></span>{:else}<Icon
							name="activity"
						/>{/if} Aktifkan Kamera</button
				><button
					class="btn btn-square btn-sm size-10"
					type="button"
					title="Hentikan kamera"
					aria-label="Hentikan kamera"
					onclick={stopScanner}
					disabled={!scannerActive}
					aria-disabled={!scannerActive}><Icon name="pause" /></button
				>
			</div>
			<label class="flex flex-col gap-2 text-sm font-medium"
				><span>Token QR</span><textarea
					class="textarea min-h-20 w-full font-normal"
					name="scanToken"
					disabled={submittingScan}
					bind:value={scanToken}
					placeholder="Tempel token QR"></textarea></label
			>
			{#if scanToken}<div class="alert alert-success py-2">
					<Icon name="check" /><span>QR siap dikonfirmasi untuk pertemuan ini.</span>
				</div>{/if}
			{#if scanError}<div class="alert alert-error py-2" role="alert">
					<Icon name="error" /><span>{scanError}</span>
				</div>{/if}
		</div>
		<div class="modal-action m-0 shrink-0 border-t border-base-200 p-4 sm:px-5">
			<button class="btn btn-ghost" type="button" onclick={closeScan} disabled={submittingScan}
				>Batal</button
			><button
				class="btn btn-success"
				type="button"
				onclick={confirmScan}
				disabled={!scanToken.trim() || submittingScan}
				>{#if submittingScan}<span class="loading loading-spinner loading-xs"></span>{:else}<Icon
						name="check"
					/>{/if} Konfirmasi Scan</button
			>
		</div>
	</div>
	<form
		method="dialog"
		class="modal-backdrop"
		onsubmit={(event) => {
			if (submittingScan) event.preventDefault();
		}}
	>
		<button aria-label="Tutup" onclick={stopScanner} disabled={submittingScan}>close</button>
	</form>
</dialog>

<dialog
	class="modal"
	id="class-monitoring-absence"
	aria-labelledby="class-monitoring-absence-title"
	bind:this={absenceDialog}
	onclose={() => (absenceOpen = false)}
	oncancel={(event) => {
		if (submittingAbsence) event.preventDefault();
	}}
>
	<div
		class="modal-box flex max-h-[90dvh] w-[calc(100%_-_1.5rem)] max-w-lg flex-col rounded-lg p-0"
	>
		<header
			class="flex shrink-0 items-start justify-between gap-3 border-b border-base-200 bg-base-200/35 p-4 sm:p-5"
		>
			<div class="min-w-0">
				<h2 id="class-monitoring-absence-title" class="text-lg font-bold">Keterangan Guru</h2>
				<p class="mt-1 break-words text-sm text-base-content/65">
					{selectedMeeting?.mapelNama} · {selectedMeeting?.guruNama}
				</p>
			</div>
			<button
				class="btn btn-ghost btn-sm btn-square size-10 shrink-0"
				type="button"
				title="Tutup"
				aria-label="Tutup keterangan guru"
				disabled={submittingAbsence}
				aria-disabled={submittingAbsence}
				onclick={() => {
					absenceOpen = false;
					absenceDialog?.close();
				}}><Icon name="close" class="h-4 w-4" /></button
			>
		</header>
		<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
			<fieldset class="min-w-0 space-y-5" disabled={submittingAbsence}>
				<fieldset>
					<legend class="mb-2 text-sm font-medium">Keterangan</legend>
					<div class="join">
						<button
							class={`btn btn-sm min-h-10 join-item ${absenceReason === 'sakit' ? 'btn-info btn-soft' : ''}`}
							type="button"
							aria-pressed={absenceReason === 'sakit'}
							onclick={() => (absenceReason = 'sakit')}>Sakit</button
						><button
							class={`btn btn-sm min-h-10 join-item ${absenceReason === 'izin' ? 'btn-info btn-soft' : ''}`}
							type="button"
							aria-pressed={absenceReason === 'izin'}
							onclick={() => (absenceReason = 'izin')}>Izin</button
						>
					</div>
				</fieldset>
				<label class="flex min-w-0 flex-col gap-2 text-sm font-medium"
					><span>Guru pengganti</span><select
						class="select w-full font-normal"
						name="substitutePegawaiId"
						bind:value={substitutePegawaiId}
						><option value="">Tanpa guru pengganti</option
						>{#each monitoring.guruList as guru (guru.id)}<option value={String(guru.id)}
								>{guru.nama}</option
							>{/each}</select
					></label
				>
				<label class="flex min-w-0 flex-col gap-2 text-sm font-medium"
					><span>Catatan</span><textarea
						class="textarea min-h-24 w-full font-normal"
						name="absenceNote"
						bind:value={absenceNote}></textarea></label
				>{#if scanError}<div class="alert alert-error py-2" role="alert">
						<Icon name="error" /><span>{scanError}</span>
					</div>{/if}
			</fieldset>
		</div>
		<div class="modal-action m-0 shrink-0 border-t border-base-200 p-4 sm:px-5">
			<button
				class="btn btn-ghost"
				type="button"
				disabled={submittingAbsence}
				onclick={() => {
					absenceOpen = false;
					absenceDialog?.close();
				}}>Batal</button
			><button
				class="btn btn-success"
				type="button"
				onclick={saveAbsence}
				disabled={submittingAbsence}
				>{#if submittingAbsence}<span class="loading loading-spinner loading-xs"></span>{:else}<Icon
						name="save"
					/>{/if} Simpan</button
			>
		</div>
	</div>
	<form
		method="dialog"
		class="modal-backdrop"
		onsubmit={(event) => {
			if (submittingAbsence) event.preventDefault();
		}}
	>
		<button aria-label="Tutup" disabled={submittingAbsence}>close</button>
	</form>
</dialog>

<dialog
	class="modal"
	id="class-monitoring-qr"
	aria-labelledby="class-monitoring-qr-title"
	bind:this={qrDialog}
	onclose={() => (qrOpen = false)}
	oncancel={(event) => {
		if (qrBusy) event.preventDefault();
	}}
>
	<div
		class="modal-box flex max-h-[90dvh] w-[calc(100%_-_1.5rem)] max-w-3xl flex-col rounded-lg p-0"
	>
		<div
			class="flex shrink-0 items-center justify-between gap-3 border-b border-base-200 bg-base-200/35 p-4 sm:p-5"
		>
			<h2 id="class-monitoring-qr-title" class="text-lg font-bold">QR Kelas</h2>
			<button
				class="btn btn-ghost btn-sm btn-square size-10 shrink-0"
				type="button"
				title="Tutup"
				aria-label="Tutup QR kelas"
				disabled={qrBusy}
				aria-disabled={qrBusy}
				onclick={() => {
					qrOpen = false;
					qrDialog?.close();
				}}><Icon name="close" /></button
			>
		</div>
		<div class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-5">
			<fieldset disabled={qrBusy} class="min-w-0">
				<legend class="mb-3 text-sm font-semibold">Kelas peserta</legend>
				<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
					{#each monitoring.kelasList as kelas (kelas.id)}<label
							class="flex min-h-11 min-w-0 cursor-pointer items-center gap-3 rounded-md border border-base-300 p-3 text-sm"
							><input
								class="checkbox checkbox-sm shrink-0"
								type="checkbox"
								checked={qrSelection.includes(kelas.id)}
								onchange={() => toggleQrClass(kelas.id)}
							/><span class="break-words">{kelas.nama}</span></label
						>{/each}
				</div>
			</fieldset>
			<div class="flex flex-wrap gap-2">
				<button
					class="btn btn-info btn-soft btn-sm min-h-10"
					type="button"
					onclick={loadQrCards}
					disabled={!qrSelection.length || qrBusy}
					>{#if qrBusy}<span class="loading loading-spinner loading-xs"></span>{:else}<Icon
							name="grid"
						/>{/if} Tampilkan QR</button
				><button
					class="btn btn-sm min-h-10"
					type="button"
					onclick={printQrCards}
					disabled={!qrCards.length || qrBusy}><Icon name="print" /> Cetak</button
				>
			</div>
			{#if qrError}<div class="alert alert-error py-2" role="alert">
					<Icon name="error" /><span>{qrError}</span>
				</div>{/if}
			{#if qrCards.length}<div class="divide-base-300 divide-y rounded-lg border border-base-300">
					{#each qrCards as card (card.kelasId)}<div
							class="flex min-w-0 items-center justify-between gap-3 p-3"
						>
							<div class="min-w-0">
								<div class="font-semibold">{card.nama}</div>
								<div class="text-base-content/55 truncate font-mono text-xs">{card.token}</div>
							</div>
							<button
								class="btn btn-error btn-soft btn-sm btn-square size-10 shrink-0"
								type="button"
								title={`Buat ulang QR ${card.nama}`}
								aria-label={`Buat ulang QR ${card.nama}`}
								disabled={qrBusy}
								aria-disabled={qrBusy}
								onclick={() =>
									(resetTarget = monitoring.kelasList.find((item) => item.id === card.kelasId) ?? {
										id: card.kelasId,
										nama: card.nama
									})}><Icon name="repeat" /></button
							>
						</div>{/each}
				</div>{/if}
			{#if resetTarget}<div class="alert alert-warning items-start">
					<Icon name="warning" />
					<div class="flex-1">
						<div class="font-semibold">Buat ulang QR {resetTarget.nama}?</div>
						<p class="mt-1 text-sm">QR lama tidak berlaku lagi setelah diganti.</p>
						<div class="mt-2 flex gap-2">
							<button class="btn btn-error btn-sm" type="button" onclick={resetQr} disabled={qrBusy}
								>Konfirmasi</button
							><button
								class="btn btn-sm"
								type="button"
								onclick={() => (resetTarget = null)}
								disabled={qrBusy}>Batal</button
							>
						</div>
					</div>
				</div>{/if}
		</div>
	</div>
	<form
		method="dialog"
		class="modal-backdrop"
		onsubmit={(event) => {
			if (qrBusy) event.preventDefault();
		}}
	>
		<button aria-label="Tutup" disabled={qrBusy}>close</button>
	</form>
</dialog>

<style>
	.class-monitoring {
		--monitor-blue: color-mix(in oklab, var(--color-info) 55%, var(--color-base-content));
		--monitor-green: color-mix(in oklab, var(--color-success) 55%, var(--color-base-content));
		--monitor-amber: color-mix(in oklab, var(--color-warning) 55%, var(--color-base-content));
		--monitor-red: color-mix(in oklab, var(--color-error) 55%, var(--color-base-content));
		--monitor-muted: color-mix(in oklab, var(--color-base-content) 45%, var(--color-base-100));
	}
	.monitoring-heading-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 4px 0;
	}
	.monitoring-heading-icon {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: 42px;
		height: 42px;
		border-radius: 8px;
		color: var(--monitor-blue);
		background: color-mix(in oklab, var(--monitor-blue) 10%, var(--color-base-100));
	}
	.monitoring-context {
		margin-top: 4px;
		font-size: 13px;
		line-height: 1.5;
		color: color-mix(in oklab, var(--color-base-content) 65%, transparent);
		overflow-wrap: anywhere;
	}
	.monitoring-date {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 8px;
		font-size: 12px;
		color: color-mix(in oklab, var(--color-base-content) 70%, transparent);
	}
	.monitoring-actions {
		flex-shrink: 0;
	}
	.summary-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 1px;
		border-block: 1px solid var(--color-base-300);
		background: var(--color-base-300);
	}
	.summary-item {
		--tone: var(--monitor-blue);
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
		padding: 16px 20px;
		background: var(--color-base-100);
	}
	.summary-item[data-tone='success'] {
		--tone: var(--monitor-green);
	}
	.summary-item[data-tone='warning'] {
		--tone: var(--monitor-amber);
	}
	.summary-item[data-tone='error'] {
		--tone: var(--monitor-red);
	}
	.summary-label {
		font-size: 12px;
		color: color-mix(in oklab, var(--color-base-content) 70%, transparent);
	}
	.summary-icon {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		flex-shrink: 0;
		border-radius: 8px;
		color: var(--tone);
		background: color-mix(in oklab, var(--tone) 10%, var(--color-base-100));
	}
	.summary-value {
		margin-top: 5px;
		font-size: 24px;
		line-height: 1.1;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.monitoring-filters {
		display: grid;
		grid-template-columns:
			minmax(145px, 1fr) minmax(130px, 0.85fr) minmax(125px, 0.85fr) minmax(140px, 1fr)
			auto;
		align-items: end;
		gap: 12px;
		padding: 20px;
		background: var(--color-base-100);
	}
	.filter-field {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 7px;
		font-size: 14px;
		font-weight: 500;
	}
	.filter-field :global(.input),
	.filter-field :global(.select),
	.filter-submit {
		min-width: 0;
		height: 40px;
		min-height: 40px;
		font-size: 14px;
	}
	.filter-field :global(.input),
	.filter-field :global(.select) {
		background: var(--color-base-100);
	}
	.monitoring-results {
		padding: 20px;
		background: var(--color-base-100);
	}
	.results-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		font-size: 14px;
	}
	.results-journals {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: color-mix(in oklab, var(--color-base-content) 65%, transparent);
	}
	.status-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 18px;
		padding: 12px 0 16px;
		font-size: 11px;
		color: color-mix(in oklab, var(--color-base-content) 70%, transparent);
	}
	.status-legend > span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.status-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--monitor-muted);
	}
	.status-dot[data-status='scanned'] {
		background: var(--monitor-green);
	}
	.status-dot[data-status='ongoing'] {
		background: var(--monitor-amber);
	}
	.status-dot[data-status='elapsed'] {
		background: var(--monitor-red);
	}
	.status-dot[data-status='excused'] {
		background: var(--monitor-blue);
	}
	.matrix-scroll {
		overscroll-behavior-x: contain;
		-webkit-overflow-scrolling: touch;
		border: 1px solid var(--color-base-300);
		border-radius: 6px;
		background: var(--color-base-100);
		scrollbar-width: thin;
		outline-offset: -2px;
	}
	.matrix-scroll:focus-visible {
		outline: 2px solid var(--monitor-blue);
	}
	.class-matrix thead th {
		font-size: 12px;
		font-weight: 600;
	}
	.class-matrix tr > :last-child {
		border-right: 0;
	}
	.class-matrix .meeting-cell {
		padding: 10px;
	}
	.class-progress {
		margin-top: 16px;
		font-size: 11px;
		font-weight: 400;
	}
	.class-progress .progress {
		display: block;
		width: 100%;
		height: 4px;
		margin-bottom: 6px;
	}
	.class-progress span {
		color: color-mix(in oklab, var(--color-base-content) 60%, transparent);
	}
	.meeting-card {
		--tone: var(--monitor-muted);
		container-type: inline-size;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 12px 12px 0;
		border: 1px solid color-mix(in oklab, var(--tone) 24%, var(--color-base-300));
		border-left: 3px solid var(--tone);
		border-radius: 6px;
		background: color-mix(in oklab, var(--tone) 4%, var(--color-base-100));
	}
	.meeting-card[data-status='scanned'] {
		--tone: var(--monitor-green);
	}
	.meeting-card[data-status='ongoing'] {
		--tone: var(--monitor-amber);
	}
	.meeting-card[data-status='elapsed'] {
		--tone: var(--monitor-red);
	}
	.meeting-card[data-status='excused'] {
		--tone: var(--monitor-blue);
	}
	.meeting-content {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 8px;
	}
	.meeting-heading {
		display: flex;
		flex-wrap: wrap;
		align-items: start;
		gap: 8px;
		justify-content: space-between;
	}
	.meeting-subject {
		min-width: 0;
		flex: 1 1 120px;
		font-size: 13px;
		font-weight: 600;
		line-height: 1.5;
		overflow-wrap: anywhere;
		white-space: normal;
	}
	.meeting-status {
		height: auto;
		min-height: 22px;
		max-width: 100%;
		flex-shrink: 0;
		white-space: normal;
		font-size: 10px;
		line-height: 1.3;
		padding: 3px 6px;
		gap: 4px;
	}
	.meeting-teacher {
		display: flex;
		align-items: flex-start;
		gap: 6px;
		font-size: 12px;
		color: color-mix(in oklab, var(--color-base-content) 75%, transparent);
	}
	.meeting-teacher :global(svg) {
		margin-top: 2px;
	}
	.meeting-teacher span {
		min-width: 0;
		overflow-wrap: anywhere;
		white-space: normal;
		line-height: 1.5;
	}
	.meeting-substitute {
		font-size: 12px;
		line-height: 1.5;
		color: var(--monitor-blue);
		overflow-wrap: anywhere;
	}
	.meeting-time {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px 10px;
		font-size: 11px;
		color: color-mix(in oklab, var(--color-base-content) 70%, transparent);
	}
	.meeting-jp {
		padding: 2px 5px;
		border: 1px solid var(--color-base-300);
		border-radius: 4px;
		background: var(--color-base-100);
	}
	.meeting-scan {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		color: var(--monitor-green);
		font-weight: 500;
	}
	.meeting-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: auto;
		padding: 6px 0;
		border-top: 1px solid var(--color-base-300);
	}
	.meeting-journal {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		min-width: 0;
		white-space: normal;
		font-size: 11px;
	}
	.meeting-journal.btn {
		padding: 0 5px;
		height: 40px;
		min-height: 40px;
	}
	.empty-slot {
		display: grid;
		min-height: 130px;
		place-items: center;
		color: var(--monitor-muted);
	}
	.monitoring-sync {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
		font-size: 11px;
		color: color-mix(in oklab, var(--color-base-content) 60%, transparent);
	}
	@container (min-width: 520px) {
		.meeting-content {
			grid-template-columns: minmax(0, 1fr) auto;
			column-gap: 24px;
		}
		.meeting-heading {
			grid-column: 1 / -1;
		}
		.meeting-time {
			grid-column: 2;
			grid-row: 2 / span 2;
			align-content: start;
			justify-content: end;
			max-width: 240px;
		}
		.meeting-substitute {
			grid-column: 1;
		}
	}
	@media (max-width: 1279px) {
		.monitoring-filters {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.filter-submit {
			grid-column: 1 / -1;
		}
	}
	@media (max-width: 767px) {
		.monitoring-heading-bar {
			flex-direction: column;
			align-items: stretch;
			gap: 14px;
		}
		.monitoring-actions {
			justify-content: flex-end;
		}
		.summary-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 639px) {
		.monitoring-heading-icon {
			width: 36px;
			height: 36px;
		}
		.summary-item {
			padding: 12px;
			gap: 10px;
		}
		.monitoring-filters,
		.monitoring-results {
			padding: 16px;
		}
		.monitoring-filters {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 12px 10px;
		}
		.filter-field :global(.input),
		.filter-field :global(.select) {
			padding-inline: 9px;
		}
		.results-header {
			align-items: flex-start;
		}
		.results-journals {
			font-size: 11px;
		}
		.meeting-footer .btn-square {
			width: 40px;
			height: 40px;
		}
		.monitoring-sync {
			justify-content: flex-start;
		}
	}
</style>
