<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import { page } from '$app/state';
	import { onNavigate } from '$app/navigation';
	import { onMount } from 'svelte';
	import Icon from './icon.svelte';
	import Menu from './menu.svelte';
	import { appMenuItems } from './menu';
	import { favoritesStore } from '$lib/stores/favorites.svelte';
	import {
		allowedNavigationFavorites,
		navigationLeaves,
		visibleNavigation
	} from '$lib/navigation-menu';
	import {
		attendanceMenuPath,
		attendanceReportMenuLink,
		type AttendanceReportContext
	} from '$lib/attendance-report-navigation';

	let dialog: HTMLDialogElement;
	let menuButton: HTMLButtonElement;
	let open = $state(false);
	const user = $derived(page.data.user ?? null);
	const semester = $derived(page.data.activeSemesterTipe ?? null);
	const leaves = $derived(navigationLeaves(visibleNavigation(appMenuItems, user, semester)));
	const shortcuts = $derived.by(() => {
		const favoritePaths = allowedNavigationFavorites(
			favoritesStore.items,
			appMenuItems,
			user,
			semester
		).map((item) => item.path);
		const defaults =
			user?.type === 'tim_keamanan'
				? ['/administrasi/absensi/scan', '/administrasi/absensi/konfirmasi-pulang']
				: user?.type === 'wali_asuh' || user?.type === 'wali_asrama'
					? [
							'/administrasi/absensi/scan',
							'/pengasuhan/ringkasan',
							'/administrasi/absensi/monitoring'
						]
					: ['/administrasi/absensi/scan', '/jurnal-mengajar', '/murid'];
		return [...new Set([...favoritePaths, ...defaults])]
			.map((path) => leaves.find((item) => item.path === path))
			.filter((item): item is MenuItem => !!item)
			.slice(0, 3);
	});
	const activePath = $derived(attendanceMenuPath(page.url.pathname));
	const selected = $derived(
		shortcuts
			.filter((item) => activePath === item.path || activePath.startsWith(item.path + '/'))
			.sort((a, b) => b.path!.length - a.path!.length)[0]?.path
	);
	const labels: Record<string, string> = {
		'/administrasi/absensi/scan': 'Scan QR',
		'/jurnal-mengajar': 'Jurnal',
		'/murid': 'Murid',
		'/pengasuhan/ringkasan': 'Pengasuhan',
		'/administrasi/absensi/monitoring': 'Monitoring',
		'/administrasi/absensi/konfirmasi-pulang': 'Kepulangan'
	};
	const icons: Record<string, IconName> = {
		'/administrasi/absensi/scan': 'select',
		'/jurnal-mengajar': 'book',
		'/murid': 'users',
		'/pengasuhan/ringkasan': 'book-open',
		'/administrasi/absensi/monitoring': 'activity'
	};
	function closeMenu(returnFocus = true) {
		dialog?.close();
		open = false;
		if (returnFocus) menuButton?.focus();
	}
	function showMenu() {
		const drawer = document.getElementById('my-drawer-2') as HTMLInputElement | null;
		if (drawer) drawer.checked = false;
		open = true;
		dialog.showModal();
	}
	onNavigate(() => closeMenu(false));
	onMount(() => {
		let cancelled = false;
		fetch('/api/favorites')
			.then((response) => (response.ok ? response.json() : null))
			.then((result) => {
				if (!cancelled && result) favoritesStore.items = result.favorites ?? [];
			})
			.catch(() => {});
		const media = window.matchMedia('(min-width: 768px)');
		const resize = () => {
			if (media.matches) closeMenu(false);
		};
		media.addEventListener('change', resize);
		return () => {
			cancelled = true;
			media.removeEventListener('change', resize);
		};
	});
</script>

<nav
	class="dock dock-md app-mobile-dock border-base-300 bg-base-100 text-base-content z-40 border-t md:hidden"
	aria-label="Navigasi cepat"
>
	<a
		href="/"
		class:dock-active={page.url.pathname === '/'}
		aria-current={page.url.pathname === '/' ? 'page' : undefined}
	>
		<Icon name="school" class="size-5" /><span class="dock-label">Beranda</span>
	</a>
	{#each shortcuts as item (item.path)}
		<a
			href={attendanceReportMenuLink(
				item.path,
				page.url.pathname,
				page.url.search,
				page.data as AttendanceReportContext
			)}
			class:dock-active={selected === item.path}
			aria-current={selected === item.path ? 'page' : undefined}
			title={item.title}
		>
			<Icon name={icons[item.path!] ?? item.icon ?? 'grid'} class="size-5" />
			<span class="dock-label truncate">{labels[item.path!] ?? item.title}</span>
		</a>
	{/each}
	<button
		type="button"
		bind:this={menuButton}
		onclick={showMenu}
		class:dock-active={open}
		aria-haspopup="dialog"
		aria-expanded={open}
		aria-controls="mobile-menu-dialog"
	>
		<Icon name="menu-drawer" class="size-5" /><span class="dock-label">Menu</span>
	</button>
</nav>

<dialog
	id="mobile-menu-dialog"
	bind:this={dialog}
	class="modal modal-bottom app-mobile-menu md:hidden"
	aria-labelledby="mobile-menu-title"
	onclose={() => {
		open = false;
	}}
>
	<div class="modal-box flex max-h-[85dvh] w-full max-w-none flex-col rounded-t-xl p-4">
		<header class="mb-3 flex shrink-0 items-center justify-between border-b border-base-300 pb-3">
			<h2 id="mobile-menu-title" class="text-base font-semibold">Menu Kaganga</h2>
			<button
				type="button"
				class="btn btn-ghost btn-square btn-sm"
				title="Tutup menu"
				aria-label="Tutup menu"
				onclick={() => closeMenu()}><Icon name="close" /></button
			>
		</header>
		{#if open}<Menu onSelect={() => closeMenu(false)} />{/if}
		<footer class="mt-3 flex shrink-0 gap-2 border-t border-base-300 pt-3">
			<a href="/pengaturan" class="btn btn-ghost btn-sm flex-1" onclick={() => closeMenu(false)}
				><Icon name="gear" />Pengaturan</a
			>
			<a href="/tentang" class="btn btn-ghost btn-sm flex-1" onclick={() => closeMenu(false)}
				><Icon name="info" />Tentang</a
			>
		</footer>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button aria-label="Tutup menu" onclick={() => closeMenu()}>Tutup</button>
	</form>
</dialog>

<style>
	.app-mobile-menu .modal-box {
		max-height: 85dvh;
		overflow: hidden;
	}
	.app-mobile-dock {
		height: calc(4rem + env(safe-area-inset-bottom, 0px));
		padding-bottom: env(safe-area-inset-bottom, 0px);
	}
	.app-mobile-dock :is(a, button) {
		min-width: 0;
		min-height: 44px;
	}
	.app-mobile-dock .dock-label {
		max-width: 100%;
		font-size: 11px;
	}
	.app-mobile-dock :is(a, button):focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: -3px;
	}
</style>
