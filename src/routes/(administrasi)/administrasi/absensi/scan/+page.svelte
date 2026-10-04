<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/icon.svelte';
	import AttendanceSummaryDialog from '$lib/components/absensi/AttendanceSummaryDialog.svelte';
	import { onDestroy, onMount } from 'svelte';

	type ScanResult = {
		ok: boolean;
		code: string;
		message: string;
		status?: string;
		waktuScan?: string | null;
		mode?: 'sekolah' | 'kegiatan';
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
		canScanSekolah: boolean;
		kegiatanList: Kegiatan[];
	};
	type PendingScan = {
		id: string;
		token: string;
		mode: 'sekolah' | 'kegiatan';
		kegiatanId: string | null;
		status: string | null;
		capturedAt: string;
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
	let studentInfo = $state<ScanResult | null>(null);
	let scanHistory = $state<ScanResult[]>([]);
	let errorMessage = $state('');
	let lastToken = '';
	let lastScanAt = 0;
	let controls: { stop: () => void } | null = null;
	let cameraDevices = $state<MediaDeviceInfo[]>([]);
	let cameraDeviceId = $state('');
	let scanMode = $state<'sekolah' | 'kegiatan'>('kegiatan');
	let kegiatanId = $state('');
	let statusOverride = $state('');
	let isOnline = $state(true);
	let pendingCount = $state(0);
	let syncing = $state(false);

	const kegiatanAktif = $derived.by(() => {
		const id = Number(kegiatanId);
		return data.kegiatanList.find((item) => item.id === id) ?? null;
	});
	const canStartScan = $derived.by(() => {
		if (!canUseCamera || scannerActive || scannerStarting) return false;
		if (scanMode === 'sekolah') return data.canScanSekolah;
		return !!kegiatanAktif;
	});

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
			const parsed = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) ?? '[]');
			if (!Array.isArray(parsed)) return [];
			const cutoff = Date.now() - MAX_QUEUE_AGE_MS;
			return parsed.filter(
				(item): item is PendingScan =>
					typeof item?.id === 'string' &&
					typeof item?.token === 'string' &&
					Date.parse(item?.capturedAt) >= cutoff
			);
		} catch {
			return [];
		}
	}

	function writePendingScans(items: PendingScan[]) {
		localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items.slice(-MAX_QUEUE_ITEMS)));
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
				capturedAt: item.capturedAt
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
			waktuScan: payload.waktuScan ?? item.capturedAt
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
		if (loading) return;
		if (scanMode === 'kegiatan' && !kegiatanAktif) {
			errorMessage = 'Pilih kegiatan terlebih dahulu sebelum mulai scan.';
			return;
		}
		const now = Date.now();
		if (token === lastToken && now - lastScanAt < 4000) return;
		lastToken = token;
		lastScanAt = now;
		loading = true;
		errorMessage = '';
		const pending: PendingScan = {
			id: crypto.randomUUID(),
			token,
			mode: scanMode,
			kegiatanId: scanMode === 'kegiatan' ? kegiatanId : null,
			status: statusOverride || null,
			capturedAt: new Date().toISOString()
		};
		try {
			if (!navigator.onLine) {
				queueScan(pending);
				return;
			}
			const { payload } = await sendScan(pending);
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
			if (scanMode === 'kegiatan' && !kegiatanAktif) {
				errorMessage = 'Pilih kegiatan terlebih dahulu sebelum mulai scan.';
				return;
			}
			if (scanMode === 'sekolah' && !data.canScanSekolah) {
				errorMessage = 'Akun ini tidak memiliki akses scan Absensi Sekolah.';
				return;
			}
			await requestCameraPermission();
			lastToken = '';
			lastScanAt = 0;
			const { BrowserQRCodeReader } = await import('@zxing/browser');
			const reader = new BrowserQRCodeReader(undefined, {
				delayBetweenScanAttempts: 80,
				delayBetweenScanSuccess: 1200,
				tryPlayVideoTimeout: 5000
			});
			controls = await reader.decodeFromConstraints(
				buildVideoConstraints(),
				videoEl,
				(scanResult, error) => {
					if (scanResult) void submitToken(scanResult.getText());
					if (error && error.name !== 'NotFoundException') {
						console.debug('[scan qr] camera decode event', error);
					}
				}
			);
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

	function stopScanner() {
		controls?.stop();
		controls = null;
		scannerActive = false;
	}

	function resultClass(code: string) {
		if (code === 'success') return 'alert-success';
		if (code === 'already_present' || code === 'queued_offline') return 'alert-warning';
		return 'alert-error';
	}

	function statusBadge(status: string | undefined) {
		if (status === 'hadir') return 'badge-success';
		if (status === 'terlambat') return 'badge-warning';
		if (status === 'sakit') return 'badge-info';
		if (status === 'izin') return 'badge-primary';
		if (status === 'alfa') return 'badge-error';
		if (status === 'pulang') return 'badge-secondary';
		return 'badge-ghost';
	}

	function statusLabel(status: string | undefined) {
		const labels: Record<string, string> = {
			hadir: 'Hadir',
			terlambat: 'Terlambat',
			sakit: 'Sakit',
			izin: 'Izin',
			alfa: 'Alfa',
			pulang: 'Pulang'
		};
		return status ? (labels[status] ?? status) : 'Tidak tercatat';
	}

	function activityLabel(item: ScanResult) {
		return (
			item.kegiatan?.nama ?? (item.mode === 'sekolah' ? 'Absensi Sekolah' : 'Absensi Kegiatan')
		);
	}

	function resultLabel(item: ScanResult) {
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
		if (!value) return new Date().toLocaleTimeString('id-ID');
		return new Date(value).toLocaleTimeString('id-ID');
	}

	onDestroy(stopScanner);
	onMount(() => {
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
		if (isOnline) void syncPendingScans();
		return () => {
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
		};
	});
</script>

<div class="w-full min-w-0 space-y-4">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h2 class="text-2xl font-bold">Scan QR Absensi</h2>
			<p class="text-base-content/70 text-sm">Arahkan kamera ke kartu absensi siswa.</p>
		</div>
		<a class="btn btn-soft btn-sm shadow-none" href={resolve('/administrasi/absensi/kegiatan')}>
			<Icon name="left" />
			Kembali
		</a>
	</div>

	<div class={`alert ${isOnline ? 'alert-success' : 'alert-warning'} py-3`}>
		<Icon name={isOnline ? 'success' : 'warning'} />
		<div class="min-w-0 flex-1">
			<div class="font-semibold">{isOnline ? 'Terhubung ke server' : 'Mode offline aktif'}</div>
			<div class="text-sm">
				{pendingCount
					? `${pendingCount} scan menunggu sinkronisasi.`
					: isOnline
						? 'Hasil scan langsung disimpan ke server.'
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

	<div class="card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm">
		<div class="grid gap-3 xl:grid-cols-3">
			<label class="form-control min-w-0">
				<span class="label-text mb-1">Mode Scan</span>
				<select
					class="select select-bordered w-full"
					bind:value={scanMode}
					disabled={scannerActive || scannerStarting}
					aria-label="Mode scan"
				>
					<option value="kegiatan">Absensi Kegiatan</option>
				</select>
			</label>
			<label class="form-control min-w-0">
				<span class="label-text mb-1">Kegiatan</span>
				<select
					class="select select-bordered w-full"
					bind:value={kegiatanId}
					disabled={scannerActive ||
						scannerStarting ||
						scanMode !== 'kegiatan' ||
						!data.kegiatanList.length}
					aria-label="Kegiatan absensi"
					required
				>
					<option value="" disabled>Pilih kegiatan</option>
					{#each data.kegiatanList as kegiatan (kegiatan.id)}
						<option value={String(kegiatan.id)}>{kegiatan.nama}</option>
					{/each}
				</select>
			</label>
			<label class="form-control min-w-0">
				<span class="label-text mb-1">Status Scan</span>
				<select
					class="select select-bordered w-full"
					bind:value={statusOverride}
					disabled={scannerActive || scannerStarting}
					aria-label="Status scan"
				>
					<option value="">Otomatis hadir/terlambat</option>
					<option value="hadir">Hadir</option>
					<option value="terlambat">Terlambat</option>
					<option value="sakit">Sakit</option>
					<option value="izin">Izin</option>
					<option value="alfa">Alfa</option>
					{#if scanMode === 'kegiatan'}
						<option value="pulang">Pulang</option>
					{/if}
				</select>
			</label>
		</div>
		{#if scanMode === 'kegiatan' && kegiatanAktif}
			<div class="text-base-content/70 mt-3 text-sm">
				Kegiatan aktif: <span class="font-semibold">{kegiatanAktif.nama}</span>
				{#if kegiatanAktif.batasTerlambat}
					· Terlambat setelah {kegiatanAktif.batasTerlambat}
				{/if}
			</div>
		{/if}
	</div>

	<div class="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
		<div class="card bg-base-100 border-base-200 overflow-hidden rounded-lg border shadow-sm">
			<div class="bg-base-200 relative mx-auto aspect-video max-h-[46vh] w-full">
				<video bind:this={videoEl} class="h-full w-full object-cover" muted playsinline autoplay
				></video>
				<div class="pointer-events-none absolute inset-0 grid place-items-center">
					<div
						class="border-primary/80 h-40 w-40 rounded-xl border-2 shadow-[0_0_0_9999px_rgba(0,0,0,0.18)]"
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
					<AttendanceSummaryDialog {kegiatanId} label="Selesai & Ringkasan" onopen={stopScanner} />
					<button
						class="btn btn-primary btn-sm flex-1 shadow-none sm:flex-none"
						type="button"
						onclick={startScanner}
						disabled={!canStartScan}
						aria-disabled={!canStartScan}
						title={scanMode === 'kegiatan' && !kegiatanAktif
							? 'Pilih kegiatan terlebih dahulu'
							: 'Mulai scan QR'}
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
					<h3 class="font-semibold">Informasi Siswa</h3>
					{#if studentInfo?.status}
						<span class={`badge ${statusBadge(studentInfo.status)} badge-sm`}>
							{statusLabel(studentInfo.status)}
						</span>
					{/if}
				</div>
				{#if studentInfo?.murid}
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
						<div>
							<dt class="text-base-content/60">Wali Asuh</dt>
							<dd class="font-medium">{studentInfo.murid.waliAsuh || 'Belum ditetapkan'}</dd>
						</div>
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
					</dl>
				{:else}
					<div class="alert alert-info">
						<Icon name="info" />
						<span>Informasi siswa akan tampil setelah QR berhasil dipindai.</span>
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
						<span>Belum ada siswa yang terbaca pada sesi ini.</span>
					</div>
				{:else}
					<div class="space-y-2">
						{#each scanHistory as item, index (`${item.murid?.id ?? item.code}-${item.waktuScan ?? index}`)}
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
									<div class="truncate font-semibold">{item.murid?.nama ?? item.message}</div>
									<div class="text-base-content/60 truncate text-xs">
										{item.murid?.kelas ?? '-'} · {activityLabel(item)} ·
										{formatScanTime(item.waktuScan)}
									</div>
								</div>
								<div class={`badge ${statusBadge(item.status)} badge-sm`}>
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

	{#if result}
		<div class={`alert ${resultClass(result.code)}`} aria-live="polite">
			<Icon name={result.ok ? 'success' : 'error'} />
			<div>
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
</div>
