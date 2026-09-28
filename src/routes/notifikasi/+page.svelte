<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	let { data } = $props();
	const tone: Record<string, string> = { info: 'border-info/35 bg-info/5', warning: 'border-warning/45 bg-warning/5', error: 'border-error/40 bg-error/5' };
</script>

<div class="space-y-5">
	<header class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
		<div><h2 class="text-2xl font-bold">Pusat Notifikasi</h2><p class="text-base-content/65 text-sm">Ringkasan kondisi yang memerlukan perhatian pada sekolah aktif.</p></div>
		<div class="badge badge-primary badge-lg">{data.total} perlu ditindaklanjuti</div>
	</header>
	{#if data.notices.length}
		<div class="grid gap-3 lg:grid-cols-2">
			{#each data.notices as notice}
				<a class={`group flex min-h-28 items-center gap-4 rounded-lg border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${tone[notice.severity]}`} href={notice.href}>
					<div class="bg-base-100 flex size-12 shrink-0 items-center justify-center rounded-lg border border-base-300"><Icon name={notice.severity === 'info' ? 'info' : 'warning'} /></div>
					<div class="min-w-0 flex-1"><div class="flex items-start justify-between gap-3"><h3 class="font-semibold">{notice.title}</h3><span class="badge badge-neutral">{notice.count}</span></div><p class="text-base-content/65 mt-1 text-sm">{notice.description}</p></div>
					<Icon name="right" />
				</a>
			{/each}
		</div>
	{:else}
		<div class="rounded-lg border border-success/35 bg-success/5 p-10 text-center shadow-sm"><div class="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-success/15"><Icon name="check" /></div><h3 class="text-lg font-semibold">Tidak ada perhatian mendesak</h3><p class="text-base-content/65 text-sm">Semua pemeriksaan otomatis saat ini dalam kondisi baik.</p></div>
	{/if}
	<p class="text-base-content/45 text-xs">Diperbarui otomatis saat halaman dibuka. Tidak menyimpan salinan data tambahan.</p>
</div>
