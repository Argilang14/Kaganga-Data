<script lang="ts">
	import PengasuhanWorkspace from '$lib/components/pengasuhan/PengasuhanWorkspace.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<PengasuhanWorkspace {data} />
