<script lang="ts">
	import { deserialize } from '$app/forms';
	import { showModal } from '$lib/components/global-modal.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import UsersHeader from '$lib/components/pengguna/UsersHeader.svelte';
	import AddUserModal from '$lib/components/pengguna/AddUserModal.svelte';
	import ExistingUserRow from '$lib/components/pengguna/ExistingUserRow.svelte';

	let { data } = $props();

	// derive user item type from incoming load data to keep typings simple
	type UserItem = typeof data.users extends Array<infer U> ? U : unknown;

	// local reactive users copy so UI updates instantly without full reload
	// extend with local-only fields used for inline add
	interface LocalUser extends UserItem {
		isNew?: boolean;
		nama?: string;
		mataPelajaranId?: number | null;
	}
	type ActionBody = {
		message?: string;
		deleted?: number[];
		username?: string;
		displayName?: string;
		user?: {
			id?: number;
			username?: string;
			createdAt?: string;
			type?: LocalUser['type'];
			pegawaiId?: number | null;
			passwordUpdatedAt?: string | null;
		};
	};
	let users = $state<LocalUser[]>(data.users ?? []);

	// (use global `ModalAction` from `src/lib/components/types.d.ts`)

	// next temporary id for new rows (negative numbers)
	let showAddModal = $state<boolean>(false);

	// selected ids for bulk actions
	let selectedIds = $state<number[]>([]);

	function toggleSelect(id: number) {
		const idx = selectedIds.indexOf(id);
		if (idx === -1) selectedIds = [...selectedIds, id];
		else selectedIds = selectedIds.filter((x) => x !== id);
	}

	async function handleDelete() {
		// reuse the shared delete modal logic for the currently selected ids
		openDeleteModalForIds(selectedIds);
	}
	// open delete modal for given ids (reused by bulk and single-user delete)
	function openDeleteModalForIds(ids: number[]) {
		showModal({
			title: 'Hapus pengguna',
			body: `Yakin ingin menghapus ${ids.length} akun? Data Pegawai dan Data Kelas tetap tersimpan.`,
			onPositive: {
				label: 'Hapus',
				icon: 'del',
				action: async ({ close }: { close: () => void }) => {
					const idsToDelete = ids.filter((id) => Number.isInteger(id) && id > 0);
					if (!idsToDelete.length) return;
					const form = new FormData();
					form.set('ids', idsToDelete.join(','));
					const response = await fetch('?/delete_users', { method: 'POST', body: form });
					const result = deserialize(await response.text());
					const body = (result.data ?? {}) as ActionBody;
					if (result.type !== 'success') {
						toast({ message: String(body.message ?? 'Gagal menghapus akun'), type: 'error' });
						return;
					}
					const deletedIds = body.deleted ?? idsToDelete;
					users = users.filter((user) => !deletedIds.includes(Number(user.id)));
					selectedIds = selectedIds.filter((id) => !deletedIds.includes(id));
					toast({ message: `${deletedIds.length} akun berhasil dihapus`, type: 'success' });
					close();
				}
			},
			onNegative: { label: 'Batal', icon: 'close' },
			dismissible: true
		});
	}
	function getSelectableIds() {
		// only real existing users (positive ids) are selectable for bulk actions
		return users.map((u) => Number(u.id)).filter((n) => Number.isFinite(n) && n > 0);
	}

	function toggleSelectAll() {
		const selectable = getSelectableIds();
		if (selectable.length === 0) {
			selectedIds = [];
			return;
		}
		const allSelected = selectable.every((id) => selectedIds.indexOf(id) !== -1);
		if (allSelected) selectedIds = [];
		else selectedIds = [...selectable];
	}

	let editingId = $state<number | null>(null);
	let editValues = $state<Record<number, { username: string; password: string }>>({});

	// handle add/new row
	function handleAdd() {
		showAddModal = true;
	}
</script>

<section class="card bg-base-100 rounded-lg border border-none p-6 shadow-md">
	<div class="space-y-4">
		<header class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div class="space-y-2">
				<h1 class="text-2xl font-bold">Daftar pengguna</h1>
			</div>
			<UsersHeader {selectedIds} {editingId} onDelete={handleDelete} onAdd={handleAdd} />
		</header>
		<div class="overflow-x-auto">
			<table class="table">
				<thead>
					<tr>
						{#if !editingId}
							<th>
								<input
									type="checkbox"
									class="checkbox"
									checked={getSelectableIds().length > 0 &&
										getSelectableIds().every((id) => selectedIds.indexOf(id) !== -1)}
									onclick={() => toggleSelectAll()}
								/>
							</th>
						{/if}
						<th>Nama</th>
						<th>Role</th>
						<th>Username</th>
						<th>Status</th>
						<th>Password</th>
						<td>Aksi</td>
					</tr>
				</thead>
				<tbody>
					{#each users as u (u.id)}
						<tr>
							{#if !editingId}
								<td>
									<input
										type="checkbox"
										class="checkbox"
										checked={selectedIds.indexOf(u.id) !== -1}
										onclick={() => toggleSelect(u.id)}
									/>
								</td>
							{/if}

							<ExistingUserRow
								{u}
								{editingId}
								{editValues}
								onToggleEdit={(user: LocalUser) => {
									if (editingId === user.id) {
										editingId = null;
									} else {
										editingId = user.id;
										editValues[user.id] = { username: user.username ?? '', password: '' };
									}
								}}
								onSaveEdit={async (user: LocalUser) => {
									const form = new FormData();
									form.set('id', String(user.id));
									form.set('username', editValues[user.id].username);
									form.set('password', editValues[user.id].password);
									const response = await fetch('?/update_credentials', {
										method: 'POST',
										body: form
									});
									const result = deserialize(await response.text());
									const body = (result.data ?? {}) as ActionBody;
									if (result.type !== 'success') {
										toast({ message: String(body.message ?? 'Gagal menyimpan'), type: 'error' });
										return;
									}

									const updated = body.user;
									const index = users.findIndex((item) => item.id === user.id);
									if (index !== -1) {
										users[index] = {
											...users[index],
											username: updated?.username ?? editValues[user.id].username,
											passwordUpdatedAt:
												updated?.passwordUpdatedAt ?? users[index].passwordUpdatedAt
										};
										users = [...users];
									}
									editingId = null;
									toast({ message: 'Perubahan tersimpan', type: 'success' });
								}}
								onOpenUser={(user: LocalUser) => {
									window.location.href = '/pengguna/' + user.id;
								}}
								onDelete={(user: LocalUser) => openDeleteModalForIds([Number(user.id)])}
							/>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<AddUserModal
			bind:open={showAddModal}
			on:saved={(e: CustomEvent) => {
				const body = e.detail?.body ?? {};
				const serverUser = body.user ?? null;
				const newUser = {
					id: serverUser?.id ?? Date.now(),
					username: serverUser?.username ?? body.username ?? 'user',
					createdAt: serverUser?.createdAt ?? new Date().toISOString(),
					type: serverUser?.type ?? 'user',
					pegawaiName: body.displayName || serverUser?.username || (body.username ?? 'user'),
					pegawaiId: serverUser?.pegawaiId ?? null,
					kelasId: null,
					kelasName: null,
					passwordUpdatedAt: serverUser?.passwordUpdatedAt ?? new Date().toISOString(),
					isOnline: false,
					activeSessionCount: 0,
					lastSeenAt: null,
					// determine isNew based on whether server actually returned a real id
					isNew: false
				} as LocalUser;
				users = [newUser, ...users];
			}}
		/>
	</div>
</section>
