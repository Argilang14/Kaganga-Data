<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/icon.svelte';
	import { onDestroy, onMount } from 'svelte';

	type ScanResult = {
		ok: boolean;
		code: string;
		message: string;
		status?: string;
		waktuScan?: string | null;
		kegiatan?: { id: number; nama: string };
		murid?: { id: number; nama: string; kelas: string; fotoUrl?: string };
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

	let { data }: { data: PageData } = $props();

	let videoEl: HTMLVideoElement;
	let scannerActive = $state(false);
	let loading = $state(false);
	let result = $state<ScanResult | null>(null);
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

	$effect(() => {
		if (scanMode === 'kegiatan' && !data.kegiatanList.length && data.canScanSekolah) {
			scanMode = 'sekolah';
		}
		if (!kegiatanId && data.kegiatanList[0]?.id) {
			kegiatanId = String(data.kegiatanList[0].id);
		}
	});

	const kegiatanAktif = $derived.by(() => {
		const id = Number(kegiatanId);
		return data.kegiatanList.find((item) => item.id === id) ?? null;
	});
	const canStartScan = $derived.by(() => {
		if (!canUseCamera || scannerActive) return false;
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

	async function submitToken(token: string) {
		const now = Date.now();
		if (token === lastToken && now - lastScanAt < 4000) return;
		lastToken = token;
		lastScanAt = now;
		loading = true;
		errorMessage = '';
		try {
			const response = await fetch('/api/administrasi/absensi/scan', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					token,
					mode: scanMode,
					kegiatanId: scanMode === 'kegiatan' ? kegiatanId : null,
					status: statusOverride || null
				})
			});
			result = (await response.json()) as ScanResult;
			if (result.murid || result.code !== 'invalid_token') {
				scanHistory = [result, ...scanHistory].slice(0, 8);
			}
		} catch (error) {
			console.error('[scan qr] failed', error);
			errorMessage = 'Gagal mengirim hasil scan. Periksa koneksi aplikasi.';
		} finally {
			loading = false;
		}
	}

	async function startScanner() {
		if (scannerActive) return;
		errorMessage = '';
		result = null;
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
		}
	}

	function stopScanner() {
		controls?.stop();
		controls = null;
		scannerActive = false;
	}

	function resultClass(code: string) {
		if (code === 'success') return 'alert-success';
		if (code === 'already_present') return 'alert-warning';
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

	function formatScanTime(value: string | null | undefined) {
		if (!value) return new Date().toLocaleTimeString('id-ID');
		return new Date(value).toLocaleTimeString('id-ID');
	}

	onDestroy(stopScanner);
	onMount(() => {
		void loadCameras();
	});
</script>

<div class="mx-auto max-w-5xl space-y-4">
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

	<div class="card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm">
		<div class="grid gap-3 xl:grid-cols-3">
			<label class="form-control min-w-0">
				<span class="label-text mb-1">Mode Scan</span>
				<select
					class="select select-bordered w-full"
					bind:value={scanMode}
					disabled={scannerActive}
					aria-label="Mode scan"
				>
					{#if data.kegiatanList.length}
						<option value="kegiatan">Absensi Kegiatan</option>
					{/if}
					{#if data.canScanSekolah && !data.kegiatanList.length}
						<option value="sekolah">Absensi Sekolah</option>
					{/if}
				</select>
			</label>
			<label class="form-control min-w-0">
				<span class="label-text mb-1">Kegiatan</span>
				<select
					class="select select-bordered w-full"
					bind:value={kegiatanId}
					disabled={scannerActive || scanMode !== 'kegiatan'}
					aria-label="Kegiatan absensi"
				>
					<option value="" disabled>Pilih kegiatan</option>
					{#each data.kegiatanList as kegiatan (kegiatan.id)}
						<option value={kegiatan.id}>{kegiatan.nama}</option>
					{/each}
				</select>
			</label>
			<label class="form-control min-w-0">
				<span class="label-text mb-1">Status Scan</span>
				<select
					class="select select-bordered w-full"
					bind:value={statusOverride}
					disabled={scannerActive}
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
					<label class="form-control min-w-56">
						<span class="label-text mb-1">Kamera</span>
						<select
							class="select select-sm select-bordered"
							bind:value={cameraDeviceId}
							disabled={scannerActive}
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
				<div class="flex gap-2">
					<button
						class="btn btn-primary btn-sm shadow-none"
						type="button"
						onclick={startScanner}
						disabled={!canStartScan}
					>
						<Icon name="activity" />
						Mulai Scan
					</button>
					<button
						class="btn btn-soft btn-sm shadow-none"
						type="button"
						onclick={stopScanner}
						disabled={!scannerActive}
					>
						Berhenti
					</button>
				</div>
			</div>
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
									{item.murid?.kelas ?? '-'} · {item.kegiatan?.nama ?? 'Absensi'} ·
									{formatScanTime(item.waktuScan)}
								</div>
							</div>
							<div class={`badge ${statusBadge(item.status)} badge-sm`}>
								{item.status ?? item.code}
							</div>
						</div>
					{/each}
				</div>
			{/if}
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
		<div class={`alert ${resultClass(result.code)}`}>
			<Icon name={result.ok ? 'success' : 'error'} />
			<div>
				<div class="font-semibold">{result.message}</div>
				{#if result.murid}
					<div class="text-sm">
						{result.murid.nama} · {result.murid.kelas}
						{result.kegiatan ? ` · ${result.kegiatan.nama}` : ''}
						{result.status ? ` · ${result.status}` : ''}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
