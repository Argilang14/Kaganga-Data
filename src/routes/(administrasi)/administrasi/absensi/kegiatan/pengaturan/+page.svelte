<script lang="ts">
	import ActivitySettings from '$lib/components/absensi/ActivitySettings.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<ActivitySettings {data} />
