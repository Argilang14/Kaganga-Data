<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		attendanceReportSearch,
		type AttendanceReportView
	} from '$lib/attendance-report-navigation';
	import Icon from '$lib/components/icon.svelte';
	let {
		active,
		date,
		classId,
		activityId
	}: {
		active: AttendanceReportView;
		date: string;
		classId?: number | null;
		activityId?: number | null;
	} = $props();
	const tabs = [
		{
			key: 'monitoring',
			label: 'Monitoring',
			path: '/administrasi/absensi/monitoring',
			icon: 'activity'
		},
		{ key: 'rekap', label: 'Rekap', path: '/administrasi/absensi/kegiatan/rekap', icon: 'table' }
	] as const;
</script>

<header class="mb-5 min-w-0">
	<h1 class="mb-4 text-2xl font-bold">Monitoring &amp; Rekap Absensi</h1>
	<nav class="tabs tabs-border grid grid-cols-2 sm:flex" aria-label="Tampilan monitoring dan rekap">
		{#each tabs as tab (tab.key)}
			<a
				class="tab gap-2 px-4"
				class:tab-active={active === tab.key}
				aria-current={active === tab.key ? 'page' : undefined}
				href={resolve(
					`${tab.path}?${
						active === tab.key
							? page.url.searchParams.toString()
							: attendanceReportSearch(tab.key, { date, classId, activityId }).slice(1)
					}`
				)}
			>
				<Icon name={tab.icon} class="h-4 w-4" />{tab.label}
			</a>
		{/each}
	</nav>
</header>
