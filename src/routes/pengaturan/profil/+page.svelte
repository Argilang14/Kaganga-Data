<script lang="ts">
	import EmployeeProfile from '$lib/components/settings/EmployeeProfile.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head
	><title>Profil Pegawai Saya</title><meta name="robots" content="noindex, nofollow" /></svelte:head
>

<EmployeeProfile {data} />
