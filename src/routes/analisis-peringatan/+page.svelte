<script lang="ts">
	let { data } = $props();
	const date = (value: unknown) =>
		value ? new Date(String(value)).toLocaleDateString('id-ID') : '-';
</script>

<div class="space-y-5">
	<header>
		<h2 class="text-2xl font-bold">Analisis dan Peringatan Dini</h2>
		<p class="text-base-content/65 text-sm">
			Daftar bukti untuk ditinjau guru atau pimpinan. Indikator ini tidak mengambil keputusan
			otomatis.
		</p>
	</header>
	<div class="alert alert-warning">
		Data perlu dibaca bersama konteks murid, kelas, dan kebijakan sekolah sebelum ditindaklanjuti.
	</div>
	<section id="absensi" class="rounded-lg border border-base-300 bg-base-100 p-5 shadow-sm">
		<h3 class="text-lg font-bold">Alfa atau terlambat berulang</h3>
		<p class="text-sm opacity-60">Sedikitnya 3 catatan dalam 30 hari terakhir.</p>
		<div class="mt-3 overflow-x-auto">
			<table class="table table-sm">
				<thead><tr><th>Nama</th><th>Kelas</th><th>Alfa</th><th>Terlambat</th></tr></thead><tbody
					>{#each data.attendance as row}<tr
							><td>{row.nama}</td><td>{row.kelas || '-'}</td><td>{row.alfa}</td><td
								>{row.terlambat}</td
							></tr
						>{:else}<tr><td colspan="4" class="text-center opacity-60">Tidak ada indikator.</td></tr
						>{/each}</tbody
				>
			</table>
		</div>
	</section>
	<section id="nilai" class="rounded-lg border border-base-300 bg-base-100 p-5 shadow-sm">
		<h3 class="text-lg font-bold">Indikasi penurunan nilai</h3>
		<p class="text-sm opacity-60">Nilai akhir turun minimal 5 poin dari nilai tengah semester.</p>
		<div class="mt-3 overflow-x-auto">
			<table class="table table-sm">
				<thead
					><tr><th>Nama</th><th>Kelas</th><th>Mata pelajaran</th><th>Awal</th><th>Akhir</th></tr
					></thead
				><tbody
					>{#each data.scores as row}<tr
							><td>{row.nama}</td><td>{row.kelas || '-'}</td><td>{row.mata_pelajaran || '-'}</td><td
								>{row.nilai_awal}</td
							><td>{row.nilai_akhir}</td></tr
						>{:else}<tr><td colspan="5" class="text-center opacity-60">Tidak ada indikator.</td></tr
						>{/each}</tbody
				>
			</table>
		</div>
	</section>
	<section id="keasramaan" class="rounded-lg border border-base-300 bg-base-100 p-5 shadow-sm">
		<h3 class="text-lg font-bold">Keasramaan belum terisi</h3>
		<div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
			{#each data.dorm as row}<div class="rounded-md border border-base-300 p-3">
					<strong>{row.nama}</strong>
					<div class="text-sm opacity-60">{row.kelas || '-'}</div>
				</div>{:else}<p class="opacity-60">Semua murid sudah memiliki catatan.</p>{/each}
		</div>
	</section>
	<section id="jp" class="rounded-lg border border-base-300 bg-base-100 p-5 shadow-sm">
		<h3 class="text-lg font-bold">Target JP belum tercapai</h3>
		<div class="mt-3 overflow-x-auto">
			<table class="table table-sm">
				<thead
					><tr><th>Kelas</th><th>Jenis</th><th>Mapel</th><th>Terisi</th><th>Target</th></tr></thead
				><tbody
					>{#each data.jp as row}<tr
							><td>{row.kelas}</td><td>{row.jenis}</td><td>{row.kode} · {row.mata_pelajaran}</td><td
								>{row.terisi_jp}</td
							><td>{row.target_jp}</td></tr
						>{:else}<tr
							><td colspan="5" class="text-center opacity-60"
								>Semua target yang diatur telah tercapai.</td
							></tr
						>{/each}</tbody
				>
			</table>
		</div>
	</section>
	<section id="berkas" class="rounded-lg border border-base-300 bg-base-100 p-5 shadow-sm">
		<h3 class="text-lg font-bold">Berkas mendekati kedaluwarsa</h3>
		<div class="mt-3 overflow-x-auto">
			<table class="table table-sm">
				<thead><tr><th>Pemilik</th><th>Kategori</th><th>Berkas</th><th>Kedaluwarsa</th></tr></thead
				><tbody
					>{#each data.documents as row}<tr
							><td>{row.entity_label_snapshot}</td><td>{row.category}</td><td
								>{row.original_name}</td
							><td>{date(row.expires_at)}</td></tr
						>{:else}<tr
							><td colspan="4" class="text-center opacity-60"
								>Tidak ada berkas yang berakhir dalam 30 hari.</td
							></tr
						>{/each}</tbody
				>
			</table>
		</div>
	</section>
	<p class="text-xs opacity-45">
		Dihitung pada {new Date(data.generatedAt).toLocaleString('id-ID')} dari data sekolah aktif.
	</p>
</div>
