<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import { showModal } from '$lib/components/global-modal.svelte';
	import Authority from '../authority.svelte';
	import { groupedUserPermissions } from '../permissions';
	import ResetPermissionsBody from './reset-permissions-body.svelte';

	let { data } = $props();
	let user = $derived(data.userDetail);

	function formatRole(type?: string) {
		return (type ?? '')
			.replaceAll('_', ' ')
			.split(' ')
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join(' ');
	}

	function handleSaveSuccess({ data: successData }: { data?: Record<string, unknown> }) {
		if (successData && Array.isArray(successData.permissions)) {
			user = { ...user, permissions: successData.permissions as UserPermission[] };
		}
	}

	function confirmResetPermissions() {
		showModal({
			title: 'Reset Izin ke Default',
			body: ResetPermissionsBody,
			bodyProps: { username: user.username, roleType: formatRole(user.type) },
			onPositive: {
				label: 'Reset',
				icon: 'repeat',
				class: 'btn-warning',
				action: ({ close }) => {
					close();
					(document.getElementById('reset-permissions-form') as HTMLFormElement | null)?.requestSubmit();
				}
			},
			onNegative: { label: 'Batal', icon: 'close' },
			dismissible: true
		});
	}
</script>

<section class="card bg-base-100 rounded-lg border-none p-4 shadow-md sm:p-6">
	<header class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
		<div>
			<h1 class="text-xl font-bold">Izin Pengguna: {user.username}</h1>
			<p class="text-base-content/70 text-sm">Atur hak akses khusus untuk pengguna ini.</p>
		</div>
		<span class="badge badge-soft badge-info sm:ml-auto">{formatRole(user.type)}</span>
	</header>

	<FormEnhance id="set-permissions-form" action="?/set_permissions" onsuccess={handleSaveSuccess}>
		{#snippet children()}
			<div class="overflow-x-auto">
				<table class="table w-full">
					<thead><tr class="bg-base-300"><th class="w-[90%]">Izin</th><th class="text-center">Aktif</th></tr></thead>
					<tbody>
						{#each Object.entries(groupedUserPermissions) as [group, permission] (group)}
							<tr><td colspan="2" class="font-bold">{permission.description}</td></tr>
							{#each permission.values as [name, description] (name)}
								{@const key = `${group}_${name}` as UserPermission}
								{@const isAdmin = user.type === 'admin'}
								<tr>
									<td class="pl-8 text-sm">{description}</td>
									<td class="text-center">
										{#if isAdmin}<input type="hidden" name={key} value="true" />{/if}
										<input type="checkbox" class="toggle toggle-sm toggle-primary" name={key} value="true" checked={isAdmin || user.permissions.includes(key)} disabled={isAdmin} />
									</td>
								</tr>
							{/each}
						{/each}
					</tbody>
				</table>
			</div>
		{/snippet}
	</FormEnhance>

	<FormEnhance id="reset-permissions-form" action="?/reset_permissions" onsuccess={handleSaveSuccess} class="hidden">
		{#snippet children()}<button type="submit">Reset</button>{/snippet}
	</FormEnhance>

	<footer class="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-base-300 pt-4">
		<a href="/pengguna" class="btn btn-soft shadow-none"><Icon name="left" /> Kembali</a>
		<Authority permissions={['user_set_permissions']}>
			<div class="flex flex-wrap justify-end gap-2">
				{#if user.type !== 'admin'}
					<button type="button" class="btn btn-warning btn-soft shadow-none" onclick={confirmResetPermissions}>
						<Icon name="repeat" /> Reset ke Default
					</button>
				{/if}
				<button form="set-permissions-form" type="submit" class="btn btn-primary shadow-none">
					<Icon name="save" /> Simpan
				</button>
			</div>
		</Authority>
	</footer>
</section>
