<script lang="ts">
	import CetakSR from '$lib/components/cetak-sr/CetakSR.svelte';
	import { page } from '$app/state';
	let { data } = $props();
</script>
<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
	<h1 class="text-2xl font-bold">Cetak Dokumen</h1>
</div>
{#key page.data.sekolah?.id}
	<CetakSR {data} pdfVariant="default" documentGroup="dokumen" />
{/key}
