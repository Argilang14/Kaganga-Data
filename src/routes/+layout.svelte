<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- layout contains many intentional href links for navigation */
	import { page } from '$app/state';
	import { onNavigate } from '$app/navigation';
	import GlobalModal from '$lib/components/global-modal.svelte';
	import Icon from '$lib/components/icon.svelte';
	import Menu from '$lib/components/menu.svelte';
	import MobileDock from '$lib/components/mobile-dock.svelte';
	import Navbar from '$lib/components/navbar.svelte';
	import Toast, { toast } from '$lib/components/toast.svelte';
	import { onMount } from 'svelte';

	import NavIndicator from '$lib/components/nav-indicator.svelte';
	import ScrollToTop from '$lib/components/scroll-to-top.svelte';
	import '../app.css';
	import { isRestrictedTeacher } from '$lib/access-position';

	let { data, children } = $props();

	const appName = 'Kaganga';
	let stoppingServer = $state(false);
	let loggingOut = $state(false);
	onNavigate(() => {
		const drawer = document.getElementById('my-drawer-2') as HTMLInputElement | null;
		if (drawer) drawer.checked = false;
	});
	const isLoginPage = $derived(page.url.pathname === '/login');
	const isPublicGuestPage = $derived(page.url.pathname.startsWith('/tamu/'));
	const isFluidWorkspace = $derived(
		/^\/murid\/?$/.test(page.url.pathname) ||
			/^\/pengasuhan\/(ringkasan|piket|kejadian|perkembangan|sakit)\/?$/.test(page.url.pathname)
	);

	const readonlyRoutes = [
		'/murid',
		'/kokurikuler',
		'/ekstrakurikuler',
		'/keasramaan',
		'/asesmen-kokurikuler',
		'/nilai-ekstrakurikuler',
		'/asesmen-keasramaan',
		'/catatan-wali-kelas',
		'/status-akhir',
		'/cetak-raport'
	];

	const isReadonlyPage = $derived(
		readonlyRoutes.some((r) => page.url.pathname === r || page.url.pathname.startsWith(r + '/'))
	);

	const disableInteraction = $derived(
		isRestrictedTeacher(data.user) &&
			isReadonlyPage &&
			!(
				page.url.pathname.startsWith('/murid') && data.user?.permissions?.includes('kelas_manage')
			) &&
			!(
				page.url.pathname.startsWith('/keasramaan') &&
				data.user?.permissions?.includes('keasramaan_manage')
			) &&
			!(
				page.url.pathname.startsWith('/asesmen-keasramaan') &&
				data.user?.permissions?.includes('keasramaan_input')
			)
	);

	onMount(() => {
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register('/service-worker.js').catch((error) => {
				console.warn('Service worker Kaganga tidak dapat didaftarkan.', error);
			});
		}
	});

	async function stopServer() {
		if (stoppingServer) return;
		stoppingServer = true;

		const showSuccess = () =>
			toast({
				message:
					'Server dihentikan. Tutup jendela Kaganga ini lalu jalankan ulang bila diperlukan.',
				type: 'info',
				persist: true
			});

		try {
			const response = await fetch('/api/runtime/stop', { method: 'POST', keepalive: true });
			if (response.ok) {
				showSuccess();
			} else {
				const details = await response.text().catch(() => '');
				console.error('Gagal menghentikan server', response.status, details);
				toast({ message: 'Gagal menghentikan server. Coba lagi.', type: 'error' });
			}
		} catch (error) {
			console.warn(
				'Permintaan stop server berakhir sebelum respons diterima. Diasumsikan berhasil.',
				error
			);
			showSuccess();
		} finally {
			stoppingServer = false;
		}
	}

	async function logout() {
		if (loggingOut) return;
		loggingOut = true;

		try {
			const response = await fetch('/logout', { method: 'POST' });
			if (response.redirected) {
				window.location.href = response.url;
				return;
			}

			if (response.ok) {
				window.location.href = '/login';
				return;
			}

			console.error('Gagal logout', response.status, await response.text().catch(() => ''));
			toast({ message: 'Gagal keluar. Coba lagi.', type: 'error' });
		} catch (error) {
			console.error('Gagal logout', error);
			toast({ message: 'Gagal keluar. Coba lagi.', type: 'error' });
		} finally {
			loggingOut = false;
		}
	}
</script>

