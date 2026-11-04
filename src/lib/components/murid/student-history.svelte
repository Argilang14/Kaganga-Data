<script lang="ts">
	import { passiveStatusLabels, type PassiveStatus } from '$lib/student-status';
	import type { RegistryStudent } from '$lib/server/student-registry';
	let { student }: { student: RegistryStudent } = $props();
</script>

<div class="space-y-5">
	<div>
		<p class="font-semibold">{student.nama}</p>
		<p class="mt-1 text-sm text-base-content/60">
			NIS: {student.nis || '—'} · NISN: {student.nisn || '—'}
		</p>
	</div>
	<section aria-labelledby="class-history-title">
		<h4 id="class-history-title" class="mb-3 font-semibold">
			Riwayat kelas <span class="text-sm font-normal text-base-content/60"
				>({student.classHistory.length})</span
			>
		</h4>
		{#if student.classHistory.length}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard access to horizontally scrollable history.) -->
			<div
				class="overflow-x-auto rounded-lg border border-base-300 focus-visible:outline-2 focus-visible:outline-primary"
				tabindex="0"
				role="region"
				aria-label="Tabel riwayat kelas"
			>
				<table class="table table-sm min-w-xl">
					<thead class="bg-base-200 text-base-content"
						><tr><th>Tahun ajaran</th><th>Semester</th><th>Kelas</th><th>Perubahan</th></tr></thead
					><tbody
						>{#each student.classHistory as history, index (index)}<tr
								><td class="whitespace-nowrap">{history.tahun_ajaran_snapshot}</td><td
									>{history.semester_snapshot}</td
								><td class="font-medium">{history.kelas_snapshot}</td><td
									>{history.tanggal ?? 'Penempatan'}{#if history.alasan}<p class="mt-1 text-xs">
											{passiveStatusLabels[history.alasan as PassiveStatus] ?? history.alasan}
										</p>{/if}{#if history.catatan}<p class="mt-1 text-xs text-base-content/60">
											{history.catatan}
										</p>{/if}</td
								></tr
							>{/each}</tbody
					>
				</table>
			</div>
			<p class="mt-2 text-xs text-base-content/60 sm:hidden">
				Geser tabel untuk melihat tanggal dan alasan perubahan.
			</p>{:else}<p class="rounded-lg bg-base-200 p-4 text-sm text-base-content/60">
				Belum ada riwayat penempatan kelas.
			</p>{/if}
	</section>
	<section aria-labelledby="dorm-history-title">
		<h4 id="dorm-history-title" class="mb-3 font-semibold">
			Riwayat asrama <span class="text-sm font-normal text-base-content/60"
				>({student.dormHistory.length})</span
			>
		</h4>
		{#if student.dormHistory.length}<div class="space-y-2">
				{#each student.dormHistory as history, index (index)}<div
						class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-base-200 p-3"
					>
						<div class="min-w-0">
							<p class="break-words text-sm font-medium">
								{history.asrama === history.kamar
									? history.asrama
									: `${history.asrama} / ${history.kamar}`}
							</p>
							<p class="mt-1 text-xs text-base-content/60">
								{history.mulai} sampai {history.selesai ?? 'sekarang'}
								{#if history.selesai_alasan}<br />{history.selesai_alasan}{/if}
							</p>
						</div>
						{#if !history.selesai}<span class="badge badge-sm badge-success badge-soft"
								>Saat ini</span
							>{/if}
					</div>{/each}
			</div>{:else}<p class="rounded-lg bg-base-200 p-4 text-sm text-base-content/60">
				Belum ada riwayat penempatan asrama.
			</p>{/if}
	</section>
</div>
