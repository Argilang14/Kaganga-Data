<script lang="ts">
	import CetakSR from '$lib/components/cetak-sr/CetakSR.svelte';

	let { data } = $props();
</script>

<CetakSR {data} pdfVariant="sr" />