<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- application routes preserve the selected dormitory and period */
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { SubmitFunction } from '@sveltejs/kit';
	import {
		getIndikatorCategory,
		hitungNilaiIndikator,
		kategoriToRubrikValue
	} from '$lib/components/asesmen-keasramaan/utils';
	import type { loadDormEvaluation } from '$lib/server/dorm-evaluation';
	let {
		data,
		form
	}: {
		data: Awaited<ReturnType<typeof loadDormEvaluation>>;
		form?: { message?: string; fail?: string } | null;
	} = $props();
	let saving = $state(false);
	let search = $state('');
	let currentPage = $state(1);
	const filtered = $derived(
		data.students.filter((s) => s.nama.toLowerCase().includes(search.toLowerCase()))
	);
	const pageCount = $derived(Math.max(1, Math.ceil(filtered.length / 25)));
	const visibleStudents = $derived(
		filtered.slice(
			(Math.min(currentPage, pageCount) - 1) * 25,
			Math.min(currentPage, pageCount) * 25
		)
	);
	const student = $derived(
		data.students.find(
			(s) => s.penempatan_id === Number(page.url.searchParams.get('penempatan_id'))
		) ?? null
	);
	const evaluation = $derived(
		data.evaluations.find((e) => e.id === Number(page.url.searchParams.get('evaluasi_id'))) ??
			data.evaluations[0] ??
			null
	);
	const goals = $derived(data.goals.filter((t) => t.evaluasi_id === evaluation?.id));
	const selectedGrades = $derived(
		data.grades.filter((n) => n.penempatan_id === student?.penempatan_id)
	);
	const submit: SubmitFunction = () => {
		saving = true;
		return async ({ update }) => {
			try {
				await update();
			} finally {
				saving = false;
			}
		};
	};
	function href(values: Record<string, string | number>) {
		const params = new URLSearchParams(page.url.search);
		params.delete('kelas_id');
		for (const [k, v] of Object.entries(values)) params.set(k, String(v));
		return `${page.url.pathname}?${params}`;
	}
	function score(placement: number, evaluationId: number) {
		const groups = new Map<string, number[]>();
		for (const t of data.goals.filter((t) => t.evaluasi_id === evaluationId)) {
			const n = data.grades.find((n) => n.penempatan_id === placement && n.tujuan_id === t.id);
			if (n)
				groups.set(t.indikator, [
					...(groups.get(t.indikator) ?? []),
					kategoriToRubrikValue(n.kategori)
				]);
		}
		return hitungNilaiIndikator([...groups.values()].map((v) => hitungNilaiIndikator(v)));
	}
</script>

