<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	let {
		sekolah,
		dateLabel,
		scope
	}: { sekolah: Sekolah | null; dateLabel: string; scope?: string } = $props();
</script>

<header class="dashboard-header">
	<img
		class="dashboard-banner-photo"
		src="/login/school-drone.jpg"
		alt=""
		aria-hidden="true"
		width="1600"
		height="1200"
		fetchpriority="high"
	/>
	<div class="dashboard-banner-content">
		<div class="dashboard-banner-date">
			<Icon name="calendar" class="size-3.5" /><span>{dateLabel}</span>
		</div>
		<div class="dashboard-banner-title">
			{#if sekolah}<span class="dashboard-banner-logo"
					><img
						src={`/sekolah/logo/${sekolah.id}`}
						alt={`Logo ${sekolah.nama}`}
						width="44"
						height="44"
					/></span
				>{/if}
			<div class="min-w-0">
				<h1>Selamat datang di KAGANGA</h1>
				<p>{sekolah?.nama ?? 'Sistem Informasi Terintegrasi Sekolah'}</p>
			</div>
		</div>
		<div class="dashboard-banner-footer">
			<p>Cerdas Bersama, Tumbuh Setara</p>
			{#if scope}<span class="dashboard-scope-label"
					><Icon name="users" class="size-3.5" />{scope}</span
				>{/if}
		</div>
	</div>
</header>
