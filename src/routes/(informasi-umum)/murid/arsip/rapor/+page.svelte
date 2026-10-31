<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- Local paths are resolved before adding filter queries; PDF URLs are revocable blobs. */
	import { resolve } from '$app/paths';
	import { invalidate } from '$app/navigation';
	import { onDestroy, untrack } from 'svelte';
	import Icon from '$lib/components/icon.svelte';
	import ReportMetadataFields from '$lib/components/murid/report-metadata-fields.svelte';
	import type { ReportMetadata } from '$lib/report-archive';
	import { archiveKindLabel } from '$lib/report-archive';
	import { reportArchiveFilters } from '$lib/report-archive-filters';
	let { data } = $props();
	let filterKind = $state(untrack(() => data.kind)),
		filterPeriod = $state(untrack(() => data.period));
	let filterYear = $state(untrack(() => data.yearId)),
		filterSemester = $state(untrack(() => data.semesterId)),
		filterClass = $state(untrack(() => data.classId));
	const choices = $derived(
		reportArchiveFilters(data.classOptions, {
			yearId: filterYear,
			semesterId: filterSemester,
			classId: filterClass
		})
	);
	const filtersPending = $derived(
		filterYear !== data.yearId ||
			filterSemester !== data.semesterId ||
			filterClass !== data.classId ||
			filterKind !== data.kind ||
			filterPeriod !== data.period
	);
	const empty: ReportMetadata = {
		schoolName: '',
		npsn: '',
		address: '',
		principalName: '',
		principalNip: '',
		principalStatus: 'definitif',
		teacherName: '',
		teacherNip: '',
		caregiverName: '',
		caregiverNip: '',
		place: '',
		date: ''
	};
	let metadata = $state<ReportMetadata>({ ...empty }),
		selected = $state<number[]>([]),
		confirmed = $state(false),
		approved = $state(false),
		busy = $state(false),
		stop = $state(false),
		message = $state(''),
		pdfUrl = $state('');
	let plan = $state<{ id: number; hash: string }[]>([]),
		results = $state<Record<number, string>>({});
	let controller: AbortController | undefined;
	const filterKey = $derived(
		`${data.yearId}/${data.semesterId}/${data.classId}/${data.kind}/${data.period}/${data.page}`
	);
	const eligible = $derived(
		filtersPending
			? []
			: data.items.filter(
					(v) => v.info && !v.info.archived && v.info.coverage.status === 'nilai_inti_lengkap'
				)
	);
	function resetPreview() {
		if (pdfUrl) URL.revokeObjectURL(pdfUrl);
		pdfUrl = '';
		plan = [];
		approved = false;
	}
	$effect(() => {
		void filterKey;
		untrack(() => {
			filterYear = data.yearId;
			filterSemester = data.semesterId;
			filterClass = data.classId;
			filterKind = data.kind;
			filterPeriod = data.period;
			metadata = { ...(data.items.find((v) => v.info)?.info?.metadata ?? empty) };
			selected = [];
			confirmed = false;
			message = '';
			results = {};
			resetPreview();
		});
	});
	onDestroy(() => {
		stop = true;
		controller?.abort();
		resetPreview();
	});
	function choose(id: number, checked: boolean) {
		selected = checked ? [...selected, id] : selected.filter((v) => v !== id);
		resetPreview();
	}
	function clearSelection() {
		selected = [];
		confirmed = false;
		resetPreview();
	}
	function changeYear() {
		const next = reportArchiveFilters(data.classOptions, { yearId: filterYear, classId: 0 });
		filterSemester = next.semesterId;
		filterClass = 0;
		clearSelection();
	}
	function changeSemester() {
		filterClass = 0;
		clearSelection();
	}
	async function problem(response: Response) {
		const body = await response.json().catch(() => ({ message: 'Dokumen gagal diproses.' }));
		return new Error(body.message ?? 'Dokumen gagal diproses.');
	}
	async function preview() {
		if (busy || !selected.length) return;
		busy = true;
		message = '';
		results = {};
		resetPreview();
		controller = new AbortController();
		try {
			const response = await fetch(
				resolve('/api/rapor-arsip/batch') + `?jenis=${data.kind}&periode=${data.period}`,
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ historyIds: selected, metadata, confirmMetadata: confirmed }),
					signal: controller.signal
				}
			);
			if (!response.ok) throw await problem(response);
			plan = JSON.parse(response.headers.get('X-Report-Batch-Plan') ?? '[]');
			pdfUrl = URL.createObjectURL(await response.blob());
		} catch (cause) {
			message = cause instanceof Error ? cause.message : 'Pratinjau gagal dibuat.';
		} finally {
			busy = false;
		}
	}
	async function finalize() {
		if (busy || !approved || !plan.length) return;
		busy = true;
		stop = false;
		results = {};
		message = '';
		controller = new AbortController();
		try {
			for (const item of plan) {
				if (stop) break;
				try {
					const response = await fetch(
						resolve(`/api/rapor-arsip/${item.id}`) + `?jenis=${data.kind}&periode=${data.period}`,
						{
							method: 'POST',
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({
								action: 'finalize',
								metadata,
								confirmMetadata: confirmed,
								confirmFinal: approved,
								expectedHash: item.hash
							}),
							signal: controller.signal
						}
					);
					if (!response.ok) throw await problem(response);
					results[item.id] = 'Tersimpan';
				} catch (cause) {
					results[item.id] = cause instanceof Error ? cause.message : 'Gagal disimpan.';
				}
			}
			message = stop
				? 'Proses dihentikan. Rapor yang berhasil tetap tersimpan.'
				: 'Proses selesai. Periksa hasil setiap murid.';
			selected = [];
			resetPreview();
			await invalidate('app:rapor-arsip');
		} finally {
			busy = false;
		}
	}
	const pageLink = (page: number) =>
		resolve('/murid/arsip/rapor') +
		`?tahun_ajaran_id=${data.yearId}&semester_id=${data.semesterId}&kelas_id=${data.classId}&jenis=${data.kind}&periode=${data.period}&page=${page}`;
