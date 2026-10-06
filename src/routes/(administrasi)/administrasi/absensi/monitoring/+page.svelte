<script lang="ts">
	import Monitoring from '$lib/components/absensi/Monitoring.svelte';
	import AttendanceReportTabs from '$lib/components/absensi/AttendanceReportTabs.svelte';
	let { data } = $props();
</script>

<AttendanceReportTabs
	active="monitoring"
	date={data.monitoring.date}
	classId={data.monitoring.classId}
	activityId={data.monitoring.columns.find((column) => column.key === data.monitoring.focus)
		?.activityId}
/>
<Monitoring monitoring={data.monitoring} />
