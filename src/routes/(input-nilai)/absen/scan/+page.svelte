<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import { onDestroy } from 'svelte';

	type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => {
		detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>>;
	};

	type ScanResult = {
		ok: boolean;
		duplicate?: boolean;
		message: string;
		waktu?: string;
		murid?: {
			id: number;
			nama: string;
			kelas?: { nama?: string | null; fase?: string | null } | null;
		};
	};

	let videoEl: HTMLVideoElement | null = $state(null);
	let stream: MediaStream | null = $state(null);
	let scanning = $state(false);
	let cameraMessage = $state('');
	let manualToken = $state('');
	let mode = $state<'masuk' | 'pulang'>('masuk');
	let submitting = $state(false);
	let lastResult: ScanResult | null = $state(null);
	let scanLock = false;
	let timer: ReturnType<typeof setTimeout> | null = null;

	const hasBarcodeDetector = $derived(typeof window !== 'undefined' && 'BarcodeDetector' in window);

	function stopCamera() {
		scanning = false;
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		stream?.getTracks().forEach((track) => track.stop());
		stream = null;
	}

	onDestroy(stopCamera);

	async function submitToken(raw: string) {
		const token = raw.trim();
		if (!token || submitting || scanLock) return;
		submitting = true;
		scanLock = true;
		try {
			const response = await fetch('/api/absen/scan', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ token, mode })
			});
			const result = (await response.json().catch(() => null)) as ScanResult | null;
			if (!response.ok || !result?.ok) {
				const message = result?.message ?? 'QR tidak dapat diproses';
				lastResult = { ok: false, message };
				toast({ message, type: 'warning' });
				return;
			}
			lastResult = result;
			manualToken = '';
			toast({ message: result.message, type: result.duplicate ? 'info' : 'success' });
		} catch (err) {
			console.error(err);
			lastResult = { ok: false, message: 'Gagal menghubungi server scan' };
			toast({ message: 'Gagal menghubungi server scan', type: 'error' });
		} finally {
			submitting = false;
			setTimeout(() => {
				scanLock = false;
			}, 1500);
		}
	}

	async function startCamera() {
		if (!hasBarcodeDetector) {
			cameraMessage = 'Browser ini belum mendukung BarcodeDetector. Gunakan input token manual.';
			return;
		}
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: 'environment' } },
				audio: false
			});
			if (videoEl) {
				videoEl.srcObject = stream;
				await videoEl.play();
			}
			scanning = true;
			cameraMessage = 'Arahkan kamera ke QR absensi murid.';
			void scanLoop();
		} catch (err) {
			console.error(err);
			cameraMessage = 'Kamera tidak dapat dibuka. Periksa izin kamera browser.';
			stopCamera();
		}
	}

	async function scanLoop() {
		if (!scanning || !videoEl || !hasBarcodeDetector) return;
		try {
			const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
				.BarcodeDetector;
			if (!Detector) return;
			const detector = new Detector({ formats: ['qr_code'] });
			const codes = await detector.detect(videoEl);
			const value = codes[0]?.rawValue?.trim();
			if (value) await submitToken(value);
		} catch (err) {
			console.debug('scan qr error', err);
		}
		if (scanning) timer = setTimeout(() => void scanLoop(), 500);
	}

	function submitManual(event: Event) {
		event.preventDefault();
		void submitToken(manualToken);
	}

	function formatTime(value?: string) {
		if (!value) return '-';
		try {
			return new Intl.DateTimeFormat('id-ID', {
				dateStyle: 'medium',
				timeStyle: 'short'
			}).format(new Date(value));
		} catch {
			return value;
		}
	}
</script>

<svelte:head>
	<title>Scan QR Absensi</title>
</svelte:head>

<div class="mx-auto max-w-5xl space-y-4">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-xl font-bold">Scan QR Absensi</h1>
			<p class="text-base-content/70 text-sm">Presensi tersimpan sebagai data scan harian.</p>
		</div>
		<a class="btn btn-soft shadow-none" href="/absen">
			<Icon name="left" />
			Kembali
		</a>
	</div>

	<div class="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
		<section class="bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm">
			<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
				<div class="join">
					<button
						type="button"
						class="btn join-item shadow-none"
						class:btn-primary={mode === 'masuk'}
						onclick={() => (mode = 'masuk')}
					>
						Masuk
					</button>
					<button
						type="button"
						class="btn join-item shadow-none"
						class:btn-primary={mode === 'pulang'}
						onclick={() => (mode = 'pulang')}
					>
						Pulang
					</button>
				</div>
				{#if scanning}
					<button type="button" class="btn btn-error btn-soft shadow-none" onclick={stopCamera}>
						Stop Kamera
					</button>
				{:else}
					<button type="button" class="btn btn-primary shadow-none" onclick={startCamera}>
						Mulai Kamera
					</button>
				{/if}
			</div>

			<div class="bg-base-200 overflow-hidden rounded-md">
				<video bind:this={videoEl} class="aspect-video w-full object-cover" muted playsinline
				></video>
			</div>
			{#if cameraMessage}
				<p class="text-base-content/70 mt-3 text-sm">{cameraMessage}</p>
			{/if}
		</section>

		<aside class="space-y-4">
			<section class="bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm">
				<h2 class="mb-3 font-semibold">Input Token Manual</h2>
				<form class="space-y-3" onsubmit={submitManual}>
					<textarea
						class="textarea bg-base-200 min-h-28 w-full"
						bind:value={manualToken}
						placeholder="Tempel hasil QR/token di sini"
					></textarea>
					<button
						class="btn btn-primary w-full shadow-none"
						disabled={submitting || !manualToken.trim()}
					>
						{#if submitting}<span class="loading loading-spinner loading-xs"></span>{/if}
						Simpan Presensi
					</button>
				</form>
			</section>

			<section class="bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm">
				<h2 class="mb-3 font-semibold">Hasil Terakhir</h2>
				{#if lastResult}
					<div class="alert {lastResult.ok ? 'alert-success' : 'alert-warning'} alert-soft mb-3">
						<span>{lastResult.message}</span>
					</div>
					{#if lastResult.murid}
						<div class="space-y-1 text-sm">
							<p><span class="opacity-60">Nama:</span> <strong>{lastResult.murid.nama}</strong></p>
							<p>
								<span class="opacity-60">Kelas:</span>
								{lastResult.murid.kelas?.nama ?? '-'}
								{lastResult.murid.kelas?.fase ? ` - ${lastResult.murid.kelas.fase}` : ''}
							</p>
							<p><span class="opacity-60">Waktu:</span> {formatTime(lastResult.waktu)}</p>
						</div>
					{/if}
				{:else}
					<p class="text-base-content/60 text-sm">Belum ada scan.</p>
				{/if}
			</section>
		</aside>
	</div>
</div>
