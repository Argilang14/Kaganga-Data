<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- small goto call used for form navigation */
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import {
		agamaMapelNames,
		agamaParentName,
		pksMapelNames,
		pksParentName,
		jenisMapel
	} from '$lib/statics';

	const AGAMA_MAPEL_NAME_SET = new Set<string>(agamaMapelNames);
	const PKS_MAPEL_NAME_SET = new Set<string>(pksMapelNames);

	type KelasLite = {
		id?: number;
		nama?: string;
		fase?: string | null;
	};

	type FormMapel = {
		id?: number;
		nama?: string;
		jenis?: MataPelajaran['jenis'];
		kkm?: number | null;
		kode?: string | null;
		jadwalMapelId?: number | null;
		guruPegawaiId?: number | null;
		kelas?: KelasLite | null;
	} & Record<string, unknown>;

	type MasterMapelOption = {
		id: number;
		kode: string;
		nama: string;
		jenjang: string;
		fase?: string | null;
		kategori: string;
		guru?: { nama?: string | null } | null;
	};

	type FormData = {
		mode?: 'add' | 'edit';
		mapel?: FormMapel | null;
		kelasAktif?: KelasLite | null;
		masterMapelOptions?: MasterMapelOption[];
	} & Record<string, unknown>;

	let { data }: { data: FormData } = $props();
	const mode = $derived<'add' | 'edit'>(data?.mode === 'edit' ? 'edit' : 'add');
	const mapel = $derived(data?.mapel ?? null);
	const kelasAktif = $derived(data?.kelasAktif ?? mapel?.kelas ?? null);
	const masterMapelOptions = $derived(data?.masterMapelOptions ?? []);
	const kelasAktifLabel = $derived(
		kelasAktif
			? kelasAktif.fase
				? `${kelasAktif.nama} - ${kelasAktif.fase}`
				: kelasAktif.nama
			: 'Belum ada kelas aktif'
	);
	const isAgamaGroup = $derived(!!mapel?.nama && AGAMA_MAPEL_NAME_SET.has(mapel.nama));
	const isAgamaParent = $derived(!!mapel?.nama && mapel.nama === agamaParentName);
	const isPksGroup = $derived(!!mapel?.nama && PKS_MAPEL_NAME_SET.has(mapel.nama));
	const isPksParent = $derived(!!mapel?.nama && mapel.nama === pksParentName);
	const disableNama = $derived(!kelasAktif || (mode === 'edit' && (isAgamaGroup || isPksGroup)));
	const disableJenis = $derived(!kelasAktif || (mode === 'edit' && isAgamaGroup));
	const formAction = $derived(mode === 'edit' ? '?/update' : '?/add');
	const invalidateTargets = $derived(
		mode === 'edit'
			? ['app:mapel', 'app:mapel_tp-rl', 'app:asesmen-formatif']
			: ['app:mapel', 'app:asesmen-formatif']
	);
	const formInit = $derived(
		mode === 'edit' && mapel
			? {
					nama: mapel.nama,
					kkm: mapel.kkm ?? '',
					jenis: mapel.jenis,
					kode: mapel.kode ?? '',
					jadwalMapelId: mapel.jadwalMapelId ?? ''
				}
			: undefined
	);
	let localKode = $state('');

	$effect(() => {
		if (!localKode) localKode = mapel?.kode ?? '';
		if (mode === 'edit' && isAgamaGroup) localKode = 'PAPB';
		if (mode === 'edit' && isPksGroup) localKode = 'PKS';
	});

	// Dapatkan jenjang varian dari sekolah (misalnya 'SMK')
	const jenjangVariant = $derived.by(() => {
		const sekolah = page.data.sekolah as { jenjangVariant?: string | null } | null | undefined;
		return sekolah?.jenjangVariant ?? null;
	});

	// Fungsi untuk mendapatkan label jenis mapel yang dinamis berdasarkan jenjang
	function getJenisMapelLabel(jenis: string): string {
		if (jenis === 'wajib' && jenjangVariant?.toUpperCase() === 'SMK') {
			return 'Mata Pelajaran Umum';
		}
		return jenisMapel[jenis as MataPelajaran['jenis']] ?? jenis;
	}

	// Derive displayable jenis mapel options
	const displayJenisMapel = $derived.by(() => {
		const result: Record<string, string> = {};
		for (const key of Object.keys(jenisMapel)) {
			// Sembunyikan opsi "kejuruan" jika bukan SMK
			if (key === 'kejuruan' && jenjangVariant?.toUpperCase() !== 'SMK') {
				continue;
			}
			result[key] = getJenisMapelLabel(key);
		}
		return result;
	});

	function onNamaInput(e: Event) {
		const v = ((e.target as HTMLInputElement)?.value ?? '').trim();
		if (AGAMA_MAPEL_NAME_SET.has(v)) {
			localKode = 'PAPB';
		} else if (PKS_MAPEL_NAME_SET.has(v)) {
			localKode = 'PKS';
		} else if (mode !== 'edit') {
			if (localKode === 'PAPB' || localKode === 'PKS') localKode = '';
		}
	}
	const heading = $derived(mode === 'edit' ? 'Edit Mata Pelajaran' : 'Tambah Mata Pelajaran');
	const namaPlaceholder = $derived(
		mode === 'edit' && isAgamaParent
			? 'Pendidikan Agama dan Budi Pekerti'
			: 'Contoh: Ilmu Pengetahuan Alam dan Sosial'
	);
