<script lang="ts">
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { showModal } from '$lib/components/global-modal.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import Icon from '$lib/components/icon.svelte';
	import UsersHeader from '$lib/components/pengguna/UsersHeader.svelte';
	import AddUserModal from '$lib/components/pengguna/AddUserModal.svelte';
	import ExistingUserRow from '$lib/components/pengguna/ExistingUserRow.svelte';

	let { data } = $props();
	type UserItem = (typeof data.users)[number];
	type EditableUser = UserItem & {
		type: 'user' | 'wali_kelas' | 'wali_asuh' | 'wali_asrama';
	};
	type ActionBody = { message?: string; deleted?: number[] };

	let selectedIds = $state<number[]>([]);
	let showUserModal = $state(false);
	let editingUser = $state<EditableUser | null>(null);
	const users = $derived(data.users ?? []);
	const filters = $derived(data.filters ?? { q: '', role: 'all', status: 'all' });
	const pagination = $derived(
		data.pagination ?? { currentPage: 1, totalPages: 1, totalItems: 0, pageSize: 25 }
	);

	function toggleSelect(id: number) {
		selectedIds = selectedIds.includes(id)
			? selectedIds.filter((item) => item !== id)
			: [...selectedIds, id];
	}

	function toggleSelectAll() {
		const ids = users.map((user) => Number(user.id));
		selectedIds = ids.length > 0 && ids.every((id) => selectedIds.includes(id)) ? [] : ids;
	}

	function openCreate() {
		editingUser = null;
		showUserModal = true;
	}

	function openEdit(user: UserItem) {
		if (user.type === 'wali_murid') {
			window.location.href = '/portal-wali/pengaturan';
			return;
		}
		editingUser = user as EditableUser;
		showUserModal = true;
	}

	function openDeleteModal(ids: number[]) {
		const scopedIds = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
		if (!scopedIds.length) return;
		showModal({
			title: 'Hapus pengguna',
			body: `Yakin ingin menghapus ${scopedIds.length} akun? Data Pegawai dan Data Kelas tetap tersimpan. Akun yang masih memiliki Jurnal Mengajar akan ditolak.`,
			onPositive: {
				label: 'Hapus',
				icon: 'del',
				class: 'btn-error',
				action: async ({ close }: { close: () => void }) => {
					const form = new FormData();
					form.set('ids', scopedIds.join(','));
					const response = await fetch('?/delete_users', { method: 'POST', body: form });
					const result = deserialize(await response.text());
					const body = ('data' in result ? (result.data ?? {}) : {}) as ActionBody;
					if (result.type !== 'success') {
						toast({ message: String(body.message ?? 'Gagal menghapus akun'), type: 'error' });
						return;
					}
					selectedIds = [];
					close();
					await invalidateAll();
					toast({
						message: `${body.deleted?.length ?? scopedIds.length} akun berhasil dihapus`,
						type: 'success'
					});
				}
			},
			onNegative: { label: 'Batal', icon: 'close' },
			dismissible: true
		});
	}

	function pageHref(page: number) {
		const params = new URLSearchParams();
		if (filters.q) params.set('q', filters.q);
		if (filters.role !== 'all') params.set('role', filters.role);
		if (filters.status !== 'all') params.set('status', filters.status);
		if (page > 1) params.set('page', String(page));
		const query = params.toString();
		return query ? `/pengguna?${query}` : '/pengguna';
	}
</script>

<section class="card bg-base-100 rounded-lg border-none p-4 shadow-md sm:p-6">
	<div class="space-y-4">
		<header class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<h1 class="text-2xl font-bold">Daftar Pengguna</h1>
				<p class="text-base-content/65 text-sm">{pagination.totalItems} akun pada sekolah aktif</p>
			</div>
			<UsersHeader {selectedIds} onDelete={() => openDeleteModal(selectedIds)} onAdd={openCreate} />
		</header>

		<form method="GET" class="grid gap-2 sm:grid-cols-[minmax(14rem,1fr)_12rem_11rem_auto_auto]">
			<label class="input bg-base-200 w-full">
				<Icon name="search" />
				<input name="q" value={filters.q} placeholder="Cari nama atau nama pengguna" />
			</label>
			<select class="select bg-base-200 w-full" name="role" value={filters.role}>
				<option value="all">Semua role</option>
				<option value="user">Guru Mapel</option>
				<option value="wali_kelas">Wali Kelas Lama</option>
				<option value="wali_asuh">Wali Asuh</option>
				<option value="wali_asrama">Wali Asrama</option>
				<option value="wali_murid">Wali Murid</option>
			</select>
			<select class="select bg-base-200 w-full" name="status" value={filters.status}>
				<option value="all">Semua status</option>
				<option value="online">Online</option>
				<option value="offline">Offline</option>
			</select>
			<button class="btn btn-primary" type="submit"><Icon name="search" /> Terapkan</button>
			<a class="btn btn-soft" href="/pengguna" title="Hapus filter"><Icon name="repeat" /></a>
		</form>

		<div class="overflow-x-auto">
			<table class="table">
				<thead>
					<tr>
						<th>
							<input
								type="checkbox"
								class="checkbox checkbox-sm"
								aria-label="Pilih semua pengguna"
								checked={users.length > 0 &&
									users.every((user) => selectedIds.includes(Number(user.id)))}
								onclick={toggleSelectAll}
							/>
						</th>
						<th>Nama</th>
						<th>Role</th>
						<th>Nama Pengguna</th>
						<th>Status</th>
						<th>Kata Sandi</th>
						<th>Aksi</th>
					</tr>
				</thead>
				<tbody>
					{#each users as user (user.id)}
						<tr>
							<td>
								<input
									type="checkbox"
									class="checkbox checkbox-sm"
									aria-label={`Pilih ${user.username}`}
									checked={selectedIds.includes(Number(user.id))}
									onclick={() => toggleSelect(Number(user.id))}
								/>
							</td>
							<ExistingUserRow
								u={user}
								onEdit={openEdit}
								onOpenUser={(selected: UserItem) =>
									(window.location.href = `/pengguna/${selected.id}`)}
								onDelete={(selected: UserItem) => openDeleteModal([Number(selected.id)])}
							/>
						</tr>
					{:else}
						<tr
							><td colspan="7" class="py-10 text-center text-base-content/60"
								>Tidak ada pengguna yang sesuai.</td
							></tr
						>
					{/each}
				</tbody>
			</table>
		</div>

		{#if pagination.totalPages > 1}
			<footer
				class="flex flex-col gap-2 border-t border-base-300 pt-4 sm:flex-row sm:items-center sm:justify-between"
			>
				<p class="text-sm text-base-content/65">
					Halaman {pagination.currentPage} dari {pagination.totalPages}
				</p>
				<div class="join">
					<a
						class:btn-disabled={pagination.currentPage <= 1}
						class="btn btn-sm join-item"
						href={pageHref(pagination.currentPage - 1)}
						aria-label="Halaman sebelumnya"><Icon name="left" /></a
					>
					<a
						class:btn-disabled={pagination.currentPage >= pagination.totalPages}
						class="btn btn-sm join-item"
						href={pageHref(pagination.currentPage + 1)}
						aria-label="Halaman berikutnya"><Icon name="right" /></a
					>
				</div>
			</footer>
		{/if}
	</div>
</section>

<AddUserModal
	bind:open={showUserModal}
	editUser={editingUser}
	on:saved={async () => {
		editingUser = null;
		selectedIds = [];
		await invalidateAll();
	}}
	on:cancel={() => (editingUser = null)}
/>
