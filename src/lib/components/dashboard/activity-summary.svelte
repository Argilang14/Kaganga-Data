<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/icon.svelte';
	import type { loadDashboardDaily } from '$lib/server/dashboard-daily';
	type Activity = Awaited<ReturnType<typeof loadDashboardDaily>>['activitySummaries'][number];
	let { activities }: { activities: Activity[] } = $props();
	let dialog: HTMLDialogElement;
	let selected = $state<{ key: string; status: string } | null>(null);
	const selection = $derived.by(() => {
		const activity = activities.find((item) => item.key === selected?.key);
		if (!activity || !selected) return null;
		const status = selected.status;
		const groups = activity.groups.filter((group) =>
			status === 'present'
				? ['hadir', 'terlambat', 'pulang'].includes(group.status)
				: group.status === status
		);
		return {
			activity,
			label:
				selected.status === 'present'
					? activity.key === 'pulang'
						? 'Pulang'
						: 'Hadir'
					: (groups[0]?.label ?? '-'),
			total: groups.reduce((sum, group) => sum + group.total, 0),
			students: groups.flatMap((group) => group.students).slice(0, 20)
		};
	});
	function open(activity: Activity, status: string) {
		selected = { key: activity.key, status };
		dialog.showModal();
	}
	function icon(key: string) {
		if (['pagi', 'siang', 'makan_malam'].includes(key)) return 'coffee';
		return ['subuh', 'magrib', 'isya'].includes(key) ? 'moon' : 'sun';
	}
	function present(activity: Activity) {
		return activity.counts.hadir + activity.counts.terlambat + activity.counts.pulang;
	}
	function rate(activity: Activity) {
		return activity.total ? Math.round((activity.recorded / activity.total) * 100) : 0;
	}
</script>

<div
	class="dashboard-activity-grid"
	style={`--activity-columns: ${activities.length}`}
	aria-label="Ringkasan kegiatan hari ini"
>
	{#each activities as activity, index (activity.key)}
		<article class={`dashboard-activity-stat dashboard-activity-stat--${index % 3}`}>
			<header class="flex min-w-0 items-center gap-2">
				<span class="dashboard-activity-icon" aria-hidden="true"
					><Icon name={icon(activity.key)} class="size-4" /></span
				>
				<div class="min-w-0">
					<h3 class="text-sm font-semibold">{activity.label}</h3>
					<p class="text-xs text-base-content/55">
						{activity.time?.slice(0, 5) ?? 'Belum dijadwalkan'}
					</p>
				</div>
			</header>
			<div class="dashboard-activity-value">
				{#if activity.state === 'upcoming'}<span class="text-sm text-info">Belum dimulai</span>
				{:else if activity.state === 'unconfigured'}<span class="text-sm text-warning"
						>Belum diatur</span
					>
				{:else}<button
						class="flex items-baseline gap-2 text-left disabled:cursor-default"
						type="button"
						aria-label={`${activity.label}: ${present(activity)} ${activity.key === 'pulang' ? 'pulang' : 'hadir'}`}
						disabled={!present(activity)}
						onclick={() => open(activity, 'present')}
					>
						<strong class="text-3xl leading-none tabular-nums">{present(activity)}</strong>
						<span class="text-xs text-base-content/60"
							>{activity.key === 'pulang' ? 'pulang' : 'hadir'} / {activity.total}</span
						>
					</button>{/if}
			</div>
			<div class="dashboard-activity-progress">
				<div class="mb-1.5 flex justify-between gap-2 text-xs text-base-content/60">
					<span>{activity.recorded}/{activity.total} tercatat</span><strong
						>{rate(activity)}%</strong
					>
				</div>
				<progress
					class="progress progress-success block h-1.5 w-full"
					value={rate(activity)}
					max="100"
					aria-label={`Kelengkapan ${activity.label}`}
				></progress>
			</div>
			<div class="dashboard-activity-statuses flex flex-wrap gap-1.5">
				{#each activity.groups.filter((group) => !['hadir', 'terlambat', 'pulang', 'tanpa_sumber'].includes(group.status)) as group (group.status)}
					<button
						type="button"
						class={`dashboard-status-chip dashboard-attendance-status--${group.status}`}
						aria-label={`${activity.label}: ${group.label} ${group.total} murid`}
						onclick={() => open(activity, group.status)}
					>
						{group.label}<strong class="tabular-nums">{group.total}</strong>
					</button>
				{/each}
				{#if activity.counts.terlambat > 0}<button
						type="button"
						class="dashboard-status-chip dashboard-attendance-status--terlambat"
						onclick={() => open(activity, 'terlambat')}
						>Terlambat <strong>{activity.counts.terlambat}</strong></button
					>{/if}
			</div>
		</article>
	{/each}
	{#if !activities.length}<p class="text-sm text-base-content/60">
			Tidak ada kegiatan dalam cakupan Anda.
		</p>{/if}
</div>

<dialog bind:this={dialog} class="modal" aria-labelledby="dashboard-activity-dialog-title">
	<div class="modal-box max-w-lg">
		<header class="flex items-start justify-between gap-3">
			<div>
				<h3 id="dashboard-activity-dialog-title" class="font-bold">
					{selection?.activity.label} · {selection?.label}
				</h3>
				<p class="mt-1 text-sm text-base-content/60">{selection?.total ?? 0} murid</p>
			</div>
			<button
				type="button"
				class="btn btn-ghost btn-sm btn-square"
				aria-label="Tutup daftar kegiatan"
				onclick={() => dialog.close()}><Icon name="close" class="size-4" /></button
			>
		</header>
		{#if selection}
			<ul class="mt-4 divide-y divide-base-200" aria-label="Daftar murid kegiatan">
				{#each selection.students as student (student.id)}<li
						class="flex items-start justify-between gap-3 py-3 text-sm"
					>
						<span class="min-w-0 break-words">{student.nama}</span><span
							class="shrink-0 text-base-content/55">{student.kelas}</span
						>
					</li>{/each}
			</ul>
			{#if !selection.students.length}<p class="mt-4 text-sm text-base-content/60">
					Tidak ada murid dalam daftar ini.
				</p>{/if}
			{#if selection.total > selection.students.length}<a
					class="btn btn-sm mt-4"
					href={resolve(selection.activity.href)}>Lihat seluruh daftar di Monitoring</a
				>{/if}
		{/if}
	</div>
	<form method="dialog" class="modal-backdrop">
		<button aria-label="Tutup popup kegiatan">Tutup</button>
	</form>
</dialog>
