<script lang="ts">
	import Icon from '$lib/components/icon.svelte';

	let {
		record,
		activity,
		status
	}: {
		record: {
			message: string;
			waktuScan?: string | null;
			petugas?: { nama: string } | null;
			murid?: { nama: string; kelas: string };
		};
		activity: string;
		status: string;
	} = $props();

	const firstScanTime = $derived.by(() => {
		if (!record.waktuScan) return 'Tidak ada catatan scan';
		const date = new Date(record.waktuScan);
		if (!Number.isFinite(date.getTime())) return 'Waktu tidak tersedia';
		return `${date.toLocaleString('id-ID', {
			timeZone: 'Asia/Jakarta',
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		})} WIB`;
	});
</script>

<div class="space-y-4" data-testid="duplicate-scan-notice">
	<div class="alert alert-soft alert-error items-start text-sm" role="alert">
		<Icon name="warning" class="mt-0.5 shrink-0" />
		<p class="min-w-0 break-words">{record.message}</p>
	</div>
	{#if record.murid}
		<div class="min-w-0">
			<p class="text-lg font-semibold break-words">{record.murid.nama}</p>
			<p class="text-base-content/65 mt-1 text-sm break-words">{record.murid.kelas}</p>
		</div>
	{/if}
	<dl class="border-base-200 grid gap-4 border-t pt-4 text-sm sm:grid-cols-2">
		<div class="min-w-0">
			<dt class="text-base-content/65">Kegiatan</dt>
			<dd class="mt-1 font-medium break-words">{activity}</dd>
		</div>
		<div class="min-w-0">
			<dt class="text-base-content/65">Status tercatat</dt>
			<dd class="mt-1 font-medium break-words">{status}</dd>
		</div>
		<div class="min-w-0">
			<dt class="text-base-content/65">Petugas pencatat pertama</dt>
			<dd class="mt-1 font-medium break-words">
				{record.petugas?.nama ?? 'Petugas tidak tercatat'}
			</dd>
		</div>
		<div class="min-w-0">
			<dt class="text-base-content/65">Waktu scan pertama</dt>
			<dd class="mt-1 font-medium break-words">{firstScanTime}</dd>
		</div>
	</dl>
	<p class="text-base-content/65 text-sm">Tidak ada absensi baru yang ditambahkan.</p>
</div>
