<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/icon.svelte';
	import AttendanceSummaryDialog from '$lib/components/absensi/AttendanceSummaryDialog.svelte';
	import TravelScanConfirmation from '$lib/components/absensi/TravelScanConfirmation.svelte';
	import DuplicateScanNotice from '$lib/components/absensi/DuplicateScanNotice.svelte';
	import { showModal, hideModalIf } from '$lib/components/global-modal.svelte';
	import type { TravelVerification } from '$lib/attendance-travel';
	import type {
		AttendanceScanGroup,
		AttendanceScanMode,
		ClassScanOptions
	} from '$lib/attendance-scan';
	import { onDestroy, onMount, tick, untrack } from 'svelte';

	type ScanResult = {
		ok: boolean;
		code: string;
		message: string;
		status?: string;
		waktuScan?: string | null;
		petugas?: { id: number; nama: string } | null;
		metode?: string;
		mode?: 'sekolah' | 'kegiatan';
		meeting?: ClassScanOptions['meetings'][number];
		kegiatan?: { id: number; nama: string };
		murid?: {
			id: number;
			nama: string;
			kelas: string;
			waliAsuh?: string | null;
			fotoUrl?: string;
		};
	};
	type Kegiatan = {
		id: number;
		nama: string;
		kategori: 'sekolah' | 'asrama' | 'makan' | 'sholat';
		batasTerlambat: string | null;
		aksesEdit: 'sekolah' | 'asrama' | 'semua';
	};
	type PageData = {
		kegiatanList: Kegiatan[];
		scanGroups: AttendanceScanGroup[];
		offlineScope: string;
		canSummary: boolean;
		canRecordActivities: boolean;
		travelEntry?: { operation: string; permitId: number | null } | null;
	};
	type PendingScan = {
		id: string;
		token: string;
		mode: 'sekolah' | 'kegiatan';
		kegiatanId: string | null;
		status: string | null;
		capturedAt: string;
		scanGroup?: AttendanceScanMode;
	};

	const OFFLINE_QUEUE_KEY = 'kaganga-absensi-offline-v1';
	const MAX_QUEUE_AGE_MS = 12 * 60 * 60 * 1000;
	const MAX_QUEUE_ITEMS = 200;

	let { data }: { data: PageData } = $props();

	let videoEl: HTMLVideoElement;
	let scannerActive = $state(false);
	let scannerStarting = $state(false);
	let loading = $state(false);
	let result = $state<ScanResult | null>(null);
	let resultElement = $state<HTMLDivElement>();
	let duplicateVisible = $state(false);
	$effect(() => {
		if (result?.code === 'already_present') {
			const duplicate = result;
			duplicateVisible = true;
			untrack(() =>
				showModal({
					title: duplicate.metode === 'qr' ? 'Sudah Dipindai' : 'Sudah Tercatat',
					body: DuplicateScanNotice,
					bodyProps: {
						record: duplicate,
						activity: activityLabel(duplicate),
						status: statusLabel(duplicate.status)
					},
					dismissible: true,
					onNeutral: { label: 'Lanjutkan Scan', icon: 'play' },
					onClose: () => {
						duplicateVisible = false;
					}
				})
			);
			void tick().then(() => resultElement?.scrollIntoView({ block: 'nearest' }));
		}
	});
	let studentInfo = $state<ScanResult | null>(null);
	let travelVerification = $state<TravelVerification | null>(null);
	let travelToken = '';
	let scanHistory = $state<ScanResult[]>([]);
	let errorMessage = $state('');
	let lastToken = '';
	let lastScanAt = 0;
	let controls: { stop: () => void } | null = null;
	let cameraDevices = $state<MediaDeviceInfo[]>([]);
	let cameraDeviceId = $state('');
	let scanMode = $state<AttendanceScanMode | ''>('');
	let kegiatanId = $state('');
	let classOptions = $state<ClassScanOptions | null>(null);
	let meetingKey = $state('');
	let loadingMeetings = $state(false);
	let meetingError = $state('');
	let legacyPendingCount = $state(0);
	let scannerGeneration = 0;
	let meetingGeneration = 0;
	let statusOverride = $state('');
	let isOnline = $state(true);
	let pendingCount = $state(0);
	let syncing = $state(false);

	const selectedGroup = $derived(data.scanGroups.find((group) => group.mode === scanMode));
	const selectedActivity = $derived(
		selectedGroup?.activities.find((item) => item.key === kegiatanId)
	);
	const activityId = $derived(
		selectedActivity?.activityId ? String(selectedActivity.activityId) : ''
	);
	const kegiatanAktif = $derived(data.kegiatanList.find((item) => item.id === Number(activityId)));
	const selectedMeeting = $derived(classOptions?.meetings.find((item) => item.key === meetingKey));
	const locked = $derived(
		scannerActive || scannerStarting || loading || syncing || !!travelVerification || duplicateVisible
	);
	const selectionReady = $derived(
		selectedGroup?.status === 'available' &&
			!!selectedActivity &&
			(!selectedGroup.onlineRequired || isOnline) &&
			(scanMode !== 'pegawai' || (!!selectedMeeting?.canScan && isOnline && !loadingMeetings))
	);
	const offlineQueueKey = $derived(`${OFFLINE_QUEUE_KEY}:${data.offlineScope}`);
	const canStartScan = $derived.by(() => {
		return canUseCamera && !locked && selectionReady;
	});

	function resetSelection() {
		stopScanner();
		kegiatanId = '';
		meetingKey = '';
		statusOverride = '';
		result = null;
		studentInfo = null;
		clearTravel();
		errorMessage = '';
		meetingError = '';
		classOptions = null;
		meetingGeneration++;
		if (scanMode === 'pegawai') void loadMeetings();
	}

	async function loadMeetings() {
		const generation = ++meetingGeneration;
		loadingMeetings = true;
		meetingError = '';
		try {
			if (!navigator.onLine)
				throw new Error('Koneksi terputus. Hubungkan jaringan untuk memuat jadwal.');
			const response = await fetch('/api/administrasi/absensi/scan/kelas', { cache: 'no-store' });
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.message ?? 'Jadwal gagal dimuat. Coba muat ulang.');
			if (generation !== meetingGeneration) return;
			classOptions = payload;
			if (!classOptions?.meetings.some((item) => item.key === meetingKey)) meetingKey = '';
		} catch (error) {
			if (generation !== meetingGeneration) return;
			classOptions = null;
			meetingError = error instanceof Error ? error.message : 'Jadwal gagal dimuat. Coba lagi.';
		} finally {
			if (generation === meetingGeneration) loadingMeetings = false;
		}
	}

	const canUseCamera = $derived.by(() => {
		if (typeof window === 'undefined') return true;
		const host = window.location.hostname;
		const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
		return window.isSecureContext || isLocalhost;
	});

	function cameraLabel(device: MediaDeviceInfo, index: number) {
		return device.label || `Kamera ${index + 1}`;
	}

	function preferredCameraId(devices: MediaDeviceInfo[]) {
		const backCamera = devices.find((device) =>
			/back|belakang|environment|rear/i.test(device.label)
		);
		return backCamera?.deviceId ?? devices[0]?.deviceId ?? '';
	}

	async function loadCameras() {
		if (!navigator.mediaDevices?.enumerateDevices) return;
		const devices = await navigator.mediaDevices.enumerateDevices();
		cameraDevices = devices.filter((device) => device.kind === 'videoinput');
		if (!cameraDeviceId || !cameraDevices.some((device) => device.deviceId === cameraDeviceId)) {
			cameraDeviceId = preferredCameraId(cameraDevices);
		}
	}

	function buildVideoConstraints(): MediaStreamConstraints {
		if (cameraDeviceId) {
			return {
				audio: false,
				video: {
					deviceId: { exact: cameraDeviceId },
					width: { ideal: 1920, min: 1280 },
					height: { ideal: 1080, min: 720 },
					frameRate: { ideal: 30 }
				}
			};
		}

		return {
			audio: false,
			video: {
				facingMode: { ideal: 'environment' },
				width: { ideal: 1920, min: 1280 },
				height: { ideal: 1080, min: 720 },
				frameRate: { ideal: 30 }
			}
		};
	}

	async function requestCameraPermission() {
		if (!navigator.mediaDevices?.getUserMedia) {
			throw new Error('Browser tidak mendukung akses kamera.');
		}
		const stream = await navigator.mediaDevices.getUserMedia(buildVideoConstraints());
		for (const track of stream.getTracks()) track.stop();
		await loadCameras();
	}

	function readPendingScans() {
		if (typeof localStorage === 'undefined') return [] as PendingScan[];
		try {
			const parsed = JSON.parse(localStorage.getItem(offlineQueueKey) ?? '[]');
			if (!Array.isArray(parsed)) return [];
			const cutoff = Date.now() - MAX_QUEUE_AGE_MS;
			return parsed.filter(
				(item): item is PendingScan =>
					typeof item?.id === 'string' &&
					typeof item?.token === 'string' &&
					['sekolah', 'kegiatan'].includes(item?.mode) &&
					Date.parse(item?.capturedAt) >= cutoff
			);
		} catch {
			return [];
		}
	}

	function writePendingScans(items: PendingScan[]) {
		localStorage.setItem(offlineQueueKey, JSON.stringify(items.slice(-MAX_QUEUE_ITEMS)));
		pendingCount = Math.min(items.length, MAX_QUEUE_ITEMS);
	}

	function queueScan(item: PendingScan) {
		const items = readPendingScans();
		const duplicate = items.some(
			(pending) =>
				pending.token === item.token &&
				pending.mode === item.mode &&
				pending.kegiatanId === item.kegiatanId
		);
		if (!duplicate) items.push(item);
		writePendingScans(items);
		result = {
			ok: true,
			code: 'queued_offline',
			message: duplicate
				? 'Scan ini sudah ada dalam antrean offline.'
				: 'Scan disimpan di perangkat dan akan disinkronkan saat koneksi kembali.',
			mode: item.mode,
			waktuScan: item.capturedAt
		};
		scanHistory = [result, ...scanHistory].slice(0, 8);
	}

	async function sendScan(item: PendingScan) {
		const response = await fetch('/api/administrasi/absensi/scan', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				token: item.token,
				mode: item.mode,
				kegiatanId: item.kegiatanId,
				status: item.status,
				capturedAt: item.capturedAt,
				scanGroup: item.scanGroup
			})
		});
		const payload = (await response.json().catch(() => ({
			ok: false,
			code: 'server_error',
			message: 'Respons server tidak dapat dibaca.'
		}))) as ScanResult;
		return { response, payload };
	}

	function showScanResult(payload: ScanResult, item: PendingScan) {
		result = {
			...payload,
			mode: item.mode,
			waktuScan: payload.waktuScan
		};
		if (result.murid) studentInfo = result;
		if (result.murid || result.code !== 'invalid_token') {
			scanHistory = [result, ...scanHistory].slice(0, 8);
		}
	}

	async function syncPendingScans() {
		if (syncing || !navigator.onLine) return;
		let items = readPendingScans();
		pendingCount = items.length;
		if (!items.length) return;
		syncing = true;
		errorMessage = '';
		try {
			for (const item of [...items]) {
				try {
					const { response, payload } = await sendScan(item);
					if (response.status >= 500 || response.status === 401 || response.status === 403) {
						throw new Error(payload.message);
					}
					showScanResult(payload, item);
					items = items.filter((pending) => pending.id !== item.id);
					writePendingScans(items);
				} catch (error) {
					console.warn('[scan qr] sinkronisasi tertunda', error);
					break;
				}
			}
			if (items.length)
				errorMessage = 'Sebagian antrean belum tersinkron. Coba lagi saat koneksi stabil.';
		} finally {
			syncing = false;
		}
	}

	async function submitToken(token: string) {
		if (loading || duplicateVisible) return;
		if (!selectionReady) {
			errorMessage = 'Pilih mode, kegiatan, dan pertemuan yang tersedia sebelum scan.';
			return;
		}
		const now = Date.now();
		if (token === lastToken && now - lastScanAt < 4000) return;
		lastToken = token;
		lastScanAt = now;
		loading = true;
		errorMessage = '';
		if (scanMode === 'pulang') {
			try {
				stopScanner();
				if (!navigator.onLine) throw new Error('Koneksi terputus. Scan perjalanan wajib daring.');
				const response = await fetch('/api/administrasi/absensi/scan/perjalanan', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ token, operation: kegiatanId })
				});
				const payload = await response.json();
				if (payload.code === 'already_present') {
					result = payload; studentInfo = payload;
					scanHistory = [payload, ...scanHistory].slice(0, 8);
					return;
				}
				if (!response.ok)
					throw new Error(payload.message ?? 'Izin tidak dapat diverifikasi. Pindai ulang.');
				if (data.travelEntry?.permitId && payload.verification?.id !== data.travelEntry.permitId)
					throw new Error('QR tidak sesuai dengan izin yang dipilih. Periksa anak dan pindai kartu yang sesuai.');
				travelToken = token;
				travelVerification = payload.verification;
			} catch (error) {
				errorMessage =
					error instanceof Error
						? error.message
						: 'Verifikasi gagal. Periksa koneksi lalu pindai ulang.';
			} finally {
				loading = false;
			}
			return;
		}
		if (scanMode === 'pegawai') {
			try {
				if (!navigator.onLine)
					throw new Error(
						'Scan kelas wajib terhubung ke server. Hubungkan jaringan lalu scan ulang.'
					);
				const response = await fetch('/api/administrasi/absensi/scan/kelas', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						key: meetingKey,
						qr: token,
						tanggal: classOptions?.tanggal,
						jenis: classOptions?.jenis
					})
				});
				const payload = await response.json();
				result = {
					...payload,
					ok: response.ok && payload.ok === true,
					code: response.status === 409 ? 'class_conflict' : (payload.code ?? 'class_scan_error')
				};
				if (result?.meeting) studentInfo = result;
				if (result) scanHistory = [result, ...scanHistory].slice(0, 8);
				if (response.ok || response.status === 409) {
					stopScanner();
					await loadMeetings();
				}
			} catch {
				errorMessage =
					'Hasil scan kelas belum terkonfirmasi. Periksa koneksi lalu pindai ulang; scan kelas tidak masuk antrean offline.';
			} finally {
				loading = false;
			}
			return;
		}
		const pending: PendingScan = {
			id: crypto.randomUUID(),
			token,
			mode: 'kegiatan',
			kegiatanId: activityId,
			scanGroup: scanMode || undefined,
			status: statusOverride || null,
			capturedAt: new Date().toISOString()
		};
		try {
			if (!navigator.onLine) {
				queueScan(pending);
				return;
			}
			const { response, payload } = await sendScan(pending);
			if (response.status >= 500) throw new Error(payload.message);
			showScanResult(payload, pending);
		} catch (error) {
			console.error('[scan qr] failed', error);
			queueScan(pending);
		} finally {
			loading = false;
		}
	}

	async function startScanner() {
		if (scannerActive || scannerStarting) return;
		errorMessage = '';
		result = null;
		scannerStarting = true;
		try {
			if (!canUseCamera) {
				errorMessage =
					'Kamera browser memerlukan HTTPS atau localhost. Untuk HP, buka aplikasi dari alamat HTTPS/tunnel atau jalankan di perangkat yang sama.';
				return;
			}
			if (!selectionReady) {
				errorMessage = 'Pilih kegiatan dan pertemuan yang tersedia sebelum mulai scan.';
				return;
			}
			const generation = ++scannerGeneration;
			await requestCameraPermission();
			if (generation !== scannerGeneration) return;
			lastToken = '';
			lastScanAt = 0;
			const { BrowserQRCodeReader } = await import('@zxing/browser');
			if (generation !== scannerGeneration) return;
			const reader = new BrowserQRCodeReader(undefined, {
				delayBetweenScanAttempts: 80,
				delayBetweenScanSuccess: 1200,
				tryPlayVideoTimeout: 5000
			});
			const startedControls = await reader.decodeFromConstraints(
				buildVideoConstraints(),
				videoEl,
				(scanResult, error) => {
					if (scanResult && generation === scannerGeneration)
						void submitToken(scanResult.getText());
					if (error && error.name !== 'NotFoundException') {
						console.debug('[scan qr] camera decode event', error);
					}
				}
			);
			if (generation !== scannerGeneration) {
				startedControls.stop();
				return;
			}
			controls = startedControls;
			scannerActive = true;
		} catch (error) {
			console.error('[scan qr] start failed', error);
			errorMessage =
				error instanceof Error
					? `Kamera tidak bisa dibuka: ${error.message}`
					: 'Kamera tidak bisa dibuka. Pastikan izin kamera sudah diberikan.';
			stopScanner();
		} finally {
			scannerStarting = false;
		}
	}

	function clearTravel() {
		travelVerification = null;
		travelToken = '';
		lastToken = '';
	}

	async function confirmTravel(pickupVerified: boolean) {
		if (!travelVerification || loading || !navigator.onLine) return;
		loading = true;
		errorMessage = '';
		try {
			const response = await fetch('/api/administrasi/absensi/scan/perjalanan', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					token: travelToken,
					operation: travelVerification.operation,
					confirm: true,
					permitId: travelVerification.id,
					revision: travelVerification.revision,
					pickupVerified
				})
			});
			const payload = await response.json();
			if (payload.code === 'already_present') {
				result = payload; studentInfo = payload;
				scanHistory = [payload, ...scanHistory].slice(0, 8);
				return;
			}
			if (!response.ok)
				throw new Error(
					payload.message ?? 'Konfirmasi gagal. Pindai ulang untuk memeriksa status.'
				);
			result = payload;
			studentInfo = payload;
			scanHistory = [payload, ...scanHistory].slice(0, 8);
		} catch (error) {
			errorMessage =
				error instanceof Error
					? error.message
					: 'Hasil belum terkonfirmasi. Periksa koneksi lalu pindai ulang untuk memastikan status.';
		} finally {
			clearTravel();
			loading = false;
		}
	}

	function stopScanner() {
		scannerGeneration++;
		controls?.stop();
		controls = null;
		scannerActive = false;
	}

	function resultClass(code: string) {
		if (code === 'on_home_leave') return 'alert-warning';
		if (code === 'success') return 'alert-success';
		if (code === 'class_conflict') return 'alert-warning';
		if (code === 'queued_offline') return 'alert-warning';
		return 'alert-error';
	}

	function statusBadge(status: string | undefined) {
		if (status === 'hadir') return 'badge-success';
		if (status === 'terlambat') return 'badge-warning';
		if (status === 'sakit') return 'badge-info';
		if (status === 'izin') return 'badge-primary';
		if (status === 'alfa') return 'badge-error';
		if (status === 'pulang') return 'badge-secondary';
		if (status === 'kembali') return 'badge-success';
		return 'badge-ghost';
	}

	function statusLabel(status: string | undefined) {
		const labels: Record<string, string> = {
			hadir: 'Hadir',
			terlambat: 'Terlambat',
			sakit: 'Sakit',
			izin: 'Izin',
			alfa: 'Alfa',
			pulang: 'Pulang',
			kembali: 'Kembali ke sekolah'
		};
		return status ? (labels[status] ?? status) : 'Tidak tercatat';
	}

	function activityLabel(item: ScanResult) {
		if (item.status === 'pulang') return 'Pulang ke Rumah';
		if (item.status === 'kembali') return 'Kembali ke Sekolah';
		return (
			item.meeting?.mapel ??
			item.kegiatan?.nama ??
			(item.mode === 'sekolah' ? 'Absensi Sekolah' : 'Absensi Kegiatan')
		);
	}

	function resultLabel(item: ScanResult) {
		if (item.code === 'class_conflict') return 'Periksa jadwal';
		if (item.code === 'already_present')
			return item.metode === 'qr' ? 'Sudah dipindai' : 'Sudah tercatat';
		if (item.status) return statusLabel(item.status);
		const labels: Record<string, string> = {
			success: 'Berhasil',
			already_present: 'Sudah tercatat',
			revoked_token: 'QR dicabut',
			invalid_activity: 'Kegiatan invalid',
			queued_offline: 'Menunggu sinkronisasi'
		};
		return labels[item.code] ?? 'Gagal';
	}

	function formatScanTime(value: string | null | undefined) {
		if (!value) return '-';
		return new Date(value).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' });
	}

	onDestroy(() => {
		stopScanner();
		hideModalIf(DuplicateScanNotice);
	});
	onMount(() => {
		if (data.travelEntry && data.scanGroups.some((group) => group.mode === 'pulang')) {
			scanMode = 'pulang'; kegiatanId = data.travelEntry.operation;
		}
		isOnline = navigator.onLine;
		writePendingScans(readPendingScans());
		const handleOnline = () => {
			isOnline = true;
			void syncPendingScans();
		};
		const handleOffline = () => (isOnline = false);
		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);
		void loadCameras();
		try {
			const legacy = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) ?? '[]');
			legacyPendingCount = Array.isArray(legacy) ? legacy.length : 0;
		} catch {
			legacyPendingCount = 0;
		}
		if (isOnline) void syncPendingScans();
		return () => {
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
		};
	});
