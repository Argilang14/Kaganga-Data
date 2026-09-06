<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import { showModal } from '$lib/components/global-modal.svelte';
	import SppdCreateForm from '$lib/components/sppd-create-form.svelte';
	import SppdFormFields from '$lib/components/sppd-form-fields.svelte';

	let { data, form } = $props();
	const statusClass: Record<string, string> = {
		draft: 'badge-warning',
		terbit: 'badge-info',
		selesai: 'badge-success'
	};

	function openCreateModal() {
		showModal({
			title: 'Tambah Draft SPPD',
			body: SppdCreateForm,
			bodyProps: { employees: data.pegawai },
			dismissible: false
		});
	}

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
		<div class="flex flex-wrap items-center gap-2">
			<nav class="tabs tabs-boxed w-fit" aria-label="Surat menyurat">
				<a class="tab tab-active" href="/surat-menyurat/sppd">SPPD</a>
				<a class="tab" href="/surat-menyurat/dinas-luar">Dinas Luar</a>
			</nav>
			<button class="btn btn-primary btn-soft shadow-none" type="button" onclick={openCreateModal}>
				<Icon name="plus" /> Tambah Draft
			</button>
		</div>
	</header>

	{#if form?.fail}<div class="alert alert-error py-2">{form.fail}</div>{/if}
	{#if form?.message}<div class="alert alert-success py-2">{form.message}</div>{/if}

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
							><strong
								>{item.pelaksana.map((row) => row.nama).join(', ') || item.pegawai.nama}</strong
							>
							<div class="text-xs opacity-60">{item.pelaksana.length || 1} pegawai</div>
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
								<a
									class="btn btn-soft btn-sm"
									href={`/api/pdf/sppd?id=${item.id}`}
									target="_blank"
									aria-label="Cetak SPPD"><Icon name="print" /></a
								>
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
								{#if item.status === 'draft'}
									<details class="dropdown dropdown-end">
										<summary class="btn btn-soft btn-sm"><Icon name="edit" /> Edit</summary>
										<div
											class="dropdown-content bg-base-100 border-base-300 z-30 mt-2 w-[min(92vw,760px)] rounded border p-4 shadow-xl"
										>
											<form
												method="POST"
												action="?/update"
												class="grid max-h-[72vh] w-full items-start gap-5 overflow-y-auto md:grid-cols-2"
											>
												<input type="hidden" name="id" value={item.id} />
												<SppdFormFields employees={data.pegawai} {item} />
												<div class="flex justify-end md:col-span-2">
													<button class="btn btn-primary btn-sm" type="submit"
														><Icon name="save" /> Simpan Perubahan</button
													>
												</div>
											</form>
										</div>
									</details>
								{/if}
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
