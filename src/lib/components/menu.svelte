<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import { page } from '$app/state';
	import { StorageState } from '$lib/state.svelte';
	import { searchQueryMarker } from '$lib/utils';
	import Icon from './icon.svelte';
	import { appMenuItems } from './menu';
	import { isAuthorizedUser } from '../../routes/pengguna/permissions';
	import { canAccessArea, getProtectedArea } from '$lib/menu-access';

	const expanded = new StorageState<boolean>('menu-expanded');

	let search = $state('');
	const activeSemesterTipe = $derived(
		(page.data as { activeSemesterTipe?: string | null } | null)?.activeSemesterTipe ?? null
	);
	const user = $derived(
		(page.data as { user?: Pick<AuthUser, 'permissions' | 'type'> | null } | null)?.user ?? null
	);

	function filterMenuByPermission(items: MenuItem[]): MenuItem[] {
		return items
			.map((item) => {
				const area = item.path ? getProtectedArea(item.path) : null;
				if (area && !canAccessArea(user, area)) return null;
				if (item.permission && !isAuthorizedUser([item.permission], user ?? undefined)) return null;
				if (!item.subMenu) return item;
				const subMenu = filterMenuByPermission(item.subMenu);
				if (!subMenu.length && !item.path) return null;
				return subMenu.length === item.subMenu.length ? item : { ...item, subMenu };
			})
			.filter((item): item is MenuItem => item !== null);
	}

	function filterByCondition(item: MenuItem, semesterTipe: string | null): boolean {
		if (item.condition && item.condition !== semesterTipe) return false;
		if (item.subMenu) {
			const hasVisibleChild = item.subMenu.some((child) => filterByCondition(child, semesterTipe));
			if (!hasVisibleChild) return false;
		}
		return true;
	}

	function filterMenu(menu: MenuItem[], search: string): MenuItem[] {
		const lowerSearch = search.toLowerCase();
		return menu
			.map((item) => {
				if (!filterByCondition(item, activeSemesterTipe)) return null;

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

	let menuItems = $derived(
		filterMenuByPermission(
			search
				? filterMenu(appMenuItems, search)
				: appMenuItems.filter((item) => filterByCondition(item, activeSemesterTipe))
		)
	);

	function collectLeafMenuPaths(items: MenuItem[]): string[] {
		return items.flatMap((item) =>
			item.subMenu
				? collectLeafMenuPaths(item.subMenu)
				: item.path
					? [item.path.replace(/\/+$/, '')]
					: []
		);
	}

	const leafMenuPaths = collectLeafMenuPaths(appMenuItems);

	function isMenuActive(currentPath: string, menuPath?: string) {
		if (!menuPath) return false;

		const normalizedPath = currentPath.replace(/\/+$/, '');
		const normalizedItemPath = menuPath.replace(/\/+$/, '');
		const bestMatch = leafMenuPaths
			.filter((path) => normalizedPath === path || normalizedPath.startsWith(path + '/'))
			.sort((a, b) => b.length - a.length)[0];

		return bestMatch === normalizedItemPath;
	}

	function closeMobileDrawer() {
		if (!window.matchMedia('(max-width: 1023px)').matches) return;
		const drawer = document.getElementById('my-drawer-2') as HTMLInputElement | null;
		if (drawer) drawer.checked = false;
	}
</script>

{#snippet menu_item(item: MenuItem)}
	{@const active = isMenuActive(page.url.pathname, item.path)}
	<li>
		{#if item.subMenu}
			<details open={expanded.value || !!search}>
				<summary>
					{@render menu_item_label(item)}
				</summary>
				<ul>
					{#each item.subMenu as menu (menu)}
						{@render menu_item(menu)}
					{/each}
				</ul>
			</details>
		{:else}
			<!-- `class:menu-active` is shorthand for `class="{active ? 'menu-active': ''}"` -->
			<a class:menu-active={active} href={item.path} onclick={closeMobileDrawer}>
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
	{#if search && item.tags?.length}
		<div class="badge badge-xs badge-accent" title="Termasuk di dalam menu">tag</div>
	{/if}
{/snippet}

<div class="flex-1">
	<div class="mb-3 flex min-w-0 gap-1">
		<label class="input bg-base-200 dark:bg-base-300 min-w-0 flex-1 rounded-box dark:border-none">
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
		class="lg:bg-base-200 lg:rounded-box lg:max-h-[calc(100dvh-13.5rem)] lg:overflow-y-auto lg:shadow-inner"
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
