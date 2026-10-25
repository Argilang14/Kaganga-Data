<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import { pickupProblem, type TravelVerification } from '$lib/attendance-travel';
	let {
		verification,
		busy,
		online,
		onconfirm,
		oncancel
	}: {
		verification: TravelVerification;
		busy: boolean;
		online: boolean;
		onconfirm: (pickupVerified: boolean) => void;
		oncancel: () => void;
	} = $props();
	const returning = $derived(verification.operation === 'kembali_ke_sekolah');
	let pickupVerified = $state(false);
	const incomplete = $derived(
		pickupProblem(verification.izin.penjemputNama, verification.izin.penjemputHubungan)
	);
	$effect(() => {
		if (verification.revision) pickupVerified = false;
	});
</script>

<section
	class="border-info/30 bg-base-100 rounded-lg border p-4 shadow-sm"
	aria-labelledby="travel-confirm-title"
	data-testid="travel-verification"
>
	<div class="text-info flex items-center gap-2">
		<Icon name="info" />
		<h3 id="travel-confirm-title" class="font-semibold">
			Konfirmasi {returning ? 'kembali ke sekolah' : 'pulang ke rumah'}
		</h3>
	</div>
	<div class="mt-3 min-w-0 text-lg font-bold wrap-break-word">{verification.murid.nama}</div>
	<dl class="mt-3 grid gap-3 text-sm sm:grid-cols-2">
		<div>
			<dt class="text-base-content/60">Kelas</dt>
			<dd class="font-medium">{verification.murid.kelas}</dd>
		</div>
		<div>
			<dt class="text-base-content/60">Nomor izin</dt>
			<dd class="wrap-break-word">
				{verification.izin.nomorDokumen || `Izin #${verification.id}`}
			</dd>
		</div>
		<div>
			<dt class="text-base-content/60">Tanggal keluar pada izin</dt>
			<dd>{verification.izin.tanggalKeluar}</dd>
		</div>
		<div>
			<dt class="text-base-content/60">Rencana kembali</dt>
			<dd>
				{verification.izin.rencanaKembali}
				{verification.izin.waktuRencanaKembali?.slice(0, 5) ?? ''}
			</dd>
		</div>
	</dl>
	<div class="border-base-300 mt-4 border-t pt-4">
		<dl class="grid gap-3 text-sm sm:grid-cols-2">
			<div>
				<dt class="text-base-content/60">Nama penjemput</dt>
				<dd class="font-semibold wrap-break-word">
					{verification.izin.penjemputNama || 'Belum dilengkapi'}
				</dd>
			</div>
			<div>
				<dt class="text-base-content/60">Hubungan dengan murid</dt>
				<dd class="font-semibold wrap-break-word">
					{verification.izin.penjemputHubungan || 'Belum dilengkapi'}
				</dd>
			</div>
		</dl>
		{#if !returning}
			{#if incomplete}
				<p class="alert alert-soft alert-error mt-3 text-sm" role="alert">
					<Icon name="warning" />{incomplete} Hubungi pemberi izin sebelum anak keluar.
				</p>
			{:else}
				<label class="mt-4 flex cursor-pointer items-start gap-3 text-sm">
					<input
						type="checkbox"
						class="checkbox checkbox-success shrink-0"
						bind:checked={pickupVerified}
						disabled={busy || !online}
					/>
					<span>Penjemput sesuai dengan izin</span>
				</label>
				<p class="text-base-content/65 mt-2 text-xs">
					Jika penjemput berbeda, batalkan konfirmasi dan hubungi pemberi izin.
				</p>
			{/if}
		{/if}
	</div>
	{#if returning && verification.terlambat}<div
			class="alert alert-soft alert-warning mt-3 text-sm"
			role="status"
		>
			<Icon name="warning" /><span
				>Melewati rencana kembali. Waktu kedatangan tetap dicatat sesuai waktu server.</span
			>
		</div>{/if}
	<div class="mt-4 flex flex-wrap gap-2">
		<button
			class="btn btn-success min-h-11 flex-1 sm:flex-none"
			disabled={busy || !online || (!returning && (!!incomplete || !pickupVerified))}
			onclick={() => onconfirm(pickupVerified)}
			type="button"
		>
			{#if busy}<span class="loading loading-spinner loading-sm"></span>{:else}<Icon
					name="success"
				/>{/if}
			Konfirmasi {returning ? 'Kembali' : 'Keluar'}
		</button>
		<button class="btn min-h-11" disabled={busy} onclick={oncancel} type="button"
			><Icon name="close" />Batal</button
		>
	</div>
</section>
