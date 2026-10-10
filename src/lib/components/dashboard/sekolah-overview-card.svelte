<script lang="ts">
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
		<div class="flex items-center gap-4">
			<div
				class="dashboard-school-logo flex size-16 shrink-0 items-center justify-center rounded-lg p-2"
			>
				<img class="size-full object-contain" src={sekolahLogo} alt={`Logo ${sekolahNama}`} />
			</div>
			<div class="min-w-0 space-y-1">
				<h2 class="text-xs font-semibold text-base-content/70">Sekolah Aktif</h2>
				<p class="break-words text-base font-bold">{sekolahNama}</p>
				<p class="text-xs text-base-content/60">NPSN: {sekolahNpsn}</p>
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
