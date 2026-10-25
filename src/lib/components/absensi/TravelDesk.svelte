<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import Icon from '$lib/components/icon.svelte';
	import type { PageData } from '../../../routes/(administrasi)/administrasi/absensi/konfirmasi-pulang/$types';

	let { data }: { data: PageData } = $props();
	let online = $state(true);
	let refreshing = $state(false);
	let refreshError = $state('');
	const tabs = [
		{ key: 'keluar', label: 'Konfirmasi keluar', icon: 'right' },
		{ key: 'pulang', label: 'Sedang pulang', icon: 'users' },
		{ key: 'riwayat', label: 'Riwayat', icon: 'calendar' }
	] satisfies { key: string; label: string; icon: IconName }[];
	const summaries = $derived([
		{
			label: 'Belum diverifikasi',
			value: data.summary.pending,
			icon: 'calendar',
			color: 'border-warning/30 bg-warning/10',
			active: data.tab === 'keluar' && !data.lateOnly,
			tab: 'keluar',
			late: ''
		},
		{
			label: 'Sedang pulang',
			value: data.summary.away,
			icon: 'users',
			color: 'border-info/30 bg-info/10',
			active: data.tab === 'pulang' && !data.lateOnly,
			tab: 'pulang',
			late: ''
		},
		{
			label: 'Terlambat kembali',
			value: data.summary.late,
			icon: 'warning',
			color: 'border-error/30 bg-error/10',
			active: data.lateOnly,
			tab: '',
			late: '1'
		}
	] satisfies {
		label: string;
		value: number;
		icon: IconName;
		color: string;
		active: boolean;
		tab: string;
		late: string;
	}[]);
	function href(changes: Record<string, string>) {
		const params = new URLSearchParams(page.url.searchParams);
		for (const [key, value] of Object.entries(changes)) {
			if (value) params.set(key, value);
			else params.delete(key);
		}
		return `/administrasi/absensi/konfirmasi-pulang?${params}` as const;
	}
	function dateLabel(value: string | null) {
		return value
			? new Date(`${value}T00:00:00+07:00`).toLocaleDateString('id-ID', {
					timeZone: 'Asia/Jakarta',
					day: 'numeric',
					month: 'short',
					year: 'numeric'
				})
			: '-';
	}
	function timestamp(value: string | null) {
		return value
			? new Date(value).toLocaleString('id-ID', {
					timeZone: 'Asia/Jakarta',
					dateStyle: 'short',
					timeStyle: 'short'
				}) + ' WIB'
			: 'Belum diverifikasi keamanan';
	}
	async function refresh() {
		if (refreshing || !navigator.onLine) return;
		refreshing = true;
		refreshError = '';
		try {
			await invalidateAll();
		} catch {
			refreshError = 'Daftar belum diperbarui. Periksa koneksi lalu muat ulang.';
		} finally {
			refreshing = false;
		}
	}
	onMount(() => {
		online = navigator.onLine;
		const connected = () => {
			online = true;
			void refresh();
		};
		const disconnected = () => {
			online = false;
		};
		const focused = () => {
			if (!document.hidden) void refresh();
		};
		window.addEventListener('online', connected);
		window.addEventListener('offline', disconnected);
		document.addEventListener('visibilitychange', focused);
		const interval = setInterval(() => {
			if (!document.hidden) void refresh();
		}, 30000);
		return () => {
			clearInterval(interval);
			window.removeEventListener('online', connected);
			window.removeEventListener('offline', disconnected);
			document.removeEventListener('visibilitychange', focused);
		};
	});
</script>

