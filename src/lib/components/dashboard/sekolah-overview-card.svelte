<script lang="ts">
	import { isIntegratedSchool } from '$lib/education-unit';
	let { sekolah } = $props<{ sekolah: Sekolah | null }>();

	const sekolahLogo = $derived(sekolah?.id ? `/sekolah/logo/${sekolah.id}` : '/sekolah.png');
	const sekolahNama = $derived(sekolah?.nama ?? 'Belum ada sekolah aktif');
	const sekolahNpsn = $derived(sekolah?.npsn ?? '-');
</script>

<section
	class="dashboard-panel dashboard-school min-w-0 rounded-lg p-5 shadow-sm"
	aria-label="Identitas sekolah"
>
	{#if sekolah}
		<div class="dashboard-school-identity">
			<div
				class="dashboard-school-logo flex size-10 shrink-0 items-center justify-center rounded-md p-1"
			>
				<img class="size-full object-contain" src={sekolahLogo} alt={`Logo ${sekolahNama}`} />
			</div>
			<div class="min-w-0 space-y-1">
				<h2 class="text-xs font-semibold text-base-content/70">Sekolah Aktif</h2>
				<p class="dashboard-school-name">{sekolahNama}</p>
				<p class="dashboard-stat-caption">
					{isIntegratedSchool(sekolah) ? 'NPSN per satuan pendidikan' : `NPSN: ${sekolahNpsn}`}
				</p>
			</div>
		</div>
	{:else}
		<div class="flex flex-col gap-2">
			<h2 class="card-title">Identitas Sekolah</h2>
			<p class="text-base-content/70">
				Belum ada sekolah aktif. Silakan pilih atau buat data sekolah melalui menu Identitas
				Sekolah.
			</p>
		</div>
	{/if}
</section>
