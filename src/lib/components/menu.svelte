<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import { page } from '$app/state';
	import { DEFAULT_MENU_ACCESS, getMenuAccessKeyForItem } from '$lib/menu-access';
	import { StorageState } from '$lib/state.svelte';
	import { searchQueryMarker } from '$lib/utils';
	import Icon from './icon.svelte';
	import { appMenuItems } from './menu';

	const expanded = new StorageState<boolean>('menu-expanded');

	let search = $state('');
	let openMenus = $state<Record<string, boolean>>({});
	let roleMenuItems = $derived.by(() => filterMenuByRole(appMenuItems));
	let lockedMenuItems = $derived.by(() => markMenuAccessLocks(roleMenuItems));
	let menuItems = $derived(search ? filterMenu(lockedMenuItems, search) : lockedMenuItems);

	function markMenuAccessLocks(
		menu: MenuItem[],
		inheritedLockKey: string | null = null
	): MenuItem[] {
		const settings = page.data.menuAccess ?? DEFAULT_MENU_ACCESS;
		const permissions = (page.data.user?.permissions ?? []) as string[];
		const canBypassLocks = page.data.user?.type === 'admin' || permissions.includes('rapor_manage');
		return menu.map((item) => {
			const ownKey = getMenuAccessKeyForItem(item);
			const lockKey = canBypassLocks
				? null
				: (inheritedLockKey ?? (ownKey && !settings[ownKey] ? ownKey : null));
			const subMenu = item.subMenu ? markMenuAccessLocks(item.subMenu, lockKey) : undefined;

			return {
				...item,
				locked: Boolean(lockKey),
				lockKey: lockKey ?? undefined,
				subMenu
			};
		});
	}

	function filterMenuByRole(menu: MenuItem[]): MenuItem[] {
		const user = page.data.user as { type?: string; permissions?: string[] } | null | undefined;
		const type = user?.type;
		const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
		const hasFullBypass =
			permissions.includes('rapor_manage') && permissions.includes('kelas_pindah');

		if (type === 'wali_asrama') {
			return [
				{
					title: 'Informasi Umum',
					icon: 'chart',
					subMenu: [{ title: 'Data Murid', path: '/murid' }]
				},
				{
					title: 'Mata Pelajaran',
					icon: 'book',
					subMenu: [{ title: 'Keasramaan', path: '/keasramaan' }]
				},
				{
					title: 'Input Nilai',
					icon: 'pen',
					subMenu: [{ title: 'Keasramaan', path: '/asesmen-keasramaan' }]
				},
				{
					title: 'Administrasi',
					icon: 'briefcase',
					subMenu: [
						{ title: 'Catatan Wali Asrama', path: '/catatan-wali-asrama' },
						{ title: 'Rekap Nilai Asrama', path: '/rekap-nilai-asrama' }
					]
				},
				{
					title: 'Absensi',
					icon: 'activity',
					subMenu: [
						{ title: 'Scan QR', path: '/administrasi/absensi/scan' },
						{ title: 'Absensi Kegiatan', path: '/administrasi/absensi/kegiatan' },
						{ title: 'Rekap Kegiatan', path: '/administrasi/absensi/kegiatan/rekap' }
					]
				},
				{
					title: 'Cetak Dokumen SR',
					icon: 'print',
					path: '/cetak?sr=1'
				}
			];
		}

		if (type === 'wali_asuh') {
			return [
				{
					title: 'Mata Pelajaran',
					icon: 'book',
					subMenu: [{ title: 'Keasramaan', path: '/keasramaan' }]
				},
				{
					title: 'Input Nilai',
					icon: 'pen',
					subMenu: [{ title: 'Keasramaan', path: '/asesmen-keasramaan' }]
				},
				{
					title: 'Administrasi',
					icon: 'briefcase',
					subMenu: [
						{ title: 'Catatan Wali Asrama', path: '/catatan-wali-asrama' },
						{ title: 'Rekap Nilai Asrama', path: '/rekap-nilai-asrama' }
					]
				},
				{
					title: 'Absensi',
					icon: 'activity',
					subMenu: [
						{ title: 'Scan QR', path: '/administrasi/absensi/scan' },
						{ title: 'Absensi Kegiatan', path: '/administrasi/absensi/kegiatan' },
						{ title: 'Rekap Kegiatan', path: '/administrasi/absensi/kegiatan/rekap' }
					]
				}
			];
		}

		if (type === 'wali_kelas' && !permissions.includes('administrasi_absensi')) {
			return menu.map((item) => {
				if (item.title !== 'Absensi' || !item.subMenu) return item;
				return {
					...item,
					subMenu: item.subMenu.filter(
						(child) => child.path !== '/administrasi/absensi/kegiatan/pengaturan'
					)
				};
			});
		}

		if (type === 'user' && !hasFullBypass) {
			return [
				{
					title: 'Mata Pelajaran',
					icon: 'book',
					subMenu: [
						{
							title: 'Intrakurikuler',
							path: '/intrakurikuler',
							tags: ['tujuan pembelajaran', 'lingkup materi', 'tp']
						}
					]
				},
				{
					title: 'Input Nilai',
					icon: 'pen',
					subMenu: [
						{
							title: 'Intrakurikuler',
							subMenu: [
								{ title: 'Formatif', path: '/asesmen-formatif', tags: ['nilai'] },
								{ title: 'Sumatif', path: '/asesmen-sumatif', tags: ['nilai'] }
							]
						}
					]
				}
			];
		}

		return menu;
	}

	function filterMenu(menu: MenuItem[], search: string): MenuItem[] {
		const lowerSearch = search.toLowerCase();
		return menu
			.map((item) => {
				const isMatch =
					item.title.toLowerCase().includes(lowerSearch) ||
					item.tags?.some((t) => t.toLocaleLowerCase().includes(lowerSearch));

				// if it has subMenu, filter recursively
				const filteredSubMenu = item.subMenu ? filterMenu(item.subMenu, search) : [];

				// keep this item if it matches or has matching children
				if (isMatch || filteredSubMenu.length > 0) {
					return {
						...item,
						subMenu: filteredSubMenu.length > 0 ? filteredSubMenu : undefined
					};
				}

				// discard
				return null;
			})
			.filter((item) => item !== null);
	}

	function isMenuActive(currentPath: string, currentSearch: string, menuPath?: string) {
		if (!menuPath) return false;

		// match to sub paths
		const normalizedPath = currentPath.replace(/\/+$/, '');
		const normalizedItemPath = menuPath.replace(/\/+$/, '');
		if (normalizedItemPath.includes('?')) {
			return `${normalizedPath}${currentSearch}` === normalizedItemPath;
		}
		if (normalizedPath === normalizedItemPath && currentSearch.includes('sr=1')) {
			return false;
		}
		if (normalizedItemPath === '/administrasi/absensi') {
			return normalizedPath === normalizedItemPath;
		}
		if (normalizedItemPath === '/administrasi/absensi/kegiatan') {
			return normalizedPath === normalizedItemPath;
		}
		const active =
			normalizedPath === normalizedItemPath || normalizedPath.startsWith(normalizedItemPath + '/');
		return active;
	}

	function hasActiveMenu(item: MenuItem): boolean {
		if (isMenuActive(page.url.pathname, page.url.search, item.path)) return true;
		return item.subMenu?.some((child) => hasActiveMenu(child)) ?? false;
	}

	function isSubMenuOpen(item: MenuItem, key: string) {
		return expanded.value || !!search || openMenus[key] === true || hasActiveMenu(item);
	}

	function toggleSubMenu(event: MouseEvent, item: MenuItem, key: string) {
		event.preventDefault();
		openMenus = {
			...openMenus,
			[key]: !isSubMenuOpen(item, key)
		};
	}
