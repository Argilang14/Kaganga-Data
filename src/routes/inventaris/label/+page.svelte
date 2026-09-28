<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	let { data } = $props();
</script>

<div class="mx-auto max-w-3xl space-y-4">
	<div class="no-print flex items-center justify-between">
		<a class="btn btn-soft" href="/inventaris"><Icon name="left" /> Kembali</a><button
			class="btn btn-primary"
			type="button"
			onclick={() => window.print()}><Icon name="print" /> Cetak Label</button
		>
	</div>
	<div class="label-sheet bg-white p-6 text-black">
		<div class="asset-label grid grid-cols-[34mm_1fr] gap-4 border-2 border-black p-3">
			<img
				src={`/api/inventaris/${data.asset.id}/qr`}
				alt={`QR ${data.asset.kode}`}
				class="size-[32mm]"
			/>
			<div class="min-w-0">
				<div class="text-xs font-bold uppercase">Inventaris {data.schoolName}</div>
				<div class="mt-2 text-2xl font-black">{data.asset.kode}</div>
				<div class="text-lg font-bold">{data.asset.nama}</div>
				<dl class="mt-2 grid grid-cols-[90px_1fr] text-sm">
					<dt>Kategori</dt>
					<dd>: {data.asset.kategori}</dd>
					<dt>Lokasi</dt>
					<dd>: {data.asset.lokasi || '-'}</dd>
					<dt>Jumlah</dt>
					<dd>: {data.asset.jumlah} {data.asset.satuan}</dd>
					<dt>Penanggung jawab</dt>
					<dd>: {data.asset.penanggungJawab || '-'}</dd>
				</dl>
			</div>
		</div>
	</div>
</div>

<style>
	@media print {
		:global(body) {
			background: white;
		}
		:global(.app-sidebar),
		:global(.navbar),
		:global(header),
		.no-print {
			display: none !important;
		}
		:global(main) {
			padding: 0 !important;
			margin: 0 !important;
		}
		.label-sheet {
			width: 180mm;
		}
	}
</style>
