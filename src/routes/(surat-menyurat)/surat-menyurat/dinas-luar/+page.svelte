<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import { showModal } from '$lib/components/global-modal.svelte';
	import DinasLuarCreateForm from '$lib/components/dinas-luar-create-form.svelte';

	let { data, form } = $props();
	const statusClass: Record<string, string> = {
		diajukan: 'badge-warning',
		disetujui: 'badge-info',
		ditolak: 'badge-error',
		selesai: 'badge-success'
	};

	function openCreateModal() {
		showModal({
			title: 'Tambah Pengajuan Dinas Luar',
			body: DinasLuarCreateForm,
			bodyProps: {
				employees: data.pegawai,
				isAdmin: data.isAdmin,
				activeEmployeeId: data.pegawaiAktifId
			},
			dismissible: false
		});
	}

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
		<div class="flex flex-wrap items-center gap-2">
			<nav class="tabs tabs-boxed w-fit" aria-label="Surat menyurat">
				<a class="tab" href="/surat-menyurat/sppd">SPPD</a>
				<a class="tab tab-active" href="/surat-menyurat/dinas-luar">Dinas Luar</a>
			</nav>
			<button class="btn btn-primary btn-soft shadow-none" type="button" onclick={openCreateModal}>
				<Icon name="plus" /> Tambah Pengajuan
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
							><strong>{item.pegawai.nama}</strong>
							<div class="text-xs opacity-60">{item.pegawai.nip}</div></td
						>
						<td class="max-w-md"
							><strong>{item.maksud}</strong>
							<div class="text-sm opacity-70">{item.tempatTujuan}</div>
							{#if item.catatan}<div class="mt-1 text-xs opacity-60">{item.catatan}</div>{/if}
							{#if item.undanganFile}<a
									class="link link-primary mt-1 inline-block text-xs"
									href={`/api/dinas-luar/file/${item.undanganFile}`}
									target="_blank">Lihat undangan</a
								>{/if}</td
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
								{#if item.status === 'diajukan' && data.isAdmin}
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
								{/if}
								{#if item.status === 'diajukan' && (data.isAdmin || item.pegawai.id === data.pegawaiAktifId)}
									<form method="POST" action="?/delete">
										<input type="hidden" name="id" value={item.id} /><button
											class="btn btn-ghost btn-sm"
											type="submit"
											aria-label="Hapus pengajuan"><Icon name="del" /></button
										>
									</form>
								{/if}
								{#if item.status === 'disetujui' && data.isAdmin}
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
								{#if item.sppd}
									<a
										class="btn btn-soft btn-sm"
										href={`/api/pdf/sppd?id=${item.sppd.id}`}
										target="_blank"
										aria-label="Cetak SPPD"><Icon name="print" /></a
									>
									{#if data.isAdmin || item.pegawai.id === data.pegawaiAktifId}
										<details class="dropdown dropdown-end">
											<summary class="btn btn-soft btn-sm"><Icon name="image" /> Bukti</summary>
											<div
												class="dropdown-content bg-base-100 border-base-300 z-20 mt-2 w-72 rounded border p-3 shadow-xl"
											>
												<form
													method="POST"
													action="?/uploadBukti"
													enctype="multipart/form-data"
													class="space-y-2"
												>
													<input type="hidden" name="sppdId" value={item.sppd.id} />
													<input
														class="file-input file-input-bordered file-input-sm w-full"
														type="file"
														name="bukti"
														accept=".pdf,image/jpeg,image/png,image/webp"
														required
													/>
													<button class="btn btn-primary btn-sm w-full" type="submit">Unggah</button
													>
												</form>
												{#each item.sppd.bukti as proof}
													<div class="mt-2 flex items-center justify-between gap-2 text-xs">
														<a
															class="link truncate"
															href={`/api/dinas-luar/file/${proof.namaFile}`}
															target="_blank">{proof.jenis} {proof.id}</a
														>
														<form method="POST" action="?/deleteBukti">
															<input type="hidden" name="id" value={proof.id} /><button
																class="btn btn-error btn-ghost btn-xs"
																type="submit"><Icon name="del" /></button
															>
														</form>
													</div>
												{/each}
											</div>
										</details>
									{/if}
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
