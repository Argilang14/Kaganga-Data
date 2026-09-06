<script lang="ts">
	import { browser } from '$app/environment';
	import Icon from '$lib/components/icon.svelte';
	import UpdateModal from './update-modal.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import { onMount } from 'svelte';
	let { currentVersion, addresses, protocol, canUpdate, canManageUsers, profileHref } = $props<{
		currentVersion: string; addresses: string[]; protocol: string; canUpdate: boolean; canManageUsers: boolean; profileHref: string | null;
	}>();
	let address = $state(addresses[0] ?? '');
	let copying = $state(false);
	let updateOpen = $state(false);
	onMount(() => { if (!address && browser) address = window.location.host; });
	async function copyAddress() {
		if (!browser || !address) return;
		try { copying = true; await navigator.clipboard.writeText(`${protocol}//${address}`); toast('Alamat aplikasi berhasil disalin.', 'success'); }
		catch { toast('Alamat tidak dapat disalin.', 'error'); } finally { copying = false; }
	}
</script>
<section class="bg-base-100 rounded-lg p-5 shadow-md">
	<header class="mb-4"><h1 class="text-2xl font-bold">Pengaturan Kaganga</h1><p class="text-base-content/65 text-sm">Versi terpasang v{currentVersion}</p></header>
	<fieldset class="fieldset"><legend class="fieldset-legend">Alamat aplikasi</legend>
		<div class="join w-full"><select class="select join-item bg-base-200 min-w-0 flex-1" bind:value={address}>{#each addresses as item}<option value={item}>{item}</option>{/each}</select>
		<button class="btn btn-info btn-soft join-item" type="button" onclick={copyAddress} disabled={!address || copying}><Icon name="copy" />{copying ? 'Menyalin...' : 'Salin'}</button></div>
	</fieldset>
	<div class="mt-4 flex flex-wrap gap-2">
		{#if canUpdate}<button class="btn btn-secondary btn-soft" type="button" onclick={() => updateOpen = true}><Icon name="download" />Cek Update</button>{/if}
		{#if canManageUsers}<a class="btn btn-info btn-soft" href="/pengguna"><Icon name="users" />Manajemen Pengguna</a>{/if}
		{#if profileHref}<a class="btn btn-success btn-soft" href={profileHref}><Icon name="user" />Profil Pegawai</a>{/if}
	</div>
	<UpdateModal open={updateOpen} {currentVersion} on:close={() => updateOpen = false} />
</section>