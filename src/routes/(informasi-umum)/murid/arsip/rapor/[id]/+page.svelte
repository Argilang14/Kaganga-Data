<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- Paths use resolve before appending validated query parameters. */
	import { resolve } from '$app/paths';
	import { invalidate, goto } from '$app/navigation';
	import { onDestroy, untrack } from 'svelte';
	import Icon from '$lib/components/icon.svelte';
	import ReportMetadataFields from '$lib/components/murid/report-metadata-fields.svelte';
	import type { ReportMetadata } from '$lib/report-archive';
	let { data } = $props();
	let metadata = $state<ReportMetadata>(untrack(() => ({ ...data.report.metadata })));
	let confirmed = $state(false),
		confirmFinal = $state(false),
		busy = $state(false),
		message = $state(''),
		sourceHash = $state(''),
		pdfUrl = $state('');
	let controller: AbortController | undefined;
	let reason = $state(''),
		selectedVersion = $state('');
	const api = $derived(
		resolve(`/api/rapor-arsip/${data.report.historyId}`) +
			`?jenis=${data.report.kind}&periode=${data.report.period}`
	);
	function clearPreview() {
		if (pdfUrl) URL.revokeObjectURL(pdfUrl);
		pdfUrl = '';
		sourceHash = '';
		confirmFinal = false;
	}
	$effect(() => {
		const r = data.report;
		untrack(() => {
			metadata = { ...r.metadata };
			reason = '';
			selectedVersion = r.archived?.id ?? '';
			confirmed = false;
			message = '';
			clearPreview();
		});
	});
	onDestroy(() => {
		controller?.abort();
		clearPreview();
	});
	function changed(event: Event) {
		if ((event.target as HTMLInputElement).name !== 'confirmFinal') clearPreview();
	}
	async function make(action: 'preview' | 'finalize' | 'saved') {
		if (busy) return;
		busy = true;
		message = '';
		controller = new AbortController();
		try {
			const response = await fetch(api + (action === 'saved' ? `&versi=${selectedVersion}` : ''), {
				method: action === 'saved' ? 'GET' : 'POST',
				headers: action === 'saved' ? {} : { 'content-type': 'application/json' },
				body:
					action === 'saved'
						? undefined
						: JSON.stringify({
								action: data.revision
									? action === 'preview'
										? 'revise-preview'
										: 'revise-finalize'
									: action,
								reason,
								expectedVersionId: data.report.archived?.id,
								metadata,
								confirmMetadata: confirmed,
								confirmFinal,
								expectedHash: sourceHash
							}),
				signal: controller.signal
			});
			if (!response.ok) {
				const problem = await response
					.json()
					.catch(() => ({ message: 'Dokumen gagal diproses. Coba lagi.' }));
				throw new Error(problem.message ?? 'Dokumen gagal diproses.');
			}
			if (action === 'finalize') {
				clearPreview();
				if (data.revision)
					await goto(
						resolve(`/murid/arsip/rapor/${data.report.historyId}`) +
							`?jenis=${data.report.kind}&periode=${data.report.period}`
					);
				else await invalidate('app:rapor-arsip');
				message = 'Rapor final berhasil disimpan.';
			} else {
				const blob = await response.blob();
				clearPreview();
				pdfUrl = URL.createObjectURL(blob);
				sourceHash = response.headers.get('X-Report-Source-Hash') ?? '';
			}
		} catch (cause) {
			if (!(cause instanceof DOMException && cause.name === 'AbortError'))
				message = cause instanceof Error ? cause.message : 'Dokumen gagal diproses.';
		} finally {
			busy = false;
		}
	}
</script>

