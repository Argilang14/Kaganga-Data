<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import Icon from '$lib/components/icon.svelte';
	let { data, form } = $props();
	let selectedIds = $state<number[]>([]);
	let submitting = $state(false);

	const allSelected = $derived(data.rows.length > 0 && data.rows.every((row) => selectedIds.includes(row.id)));
	function toggle(id: number, checked: boolean) {
		selectedIds = checked ? [...new Set([...selectedIds, id])] : selectedIds.filter((item) => item !== id);
	}
	function toggleAll(checked: boolean) {
		selectedIds = checked ? data.rows.map((row) => row.id) : [];
	}
	function pageUrl(page: number) {
		const params = new URLSearchParams();
		if (data.filters.q) params.set('q', data.filters.q);
		if (data.filters.status) params.set('status', data.filters.status);
		if (page > 1) params.set('page', String(page));
		return `?${params}`;
	}
	function statusLabel(status: string) {
		return status === 'aktif' ? 'Aktif' : status === 'pindah' ? 'Pindah' : status === 'keluar' ? 'Keluar' : 'Alumni';
	}
	const today = new Date().toISOString().slice(0, 10);
</script>

<div class="space-y-5">
	{#if form?.fail}<div class="alert alert-error"><Icon name="error" /><span>{form.fail}</span></div>{/if}
	{#if form?.message}<div class="alert alert-success"><Icon name="success" /><span>{form.message}</span></div>{/if}

	<div class="card bg-base-100 rounded-lg p-4 shadow-md">
		<div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
			<div><h1 class="text-xl font-bold">Arsip Murid & Alumni</h1><p class="text-base-content/65 text-sm">Status dan riwayat kelas disimpan tanpa menghapus nilai, raport, atau presensi lama.</p></div>
			<a class="btn btn-soft btn-sm shadow-none" href="/murid"><Icon name="left" /> Data Murid</a>
		</div>
		<form method="GET" class="bg-base-200/40 grid gap-3 rounded-md p-4 sm:grid-cols-[1fr_220px_auto] sm:items-end">
			<label><span class="mb-1 block text-sm">Cari Murid</span><input class="input w-full" name="q" value={data.filters.q} placeholder="Nama, NIS, atau NISN" /></label>
			<label><span class="mb-1 block text-sm">Status</span><select class="select w-full" name="status"><option value="">Semua status</option>{#each data.statuses as item}<option value={item} selected={item === data.filters.status}>{statusLabel(item)}</option>{/each}</select></label>
			<button class="btn btn-primary shadow-none" type="submit"><Icon name="search" /> Tampilkan</button>
		</form>

		{#if selectedIds.length}
			<div class="mt-4 grid gap-4 xl:grid-cols-2">
				<form method="POST" action="?/updateStatus" use:enhance class="border-base-200 rounded-md border p-4">
					{#each selectedIds as id}<input type="hidden" name="lifecycleIds" value={id} />{/each}
					<h2 class="font-semibold">Ubah Status {selectedIds.length} Murid</h2>
					<div class="mt-3 grid gap-3 sm:grid-cols-2"><label><span class="mb-1 block text-sm">Status</span><select class="select w-full" name="status" required>{#each data.statuses as item}<option value={item}>{statusLabel(item)}</option>{/each}</select></label><label><span class="mb-1 block text-sm">Tanggal</span><input class="input w-full" type="date" name="tanggalStatus" value={today} /></label><label class="sm:col-span-2"><span class="mb-1 block text-sm">Alasan/Catatan</span><input class="input w-full" name="alasan" maxlength="500" placeholder="Opsional untuk status aktif" /></label></div>
					<div class="mt-3 flex justify-end"><button class="btn btn-primary btn-sm shadow-none" type="submit"><Icon name="save" /> Simpan Status</button></div>
				</form>
				<form method="POST" action="?/previewPromotion" use:enhance class="border-base-200 rounded-md border p-4">
					{#each selectedIds as id}<input type="hidden" name="lifecycleIds" value={id} />{/each}
					<h2 class="font-semibold">Kenaikan/Pindah Kelas</h2>
					<label class="mt-3 block"><span class="mb-1 block text-sm">Kelas tujuan semester berikutnya</span><select class="select w-full" name="targetClassId" required><option value="">Pilih kelas tujuan</option>{#each data.targetClasses as kelas}<option value={kelas.id}>{kelas.nama}{kelas.fase ? ` - ${kelas.fase}` : ''} · {kelas.semester} ({kelas.tahunAjaran})</option>{/each}</select></label>
					<div class="mt-3 flex justify-end"><button class="btn btn-soft btn-sm shadow-none" type="submit"><Icon name="eye" /> Pratinjau</button></div>
				</form>
			</div>
		{/if}

		{#if form?.preview}
			<div class="alert alert-warning mt-4 items-start"><Icon name="warning" /><div class="w-full"><h2 class="font-bold">Konfirmasi Kenaikan/Pindah Kelas</h2><p class="text-sm">{form.preview.students.length} murid akan dibuatkan data baru pada <strong>{form.preview.targetLabel}</strong>. Data semester lama tidak diubah.</p><ul class="my-2 max-h-32 overflow-auto text-sm">{#each form.preview.students as student}<li>{student.nama} · {student.nis}</li>{/each}</ul><form method="POST" action="?/promote" use:enhance={() => { submitting = true; return async ({ update }) => { await update(); submitting = false; selectedIds = []; await invalidate('app:murid-arsip'); }; }} class="flex justify-end"><input type="hidden" name="targetClassId" value={form.preview.targetClassId} /><input type="hidden" name="confirmed" value="true" />{#each form.preview.lifecycleIds as id}<input type="hidden" name="lifecycleIds" value={id} />{/each}<button class="btn btn-primary btn-sm shadow-none" type="submit" disabled={submitting}>{#if submitting}<span class="loading loading-spinner loading-xs"></span>{/if}<Icon name="save" /> Konfirmasi Proses</button></form></div></div>
		{/if}

		<div class="mt-4 overflow-x-auto rounded-md shadow-md">
			<table class="table min-w-[980px]"><thead class="bg-base-200"><tr><th><input class="checkbox" type="checkbox" checked={allSelected} onchange={(event) => toggleAll(event.currentTarget.checked)} aria-label="Pilih semua" /></th><th>No</th><th>Nama</th><th>NIS/NISN</th><th>Kelas Terakhir</th><th>Status</th><th>Tanggal & Alasan</th><th>Riwayat</th></tr></thead><tbody>{#each data.rows as row, index (row.id)}<tr><td><input class="checkbox" type="checkbox" checked={selectedIds.includes(row.id)} onchange={(event) => toggle(row.id, event.currentTarget.checked)} aria-label={`Pilih ${row.nama}`} /></td><td>{(data.page.currentPage - 1) * data.page.perPage + index + 1}</td><td class="font-medium">{row.nama}</td><td><div>{row.nis}</div><div class="text-xs opacity-60">{row.nisn || '-'}</div></td><td><div>{row.kelas || '-'}</div><div class="text-xs opacity-60">{row.semester || '-'} · {row.tahunAjaran || '-'}</div></td><td><span class:badge-success={row.status === 'aktif'} class:badge-warning={row.status === 'pindah' || row.status === 'keluar'} class:badge-info={row.status === 'alumni'} class="badge badge-soft">{statusLabel(row.status)}</span></td><td><div>{row.tanggalStatus || '-'}</div><div class="max-w-56 text-xs opacity-60">{row.alasan || '-'}</div></td><td><details><summary class="btn btn-xs btn-soft shadow-none">{row.history.length} periode</summary><div class="mt-2 min-w-72 space-y-2">{#each row.history as history}<div class="border-base-200 rounded border p-2 text-xs"><div class="font-semibold">{history.kelasSnapshot}{history.faseSnapshot ? ` - ${history.faseSnapshot}` : ''}</div><div>{history.semesterSnapshot} · {history.tahunAjaranSnapshot}</div></div>{/each}</div></details></td></tr>{:else}<tr><td colspan="8" class="py-12 text-center opacity-60">Belum ada data murid sesuai filter.</td></tr>{/each}</tbody></table>
		</div>
		<div class="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p class="text-sm opacity-65">{data.page.totalItems} identitas murid ditemukan</p>{#if data.page.totalPages > 1}<div class="join">{#each Array.from({ length: data.page.totalPages }, (_, index) => index + 1) as item}<a class:btn-active={item === data.page.currentPage} class="btn join-item btn-sm" href={pageUrl(item)}>{item}</a>{/each}</div>{/if}</div>
	</div>
</div>
