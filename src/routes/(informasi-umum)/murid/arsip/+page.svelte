<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/icon.svelte';
	import PurgeMuridModal from '$lib/components/murid/purge-murid-modal.svelte';
	let purgeModal = $state<PurgeMuridModal | null>(null);
	let { data, form } = $props();
	let selectedIds = $state<number[]>([]);
	let submitting = $state(false);
	let selectedAction = $state<'status' | 'kelas'>('status');
	let targetClassId = $state('');
	const editableRows = $derived(
		data.rows.filter(
			(row) => row.identityKey.startsWith('uid:') && row.lastMuridId && !row.needsIdentityReview
		)
	);
	const selectedRows = $derived(editableRows.filter((row) => selectedIds.includes(row.id)));
	const selectionIds = $derived(selectedRows.map((row) => row.id));
	const canPlace = $derived(
		selectedRows.every((row) => row.status === 'aktif' && !row.needsIdentityReview)
	);
	const selectedClass = $derived(
		data.targetClasses.find((row) => String(row.id) === targetClassId)
	);
	const validTarget = $derived(
		canPlace &&
			selectedClass &&
			selectedRows.every((row) => row.semesterId !== selectedClass.semesterId)
	);
	const preview = $derived(
		selectedAction === 'kelas' &&
			form?.preview &&
			String(form.preview.targetClassId) === targetClassId &&
			form.preview.lifecycleIds.length === selectionIds.length &&
			form.preview.lifecycleIds.every((id: number) => selectionIds.includes(id))
			? form.preview
			: null
	);
	const reviewing = $derived(selectedRows.some((row) => row.needsIdentityReview));

	const allSelected = $derived(
		editableRows.length > 0 && editableRows.every((row) => selectedIds.includes(row.id))
	);
	const visiblePages = $derived(
		Array.from({ length: data.page.totalPages }, (_, index) => index + 1).filter(
			page => page === 1 || page === data.page.totalPages || Math.abs(page - data.page.currentPage) <= 1
		)
	);
	function toggle(id: number, checked: boolean) {
		selectedIds = checked
			? [...new Set([...selectedIds, id])]
			: selectedIds.filter((item) => item !== id);
	}
	function toggleAll(checked: boolean) {
		selectedIds = checked ? editableRows.map((row) => row.id) : [];
	}
	function pageUrl(page: number): `/murid/arsip?${string}` {
		const params = new URLSearchParams();
		if (data.filters.q) params.set('q', data.filters.q);
		if (data.filters.status) params.set('status', data.filters.status);
		if (data.filters.perluPeriksa) params.set('perlu_periksa', '1');
		if (page > 1) params.set('page', String(page));
		return `/murid/arsip?${params}`;
	}
	function statusLabel(status: string) {
		return status === 'aktif'
			? 'Aktif'
			: status === 'pindah'
				? 'Pindah Sekolah'
				: status === 'keluar'
					? 'Keluar Sekolah'
					: 'Alumni / Lulus';
	}
	const today = new Date().toISOString().slice(0, 10);

	function openRowDialog(event: MouseEvent) {
		const dialog = (event.currentTarget as HTMLElement).nextElementSibling;
		if (dialog instanceof HTMLDialogElement) dialog.showModal();
	}
</script>

