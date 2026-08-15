<script lang="ts">
	import Icon from '$lib/components/icon.svelte';

	let { data, form } = $props();
	const statusClass: Record<string, string> = {
		diajukan: 'badge-warning',
		disetujui: 'badge-info',
		ditolak: 'badge-error',
		selesai: 'badge-success'
	};

	function formatDate(value: string) {
		return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(
			new Date(`${value}T00:00:00`)
		);
	}
</script>

<div class="space-y-4">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h2 class="text-2xl font-bold">Dinas Luar</h2>
			<p class="text-base-content/65 text-sm">
				Pengajuan perjalanan dinas pegawai pada sekolah aktif.
			</p>
		</div>
		<nav class="tabs tabs-boxed w-fit" aria-label="Surat menyurat">
			<a class="tab" href="/surat-menyurat/sppd">SPPD</a>
			<a class="tab tab-active" href="/surat-menyurat/dinas-luar">Dinas Luar</a>
		</nav>
	</header>

	{#if form?.fail}<div class="alert alert-error py-2">{form.fail}</div>{/if}
	{#if form?.message}<div class="alert alert-success py-2">{form.message}</div>{/if}

	<details class="collapse-arrow bg-base-100 border-base-300 collapse border">
		<summary class="collapse-title flex items-center gap-2 font-semibold"
			><Icon name="plus" /> Tambah Pengajuan</summary
		>
		<form
			method="POST"
			action="?/create"
			class="collapse-content grid gap-3 md:grid-cols-2 xl:grid-cols-3"
		>
			{#if data.isAdmin}
				<label class="form-control md:col-span-2 xl:col-span-3"
					><span class="label-text mb-1">Pegawai</span><select
						class="select select-bordered w-full"
						name="pegawaiId"
						required
						><option value="">Pilih pegawai</option>{#each data.pegawai as pegawai}<option
								value={pegawai.id}>{pegawai.nama} - {pegawai.nip}</option
							>{/each}</select
					></label
				>
			{:else if data.pegawaiAktifId}
				<input type="hidden" name="pegawaiId" value={data.pegawaiAktifId} />
			{:else}
				<div class="alert alert-warning md:col-span-2 xl:col-span-3">
					Akun ini belum terhubung dengan Data Pegawai.
				</div>
			{/if}
			<label class="form-control md:col-span-2 xl:col-span-3"
				><span class="label-text mb-1">Maksud Perjalanan</span><textarea
					class="textarea textarea-bordered"
					name="maksud"
					required></textarea></label
			>
			<label class="form-control"
				><span class="label-text mb-1">Tempat Tujuan</span><input
					class="input input-bordered"
					name="tempatTujuan"
					required
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
			<label class="form-control md:col-span-2 xl:col-span-3"
				><span class="label-text mb-1">Catatan</span><input
					class="input input-bordered"
					name="catatan"
				/></label
			>
			<div class="md:col-span-2 xl:col-span-3 flex justify-end">
				<button
					class="btn btn-primary"
					type="submit"
					disabled={!data.isAdmin && !data.pegawaiAktifId}
					><Icon name="save" /> Simpan Pengajuan</button
				>
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
							<div class="text-xs opacity-60">{item.pegawai.nip}</div></td
						>
						<td class="max-w-md"
							><strong>{item.maksud}</strong>
							<div class="text-sm opacity-70">{item.tempatTujuan}</div>
							{#if item.catatan}<div class="mt-1 text-xs opacity-60">{item.catatan}</div>{/if}</td
						>
						<td class="whitespace-nowrap"
							>{formatDate(item.tanggalBerangkat)}
							<div class="text-xs opacity-60">s.d. {formatDate(item.tanggalKembali)}</div></td
						>
						<td
							><span class={`badge ${statusClass[item.status] ?? 'badge-ghost'}`}
								>{item.status}</span
							>{#if item.sppd}<div class="mt-1 text-xs opacity-60">
									SPPD {item.sppd.nomorSurat || `#${item.sppd.id}`}
								</div>{/if}</td
						>
						<td
							><div class="flex justify-end gap-1">
								{#if item.status === 'diajukan'}
									<form method="POST" action="?/setStatus">
										<input type="hidden" name="id" value={item.id} /><input
											type="hidden"
											name="status"
											value="disetujui"
										/><button class="btn btn-soft btn-success btn-sm" type="submit"
											><Icon name="check" /> Setujui</button
										>
									</form>
									<form method="POST" action="?/setStatus">
										<input type="hidden" name="id" value={item.id} /><input
											type="hidden"
											name="status"
											value="ditolak"
										/><button class="btn btn-soft btn-error btn-sm" type="submit">Tolak</button>
									</form>
									<form method="POST" action="?/delete">
										<input type="hidden" name="id" value={item.id} /><button
											class="btn btn-ghost btn-sm"
											type="submit"
											aria-label="Hapus pengajuan"><Icon name="del" /></button
										>
									</form>
								{:else if item.status === 'disetujui'}
									<form method="POST" action="?/setStatus">
										<input type="hidden" name="id" value={item.id} /><input
											type="hidden"
											name="status"
											value="selesai"
										/><button class="btn btn-soft btn-sm" type="submit"
											><Icon name="check" /> Selesai</button
										>
									</form>
								{/if}
							</div></td
						>
					</tr>
				{:else}<tr
						><td colspan="6" class="py-10 text-center opacity-60"
							>Belum ada pengajuan dinas luar.</td
						></tr
					>{/each}
			</tbody>
		</table>
	</div>
</div>
