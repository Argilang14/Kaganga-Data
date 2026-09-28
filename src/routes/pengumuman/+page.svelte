<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	let { data, form } = $props();
	let formOpen = $state(false);
	let editing = $state<any>(null);
	const categoryLabel: Record<string, string> = {
		umum: 'Umum',
		sekolah: 'Sekolah',
		asrama: 'Asrama',
		akademik: 'Akademik'
	};
	const audienceLabel: Record<string, string> = {
		semua: 'Semua Pengguna',
		admin: 'Admin',
		guru: 'Guru',
		wali_kelas: 'Wali Kelas',
		wali_asuh: 'Wali Asuh',
		wali_asrama: 'Wali Asrama'
	};
	const eventLabel: Record<string, string> = {
		hari_efektif: 'Hari Efektif',
		libur_nasional: 'Libur Nasional',
		libur_sekolah: 'Libur Sekolah',
		ujian: 'Ujian',
		asesmen: 'Asesmen',
		pembagian_rapor: 'Pembagian Rapor',
		kegiatan_sekolah: 'Kegiatan Sekolah',
		kegiatan_asrama: 'Kegiatan Asrama',
		lainnya: 'Lainnya'
	};
	const formatDate = (value: string) =>
		new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`));
	function openForm(item: any = null) {
		editing = item;
		formOpen = true;
	}
</script>

<div class="space-y-5">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h2 class="text-2xl font-bold">Pengumuman dan Agenda</h2>
			<p class="text-base-content/65 text-sm">
				Informasi sesuai peran pengguna dan agenda dari Kalender Pendidikan {data.context
					.tahunAjaran}.
			</p>
		</div>
		{#if data.canManage}<button
				class="btn btn-primary shadow-none"
				type="button"
				onclick={() => openForm()}><Icon name="plus" /> Buat Pengumuman</button
			>{/if}
	</header>
	{#if form?.fail}<div class="alert alert-error py-2">{form.fail}</div>{/if}{#if form?.message}<div
			class="alert alert-success py-2"
		>
			{form.message}
		</div>{/if}
	<div class="grid items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(300px,1fr)]">
		<section class="space-y-3">
			<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<h3 class="text-lg font-bold">Pengumuman</h3>
				<form method="GET">
					<select
						class="select select-bordered select-sm"
						name="kategori"
						onchange={(event) => event.currentTarget.form?.requestSubmit()}
						><option value="">Semua kategori</option>{#each data.categories as item}<option
								value={item}
								selected={data.filters.kategori === item}>{categoryLabel[item]}</option
							>{/each}</select
					>
				</form>
			</div>
			{#each data.announcements as item}<article
					class={`rounded-lg border bg-base-100 p-4 shadow-sm ${item.prioritas === 'penting' ? 'border-warning bg-warning/5' : 'border-base-300'}`}
				>
					<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
						<div class="min-w-0">
							<div class="flex flex-wrap items-center gap-2">
								<h4 class="text-lg font-bold">{item.judul}</h4>
								{#if item.prioritas === 'penting'}<span class="badge badge-warning badge-sm"
										><Icon name="warning" /> Penting</span
									>{/if}{#if !item.aktif}<span class="badge badge-neutral badge-sm">Nonaktif</span
									>{/if}
							</div>
							<div class="mt-1 flex flex-wrap gap-2 text-xs opacity-60">
								<span>{categoryLabel[item.kategori]}</span><span>·</span><span
									>{audienceLabel[item.audiens]}</span
								><span>·</span><span
									>{formatDate(item.tanggalMulai)}{item.tanggalSelesai
										? ` - ${formatDate(item.tanggalSelesai)}`
										: ''}</span
								>
							</div>
						</div>
						{#if data.canManage}<div class="flex shrink-0 gap-1">
								<button class="btn btn-soft btn-sm" type="button" onclick={() => openForm(item)}
									><Icon name="edit" /></button
								>
								<form method="POST" action="?/toggle">
									<input type="hidden" name="id" value={item.id} /><button
										class="btn btn-soft btn-sm"
										type="submit"
										title={item.aktif ? 'Nonaktifkan' : 'Aktifkan'}
										><Icon name={item.aktif ? 'pause' : 'play'} /></button
									>
								</form>
								<form
									method="POST"
									action="?/delete"
									onsubmit={(event) => {
										if (!confirm(`Hapus pengumuman ${item.judul}?`)) event.preventDefault();
									}}
								>
									<input type="hidden" name="id" value={item.id} /><button
										class="btn btn-error btn-soft btn-sm"
										type="submit"><Icon name="del" /></button
									>
								</form>
							</div>{/if}
					</div>
					<p class="mt-3 whitespace-pre-line text-sm leading-6">{item.isi}</p>
				</article>{:else}<div
					class="rounded-lg border border-dashed border-base-300 bg-base-100 p-10 text-center opacity-60"
				>
					Belum ada pengumuman yang dapat ditampilkan.
				</div>{/each}
		</section>
		<aside class="rounded-lg border border-base-300 bg-base-100 shadow-sm">
			<div class="flex items-center justify-between border-b border-base-300 p-4">
				<div>
					<h3 class="font-bold">Agenda Mendatang</h3>
					<p class="text-xs opacity-60">Sumber: Kalender Pendidikan</p>
				</div>
				<a class="btn btn-soft btn-sm" href="/jadwal/kalender"><Icon name="calendar" /></a>
			</div>
			<div class="divide-y divide-base-300">
				{#each data.agenda as item}<div class="flex gap-3 p-4">
						<div class="w-16 shrink-0 text-center">
							<div class="text-lg font-bold">
								{new Date(`${item.tanggalMulai}T00:00:00`).getDate()}
							</div>
							<div class="text-xs uppercase opacity-60">
								{new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(
									new Date(`${item.tanggalMulai}T00:00:00`)
								)}
							</div>
						</div>
						<div class="min-w-0">
							<h4 class="font-semibold">{item.judul}</h4>
							<div class="mt-1 text-xs opacity-60">
								{eventLabel[item.jenis] || item.jenis} · {item.jenjang.toUpperCase()}
							</div>
							{#if item.tanggalSelesai !== item.tanggalMulai}<div class="text-xs opacity-60">
									sampai {formatDate(item.tanggalSelesai)}
								</div>{/if}
						</div>
					</div>{:else}<p class="p-8 text-center text-sm opacity-60">
						Belum ada agenda mendatang.
					</p>{/each}
			</div>
		</aside>
	</div>
</div>

{#if formOpen}<div class="modal modal-open">
		<div class="modal-box max-w-3xl">
			<h3 class="text-xl font-bold">{editing ? 'Ubah Pengumuman' : 'Buat Pengumuman'}</h3>
			<form
				method="POST"
				action={editing ? '?/update' : '?/create'}
				class="mt-4 grid gap-4 md:grid-cols-2"
			>
				{#if editing}<input type="hidden" name="id" value={editing.id} />{/if}<label
					class="form-control md:col-span-2"
					><span class="label-text mb-1">Judul</span><input
						class="input input-bordered"
						name="judul"
						value={editing?.judul ?? ''}
						required
					/></label
				><label class="form-control"
					><span class="label-text mb-1">Kategori</span><select
						class="select select-bordered"
						name="kategori"
						>{#each data.categories as item}<option
								value={item}
								selected={(editing?.kategori ?? 'umum') === item}>{categoryLabel[item]}</option
							>{/each}</select
					></label
				><label class="form-control"
					><span class="label-text mb-1">Audiens</span><select
						class="select select-bordered"
						name="audiens"
						>{#each data.audiences as item}<option
								value={item}
								selected={(editing?.audiens ?? 'semua') === item}>{audienceLabel[item]}</option
							>{/each}</select
					></label
				><label class="form-control"
					><span class="label-text mb-1">Prioritas</span><select
						class="select select-bordered"
						name="prioritas"
						><option value="normal" selected={(editing?.prioritas ?? 'normal') === 'normal'}
							>Normal</option
						><option value="penting" selected={editing?.prioritas === 'penting'}>Penting</option
						></select
					></label
				>
				<div class="grid grid-cols-2 gap-3">
					<label class="form-control"
						><span class="label-text mb-1">Mulai</span><input
							class="input input-bordered"
							type="date"
							name="tanggalMulai"
							value={editing?.tanggalMulai ?? data.context.today}
							required
						/></label
					><label class="form-control"
						><span class="label-text mb-1">Selesai</span><input
							class="input input-bordered"
							type="date"
							name="tanggalSelesai"
							value={editing?.tanggalSelesai ?? ''}
						/></label
					>
				</div>
				<label class="form-control md:col-span-2"
					><span class="label-text mb-1">Isi Pengumuman</span><textarea
						class="textarea textarea-bordered"
						name="isi"
						rows="6"
						required>{editing?.isi ?? ''}</textarea
					></label
				>
				<div class="modal-action md:col-span-2">
					<button class="btn" type="button" onclick={() => (formOpen = false)}>Batal</button><button
						class="btn btn-primary"
						type="submit"><Icon name="save" /> Simpan</button
					>
				</div>
			</form>
		</div>
		<button class="modal-backdrop" type="button" onclick={() => (formOpen = false)}>Tutup</button>
	</div>{/if}