<div class="mx-auto w-full max-w-7xl space-y-5 p-3 sm:p-5" data-testid="travel-desk">
	<header class="flex flex-wrap items-center justify-between gap-4 border-b border-base-300 pb-5">
		<div class="flex min-w-0 items-center gap-3">
			<span
				class="hidden size-11 shrink-0 items-center justify-center rounded-lg bg-info/10 text-info sm:flex"
				><Icon name="check-square" class="size-6" /></span
			>
			<div>
				<h1 class="text-xl font-bold">Konfirmasi Pulang</h1>
				<p class="text-base-content/65 mt-1 text-sm">Pemeriksaan keluar dan kembali murid</p>
			</div>
		</div>
		<div class="flex w-full gap-2 sm:w-auto">
			<button
				class="btn btn-square"
				type="button"
				onclick={refresh}
				disabled={refreshing || !online}
				aria-label="Perbarui daftar izin"
				title="Perbarui daftar izin"
				><Icon name="repeat" class={refreshing ? 'animate-spin' : ''} /></button
			>
			<a
				class="btn btn-primary flex-1 sm:flex-none"
				href={resolve('/administrasi/absensi/scan?mode=pulang')}><Icon name="grid" />Scan QR</a
			>
		</div>
	</header>
	{#if !online}<div class="alert alert-soft alert-error" role="alert">
			<Icon name="warning" /><span
				>Koneksi terputus. Daftar mungkin belum terbaru; konfirmasi keluar dan kembali wajib
				terhubung ke server.</span
			>
		</div>{/if}
	{#if refreshError}<div class="alert alert-soft alert-error" role="alert">{refreshError}</div>{/if}
	<div class="grid grid-cols-3 gap-2 sm:gap-3" aria-label="Ringkasan izin sekolah">
		{#each summaries as summary (summary.label)}
			<a
				href={resolve(href({ tab: summary.tab, page: '', terlambat: summary.late }))}
				class={`min-w-0 rounded-lg border p-3 transition-shadow hover:shadow-sm sm:p-4 ${summary.color}`}
				aria-current={summary.active ? 'true' : undefined}
			>
				<div class="flex items-start justify-between gap-2">
					<strong class="text-2xl leading-none tabular-nums sm:text-3xl">{summary.value}</strong>
					<Icon name={summary.icon} class="hidden size-5 shrink-0 opacity-65 sm:block" />
				</div>
				<span class="mt-2 block text-xs leading-relaxed sm:text-sm">{summary.label}</span>
			</a>
		{/each}
	</div>
	<form
		method="GET"
		class="-mx-3 grid grid-cols-2 items-end gap-3 border-y border-base-300 bg-base-100 px-3 py-4 sm:mx-0 sm:px-4 lg:flex"
	>
		<input type="hidden" name="tab" value={data.tab} />
		<label class="col-span-2 grid min-w-0 gap-2 text-sm lg:flex-1"
			><span class="font-medium">Cari izin</span><span class="input w-full"
				><Icon name="search" class="size-4 opacity-55" /><input
					class="min-w-0 grow"
					type="search"
					name="q"
					value={data.q}
					maxlength="100"
					placeholder="Nama, kelas, atau nomor izin"
				/></span
			></label
		>
		<label class="flex min-h-11 cursor-pointer items-center gap-2 text-sm lg:px-2"
			><input
				type="checkbox"
				class="checkbox checkbox-sm"
				name="terlambat"
				value="1"
				checked={data.lateOnly}
			/>Terlambat kembali</label
		>
		<button class="btn justify-self-end" type="submit"
			><Icon name="search" class="size-4" />Tampilkan</button
		>
		{#if data.q || data.lateOnly}<a
				class="link col-span-2 justify-self-start text-sm lg:flex lg:min-h-10 lg:items-center lg:self-end"
				href={resolve(href({ q: '', terlambat: '', page: '' }))}>Reset filter</a
			>{/if}
	</form>
	<nav class="tabs tabs-border grid grid-cols-3" aria-label="Daftar izin pulang">
		{#each tabs as tab (tab.key)}<a
				class:tab-active={data.tab === tab.key}
				class="tab h-auto min-h-12 min-w-0 gap-2 px-1 py-2 text-center text-xs whitespace-normal sm:px-3 sm:text-sm"
				aria-current={data.tab === tab.key ? 'page' : undefined}
				href={resolve(
					href({ tab: tab.key, page: '', ...(tab.key === 'riwayat' ? { terlambat: '' } : {}) })
				)}><Icon name={tab.icon} class="hidden size-4 shrink-0 sm:block" />{tab.label}</a
			>{/each}
	</nav>
	<div class="flex flex-wrap items-center justify-between gap-2 text-xs text-base-content/65">
		<span
			><strong class="text-sm text-base-content tabular-nums">{data.total}</strong> izin ditemukan</span
		><span class="flex items-center gap-1.5"
			><Icon name={online ? 'check' : 'warning'} class="size-3.5" />Diperbarui {timestamp(
				data.refreshedAt
			)}</span
		>
	</div>
	{#if !data.rows.length}
		<div
			class="flex min-h-48 flex-col items-center justify-center gap-3 border-y border-base-300 py-8 text-center"
		>
			<span class="flex size-12 items-center justify-center rounded-full bg-base-200"
				><Icon name={data.q || data.lateOnly ? 'search' : 'check'} class="size-6" /></span
			>
			<p class="font-medium">
				{data.q || data.lateOnly
					? 'Tidak ada izin yang sesuai filter.'
					: 'Belum ada izin pada daftar ini.'}
			</p>
			{#if data.q || data.lateOnly}<a
					class="btn btn-sm"
					href={resolve(href({ q: '', terlambat: '', page: '' }))}>Reset filter</a
				>{/if}
		</div>
	{:else}
		<div class="hidden overflow-x-auto border-y border-base-300 bg-base-100 xl:block">
			<table
				class="table w-full table-fixed text-sm [&_td]:px-4 [&_td]:py-4 [&_td]:align-top [&_th]:px-4 [&_th]:py-3"
			>
				<caption class="sr-only"
					>Daftar izin pulang murid beserta penjemput dan waktu perjalanan</caption
				>
				<thead class="bg-base-200"
					><tr
						><th scope="col" class="w-[24%]">Murid & izin</th><th scope="col" class="w-[19%]"
							>Penjemput</th
						><th scope="col" class="w-[25%]">Jadwal & perjalanan</th><th scope="col" class="w-[17%]"
							>Status</th
						><th scope="col" class="w-[15%]">Aksi</th></tr
					></thead
				>
				<tbody
					>{#each data.rows as row (row.id)}<tr class="align-top hover:bg-base-200/35"
							><td
								><strong class="block wrap-anywhere">{row.nama}</strong><span
									class="mt-2 inline-block rounded bg-base-200 px-2 py-0.5 text-xs"
									>{row.kelas}</span
								><span class="mt-2 block text-xs text-base-content/60 wrap-anywhere"
									>{row.nomor || `Izin #${row.id}`}</span
								></td
							><td class="wrap-anywhere"
								><span class="font-medium">{row.penjemputNama || 'Belum dilengkapi'}</span><span
									class="text-base-content/65 mt-1 block text-xs"
									>{row.penjemputHubungan || 'Hubungan belum dilengkapi'}</span
								></td
							><td>{@render journey(row)}</td><td>{@render status(row)}</td><td
								>{@render action(row)}</td
							></tr
						>{/each}</tbody
				>
			</table>
		</div>
		<ul class="grid gap-3 sm:grid-cols-2 xl:hidden">
			{#each data.rows as row (row.id)}<li
					class="flex min-w-0 flex-col gap-4 rounded-lg border border-base-300 bg-base-100 p-4 shadow-sm"
				>
					<div class="flex items-start justify-between gap-2">
						<div class="min-w-0">
							<strong class="block wrap-anywhere">{row.nama}</strong><span
								class="mt-1 block text-xs text-base-content/65 wrap-anywhere"
								>{row.kelas} · {row.nomor || `Izin #${row.id}`}</span
							>
						</div>
					</div>
					{@render status(row)}
					<div class="border-t border-base-200 pt-3 text-sm">
						<span class="mb-1 flex items-center gap-1.5 text-xs text-base-content/65"
							><Icon name="user" class="size-3.5" />Penjemput</span
						><strong class="wrap-anywhere">{row.penjemputNama || 'Belum dilengkapi'}</strong><span
							class="block text-base-content/65"
							>{row.penjemputHubungan || 'Hubungan belum dilengkapi'}</span
						>
					</div>
					{@render journey(row)}
					<div class="mt-auto border-t border-base-200 pt-3">{@render action(row)}</div>
				</li>{/each}
		</ul>
	{/if}
	{#if data.pages > 1}<nav
			class="flex items-center justify-between gap-3 border-t border-base-300 pt-4"
			aria-label="Halaman izin"
		>
			<a
				class="btn btn-square"
				aria-label="Halaman sebelumnya"
				aria-disabled={data.page === 1}
				href={data.page > 1 ? resolve(href({ page: String(data.page - 1) })) : undefined}
				><Icon name="left" /></a
			><span class="text-sm">Halaman {data.page} dari {data.pages}</span><a
				class="btn btn-square"
				aria-label="Halaman berikutnya"
				aria-disabled={data.page === data.pages}
				href={data.page < data.pages ? resolve(href({ page: String(data.page + 1) })) : undefined}
				><Icon name="right" /></a
			>
		</nav>{/if}
</div>

{#snippet journey(row: PageData['rows'][number])}
	<div class="space-y-3 text-xs leading-relaxed wrap-anywhere">
		<dl class="grid grid-cols-2 gap-3 xl:grid-cols-1">
			<div>
				<dt class="text-base-content/65">Jadwal keluar</dt>
				<dd class="mt-0.5 font-medium">
					{dateLabel(row.tanggalKeluar)}{row.waktuKeluar ? `, ${row.waktuKeluar.slice(0, 5)}` : ''}
				</dd>
			</div>
			<div>
				<dt class="text-base-content/65">Rencana kembali</dt>
				<dd class="mt-0.5 font-medium">
					{dateLabel(row.rencanaKembali)}{row.waktuRencanaKembali
						? `, ${row.waktuRencanaKembali.slice(0, 5)}`
						: ''}
				</dd>
			</div>
		</dl>
		<div class="space-y-2 border-t border-base-200 pt-2 text-base-content/65">
			<div>
				<span class="block font-medium text-base-content">Verifikasi keluar</span>{timestamp(
					row.keluarPada
				)}
				{#if row.keluarPetugas}<span class="block">{row.keluarPetugas}</span>{/if}
			</div>
			{#if row.tanggalKembali}<div>
					<span class="block font-medium text-base-content">Kembali</span>{row.kembaliPada
						? timestamp(row.kembaliPada)
						: `${dateLabel(row.tanggalKembali)} ${row.waktuKembali?.slice(0, 5) ?? ''}`}
					{#if row.kembaliPetugas}<span class="block">{row.kembaliPetugas}</span>{/if}
				</div>{/if}
		</div>
	</div>
{/snippet}
{#snippet status(row: PageData['rows'][number])}
	<div class="flex flex-wrap items-start gap-2 xl:flex-col">
		<span
			class={`badge badge-soft h-auto min-h-7 justify-start gap-1.5 py-1 text-xs leading-relaxed whitespace-normal ${row.status === 'dibatalkan' ? 'badge-neutral' : row.tanggalKembali ? 'badge-success' : row.keluarPada ? 'badge-info' : 'badge-warning'}`}
			><Icon
				name={row.status === 'dibatalkan'
					? 'close-sm'
					: row.tanggalKembali
						? 'check'
						: row.keluarPada
							? 'right'
							: 'calendar'}
				class="size-3.5 shrink-0"
			/>{row.status === 'dibatalkan'
				? 'Dibatalkan'
				: row.tanggalKembali
					? 'Sudah kembali'
					: row.keluarPada
						? 'Sudah keluar'
						: 'Belum diverifikasi'}</span
		>{#if row.late}<span
				class="badge badge-soft badge-error h-auto justify-start gap-1.5 py-1 text-xs leading-relaxed whitespace-normal"
				><Icon name="warning" class="size-3.5 shrink-0" />Terlambat kembali</span
			>{/if}{#if row.pickupIncomplete && !row.tanggalKembali && row.status !== 'dibatalkan'}<span
				class="flex basis-full items-start gap-1.5 text-xs leading-relaxed text-error"
				><Icon name="warning" class="mt-0.5 size-3.5 shrink-0" />Penjemput perlu dilengkapi pemberi
				izin</span
			>{/if}
	</div>
{/snippet}
{#snippet action(row: PageData['rows'][number])}
	{#if row.muridId && !row.tanggalKembali && row.status !== 'dibatalkan'}<div
			class="flex flex-col gap-2"
		>
			<a
				class="btn btn-sm min-h-11 h-auto w-full py-2 whitespace-normal"
				href={resolve(
					`/administrasi/absensi/scan?mode=pulang&kegiatan=${row.keluarPada ? 'kembali_ke_sekolah' : 'pulang_ke_rumah'}&izin=${row.id}`
				)}><Icon name="grid" />{row.keluarPada ? 'Scan Kembali' : 'Scan Keluar'}</a
			>{#if !row.keluarPada}<a
					class="link flex min-h-11 items-center justify-center text-center text-xs"
					href={resolve(
						`/administrasi/absensi/scan?mode=pulang&kegiatan=kembali_ke_sekolah&izin=${row.id}`
					)}>Verifikasi kembali</a
				>{/if}
		</div>{:else}<span class="text-xs text-base-content/50">Riwayat tersimpan</span>{/if}
{/snippet}
