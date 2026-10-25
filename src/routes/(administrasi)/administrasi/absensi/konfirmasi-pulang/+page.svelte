<script lang="ts">
	import TravelDesk from '$lib/components/absensi/TravelDesk.svelte';
	let { data } = $props();
</script>

<TravelDesk {data} />
