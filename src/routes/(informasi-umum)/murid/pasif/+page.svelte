<script lang="ts">
	import StudentRegistry from '$lib/components/murid/student-registry.svelte';
	let { data } = $props();
</script>

<StudentRegistry {data} />
