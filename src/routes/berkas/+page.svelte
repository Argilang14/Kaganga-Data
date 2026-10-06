<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	let { data, form } = $props();
	let uploadOpen = $state(false);
	let entityType = $state('murid');
	let entityQuery = $state('');
	let entityId = $state('');
	let entityResults = $state<{ id: string; label: string }[]>([]);
	let searching = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function searchEntities() {
		searching = true;
		try {
			const response = await fetch(
				`/api/berkas/entities?type=${encodeURIComponent(entityType)}&q=${encodeURIComponent(entityQuery)}`
			);
			const payload = await response.json();
			entityResults = payload.items ?? [];
			if (entityType === 'sekolah' && entityResults[0]) selectEntity(entityResults[0]);
		} finally {
			searching = false;
		}
	}
	function scheduleSearch() {
		entityId = '';
		clearTimeout(timer);
		timer = setTimeout(searchEntities, 250);
	}
	function selectEntity(item: { id: string; label: string }) {
		entityId = item.id;
		entityQuery = item.label;
		entityResults = [];
	}
	function formatSize(value: number) {
		return value < 1024 * 1024
			? `${Math.ceil(value / 1024)} KB`
			: `${(value / 1024 / 1024).toFixed(1)} MB`;
	}
	function formatDate(value: string) {
		return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(
			new Date(value)
		);
	}
</script>