</script>

{#snippet menu_item(item: MenuItem, key = item.title)}
	{@const active = isMenuActive(page.url.pathname, page.url.search, item.path)}
	<li>
		{#if item.subMenu}
			<details open={isSubMenuOpen(item, key)}>
				<summary onclick={(event) => toggleSubMenu(event, item, key)}>
					{@render menu_item_label(item)}
				</summary>
				<ul>
					{#each item.subMenu as menu (menu)}
						{@render menu_item(menu, `${key}/${menu.title}`)}
					{/each}
				</ul>
			</details>
		{:else}
			<!-- `class:menu-active` is shorthand for `class="{active ? 'menu-active': ''}"` -->
			<a
				class:menu-active={active && !item.locked}
				class:opacity-55={item.locked}
				class:cursor-not-allowed={item.locked}
				href={item.locked ? `/forbidden?required=menu_${item.lockKey ?? 'locked'}` : item.path}
				title={item.locked ? 'Menu ini sedang dikunci oleh administrator' : undefined}
			>
				{@render menu_item_label(item)}
			</a>
		{/if}
	</li>
{/snippet}

{#snippet menu_item_label(item: MenuItem)}
	{#if item.icon}
		<Icon name={item.icon} />
	{/if}
	<span>{@html searchQueryMarker(search, item.title)}</span>
	{#if item.locked}
		<Icon name="lock" class="text-base-content/60 ml-auto size-3.5" />
	{/if}
	{#if search && item.tags?.length}
		<div class="badge badge-xs badge-accent" title="Termasuk di dalam menu">tag</div>
	{/if}
{/snippet}

<div class="flex-1">
	<div class="mb-3 flex gap-1">
		<label class="input bg-base-200 dark:bg-base-300 rounded-box dark:border-none">
			<Icon name="search" />
			<input type="search" class="grow" bind:value={search} placeholder="Cari menu" />
		</label>
		<label
			class="btn swap btn-square rounded-box shadow-none"
			title={expanded.value ? 'Sempitkan menu' : 'Luaskan menu'}
		>
			<input type="checkbox" bind:checked={expanded.value} />
			<span class="swap-on"><Icon name="expand-all" /></span>
			<span class="swap-off"><Icon name="collapse-all" /></span>
		</label>
	</div>
	<div
		class="lg:bg-base-200 lg:rounded-box lg:max-h-[calc(100vh-13.5rem)] lg:overflow-y-auto lg:shadow-inner"
	>
		{#each menuItems as menu (menu)}
			{@render menu_item(menu)}
		{:else}
			<li>
				<span class="italic opacity-50 text-sm"> Tidak ada hasil pencarian </span>
			</li>
		{/each}
	</div>
</div>
