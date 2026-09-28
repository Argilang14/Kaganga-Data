<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	let { data } = $props();
	const number = new Intl.NumberFormat('id-ID');
	const levelLabel: Record<string, string> = { srd: 'SRD', srmp: 'SRMP', srma: 'SRMA/SRT' };
</script>

<div class="space-y-5">
	<nav class="flex justify-end" aria-label="Pilihan dashboard">
		<div class="join border-base-300 border bg-base-100 shadow-sm">
			<a class="btn btn-sm btn-ghost join-item shadow-none" href="/">Dashboard Umum</a>
			<a class="btn btn-sm btn-active join-item shadow-none" href="/dashboard-pimpinan">
				Dashboard Pimpinan
			</a>
		</div>
	</nav>

	<header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h2 class="text-2xl font-bold">Dashboard Pimpinan</h2>
			<p class="text-base-content/65 text-sm">
				{data.context.tahunAjaran} · Semester {data.context.semester} · {data.context.tanggal}
			</p>
		</div>
		<form class="grid gap-2 sm:grid-cols-2" method="GET">
			<select
				class="select select-bordered"
				name="jenjang"
				onchange={(event) => event.currentTarget.form?.requestSubmit()}
			>
				<option value="">Semua jenjang</option>
				{#each ['srd', 'srmp', 'srma'] as item}<option
						value={item}
						selected={data.filters.jenjang === item}>{levelLabel[item]}</option
					>{/each}
			</select>
			<select
				class="select select-bordered"
				name="kelas"
				onchange={(event) => event.currentTarget.form?.requestSubmit()}
			>
				<option value="0">Semua kelas</option>
				{#each data.classes.filter((item) => !data.filters.jenjang || item.jenjang === data.filters.jenjang) as item}<option
						value={item.id}
						selected={data.filters.kelasId === item.id}>{item.nama}</option
					>{/each}
			</select>
		</form>
	</header>

	<section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
		{#each [{ label: 'Rombel Aktif', value: data.summary.classes, icon: 'school' }, { label: 'Murid Aktif', value: data.summary.students, icon: 'users' }, { label: 'Pegawai Aktif', value: data.summary.employees, icon: 'briefcase' }, { label: 'Dokumen Menunggu', value: data.summary.pendingDocuments, icon: 'check-square' }] as item}
			<div class="rounded-lg border border-base-300 bg-base-100 p-4 shadow-sm">
				<div class="flex items-center justify-between">
					<span class="text-sm opacity-65">{item.label}</span><Icon
						name={item.icon as IconName}
						class="size-5"
					/>
				</div>
				<div class="mt-2 text-3xl font-bold">{number.format(item.value)}</div>
			</div>
		{/each}
	</section>

	<section class="grid gap-4 xl:grid-cols-2">
		<div class="rounded-lg border border-base-300 bg-base-100 p-5 shadow-sm">
			<h3 class="flex items-center gap-2 text-lg font-bold">
				<Icon name="users" /> Kehadiran Murid Hari Ini
			</h3>
			<div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
				{#each Object.entries(data.summary.studentAttendance) as [key, value]}
					<div class="rounded-lg bg-base-200 p-3">
						<div class="text-xs capitalize opacity-60">{key}</div>
						<div class="text-xl font-bold">{value}</div>
					</div>
				{/each}
			</div>
		</div>
		<div class="rounded-lg border border-base-300 bg-base-100 p-5 shadow-sm">
			<h3 class="flex items-center gap-2 text-lg font-bold">
				<Icon name="briefcase" /> Kehadiran Pegawai Hari Ini
			</h3>
			<div class="mt-4 grid grid-cols-3 gap-3">
				{#each Object.entries(data.summary.employeeAttendance) as [key, value]}
					<div class="rounded-lg bg-base-200 p-3">
						<div class="text-xs capitalize opacity-60">
							{key.replace('tidakHadir', 'tidak hadir')}
						</div>
						<div class="text-xl font-bold">{value}</div>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
		{#each [{ label: 'Murid Sudah Dinilai', item: data.summary.academic, icon: 'book-open' }, { label: 'Nilai Keasramaan', item: data.summary.dormitory, icon: 'layers' }, { label: 'Kelengkapan Foto', item: { completed: data.summary.completeness.photo, total: data.summary.students, percentage: data.summary.students ? Math.round((data.summary.completeness.photo / data.summary.students) * 100) : 0 }, icon: 'image' }, { label: 'Kelengkapan QR', item: { completed: data.summary.completeness.qr, total: data.summary.students, percentage: data.summary.students ? Math.round((data.summary.completeness.qr / data.summary.students) * 100) : 0 }, icon: 'grid' }] as progress}
			<div class="rounded-lg border border-base-300 bg-base-100 p-4 shadow-sm">
				<div class="flex items-center gap-2 font-semibold">
					<Icon name={progress.icon as IconName} />
					{progress.label}
				</div>
				<div class="mt-4 flex items-end justify-between">
					<strong class="text-2xl">{progress.item.percentage}%</strong><span
						class="text-xs opacity-60">{progress.item.completed}/{progress.item.total}</span
					>
				</div>
				<progress
					class="progress progress-primary mt-2 w-full"
					value={progress.item.percentage}
					max="100"
				></progress>
			</div>
		{/each}
	</section>

	<section>
		<div class="overflow-hidden rounded-lg border border-base-300 bg-base-100 shadow-sm">
			<div class="border-b border-base-300 p-4">
				<h3 class="text-lg font-bold">Ringkasan Per Kelas</h3>
			</div>
			<div class="overflow-x-auto">
				<table class="table">
					<thead
						><tr
							><th>Kelas</th><th>Jenjang</th><th>Wali Kelas</th><th>Murid</th><th>Hadir</th><th
								>Tidak Hadir</th
							><th>Belum Diisi</th></tr
						></thead
					><tbody>
						{#each data.classSummary as item}<tr
								><td class="font-semibold">{item.nama}</td><td>{levelLabel[item.jenjang]}</td><td
									>{item.waliKelas}</td
								><td>{item.murid}</td><td>{item.hadir}</td><td>{item.tidakHadir}</td><td
									>{item.belumDiisi}</td
								></tr
							>{:else}<tr
								><td colspan="7" class="py-10 text-center opacity-60"
									>Belum ada kelas pada filter ini.</td
								></tr
							>{/each}
					</tbody>
				</table>
			</div>
		</div>
	</section>
</div>
