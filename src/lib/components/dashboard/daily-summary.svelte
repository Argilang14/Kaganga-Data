<script lang="ts">
	import type { loadDashboardDaily } from '$lib/server/dashboard-daily';
	import Icon from '$lib/components/icon.svelte';
	let { summary }: { summary: Awaited<ReturnType<typeof loadDashboardDaily>> } = $props();
	const labels: Record<string, string> = {
		hadir: 'Hadir',
		terlambat: 'Terlambat',
		izin: 'Izin',
		sakit: 'Sakit',
		alfa: 'Alfa',
		dinas_luar: 'Dinas luar',
		cuti: 'Cuti'
	};
</script>

<div class="min-w-0 space-y-4">
	<section
		id="absensi-hari-ini"
		class="min-w-0 rounded-lg bg-base-100 p-5 shadow-sm"
		aria-label="Absensi hari ini"
	>
		<div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
			<h2 class="flex items-center gap-2 text-lg font-bold">
				<span class="text-success" aria-hidden="true"><Icon name="users" class="h-5 w-5" /></span
				>Absensi Hari Ini
			</h2>
			<span class="text-sm text-base-content/60">{summary.date} · {summary.scope}</span>
		</div>
		{#if summary.holiday}<p class="mb-2 text-sm text-base-content/60">
				Hari libur / non-efektif
			</p>{/if}
		<div class="grid gap-4 sm:grid-cols-2">
			{#each [{ name: 'Murid', value: summary.students }, { name: 'Pegawai', value: summary.employees }] as item}
				{#if item.value}<div>
						<h3 class="mb-2 font-semibold">
							<span class="mr-1 inline-flex align-middle text-base-content/60" aria-hidden="true"
								><Icon name="user" class="h-4 w-4" /></span
							>{item.name}
							<span class="font-normal text-base-content/60">({item.value.total})</span>
						</h3>
						<dl class="flex flex-wrap gap-x-4 gap-y-2 text-sm">
							{#each item.value.rows as row}<div>
									<dt class="text-base-content/60">{labels[row.status] ?? row.status}</dt>
									<dd class="font-semibold">{row.count}</dd>
								</div>{/each}
							<div>
								<dt class="text-base-content/60">Belum diisi</dt>
								<dd class="font-semibold">{item.value.unrecorded}</dd>
							</div>
						</dl>
					</div>{/if}
			{/each}
		</div>
		<div class="mt-4 border-t border-base-200 pt-3">
			{#each summary.absences as group}
				<details class="border-b border-base-200 py-2 last:border-0" open={group.total > 0}>
					<summary class="cursor-pointer font-semibold"
						><span
							class="mr-1 inline-flex align-middle"
							class:text-error={group.status === 'alfa'}
							class:text-warning={group.status === 'sakit'}
							class:text-info={group.status === 'izin'}
							aria-hidden="true"
							><Icon
								name={group.status === 'alfa'
									? 'warning'
									: group.status === 'sakit'
										? 'info'
										: 'pen'}
								class="h-4 w-4"
							/></span
						>{labels[group.status]}
						<span class="ml-1 font-normal text-base-content/60">({group.total} anak)</span></summary
					>
					{#if group.students.length}
						<div class="mt-2 overflow-x-auto">
							<table class="table table-sm" aria-label={`Daftar murid ${labels[group.status]}`}>
								<thead><tr><th>Nama Murid</th><th>Kelas</th></tr></thead><tbody
									>{#each group.students as student}<tr
											><td class="break-words">{student.nama}</td><td>{student.kelas}</td></tr
										>{/each}</tbody
								>
							</table>
						</div>
						{#if group.pageCount > 1}<nav
								class="mt-2 flex items-center justify-end gap-3 text-sm"
								aria-label={`Halaman daftar ${labels[group.status]}`}
							>
								<span>{group.page} / {group.pageCount}</span>{#if group.previous}<a
										class="btn btn-ghost btn-sm btn-square"
										href={group.previous}
										title="Halaman sebelumnya"
										aria-label="Halaman sebelumnya"><Icon name="left" class="h-4 w-4" /></a
									>{/if}{#if group.next}<a
										class="btn btn-ghost btn-sm btn-square"
										href={group.next}
										title="Halaman berikutnya"
										aria-label="Halaman berikutnya"><Icon name="right" class="h-4 w-4" /></a
									>{/if}
							</nav>{/if}
					{:else}<p class="mt-2 text-sm text-base-content/60">
							Tidak ada murid {labels[group.status].toLowerCase()} yang tercatat hari ini.
						</p>{/if}
				</details>
			{/each}
		</div>
	</section>
	<section class="min-w-0 rounded-lg bg-base-100 p-5 shadow-sm" aria-label="Data belum lengkap">
		<h2 class="mb-3 flex items-center gap-2 text-lg font-bold">
			<span class="text-info" aria-hidden="true"><Icon name="table" class="h-5 w-5" /></span>Data
			Belum Lengkap
		</h2>
		{#if summary.admin}<div class="mb-3 flex flex-wrap gap-4 text-sm">
				<a class="link" href="/murid?kelas_id=semua&belum_lengkap=foto">Murid tanpa foto</a><a
					class="link"
					href="/murid?kelas_id=semua&belum_lengkap=qr">Murid tanpa QR</a
				>
			</div>{/if}
		<dl class="grid grid-cols-2 gap-3 text-sm">
			<div>
				<dt class="flex items-center gap-2 text-base-content/60">
					<span class="text-info" aria-hidden="true"><Icon name="image" class="h-4 w-4" /></span
					>Foto murid
				</dt>
				<dd class="font-semibold">{summary.missing.photo}</dd>
			</div>
			<div>
				<dt class="flex items-center gap-2 text-base-content/60">
					<span class="text-success" aria-hidden="true"><Icon name="grid" class="h-4 w-4" /></span
					>QR murid
				</dt>
				<dd class="font-semibold">{summary.missing.qr}</dd>
			</div>
			{#if summary.missing.homeroom !== null}<div>
					<dt class="flex items-center gap-2 text-base-content/60">
						<span class="text-warning" aria-hidden="true"
							><Icon name="school" class="h-4 w-4" /></span
						>Wali kelas
					</dt>
					<dd class="font-semibold">{summary.missing.homeroom}</dd>
				</div>{/if}{#if summary.missing.employee !== null}<div>
					<dt class="flex items-center gap-2 text-base-content/60">
						<span class="text-secondary" aria-hidden="true"
							><Icon name="user" class="h-4 w-4" /></span
						>Identitas wajib pegawai
					</dt>
					<dd class="font-semibold">{summary.missing.employee}</dd>
				</div>{/if}
		</dl>
	</section>
</div>
