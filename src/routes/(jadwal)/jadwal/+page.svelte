<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/icon.svelte';

	const cards = [
		{
			title: 'Jadwal Pelajaran',
			description: 'Grid pelajaran per kelas untuk Senin-Jumat.',
			href: '/jadwal/pelajaran',
			icon: 'book'
		},
		{
			title: 'Aturan Generate Jadwal',
			description:
				'Atur beban jam mapel per kelas, buat draft otomatis, dan terapkan ke jadwal aktif.',
			href: '/jadwal/generate',
			icon: 'calendar'
		},
		{
			title: 'Kalender Pendidikan',
			description: 'Agenda, libur, asesmen, dan kegiatan sekolah.',
			href: '/jadwal/kalender',
			icon: 'calendar'
		},
		{
			title: 'Pengaturan Jadwal',
			description: 'Hari aktif, jam pelajaran, dan kegiatan non-mapel.',
			href: '/jadwal/pengaturan',
			icon: 'gear'
		}
	] as const;
</script>

<div class="space-y-4">
	<div>
		<h2 class="text-2xl font-bold">Jadwal</h2>
		<p class="text-base-content/70 text-sm">
			Fondasi jadwal pelajaran dan kalender pendidikan untuk sekolah terintegrasi SD, SMP, dan SMA.
		</p>
	</div>

	<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
		{#each cards as card (card.href)}
			<a
				class="card bg-base-100 border-base-200 hover:border-primary rounded-lg border p-4 shadow-sm transition"
				href={resolve(card.href)}
			>
				<div class="mb-3 flex items-center gap-2">
					<div class="bg-primary/10 text-primary rounded-lg p-2">
						<Icon name={card.icon} />
					</div>
					<h3 class="font-semibold">{card.title}</h3>
				</div>
				<p class="text-base-content/70 text-sm">{card.description}</p>
			</a>
		{/each}
	</div>
</div>
