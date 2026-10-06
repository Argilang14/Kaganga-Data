<script lang="ts">
	import { page } from '$app/state';
	import CetakSR from '$lib/components/cetak-sr/CetakSR.svelte';
	import CetakBawaan from '$lib/components/cetak/CetakBawaan.svelte';
	let { data } = $props();
</script>
<h1 class="mb-4 text-2xl font-bold">Cetak Raport</h1>
{#key `${page.data.sekolah?.id}-${data.format}`}
	{#if data.format === 'sr'}
		<CetakSR {data} pdfVariant="sr" documentGroup="raport" />
	{:else if data.format === 'default'}
		<CetakBawaan {data} />
	{:else}
		<div role="alert" class="alert alert-warning">Jenis sekolah belum dikenali. Admin perlu memeriksa jenjang pada Data Sekolah sebelum mencetak raport.</div>
	{/if}
{/key}
