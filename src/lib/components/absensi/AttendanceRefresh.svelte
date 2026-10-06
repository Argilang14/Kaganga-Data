<script lang="ts">
	import { untrack } from 'svelte';
	import Icon from '$lib/components/icon.svelte';
	let {
		context,
		updatedAt,
		onrefresh
	}: {
		context: unknown;
		updatedAt: string;
		onrefresh: (signal: AbortSignal) => Promise<void>;
	} = $props();
	let busy = $state(false);
	let failure = $state('');
	let offline = $state(false);
	let controller: AbortController | null = null;
	const lastUpdate = $derived(
		new Intl.DateTimeFormat('id-ID', {
			timeZone: 'Asia/Jakarta',
			day: '2-digit',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		}).format(new Date(updatedAt))
	);
	async function refresh() {
		if (controller || document.hidden) return;
		offline = !navigator.onLine;
		if (offline) return;
		const request = new AbortController();
		controller = request;
		busy = true;
		const timeout = setTimeout(
			() => request.abort(new Error('Waktu pembaruan habis. Coba lagi.')),
			15000
		);
		try {
			await onrefresh(request.signal);
			if (!request.signal.aborted) failure = '';
		} catch (error) {
			if (controller === request)
				failure = request.signal.aborted
					? 'Pembaruan terhenti. Tampilan masih memakai data sebelumnya.'
					: error instanceof Error
						? error.message
						: 'Data gagal diperbarui.';
		} finally {
			clearTimeout(timeout);
			if (controller === request) {
				controller = null;
				busy = false;
			}
		}
	}
	$effect(() => {
		context;
		untrack(() => {
			failure = '';
			offline = !navigator.onLine;
		});
		const update = () => {
			void refresh();
		};
		const disconnect = () => {
			offline = true;
		};
		const interval = setInterval(update, 60000);
		document.addEventListener('visibilitychange', update);
		window.addEventListener('online', update);
		window.addEventListener('offline', disconnect);
		return () => {
			clearInterval(interval);
			document.removeEventListener('visibilitychange', update);
			window.removeEventListener('online', update);
			window.removeEventListener('offline', disconnect);
			controller?.abort();
			controller = null;
			busy = false;
		};
	});
</script>

<div class="flex flex-wrap items-center gap-2 text-xs text-base-content/60">
	<button
		type="button"
		class="btn btn-sm btn-square"
		disabled={busy || offline}
		onclick={() => void refresh()}
		title="Muat ulang absensi"
		aria-label="Muat ulang absensi"
		aria-busy={busy}
	>
		<Icon name="repeat" class={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
	</button>
	<span>Terakhir diperbarui: <time datetime={updatedAt}>{lastUpdate}</time></span>
	{#if offline || failure}<span class="w-full text-warning" role="status"
			>{offline ? 'Offline. Tampilan memakai data sebelumnya.' : failure}</span
		>{/if}
</div>
