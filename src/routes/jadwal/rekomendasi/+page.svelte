<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	let { data, form } = $props();
	const days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
</script>

<div class="space-y-5">
	<header>
		<h2 class="text-2xl font-bold">Rekomendasi Jadwal</h2>
		<p class="text-sm opacity-60">
			Usulan non-destruktif berdasarkan target JP, slot kosong, bentrok guru, dan preferensi waktu.
		</p>
	</header>
	{#if data.context}<div class="alert alert-info">
			<Icon name="info" /><span
				>{data.context.tahunAjaran} · Semester {data.context.semester}. Rekomendasi tidak mengubah
				jadwal aktif.</span
			>
		</div>{/if}{#if form?.fail}<div class="alert alert-error">
			{form.fail}
		</div>{/if}{#if form?.message}<div class="alert alert-success">
			{form.message}
		</div>{/if}{#if data.canPreferences}<section
			class="rounded-lg border border-base-300 bg-base-100 p-4 shadow-sm"
		>
			<h3 class="font-bold">Waktu Guru Tidak Tersedia</h3>
			<form
				method="POST"
				action="?/savePreference"
				class="mt-3 grid gap-2 md:grid-cols-[1fr_150px_120px_1fr_auto]"
			>
				<select class="select select-bordered" name="pegawaiId" required
					><option value="">Pilih guru</option>{#each data.teachers as item}<option value={item.id}
							>{item.nama}</option
						>{/each}</select
				><select class="select select-bordered" name="hari"
					>{#each days as day}<option>{day}</option>{/each}</select
				><input
					class="input input-bordered"
					name="jamKe"
					type="number"
					min="1"
					max="30"
					placeholder="JP"
					required
				/><input class="input input-bordered" name="catatan" placeholder="Alasan opsional" /><button
					class="btn btn-primary"><Icon name="save" /> Simpan</button
				>
			</form>
			<div class="mt-3 flex flex-wrap gap-2">
				{#each data.preferences as item}<form
						method="POST"
						action="?/deletePreference"
						class="badge badge-outline gap-2 py-3"
					>
						<input type="hidden" name="id" value={item.id} /><span
							>Guru #{item.pegawaiId} · {item.hari} JP {item.jamKe}</span
						><button type="submit" aria-label="Hapus"><Icon name="close-sm" /></button>
					</form>{/each}
			</div>
		</section>{/if}
	<div class="grid gap-4 xl:grid-cols-[2fr_1fr]">
		<section class="overflow-x-auto rounded-lg border border-base-300 bg-base-100 shadow-sm">
			<div class="border-b border-base-300 p-4">
				<h3 class="font-bold">Usulan Penempatan ({data.proposals.length})</h3>
			</div>
			<table class="table">
				<thead><tr><th>Kelas</th><th>Hari/JP</th><th>Mapel</th><th>Alasan</th></tr></thead><tbody
					>{#each data.proposals as item}<tr
							><td>{item.kelas}</td><td>{item.hari} · JP {item.jamKe}</td><td
								><strong>{item.kode}</strong>
								<div class="text-xs opacity-60">{item.mapel}</div></td
							><td class="text-sm">{item.reason}</td></tr
						>{:else}<tr
							><td colspan="4" class="py-12 text-center opacity-60"
								>Tidak ada usulan. Target sudah terpenuhi atau data target belum tersedia.</td
							></tr
						>{/each}</tbody
				>
			</table>
		</section>
		<aside class="rounded-lg border border-base-300 bg-base-100 shadow-sm">
			<div class="border-b border-base-300 p-4">
				<h3 class="font-bold">Belum Teralokasi ({data.unresolved.length})</h3>
			</div>
			<div class="divide-y divide-base-300">
				{#each data.unresolved as item}<div class="p-4">
						<div class="font-semibold">{item.kelas} · {item.kode}</div>
						<div class="text-sm text-warning">Kurang {item.missing} JP</div>
						<p class="mt-1 text-xs opacity-60">{item.reason}</p>
					</div>{:else}<p class="p-8 text-center text-sm opacity-60">
						Semua kekurangan dapat diberi usulan slot.
					</p>{/each}
			</div>
		</aside>
	</div>
</div>
