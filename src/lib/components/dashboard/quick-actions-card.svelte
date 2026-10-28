<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import { showModal } from '$lib/components/global-modal.svelte';
	import ImportDatabaseModal from '$lib/components/modals/import-database-modal.svelte';
	import { toast } from '$lib/components/toast.svelte';

	import { page } from '$app/state';
	import { canDownloadDatabaseBackup } from '$lib/export-access';
	import { canAccessMenu } from '$lib/role-menu-access';
	import { resolve } from '$app/paths';
	let canDownloadBackup = $derived(canDownloadDatabaseBackup(page.data.user));

	// single permission to manage dashboard quick actions
	let canDashboardManage = $derived.by(() => {
		const perms = (page.data.user ?? { permissions: [] }).permissions ?? [];
		return (perms as string[]).includes('dashboard_manage');
	});

	let downloadingBackup = $state(false);

	const links = $derived(
		(
			[
				{ href: '/administrasi/absensi/scan', label: 'Scan QR', icon: 'grid' },
				{ href: '/asesmen-sumatif', label: 'Input Nilai', icon: 'pen' },
				{ href: '/rapor/jadwal-pelajaran', label: 'Kelola Jadwal', icon: 'calendar' },
				{ href: '/cetak', label: 'Cetak Dokumen', icon: 'print' }
			] as const
		).filter((item) => canAccessMenu(page.data.user, item.href))
	);

	const handleBackupDownload = async () => {
		if (typeof window === 'undefined' || downloadingBackup || !canDownloadBackup) return;
		downloadingBackup = true;

		try {
			const response = await fetch('/api/database/backup');
			if (!response.ok) {
				const errorText = (await response.text()) || 'Gagal mengunduh backup database.';
				toast(errorText, 'error');
				return;
			}

			const blob = await response.blob();
			let filename = 'kaganga-backup.sqlite3';
			const disposition = response.headers.get('content-disposition');
			const matched = disposition?.match(/filename="?([^";]+)"?/i);
			if (matched?.[1]) {
				filename = matched[1];
			} else {
				const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
				filename = `kaganga-backup-${timestamp}.sqlite3`;
			}

			const blobUrl = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			document.body.appendChild(anchor);
			anchor.href = blobUrl;
			anchor.download = filename;
			anchor.click();
			document.body.removeChild(anchor);
			URL.revokeObjectURL(blobUrl);
			toast('Backup database berhasil diunduh.', 'success');
		} catch (error) {
			console.error(error);
			toast('Gagal mengunduh backup database.', 'error');
		} finally {
			downloadingBackup = false;
		}
	};

	const handleImport = () => {
		showModal({
			title: 'Import Database',
			body: ImportDatabaseModal,
			dismissible: true
		});
	};
</script>

<div class="dashboard-panel dashboard-actions min-w-0 rounded-lg shadow-sm">
	<div class="p-5">
		<h2 class="mb-4 flex items-center gap-2 text-lg font-bold">
			<span class="text-info">
				<Icon name="gear" class="size-5" />
			</span>
			Tindakan Cepat
		</h2>
		<div class="dashboard-actions-grid">
			{#each links as item (item.href)}
				<a class="btn dashboard-action" href={resolve(item.href)}>
					<Icon name={item.icon} /><span>{item.label}</span>
				</a>
			{/each}
			<button
				type="button"
				onclick={handleBackupDownload}
				class="btn dashboard-action"
				aria-label="Backup Data"
				disabled={downloadingBackup || !canDownloadBackup}
				aria-disabled={!canDownloadBackup}
				aria-busy={downloadingBackup}
				title={!canDownloadBackup
					? 'Backup database hanya tersedia untuk admin dan kepala sekolah'
					: ''}
			>
				{#if downloadingBackup}
					<span class="loading loading-spinner loading-sm"></span>
				{:else}
					<Icon name="database" />
				{/if}
				<span>{downloadingBackup ? 'Mengunduh…' : 'Backup Data'}</span>
			</button>
			<button
				type="button"
				onclick={() => (canDashboardManage ? handleImport() : undefined)}
				class="btn dashboard-action"
				disabled={!canDashboardManage}
				aria-disabled={!canDashboardManage}
				title={!canDashboardManage ? 'Anda tidak memiliki izin untuk melakukan tindakan cepat' : ''}
			>
				<Icon name="import" />
				Import Data
			</button>
		</div>
	</div>
</div>
