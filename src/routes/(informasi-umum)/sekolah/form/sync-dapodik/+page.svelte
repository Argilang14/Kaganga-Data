<script lang="ts">
	import { resolve } from '$app/paths';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import type { DapodikApplyResult, DapodikPreview } from '$lib/server/dapodik';
	import type { DapodikNilaiPreview, DapodikNilaiSendResult } from '$lib/server/dapodik-nilai';

	let { data } = $props();
	let preview = $state<DapodikPreview | null>(null);
	let applied = $state<DapodikApplyResult | null>(null);
	let nilaiPreview = $state<DapodikNilaiPreview | null>(null);
	let nilaiSent = $state<DapodikNilaiSendResult | null>(null);

	const categoryLabels = {
		sekolah: 'Profil Sekolah',
		pegawai: 'Data Pegawai/PTK',
		kelas: 'Data Kelas/Rombel',
		murid: 'Data Murid',
		mapel: 'Mata Pelajaran',
		ekstrakurikuler: 'Ekstrakurikuler'
	} as const;

	function handleSuccess({ data: payload }: { data?: Record<string, unknown> }) {
		const operation = String(payload?.operation ?? '');
		if (operation === 'preview') {
			preview = payload?.preview as DapodikPreview;
			applied = null;
			nilaiPreview = null;
			nilaiSent = null;
		} else if (operation === 'apply') {
			applied = payload as unknown as DapodikApplyResult;
			preview = null;
		} else if (operation === 'preview-nilai') {
			nilaiPreview = payload?.nilaiPreview as DapodikNilaiPreview;
			nilaiSent = null;
			preview = null;
		} else if (operation === 'send-nilai') {
			nilaiSent = payload as unknown as DapodikNilaiSendResult;
			nilaiPreview = null;
		}
	}
</script>

