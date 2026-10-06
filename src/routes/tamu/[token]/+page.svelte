<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/icon.svelte';

	let { data, form } = $props();
	let formEl = $state<HTMLFormElement>(null!);
	let canvasEl = $state<HTMLCanvasElement>(null!);
	let drawing = $state(false);
	let signed = $state(false);
	let submitting = $state(false);
	let submitted = $state(false);
	let message = $state('');
	let lastX = 0;
	let lastY = 0;
	const gated = $derived(Boolean(data.passkeySet) && !data.unlocked);

	onMount(() => {
		if (!canvasEl) return;
		const resize = () => {
			const ratio = Math.min(window.devicePixelRatio || 1, 2);
			const rect = canvasEl.getBoundingClientRect();
			canvasEl.width = Math.max(1, Math.round(rect.width * ratio));
			canvasEl.height = Math.max(1, Math.round(rect.height * ratio));
			canvasEl.getContext('2d')?.scale(ratio, ratio);
			signed = false;
		};
		resize();
		window.addEventListener('resize', resize);
		return () => window.removeEventListener('resize', resize);
	});

	function position(event: PointerEvent) {
		const rect = canvasEl.getBoundingClientRect();
		return { x: event.clientX - rect.left, y: event.clientY - rect.top };
	}

	function startDraw(event: PointerEvent) {
		const point = position(event);
		lastX = point.x;
		lastY = point.y;
		drawing = true;
		canvasEl.setPointerCapture(event.pointerId);
	}

	function draw(event: PointerEvent) {
		if (!drawing) return;
		const context = canvasEl.getContext('2d');
		if (!context) return;
		const point = position(event);
		context.beginPath();
		context.moveTo(lastX, lastY);
		context.lineTo(point.x, point.y);
		context.strokeStyle = '#111827';
		context.lineWidth = 2;
		context.lineCap = 'round';
		context.stroke();
		lastX = point.x;
		lastY = point.y;
		signed = true;
	}

	function endDraw() {
		drawing = false;
	}

	function clearSignature() {
		const context = canvasEl?.getContext('2d');
		if (context) context.clearRect(0, 0, canvasEl.width, canvasEl.height);
		signed = false;
	}

	async function submitGuest(event: SubmitEvent) {
		event.preventDefault();
		if (submitting) return;
		submitting = true;
		message = '';
		const values = new FormData(formEl);
		try {
			const response = await fetch(`/api/buku-tamu/${data.token}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					nama: values.get('nama'),
					asalInstansi: values.get('asalInstansi'),
					nip: values.get('nip'),
					keperluan: values.get('keperluan'),
					pesanKesan: values.get('pesanKesan'),
					tandaTangan: signed ? canvasEl.toDataURL('image/png') : null
				})
			});
			const result = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(result.message || 'Data kunjungan gagal disimpan.');
			submitted = true;
			formEl.reset();
			clearSignature();
		} catch (error) {
			message = error instanceof Error ? error.message : 'Terjadi kesalahan saat menyimpan.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head><title>Buku Tamu - {data.sekolah?.nama ?? 'Kaganga'}</title></svelte:head>

<main class="bg-base-100 border-base-300 w-full max-w-2xl overflow-hidden rounded-lg border shadow-lg">
	<header class="border-base-300 flex items-center gap-4 border-b px-5 py-5 sm:px-7">
		{#if data.sekolah?.logoUrl}
			<img class="h-14 w-14 shrink-0 object-contain" src={data.sekolah.logoUrl} alt="Logo sekolah" />
		{:else}
			<div class="bg-primary/10 text-primary flex h-14 w-14 shrink-0 items-center justify-center rounded-md">
				<Icon name="school" class="h-7 w-7" />
			</div>
		{/if}
		<div class="min-w-0">
			<h1 class="text-xl font-bold sm:text-2xl">Buku Tamu</h1>
			<p class="text-base-content/65 mt-1 text-sm break-words">{data.sekolah?.nama ?? 'Kaganga'}</p>
		</div>
	</header>

	<section class="p-5 sm:p-7">
		{#if data.invalid}
			<div class="alert alert-error"><Icon name="error" /><span>Tautan Buku Tamu tidak valid.</span></div>
		{:else if gated}
			<form method="POST" action="?/unlock" class="mx-auto max-w-sm space-y-4">
				<div class="alert alert-info"><Icon name="lock" /><span>Masukkan passkey dari sekolah.</span></div>
				{#if form?.fail}<div class="text-error text-sm">{form.fail}</div>{/if}
				<label class="form-control">
					<span class="label-text mb-1 font-medium">Passkey</span>
					<input class="input input-bordered w-full" type="password" name="passkey" minlength="4" maxlength="64" required />
				</label>
				<button class="btn btn-primary w-full" type="submit"><Icon name="key" /> Buka Buku Tamu</button>
			</form>
		{:else if submitted}
			<div class="py-10 text-center">
				<div class="text-success mx-auto mb-4 flex justify-center"><Icon name="success" class="h-12 w-12" /></div>
				<h2 class="text-xl font-bold">Terima kasih</h2>
				<p class="text-base-content/65 mt-1">Data kunjungan Anda sudah tersimpan.</p>
				<button class="btn btn-primary mt-6" type="button" onclick={() => (submitted = false)}><Icon name="plus" /> Isi Kunjungan Lain</button>
			</div>
		{:else}
			<form bind:this={formEl} class="guest-form grid gap-x-4 gap-y-5 sm:grid-cols-2" onsubmit={submitGuest}>
				<label class="form-control"><span class="label-text mb-1 font-medium">Nama *</span><input class="input input-bordered" name="nama" maxlength="120" required /></label>
				<label class="form-control"><span class="label-text mb-1 font-medium">Asal / Instansi *</span><input class="input input-bordered" name="asalInstansi" maxlength="160" required /></label>
				<label class="form-control"><span class="label-text mb-1 font-medium">NIP (opsional)</span><input class="input input-bordered" name="nip" maxlength="40" /></label>
				<label class="form-control md:col-span-2"><span class="label-text mb-1 font-medium">Keperluan *</span><textarea class="textarea textarea-bordered" name="keperluan" rows="3" maxlength="1000" required></textarea></label>
				<label class="form-control md:col-span-2"><span class="label-text mb-1 font-medium">Pesan dan Kesan</span><textarea class="textarea textarea-bordered" name="pesanKesan" rows="2" maxlength="1000"></textarea></label>
				<div class="md:col-span-2">
					<div class="mb-1 flex items-center justify-between"><span class="text-sm font-medium">Tanda Tangan (opsional)</span><button class="btn btn-ghost btn-xs" type="button" onclick={clearSignature} disabled={!signed}>Hapus</button></div>
					<canvas bind:this={canvasEl} class="border-base-300 h-36 w-full touch-none rounded-md border bg-white" onpointerdown={startDraw} onpointermove={draw} onpointerup={endDraw} onpointercancel={endDraw} aria-label="Area tanda tangan"></canvas>
				</div>
				{#if message}<div class="alert alert-error py-2 md:col-span-2"><Icon name="error" /><span>{message}</span></div>{/if}
				<div class="guest-footer border-base-300 flex justify-end border-t pt-5"><button class="btn btn-primary w-full sm:w-auto sm:min-w-36" type="submit" disabled={submitting}>{#if submitting}<span class="loading loading-spinner loading-sm"></span>{:else}<Icon name="save" />{/if} Simpan</button></div>
			</form>
		{/if}
	</section>
</main>

<style>
	.form-control {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 0.375rem;
	}

	.label-text {
		margin-bottom: 0;
		font-size: 0.875rem;
	}

	.form-control input,
	.form-control textarea {
		width: 100%;
		min-width: 0;
	}

	.form-control textarea {
		resize: vertical;
	}

	.guest-form > :nth-child(n + 3) {
		grid-column: 1 / -1;
	}

	canvas {
		display: block;
	}
</style>