<div class="space-y-4">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h2 class="text-2xl font-bold">Manajemen Berkas</h2>
			<p class="text-base-content/65 text-sm">
				Dokumen tersimpan di luar SQLite dan terpisah berdasarkan sekolah.
			</p>
		</div>
		{#if data.canManage}<button
				class="btn btn-primary btn-soft shadow-none"
				type="button"
				onclick={() => {
					uploadOpen = true;
					searchEntities();
				}}><Icon name="plus" /> Unggah Berkas</button
			>{/if}
	</header>
	{#if form?.fail}<div class="alert alert-error py-2">{form.fail}</div>{/if}{#if form?.message}<div
			class="alert alert-success py-2"
		>
			{form.message}
		</div>{/if}
	<form
		method="GET"
		class="grid gap-2 rounded-lg border border-base-300 bg-base-100 p-3 shadow-sm md:grid-cols-[1fr_190px_auto]"
	>
		<input
			class="input input-bordered"
			name="q"
			value={data.filters.q}
			placeholder="Cari nama berkas, kategori, atau pemilik..."
		/><select class="select select-bordered" name="type"
			><option value="">Semua pemilik</option
			>{#each ['murid', 'pegawai', 'surat', 'sekolah', 'inventaris'] as type}<option
					value={type}
					selected={data.filters.type === type}>{type}</option
				>{/each}</select
		><button class="btn btn-soft" type="submit"><Icon name="search" /> Cari</button>
	</form>
	<div class="overflow-x-auto rounded-lg border border-base-300 bg-base-100 shadow-sm">
		<table class="table table-zebra">
			<thead
				><tr
					><th>Berkas</th><th>Pemilik</th><th>Kategori</th><th>Kedaluwarsa</th><th>Ukuran</th><th
						>Diunggah</th
					><th class="text-right">Aksi</th></tr
				></thead
			><tbody
				>{#each data.rows as item}<tr
						><td
							><strong>{item.originalName}</strong>
							<div class="font-mono text-xs opacity-50">{item.sha256.slice(0, 12)}...</div></td
						><td
							><span class="badge badge-outline">{item.entityType}</span>
							<div class="mt-1 text-sm">{item.entityLabelSnapshot}</div></td
						><td>{item.category}</td><td>{item.expiresAt ? formatDate(item.expiresAt) : '-'}</td><td
							>{formatSize(item.sizeBytes)}</td
						><td class="whitespace-nowrap">{formatDate(item.createdAt)}</td><td
							><div class="flex justify-end gap-1">
								<a class="btn btn-soft btn-sm" href={`/api/berkas/${item.id}`} target="_blank"
									><Icon name="eye" /> Lihat</a
								><a class="btn btn-soft btn-sm" href={`/api/berkas/${item.id}?download=1`}
									><Icon name="download" /></a
								>{#if data.canDelete}<form method="POST" action="?/delete">
										<input type="hidden" name="id" value={item.id} /><button
											class="btn btn-error btn-soft btn-sm"
											type="submit"
											aria-label="Hapus berkas"><Icon name="del" /></button
										>
									</form>{/if}
							</div></td
						></tr
					>{:else}<tr
						><td colspan="7" class="py-12 text-center opacity-60">Belum ada berkas tersimpan.</td
						></tr
					>{/each}</tbody
			>
		</table>
	</div>
	{#if data.page.totalPages > 1}<div class="join flex justify-center">
			{#each Array.from({ length: data.page.totalPages }, (_, i) => i + 1) as page}<a
					class:btn-active={page === data.page.currentPage}
					class="btn join-item btn-sm"
					href={`?q=${encodeURIComponent(data.filters.q)}&type=${data.filters.type}&page=${page}`}
					>{page}</a
				>{/each}
		</div>{/if}
</div>

{#if uploadOpen}<div class="modal modal-open">
		<div class="modal-box max-w-2xl">
			<h3 class="text-xl font-bold">Unggah Berkas</h3>
			<form method="POST" action="?/upload" enctype="multipart/form-data" class="mt-4 space-y-4">
				<label class="form-control"
					><span class="label-text mb-1">Jenis Pemilik</span><select
						class="select select-bordered"
						name="entityType"
						bind:value={entityType}
						onchange={() => {
							entityQuery = '';
							entityId = '';
							searchEntities();
						}}
						><option value="murid">Murid</option><option value="pegawai">Pegawai</option><option
							value="surat">Surat</option
						><option value="sekolah">Sekolah</option><option value="inventaris">Inventaris</option
						></select
					></label
				>
				<div class="relative">
					<label class="form-control"
						><span class="label-text mb-1">Cari Pemilik</span><input
							class="input input-bordered"
							bind:value={entityQuery}
							oninput={scheduleSearch}
							placeholder="Ketik nama atau nomor..."
							autocomplete="off"
							required
						/></label
					>{#if searching}<span class="loading loading-spinner loading-sm absolute right-3 top-10"
						></span>{/if}{#if entityResults.length}<div
							class="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-base-300 bg-base-100 p-1 shadow-xl"
						>
							{#each entityResults as item}<button
									class="btn btn-ghost h-auto min-h-10 w-full justify-start text-left"
									type="button"
									onclick={() => selectEntity(item)}>{item.label}</button
								>{/each}
						</div>{/if}<input
						type="hidden"
						name="entityId"
						value={entityId}
					/>{#if entityQuery && !entityId}<p class="mt-1 text-xs text-warning">
							Pilih salah satu hasil pencarian.
						</p>{/if}
				</div>
				<label class="form-control"
					><span class="label-text mb-1">Kategori Dokumen</span><input
						class="input input-bordered"
						name="category"
						placeholder="Contoh: KK, Akta, SK, Sertifikat"
						required
					/></label
				><label class="form-control"
					><span class="label-text mb-1">Tanggal Kedaluwarsa (opsional)</span><input
						class="input input-bordered"
						type="date"
						name="expiresAt"
					/><span class="mt-1 text-xs opacity-60"
						>Untuk SK, kontrak, sertifikat, atau dokumen yang memiliki masa berlaku.</span
					></label
				><label class="form-control"
					><span class="label-text mb-1">Berkas</span><input
						class="file-input file-input-bordered"
						type="file"
						name="file"
						accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx"
						required
					/><span class="mt-1 text-xs opacity-60"
						>PDF, gambar, DOCX, atau XLSX. Maksimal {data.maxSizeMb} MB.</span
					></label
				>
				<div class="modal-action">
					<button class="btn" type="button" onclick={() => (uploadOpen = false)}>Batal</button
					><button class="btn btn-primary" type="submit" disabled={!entityId}
						><Icon name="save" /> Simpan</button
					>
				</div>
			</form>
		</div>
		<button class="modal-backdrop" type="button" onclick={() => (uploadOpen = false)}>Tutup</button>
	</div>{/if}
