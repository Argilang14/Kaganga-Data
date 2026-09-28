<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	let { data } = $props();

	function pageUrl(page: number) {
		const params = new URLSearchParams();
		for (const [key, value] of Object.entries({
			q: data.filters.q,
			action: data.filters.action,
			entity: data.filters.entityType,
			from: data.filters.dateFrom,
			to: data.filters.dateTo
		})) if (value) params.set(key, value);
		if (page > 1) params.set('page', String(page));
		return `?${params}`;
	}

	function formatDate(value: string) {
		return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value));
	}
</script>

<div class="card bg-base-100 rounded-lg p-4 shadow-md">
	<div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<h1 class="text-xl font-bold">Riwayat Aktivitas</h1>
			<p class="text-base-content/65 text-sm">Catatan hanya-baca untuk perubahan data penting di sekolah aktif.</p>
		</div>
		<a class="btn btn-soft btn-sm shadow-none" href="/pengaturan"><Icon name="left" /> Kembali</a>
	</div>

	<form method="GET" class="bg-base-200/40 grid gap-3 rounded-md p-4 md:grid-cols-2 xl:grid-cols-6">
		<label class="xl:col-span-2"><span class="mb-1 block text-sm">Pencarian</span><input class="input w-full" name="q" value={data.filters.q} placeholder="Pengguna, ringkasan, atau ID" /></label>
		<label><span class="mb-1 block text-sm">Tindakan</span><select class="select w-full" name="action"><option value="">Semua tindakan</option>{#each data.actions as item}<option value={item} selected={item === data.filters.action}>{item}</option>{/each}</select></label>
		<label><span class="mb-1 block text-sm">Data</span><select class="select w-full" name="entity"><option value="">Semua data</option>{#each data.entities as item}<option value={item} selected={item === data.filters.entityType}>{item}</option>{/each}</select></label>
		<label><span class="mb-1 block text-sm">Dari</span><input class="input w-full" type="date" name="from" value={data.filters.dateFrom} /></label>
		<label><span class="mb-1 block text-sm">Sampai</span><input class="input w-full" type="date" name="to" value={data.filters.dateTo} /></label>
		<div class="flex gap-2 xl:col-span-6 xl:justify-end"><a class="btn btn-soft shadow-none" href="?">Reset</a><button class="btn btn-primary shadow-none" type="submit"><Icon name="search" /> Tampilkan</button></div>
	</form>

	<div class="mt-4 overflow-x-auto rounded-md shadow-md">
		<table class="table min-w-[920px]">
			<thead class="bg-base-200"><tr><th>Waktu</th><th>Pengguna</th><th>Tindakan</th><th>Data</th><th>Ringkasan</th><th>Detail</th></tr></thead>
			<tbody>
				{#each data.rows as row (row.id)}
					<tr><td class="whitespace-nowrap text-sm">{formatDate(row.createdAt)}</td><td><div class="font-medium">{row.usernameSnapshot}</div><div class="text-xs opacity-60">{row.roleSnapshot}</div></td><td><span class="badge badge-soft">{row.action}</span></td><td><div>{row.entityType}</div><div class="text-xs opacity-60">{row.entityId ?? '-'}</div></td><td>{row.summary}</td><td>{#if row.beforeData || row.afterData}<details class="dropdown dropdown-end"><summary class="btn btn-xs btn-soft shadow-none">Lihat</summary><div class="dropdown-content bg-base-100 z-10 mt-1 w-[32rem] max-w-[80vw] rounded-md border p-3 shadow-xl"><div class="grid gap-3 md:grid-cols-2"><div><div class="mb-1 font-semibold">Sebelum</div><pre class="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(row.beforeData, null, 2) || '-'}</pre></div><div><div class="mb-1 font-semibold">Sesudah</div><pre class="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(row.afterData, null, 2) || '-'}</pre></div></div></div></details>{:else}-{/if}</td></tr>
				{:else}<tr><td colspan="6" class="py-12 text-center opacity-60">Belum ada aktivitas sesuai filter.</td></tr>{/each}
			</tbody>
		</table>
	</div>
	<div class="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p class="text-sm opacity-65">{data.page.totalItems} aktivitas ditemukan</p>{#if data.page.totalPages > 1}<div class="join">{#each Array.from({ length: data.page.totalPages }, (_, index) => index + 1) as item}<a class:btn-active={item === data.page.currentPage} class="btn join-item btn-sm" href={pageUrl(item)}>{item}</a>{/each}</div>{/if}</div>
</div>
