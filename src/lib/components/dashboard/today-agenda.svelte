<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { canAccessMenu } from '$lib/role-menu-access';
	import Icon from '$lib/components/icon.svelte';
	import type { loadDashboardDaily } from '$lib/server/dashboard-daily';
	let { summary }: { summary: Awaited<ReturnType<typeof loadDashboardDaily>> } = $props();
	let expanded = $state(false);
	const lessons = $derived(expanded ? summary.lessons : summary.lessons.slice(0, 5));
</script>

{#if summary.canAgenda}
	<section
		class="dashboard-panel dashboard-today min-w-0 overflow-hidden rounded-lg"
		aria-label="Jadwal hari ini"
	>
		<header
			class="dashboard-panel-heading flex flex-wrap items-center justify-between gap-2 border-b border-base-200"
		>
			<h2 class="flex min-w-0 items-center gap-2 font-bold">
				<Icon name="calendar" class="size-4 shrink-0 text-info" /><span class="break-words"
					>Jadwal Hari Ini
					{#if summary.lessonClass}<span class="ml-1 text-xs font-medium text-base-content/60"
							>Kelas {summary.lessonClass.nama}</span
						>{/if}</span
				>
			</h2>
			{#if canAccessMenu(page.data.user, '/rapor/jadwal-pelajaran')}<a
					href={resolve('/rapor/jadwal-pelajaran')}
					class="link text-xs text-info">Jadwal lengkap</a
				>{/if}
		</header>
		<div class="px-4 py-2">
			{#if summary.holiday}<p class="py-4 text-sm text-base-content/60">
					Hari libur atau non-efektif.
				</p>
			{:else if !summary.lessonClass}<p class="py-4 text-sm text-base-content/60">
					Pilih kelas aktif yang sesuai penugasan Anda untuk melihat jadwal.
				</p>
			{:else if lessons.length}<ol class="divide-y divide-base-200">
					{#each lessons as lesson (lesson.id)}<li class="dashboard-agenda-row">
							<span class="text-xs font-medium tabular-nums text-base-content/65"
								>{lesson.start ?? '-'}<br />{lesson.end ?? '-'}</span
							>
							<div class="min-w-0">
								<p class="break-words text-sm font-semibold">{lesson.title}</p>
								<p class="mt-0.5 break-words text-xs text-base-content/60">
									{lesson.kelas}{#if lesson.teacher}
										· {lesson.teacher}{/if}
								</p>
							</div>
						</li>{/each}
				</ol>
			{:else}<p class="py-4 text-sm text-base-content/60">
					Belum ada jadwal hari ini untuk kelas ini.
				</p>{/if}
			{#if summary.lessons.length > 5}<button
					class="btn btn-ghost btn-sm my-1 w-full"
					type="button"
					aria-expanded={expanded}
					onclick={() => (expanded = !expanded)}
					>{expanded ? 'Ringkas jadwal' : `Tampilkan ${summary.lessons.length} slot jadwal`}</button
				>{/if}
		</div>
	</section>
{/if}

{#if summary.canAnnouncements || summary.events.length}
	<section
		class="dashboard-panel dashboard-news min-w-0 overflow-hidden rounded-lg"
		aria-label="Pengumuman dan agenda"
	>
		<header
			class="dashboard-panel-heading flex flex-wrap items-center justify-between gap-2 border-b border-base-200"
		>
			<h2 class="flex items-center gap-2 font-bold">
				<Icon name="calendar" class="size-4 text-warning" />Pengumuman & Agenda
			</h2>
			{#if summary.canAnnouncements}<a href={resolve('/pengumuman')} class="link text-xs text-info"
					>Lihat semua</a
				>{/if}
		</header>
		<div class="divide-y divide-base-200 px-4">
			{#each summary.announcements as item (item.id)}<div class="py-3">
					<div class="mb-1 flex flex-wrap items-center gap-2 text-xs text-base-content/60">
						<time datetime={item.date}>{item.date.split('-').reverse().join('/')}</time
						>{#if item.priority === 'penting'}<span class="badge badge-warning badge-soft badge-sm"
								>Penting</span
							>{/if}<span class="capitalize">{item.category}</span>
					</div>
					<p class="break-words text-sm font-semibold">{item.title}</p>
				</div>{/each}
			{#each summary.events.slice(0, 3) as event (event.id)}<div class="py-3">
					<p class="mb-1 text-xs text-base-content/60">Agenda hari ini</p>
					<p class="break-words text-sm font-medium">{event.title}</p>
				</div>{/each}
			{#if !summary.announcements.length && !summary.events.length}<p
					class="py-5 text-sm text-base-content/60"
				>
					Belum ada pengumuman atau agenda yang sedang berlangsung.
				</p>{/if}
		</div>
	</section>
{/if}
