<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	let {
		u,
		editingId,
		editValues,
		onToggleEdit,
		onSaveEdit,
		onOpenUser,
		onDelete = undefined
	} = $props();

	let showPassword = $state(false);

	function formatLastSeen(value: string | null | undefined) {
		if (!value) return 'Belum ada aktivitas';
		const time = new Date(value).getTime();
		if (!Number.isFinite(time)) return 'Belum ada aktivitas';
		const diffMs = Date.now() - time;
		if (diffMs < 60_000) return 'Baru saja';
		const minutes = Math.floor(diffMs / 60_000);
		if (minutes < 60) return `${minutes} menit lalu`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours} jam lalu`;
		const days = Math.floor(hours / 24);
		return `${days} hari lalu`;
	}
</script>

<td>{u.pegawaiName ?? u.username}</td>
<td>
	{#if u.type === 'wali_kelas'}
		<div class="flex flex-col items-start gap-1">
			<span>Wali Kelas {u.kelasName ?? (u.kelasId ? `Kelas ${u.kelasId}` : '-')}</span>
			<span class="badge badge-warning badge-xs" title="Akun lama yang tetap didukung">
				Akun lama
			</span>
		</div>
	{:else if u.type === 'wali_asuh'}
		Wali Asuh {u.kelasName ?? (u.kelasId ? `Kelas ${u.kelasId}` : '-')}
	{:else if u.type === 'wali_asrama'}
		Wali Asrama
	{:else if u.type === 'admin'}
		Admin
	{:else}
		{u.type}
	{/if}
</td>
<td>
	{#if editingId === u.id}
		<input
			class="input input-sm bg-base-200 dark:bg-base-300 w-full dark:border-none"
			bind:value={editValues[u.id].username}
		/>
	{:else}
		{u.username ? u.username : '-'}
	{/if}
</td>
<td>
	<div class="flex flex-col gap-1">
		<div class={`badge ${u.isOnline ? 'badge-success' : 'badge-ghost'} badge-sm gap-1`}>
			<span
				class={`h-2 w-2 rounded-full ${u.isOnline ? 'bg-success-content' : 'bg-base-content/40'}`}
			></span>
			{u.isOnline ? 'Online' : 'Offline'}
		</div>
		<div class="text-base-content/60 text-xs">
			{formatLastSeen(u.lastSeenAt)}
			{#if u.activeSessionCount > 1}
				· {u.activeSessionCount} sesi
			{/if}
		</div>
	</div>
</td>
<td>
	{#if editingId === u.id}
		<label class="input input-sm bg-base-200 dark:bg-base-300 w-full dark:border-none">
			<input
				type={showPassword ? 'text' : 'password'}
				placeholder="Buat Password"
				bind:value={editValues[u.id].password}
			/>
			<button
				type="button"
				class="cursor-pointer"
				onclick={() => (showPassword = !showPassword)}
				aria-label="Toggle password visibility"
			>
				<Icon name={showPassword ? 'eye-off' : 'eye'} />
			</button>
		</label>
	{:else}
		{u.passwordUpdatedAt ? '*****' : '-'}
	{/if}
</td>
<td>
	<div class="flex flex-row">
		{#if editingId === null}
			<button
				type="button"
				class="btn btn-sm btn-error btn-soft rounded-r-none shadow-none"
				title="Hapus pengguna"
				onclick={() => onDelete?.(u)}
			>
				<Icon name="del" />
			</button>
		{/if}
		<button
			class={'btn btn-sm btn-soft ' +
				(editingId === u.id || (editingId !== null && editingId !== u.id)
					? 'rounded-r-none'
					: 'rounded-none') +
				' shadow-none'}
			title={editingId === u.id ? 'Batal' : 'Ubah username dan password'}
			onclick={() => onToggleEdit?.(u)}
			disabled={editingId !== null && editingId !== u.id}
		>
			{#if editingId === u.id}
				<Icon name="close" />
			{:else}
				<Icon name="edit" />
			{/if}
		</button>

		{#if editingId === u.id}
			<button
				class="btn btn-primary btn-sm btn-soft rounded-l-none shadow-none"
				title="Simpan perubahan"
				onclick={() => onSaveEdit?.(u)}
			>
				<Icon name="save" />
			</button>
		{:else}
			<button
				class="btn btn-primary btn-sm btn-soft rounded-l-none shadow-none"
				title={editingId !== u.id ? 'Disabled while mengubah pengguna lain' : 'Atur hak akses'}
				type="button"
				onclick={(e) => {
					e.preventDefault();
					if (!(editingId !== null && editingId !== u.id) && !u.isNew) onOpenUser?.(u);
				}}
				disabled={(editingId !== null && editingId !== u.id) || u.isNew}
			>
				<Icon name="key" />
			</button>
		{/if}
	</div>
</td>
