<script lang="ts">
	import { page } from '$app/state';
	import AppInfoCard from '$lib/components/settings/app-info-card.svelte';
	import AccountCards from '$lib/components/settings/account-cards.svelte';
	import AiSettingsCard from '$lib/components/settings/ai-settings-card.svelte';
	import DatabaseCard from '$lib/components/settings/database-card.svelte';
	import GuestBookCard from '$lib/components/settings/guest-book-card.svelte';
	import FirstLoginPasswordModal from '$lib/components/settings/first-login-password-modal.svelte';
	import ProfileCard from '$lib/components/settings/profile-card.svelte';
	import StorageCard from '$lib/components/settings/storage-card.svelte';
	import Icon from '$lib/components/icon.svelte';
	import { isAuthorizedUser } from '../pengguna/permissions';
	import type { PageData } from './$types';
	const { data } = $props<{ data: PageData }>();
	const user = $derived(page.data.user);
	const isAdmin = $derived(user?.type === 'admin');
	const canUpdate = $derived(isAuthorizedUser(['app_check_update'], user));
	const canManageUsers = $derived(isAuthorizedUser(['user_list'], user));
</script>

<div class="space-y-5 pb-8">
	{#if data.mustChangePassword}
		<div class="alert alert-warning shadow-sm" role="alert">
			<Icon name="warning" />
			<div>
				<p class="font-semibold">Ganti kata sandi bawaan terlebih dahulu</p>
				<p class="text-sm">Akses menu lain akan dibuka setelah kata sandi akun diperbarui.</p>
			</div>
		</div>
	{/if}

	<AppInfoCard
		currentVersion={data.appVersion ?? '0.0.0'}
		addresses={data.appAddresses ?? []}
		protocol={data.protocol ?? 'http:'}
		{canUpdate}
		{canManageUsers}
		profileHref={data.profile ? `/pegawai/${data.profile.id}` : null}
	/>
	<ProfileCard profile={data.profile ?? null} />
	<AccountCards />

	{#if isAdmin}
		<div class="grid gap-5 xl:grid-cols-2">
			{#if data.guestBook}<GuestBookCard
					publicUrl={data.guestBook.publicUrl}
					passkeySet={data.guestBook.passkeySet}
				/>{/if}
			<DatabaseCard />
		</div>
		<section class="bg-base-100 rounded-lg p-5 shadow-md">
			<h2 class="text-lg font-semibold">Keamanan dan Riwayat Data</h2>
			<p class="text-base-content/65 mt-1 text-sm">
				Tinjau perubahan data penting dan kelola arsip murid tanpa menghapus riwayat akademik.
			</p>
			<div class="mt-4 flex flex-wrap gap-2">
				<a class="btn btn-soft shadow-none" href="/pengaturan/riwayat-aktivitas">
					<Icon name="info" /> Riwayat Aktivitas
				</a>
				<a class="btn btn-soft shadow-none" href="/murid/arsip">
					<Icon name="user" /> Arsip Murid & Alumni
				</a>
				<a class="btn btn-soft shadow-none" href="/pengaturan/operasional">
					<Icon name="database" /> Operasional Sistem
				</a>
			</div>
		</section>
		{#if data.storage}<StorageCard
				dataRoot={data.storage.dataRoot}
				defaultDataRoot={data.storage.defaultDataRoot}
			/>{/if}
		{#if data.schoolAi.visible}<AiSettingsCard
				title="AI Sekolah"
				description="Konfigurasi ini hanya berlaku untuk sekolah aktif dan menjadi bawaan bagi pengguna."
				config={data.schoolAi}
				saveAction="?/save-ai-settings"
				clearAction="?/clear-ai-settings"
			/>{/if}
	{/if}

	<AiSettingsCard
		title="AI Pribadi"
		description="Opsional. Jika diisi, konfigurasi ini dipakai lebih dahulu daripada AI sekolah tanpa memengaruhi pengguna lain."
		config={data.personalAi}
		saveAction="?/save-personal-ai"
		clearAction="?/clear-personal-ai"
	/>
</div>

{#if data.mustChangePassword}
	<FirstLoginPasswordModal />
{/if}
