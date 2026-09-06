<script lang="ts">
	import Icon from '$lib/components/icon.svelte';

	let { u, onEdit, onOpenUser, onDelete = undefined } = $props();

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
		return `${Math.floor(hours / 24)} hari lalu`;
	}

	function roleLabel(type: string) {
		if (type === 'wali_kelas') return 'Wali Kelas';
		if (type === 'wali_asuh') return 'Wali Asuh';
		if (type === 'wali_asrama') return 'Wali Asrama';
		if (type === 'user') return 'Guru Mapel';
		return type.replaceAll('_', ' ');
	}
</script>

<td>
	<div class="font-medium">{u.pegawaiName ?? u.username}</div>
	{#if u.pegawaiNip}<div class="text-base-content/60 text-xs">NIP {u.pegawaiNip}</div>{/if}
</td>
<td>
	<div class="flex flex-col items-start gap-1">
		<span>{roleLabel(u.type)}{u.kelasName ? ` - ${u.kelasName}` : ''}</span>
		{#if u.type === 'wali_kelas'}
			<span class="badge badge-warning badge-xs" title="Role mengikuti penugasan Data Kelas">Akun lama</span>
		{/if}
	</div>
</td>
<td>{u.username || '-'}</td>
<td>
	<div class="flex flex-col gap-1">
		<div class={`badge ${u.isOnline ? 'badge-success' : 'badge-ghost'} badge-sm gap-1`}>
			<span class={`h-2 w-2 rounded-full ${u.isOnline ? 'bg-success-content' : 'bg-base-content/40'}`}></span>
			{u.isOnline ? 'Online' : 'Offline'}
		</div>
		<div class="text-base-content/60 text-xs">
			{formatLastSeen(u.lastSeenAt)}
			{#if u.activeSessionCount > 1} · {u.activeSessionCount} sesi{/if}
		</div>
	</div>
</td>
<td>
	{#if u.mustChangePassword}
		<span class="badge badge-warning badge-sm">Wajib diganti</span>
	{:else}
		<span class="badge badge-success badge-soft badge-sm">Aktif</span>
	{/if}
</td>
<td>
	<div class="join">
		<button class="btn btn-sm btn-soft join-item" type="button" title="Edit pengguna" onclick={() => onEdit?.(u)}>
			<Icon name="edit" />
		</button>
		<button class="btn btn-sm btn-primary btn-soft join-item" type="button" title="Atur hak akses" onclick={() => onOpenUser?.(u)}>
			<Icon name="key" />
		</button>
		<button class="btn btn-sm btn-error btn-soft join-item" type="button" title="Hapus pengguna" onclick={() => onDelete?.(u)}>
			<Icon name="del" />
		</button>
	</div>
</td>
