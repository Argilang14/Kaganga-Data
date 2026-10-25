<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';

	let { data } = $props();
	let anggotaDialog = $state<HTMLDialogElement | null>(null);
	let addingMember = $state(false);
	function settingsFormValues() {
		return {
			periodeMulai: data.settings?.periodeMulai ?? '',
			periodeSelesai: data.settings?.periodeSelesai ?? '',
			nomorSk: data.settings?.nomorSk ?? '',
			tanggalSk: data.settings?.tanggalSk ?? '',
			lokasiPenetapan: data.settings?.lokasiPenetapan ?? '',
			nomorUrutSttmBerikutnya: data.settings?.nomorUrutSttmBerikutnya ?? 1,
			formatNomorSttm: data.settings?.formatNomorSttm ?? '{urut}/STTM/SR/{bulan_romawi}/{tahun}'
		};
	}
	let settingsValues = $derived(settingsFormValues());
	const today = new Date().toISOString().slice(0, 10);
	function changeYear(event: Event) {
		const id = (event.currentTarget as HTMLSelectElement).value;
		goto(resolve(`/martikulasi/pengaturan?tahun_ajaran_id=${id}`));
	}
	const refresh = () => invalidate('app:martikulasi-settings');
</script>

<svelte:head><title>Pengaturan Martikulasi</title></svelte:head>

