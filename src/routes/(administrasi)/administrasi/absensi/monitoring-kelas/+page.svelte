<script lang="ts">
	import ClassMonitoring from '$lib/components/absensi/ClassMonitoring.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Monitoring Kelas</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<ClassMonitoring {data} />
