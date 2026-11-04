<script lang="ts">
	import StudentRegistry from '$lib/components/murid/student-registry.svelte';
	import StudentArchive from '$lib/components/murid/student-archive.svelte';
	import { resolve } from '$app/paths';
	let { data, form } = $props();
</script>

{#if data.canManageArchive}
	<nav class="tabs tabs-box mb-4 w-fit max-w-full" aria-label="Tampilan Semua Murid">
		<a
			class="tab"
			class:tab-active={!data.archive}
			aria-current={!data.archive ? 'page' : undefined}
			href={resolve('/murid/semua')}>Daftar murid</a
		>
		<a
			class="tab"
			class:tab-active={Boolean(data.archive)}
			aria-current={data.archive ? 'page' : undefined}
			href={resolve('/murid/semua?view=arsip')}>Status & alumni</a
		>
	</nav>
{/if}
{#if data.archive}
	<StudentArchive data={data.archive} {form} />
{:else if data.registry}
	<StudentRegistry data={{ registry: data.registry, meta: data.meta }} />
{/if}