<svelte:head>
	<link rel="manifest" href="/manifest.webmanifest" />
	<meta name="theme-color" content="#4f46e5" />
	<script>
		(function () {
			try {
				var stored = localStorage.getItem('dark-mode');
				var theme;
				if (stored === 'dark' || stored === 'light') {
					theme = stored;
				} else if (stored === 'true' || stored === 'false') {
					theme = stored === 'true' ? 'dark' : 'light';
				} else if (stored) {
					try {
						var parsed = JSON.parse(stored);
						theme = parsed ? 'dark' : 'light';
					} catch (err) {
						theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
					}
				} else {
					theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
				}
				document.documentElement.setAttribute('data-theme', theme);
			} catch (e) {
				console.error('failed initialize dark mode:', e);
			}
		})();
	</script>
	<title>{appName}{page.data.meta.title ? ' - ' + page.data.meta.title : ''}</title>
</svelte:head>

{#if isLoginPage}
	{@render children()}
{:else if isPublicGuestPage}
	<div class="bg-base-200 flex min-h-screen flex-col items-center justify-center p-3 sm:p-6">
		{@render children()}
	</div>
{:else}
	<a href="#app-content" class="app-skip-link btn">Langsung ke konten</a>
	<main class="app-shell drawer lg:drawer-open">
		<input id="my-drawer-2" type="checkbox" class="drawer-toggle" />
		<div class="app-workspace drawer-content flex min-w-0 flex-col overflow-x-hidden">
			<Navbar {stopServer} {stoppingServer} {logout} {loggingOut} />

			<div
				class="app-page-surface bg-base-300 dark:bg-base-200 dark:border-base-200 border-base-300 flex min-h-0 min-w-0 flex-1 flex-col border lg:mr-2 lg:mb-2 lg:rounded-xl"
			>
				<div
					id="app-content"
					tabindex="-1"
					class="app-page-viewport min-h-0 flex-1 overflow-y-auto"
				>
					<div class="app-page-padding flex min-w-0 flex-row">
						<div
							class="app-page-container mx-auto w-full min-w-0 flex-1"
							class:app-page-fluid={isFluidWorkspace}
						>
							<ScrollToTop />
							<div class={disableInteraction ? 'is-readonly' : ''}>
								{@render children()}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
		<div class="drawer-side z-60 lg:z-40">
			<label for="my-drawer-2" aria-label="Tutup menu" class="drawer-overlay"></label>
			<aside
				class="app-sidebar bg-base-100 text-base-content flex flex-col"
				aria-label="Menu utama"
			>
				<div class="app-sidebar-brand flex shrink-0 items-center gap-2">
					{#if data.meta?.logoUrl}
						<img class="h-8 rounded" src={data.meta.logoUrl} alt="Brand logo" />
					{/if}
					<a
						href="/"
						class="min-w-0 flex-1 text-xl font-bold"
						aria-current={page.url.pathname === '/' ? 'page' : undefined}>Dashboard</a
					>
					<button
						type="button"
						class="btn btn-ghost btn-square btn-sm lg:hidden"
						aria-label="Tutup menu"
						title="Tutup menu"
						onclick={() => {
							const drawer = document.getElementById('my-drawer-2') as HTMLInputElement | null;
							if (drawer) drawer.checked = false;
						}}><Icon name="close" /></button
					>
				</div>

				<Menu />

				<nav
					class="app-sidebar-footer mt-3 shrink-0 border-t border-base-300 pt-2"
					aria-label="Pengaturan aplikasi"
				>
					<ul class="menu w-full p-0">
						<li>
							<a
								href="/pengaturan"
								aria-current={page.url.pathname.startsWith('/pengaturan') ? 'page' : undefined}
							>
								<Icon name="gear" />
								<span>Pengaturan</span>
							</a>
						</li>
						<li>
							<a
								href="/tentang"
								aria-current={page.url.pathname === '/tentang' ? 'page' : undefined}
							>
								<Icon name="info" />
								<span>Tentang Aplikasi</span>
							</a>
						</li>
					</ul>
				</nav>
			</aside>
		</div>
	</main>
	{#if data.user}<MobileDock />{/if}
{/if}

<Toast />
<GlobalModal />
<NavIndicator />

<style>
	@media screen and (max-width: 767px) {
		:global(.app-workspace) { padding-bottom: calc(4rem + env(safe-area-inset-bottom, 0px)); }
		:global(.app-shell .fab) { bottom: calc(5rem + env(safe-area-inset-bottom, 0px)); }
	}
	:global(
		.is-readonly :is(button, input, select, textarea, a, [role='button']):not(.pointer-events-auto)
	) {
		opacity: var(--btn-disabled-opacity, 0.5) !important;
		cursor: not-allowed !important;
		pointer-events: none !important;
	}
</style>
