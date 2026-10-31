<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { beforeNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/icon.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import {
		careSections,
		careKinds,
		careStatuses,
		careAspects,
		careStatusLabel,
		careShifts,
		careShiftWindow,
		type CareKind
	} from '$lib/pengasuhan';
	import type { PageData } from '../../../routes/(pengasuhan)/pengasuhan/[bagian]/$types';

	let { data }: { data: PageData } = $props();
	let dialog: HTMLDialogElement;
	let navigation: HTMLElement;
	$effect(() => {
		const activeSection = data.section;
		let cancelled = false;
		void tick().then(() => {
			if (cancelled || !navigation) return;
			const active = navigation.querySelector<HTMLElement>(`[data-section="${activeSection}"]`);
			if (!active) return;
			const item = active.getBoundingClientRect();
			const track = navigation.getBoundingClientRect();
			if (item.left < track.left) navigation.scrollLeft -= track.left - item.left;
			else if (item.right > track.right) navigation.scrollLeft += item.right - track.right;
		});
		return () => {
			cancelled = true;
		};
	});
	let busy = $state(false),
		loading = $state(false),
		message = $state(''),
		dirty = $state(false);
	let mode = $state<'create' | 'followup' | 'report'>('create');
	let requestKey = $state(''),
		detailId = $state(0);
	let detail = $state<Awaited<
		ReturnType<typeof import('$lib/server/pengasuhan').careDetail>
	> | null>(null);
	let report = $state<PageData['reports'][number] | null>(null);
	let selectedKind = $state<CareKind>('kejadian');
	let reportDate = $state(''),
		reportShift = $state<keyof typeof careShifts>('pagi');
	const section = $derived(careSections[data.section]);
	const counts = $derived(Object.fromEntries(data.counts.map((c) => [c.jenis, Number(c.total)])));
	const classes = $derived([...new Map(data.students.map((s) => [s.kelasId, s.kelas])).entries()]);
	const filtered = $derived(!!(data.q || data.status || data.kelas));
	const modalTitle = $derived(
		mode === 'create'
			? 'Catat Pengasuhan'
			: mode === 'report'
				? 'Laporan Piket'
				: 'Detail & Tindak Lanjut'
	);
	const modalIcon = $derived(
		mode === 'report'
			? 'book-open'
			: mode === 'followup'
				? 'activity'
				: careSections[selectedKind].icon
	);
	const metrics: { kind: CareKind; name: string; icon: IconName; tone: string; note: string }[] = [
		{
			kind: 'kejadian',
			name: 'Perlu Tindak Lanjut',
			icon: 'alert',
			tone: 'warning',
			note: 'Kejadian belum selesai'
		},
		{
			kind: 'sakit',
			name: 'Dalam Pantauan Sakit',
			icon: 'activity',
			tone: 'error',
			note: 'Murid masih dipantau'
		},
		{
			kind: 'perkembangan',
			name: 'Perkembangan Ditinjau',
			icon: 'star',
			tone: 'info',
			note: 'Catatan belum selesai'
		}
	];
	const dateFormatter = new Intl.DateTimeFormat('id-ID', {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
		timeZone: 'Asia/Jakarta'
	});
	function dateLabel(value: string) {
		return dateFormatter.format(new Date(`${value}T12:00:00Z`));
	}
	function tone(status: string) {
		return status === 'selesai'
			? 'badge-success'
			: status === 'diproses'
				? 'badge-info'
				: 'badge-warning';
	}
	function pageLink(n: number) {
		const params = new URLSearchParams(page.url.searchParams);
		params.set('page', String(n));
		return `?${params}`;
	}
	beforeNavigate(({ cancel }) => {
		if (
			(busy || dirty) &&
			dialog?.open &&
			!confirm('Tinggalkan halaman? Catatan yang belum disimpan akan hilang.')
		)
			cancel();
	});
	function open(next: typeof mode) {
		mode = next;
		message = '';
		dirty = false;
		detail = null;
		report = null;
		requestKey = Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) =>
			byte.toString(16).padStart(2, '0')
		).join('');
		reportDate = data.today;
		reportShift = 'pagi';
		selectedKind = careKinds.includes(data.section as CareKind)
			? (data.section as CareKind)
			: 'kejadian';
		dialog.showModal();
	}
	function close() {
		if (busy || loading) return;
		if (dirty && !confirm('Tutup formulir? Perubahan yang belum disimpan akan hilang.')) return;
		dialog.close();
		detail = null;
		report = null;
		message = '';
		dirty = false;
	}
	async function showDetail(id: number) {
		open('followup');
		detailId = id;
		loading = true;
		try {
			const response = await fetch(`/api/pengasuhan/catatan/${id}`, { cache: 'no-store' });
			if (!response.ok)
				throw new Error('Catatan tidak dapat dimuat. Periksa akses dan koneksi Anda.');
			detail = await response.json();
		} catch (e) {
			message = e instanceof Error ? e.message : 'Gagal memuat catatan.';
		} finally {
			loading = false;
		}
	}
	function showReport(row: PageData['reports'][number]) {
		open('report');
		report = row;
		reportDate = row.tanggal;
		reportShift = row.shift;
	}
</script>

<svelte:head><title>{section.title} | Kaganga</title></svelte:head>
<svelte:window
	onbeforeunload={(event) => {
		if (dirty || busy) {
			event.preventDefault();
			event.returnValue = '';
		}
	}}
/>