</script>

<div class="w-full min-w-0 space-y-4" data-ui-revision="scan-groups-13-18">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h2 class="text-2xl font-bold">Scan QR Absensi</h2>
		</div>
		{#if data.canRecordActivities}
			<a class="btn btn-soft btn-sm shadow-none" href={resolve('/administrasi/absensi/kegiatan')}>
				<Icon name="left" />
				Kembali
			</a>
		{/if}
	</div>

	<div class={`alert ${isOnline ? 'alert-success' : 'alert-warning'} py-3`}>
		<Icon name={isOnline ? 'success' : 'warning'} />
		<div class="min-w-0 flex-1">
			<div class="font-semibold">{isOnline ? 'Jaringan tersedia' : 'Koneksi terputus'}</div>
			<div class="text-sm">
				{pendingCount
					? `${pendingCount} scan menunggu sinkronisasi.`
					: isOnline
						? 'Hasil scan langsung disimpan ke server.'
						: selectedGroup?.onlineRequired
							? 'Scan ini wajib daring dan tidak disimpan dalam antrean offline.'
							: 'Scan akan disimpan sementara di perangkat ini.'}
			</div>
		</div>
		{#if pendingCount}
			<button
				class="btn btn-sm"
				type="button"
				onclick={syncPendingScans}
				disabled={!isOnline || syncing}
			>
				{#if syncing}<span class="loading loading-spinner loading-xs"></span>{/if}
				Sinkronkan
			</button>
		{/if}
	</div>
	{#if legacyPendingCount}
		<div class="alert alert-warning alert-soft text-sm" role="status">
			<Icon name="warning" />
			<span
				>{legacyPendingCount} scan dari antrean lama masih tersimpan di perangkat. Minta operator memeriksa
				sebelum mencatat ulang; antrean ini belum memiliki identitas akun.</span
			>
		</div>
	{/if}

	<div class="card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm">
		<div class="grid gap-3 xl:grid-cols-3">
			<label class="grid min-w-0 gap-1 text-sm">
				<span class="label-text mb-1">Mode Scan</span>
				<select
					class="select select-bordered w-full"
					value={scanMode}
					onchange={(event) => {
						scanMode = event.currentTarget.value as AttendanceScanMode | '';
						resetSelection();
					}}
					disabled={locked}
					aria-label="Mode scan"
				>
					<option value="" disabled>Pilih mode scan</option>
					{#each data.scanGroups as group (group.mode)}
						<option value={group.mode}
							>{group.label}{group.status === 'prepared' ? ' (Segera tersedia)' : ''}</option
						>
					{/each}
				</select>
			</label>
			<label class="grid min-w-0 gap-1 text-sm">
				<span class="label-text mb-1">Kegiatan</span>
				<select
					class="select select-bordered w-full"
					bind:value={kegiatanId}
					onchange={() => {
						meetingKey = '';
						result = null;
						studentInfo = null;
						lastToken = '';
					}}
					disabled={locked || !selectedGroup || selectedGroup.status !== 'available'}
					aria-label="Kegiatan absensi"
					required
				>
					<option value="" disabled>Pilih kegiatan</option>
					{#each selectedGroup?.activities ?? [] as activity (activity.key)}
						<option value={activity.key}>{activity.label}</option>
					{/each}
				</select>
			</label>
			<label class="grid min-w-0 gap-1 text-sm">
				<span class="label-text mb-1">Status Scan</span>
				<select
					class="select select-bordered w-full"
					bind:value={statusOverride}
					disabled={locked || !selectedActivity || scanMode === 'pegawai' || scanMode === 'pulang'}
					aria-label="Status scan"
				>
					<option value=""
						>{scanMode === 'pegawai'
							? 'Kehadiran mengajar'
							: scanMode === 'pulang'
								? 'Sesuai perjalanan murid'
								: 'Otomatis hadir/terlambat'}</option
					>
					<option value="hadir">Hadir</option>
					<option value="terlambat">Terlambat</option>
				</select>
			</label>
		</div>
		{#if scanMode === 'pegawai'}
			<div class="border-base-200 mt-4 border-t pt-4">
				<div class="flex items-end gap-2">
					<label class="grid min-w-0 flex-1 gap-1 text-sm">
						<span>Pertemuan hari ini</span>
						<select
							class="select w-full"
							bind:value={meetingKey}
							aria-label="Pertemuan mengajar"
							disabled={locked || loadingMeetings || !selectedActivity}
						>
							<option value="" disabled
								>{loadingMeetings ? 'Memuat jadwal...' : 'Pilih pertemuan'}</option
							>
							{#each classOptions?.meetings ?? [] as meeting (meeting.key)}
								<option value={meeting.key} disabled={!meeting.canScan}
									>{meeting.kelas} · {meeting.mapel} · {meeting.mulai.slice(
										0,
										5
									)}–{meeting.selesai.slice(0, 5)}{meeting.scannedAt
										? ' (Sudah dipindai)'
										: !meeting.canScan
											? ' (Di luar waktu scan)'
											: ''}</option
								>
							{/each}
						</select>
					</label>
					<button
						type="button"
						class="btn btn-square shrink-0"
						onclick={loadMeetings}
						disabled={locked || loadingMeetings || !isOnline}
						aria-label="Muat ulang pertemuan"
						title="Muat ulang pertemuan"
					>
						{#if loadingMeetings}<span class="loading loading-spinner loading-sm"
							></span>{:else}<Icon name="repeat" />{/if}
					</button>
				</div>
				{#if meetingError}<p class="text-error mt-2 text-sm" role="alert">{meetingError}</p>
				{:else if classOptions && !classOptions.meetings.length}<p
						class="text-base-content/70 mt-2 text-sm"
					>
						Tidak ada pertemuan mengajar hari ini untuk akun ini.
					</p>{/if}
			</div>
		{/if}
		{#if selectedGroup}
			<div class="border-base-200 mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-sm">
				<span class="badge badge-soft badge-info"
					>QR {selectedGroup.qrKind === 'kelas' ? 'Kelas' : 'Murid'}</span
				>
				{#if selectedGroup.onlineRequired}<span class="badge badge-soft badge-warning"
						>Wajib daring</span
					>{/if}
				{#if selectedGroup.status === 'prepared'}<span class="text-base-content/70"
						>Scan pulang dan kembali belum tersedia.</span
					>{/if}
			</div>
		{/if}
		{#if kegiatanAktif}
			<div class="text-base-content/70 mt-3 text-sm">
				Kegiatan aktif: <span class="font-semibold">{kegiatanAktif.nama}</span>
				{#if kegiatanAktif.batasTerlambat}
					· Terlambat setelah {kegiatanAktif.batasTerlambat}
				{/if}
			</div>
		{/if}
	</div>

	{#if travelVerification}
		<TravelScanConfirmation
			verification={travelVerification}
			busy={loading}
			online={isOnline}
			onconfirm={confirmTravel}
			oncancel={clearTravel}
		/>
	{/if}

	{#if result}
		<div bind:this={resultElement} class={`alert ${resultClass(result.code)} sticky top-16 z-20 shadow-sm`} aria-live="assertive" data-testid="scan-result">
			<Icon name={result.code === 'success' ? 'success' : 'warning'} />
			<div class="min-w-0 wrap-anywhere">
				<div class="font-semibold">{result.message}</div>
				{#if result.murid}
					<div class="text-sm">
						{result.murid.nama} · {result.murid.kelas}
						{result.kegiatan ? ` · ${result.kegiatan.nama}` : ''}
						{result.status ? ` · ${statusLabel(result.status)}` : ''}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<div class="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
		<div class="card bg-base-100 border-base-200 overflow-hidden rounded-lg border shadow-sm">
			<div class="bg-base-200 relative mx-auto aspect-video max-h-[46vh] w-full overflow-hidden">
				<video bind:this={videoEl} class="h-full w-full object-cover" muted playsinline autoplay
				></video>
				<div class="pointer-events-none absolute inset-0 grid place-items-center">
					<div
						class="border-primary/80 h-32 w-32 rounded-lg border-2 shadow-[0_0_0_9999px_rgba(0,0,0,0.18)] sm:h-40 sm:w-40"
					></div>
				</div>
			</div>
			<div class="flex flex-wrap items-end justify-between gap-3 p-3">
				<div class="grid flex-1 gap-3 text-sm sm:grid-cols-[1fr_auto] sm:items-end">
					<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
						<div class="font-medium whitespace-nowrap">
							{scannerActive ? 'Scanner aktif' : 'Scanner belum aktif'}
						</div>
						<div class="text-base-content/60 text-sm">
							Dekatkan QR ke kotak tengah, pastikan kartu terang dan tidak miring.
						</div>
					</div>
					<label class="form-control w-full min-w-0 sm:w-auto sm:min-w-56">
						<span class="label-text mb-1">Kamera</span>
						<select
							class="select select-sm select-bordered"
							bind:value={cameraDeviceId}
							disabled={scannerActive || scannerStarting}
							aria-label="Pilih kamera"
						>
							<option value="">Otomatis kamera belakang</option>
							{#each cameraDevices as device, index (device.deviceId || index)}
								<option value={device.deviceId}>{cameraLabel(device, index)}</option>
							{/each}
						</select>
					</label>
					{#if !canUseCamera}
						<div class="alert alert-warning sm:col-span-2">
							<Icon name="warning" />
							<span>Alamat ini belum aman untuk akses kamera. Gunakan HTTPS atau localhost.</span>
						</div>
					{/if}
					{#if !cameraDevices.length}
						<div class="text-base-content/60 text-xs sm:col-span-2">
							Jika daftar kamera masih kosong, klik Mulai Scan lalu izinkan akses kamera.
						</div>
					{/if}
				</div>
				<div class="flex w-full flex-wrap gap-2 sm:w-auto">
					{#if data.canSummary && scanMode !== 'pegawai' && scanMode !== 'pulang'}
						<AttendanceSummaryDialog
							kegiatanId={activityId}
							label="Selesai & Ringkasan"
							onopen={stopScanner}
							finishMode
							pendingCount={pendingCount + legacyPendingCount}
							processing={loading || syncing || scannerStarting}
							online={isOnline}
							onresume={startScanner}
						/>
					{/if}
					<button
						class="btn btn-primary btn-sm flex-1 shadow-none sm:flex-none"
						type="button"
						onclick={startScanner}
						disabled={!canStartScan}
						aria-disabled={!canStartScan}
						title={!selectionReady ? 'Pilih kegiatan terlebih dahulu' : 'Mulai scan QR'}
					>
						<Icon name="activity" />
						Mulai Scan
					</button>
					<button
						class="btn btn-soft btn-sm flex-1 shadow-none sm:flex-none"
						type="button"
						onclick={stopScanner}
						disabled={!scannerActive}
					>
						Berhenti
					</button>
				</div>
			</div>
		</div>

		<div class="min-w-0 space-y-4">
			<div
				class="card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm"
				aria-live="polite"
			>
				<div class="mb-3 flex items-center justify-between gap-2">
					<h3 class="font-semibold">
						{scanMode === 'pegawai' ? 'Kehadiran Mengajar' : 'Informasi Murid'}
					</h3>
					{#if studentInfo?.status}
						<span class={`badge ${statusBadge(studentInfo.status)} badge-sm`}>
							{statusLabel(studentInfo.status)}
						</span>
					{/if}
				</div>
				{#if scanMode === 'pegawai' && studentInfo?.meeting}
					<div class="text-lg font-bold wrap-break-word">{studentInfo.meeting.guru}</div>
					<dl class="mt-3 grid gap-3 text-sm">
						<div>
							<dt class="text-base-content/60">Kelas / Mata Pelajaran</dt>
							<dd class="font-medium wrap-break-word">
								{studentInfo.meeting.kelas} · {studentInfo.meeting.mapel}
							</dd>
						</div>
						<div>
							<dt class="text-base-content/60">Jam Mengajar</dt>
							<dd>
								{studentInfo.meeting.mulai.slice(0, 5)}–{studentInfo.meeting.selesai.slice(0, 5)}
							</dd>
						</div>
						<div>
							<dt class="text-base-content/60">Waktu Scan</dt>
							<dd>{formatScanTime(studentInfo.waktuScan)}</dd>
						</div>
					</dl>
					<a
						class="btn btn-soft mt-4 w-full"
						href={resolve(
							`/jurnal-mengajar?${new URL(studentInfo.meeting.journalUrl, 'http://localhost').searchParams.toString()}`
						)}><Icon name="edit" />Isi Jurnal Mengajar</a
					>
				{:else if studentInfo?.murid}
					<div class="flex items-start gap-3">
						<div class="avatar placeholder shrink-0">
							<div class="bg-base-200 text-base-content/50 h-16 w-16 rounded-lg">
								{#if studentInfo.murid.fotoUrl}
									<img
										src={studentInfo.murid.fotoUrl}
										alt={studentInfo.murid.nama}
										onerror={(event) => {
											(event.currentTarget as HTMLImageElement).style.display = 'none';
										}}
									/>
								{/if}
								<span class="text-lg font-semibold">{studentInfo.murid.nama.slice(0, 1)}</span>
							</div>
						</div>
						<div class="min-w-0 flex-1">
							<div class="truncate text-lg font-bold">{studentInfo.murid.nama}</div>
							<div class="text-base-content/70 text-sm">{studentInfo.murid.kelas}</div>
						</div>
					</div>
					<dl class="border-base-200 mt-4 grid gap-3 border-t pt-3 text-sm">
						{#if scanMode !== 'pulang'}<div>
								<dt class="text-base-content/60">Wali Asuh</dt>
								<dd class="font-medium">{studentInfo.murid.waliAsuh || 'Belum ditetapkan'}</dd>
							</div>{/if}
						<div>
							<dt class="text-base-content/60">Keterangan Absensi</dt>
							<dd class="font-medium">
								{activityLabel(studentInfo)}
							</dd>
						</div>
						<div>
							<dt class="text-base-content/60">Waktu Scan</dt>
							<dd class="font-medium">{formatScanTime(studentInfo.waktuScan)}</dd>
						</div>
						<div>
							<dt class="text-base-content/60">Hasil Scan</dt>
							<dd class="font-medium">{studentInfo.message}</dd>
						</div>
						{#if studentInfo.petugas}<div>
								<dt class="text-base-content/60">Petugas pencatat</dt>
								<dd class="font-medium">{studentInfo.petugas.nama}</dd>
							</div>{/if}
					</dl>
				{:else}
					<div class="alert alert-info">
						<Icon name="info" />
						<span
							>{scanMode === 'pegawai'
								? 'Belum ada scan kelas pada sesi ini.'
								: 'Belum ada scan murid pada sesi ini.'}</span
						>
					</div>
				{/if}
			</div>
			<div class="card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm">
				<div class="mb-3 flex items-center justify-between gap-2">
					<h3 class="font-semibold">Riwayat Scan</h3>
					<span class="badge badge-soft">{scanHistory.length}</span>
				</div>
				{#if !scanHistory.length}
					<div class="alert alert-info">
						<Icon name="info" />
						<span>Belum ada hasil scan pada sesi ini.</span>
					</div>
				{:else}
					<div class="space-y-2">
						{#each scanHistory as item, index (`${item.murid?.id ?? item.code}-${item.waktuScan ?? ''}-${index}`)}
							<div class="border-base-200 flex items-center gap-3 rounded-lg border p-2">
								<div class="avatar placeholder">
									<div class="bg-base-200 text-base-content/50 h-12 w-12 rounded-lg">
										{#if item.murid?.fotoUrl}
											<img
												src={item.murid.fotoUrl}
												alt={item.murid.nama}
												onerror={(event) => {
													(event.currentTarget as HTMLImageElement).style.display = 'none';
												}}
											/>
										{/if}
										<span>{item.murid?.nama?.slice(0, 1) ?? '?'}</span>
									</div>
								</div>
								<div class="min-w-0 flex-1">
									<div class="font-semibold wrap-break-word">
										{item.murid?.nama ?? item.meeting?.guru ?? item.message}
									</div>
									<div class="text-base-content/60 truncate text-xs">
										{item.murid?.kelas ?? item.meeting?.kelas ?? '-'} · {activityLabel(item)} ·
										{formatScanTime(item.waktuScan)}
									</div>
								</div>
								<div class={`badge ${item.code === 'already_present' ? 'badge-error' : statusBadge(item.status)} badge-sm h-auto shrink-0 py-1 whitespace-normal`}>
									{resultLabel(item)}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>

	{#if loading}
		<div class="alert alert-info">
			<span class="loading loading-spinner loading-sm"></span>
			<span>Mengirim hasil scan...</span>
		</div>
	{/if}

	{#if errorMessage}
		<div class="alert alert-error">
			<Icon name="error" />
			<span>{errorMessage}</span>
		</div>
	{/if}

</div>