<div class="mx-auto max-w-5xl space-y-4">
	<header class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold">Sinkronisasi Dapodik</h1>
			<p class="text-base-content/70 text-sm">
				Periksa data masuk dan nilai keluar melalui pratinjau terpisah sebelum diterapkan.
			</p>
		</div>
		<a class="btn btn-soft shadow-none" href={resolve('/sekolah/form')}>
			<Icon name="left" />
			Data Sekolah
		</a>
	</header>

	{#if data.blocked}
		<div class="alert alert-warning alert-soft">
			<Icon name="warning" />
			<span>{data.blocked}</span>
		</div>
	{:else}
		{#if data.integrated}
			<form method="GET" class="bg-base-100 rounded-lg p-4 shadow-md">
				<label class="block"
					><span class="mb-2 block font-semibold">Satuan Pendidikan</span><select
						class="select w-full"
						name="satuan_id"
						value={data.satuanId}
						onchange={(event) => event.currentTarget.form?.requestSubmit()}
						>{#each data.units as unit (unit.id)}<option value={unit.id}
								>{unit.jenjang.toUpperCase()} - {unit.nama} ({unit.npsn})</option
							>{/each}</select
					></label
				>
			</form>
			<div class="alert alert-warning">
				Konfigurasi dan pratinjau per satuan aktif. Penerapan data dan pengiriman nilai SRT belum
				diaktifkan.
			</div>
		{/if}
		{#key data.satuanId}
			<FormEnhance
				action="?/run"
				init={{
					url: data.settings?.url ?? '',
					npsn: data.settings?.npsn || data.npsn || '',
					semesterId: data.settings?.semesterId ?? ''
				}}
				onsuccess={handleSuccess}
			>
				{#snippet children({ submitting })}
					<input type="hidden" name="satuanId" value={data.satuanId || ''} />
					<section class="bg-base-100 rounded-lg p-4 shadow-md">
						<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
							<div class="fieldset md:col-span-2">
								<legend class="fieldset-legend">URL WebService Dapodik</legend>
								<input
									class="input bg-base-200 dark:bg-base-300 validator w-full dark:border-none"
									name="url"
									placeholder="Contoh: 192.168.1.10:5774"
									required
								/>
							</div>
							<div class="fieldset">
								<legend class="fieldset-legend">Token WebService</legend>
								<input
									class="input bg-base-200 dark:bg-base-300 validator w-full dark:border-none"
									type="password"
									name="token"
									placeholder={data.settings?.tokenSet
										? 'Token tersimpan; kosongkan untuk memakai token lama'
										: 'Masukkan token Dapodik'}
									required={!data.settings?.tokenSet}
									autocomplete="off"
								/>
							</div>
							<div class="fieldset">
								<legend class="fieldset-legend">NPSN</legend>
								<input
									class="input bg-base-200 dark:bg-base-300 validator w-full dark:border-none"
									name="npsn"
									readonly={data.integrated}
									required
								/>
							</div>
							<div class="fieldset md:col-span-2">
								<legend class="fieldset-legend">Semester Dapodik (opsional)</legend>
								<input
									class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
									name="semesterId"
									pattern="[0-9]{4}[12]"
									placeholder="Contoh: 20261; kosongkan untuk deteksi otomatis"
								/>
							</div>
						</div>
						<p class="text-base-content/65 mt-2 text-xs">
							Token disimpan di database lokal per sekolah. Jaga berkas backup dan jangan membagikan
							token kepada pihak yang tidak berwenang.
						</p>

						<div class="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
							<button class="btn btn-soft" name="operation" value="save" disabled={submitting}
								><Icon name="save" /> Simpan Konfigurasi</button
							>
							<button
								class="btn btn-soft btn-info shadow-none"
								name="operation"
								value="test"
								disabled={submitting}
							>
								<Icon name="dapodik" />
								Tes Koneksi
							</button>
							<button
								class="btn btn-primary shadow-none"
								name="operation"
								value="preview"
								disabled={submitting}
							>
								{#if submitting}<span class="loading loading-spinner"></span>{:else}<Icon
										name="eye"
									/>{/if}
								Buat Pratinjau
							</button>
							<button
								class="btn btn-soft btn-success shadow-none"
								name="operation"
								value="preview-nilai"
								disabled={submitting || data.integrated}
							>
								<Icon name="eye" />
								Pratinjau Nilai Keluar
							</button>
						</div>
					</section>

					{#if preview}
						<section class="bg-base-100 mt-4 rounded-lg p-4 shadow-md">
							<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
								<div>
									<h2 class="text-lg font-bold">Pratinjau {preview.sekolahNama}</h2>
									<p class="text-base-content/70 text-sm">
										{preview.tahunAjaran} · Semester {preview.semester} · ID {preview.semesterId}
									</p>
								</div>
								<span class="badge badge-success">Belum diterapkan</span>
							</div>

							<div class="overflow-x-auto rounded-md border border-base-300">
								<table class="table table-sm">
									<thead>
										<tr
											><th></th><th>Data</th><th>Sumber</th><th>Cocok</th><th>Baru</th><th
												>Dilewati</th
											></tr
										>
									</thead>
									<tbody>
										{#each Object.entries(preview.categories) as [key, item] (key)}
											<tr>
												<td
													><input
														class="checkbox checkbox-sm"
														type="checkbox"
														name="categories"
														value={key}
														checked
													/></td
												>
												<td class="font-semibold"
													>{categoryLabels[key as keyof typeof categoryLabels]}</td
												>
												<td>{item.source}</td><td>{item.matched}</td><td>{item.newItems}</td><td
													>{item.skipped}</td
												>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>

							{#if preview.mapelItems.length}
								<details class="mt-3 rounded-md border border-base-300" open>
									<summary class="cursor-pointer px-3 py-2 font-semibold">
										Pilih Mata Pelajaran ({preview.mapelItems.length} item)
									</summary>
									<div class="max-h-80 overflow-auto border-t border-base-300">
										<table class="table table-xs sm:table-sm">
											<thead class="bg-base-100 sticky top-0 z-10">
												<tr
													><th></th><th>Kelas</th><th>Mata Pelajaran</th><th>Guru</th><th>Status</th
													></tr
												>
											</thead>
											<tbody>
												{#each preview.mapelItems as item, index (`${item.key}-${index}`)}
													<tr>
														<td>
															<input
																class="checkbox checkbox-sm"
																type="checkbox"
																name="mapelItems"
																value={item.key}
																checked={item.status !== 'dilewati'}
																disabled={item.status === 'dilewati'}
															/>
														</td>
														<td>{item.kelas}</td>
														<td>
															<div class="font-medium">{item.nama}</div>
															{#if item.alasan}<div class="text-base-content/60 text-xs">
																	{item.alasan}
																</div>{/if}
														</td>
														<td>{item.guru ?? '-'}</td>
														<td>
															<span
																class:badge-success={item.status === 'cocok'}
																class:badge-info={item.status === 'baru'}
																class:badge-warning={item.status === 'dilewati'}
																class="badge badge-sm">{item.status}</span
															>
														</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
								</details>
							{/if}

							<div class="alert alert-info alert-soft mt-3">
								<Icon name="info" />
								<ul class="text-sm">
									{#each preview.warnings as warning (warning)}<li>{warning}</li>{/each}
								</ul>
							</div>
							<p class="text-base-content/65 mt-3 text-xs">
								Mata Pelajaran membutuhkan Data Kelas/Rombel. Ekstrakurikuler membutuhkan Data
								Kelas/Rombel dan Data Murid. Akun pengguna tidak dibuat otomatis.
							</p>

							<label class="mt-3 flex cursor-pointer items-center gap-3">
								<input class="checkbox" type="checkbox" name="activateSemester" value="yes" />
								<span>Jadikan semester Dapodik sebagai semester aktif setelah diterapkan</span>
							</label>
							<label class="mt-3 flex cursor-pointer items-start gap-3">
								<input class="checkbox" type="checkbox" name="confirmApply" value="yes" required />
								<span
									>Saya telah memeriksa pratinjau dan menyetujui kategori data yang dipilih.</span
								>
							</label>
							<div class="mt-4 flex justify-end">
								<button
									class="btn btn-success shadow-none"
									name="operation"
									value="apply"
									disabled={submitting || data.integrated}
								>
									{#if submitting}<span class="loading loading-spinner"></span>{:else}<Icon
											name="save"
										/>{/if}
									Terapkan Data
								</button>
							</div>
						</section>
					{/if}
					{#if nilaiPreview}
						<section class="bg-base-100 mt-4 rounded-lg p-4 shadow-md">
							<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
								<div>
									<h2 class="text-lg font-bold">Pratinjau Pengiriman Nilai</h2>
									<p class="text-base-content/70 text-sm">
										{nilaiPreview.tahunAjaran} · Semester {nilaiPreview.semester} · ID {nilaiPreview.semesterId}
									</p>
								</div>
								<span class="badge badge-warning">Belum dikirim</span>
							</div>

							<div class="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
								<div class="bg-base-200 rounded-md p-3">
									<div class="text-xs opacity-70">Kelas</div>
									<div class="text-xl font-bold">{nilaiPreview.summary.kelas}</div>
								</div>
								<div class="bg-base-200 rounded-md p-3">
									<div class="text-xs opacity-70">Mapel siap</div>
									<div class="text-xl font-bold">{nilaiPreview.summary.mapel}</div>
								</div>
								<div class="bg-base-200 rounded-md p-3">
									<div class="text-xs opacity-70">Nilai siap</div>
									<div class="text-xl font-bold">{nilaiPreview.summary.nilaiSiap}</div>
								</div>
								<div class="bg-base-200 rounded-md p-3">
									<div class="text-xs opacity-70">Mapel dilewati</div>
									<div class="text-xl font-bold">{nilaiPreview.summary.dilewati}</div>
								</div>
							</div>

							<div class="max-h-[28rem] overflow-auto rounded-md border border-base-300">
								<table class="table table-xs sm:table-sm">
									<thead class="bg-base-100 sticky top-0 z-10">
										<tr
											><th></th><th>Kelas</th><th>Mata Pelajaran</th><th>Nilai Siap</th><th
												>Belum Terikat</th
											><th>Nilai Kosong</th><th>Status</th></tr
										>
									</thead>
									<tbody>
										{#each nilaiPreview.items as item (item.key)}
											<tr>
												<td
													><input
														class="checkbox checkbox-sm"
														type="checkbox"
														name="nilaiItems"
														value={item.key}
														checked={item.status !== 'dilewati'}
														disabled={item.status === 'dilewati'}
													/></td
												>
												<td>{item.kelas}</td>
												<td
													><div class="font-medium">{item.mapel}</div>
													{#if item.alasan}<div class="text-base-content/60 text-xs">
															{item.alasan}
														</div>{/if}</td
												>
												<td>{item.nilaiSiap}/{item.totalMurid}</td>
												<td>{item.tanpaBinding}</td>
												<td>{item.nilaiKosong}</td>
												<td
													><span
														class:badge-success={item.status === 'siap'}
														class:badge-warning={item.status === 'sebagian'}
														class:badge-ghost={item.status === 'dilewati'}
														class="badge badge-sm">{item.status}</span
													></td
												>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>

							<div class="alert alert-warning alert-soft mt-3">
								<Icon name="warning" />
								<ul class="text-sm">
									{#each nilaiPreview.warnings as warning (warning)}<li>{warning}</li>{/each}
								</ul>
							</div>
							<label class="mt-3 flex cursor-pointer items-start gap-3">
								<input
									class="checkbox"
									type="checkbox"
									name="confirmSendNilai"
									value="yes"
									required
								/>
								<span
									>Saya telah memeriksa kelas, mata pelajaran, semester, dan jumlah nilai yang akan
									dikirim ke Dapodik.</span
								>
							</label>
							<div class="mt-4 flex justify-end">
								<button
									class="btn btn-success shadow-none"
									name="operation"
									value="send-nilai"
									disabled={submitting || nilaiPreview.summary.nilaiSiap === 0}
								>
									{#if submitting}<span class="loading loading-spinner"></span>{:else}<Icon
											name="dapodik"
										/>{/if}
									Kirim Nilai Terpilih
								</button>
							</div>
						</section>
					{/if}
				{/snippet}
			</FormEnhance>
		{/key}

		{#if applied}
			<section class="bg-base-100 rounded-lg p-4 shadow-md">
				<h2 class="mb-2 text-lg font-bold">Hasil Penerapan</h2>
				<div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
					{#each Object.entries(applied.results ?? {}) as [key, item] (key)}
						<div class="bg-base-200 rounded-md p-3">
							<div class="font-semibold">{categoryLabels[key as keyof typeof categoryLabels]}</div>
							<div class="text-sm">
								Baru {item.created} · Diperbarui {item.updated} · Dilewati {item.skipped}
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}
		{#if nilaiSent}
			<section class="bg-base-100 rounded-lg p-4 shadow-md">
				<h2 class="text-lg font-bold">Hasil Pengiriman Nilai</h2>
				<p class="mt-1">{nilaiSent.message}</p>
				<div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
					<div class="bg-base-200 rounded-md p-3">
						Matev terkirim <strong>{nilaiSent.matevSent}</strong>
					</div>
					<div class="bg-base-200 rounded-md p-3">
						Matev gagal <strong>{nilaiSent.matevFailed}</strong>
					</div>
					<div class="bg-base-200 rounded-md p-3">
						Nilai terkirim <strong>{nilaiSent.nilaiSent}</strong>
					</div>
					<div class="bg-base-200 rounded-md p-3">
						Nilai gagal <strong>{nilaiSent.nilaiFailed}</strong>
					</div>
				</div>
			</section>
		{/if}
	{/if}
</div>