<section class="bg-base-100 space-y-4 rounded-lg p-4">
	<header class="flex flex-wrap items-start justify-between gap-3 border-b border-base-200 pb-4">
		<div>
			<h1 class="text-xl font-bold">Rapor Riwayat Pendidikan</h1>
			<p class="mt-1 text-sm text-base-content/65">
				{data.report.studentName} · {data.report.className} · {data.report.semester} ({data.report
					.year})
			</p>
		</div>
		<a href={resolve('/murid/arsip/rapor')} class="btn btn-soft"
			><Icon name="left" /> Riwayat Rapor</a
		>
	</header>
	<nav class="flex flex-wrap gap-2" aria-label="Jenis rapor">
		{#if data.report.availableKinds.includes('sekolah')}
			<a
				href={resolve(`/murid/arsip/rapor/${data.report.historyId}`) + '?jenis=sekolah&periode=ras'}
				class="btn btn-sm"
				class:btn-primary={data.report.kind === 'sekolah'}
				aria-current={data.report.kind === 'sekolah' ? 'page' : undefined}>Rapor sekolah</a
			>
		{/if}
		{#if data.report.availableKinds.includes('asrama')}<a
				href={resolve(`/murid/arsip/rapor/${data.report.historyId}`) + '?jenis=asrama&periode=ras'}
				class="btn btn-sm"
				class:btn-primary={data.report.kind === 'asrama'}
				aria-current={data.report.kind === 'asrama' ? 'page' : undefined}>Rapor asrama</a
			>
		{/if}
		{#if data.report.availableKinds.includes('martikulasi')}<a
				href={resolve(`/murid/arsip/rapor/${data.report.historyId}`) +
					'?jenis=martikulasi&periode=ras'}
				class="btn btn-sm"
				class:btn-primary={data.report.kind === 'martikulasi'}
				aria-current={data.report.kind === 'martikulasi' ? 'page' : undefined}>Rapor martikulasi</a
			>{/if}
		{#if data.report.kind === 'sekolah'}
			<a
				href={resolve(`/murid/arsip/rapor/${data.report.historyId}`) + '?jenis=sekolah&periode=rts'}
				class="btn btn-sm btn-soft"
				class:btn-primary={data.report.period === 'rts'}
				aria-current={data.report.period === 'rts' ? 'page' : undefined}>Tengah semester</a
			>
			<a
				href={resolve(`/murid/arsip/rapor/${data.report.historyId}`) + '?jenis=sekolah&periode=ras'}
				class="btn btn-sm btn-soft"
				class:btn-primary={data.report.period === 'ras'}
				aria-current={data.report.period === 'ras' ? 'page' : undefined}>Akhir semester</a
			>
		{/if}
	</nav>
	<div class="flex flex-wrap items-center gap-3 text-sm">
		<span
			class="badge badge-soft"
			class:badge-success={!!data.report.archived}
			class:badge-warning={!data.report.archived}
			>{data.report.archived ? 'Arsip final tersedia' : 'Belum difinalisasi'}</span
		>
		<span
			>Nilai inti: <strong>{data.report.coverage.filled}/{data.report.coverage.expected}</strong
			></span
		>
	</div>
	{#if message}<div class="alert alert-info alert-soft text-sm" role="status">
			<Icon name="info" /><span>{message}</span>
		</div>{/if}
	{#if data.report.archived && !data.revision}
		<div class="overflow-x-auto">
			<table class="table table-sm min-w-[560px]">
				<thead><tr><th>Versi</th><th>Waktu</th><th>Alasan</th></tr></thead><tbody
					>{#each data.report.versions as version (version.id)}<tr
							><td class="whitespace-nowrap"
								>v{version.number}{version.id === data.report.archived.id ? ' · Terbaru' : ''}</td
							><td class="whitespace-nowrap text-xs">{version.createdAt} UTC</td><td
								class="max-w-sm whitespace-normal break-words">{version.reason}</td
							></tr
						>{/each}</tbody
				>
			</table>
		</div>
		<div class="flex flex-wrap gap-2">
			<label class="flex min-w-0 items-center gap-2 text-sm"
				>Versi<select
					class="select h-10 w-40"
					bind:value={selectedVersion}
					disabled={busy}
					onchange={clearPreview}
					>{#each data.report.versions as version (version.id)}<option value={version.id}
							>v{version.number}{version.id === data.report.archived.id ? ' · Terbaru' : ''}</option
						>{/each}</select
				></label
			>
			<button class="btn btn-soft" disabled={busy} onclick={() => make('saved')}
				><Icon name="eye" /> Buka arsip final</button
			>
			<a
				class="btn btn-success"
				href={resolve(`/api/rapor-arsip/${data.report.historyId}`) +
					`?jenis=${data.report.kind}&periode=${data.report.period}&download=1&versi=${selectedVersion}`}
				><Icon name="download" /> Unduh PDF final</a
			>
			{#if data.report.canRevise}<a
					class="btn btn-warning btn-soft"
					href={resolve(`/murid/arsip/rapor/${data.report.historyId}`) +
						`?jenis=${data.report.kind}&periode=${data.report.period}&revisi=1`}
					><Icon name="edit" /> Buat revisi</a
				>{/if}
		</div>
	{:else if data.report.coverage.observed === 0}
		<div class="border border-dashed border-base-300 p-8 text-center text-base-content/65">
			<Icon name="info" />
			<p class="mt-2 font-medium">Data rapor belum tersedia</p>
			<p class="mt-1 text-sm">Belum ada penilaian untuk murid pada periode ini.</p>
		</div>
	{:else}
		<div class="grid min-w-0 gap-5 xl:grid-cols-[minmax(320px,440px)_minmax(0,1fr)]">
			<form
				class="min-w-0 space-y-4"
				onsubmit={(event) => {
					event.preventDefault();
					void make('preview');
				}}
				oninput={changed}
			>
				<div class="alert alert-warning alert-soft text-sm">
					<Icon name="warning" /><span>{data.report.metadataWarning}</span>
				</div>
				{#if data.revision}<label class="block text-sm font-medium"
						>Alasan revisi<textarea
							class="textarea mt-1 h-24 w-full"
							bind:value={reason}
							minlength="10"
							maxlength="1000"
							required
							disabled={busy}></textarea></label
					>{/if}
				<ReportMetadataFields bind:value={metadata} kind={data.report.kind} disabled={busy} />
				<label class="flex items-start gap-3 text-sm"
					><input
						type="checkbox"
						class="checkbox checkbox-sm mt-0.5 shrink-0"
						bind:checked={confirmed}
						disabled={busy}
					/><span>Saya sudah memeriksa identitas dan penandatangan sesuai periode rapor ini.</span
					></label
				>
				<button class="btn btn-primary w-full" type="submit" disabled={busy || !confirmed}
					>{#if busy}<span class="loading loading-spinner loading-sm"></span>{:else}<Icon
							name="eye"
						/>{/if} Pratinjau PDF</button
				>
				{#if data.report.canFinalize}
					<label class="flex items-start gap-3 text-sm"
						><input
							type="checkbox"
							name="confirmFinal"
							class="checkbox checkbox-sm mt-0.5 shrink-0"
							bind:checked={confirmFinal}
							disabled={busy || !sourceHash}
						/><span>Saya sudah memeriksa PDF dan menyetujui penyimpanan sebagai rapor final.</span
						></label
					>
					<button
						class="btn btn-success w-full"
						type="button"
						disabled={busy ||
							!sourceHash ||
							!confirmFinal ||
							data.report.coverage.status !== 'nilai_inti_lengkap'}
						onclick={() => make('finalize')}
						><Icon name="save" />
						{data.revision ? 'Simpan revisi final' : 'Simpan rapor final'}</button
					>
				{/if}
				{#if data.report.coverage.status !== 'nilai_inti_lengkap'}<p class="text-sm text-warning">
						Nilai inti belum lengkap. Dokumen hanya dapat diperiksa sebagai draf.
					</p>{/if}
			</form>
			<div class="min-w-0">
				{#if pdfUrl}<div class="mb-3 flex flex-wrap gap-2">
						<a class="btn btn-sm btn-soft" href={pdfUrl} target="_blank" rel="noopener noreferrer"
							><Icon name="eye" /> Buka PDF di tab baru</a
						><a class="btn btn-sm btn-soft" href={pdfUrl} download="Rapor_draf.pdf"
							><Icon name="download" /> Unduh draf</a
						>
					</div>
					<iframe
						title="Pratinjau rapor periode terpilih"
						src={pdfUrl}
						class="h-[75dvh] min-h-[400px] w-full rounded-md border border-base-300"
					></iframe>
				{:else}<div
						class="flex min-h-[320px] items-center justify-center border border-dashed border-base-300 text-sm text-base-content/55"
					>
						Pratinjau belum tersedia.
					</div>{/if}
			</div>
		</div>
	{/if}
	{#if data.report.archived && !data.revision && pdfUrl}<iframe
			title="Arsip rapor final"
			src={pdfUrl}
			class="h-[75dvh] min-h-[400px] w-full border border-base-300"
		></iframe>{/if}
</section>
