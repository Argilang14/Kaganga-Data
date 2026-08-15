<script lang="ts">
	import Icon from '$lib/components/icon.svelte';

	let { data, form } = $props();
	const statusClass: Record<string, string> = {
		draft: 'badge-warning',
		terbit: 'badge-info',
		selesai: 'badge-success'
	};

	function formatDate(value: string | null) {
		if (!value) return '-';
		return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(
			new Date(`${value}T00:00:00`)
		);
	}
</script>

<div class="space-y-4">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h2 class="text-2xl font-bold">Surat Perintah Perjalanan Dinas</h2>
			<p class="text-base-content/65 text-sm">Data SPPD terpisah untuk setiap sekolah aktif.</p>
		</div>
		<nav class="tabs tabs-boxed w-fit" aria-label="Surat menyurat">
			<a class="tab tab-active" href="/surat-menyurat/sppd">SPPD</a>
			<a class="tab" href="/surat-menyurat/dinas-luar">Dinas Luar</a>
		</nav>
	</header>

	{#if form?.fail}<div class="alert alert-error py-2">{form.fail}</div>{/if}
	{#if form?.message}<div class="alert alert-success py-2">{form.message}</div>{/if}

	<details class="collapse-arrow bg-base-100 border-base-300 collapse border">
		<summary class="collapse-title flex items-center gap-2 font-semibold">
			<Icon name="plus" /> Tambah Draft SPPD
		</summary>
		<form
			method="POST"
			action="?/create"
			class="collapse-content grid gap-3 md:grid-cols-2 xl:grid-cols-3"
		>
			<label class="form-control xl:col-span-2">
				<span class="label-text mb-1">Pegawai Pelaksana</span>
				<select class="select select-bordered w-full" name="pegawaiId" required>
					<option value="">Pilih pegawai</option>
					{#each data.pegawai as pegawai}
						<option value={pegawai.id}>{pegawai.nama} - {pegawai.nip}</option>
					{/each}
				</select>
			</label>
			<label class="form-control"
				><span class="label-text mb-1">Nomor Surat</span><input
					class="input input-bordered"
					name="nomorSurat"
				/></label
			>
			<label class="form-control"
				><span class="label-text mb-1">Tanggal Surat</span><input
					class="input input-bordered"
					type="date"
					name="tanggalSurat"
				/></label
			>
			<label class="form-control md:col-span-2"
				><span class="label-text mb-1">Dasar Surat</span><input
					class="input input-bordered"
					name="dasarSurat"
				/></label
			>
			<label class="form-control md:col-span-2 xl:col-span-3"
				><span class="label-text mb-1">Maksud Perjalanan</span><textarea
					class="textarea textarea-bordered"
					name="maksud"
					required></textarea></label
			>
			<label class="form-control"
				><span class="label-text mb-1">Tempat Berangkat</span><input
					class="input input-bordered"
					name="tempatBerangkat"
				/></label
			>
			<label class="form-control"
				><span class="label-text mb-1">Tempat Tujuan</span><input
					class="input input-bordered"
					name="tempatTujuan"
					required
				/></label
			>
			<label class="form-control"
				><span class="label-text mb-1">Alat Angkut</span><input
					class="input input-bordered"
					name="alatAngkut"
				/></label
			>
			<label class="form-control"
				><span class="label-text mb-1">Tanggal Berangkat</span><input
					class="input input-bordered"
					type="date"
					name="tanggalBerangkat"
					required
				/></label
			>
			<label class="form-control"
				><span class="label-text mb-1">Tanggal Kembali</span><input
					class="input input-bordered"
					type="date"
					name="tanggalKembali"
					required
				/></label
			>
			<label class="form-control"
				><span class="label-text mb-1">Keterangan</span><input
					class="input input-bordered"
					name="keterangan"
				/></label
			>
			<div class="md:col-span-2 xl:col-span-3 flex justify-end">
				<button class="btn btn-primary" type="submit"><Icon name="save" /> Simpan Draft</button>
			</div>
		</form>
	</details>

	<div class="overflow-x-auto rounded-lg border border-base-300 bg-base-100">
		<table class="table table-zebra">
			<thead
				><tr
					><th>No.</th><th>Pegawai</th><th>Maksud dan Tujuan</th><th>Periode</th><th>Status</th><th
						class="text-right">Aksi</th
					></tr
				></thead
			>
			<tbody>
				{#each data.daftar as item, index}
					<tr>
						<td>{index + 1}</td>
						<td
							><strong>{item.pegawai.nama}</strong>
							<div class="text-xs opacity-60">{item.nomorSurat || 'Nomor belum diisi'}</div></td
						>
						<td class="max-w-md"
							><strong>{item.maksud}</strong>
							<div class="text-sm opacity-70">{item.tempatTujuan}</div></td
						>
						<td class="whitespace-nowrap"
							>{formatDate(item.tanggalBerangkat)}
							<div class="text-xs opacity-60">s.d. {formatDate(item.tanggalKembali)}</div></td
						>
						<td
							><span class={`badge ${statusClass[item.status] ?? 'badge-ghost'}`}
								>{item.status}</span
							></td
						>
						<td
							><div class="flex justify-end gap-1">
								<form method="POST" action="?/setStatus">
									<input type="hidden" name="id" value={item.id} /><input
										type="hidden"
										name="status"
										value={item.status === 'draft' ? 'terbit' : 'selesai'}
									/><button
										class="btn btn-soft btn-sm"
										type="submit"
										disabled={item.status === 'selesai'}
										><Icon name="check" />
										{item.status === 'draft' ? 'Terbitkan' : 'Selesai'}</button
									>
								</form>
								{#if item.status === 'draft'}<form method="POST" action="?/delete">
										<input type="hidden" name="id" value={item.id} /><button
											class="btn btn-soft btn-error btn-sm"
											type="submit"
											aria-label="Hapus draft"><Icon name="del" /></button
										>
									</form>{/if}
							</div></td
						>
					</tr>
				{:else}<tr
						><td colspan="6" class="py-10 text-center opacity-60">Belum ada data SPPD.</td></tr
					>{/each}
			</tbody>
		</table>
	</div>
</div>