</script>

<section class="min-w-0 space-y-4 rounded-lg bg-base-100 p-4">
	<header class="flex flex-wrap items-center justify-between gap-3 border-b border-base-200 pb-4">
		<div>
			<h1 class="text-xl font-bold">Riwayat Rapor</h1>
			<p class="mt-1 text-sm text-base-content/65">
				{data.years.find((y) => y.id === data.yearId)?.label ??
					'Tahun pelajaran belum tersedia'}{#if data.semesterId}
					· {data.semesters.find((s) => s.id === data.semesterId)?.label}{/if}{#if data.classId}
					· {data.classes.find((c) => c.id === data.classId)?.label}{/if}
			</p>
		</div>
		<a class="btn btn-soft" href={resolve('/murid')}><Icon name="left" /> Data Murid</a>
	</header>
	<form
		method="GET"
		action={resolve('/murid/arsip/rapor')}
		class="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-3"
	>
		<label class="block min-w-0 text-sm font-medium"
			>Tahun Pelajaran<select
				class="select mt-1 h-10 w-full"
				name="tahun_ajaran_id"
				bind:value={filterYear}
				onchange={changeYear}
				disabled={busy}
			>
				<option value={0}>Pilih tahun pelajaran</option>{#each data.years as year (year.id)}<option
						value={year.id}>{year.label}</option
					>{/each}
			</select></label
		>
		<label class="block min-w-0 text-sm font-medium"
			>Semester<select
				class="select mt-1 h-10 w-full"
				name="semester_id"
				bind:value={filterSemester}
				onchange={changeSemester}
				disabled={busy || !filterYear}
			>
				<option value={0}>Pilih semester</option
				>{#each choices.semesters as semester (semester.id)}<option value={semester.id}
						>{semester.label}</option
					>{/each}
			</select></label
		>
		<label class="block min-w-0 text-sm font-medium"
			>Kelas<select
				class="select mt-1 h-10 w-full"
				name="kelas_id"
				bind:value={filterClass}
				onchange={clearSelection}
				disabled={busy || !filterSemester}
				><option value={0}>Pilih kelas</option>{#each choices.classes as item (item.id)}<option
						value={item.id}>{item.label}</option
					>{/each}</select
			></label
		>
		<label class="block text-sm font-medium"
			>Jenis rapor<select
				class="select mt-1 h-10 w-full"
				name="jenis"
				bind:value={filterKind}
				onchange={() => {
					if (filterKind !== 'sekolah') filterPeriod = 'ras';
					clearSelection();
				}}
				disabled={busy}
				>{#each data.availableKinds as kind (kind)}<option value={kind}
						>{archiveKindLabel[kind]}</option
					>{/each}</select
			></label
		>
		<label class="block text-sm font-medium"
			>Tahap Rapor<select
				class="select mt-1 h-10 w-full"
				name="periode"
				bind:value={filterPeriod}
				onchange={clearSelection}
				disabled={busy}
				><option value="ras"
					>{filterKind === 'martikulasi' ? 'Akhir program' : 'Akhir semester'}</option
				>{#if filterKind === 'sekolah'}<option value="rts">Tengah semester</option>{/if}</select
			></label
		>
		<button class="btn btn-soft h-10" disabled={busy}><Icon name="search" /> Tampilkan</button>
	</form>
	{#if message}<div class="alert alert-info alert-soft text-sm" role="status">
			<Icon name="info" /><span>{message}</span>
		</div>{/if}
	<div class="overflow-x-auto">
		<table class="table table-sm min-w-[680px]">
			<thead
				><tr
					>{#if data.canBulk}<th class="w-12"
							><input
								class="checkbox checkbox-sm"
								type="checkbox"
								aria-label="Pilih semua murid siap finalisasi pada halaman ini"
								checked={eligible.length > 0 && eligible.every((v) => selected.includes(v.id))}
								disabled={busy || !eligible.length}
								onchange={(e) => {
									selected = e.currentTarget.checked ? eligible.map((v) => v.id) : [];
									resetPreview();
								}}
							/></th
						>{/if}<th>Nama murid</th><th class="text-right">Nilai inti</th><th>Status rapor</th><th
						class="w-36">Aksi</th
					></tr
				></thead
			><tbody>
				{#each data.items as item (item.id)}<tr
						>{#if data.canBulk}<td
								><input
									class="checkbox checkbox-sm"
									type="checkbox"
									aria-label={`Pilih ${item.name}`}
									checked={selected.includes(item.id)}
									disabled={busy || !eligible.some((v) => v.id === item.id)}
									onchange={(e) => choose(item.id, e.currentTarget.checked)}
								/></td
							>{/if}<td class="min-w-44 whitespace-normal break-words font-medium"
							>{item.name}{#if results[item.id]}<p
									class="mt-1 max-w-sm break-words text-xs"
									class:text-success={results[item.id] === 'Tersimpan'}
									class:text-error={results[item.id] !== 'Tersimpan'}
								>
									{results[item.id]}
								</p>{/if}</td
						><td class="text-right tabular-nums"
							>{item.info ? `${item.info.coverage.filled}/${item.info.coverage.expected}` : '-'}</td
						><td
							><span
								class="badge badge-soft h-auto whitespace-normal text-xs"
								class:badge-success={!!item.info?.archived}
								class:badge-warning={!item.info?.archived}
								>{item.problem ||
									(item.info?.archived
										? `Final v${item.info.archived.number}`
										: item.info?.coverage.status === 'nilai_inti_lengkap'
											? 'Siap diperiksa'
											: 'Belum lengkap')}</span
							></td
						><td
							>{#if item.info}<a
									class="btn btn-sm btn-soft"
									href={resolve(`/murid/arsip/rapor/${item.id}`) +
										`?jenis=${data.kind}&periode=${data.period}`}><Icon name="eye" /> Periksa</a
								>{/if}</td
						></tr
					>
				{:else}<tr
						><td colspan={data.canBulk ? 5 : 4} class="py-10 text-center text-base-content/60"
							>{data.classId
								? 'Belum ada riwayat dalam cakupan akun pada kelas ini.'
								: 'Pilih kelas untuk menampilkan riwayat rapor.'}</td
						></tr
					>{/each}
			</tbody>
		</table>
	</div>
	<nav class="flex items-center justify-between gap-3 text-sm" aria-label="Halaman riwayat">
		<span>Halaman {data.page}</span>
		<div class="join">
			{#if data.page > 1}<a
					class="btn btn-sm join-item"
					href={pageLink(data.page - 1)}
					aria-label="Halaman sebelumnya"><Icon name="left" /></a
				>{/if}{#if data.hasNext}<a
					class="btn btn-sm join-item"
					href={pageLink(data.page + 1)}
					aria-label="Halaman berikutnya"><Icon name="right" /></a
				>{/if}
		</div>
	</nav>
	{#if data.canBulk && data.classId && eligible.length}
		<section class="space-y-4 border-t border-base-200 pt-4" aria-label="Finalisasi massal">
			<h2 class="text-lg font-semibold">
				Finalisasi massal <span class="badge badge-soft">{selected.length} murid</span>
			</h2>
			<div class="grid min-w-0 gap-5 xl:grid-cols-[minmax(320px,440px)_minmax(0,1fr)]">
				<form
					class="min-w-0 space-y-4"
					oninput={(e) => {
						if ((e.target as HTMLInputElement).name !== 'approved') resetPreview();
					}}
					onsubmit={(e) => {
						e.preventDefault();
						void preview();
					}}
				>
					<ReportMetadataFields bind:value={metadata} kind={data.kind} disabled={busy} />
					<label class="flex items-start gap-3 text-sm"
						><input
							type="checkbox"
							class="checkbox checkbox-sm mt-0.5 shrink-0"
							bind:checked={confirmed}
							disabled={busy}
						/><span>Identitas dan penandatangan sesuai untuk seluruh murid yang dipilih.</span
						></label
					>
					<button class="btn btn-primary w-full" disabled={busy || !confirmed || !selected.length}
						>{#if busy}<span class="loading loading-spinner loading-sm"></span>{:else}<Icon
								name="eye"
							/>{/if} Pratinjau gabungan</button
					>
					<label class="flex items-start gap-3 text-sm"
						><input
							type="checkbox"
							name="approved"
							class="checkbox checkbox-sm mt-0.5 shrink-0"
							bind:checked={approved}
							disabled={busy || !plan.length}
						/><span
							>Saya telah memeriksa seluruh PDF gabungan dan menyetujui penyimpanan final.</span
						></label
					>
					<button
						type="button"
						class="btn btn-success w-full"
						disabled={busy || !approved || !plan.length}
						onclick={finalize}><Icon name="save" /> Simpan rapor terpilih</button
					>
					{#if busy && plan.length}<progress
							class="progress progress-success w-full"
							max={plan.length}
							value={Object.keys(results).length}
							aria-label="Kemajuan finalisasi"
						></progress><button
							type="button"
							class="btn btn-soft w-full"
							onclick={() => {
								stop = true;
							}}
							disabled={stop}>Hentikan setelah dokumen ini</button
						>{/if}
				</form>
				<div class="min-w-0">
					{#if pdfUrl}<a
							class="btn btn-sm btn-soft mb-3"
							href={pdfUrl}
							target="_blank"
							rel="noopener noreferrer"><Icon name="eye" /> Buka PDF gabungan</a
						><iframe
							title="Pratinjau rapor gabungan"
							src={pdfUrl}
							class="h-[75dvh] min-h-[400px] w-full border border-base-300"
						></iframe>{:else}<div
							class="flex min-h-48 items-center justify-center border border-dashed border-base-300 text-sm text-base-content/55"
						>
							Pratinjau gabungan belum tersedia.
						</div>{/if}
				</div>
			</div>
		</section>{/if}
</section>
