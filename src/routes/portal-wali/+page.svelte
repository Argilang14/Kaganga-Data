<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	let { data } = $props();
	const number = new Intl.NumberFormat('id-ID');
	const attendanceValue = (rows: Array<{ status: string; total: number }>, status: string) =>
		rows.find((item) => item.status === status)?.total ?? 0;
</script>

<div class="space-y-5">
	<header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<h2 class="text-2xl font-bold">Portal Wali Murid</h2>
			<p class="text-base-content/65 text-sm">
				Informasi baca-saja untuk anak yang terhubung dengan akun ini.
			</p>
		</div>
		{#if data.canManage}<a class="btn btn-primary" href="/portal-wali/pengaturan"
				><Icon name="gear" /> Kelola Akun Wali</a
			>{/if}
	</header>
	{#if data.children.length}<div class="grid gap-4 xl:grid-cols-2">
			{#each data.children as child}<article
					class="rounded-lg border border-base-300 bg-base-100 p-5 shadow-sm"
				>
					<div class="flex items-start gap-4">
						<div class="avatar placeholder">
							<div class="size-20 rounded-lg bg-base-200">
								<img src={`/api/murid-photo/${child.muridId}?thumbnail=1`} alt={child.nama} />
							</div>
						</div>
						<div class="min-w-0">
							<h3 class="text-xl font-bold">{child.nama}</h3>
							<p class="text-sm opacity-65">
								{child.nis} · {child.kelas}{child.fase ? ` - ${child.fase}` : ''}
							</p>
							<span class="badge badge-outline badge-sm mt-2">{child.hubungan}</span>
						</div>
					</div>
					<div class="mt-5 grid grid-cols-4 gap-2">
						{#each ['hadir', 'sakit', 'izin', 'alfa'] as status}<div
								class="rounded-md bg-base-200 p-3 text-center"
							>
								<div class="text-xs capitalize opacity-60">{status}</div>
								<strong class="text-xl">{attendanceValue(child.attendance, status)}</strong>
							</div>{/each}
					</div>
					<div class="mt-4 grid gap-3 sm:grid-cols-2">
						<div class="rounded-md border border-base-300 p-3">
							<div class="text-xs opacity-60">Rata-rata nilai tersedia</div>
							<strong class="text-xl">{child.grade?.rataRata ?? '-'}</strong>
							<div class="text-xs opacity-50">
								{number.format(Number(child.grade?.jumlah ?? 0))} mata pelajaran
							</div>
						</div>
						<div class="rounded-md border border-base-300 p-3">
							<div class="text-xs opacity-60">Raport diterbitkan</div>
							<strong class="text-xl">{child.reports.length}</strong>
							<div class="text-xs opacity-50">Hanya dokumen final</div>
						</div>
					</div>
					<div class="mt-3 rounded-md border border-base-300 p-3">
						<div class="text-xs opacity-60">Perkembangan fisik terbaru</div>
						{#if child.growth}
							<div class="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
								<span><strong>{child.growth.tinggiBadan ?? '-'}</strong> cm</span>
								<span><strong>{child.growth.beratBadan ?? '-'}</strong> kg</span>
								<span class="capitalize"
									>{child.growth.statusGizi?.replaceAll('_', ' ') ?? 'Belum dinilai'}</span
								>
								<span class="opacity-60">{child.growth.tanggal}</span>
							</div>
						{:else}
							<div class="mt-1 text-sm opacity-50">Belum ada pengukuran.</div>
						{/if}
					</div>
				</article>{/each}
		</div>{:else}<div
			class="rounded-lg border border-dashed border-base-300 bg-base-100 p-12 text-center"
		>
			<Icon name="users" class="mx-auto size-10" />
			<h3 class="mt-3 font-bold">Belum ada anak terhubung</h3>
			<p class="text-sm opacity-60">Admin perlu menghubungkan akun wali dengan data murid.</p>
		</div>{/if}
	<section class="rounded-lg border border-base-300 bg-base-100 shadow-sm">
		<div class="border-b border-base-300 p-4"><h3 class="font-bold">Pengumuman Sekolah</h3></div>
		<div class="divide-y divide-base-300">
			{#each data.announcements as item}<article class="p-4">
					<div class="flex items-center gap-2">
						<h4 class="font-semibold">{item.judul}</h4>
						{#if item.prioritas === 'penting'}<span class="badge badge-warning badge-sm"
								>Penting</span
							>{/if}
					</div>
					<p class="mt-1 whitespace-pre-line text-sm opacity-75">{item.isi}</p>
				</article>{:else}<p class="p-8 text-center text-sm opacity-60">
					Belum ada pengumuman.
				</p>{/each}
		</div>
	</section>
</div>