<div class="care-workspace">
	<div class="app-page-container care-page">
		<header class="care-header">
			<div class="care-heading">
				<div class="min-w-0">
					<h1>{section.title}</h1>
					<div class="care-context">
						<span>Pengasuhan & Asrama</span>
						{#if data.asrama}<span>{data.asrama.asrama} / {data.asrama.nama}</span>{/if}
						<span>{data.students.length} murid tercakup</span>
						<span>{data.isAdmin ? 'Lingkup sekolah' : 'Sesuai penugasan'}</span>
						<time datetime={data.today}>{dateLabel(data.today)}</time>
					</div>
				</div>
			</div>
			<button
				class="btn btn-primary btn-soft care-create"
				disabled={data.section !== 'piket' && !data.students.length}
				aria-disabled={data.section !== 'piket' && !data.students.length}
				onclick={() => open(data.section === 'piket' ? 'report' : 'create')}
				><Icon name="plus" class="size-4" />{data.section === 'piket'
					? 'Laporan Piket'
					: 'Catat Pengasuhan'}</button
			>
		</header>
		<nav bind:this={navigation} aria-label="Pengasuhan" class="care-nav">
			{#each Object.entries(careSections) as [key, item] (key)}
				<a
					href={resolve(`/pengasuhan/${key}`)}
					data-section={key}
					class:care-nav-active={key === data.section}
					aria-current={key === data.section ? 'page' : undefined}
					><Icon name={item.icon} class="size-4 shrink-0" /><span>{item.short}</span></a
				>
			{/each}
		</nav>
		{#if data.section === 'ringkasan'}
			<div class="care-metrics" aria-label="Kasus pengasuhan belum selesai">
				{#each metrics as item (item.kind)}
					<a
						href={resolve(`/pengasuhan/${item.kind}?status=open`)}
						class="care-metric care-metric-{item.tone}"
					>
						<span class="care-metric-icon"><Icon name={item.icon} class="size-5" /></span>
						<div class="care-metric-copy">
							<h2>{item.name}</h2>
							<p class="care-metric-note">{item.note}</p>
						</div>
						<span class="care-metric-value">{counts[item.kind] ?? 0}</span>
					</a>
				{/each}
			</div>
		{/if}
		{#if !data.students.length && !data.isAdmin}<div
				role="status"
				class="alert alert-warning alert-soft text-sm"
			>
				<Icon name="info" class="size-5 shrink-0" /><span
					>Belum ada murid aktif dengan identitas dan penugasan yang sesuai. Minta admin memeriksa
					penugasan serta profil pegawai Anda.</span
				>
			</div>{/if}
		<section
			aria-label={data.section === 'piket' ? 'Laporan piket' : 'Catatan pengasuhan'}
			class="care-register"
		>
			<div class="care-register-heading">
				<div class="flex min-w-0 items-center gap-2">
					<Icon
						name={data.section === 'piket' ? 'book-open' : 'table'}
						class="size-4 shrink-0 text-base-content/55"
					/>
					<h2>{data.section === 'ringkasan' ? 'Catatan Terbaru' : section.title}</h2>
				</div>
				<span class="badge badge-sm badge-ghost shrink-0">{data.total} catatan</span>
			</div>
			{#if data.section !== 'piket'}
				<form class="care-filters" method="GET">
					{#if data.asrama}<input type="hidden" name="kamar_id" value={data.asrama.id}/>{/if}
					<label class="care-search"
						><span>Cari catatan</span><span class="input care-search-input"
							><Icon name="search" class="size-4 shrink-0 text-base-content/45" /><input
								name="q"
								value={data.q}
								maxlength="100"
								placeholder="Nama murid atau judul"
							/></span
						></label
					>
					<label class="care-filter-class"
						><span>Kelas</span><select class="select w-full" name="kelas" value={data.kelas}
							><option value="">{data.isAdmin ? 'Semua kelas' : 'Kelas penugasan'}</option
							>{#each classes as [id, name] (id)}<option value={id}>{name}</option>{/each}</select
						></label
					>
					<label class="care-filter-status"
						><span>Status</span><select class="select w-full" name="status" value={data.status}
							><option value="">Semua status</option><option value="open">Belum selesai</option
							>{#each careStatuses as status (status)}<option value={status}
									>{status === 'baru'
										? 'Baru / perlu ditinjau'
										: status === 'diproses'
											? 'Dalam penanganan'
											: 'Selesai / tercatat'}</option
								>{/each}</select
						></label
					>
					<div class="care-filter-actions">
						<button class="btn btn-sm btn-soft"
							><Icon name="search" class="size-4" />Tampilkan</button
						>{#if filtered}<a
								href={resolve(`/pengasuhan/${data.section}`)}
								class="btn btn-sm btn-ghost btn-square"
								aria-label="Hapus filter"
								title="Hapus filter"><Icon name="close" class="size-4" /></a
							>{/if}
					</div>
				</form>
			{/if}
			{#if data.total}
				<!-- Keep the horizontal scroll region keyboard-accessible. -->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<div
					class="care-table-scroll"
					tabindex="0"
					role="region"
					aria-label="Tabel catatan pengasuhan"
				>
					<table class="table care-table">
						<caption class="sr-only"
							>{section.title}, halaman {data.page} dari {data.pageCount}</caption
						>
						<colgroup
							>{#if data.section === 'piket'}<col class="care-col-date" /><col
									class="care-col-person"
								/><col class="care-col-note" />{:else}<col class="care-col-person" /><col
									class="care-col-note"
								/><col class="care-col-date" />{/if}<col class="care-col-status" /><col
								class="care-col-action"
							/></colgroup
						>
						<thead
							><tr
								>{#if data.section === 'piket'}<th scope="col">Tanggal & Piket</th><th scope="col"
										>Petugas</th
									><th scope="col">Ringkasan</th>{:else}<th scope="col">Murid</th><th scope="col"
										>Catatan</th
									><th scope="col">Waktu & Petugas</th>{/if}<th scope="col">Status</th><th
									scope="col"
									class="text-right">Aksi</th
								></tr
							></thead
						>
						<tbody>
							{#if data.section === 'piket'}
								{#each data.reports as row (row.id)}<tr>
										<th scope="row"
											><time datetime={row.tanggal} class="care-cell-title"
												>{dateLabel(row.tanggal)}</time
											><span class="care-cell-meta"
												><Icon
													name={row.shift === 'malam' ? 'moon' : 'sun'}
													class="size-3.5"
												/>Piket {careShifts[row.shift].label}</span
											></th
										>
										<td
											><div class="care-person">
												<span class="care-cell-title break-words">{row.petugasNama}</span>
											</div></td
										>
										<td><p class="care-note-preview" title={row.ringkasan}>{row.ringkasan}</p></td>
										<td
											><span
												class="badge badge-sm badge-soft care-status {row.status === 'selesai'
													? 'badge-success'
													: 'badge-warning'}"
												><span class="care-status-dot" aria-hidden="true"></span>{row.status ===
												'selesai'
													? 'Selesai'
													: 'Draf'}</span
											></td
										>
										<td class="text-right"
											><button
												class="btn btn-sm btn-soft care-detail"
												onclick={() => showReport(row)}
												aria-label="Detail laporan {row.petugasNama}, {dateLabel(row.tanggal)}"
												><Icon name="eye" class="size-4" /><span>Detail</span></button
											></td
										>
									</tr>{/each}
							{:else}
								{#each data.rows as row (row.id)}<tr>
										<th scope="row"
											><div class="care-person">
												<div class="min-w-0">
													<span class="care-cell-title break-words">{row.namaSnapshot}</span><span
														class="care-cell-meta">{row.kelasSnapshot}</span
													>
												</div>
											</div></th
										>
										<td
											><p class="care-cell-title care-note-preview" title={row.judul}>
												{row.judul}
											</p>
											<span class="care-cell-meta"
												><Icon
													name={careSections[row.jenis].icon}
													class="size-3.5 shrink-0"
												/>{careSections[row.jenis].short}{row.aspek
													? ` / ${careAspects[row.aspek as keyof typeof careAspects] ?? row.aspek}`
													: ''}</span
											></td
										>
										<td
											><time class="care-cell-title" datetime={row.tanggal}
												>{dateLabel(row.tanggal)}<span class="care-inline-time">{row.waktu}</span
												></time
											><span class="care-cell-meta break-words">{row.petugasNama}</span></td
										>
										<td
											><span class="badge badge-sm badge-soft care-status {tone(row.status)}"
												><span class="care-status-dot" aria-hidden="true"></span>{careStatusLabel(
													row.jenis,
													row.status
												)}</span
											></td
										>
										<td class="text-right"
											><button
												class="btn btn-sm btn-soft care-detail"
												onclick={() => showDetail(row.id)}
												aria-label="Detail catatan {row.namaSnapshot}"
												><Icon name="eye" class="size-4" /><span>Detail</span></button
											></td
										>
									</tr>{/each}
							{/if}
						</tbody>
					</table>
				</div>
			{:else}
				<div class="care-empty" role="status">
					<span class="care-empty-icon"
						><Icon name={filtered ? 'search' : section.icon} class="size-6" /></span
					>
					<h3>{filtered ? 'Catatan tidak ditemukan' : 'Belum ada catatan'}</h3>
					<p>
						{filtered
							? 'Tidak ada catatan yang sesuai dengan filter.'
							: data.section === 'piket'
								? 'Belum ada laporan piket yang tercatat.'
								: 'Belum ada catatan pengasuhan yang tercatat.'}
					</p>
					{#if filtered}<a href={resolve(`/pengasuhan/${data.section}`)} class="btn btn-sm btn-soft"
							>Hapus filter</a
						>{/if}
				</div>
			{/if}
			<footer class="care-pagination">
				<span
					>{#if data.total}<strong
							>{(data.page - 1) * 20 + 1}-{Math.min(data.page * 20, data.total)}</strong
						>
						dari {data.total} catatan{:else}0 catatan{/if}</span
				>
				<div class="flex items-center gap-3">
					<span class="care-page-label">{data.page} / {data.pageCount}</span>
					<div class="join">
						<a
							class="btn btn-sm btn-square join-item {data.page <= 1 ? 'btn-disabled' : ''}"
							aria-disabled={data.page <= 1}
							tabindex={data.page <= 1 ? -1 : 0}
							href={resolve(`/pengasuhan/${data.section}${pageLink(data.page - 1)}`)}
							aria-label="Halaman sebelumnya"><Icon name="left" class="size-4" /></a
						><a
							class="btn btn-sm btn-square join-item {data.page >= data.pageCount
								? 'btn-disabled'
								: ''}"
							aria-disabled={data.page >= data.pageCount}
							tabindex={data.page >= data.pageCount ? -1 : 0}
							href={resolve(`/pengasuhan/${data.section}${pageLink(data.page + 1)}`)}
							aria-label="Halaman berikutnya"><Icon name="right" class="size-4" /></a
						>
					</div>
				</div>
			</footer>
		</section>
	</div>
</div>

<dialog
	bind:this={dialog}
	class="modal care-dialog"
	aria-labelledby="care-modal-title"
	oncancel={(e) => {
		e.preventDefault();
		close();
	}}
>
	<div class="modal-box care-modal-box">
		<header class="care-modal-header">
			<div class="flex min-w-0 items-center gap-3">
				<Icon name={modalIcon} class="size-5 shrink-0 text-base-content/55" />
				<div class="min-w-0">
					<h2 id="care-modal-title">{modalTitle}</h2>
					{#if mode === 'report' && report}<p class="care-cell-meta">
							{report.petugasNama} · {report.status === 'selesai' ? 'Selesai' : 'Draf'}
						</p>{/if}
				</div>
			</div>
			<button
				type="button"
				class="btn btn-sm btn-ghost btn-square shrink-0"
				aria-label="Tutup"
				disabled={busy || loading}
				onclick={close}><Icon name="close" class="size-5" /></button
			>
		</header>
		{#if loading}
			<div class="care-modal-body care-modal-loading" role="status" aria-busy="true">
				<span class="loading loading-spinner loading-md text-info"></span>
				<p>Memuat catatan...</p>
				<div class="w-full space-y-3" aria-hidden="true">
					<div class="skeleton h-4 w-2/3"></div>
					<div class="skeleton h-4 w-full"></div>
					<div class="skeleton h-4 w-5/6"></div>
				</div>
			</div>
		{:else if mode === 'followup' && !detail}
			<div class="care-modal-body">
				<div role="alert" class="alert alert-error alert-soft text-sm">
					<Icon name="alert" class="size-5 shrink-0" /><span>{message}</span>
				</div>
			</div>
			<footer class="care-modal-footer">
				<button class="btn btn-sm btn-ghost" onclick={close}>Tutup</button><button
					class="btn btn-sm btn-soft"
					onclick={() => showDetail(detailId)}
					><Icon name="repeat" class="size-4" />Coba lagi</button
				>
			</footer>
		{:else}
			{#key requestKey}
				<form
					method="POST"
					action="?/{mode}"
					class="care-form"
					oninput={() => (dirty = true)}
					use:enhance={({ cancel }) => {
						if (busy) {
							cancel();
							return;
						}
						busy = true;
						message = '';
						return async ({ result, update }) => {
							busy = false;
							if (result.type === 'success') {
								dirty = false;
								dialog.close();
								detail = null;
								report = null;
								toast('Catatan tersimpan.', 'success');
								await update();
							} else {
								message =
									result.type === 'failure'
										? String(result.data?.message ?? 'Data belum tersimpan.')
										: 'Data belum tersimpan. Periksa koneksi lalu coba lagi.';
							}
						};
					}}
				>
					<div class="care-modal-body" aria-busy={busy}>
						{#if message}<div role="alert" class="alert alert-error alert-soft mb-4 text-sm">
								<Icon name="alert" class="size-5 shrink-0" /><span>{message}</span>
							</div>{/if}
						<input type="hidden" name="requestKey" value={requestKey} />
						{#if mode === 'create'}
							<div class="care-fields">
								<fieldset class="fieldset care-fields care-field-group">
									<legend class="fieldset-legend">Informasi Catatan</legend>
									<label
										><span>Murid <span class="text-error">*</span></span><select
											name="muridId"
											class="select w-full"
											required
											><option value="">Pilih murid</option
											>{#each data.students as student (student.id)}<option value={student.id}
													>{student.nama} - {student.kelas}</option
												>{/each}</select
										></label
									>
									<div class="care-field-pair">
										<label
											><span>Jenis catatan</span><select
												name="jenis"
												class="select w-full"
												bind:value={selectedKind}
												>{#each careKinds as kind (kind)}<option value={kind}
														>{careSections[kind].short}</option
													>{/each}</select
											></label
										>{#if selectedKind === 'perkembangan'}<label
												><span>Aspek <span class="text-error">*</span></span><select
													name="aspek"
													class="select w-full"
													required
													>{#each Object.entries(careAspects) as [key, value] (key)}<option
															value={key}>{value}</option
														>{/each}</select
												></label
											>{/if}
									</div>
									<div class="care-field-pair care-date-pair">
										<label
											><span>Tanggal <span class="text-error">*</span></span><input
												type="date"
												name="tanggal"
												class="input w-full"
												max={data.today}
												value={data.today}
												required
											/></label
										><label
											><span>Waktu (WIB) <span class="text-error">*</span></span><input
												type="time"
												name="waktu"
												class="input w-full"
												required
											/></label
										>
									</div>
								</fieldset>
								<fieldset class="fieldset care-fields care-field-group">
									<legend class="fieldset-legend">Isi Catatan</legend>
									<label
										><span>Judul <span class="text-error">*</span></span><input
											name="judul"
											class="input w-full"
											maxlength="120"
											required
										/></label
									>
									<label
										><span
											>{selectedKind === 'sakit' ? 'Keluhan & Penanganan' : 'Catatan'}
											<span class="text-error">*</span></span
										><textarea name="uraian" class="textarea w-full" maxlength="3000" required
										></textarea></label
									>
									{#if selectedKind === 'perkembangan'}<label class="care-check"
											><input
												class="checkbox checkbox-sm checkbox-primary"
												type="checkbox"
												name="perluTindakLanjut"
											/><span>Perlu tindak lanjut</span></label
										>{/if}
								</fieldset>
							</div>
						{:else if mode === 'followup' && detail}
							<input type="hidden" name="id" value={detail.record.id} /><input
								type="hidden"
								name="revisi"
								value={detail.record.revisi}
							/>
							<div class="care-record-heading">
								<div class="care-person">
									<div class="min-w-0">
										<h3>{detail.record.namaSnapshot}</h3>
										<p class="care-cell-meta">{detail.record.kelasSnapshot}</p>
									</div>
								</div>
								<span class="badge badge-sm badge-soft care-status {tone(detail.record.status)}"
									>{careStatusLabel(detail.record.jenis, detail.record.status)}</span
								>
							</div>
							<div class="care-original">
								<h3>{detail.record.judul}</h3>
								<p class="care-cell-meta">
									{dateLabel(detail.record.tanggal)} · {detail.record.waktu} WIB · {detail.record
										.petugasNama}
								</p>
								<p class="care-narrative">{detail.record.uraian}</p>
							</div>
							{#if detail.history.length}<section
									class="care-history"
									aria-label="Riwayat tindak lanjut"
								>
									<h3>
										Riwayat Tindak Lanjut <span class="badge badge-sm badge-ghost"
											>{detail.history.length}</span
										>
									</h3>
									<ol>
										{#each detail.history as item (item.id)}<li>
												<div class="care-history-meta">
													<span class="badge badge-sm badge-soft {tone(item.status)}"
														>{careStatusLabel(detail.record.jenis, item.status)}</span
													><time datetime={item.createdAt}
														>{new Date(item.createdAt).toLocaleString('id-ID', {
															timeZone: 'Asia/Jakarta',
															dateStyle: 'medium',
															timeStyle: 'short'
														})} WIB</time
													>
												</div>
												<p class="care-history-person">{item.petugasNama}</p>
												<p class="care-narrative">{item.uraian}</p>
											</li>{/each}
									</ol>
								</section>{/if}
							<div class="care-fields care-followup-fields">
								<h3 class="care-form-heading">
									<Icon name="pen" class="size-4" />Tindak Lanjut Baru
								</h3>
								<label
									><span>Status terbaru</span><select
										name="status"
										class="select w-full"
										value={detail.record.status}
										>{#each careStatuses.filter((s) => careStatuses.indexOf(s) >= careStatuses.indexOf(detail!.record.status)) as status (status)}<option
												value={status}>{careStatusLabel(detail.record.jenis, status)}</option
											>{/each}</select
									></label
								><label
									><span>Catatan tindak lanjut <span class="text-error">*</span></span><textarea
										name="uraian"
										class="textarea w-full"
										maxlength="3000"
										required></textarea></label
								>
							</div>
						{:else if mode === 'report'}
							<input type="hidden" name="id" value={report?.id ?? 0} /><input
								type="hidden"
								name="revisi"
								value={report?.revisi ?? 0}
							/>
							<fieldset disabled={report?.status === 'selesai'} class="care-fields">
								<div class="care-field-pair">
									<label
										><span>Tanggal mulai piket <span class="text-error">*</span></span><input
											type="date"
											name="tanggal"
											class="input w-full"
											bind:value={reportDate}
											max={data.today}
											required
										/></label
									><label
										><span>Piket</span><select
											name="shift"
											class="select w-full"
											bind:value={reportShift}
											>{#each Object.entries(careShifts) as [key, shift] (key)}<option value={key}
													>{shift.label}</option
												>{/each}</select
										></label
									>
								</div>
								{#if reportDate}<div class="care-shift-window">
										<Icon
											name={reportShift === 'malam' ? 'moon' : 'sun'}
											class="size-4 shrink-0"
										/><span class="care-shift-range"
											><span>{careShiftWindow(reportDate, reportShift).start}</span><span
												class="text-base-content/45"
											>
												s.d.
											</span><span>{careShiftWindow(reportDate, reportShift).end} WIB</span></span
										>
									</div>{/if}
								<label
									><span>Ringkasan pelaksanaan piket <span class="text-error">*</span></span
									><textarea
										name="ringkasan"
										class="textarea w-full"
										maxlength="3000"
										value={report?.ringkasan ?? ''}
										required></textarea></label
								>
								<label
									><span>Catatan pergantian piket</span><textarea
										name="serahTerima"
										class="textarea w-full"
										maxlength="3000"
										value={report?.serahTerima ?? ''}></textarea></label
								>
								<label class="care-check"
									><input
										type="checkbox"
										name="selesai"
										class="checkbox checkbox-sm checkbox-success"
										checked={report?.status === 'selesai'}
									/><span
										><strong>Tandai selesai</strong><span class="care-check-note"
											>Laporan yang selesai tidak dapat diubah.</span
										></span
									></label
								>
							</fieldset>
						{/if}
					</div>
					<footer class="care-modal-footer">
						<button type="button" class="btn btn-sm btn-ghost" disabled={busy} onclick={close}
							>Tutup</button
						>{#if mode !== 'report' || report?.status !== 'selesai'}<button
								class="btn btn-sm btn-primary"
								disabled={busy}
								>{#if busy}<span class="loading loading-spinner loading-xs"></span>{:else}<Icon
										name="save"
										class="size-4"
									/>{/if}Simpan</button
							>{/if}
					</footer>
				</form>
			{/key}
		{/if}
	</div>
</dialog>

<style>
	.care-workspace {
		--care-control-height: 2.5rem;
		--care-cell-pad: 1rem;
	}
	.care-page {
		container: care-workspace / inline-size;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem;
		border-radius: var(--app-radius);
		background: var(--color-base-100);
	}
	.care-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.care-heading {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 0.875rem;
	}
	.care-header h1 {
		font-size: 1.25rem;
		line-height: 1.4;
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.care-create {
		flex-shrink: 0;
		min-height: var(--care-control-height);
		box-shadow: none;
	}
	.care-context {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		margin-top: 0.375rem;
		font-size: 0.75rem;
		color: color-mix(in oklab, var(--color-base-content) 65%, transparent);
	}
	.care-context > :not(:first-child) {
		padding-left: 0.75rem;
		border-left: 1px solid var(--color-base-300);
	}
	.care-nav {
		display: flex;
		min-width: 0;
		overflow-x: auto;
		overscroll-behavior-inline: contain;
		scrollbar-width: thin;
		gap: 0.25rem;
		padding-bottom: 0.25rem;
		border-bottom: 1px solid var(--color-base-300);
	}
	.care-nav a {
		display: flex;
		flex-shrink: 0;
		min-height: var(--care-control-height);
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.625rem 0.875rem;
		border-bottom: 2px solid transparent;
		border-radius: var(--app-radius) var(--app-radius) 0 0;
		font-size: 0.8125rem;
		font-weight: 500;
		color: color-mix(in oklab, var(--color-base-content) 65%, transparent);
		transition:
			background-color 120ms,
			color 120ms;
	}
	.care-nav a:hover {
		background: var(--color-base-200);
		color: var(--color-base-content);
	}
	.care-nav a.care-nav-active {
		border-bottom-color: var(--color-info);
		background: color-mix(in oklab, var(--color-info) 7%, transparent);
		color: var(--color-base-content);
		font-weight: 600;
	}
	.care-metrics {
		width: 100%;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0;
		border-block: 1px solid var(--color-base-200);
	}
	.care-metric {
		--metric-color: var(--color-info);
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.625rem;
		min-width: 0;
		min-height: 4.75rem;
		padding: 0.75rem;
		border-left: 2px solid color-mix(in oklab, var(--metric-color) 65%, var(--color-base-300));
		background: color-mix(in oklab, var(--metric-color) 3%, var(--color-base-100));
		transition:
			border-color 120ms,
			background-color 120ms;
	}
	.care-metric-warning {
		--metric-color: var(--color-warning);
	}
	.care-metric-error {
		--metric-color: var(--color-error);
	}
	.care-metric-info {
		--metric-color: var(--color-info);
	}
	.care-metric:hover {
		border-color: var(--metric-color);
		background: color-mix(in oklab, var(--metric-color) 9%, var(--color-base-100));
	}
	.care-metric-copy {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.care-metric-icon {
		display: grid;
		place-items: center;
		width: 1.5rem;
		height: 1.5rem;
		color: color-mix(in oklab, var(--metric-color) 70%, var(--color-base-content));
	}
	.care-metric-value {
		font-size: 1.25rem;
		font-weight: 700;
		line-height: 1.1;
		font-variant-numeric: tabular-nums;
	}
	.care-metric h2 {
		font-size: 0.8125rem;
		line-height: 1.5;
		font-weight: 600;
	}
	.care-metric-note {
		margin-top: 0.125rem;
		font-size: 0.75rem;
		line-height: 1.5;
		color: color-mix(in oklab, var(--color-base-content) 60%, transparent);
	}
	.care-register {
		min-width: 0;
		overflow: hidden;
	}
	.care-register-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding-block: 0.25rem 0.75rem;
	}
	.care-register-heading h2 {
		font-size: 0.875rem;
		line-height: 1.5;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.care-filters {
		display: grid;
		grid-template-columns: minmax(12rem, 1.5fr) minmax(10rem, 1fr) minmax(10rem, 1fr) auto;
		align-items: end;
		gap: 0.75rem;
		padding-block: 0.25rem 1rem;
	}
	.care-filters label,
	.care-fields label {
		display: flex;
		flex-direction: column;
		min-width: 0;
		gap: 0.375rem;
	}
	.care-filters label > span:first-child,
	.care-fields label > span:first-child {
		font-size: 0.75rem;
		line-height: 1.4;
		font-weight: 500;
	}
	.care-workspace .input,
	.care-workspace .select,
	.care-dialog .input,
	.care-dialog .select {
		min-width: 0;
		height: var(--care-control-height, 2.5rem);
		min-height: var(--care-control-height, 2.5rem);
		font-size: 0.875rem;
		box-shadow: none;
		background: var(--color-base-200);
	}
	.care-search-input {
		display: flex;
		width: 100%;
		align-items: center;
		gap: 0.5rem;
	}
	.care-search-input input {
		min-width: 0;
		width: 100%;
	}
	.care-filter-actions {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}
	.care-filter-actions .btn {
		min-height: var(--care-control-height);
		box-shadow: none;
	}
	.care-table-scroll {
		container: care-table / inline-size;
		overflow-x: auto;
		overscroll-behavior-inline: contain;
		border: 1px solid var(--color-base-200);
		border-radius: calc(var(--app-radius) - 2px);
	}
	.care-table {
		min-width: 52rem;
		table-layout: fixed;
		font-size: 0.875rem;
	}
	.care-col-person {
		width: 25%;
	}
	.care-col-date {
		width: 11rem;
	}
	.care-col-status {
		width: 9rem;
	}
	.care-col-action {
		width: 7rem;
	}
	.care-table th,
	.care-table td {
		height: 4rem;
		padding: 0.75rem var(--care-cell-pad);
		vertical-align: top;
		border-bottom-color: var(--color-base-200);
		overflow-wrap: anywhere;
	}
	.care-table thead th {
		height: auto;
		padding-block: 0.75rem;
		background: var(--color-base-200);
		color: color-mix(in oklab, var(--color-base-content) 70%, transparent);
		font-size: 0.875rem;
		font-weight: 700;
		white-space: nowrap;
	}
	.care-table tbody tr:hover {
		background: color-mix(in oklab, var(--color-base-200) 50%, var(--color-base-100));
	}
	.care-table :is(th, td):last-child {
		text-align: center;
	}
	.care-table tbody th {
		font-weight: 400;
	}
	.care-person {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 0.625rem;
	}
	.care-person > :last-child {
		min-width: 0;
	}
	.care-cell-title {
		display: block;
		font-size: 0.875rem;
		font-weight: 500;
		line-height: 1.5;
	}
	.care-cell-meta {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-top: 0.25rem;
		font-size: 0.75rem;
		line-height: 1.45;
		font-weight: 400;
		color: color-mix(in oklab, var(--color-base-content) 60%, transparent);
	}
	.care-inline-time {
		margin-left: 0.5rem;
		font-size: 0.75rem;
		font-weight: 400;
		color: color-mix(in oklab, var(--color-base-content) 65%, transparent);
		white-space: nowrap;
	}
	.care-note-preview {
		display: -webkit-box;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow-wrap: anywhere;
		line-height: 1.5;
	}
	.care-status {
		display: inline-flex;
		gap: 0.375rem;
		height: auto;
		min-height: 1.5rem;
		padding: 0.25rem 0.5rem;
		font-size: 0.75rem;
		line-height: 1.25;
		font-weight: 500;
		white-space: nowrap;
	}
	.care-status-dot {
		width: 0.3125rem;
		height: 0.3125rem;
		flex-shrink: 0;
		border-radius: 50%;
		background: currentColor;
	}
	.care-status.badge-success {
		color: color-mix(in oklab, var(--color-success) 45%, var(--color-base-content));
	}
	.care-status.badge-warning {
		color: color-mix(in oklab, var(--color-warning) 45%, var(--color-base-content));
	}
	.care-status.badge-info {
		color: color-mix(in oklab, var(--color-info) 45%, var(--color-base-content));
	}
	.care-detail {
		gap: 0.375rem;
		min-width: 4.75rem;
		flex-wrap: nowrap;
		white-space: nowrap;
		box-shadow: none;
	}
	.care-empty {
		display: flex;
		align-items: center;
		flex-direction: column;
		justify-content: center;
		gap: 0.5rem;
		min-height: 9rem;
		padding: 1.75rem 1rem;
		border: 1px solid var(--color-base-200);
		border-radius: calc(var(--app-radius) - 2px);
		text-align: center;
	}
	.care-empty-icon {
		display: grid;
		place-items: center;
		width: 3rem;
		height: 3rem;
		margin-bottom: 0.375rem;
		border-radius: var(--app-radius);
		background: var(--color-base-200);
		color: color-mix(in oklab, var(--color-base-content) 45%, transparent);
	}
	.care-empty h3 {
		font-size: 0.875rem;
		font-weight: 600;
	}
	.care-empty p {
		max-width: 22rem;
		font-size: 0.8125rem;
		color: color-mix(in oklab, var(--color-base-content) 60%, transparent);
	}
	.care-empty .btn {
		margin-top: 0.5rem;
	}
	.care-pagination {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding-block: 1rem 0;
		font-size: 0.75rem;
		color: color-mix(in oklab, var(--color-base-content) 60%, transparent);
	}
	.care-pagination strong {
		font-weight: 500;
		color: var(--color-base-content);
	}
	.care-pagination .btn {
		box-shadow: none;
	}
	.care-page-label {
		font-variant-numeric: tabular-nums;
	}
	.care-dialog {
		--care-modal-padding: var(--app-modal-padding);
	}
	.care-dialog .care-modal-box {
		display: flex;
		flex-direction: column;
		width: min(var(--app-modal-width), calc(100vw - 1rem));
		max-width: var(--app-modal-width);
		max-height: min(85dvh, calc(100dvh - 1rem));
		padding: 0;
		overflow: hidden;
		border-radius: var(--app-radius);
	}
	.care-modal-header {
		display: flex;
		flex-shrink: 0;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 1rem var(--care-modal-padding);
		border-bottom: 1px solid var(--color-base-300);
	}
	.care-modal-header h2 {
		font-size: 1.125rem;
		font-weight: 700;
		line-height: 1.4;
		overflow-wrap: anywhere;
	}
	.care-form {
		display: flex;
		min-height: 0;
		flex: 1;
		flex-direction: column;
	}
	.care-modal-body {
		min-height: 0;
		flex: 1;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 1.25rem var(--care-modal-padding);
		overflow-wrap: anywhere;
	}
	.care-modal-footer {
		display: flex;
		flex-shrink: 0;
		justify-content: flex-end;
		align-items: center;
		gap: 0.5rem;
		padding: 0.875rem var(--care-modal-padding);
		border-top: 1px solid var(--color-base-300);
		background: var(--color-base-100);
	}
	.care-modal-footer .btn {
		min-height: 2.5rem;
		min-width: 4.5rem;
		box-shadow: none;
		font-size: 0.875rem;
	}
	.care-fields {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 1rem;
	}
	.care-field-group {
		margin: 0;
		padding: 0;
		border: 0;
	}
	.care-field-group + .care-field-group {
		padding-top: 0.5rem;
		border-top: 1px solid var(--color-base-200);
	}
	.care-field-group .fieldset-legend {
		padding-block: 0 0.75rem;
		font-size: 0.8125rem;
		font-weight: 600;
	}
	.care-field-pair {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
	}
	.care-dialog .textarea {
		min-height: 7rem;
		font-size: 0.875rem;
		line-height: 1.6;
		box-shadow: none;
		resize: vertical;
	}
	.care-dialog .care-check {
		display: flex;
		flex-direction: row;
		align-items: flex-start;
		gap: 0.625rem;
		padding: 0.875rem;
		border: 1px solid var(--color-base-300);
		border-radius: var(--app-radius);
		background: color-mix(in oklab, var(--color-base-200) 50%, var(--color-base-100));
	}
	.care-check .checkbox {
		flex-shrink: 0;
		margin-top: 0.0625rem;
	}
	.care-check > span {
		font-size: 0.8125rem;
		line-height: 1.5;
	}
	.care-check strong {
		font-weight: 500;
	}
	.care-check-note {
		display: block;
		margin-top: 0.25rem;
		font-size: 0.75rem;
		color: color-mix(in oklab, var(--color-base-content) 60%, transparent);
	}
	.care-shift-window {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.75rem;
		border-left: 2px solid var(--color-info);
		background: color-mix(in oklab, var(--color-info) 6%, var(--color-base-100));
		font-size: 0.75rem;
		line-height: 1.6;
	}
	.care-shift-window :global(svg) {
		margin-top: 0.125rem;
	}
	.care-shift-range {
		display: flex;
		flex-wrap: wrap;
		gap: 0.125rem 0.375rem;
		font-variant-numeric: tabular-nums;
	}
	.care-record-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 1rem;
	}
	.care-record-heading h3 {
		font-size: 0.9375rem;
		font-weight: 600;
		line-height: 1.5;
	}
	.care-original {
		padding-block: 1rem;
		border-block: 1px solid var(--color-base-200);
	}
	.care-original h3 {
		font-size: 0.875rem;
		font-weight: 600;
	}
	.care-narrative {
		margin-top: 0.625rem;
		font-size: 0.875rem;
		line-height: 1.7;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.care-history {
		padding-block: 1.25rem;
	}
	.care-history h3,
	.care-form-heading {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		font-weight: 600;
	}
	.care-history ol {
		margin-top: 1rem;
		padding-left: 1rem;
		border-left: 2px solid var(--color-base-300);
	}
	.care-history li {
		position: relative;
		padding-bottom: 1.25rem;
	}
	.care-history li:last-child {
		padding-bottom: 0;
	}
	.care-history li::before {
		content: '';
		position: absolute;
		top: 0.4375rem;
		left: -1.3125rem;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--color-base-300);
		outline: 3px solid var(--color-base-100);
	}
	.care-history-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.care-history-meta time,
	.care-history-person {
		font-size: 0.75rem;
		line-height: 1.5;
		color: color-mix(in oklab, var(--color-base-content) 60%, transparent);
	}
	.care-history-person {
		margin-top: 0.375rem;
	}
	.care-followup-fields {
		padding-top: 1rem;
		border-top: 1px solid var(--color-base-200);
	}
	.care-modal-loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		padding-block: 2.5rem;
		font-size: 0.8125rem;
	}
	.care-modal-loading > div {
		max-width: 22rem;
		margin-top: 0.5rem;
	}
	.care-workspace :is(a, button, input, select):focus-visible,
	.care-dialog :is(button, input, select, textarea):focus-visible,
	.care-table-scroll:focus-visible {
		outline: 2px solid var(--color-info);
		outline-offset: -2px;
	}
	@container care-workspace (max-width: 55rem) {
		.care-filters {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.care-filter-actions .btn:first-child {
			flex: 1;
		}
	}
	@container care-workspace (max-width: 36rem) {
		.care-metrics {
			grid-template-columns: 1fr;
		}
		.care-metric {
			min-height: 3.25rem;
			padding-block: 0.625rem;
		}
		.care-metric-note {
			display: none;
		}
		.care-search,
		.care-filter-actions {
			grid-column: 1 / -1;
		}
	}
	@media (max-width: 767px) {
		.care-metrics {
			gap: 0;
		}
		.care-metric {
			padding: 0.625rem 0.75rem;
		}
	}
	@media (max-width: 639px) {
		.care-page {
			gap: 1rem;
			padding: 0.875rem;
		}
		.care-header {
			align-items: flex-start;
			flex-wrap: wrap;
		}
		.care-header h1 {
			font-size: 1.25rem;
		}
		.care-create {
			width: 100%;
		}
		.care-context {
			margin-top: 0.375rem;
			font-size: 0.75rem;
		}
		.care-context > time {
			display: none;
		}
		.care-nav a {
			min-height: 2.75rem;
			padding: 0.625rem 0.75rem;
		}
		.care-metric {
			gap: 0.75rem;
		}
		.care-filters {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 0.75rem;
		}
		.care-filter-actions .btn:first-child {
			flex: 1;
		}
		.care-register-heading,
		.care-filters {
			padding-inline: 0;
		}
		.care-register-heading h2 {
			font-size: 0.875rem;
		}
		.care-table tbody th:first-child,
		.care-table thead th:first-child {
			position: sticky;
			left: 0;
			z-index: 1;
			background: var(--color-base-100);
			border-right: 1px solid var(--color-base-200);
		}
		.care-table thead th:first-child {
			background: var(--color-base-200);
		}
		.care-pagination {
			flex-wrap: wrap;
			padding-inline: 0;
		}
		.care-page-label {
			display: none;
		}
		.care-field-pair {
			grid-template-columns: minmax(0, 1fr);
		}
		.care-date-pair {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 0.75rem;
		}
		.care-modal-header {
			padding-block: 0.875rem;
		}
		.care-modal-header h2 {
			font-size: 1rem;
		}
		.care-record-heading {
			flex-wrap: wrap;
			gap: 0.75rem;
		}
	}
	@container care-table (min-width: 100rem) {
		.care-col-person {
			width: 30rem;
		}
	}
	@media (max-width: 389px) {
		.care-table tbody th:first-child,
		.care-table thead th:first-child {
			position: static;
		}
		.care-date-pair {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.care-nav a,
		.care-metric {
			transition: none;
		}
	}
</style>