</script>

<FormEnhance
	action={formAction}
	init={formInit}
	onsuccess={async () => {
		await Promise.all(invalidateTargets.map((token) => invalidate(token)));
		if (typeof window !== 'undefined' && window.history?.state?.modal) {
			history.back();
		} else {
			await goto('/intrakurikuler', { replaceState: true });
		}
	}}
>
	{#snippet children({ submitting, invalid })}
		<p class="mb-2 text-xl font-bold">{heading}</p>
		{#if !kelasAktif}
			<div
				class="alert bg-warning/10 border-warning text-warning-content mb-4 flex items-center gap-2 border border-dashed"
			>
				<Icon name="info" />
				<span
					>Pilih kelas di navbar sebelum {mode === 'edit' ? 'mengubah' : 'menambah'} mata pelajaran.</span
				>
			</div>
		{/if}
		{#if mode === 'edit'}
			<input name="id" value={mapel?.id ?? ''} hidden />
		{/if}
		{#if mode === 'edit' && disableNama}
			<input name="nama" value={mapel?.nama ?? ''} hidden />
		{/if}
		{#if mode === 'edit' && disableJenis}
			<input name="jenis" value={mapel?.jenis ?? ''} hidden />
		{/if}
		<p class="text-base-content/70 mb-4 text-sm">Kelas aktif: {kelasAktifLabel}</p>
		<fieldset class="fieldset">
			<legend class="fieldset-legend">Data Mata Pelajaran</legend>
			<select
				class="select bg-base-200 w-full dark:border-none"
				name="jadwalMapelId"
				disabled={!kelasAktif || masterMapelOptions.length === 0}
			>
				<option value="">Pilih dari Data Mata Pelajaran</option>
				{#each masterMapelOptions as option (option.id)}
					<option value={option.id} selected={mapel?.jadwalMapelId === option.id}>
						{option.kode} - {option.nama}
					</option>
				{/each}
			</select>
			<p class="label text-wrap">
				Jika dipilih, nama, kode, dan guru pengampu mengikuti master mapel. Kolom manual tetap bisa
				dipakai untuk data lama.
			</p>
		</fieldset>
		<fieldset class="fieldset">
			<legend class="fieldset-legend">Nama Mata Pelajaran</legend>
			<input
				type="text"
				class="input validator bg-base-200 w-full dark:border-none"
				placeholder={namaPlaceholder}
				name="nama"
				disabled={disableNama}
				value={mapel?.nama ?? ''}
				oninput={onNamaInput}
			/>
			<p class="label text-wrap">
				Nama mata pelajaran jangan disingkat. Boleh dikosongkan jika memilih Data Mata Pelajaran.
			</p>
		</fieldset>
		<fieldset class="fieldset">
			<legend class="fieldset-legend">KKM</legend>
			<input
				type="number"
				class="input validator bg-base-200 w-full dark:border-none"
				placeholder="Contoh: 76"
				name="kkm"
				required
				disabled={!kelasAktif}
				min="0"
			/>
		</fieldset>
		<fieldset class="fieldset">
			<legend class="fieldset-legend">Kode</legend>
			<input
				type="text"
				class="input validator bg-base-200 w-full dark:border-none"
				placeholder="Contoh: PAPB"
				name="kode"
				bind:value={localKode}
				disabled={isAgamaGroup || isPksGroup ? true : !kelasAktif}
			/>
			<p class="label text-wrap">Singkatan/kode singkat untuk mata pelajaran (opsional).</p>
		</fieldset>
		<fieldset class="fieldset">
			<legend class="fieldset-legend">Jenis Mata Pelajaran</legend>
			<select
				class="select bg-base-200 w-full dark:border-none"
				name="jenis"
				required
				disabled={disableJenis}
			>
				<option disabled selected>Pilih Jenis Mata Pelajaran</option>
				{#each Object.entries(displayJenisMapel) as [value, label] (value)}
					<option {value}>{label}</option>
				{/each}
			</select>
		</fieldset>
		{#if mode === 'edit' && isAgamaParent}
			<p class="text-base-content/70 mt-2 text-sm">
				Perubahan KKM akan diterapkan ke semua varian mata pelajaran Pendidikan Agama dan Budi
				Pekerti.
			</p>
		{/if}
		{#if mode === 'edit' && isPksParent}
			<p class="text-base-content/70 mt-2 text-sm">
				Perubahan KKM dan jenis akan diterapkan ke semua varian mata pelajaran Pendalaman Kitab
				Suci.
			</p>
		{/if}
		<div class="mt-6 flex justify-between gap-2">
			<button type="button" class="btn btn-soft shadow-none" onclick={() => history.back()}>
				<Icon name="close-sm" />
				Batal
			</button>
			<button
				type="submit"
				class="btn btn-primary shadow-none"
				disabled={submitting || invalid || !kelasAktif}
			>
				{#if submitting}
					<div class="loading loading-spinner"></div>
				{:else}
					<Icon name="save" />
				{/if}
				Simpan
			</button>
		</div>
	{/snippet}
</FormEnhance>
