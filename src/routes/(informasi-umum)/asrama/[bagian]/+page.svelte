<script lang="ts">
	import DormitoryWorkspace from '$lib/components/asrama/DormitoryWorkspace.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

{#key data.section.key}<DormitoryWorkspace {data} {form} />{/key}
