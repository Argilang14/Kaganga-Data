<script lang="ts">
	import Monitoring from '$lib/components/absensi/Monitoring.svelte';
	let { data } = $props();
</script>

<Monitoring monitoring={data.monitoring} />
