<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/icon.svelte';
	let { data, form } = $props();
	let selectedIds = $state<number[]>([]);
	let submitting = $state(false);
	let selectedAction = $state<'status' | 'kelas'>('status');
	let targetClassId = $state('');
	const editableRows = $derived(
		data.rows.filter((row) => row.identityKey.startsWith('uid:') && row.lastMuridId)
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
</script>

<div class="space-y-5">
	{#if form?.fail}<div class="alert alert-error">
			<Icon name="error" /><span>{form.fail}</span>
		</div>{/if}
	{#if form?.message}<div class="alert alert-success">
			<Icon name="success" /><span>{form.message}</span>
		</div>{/if}

	<div class="card bg-base-100 rounded-lg p-4 shadow-md">
		<div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
			<div>
				<h1 class="text-xl font-bold">Arsip Murid & Alumni</h1>
				<p class="text-base-content/65 text-sm">{data.page.totalItems} identitas murid</p>
			</div>
			<a class="btn btn-soft btn-sm shadow-none" href={resolve('/murid')}
				><Icon name="left" /> Data Murid</a
			>
		</div>
		<form
			method="GET"
			class="bg-base-200/40 grid gap-3 rounded-md p-4 sm:grid-cols-[1fr_220px_auto] sm:items-end"
		>
			{#if data.filters.perluPeriksa}<input type="hidden" name="perlu_periksa" value="1" />{/if}
			<label
				><span class="mb-1 block text-sm">Cari Murid</span><input
					class="input w-full"
					name="q"
					value={data.filters.q}
					placeholder="Nama, NIS, atau NISN"
				/></label
			>
			<label
				><span class="mb-1 block text-sm">Status Sekolah</span><select
					class="select w-full"
					name="status"
					><option value="">Semua status</option>{#each data.statuses as item (item)}<option
							value={item}
							selected={item === data.filters.status}>{statusLabel(item)}</option
						>{/each}</select
				></label
			>
			<button class="btn btn-primary shadow-none" type="submit"
				><Icon name="search" /> Tampilkan</button
			>
		</form>

		{#if selectionIds.length}
			<div class="mt-4 border-y border-base-200 py-4">
				<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
					<div class="flex flex-wrap items-center gap-3">
						<strong class="text-sm">{selectionIds.length} murid dipilih</strong>
						<fieldset class="join flex-wrap" aria-label="Jenis tindakan">
							<input
								type="radio"
								name="arsipAction"
								class="btn join-item"
								aria-label="Status Sekolah"
								value="status"
								bind:group={selectedAction}
							/>
							<input
								type="radio"
								name="arsipAction"
								class="btn join-item"
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
						<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_2fr]">
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
							<button class="btn btn-primary btn-sm shadow-none" type="submit"
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
							<button class="btn btn-soft btn-sm shadow-none" type="submit" disabled={!validTarget}
								><Icon name="eye" /> Pratinjau Penempatan</button
							>
						</div>
					</form>
				{/if}
			</div>
		{/if}

		{#if preview}
			<div class="alert alert-warning mt-4 items-start">
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

		<div class="mt-4 overflow-x-auto rounded-md shadow-md">
			<table class="table min-w-[980px]">
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
						><th>Tanggal Status & Alasan</th><th>Riwayat</th></tr
					></thead
				><tbody
					>{#each data.rows as row, index (row.id)}<tr
							><td
								><input
									class="checkbox"
									type="checkbox"
									checked={selectedIds.includes(row.id)}
									disabled={!row.identityKey.startsWith('uid:') || !row.lastMuridId}
									onchange={(event) => toggle(row.id, event.currentTarget.checked)}
									aria-label={`Pilih ${row.nama}`}
								/></td
							><td>{(data.page.currentPage - 1) * data.page.perPage + index + 1}</td><td
								class="font-medium"
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
									class="badge badge-soft whitespace-nowrap">{statusLabel(row.status)}</span
								>{#if row.needsIdentityReview}<span class="badge badge-warning mt-1"
										>Perlu Periksa Identitas</span
									>{/if}</td
							><td
								><div>{row.tanggalStatus || '-'}</div>
								<div class="max-w-56 text-xs opacity-60">{row.alasan || '-'}</div></td
							><td
								><details>
									<summary class="btn btn-xs btn-soft whitespace-nowrap shadow-none"
										>Riwayat ({row.history.length})</summary
									>
									<div class="mt-2 min-w-72 space-y-2">
										{#each row.history as history (history.id)}<div
												class="border-base-200 rounded border p-2 text-xs"
											>
												<div class="font-semibold">
													{history.kelasSnapshot}{history.faseSnapshot
														? ` - ${history.faseSnapshot}`
														: ''}
												</div>
												<div>{history.semesterSnapshot} · {history.tahunAjaranSnapshot}</div>
											</div>{/each}
									</div>
								</details></td
							></tr
						>{:else}<tr
							><td colspan="8" class="py-12 text-center opacity-60"
								>Belum ada data murid sesuai filter.</td
							></tr
						>{/each}</tbody
				>
			</table>
		</div>
		<div class="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
			<p class="text-sm opacity-65">{data.page.totalItems} identitas murid ditemukan</p>
			{#if data.page.totalPages > 1}<div class="join">
					{#each Array.from({ length: data.page.totalPages }, (_, index) => index + 1) as item (item)}<a
							class:btn-active={item === data.page.currentPage}
							class="btn join-item btn-sm"
							href={resolve(pageUrl(item))}>{item}</a
						>{/each}
				</div>{/if}
		</div>
	</div>
</div>