{#snippet contextFields()}
	<input type="hidden" name="kamar_id" value={data.room?.id ?? 0} />
	<input type="hidden" name="semester_id" value={data.period?.id ?? 0} />
{/snippet}

<div class="min-w-0 space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-xl font-bold">{data.meta.title}</h1>
			<p class="text-base-content/70 mt-1 text-sm">
				{data.room
					? `${data.room.asrama} / ${data.room.nama}`
					: 'Pilih asrama untuk menampilkan data.'} · {data.period?.nama ?? 'Belum ada periode'}
				{data.period?.tahun ?? ''}
			</p>
		</div>
		{#if data.room}<span class="badge badge-outline"
				>Wali asrama: {data.room.wali ?? 'Belum ditugaskan'}</span
			>{/if}
	</div>
	{#if page.url.searchParams.get('galat')}<div class="alert alert-error" role="alert">
			{page.url.searchParams.get('galat')}
		</div>{:else if page.url.searchParams.get('pesan')}<div
			class="alert alert-success"
			role="status"
		>
			{page.url.searchParams.get('pesan')}
		</div>{/if}
	{#if form?.fail}<div class="alert alert-error" role="alert">
			{form.fail}
		</div>{:else if form?.message}<div class="alert alert-success" role="status">
			{form.message}
		</div>{/if}
	{#if data.missingCaregivers > 0}<div class="alert alert-warning alert-soft">
			<span
				>{data.missingCaregivers} murid aktif belum terhubung dengan wali asuh. Pilih pegawai Wali Asuh
				melalui detail murid agar anak muncul pada akun pembinanya.</span
			>
		</div>{/if}
	<form
		method="GET"
		class="bg-base-100 rounded-box border-base-300 flex flex-wrap items-end gap-4 border p-4"
	>
		{#if data.mode === 'print'}<input type="hidden" name="bagian" value="asrama" />{/if}<label
			class="fieldset min-w-0 basis-full sm:flex-1 sm:basis-52"
			><span class="fieldset-legend">Asrama</span><select
				name="kamar_id"
				class="select w-full"
				value={data.room?.id ?? 0}
				><option value="0">Pilih asrama</option>{#each data.rooms as r (r.id)}<option value={r.id}
						>{r.asrama === r.nama ? r.nama : `${r.asrama} / ${r.nama}`}</option
					>{/each}</select
			></label
		>
		<label class="fieldset min-w-0 basis-full sm:flex-1 sm:basis-52"
			><span class="fieldset-legend">Periode penilaian</span><select
				name="semester_id"
				class="select w-full"
				value={data.period?.id ?? 0}
				>{#each data.periods as p (p.id)}<option value={p.id}
						>{p.nama} {p.tahun}{p.aktif ? ' · aktif' : ''}</option
					>{/each}</select
			></label
		>
		<label class="label mb-2 cursor-pointer gap-2"
			><input
				class="checkbox checkbox-sm"
				type="checkbox"
				name="riwayat"
				value="1"
				checked={data.history}
			/>Termasuk riwayat penghuni</label
		>
		<button class="btn" type="submit">Tampilkan</button>
	</form>
	{#if data.history || !data.period?.aktif}<p class="text-base-content/70 text-sm" role="status">
			Riwayat hanya dapat dibaca. Pilih periode aktif dan matikan riwayat untuk mengisi data
			penghuni saat ini.
		</p>{/if}
	{#if !data.room}
		<div class="bg-base-100 rounded-box border-base-300 border p-6">
			<h2 class="font-semibold">Asrama belum dipilih</h2>
			<p class="text-base-content/70 mt-2 text-sm">
				Pilih asrama di atas atau melalui Pindah Asrama. Wali asuh hanya mendapat pilihan asrama
				yang memiliki anak binaannya.
			</p>
			<a class="btn btn-sm mt-4" href="/murid/asrama">Data Murid Asrama</a>
		</div>
	{:else if data.mode === 'master'}
		{#if data.canMaster}<form
				method="POST"
				use:enhance={submit}
				class="bg-base-100 rounded-box border-base-300 flex flex-wrap items-end gap-4 border p-4"
			>
				{@render contextFields()}<input type="hidden" name="operation" value="master" />
				<label class="fieldset min-w-0 flex-1"
					><span class="fieldset-legend">Mata evaluasi baru</span><input
						class="input w-full"
						name="nama"
						maxlength="200"
						required
					/></label
				><button class="btn btn-primary" disabled={saving}>Tambah mata evaluasi</button>
			</form>{/if}
		{#each data.evaluations as e (e.id)}
			<section class="bg-base-100 rounded-box border-base-300 space-y-4 border p-4">
				<div class="flex flex-wrap items-center justify-between gap-4">
					<h2 class="font-semibold">{e.nama}</h2>
					{#if data.canMaster}<details>
							<summary class="cursor-pointer text-sm">Ubah mata evaluasi</summary>
							<form method="POST" use:enhance={submit} class="mt-2 flex flex-wrap gap-2">
								{@render contextFields()}<input
									type="hidden"
									name="evaluasi_id"
									value={e.id}
								/><label class="fieldset"
									><span class="fieldset-legend">Nama mata evaluasi</span><input
										class="input"
										name="nama"
										value={e.nama}
										required
										maxlength="200"
									/></label
								><button class="btn self-end" name="operation" value="edit-master"
									>Simpan nama</button
								><button
									class="btn btn-outline btn-error self-end"
									name="operation"
									value="delete-master"
									formnovalidate>Hapus yang belum dinilai</button
								>
							</form>
						</details>{/if}
				</div>
				<div class="overflow-x-auto">
					<table class="table">
						<thead><tr><th>Indikator</th><th>Tujuan penilaian</th></tr></thead><tbody
							>{#each data.goals.filter((t) => t.evaluasi_id === e.id) as t (t.id)}<tr
									><td class="align-top whitespace-normal">{t.indikator}</td><td
										class="whitespace-normal"
										>{t.deskripsi}{#if data.canMaster}<details class="mt-2">
												<summary class="cursor-pointer text-sm">Ubah tujuan</summary>
												<form method="POST" use:enhance={submit} class="mt-2 space-y-2">
													{@render contextFields()}<input
														type="hidden"
														name="tujuan_id"
														value={t.id}
													/><label class="fieldset"
														><span class="fieldset-legend">Indikator</span><input
															class="input w-full"
															name="indikator"
															value={t.indikator}
															maxlength="500"
															required
														/></label
													><label class="fieldset"
														><span class="fieldset-legend">Tujuan</span><textarea
															class="textarea w-full"
															name="deskripsi"
															maxlength="2000"
															required>{t.deskripsi}</textarea
														></label
													><button class="btn btn-sm" name="operation" value="edit-goal"
														>Simpan tujuan</button
													>
													<button
														class="btn btn-sm btn-outline btn-error"
														name="operation"
														value="delete-goal"
														formnovalidate>Hapus yang belum dinilai</button
													>
												</form>
											</details>{/if}</td
									></tr
								>{:else}<tr
									><td colspan="2">Belum ada tujuan. Tambahkan indikator dan tujuan di bawah.</td
									></tr
								>{/each}</tbody
						>
					</table>
				</div>
				{#if data.canMaster}<form
						method="POST"
						use:enhance={submit}
						class="grid gap-4 md:grid-cols-2"
					>
						{@render contextFields()}<input type="hidden" name="operation" value="goal" /><input
							type="hidden"
							name="evaluasi_id"
							value={e.id}
						/><label class="fieldset"
							><span class="fieldset-legend">Indikator</span><input
								class="input w-full"
								name="indikator"
								maxlength="500"
								required
							/></label
						><label class="fieldset"
							><span class="fieldset-legend">Tujuan penilaian</span><textarea
								class="textarea w-full"
								name="deskripsi"
								maxlength="2000"
								required></textarea></label
						><button class="btn w-fit" disabled={saving}>Tambah tujuan</button>
					</form>{/if}
			</section>
		{:else}<p class="text-base-content/70">
				Belum ada mata evaluasi untuk asrama dan periode ini.
			</p>{/each}
		{#if data.canMaster}<details class="bg-base-100 rounded-box border-base-300 border p-4">
				<summary class="cursor-pointer font-semibold">Impor mata evaluasi dari Excel</summary><a
					class="btn btn-sm mt-4"
					href={`/api/keasramaan/export?kamar_id=${data.room.id}&semester_id=${data.period?.id ?? 0}`}
					>Unduh template mata evaluasi</a
				>
				<form
					method="POST"
					action="/api/asesmen-keasramaan/import-massal"
					enctype="multipart/form-data"
					class="mt-4 flex flex-wrap items-end gap-4"
				>
					{@render contextFields()}<input type="hidden" name="jenis" value="master" /><label
						class="fieldset"
						><span class="fieldset-legend">Berkas Excel: Mata evaluasi, Indikator, Tujuan</span
						><input type="file" name="file" class="file-input" accept=".xlsx" required /></label
					><button class="btn">Impor mata evaluasi</button>
				</form>
			</details>{/if}
	{:else}
		<div class="flex flex-wrap items-end justify-between gap-4">
			<label class="fieldset w-full sm:max-w-sm"
				><span class="fieldset-legend">Cari anak</span><input
					class="input w-full"
					type="search"
					bind:value={search}
					oninput={() => (currentPage = 1)}
					placeholder="Nama anak"
				/></label
			>
			{#if data.mode === 'input' || data.mode === 'recap'}<div class="flex flex-wrap gap-2">
					<a
						class="btn btn-sm"
						href={`/api/asesmen-keasramaan/download-template-massal?kamar_id=${data.room.id}&semester_id=${data.period?.id ?? 0}${data.history ? '&riwayat=1' : ''}`}
						>Unduh Excel</a
					>{#if data.canGrade}<a class="btn btn-sm" href="#impor-nilai">Impor nilai</a>{/if}
				</div>{/if}
		</div>
		<div
			class="bg-base-100 rounded-box border-base-300 max-w-full overflow-x-auto border"
			tabindex="0"
			role="region"
			aria-label="Daftar penilaian asrama"
		>
			<table class="table">
				<caption class="sr-only">Daftar penghuni dan penilaian keasramaan</caption><thead
					><tr
						><th>Anak</th><th>Wali asuh</th>{#if data.mode === 'notes'}<th>Catatan</th
							>{:else}{#each data.evaluations as e (e.id)}<th class="whitespace-normal">{e.nama}</th
								>{/each}{/if}<th>Aksi</th></tr
					></thead
				><tbody>
					{#each visibleStudents as s (s.penempatan_id)}<tr
							><td class="min-w-44"
								><div class="font-medium">{s.nama}</div>
								<div class="text-base-content/60 text-xs">
									NISN {s.nisn || 'belum diisi'}{s.selesai ? ` · Riwayat sampai ${s.selesai}` : ''}
								</div></td
							><td class="whitespace-normal">{s.wali_asuh_nama ?? 'Belum ditugaskan'}</td>
							{#if data.mode === 'notes'}<td class="min-w-64 whitespace-pre-wrap"
									>{data.notes.find((n) => n.penempatan_id === s.penempatan_id)?.catatan ??
										'Belum ada catatan'}</td
								>{:else}{#each data.evaluations as e (e.id)}{@const value = score(
										s.penempatan_id,
										e.id
									)}<td>{value?.toFixed(2) ?? '–'} {getIndikatorCategory(value)?.huruf ?? ''}</td
									>{/each}{/if}
							<td
								><a class="btn btn-ghost btn-sm" href={href({ penempatan_id: s.penempatan_id })}
									>{data.mode === 'input' && data.canGrade && !s.selesai
										? 'Nilai'
										: data.mode === 'notes' && data.canNote && !s.selesai
											? 'Isi catatan'
											: 'Lihat'}</a
								></td
							></tr
						>
					{:else}<tr
							><td
								colspan={data.mode === 'notes' ? 4 : data.evaluations.length + 3}
								class="py-8 whitespace-normal"
								>{search
									? 'Nama anak tidak ditemukan. Ubah pencarian.'
									: 'Belum ada penghuni yang sesuai penugasan. Periksa penempatan dan wali asuh anak.'}</td
							></tr
						>{/each}
				</tbody>
			</table>
		</div>
		<div class="flex flex-wrap items-center justify-between gap-4 text-sm">
			<span
				>{filtered.length} anak · Halaman {Math.min(currentPage, pageCount)} dari {pageCount}</span
			>
			<div class="join">
				<button
					class="btn btn-sm join-item"
					type="button"
					disabled={currentPage <= 1}
					onclick={() => (currentPage = Math.max(1, currentPage - 1))}>Sebelumnya</button
				><button
					class="btn btn-sm join-item"
					type="button"
					disabled={currentPage >= pageCount}
					onclick={() => (currentPage = Math.min(pageCount, currentPage + 1))}>Berikutnya</button
				>
			</div>
		</div>
		{#if student}<section
				class="bg-base-100 rounded-box border-base-300 space-y-4 border p-4"
				aria-label={`Penilaian ${student.nama}`}
			>
				<h2 class="font-semibold">{student.nama}</h2>
				{#if data.mode === 'notes'}<form method="POST" use:enhance={submit}>
						{@render contextFields()}<input type="hidden" name="operation" value="note" /><input
							type="hidden"
							name="penempatan_id"
							value={student.penempatan_id}
						/><label class="fieldset"
							><span class="fieldset-legend">Catatan Wali Asrama</span><textarea
								class="textarea min-h-32 w-full"
								name="catatan"
								maxlength="5000"
								disabled={!data.canNote || !!student.selesai}
								value={data.notes.find((n) => n.penempatan_id === student.penempatan_id)?.catatan ??
									''}></textarea></label
						>{#if data.canNote && !student.selesai}<button
								class="btn btn-primary mt-4"
								disabled={saving}>Simpan catatan</button
							>{/if}
					</form>
				{:else}
					<nav class="flex flex-wrap gap-2" aria-label="Mata evaluasi anak">
						{#each data.evaluations as e (e.id)}<a
								class="btn btn-sm"
								class:btn-active={e.id === evaluation?.id}
								href={href({ evaluasi_id: e.id })}>{e.nama}</a
							>{/each}
					</nav>
					{#if evaluation}<form method="POST" use:enhance={submit}>
							{@render contextFields()}<input type="hidden" name="operation" value="grade" /><input
								type="hidden"
								name="penempatan_id"
								value={student.penempatan_id}
							/>
							<h3 class="mb-4 font-medium">{evaluation.nama}</h3>
							<div class="space-y-4">
								{#each goals as t (t.id)}<label class="fieldset"
										><span class="fieldset-legend whitespace-normal">{t.indikator}</span><span
											class="mb-2 text-sm">{t.deskripsi}</span
										><select
											class="select w-full sm:max-w-sm"
											name={`nilai_${t.id}`}
											disabled={!data.canGrade || !!student.selesai}
											value={selectedGrades.find((n) => n.tujuan_id === t.id)?.kategori ?? ''}
											><option value="">Belum dinilai</option><option value="sangat-baik"
												>A · Sangat baik (4)</option
											><option value="baik">B · Baik (3)</option><option value="cukup"
												>C · Cukup (2)</option
											><option value="perlu-bimbingan">D · Perlu bimbingan (1)</option></select
										></label
									>{:else}<p>Tujuan penilaian belum tersedia. Hubungi pengelola asrama.</p>{/each}
							</div>
							{#if data.canGrade && !student.selesai && goals.length}<button
									class="btn btn-primary mt-4"
									disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan nilai'}</button
								>{/if}
						</form>{/if}
					{#if data.mode === 'recap' || data.mode === 'print'}<a
							class="btn"
							href={`/cetak/keasramaan.pdf?murid_id=${student.id}&penempatan_id=${student.penempatan_id}&semester_id=${data.period?.id ?? 0}`}
							>Unduh rapor asrama</a
						>{/if}
				{/if}
			</section>{/if}
		{#if data.canGrade}<section
				id="impor-nilai"
				class="bg-base-100 rounded-box border-base-300 border p-4"
			>
				<h2 class="font-semibold">Impor nilai anak binaan</h2>
				<p class="text-base-content/70 mt-2 text-sm">
					Gunakan Excel yang diunduh untuk asrama dan periode ini. Baris anak di luar penugasan
					membatalkan seluruh impor.
				</p>
				<form
					method="POST"
					action="/api/asesmen-keasramaan/import-massal"
					enctype="multipart/form-data"
					class="mt-4 flex flex-wrap items-end gap-4"
				>
					{@render contextFields()}<label class="fieldset"
						><span class="fieldset-legend">Berkas nilai</span><input
							type="file"
							name="file"
							class="file-input"
							accept=".xlsx"
							required
						/></label
					><button class="btn">Impor nilai</button>
				</form>
			</section>{/if}
	{/if}
	{#if data.wide && data.legacy.length}<details
			class="bg-base-100 rounded-box border-base-300 space-y-4 border p-4"
		>
			<summary class="cursor-pointer font-semibold">Data lama berbasis kelas</summary>
			<p class="text-base-content/70 text-sm">
				Nilai lama tetap tersimpan pada kelas asal. Salin hanya susunan mata evaluasi setelah
				memeriksa asrama tujuan; nilai lama tidak ikut dipindahkan.
			</p>
			{#if data.canMaster}<form
					method="POST"
					use:enhance={submit}
					class="flex flex-wrap items-end gap-4"
				>
					{@render contextFields()}<input
						type="hidden"
						name="operation"
						value="copy-legacy"
					/><label class="fieldset min-w-0 flex-1"
						><span class="fieldset-legend">Mata evaluasi sumber</span><select
							name="sumber_lama_id"
							class="select w-full"
							required
							>{#each data.legacy as l (l.id)}<option value={l.id}
									>{l.kelas} · {l.periode} · {l.nama} ({l.jumlah} nilai)</option
								>{/each}</select
						></label
					><button class="btn" disabled={saving}>Salin susunan ke asrama ini</button>
				</form>{/if}
			<a class="btn btn-sm" href={href({ riwayat_kelas: 1 })}
				>Lihat nilai lama (maksimal 500 baris)</a
			>
			{#if data.legacyGrades.length}<div class="overflow-x-auto">
					<table class="table table-sm">
						<thead
							><tr
								><th>Anak</th><th>Kelas asal</th><th>Mata evaluasi</th><th>Tujuan</th><th>Nilai</th
								></tr
							></thead
						><tbody
							>{#each data.legacyGrades as l, i (i)}<tr
									><td>{l.nama}</td><td>{l.kelas}</td><td>{l.matev}</td><td
										class="whitespace-normal">{l.indikator}: {l.tujuan}</td
									><td>{l.kategori}</td></tr
								>{/each}</tbody
						>
					</table>
				</div>{/if}
		</details>{/if}
</div>