<div class="space-y-5">
	{#if form?.fail}<div class="alert alert-error">
			<Icon name="error" /><span>{form.fail}</span>
		</div>{/if}
	{#if form?.message}<div class="alert alert-success">
			<Icon name="success" /><span>{form.message}</span>
		</div>{/if}

	<div class="card bg-base-100 space-y-4 rounded-lg p-4 shadow-md">
		<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
			<div>
				<h1 class="text-xl font-bold">Arsip Murid & Alumni</h1>
				<p class="text-base-content/65 mt-1 text-sm">{data.page.totalItems} identitas murid</p>
			</div>
			<a class="btn btn-soft shrink-0 shadow-none" href={resolve('/murid')}
				><Icon name="left" /> Data Murid</a
			>
		</div>
		<form
			method="GET"
			class="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto]"
		>
			{#if data.filters.perluPeriksa}<input type="hidden" name="perlu_periksa" value="1" />{/if}
			<label class="flex min-w-0 flex-col gap-1"
				><span class="text-xs font-medium">Cari Murid</span><input
					class="input w-full"
					name="q"
					value={data.filters.q}
					placeholder="Nama, NIS, atau NISN"
				/></label
			>
			<label class="flex min-w-0 flex-col gap-1"
				><span class="text-xs font-medium">Status Sekolah</span><select
					class="select w-full"
					name="status"
					><option value="">Semua status</option>{#each data.statuses as item (item)}<option
							value={item}
							selected={item === data.filters.status}>{statusLabel(item)}</option
						>{/each}</select
				></label
			>
			<div class="flex gap-2">
				<button class="btn btn-soft flex-1 shadow-none" type="submit"
					><Icon name="search" /> Tampilkan</button
				>
				<a class="btn btn-soft shadow-none" href={resolve('/murid/arsip')} aria-label="Reset filter arsip murid" title="Reset filter"><Icon name="repeat" /></a>
			</div>
		</form>

		{#if data.filters.perluPeriksa}
			<div class="border-warning/30 bg-warning/5 flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm" role="status">
				<span class="flex items-center gap-2"><Icon name="warning" /> Perlu pemeriksaan identitas</span>
				<a class="link text-xs" href={resolve('/murid/arsip')}>Lihat semua arsip</a>
			</div>
		{/if}

		{#if selectionIds.length}
			<div class="border-info/20 bg-info/5 space-y-3 rounded-md border p-3">
				<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
					<div class="flex flex-wrap items-center gap-3">
						<strong class="text-sm" aria-live="polite">{selectionIds.length} murid dipilih</strong>
						<fieldset class="join flex-wrap" aria-label="Jenis tindakan">
							<input
								type="radio"
								name="arsipAction"
								class="btn btn-sm join-item"
								aria-label="Status Sekolah"
								value="status"
								bind:group={selectedAction}
							/>
							<input
								type="radio"
								name="arsipAction"
								class="btn btn-sm join-item"
								aria-label="Penempatan Kelas"
								disabled={!canPlace}
								value="kelas"
								bind:group={selectedAction}
							/>
						</fieldset>
					</div>
					<button
						type="button"
						class="btn btn-ghost btn-sm"
						onclick={() => {
							selectedIds = [];
							targetClassId = '';
						}}><Icon name="close" /> Batal Pilihan</button
					>
				</div>
				{#if selectedAction === 'status'}
					<form
						method="POST"
						action="?/updateStatus"
						use:enhance={() => {
							return async ({ result, update }) => {
								await update();
								if (result.type === 'success') selectedIds = [];
							};
						}}
						class="space-y-3"
					>
						{#each selectionIds as id (id)}<input
								type="hidden"
								name="lifecycleIds"
								value={id}
							/>{/each}
						<h2 class="font-semibold">Perubahan Status Sekolah</h2>
						<div class="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_2fr]">
							<label
								><span class="mb-1 block text-sm">Status Tujuan</span><select
									class="select w-full"
									name="status"
									required
									><option value="">Pilih status tujuan</option
									>{#each data.statuses as item (item)}<option value={item}
											>{statusLabel(item)}</option
										>{/each}</select
								></label
							><label
								><span class="mb-1 block text-sm">Tanggal Perubahan Status</span><input
									class="input w-full"
									type="date"
									name="tanggalStatus"
									value={today}
								/></label
							><label class="sm:col-span-2 lg:col-span-1"
								><span class="mb-1 block text-sm">Alasan/Catatan</span><input
									class="input w-full"
									name="alasan"
									maxlength="500"
									placeholder={reviewing
										? 'Alasan hasil pemeriksaan identitas'
										: 'Catatan perubahan status'}
									required={reviewing}
								/></label
							>
						</div>
						<label class="flex items-center gap-2 text-sm"
							><input type="checkbox" class="checkbox checkbox-sm" required /> Konfirmasi perubahan
							status {selectionIds.length} murid</label
						>
						{#if reviewing}
							<label class="mt-3 flex items-start gap-2 text-sm"
								><input
									type="checkbox"
									class="checkbox checkbox-sm"
									name="identityReviewed"
									value="true"
									required
								/>Identitas murid sudah diperiksa admin berdasarkan data sekolah.</label
							>
						{/if}
						<div class="mt-3 flex justify-end">
							<button class="btn btn-primary shadow-none" type="submit"
								><Icon name="save" /> Simpan Status</button
							>
						</div>
					</form>
				{:else}
					<form
						method="POST"
						action="?/previewPromotion"
						use:enhance={() => {
							return async ({ update }) => {
								await update({ reset: false });
							};
						}}
						class="space-y-3"
					>
						{#each selectionIds as id (id)}<input
								type="hidden"
								name="lifecycleIds"
								value={id}
							/>{/each}
						<h2 class="font-semibold">Penempatan ke Semester Berbeda</h2>
						<label class="mt-3 block"
							><span class="mb-1 block text-sm">Kelas dan Periode Tujuan</span><select
								class="select w-full"
								name="targetClassId"
								bind:value={targetClassId}
								required
								><option value="">Pilih kelas tujuan</option
								>{#each data.targetClasses as kelas (kelas.id)}<option
										value={String(kelas.id)}
										disabled={selectedRows.some((row) => row.semesterId === kelas.semesterId)}
										>{kelas.nama}{kelas.fase ? ` - ${kelas.fase}` : ''} · {kelas.semester} ({kelas.tahunAjaran}){selectedRows.some(
											(row) => row.semesterId === kelas.semesterId
										)
											? ' - Semester yang sama'
											: ''}</option
									>{/each}</select
							></label
						>
						<div class="mt-3 flex justify-end">
							<button class="btn btn-soft shadow-none" type="submit" disabled={!validTarget}
								><Icon name="eye" /> Pratinjau Penempatan</button
							>
						</div>
					</form>
				{/if}
			</div>
		{/if}

		{#if preview}
			<div class="alert alert-warning alert-soft items-start">
				<Icon name="warning" />
				<div class="w-full">
					<h2 class="font-bold">Konfirmasi Penempatan Kelas</h2>
					<p class="text-sm">
						{preview.students.length} murid · <strong>{preview.targetLabel}</strong>
					</p>
					<ul class="my-2 max-h-32 overflow-auto text-sm">
						{#each preview.students as student (student.nis)}<li>
								{student.nama} · {student.nis}
							</li>{/each}
					</ul>
					<form
						method="POST"
						action="?/promote"
						use:enhance={() => {
							submitting = true;
							return async ({ result, update }) => {
								await update();
								submitting = false;
								if (result.type === 'success') {
									selectedIds = [];
									targetClassId = '';
								}
								await invalidate('app:murid-arsip');
							};
						}}
						class="flex justify-end"
					>
						<input type="hidden" name="targetClassId" value={preview.targetClassId} /><input
							type="hidden"
							name="confirmed"
							value="true"
						/>{#each preview.lifecycleIds as id (id)}<input
								type="hidden"
								name="lifecycleIds"
								value={id}
							/>{/each}<button
							class="btn btn-primary btn-sm shadow-none"
							type="submit"
							disabled={submitting}
							>{#if submitting}<span class="loading loading-spinner loading-xs"></span>{/if}<Icon
								name="save"
							/> Konfirmasi Penempatan</button
						>
					</form>
				</div>
			</div>
		{/if}

		<div class="overflow-x-auto rounded-md shadow-md">
			<table class="archive-table table w-full min-w-[1040px] table-fixed">
				<colgroup>
					<col class="w-14" /><col class="w-14" /><col />
					<col class="w-28" /><col class="w-32" /><col class="w-36" />
					<col class="w-40" /><col class="w-24" /><col class="w-16" />
				</colgroup>
				<thead class="bg-base-200"
					><tr
						><th
							><input
								class="checkbox"
								type="checkbox"
								checked={allSelected}
								onchange={(event) => toggleAll(event.currentTarget.checked)}
								aria-label="Pilih semua murid di halaman ini"
							/></th
						><th>No</th><th>Nama</th><th>NIS/NISN</th><th>Kelas Terakhir</th><th>Status Sekolah</th
						><th>Tanggal & Alasan</th><th>Riwayat</th><th>Aksi</th></tr
					></thead
				><tbody
					>{#each data.rows as row, index (row.id)}<tr class="hover:bg-base-200/40 transition-colors {selectedIds.includes(row.id) ? 'bg-info/5' : ''}"
							><td
								><input
									class="checkbox"
									type="checkbox"
									checked={selectedIds.includes(row.id)}
									disabled={!row.identityKey.startsWith('uid:') ||
										!row.lastMuridId ||
										!!row.needsIdentityReview}
									onchange={(event) => toggle(row.id, event.currentTarget.checked)}
									aria-label={`Pilih ${row.nama}`}
								/></td
							><td>{(data.page.currentPage - 1) * data.page.perPage + index + 1}</td><td
								class="break-words font-medium"
								>{row.nama}{#if !row.identityKey.startsWith('uid:')}<span
										class="mt-1 block text-xs font-normal opacity-60"
										>Snapshot Lama (baca-saja)</span
									>{/if}</td
							><td
								><div>{row.nis}</div>
								<div class="text-xs opacity-60">{row.nisn || '-'}</div></td
							><td
								><div>{row.kelas || '-'}</div>
								<div class="text-xs opacity-60">
									{row.semester || '-'} · {row.tahunAjaran || '-'}
								</div></td
							><td
								><span
									class:badge-success={row.status === 'aktif'}
									class:badge-warning={row.status === 'pindah' || row.status === 'keluar'}
									class:badge-info={row.status === 'alumni'}
									class="badge badge-soft h-auto min-h-6 max-w-full whitespace-normal py-1 text-center text-xs">{statusLabel(row.status)}</span
								>{#if row.needsIdentityReview}<span
										class="badge badge-warning badge-soft mt-1 h-auto max-w-full whitespace-normal py-1 text-center text-xs">Perlu Periksa Identitas</span
									>{/if}</td
							><td
								><div>{row.tanggalStatus || '-'}</div>
								<div class="break-words text-xs opacity-60">{row.alasan || '-'}</div></td
							><td
								><button class="btn btn-sm btn-soft gap-1 px-2 shadow-none" type="button" data-history-id={row.id} title="Lihat riwayat kelas" aria-label={`Lihat riwayat kelas ${row.nama}, ${row.history.length} catatan`} onclick={openRowDialog}>
									<Icon name="eye" /><span class="text-xs tabular-nums">{row.history.length}</span>
								</button>
								<dialog class="archive-dialog modal" aria-labelledby={`archive-history-title-${row.id}`}>
									<div class="modal-box w-full max-w-2xl space-y-4 p-4 text-sm">
										<header>
											<h2 id={`archive-history-title-${row.id}`} class="text-xl font-bold">Riwayat Pendidikan</h2>
											<p class="text-base-content/65 mt-1 break-words">{row.nama}</p>
										</header>
										<div class="overflow-x-auto">
											<table class="table table-sm min-w-[560px]">
												<thead><tr><th>Periode</th><th>Kelas</th><th>Rapor sekolah</th><th>Rapor asrama</th></tr></thead>
												<tbody>{#each row.history as history (history.id)}
													<tr><td><strong>{history.tahunAjaranSnapshot}</strong><div class="text-base-content/60 text-xs">{history.semesterSnapshot}</div></td>
													<td>{history.kelasSnapshot}<div class="text-base-content/60 text-xs">{history.faseSnapshot ?? ''}</div></td>
													{#each ['sekolah','asrama'] as kind (kind)}<td>
														{#if history.muridId && history.identityKey.startsWith('uid:') && !row.needsIdentityReview}
															<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- Base path is resolved before adding the report selection query. -->
															<a class="btn btn-sm btn-soft" href={resolve(`/murid/arsip/rapor/${history.id}`)+`?jenis=${kind}&periode=ras`}><Icon name="eye" /> Periksa</a>
														{:else}<span class="text-base-content/55 text-xs">Sumber belum tersedia</span>{/if}
													</td>{/each}</tr>
												{:else}<tr><td colspan="4" class="py-6 text-center text-base-content/60">Belum ada riwayat pendidikan.</td></tr>{/each}</tbody>
											</table>
										</div>
										<form method="dialog" class="border-base-200 flex justify-end border-t pt-3"><button class="btn btn-soft"><Icon name="close" /> Tutup</button></form>
									</div>
									<form method="dialog" class="modal-backdrop"><button aria-label="Tutup riwayat kelas">Tutup</button></form>
								</dialog></td
							><td>
								{#if row.identityEvidence}
									<button class="btn btn-soft btn-warning btn-sm btn-square shadow-none" type="button" data-review-id={row.id} title="Periksa identitas" aria-label={`Periksa identitas ${row.nama}`} onclick={openRowDialog}><Icon name="search" /></button>
									<dialog class="archive-dialog modal" aria-labelledby={`archive-review-title-${row.id}`}>
										<div class="modal-box w-full max-w-2xl space-y-4 p-4 text-sm whitespace-normal">
											<header><h2 id={`archive-review-title-${row.id}`} class="text-xl font-bold">Periksa Identitas</h2><p class="text-base-content/65 mt-1 break-words">{row.nama}</p></header>
											{#if form?.fail}<div class="alert alert-error alert-soft" role="alert"><Icon name="error" /><span>{form.fail}</span></div>{/if}
											{#each row.identityEvidence.sources as source (source.id)}
												{@const kelas = data.targetClasses.find(
													(item) => item.id === source.kelasId
												)}
												<dl class="border-base-200 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 border-b pb-3 text-sm">
													<dt>ID sumber</dt>
													<dd>{source.id}</dd>
													<dt>Nama</dt>
													<dd>{source.nama}</dd>
													<dt>NIS / NISN</dt>
													<dd>{source.nis} / {source.nisn || '-'}</dd>
													<dt>Tanggal lahir</dt>
													<dd>{source.tanggalLahir}</dd>
													<dt>Kelas / periode</dt>
													<dd>
														{kelas?.nama || '-'} · {kelas?.semester || '-'} ({kelas?.tahunAjaran ||
															'-'})
													</dd>
												</dl>
											{/each}
											{#each row.identityEvidence.legacy as legacy (legacy.id)}
												<p class="border-base-200 border-t pt-2 text-xs">
													Snapshot lama #{legacy.id}: {legacy.nama} · {legacy.nis} / {legacy.nisn ||
														'-'} · {statusLabel(legacy.status)}<br />{legacy.alasan || '-'}
												</p>
											{/each}
											{#if row.identityEvidence.problem}
												<p class="text-error text-sm">{row.identityEvidence.problem}</p>
											{:else}
												<form
													method="POST"
													action="?/resolveIdentity"
													class="space-y-3"
													use:enhance={() => {
														return async ({ update }) => {
															await update();
															await invalidate('app:murid');
															await invalidate('app:murid-arsip');
														};
													}}
												>
													<input type="hidden" name="lifecycleIds" value={row.id} />
													<input type="hidden" name="identityKey" value={row.identityKey} />
													<input type="hidden" name="expectedUpdatedAt" value={row.updatedAt} />
													<label class="block"
														><span class="mb-1 block text-sm">Keputusan</span><select
															class="select w-full"
															name="status"
															required
															><option value="">Pilih keputusan</option><option value="aktif"
																>Pulihkan ke Aktif</option
															><option value="keluar">Tetap Keluar Sekolah</option><option
																value="pindah">Pindah Sekolah</option
															><option value="alumni">Alumni / Lulus</option></select
														></label
													>
													<label class="block"
														><span class="mb-1 block text-sm">Tanggal Status</span><input
															class="input w-full"
															type="date"
															name="tanggalStatus"
															value={row.tanggalStatus || today}
														/></label
													>
													<label class="block"
														><span class="mb-1 block text-sm">Alasan Pemeriksaan</span><textarea
															class="textarea w-full"
															name="alasan"
															maxlength="500"
															required></textarea></label
													>
													<label class="flex items-start gap-2 text-xs"
														><input
															type="checkbox"
															class="checkbox checkbox-sm"
															name="identityReviewed"
															value="true"
															required
														/> Identitas dan status murid telah saya cocokkan dengan data sekolah.</label
													>
													<button class="btn btn-primary btn-sm" type="submit"
														><Icon name="save" /> Simpan Pemeriksaan</button
													>
												</form>
											{/if}
											<form method="dialog" class="border-base-200 flex justify-end border-t pt-3"><button class="btn btn-soft"><Icon name="close" /> Tutup</button></form>
										</div>
										<form method="dialog" class="modal-backdrop"><button aria-label="Tutup pemeriksaan identitas">Tutup</button></form>
									</dialog>
								{:else if row.needsIdentityReview}
									<span class="text-xs opacity-60">Perlu diperiksa admin</span>
								{:else if row.status === 'keluar' && data.canReviewIdentity}
									<button
										class="btn btn-error btn-soft btn-sm btn-square shadow-none"
										type="button"
										data-purge-id={row.id}
										title={row.identityKey.startsWith('uid:') ? 'Hapus permanen' : 'Hapus snapshot'}
										aria-label={`${row.identityKey.startsWith('uid:') ? 'Hapus permanen' : 'Hapus snapshot'} ${row.nama}`}
										onclick={() => purgeModal?.open(row)}
										><Icon name="del" /></button
									>
								{:else}<span class="text-xs opacity-50">-</span>{/if}
							</td></tr
						>{:else}<tr
							><td colspan="9" class="py-12 text-center opacity-60"
								>Belum ada data murid sesuai filter.</td
							></tr
						>{/each}</tbody
				>
			</table>
		</div>
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<p class="text-sm opacity-65">{data.page.totalItems} identitas murid ditemukan</p>
			{#if data.page.totalPages > 1}<nav aria-label="Halaman arsip murid" class="flex max-w-full flex-wrap items-center gap-1">
					{#if data.page.currentPage > 1}<a class="btn btn-sm btn-soft btn-square" href={resolve(pageUrl(data.page.currentPage - 1))} aria-label="Halaman sebelumnya" title="Halaman sebelumnya"><Icon name="left" /></a>
					{:else}<button class="btn btn-sm btn-soft btn-square" type="button" disabled aria-label="Halaman sebelumnya"><Icon name="left" /></button>{/if}
					{#each visiblePages as item, index (item)}
						{#if index && item > visiblePages[index - 1] + 1}<span class="px-1 text-xs" aria-hidden="true">...</span>{/if}
						<a class="btn btn-sm min-w-8 shadow-none" class:btn-primary={item === data.page.currentPage} class:btn-soft={item !== data.page.currentPage} aria-current={item === data.page.currentPage ? 'page' : undefined} aria-label={`Halaman ${item}`} href={resolve(pageUrl(item))}>{item}</a>
					{/each}
					{#if data.page.currentPage < data.page.totalPages}<a class="btn btn-sm btn-soft btn-square" href={resolve(pageUrl(data.page.currentPage + 1))} aria-label="Halaman berikutnya" title="Halaman berikutnya"><Icon name="right" /></a>
					{:else}<button class="btn btn-sm btn-soft btn-square" type="button" disabled aria-label="Halaman berikutnya"><Icon name="right" /></button>{/if}
				</nav>{/if}
		</div>
	</div>
</div>

{#if data.canReviewIdentity}<PurgeMuridModal bind:this={purgeModal} />{/if}

<style>
	.archive-table > tbody > tr > td:not([colspan]) {
		padding-block: 0.625rem;
		overflow-wrap: anywhere;
	}

	.archive-table > thead > tr > th {
		white-space: normal;
		overflow-wrap: break-word;
	}

	.archive-dialog .modal-box {
		max-height: min(85dvh, calc(100dvh - 1rem));
	}

	.archive-dialog :is(dd, p) {
		overflow-wrap: anywhere;
	}
</style>
