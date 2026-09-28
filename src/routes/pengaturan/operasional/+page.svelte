<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	let { data, form } = $props();
	const size = (value: number) => {
		if (!value) return '0 B';
		const units = ['B', 'KB', 'MB', 'GB', 'TB'];
		const unit = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
		return `${(value / 1024 ** unit).toFixed(unit > 1 ? 1 : 0)} ${units[unit]}`;
	};
	const when = (value: string | null | undefined) =>
		value ? new Date(value).toLocaleString('id-ID') : 'Belum pernah';
</script>

<div class="space-y-5">
	<header class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<h2 class="text-2xl font-bold">Operasional Sistem</h2>
			<p class="text-base-content/65 text-sm">
				Kesehatan database, penyimpanan, server utama, backup, dan sesi perangkat.
			</p>
		</div>
		<span
			class:badge-error={data.health.server.conflict}
			class:badge-success={!data.health.server.conflict}
			class="badge badge-lg"
			>{data.health.server.conflict ? 'Konflik server' : 'Server utama aktif'}</span
		>
	</header>
	{#if form?.message}<div class="alert alert-info">{form.message}</div>{/if}
	{#if data.health.server.conflict}<div class="alert alert-error">
			<Icon name="warning" /><span
				>Database ini juga aktif pada {data.health.server.conflictingMachine}. Hentikan salah satu
				server untuk mencegah dua produksi berjalan bersamaan.</span
			>
		</div>{/if}

	<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
		<div class="rounded-lg border border-base-300 bg-base-100 p-4 shadow-sm">
			<div class="text-sm opacity-60">Database</div>
			<div class="mt-1 text-xl font-bold">{size(data.health.database.size)}</div>
			<div class="mt-2 text-xs">
				Quick check: {data.health.database.quickCheck}<br />Foreign key: {data.health.database
					.foreignKeyIssues} masalah
			</div>
		</div>
		<div class="rounded-lg border border-base-300 bg-base-100 p-4 shadow-sm">
			<div class="text-sm opacity-60">Berkas media</div>
			<div class="mt-1 text-xl font-bold">{data.health.storage.fileCount} berkas</div>
			<div class="mt-2 text-xs">
				{size(data.health.storage.size)} · {data.health.storage.missingCount} hilang · {data.health
					.storage.orphanCount} yatim
			</div>
			<div class="mt-1 text-xs opacity-55">
				{data.health.storage.photoCount} foto · {data.health.storage.thumbnailCount} thumbnail
			</div>
		</div>
		<div class="rounded-lg border border-base-300 bg-base-100 p-4 shadow-sm">
			<div class="text-sm opacity-60">Ruang kosong</div>
			<div class="mt-1 text-xl font-bold">{size(data.health.storage.diskFree)}</div>
			<div class="mt-2 text-xs">Total media {size(data.health.storage.diskTotal)}</div>
		</div>
		<div class="rounded-lg border border-base-300 bg-base-100 p-4 shadow-sm">
			<div class="text-sm opacity-60">Backup terakhir</div>
			<div class="mt-1 text-base font-bold">{when(data.health.backup.lastAt)}</div>
			<div class="mt-2 text-xs">{data.health.backup.count} backup terdeteksi</div>
		</div>
	</div>

	<section class="rounded-lg border border-base-300 bg-base-100 p-5 shadow-sm">
		<div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
			<div>
				<h3 class="text-lg font-bold">Backup dan pembersihan</h3>
				<p class="text-sm opacity-65">
					Backup bertingkat disimpan di folder data server. Pembersihan hanya menghapus berkas
					yatim/sementara berumur lebih dari 7 hari.
				</p>
			</div>
			{#if data.isAdmin}<div class="flex flex-wrap gap-2">
					<form method="POST" action="?/backup" class="join">
						<select name="kind" class="select select-bordered join-item"
							><option value="daily">Harian</option><option value="weekly">Mingguan</option><option
								value="pre-update">Sebelum pembaruan</option
							><option value="manual">Manual</option></select
						><button class="btn btn-primary join-item" type="submit"
							><Icon name="save" /> Backup</button
						>
					</form>
					<form method="POST" action="?/cleanup">
						<button class="btn btn-outline" type="submit"><Icon name="del" /> Bersihkan aman</button
						>
					</form>
				</div>{/if}
		</div>
		<div class="mt-4 overflow-x-auto">
			<table class="table table-sm">
				<thead><tr><th>Jenis</th><th>Status</th><th>Ringkasan</th><th>Waktu</th></tr></thead><tbody
					>{#each data.runs as run}<tr
							><td>{run.type}</td><td><span class="badge badge-outline">{run.status}</span></td><td
								>{run.summary || '-'}</td
							><td>{when(run.finishedAt || run.startedAt)}</td></tr
						>{:else}<tr
							><td colspan="4" class="text-center opacity-60">Belum ada riwayat pemeliharaan.</td
							></tr
						>{/each}</tbody
				>
			</table>
		</div>
		{#if data.isAdmin}<form
				method="POST"
				action="?/record-test"
				class="mt-5 grid gap-3 border-t border-base-300 pt-5 lg:grid-cols-[190px_160px_1fr_auto]"
			>
				<select name="type" class="select select-bordered" aria-label="Jenis pengujian" required>
					<option value="restore_test">Uji pemulihan</option>
					<option value="update_test">Uji pembaruan</option>
				</select>
				<select name="status" class="select select-bordered" aria-label="Status pengujian" required>
					<option value="success">Berhasil</option>
					<option value="warning">Perlu perhatian</option>
					<option value="failed">Gagal</option>
				</select>
				<input
					name="summary"
					class="input input-bordered w-full"
					minlength="5"
					maxlength="500"
					placeholder="Catatan hasil uji dan versi yang diperiksa"
					required
				/>
				<button class="btn btn-primary" type="submit"><Icon name="save" /> Catat uji</button>
			</form>{/if}
	</section>

	<section class="rounded-lg border border-base-300 bg-base-100 p-5 shadow-sm">
		<div class="flex items-center justify-between gap-3">
			<div>
				<h3 class="text-lg font-bold">Sesi perangkat</h3>
				<p class="text-sm opacity-65">
					Keluarkan perangkat yang tidak dikenal tanpa mengganggu sesi yang sedang dipakai.
				</p>
			</div>
			<form method="POST" action="?/revoke-others">
				<button class="btn btn-error btn-soft" type="submit">Keluar dari perangkat lain</button>
			</form>
		</div>
		<div class="mt-4 overflow-x-auto">
			<table class="table">
				<thead
					><tr
						><th>Perangkat</th><th>Alamat</th><th>Terakhir aktif</th><th>Kedaluwarsa</th><th
						></th></tr
					></thead
				><tbody
					>{#each data.sessions as session}<tr
							><td
								><div class="max-w-md truncate">
									{session.userAgent || 'Perangkat tidak dikenal'}
								</div>
								{#if session.current}<span class="badge badge-success badge-sm">Saat ini</span
									>{/if}</td
							><td>{session.ipAddress || '-'}</td><td
								>{when(session.updatedAt || session.createdAt)}</td
							><td>{when(session.expiresAt)}</td><td
								>{#if !session.current}<form method="POST" action="?/revoke">
										<input type="hidden" name="sessionId" value={session.id} /><button
											class="btn btn-error btn-soft btn-sm"
											type="submit">Cabut</button
										>
									</form>{/if}</td
							></tr
						>{/each}</tbody
				>
			</table>
		</div>
	</section>

	<section class="rounded-lg border border-base-300 bg-base-100 p-5 shadow-sm">
		<h3 class="text-lg font-bold">Prosedur pemindahan server</h3>
		<ol class="mt-3 list-decimal space-y-2 pl-5 text-sm">
			<li>Buat backup jenis <strong>Sebelum pembaruan</strong> dan salin folder lampiran.</li>
			<li>Hentikan Kaganga pada server lama sebelum database dipindahkan.</li>
			<li>Pasang Kaganga pada perangkat baru, impor backup, lalu salin folder lampiran.</li>
			<li>
				Pastikan pemeriksaan database bernilai <strong>ok</strong> dan tidak ada lampiran hilang.
			</li>
			<li>
				Alihkan alamat LAN atau Cloudflare ke server baru. Client tidak perlu menyimpan salinan
				database.
			</li>
		</ol>
	</section>
</div>