<div class="martikulasi-page space-y-4">
	<header class="martikulasi-header">
		<div>
			<h1 class="text-xl font-bold">Pengaturan Martikulasi</h1>
			<p class="text-base-content/65 text-sm">
				Periode, tim, serta nomor SK dan STTM per tahun ajaran.
			</p>
		</div>
		<label class="form-control w-full sm:w-64">
			<span class="label-text mb-1">Tahun Ajaran</span>
			<select
				class="select select-bordered"
				value={data.selectedTahun?.id ?? ''}
				onchange={changeYear}
				disabled={!data.tahunAjaranList.length}
			>
				{#each data.tahunAjaranList as tahun (tahun.id)}
					<option value={tahun.id}>{tahun.nama}</option>
				{/each}
			</select>
		</label>
	</header>

	{#if !data.selectedTahun}
		<div class="alert alert-warning">Tambahkan tahun ajaran terlebih dahulu.</div>
	{:else}
		<section class="martikulasi-section" aria-labelledby="settings-title">
			<div class="martikulasi-section-heading">
				<div class="flex min-w-0 items-center gap-3">
					<span class="martikulasi-section-icon bg-info/10 text-info"><Icon name="calendar" /></span
					>
					<h2 id="settings-title" class="font-semibold">Periode dan Penomoran</h2>
				</div>
				<span class="badge badge-soft">{data.selectedTahun.nama}</span>
			</div>
			<FormEnhance action="?/simpan" onsuccess={refresh} id="martikulasi-settings-form">
				{#snippet children({ submitting })}
					<input type="hidden" name="tahunAjaranId" value={data.selectedTahun.id} />
					<div class="martikulasi-form-body">
						<fieldset class="martikulasi-fieldset">
							<legend>Periode Pelaksanaan</legend>
							<div class="martikulasi-period-grid">
								<label class="form-control"
									><span class="label-text">Periode Mulai</span><input
										class="input input-bordered"
										type="date"
										name="periodeMulai"
										bind:value={settingsValues.periodeMulai}
									/></label
								>
								<label class="form-control"
									><span class="label-text">Periode Selesai</span><input
										class="input input-bordered"
										type="date"
										name="periodeSelesai"
										bind:value={settingsValues.periodeSelesai}
									/></label
								>
							</div>
						</fieldset>
						<fieldset class="martikulasi-fieldset">
							<legend>Dokumen SK dan STTM</legend>
							<div class="martikulasi-document-grid">
								<label class="form-control"
									><span class="label-text">Nomor SK</span><input
										class="input input-bordered"
										name="nomorSk"
										bind:value={settingsValues.nomorSk}
										placeholder="Contoh: 421.3/001/SR/2026"
									/></label
								>
								<label class="form-control"
									><span class="label-text">Tanggal SK</span><input
										class="input input-bordered"
										type="date"
										name="tanggalSk"
										bind:value={settingsValues.tanggalSk}
									/></label
								>
								<label class="form-control"
									><span class="label-text">Tempat Penetapan</span><input
										class="input input-bordered"
										name="lokasiPenetapan"
										bind:value={settingsValues.lokasiPenetapan}
									/></label
								>
								<label class="form-control"
									><span class="label-text">Nomor Urut STTM Berikutnya</span><input
										class="input input-bordered"
										type="number"
										min="1"
										name="nomorUrutSttmBerikutnya"
										bind:value={settingsValues.nomorUrutSttmBerikutnya}
									/></label
								>
								<label class="form-control martikulasi-full-field"
									><span class="label-text">Format Nomor STTM</span><input
										class="input input-bordered font-mono"
										name="formatNomorSttm"
										required
										aria-describedby="sttm-tokens"
										bind:value={settingsValues.formatNomorSttm}
									/><span id="sttm-tokens" class="text-base-content/60 text-xs break-words"
										>Token: {'{urut}'}, {'{tahun}'}, {'{bulan_romawi}'}, {'{tahun_ajaran}'}, {'{nis}'}</span
									></label
								>
							</div>
						</fieldset>
					</div>
					<div class="martikulasi-form-actions">
						<button
							class="btn btn-primary shadow-none"
							type="submit"
							disabled={submitting || !data.canManage}
							aria-disabled={submitting || !data.canManage}
							aria-busy={submitting}
							>{#if submitting}<span class="loading loading-spinner loading-sm"></span>{:else}<Icon
									name="save"
								/>{/if}Simpan Pengaturan</button
						>
					</div>
				{/snippet}
			</FormEnhance>
		</section>

		<section class="martikulasi-section" aria-labelledby="team-title">
			<div class="martikulasi-section-heading">
				<div class="flex min-w-0 flex-wrap items-center gap-3">
					<span class="martikulasi-section-icon bg-success/10 text-success"
						><Icon name="users" /></span
					>
					<h2 id="team-title" class="font-semibold">Tim Martikulasi</h2>
					<span class="badge badge-soft badge-success"
						>{data.settings?.tim.length ?? 0} anggota</span
					>
				</div>
				<button
					type="button"
					class="btn btn-soft shadow-none"
					disabled={!data.settings || !data.canManage}
					aria-disabled={!data.settings || !data.canManage}
					onclick={() => anggotaDialog?.showModal()}><Icon name="plus" />Tambah Anggota</button
				>
			</div>
			{#if !data.settings}<div class="martikulasi-team-notice text-base-content/65 text-sm">
					Simpan pengaturan terlebih dahulu sebelum menambahkan anggota tim.
				</div>{/if}
			<!-- Keyboard access to horizontal table scrolling. -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div
				class="martikulasi-table-scroll"
				role="region"
				aria-label="Daftar tim martikulasi"
				tabindex="0"
			>
				<table class="martikulasi-table table">
					<colgroup
						><col class="martikulasi-col-no" /><col class="martikulasi-col-name" /><col
							class="martikulasi-col-role"
						/><col /><col class="martikulasi-col-action" /></colgroup
					>
					<thead
						><tr
							><th scope="col">No</th><th scope="col">Nama / NIP</th><th scope="col">Jabatan Tim</th
							><th scope="col">Uraian Tugas</th><th scope="col" class="text-right">Aksi</th></tr
						></thead
					>
					<tbody>
						{#each data.settings?.tim ?? [] as anggota, index (anggota.id)}
							<tr
								><td class="text-base-content/65">{index + 1}</td><td
									><div class="font-semibold">{anggota.namaSnapshot}</div>
									<div class="text-base-content/60 mt-1 text-xs">
										NIP {anggota.nipSnapshot || '-'}
									</div></td
								><td>{anggota.jabatanTim}</td><td class="whitespace-pre-line"
									>{anggota.tugas || '-'}</td
								><td class="text-right"
									><FormEnhance action="?/hapusTim" onsuccess={refresh}
										>{#snippet children({ submitting })}<input
												type="hidden"
												name="id"
												value={anggota.id}
											/><button
												class="btn btn-error btn-soft btn-sm btn-square martikulasi-delete shadow-none"
												type="submit"
												disabled={submitting || !data.canManage}
												aria-disabled={submitting || !data.canManage}
												aria-label={`Hapus ${anggota.namaSnapshot} dari tim`}
												title={`Hapus ${anggota.namaSnapshot} dari tim`}
												onclick={(event) => {
													if (
														!confirm(
															`Hapus ${anggota.namaSnapshot} dari tim martikulasi? Data pegawai tetap disimpan.`
														)
													)
														event.preventDefault();
												}}
												>{#if submitting}<span class="loading loading-spinner loading-xs"
													></span>{:else}<Icon name="del" />{/if}</button
											>{/snippet}</FormEnhance
									></td
								></tr
							>
						{:else}
							<tr
								><td colspan="5" class="martikulasi-empty text-center text-base-content/60"
									><Icon name="users" class="mx-auto mb-2 size-6" /><span
										>Belum ada anggota tim.</span
									></td
								></tr
							>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<section class="martikulasi-section" aria-labelledby="issue-title">
			<div class="martikulasi-section-heading">
				<div class="flex min-w-0 items-center gap-3">
					<span class="martikulasi-section-icon bg-warning/10 text-warning"
						><Icon name="print" /></span
					>
					<h2 id="issue-title" class="font-semibold">Penerbitan Nomor STTM</h2>
				</div>
				<span class="badge badge-soft badge-warning"
					>{data.hasilLengkapBelumBernomor} siap diterbitkan</span
				>
			</div>
			<FormEnhance action="?/terbitkanSttm" onsuccess={refresh} id="martikulasi-issue-form">
				{#snippet children({ submitting })}
					<input type="hidden" name="tahunAjaranId" value={data.selectedTahun.id} />
					<div class="martikulasi-issue-body">
						<p class="text-base-content/65 text-sm">
							Nomor hanya diberikan kepada hasil yang lengkap dan belum bernomor. Cetak ulang tidak
							membuat nomor baru.
						</p>
						<div class="martikulasi-issue-controls">
							<label class="form-control w-full sm:w-64"
								><span class="label-text">Tanggal STTM</span><input
									class="input input-bordered"
									type="date"
									name="tanggalSttm"
									value={today}
									required
								/></label
							><button
								class="btn btn-soft shadow-none"
								type="submit"
								disabled={submitting || !data.canManage || !data.hasilLengkapBelumBernomor}
								aria-disabled={submitting || !data.canManage || !data.hasilLengkapBelumBernomor}
								aria-busy={submitting}
								>{#if submitting}<span class="loading loading-spinner loading-sm"
									></span>{:else}<Icon name="print" />{/if}Terbitkan {data.hasilLengkapBelumBernomor}
								Nomor</button
							>
						</div>
						{#if !data.hasilLengkapBelumBernomor}<p
								class="text-base-content/60 text-xs"
								role="status"
							>
								Belum ada hasil lengkap yang memerlukan nomor STTM.
							</p>{/if}
						{#if !data.canManage}<p class="text-base-content/60 text-xs" role="status">
								Akun ini hanya dapat melihat pengaturan.
							</p>{/if}
					</div>
				{/snippet}
			</FormEnhance>
		</section>

		<dialog
			class="modal app-modal martikulasi-modal"
			aria-labelledby="member-title"
			bind:this={anggotaDialog}
			oncancel={(event) => {
				if (addingMember) event.preventDefault();
			}}
		>
			<div class="modal-box app-modal-box">
				<h2 id="member-title" class="app-modal-title">Tambah Anggota Tim</h2>
				<p class="text-base-content/65 mt-1 text-sm">{data.selectedTahun.nama}</p>
				{#if data.settings}
					<FormEnhance
						action="?/tambahTim"
						class="flex min-h-0 flex-1 flex-col overflow-hidden"
						id="martikulasi-member-form"
						submitStateChange={(value) => (addingMember = value)}
						onsuccess={({ form }) => {
							form.reset();
							anggotaDialog?.close();
							void refresh();
						}}
					>
						{#snippet children({ submitting })}
							<input type="hidden" name="settingsId" value={data.settings?.id ?? ''} />
							<div class="app-modal-body martikulasi-member-grid">
								<label class="form-control martikulasi-full-field"
									><span class="label-text">Pegawai</span><select
										class="select select-bordered"
										name="pegawaiId"
										required
										><option value="">Pilih pegawai</option
										>{#each data.pegawaiList as pegawai (pegawai.id)}<option value={pegawai.id}
												>{pegawai.nama} - {pegawai.jabatan || pegawai.jenis}</option
											>{/each}</select
									></label
								>
								<label class="form-control"
									><span class="label-text">Jabatan dalam Tim</span><input
										class="input input-bordered"
										name="jabatanTim"
										required
										placeholder="Koordinator Akademik"
									/></label
								>
								<label class="form-control"
									><span class="label-text">Urutan</span><input
										class="input input-bordered"
										type="number"
										name="urutan"
										value="0"
									/></label
								>
								<label class="form-control martikulasi-full-field"
									><span class="label-text">Uraian Tugas</span><textarea
										class="textarea textarea-bordered"
										name="tugas"
										rows="3"></textarea></label
								>
							</div>
							<div class="modal-action app-modal-actions">
								<button
									class="btn shadow-none"
									type="button"
									disabled={submitting}
									onclick={() => anggotaDialog?.close()}>Batal</button
								><button
									class="btn btn-soft shadow-none"
									type="submit"
									disabled={submitting || !data.canManage}
									aria-disabled={submitting || !data.canManage}
									aria-busy={submitting}
									>{#if submitting}<span class="loading loading-spinner loading-sm"
										></span>{:else}<Icon name="plus" />{/if}Tambah Anggota</button
								>
							</div>
						{/snippet}
					</FormEnhance>
				{/if}
			</div>
			<form method="dialog" class="modal-backdrop">
				<button disabled={addingMember}>Tutup</button>
			</form>
		</dialog>
	{/if}
</div>

<style>
	.martikulasi-page {
		min-width: 0;
	}
	.martikulasi-header,
	.martikulasi-section {
		min-width: 0;
		border: 1px solid var(--color-base-200);
		border-radius: var(--app-radius);
		background: var(--color-base-100);
		box-shadow: 0 1px 3px #0000000d;
	}
	.martikulasi-header {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem;
	}
	.martikulasi-header > div {
		flex: 1 1 20rem;
		min-width: 0;
	}
	.martikulasi-section {
		overflow: hidden;
	}
	.martikulasi-section-heading {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		min-height: 4rem;
		padding: 1rem;
		border-bottom: 1px solid var(--color-base-200);
	}
	.martikulasi-section-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		flex-shrink: 0;
		border-radius: var(--app-radius);
	}
	.martikulasi-form-body {
		display: grid;
		gap: 1.25rem;
		padding: 1rem;
	}
	.martikulasi-fieldset {
		min-width: 0;
	}
	.martikulasi-fieldset legend {
		margin-bottom: 0.75rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: color-mix(in oklab, var(--color-base-content) 75%, transparent);
	}
	.martikulasi-period-grid,
	.martikulasi-document-grid,
	.martikulasi-member-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
	}
	.martikulasi-document-grid {
		grid-template-columns: repeat(4, minmax(0, 1fr));
		align-items: end;
	}
	.martikulasi-full-field {
		grid-column: 1 / -1;
	}
	.martikulasi-form-actions {
		display: flex;
		justify-content: end;
		padding: 1rem;
		border-top: 1px solid var(--color-base-200);
	}
	.martikulasi-team-notice {
		padding: 1rem;
	}
	.martikulasi-table-scroll {
		width: 100%;
		overflow-x: auto;
		overscroll-behavior-x: contain;
	}
	.martikulasi-table {
		width: 100%;
		min-width: 760px;
		table-layout: fixed;
	}
	.martikulasi-col-no {
		width: 56px;
	}
	.martikulasi-col-name {
		width: 28%;
	}
	.martikulasi-col-role {
		width: 23%;
	}
	.martikulasi-col-action {
		width: 72px;
	}
	.martikulasi-table th {
		background: var(--color-base-200);
		color: var(--color-base-content);
		font-weight: 600;
	}
	.martikulasi-table th,
	.martikulasi-table td {
		padding: 0.75rem 1rem;
		vertical-align: middle;
		overflow-wrap: anywhere;
	}
	.martikulasi-table tbody tr:hover {
		background: color-mix(in oklab, var(--color-base-200) 45%, transparent);
	}
	.martikulasi-table .martikulasi-empty {
		padding: 2rem 1rem;
	}
	.martikulasi-table:has(.martikulasi-empty) {
		min-width: 0;
	}
	.martikulasi-delete {
		width: 2rem;
		min-width: 2rem;
		height: 2rem;
		min-height: 2rem;
		padding: 0;
	}
	.martikulasi-delete :global(svg) {
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
	}
	.martikulasi-issue-body {
		display: grid;
		gap: 1rem;
		padding: 1rem;
	}
	.martikulasi-issue-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.75rem;
	}
	.martikulasi-modal .app-modal-box {
		--app-modal-width: 42rem;
	}
	.martikulasi-page .btn {
		min-height: 2.5rem;
		font-size: 0.875rem;
	}
	.martikulasi-page .martikulasi-delete {
		min-height: 2rem;
	}
	.martikulasi-table-scroll:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: -2px;
	}
	.form-control {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 0.5rem;
	}
	.label-text {
		margin: 0;
		font-size: 0.875rem;
		color: var(--color-base-content);
		white-space: normal;
	}

	.form-control > :is(input, select, textarea) {
		width: 100%;
		min-width: 0;
	}
	.form-control > :is(input, select) {
		height: 2.5rem;
		min-height: 2.5rem;
		font-size: 0.875rem;
	}
	@media (max-width: 1279px) {
		.martikulasi-document-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 639px) {
		.martikulasi-table:has(.martikulasi-empty) thead {
			display: none;
		}
		.martikulasi-period-grid,
		.martikulasi-document-grid,
		.martikulasi-member-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.martikulasi-header > label {
			width: 100%;
		}
		.martikulasi-form-actions > .btn,
		.martikulasi-issue-controls > .btn {
			width: 100%;
		}
		.martikulasi-section-heading > .btn {
			width: 100%;
		}
		.martikulasi-modal .app-modal-actions {
			gap: 0.5rem;
		}
		.martikulasi-modal .app-modal-actions .btn {
			flex: 1 1 auto;
		}
	}
</style>
