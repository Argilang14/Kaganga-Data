<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- href download data siswa memakai query dinamis */
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import type { PageData } from './$types';

	type TahunAjaranRow = typeof import('$lib/server/db/schema').tableTahunAjaran.$inferSelect;
	type SemesterRow = typeof import('$lib/server/db/schema').tableSemester.$inferSelect;
	type TahunAjaranWithSemester = TahunAjaranRow & { semester: SemesterRow[] };

	const { data } = $props<{ data: PageData }>();
	const sekolahList = $derived((data.sekolahList ?? []) as Sekolah[]);
	const tahunAjaranList = $derived((data.tahunAjaranList ?? []) as TahunAjaranWithSemester[]);
	let activeSekolahId = $state<number | null>(null);
	const activeTahunAjaranId = $derived(data.activeTahunAjaranId ?? null);
	const activeSemesterId = $derived(data.activeSemesterId ?? null);
	const tanggalBagiRaport = $derived.by(
		() =>
			data.tanggalBagiRaport as {
				ganjilId?: number;
				ganjil?: string | null;
				genapId?: number;
				genap?: string | null;
			}
	);

	let selectedSekolahId = $state('');
	let selectedTahunAjaranId = $state('');
	let selectedSemesterId = $state('');
	let tanggalRaporGanjil = $state('');
	let tanggalRaporGenap = $state('');

	let tahunAjaranOptions = $state<TahunAjaranWithSemester[]>([]);
	let formInitPengaturanOverride = $state<Record<string, string> | null>(null);
	let lastLoadedContextKey = $state('');
	const pageAcademicKey = $derived.by(() => {
		const tahunKey = tahunAjaranList
			.map(
				(tahun) =>
					`${tahun.id}:${tahun.isAktif}:${tahun.semester
						.map(
							(semester) => `${semester.id}:${semester.isAktif}:${semester.tanggalBagiRaport ?? ''}`
						)
						.join(',')}`
			)
			.join('|');
		return [
			data.activeSekolahId ?? '',
			activeTahunAjaranId ?? '',
			activeSemesterId ?? '',
			tanggalBagiRaport.ganjilId ?? '',
			tanggalBagiRaport.ganjil ?? '',
			tanggalBagiRaport.genapId ?? '',
			tanggalBagiRaport.genap ?? '',
			tahunKey
		].join('::');
	});
	const disabledSekolahActions = $derived(sekolahList.length === 0);
	$effect(() => {
		if (pageAcademicKey === lastLoadedContextKey) return;

		lastLoadedContextKey = pageAcademicKey;
		const nextSekolahId = data.activeSekolahId ?? null;
		activeSekolahId = nextSekolahId;
		selectedSekolahId = nextSekolahId ? String(nextSekolahId) : '';
		selectedTahunAjaranId = activeTahunAjaranId ? String(activeTahunAjaranId) : '';
		selectedSemesterId = activeSemesterId ? String(activeSemesterId) : '';
		tanggalRaporGanjil = tanggalBagiRaport.ganjil ?? '';
		tanggalRaporGenap = tanggalBagiRaport.genap ?? '';
		tahunAjaranOptions = tahunAjaranList;
		formInitPengaturanOverride = null;
	});

	let semesterOptions = $state<SemesterRow[]>([]);
	let semesterGanjil = $state<SemesterRow | null>(null);
	let semesterGenap = $state<SemesterRow | null>(null);
	let selectedSemesterRecord = $state<SemesterRow | null>(null);
	let disabledSave = $state(false);
	const disableTanggalInputs = $derived(!semesterGanjil && !semesterGenap);
	const disableTanggalGanjil = $derived(
		!semesterGanjil || selectedSemesterRecord?.tipe !== 'ganjil'
	);
	const disableTanggalGenap = $derived(!semesterGenap || selectedSemesterRecord?.tipe !== 'genap');
	const canCopySemester = $derived.by(() => {
		const target = selectedSemesterRecord;
		if (!target) return false;
		if (target.tipe !== 'genap') return false;
		return Boolean(semesterGanjil);
	});
	const copyButtonTooltip = $derived.by(() => {
		if (!selectedSemesterRecord) {
			return 'Pilih semester terlebih dahulu';
		}
		if (selectedSemesterRecord.tipe !== 'genap') {
			return 'Salin hanya tersedia saat semester genap dipilih';
		}
		if (!semesterGanjil) {
			return 'Semester ganjil belum tersedia untuk disalin';
		}
		return null;
	});

	$effect(() => {
		const tahunId = Number(selectedTahunAjaranId);
		const nextTahun =
			Number.isFinite(tahunId) && tahunId
				? (tahunAjaranOptions.find((item) => item.id === tahunId) ?? null)
				: null;

		const nextSemesterList = nextTahun?.semester ?? [];
		semesterOptions = nextSemesterList;

		if (!nextSemesterList.some((item) => String(item.id) === selectedSemesterId)) {
			const fallback =
				nextSemesterList.find((item) => item.isAktif) ?? nextSemesterList.at(0) ?? null;
			selectedSemesterId = fallback ? String(fallback.id) : '';
		}

		semesterGanjil = nextSemesterList.find((item) => item.tipe === 'ganjil') ?? null;
		semesterGenap = nextSemesterList.find((item) => item.tipe === 'genap') ?? null;
		selectedSemesterRecord =
			nextSemesterList.find((item) => String(item.id) === selectedSemesterId) ?? null;

		const noTahun = tahunAjaranOptions.length === 0;
		const noSemester = nextSemesterList.length === 0;
		const noTanggal = disableTanggalInputs;
		disabledSave = disabledSekolahActions || (noTahun && noSemester && noTanggal);
	});

	let prevGanjilId: number | null = null;
	$effect(() => {
		const currentId = semesterGanjil?.id ?? null;
		if (currentId !== prevGanjilId) {
			tanggalRaporGanjil = semesterGanjil?.tanggalBagiRaport ?? '';
			prevGanjilId = currentId;
		}
	});

	let prevGenapId: number | null = null;
	$effect(() => {
		const currentId = semesterGenap?.id ?? null;
		if (currentId !== prevGenapId) {
			tanggalRaporGenap = semesterGenap?.tanggalBagiRaport ?? '';
			prevGenapId = currentId;
		}
	});

	let formInitSekolah = $derived({
		sekolahId: activeSekolahId ? String(activeSekolahId) : ''
	});

	let formInitPengaturan = $derived.by<Record<string, string>>(
		() =>
			formInitPengaturanOverride ?? {
				tahunAjaranId: activeTahunAjaranId ? String(activeTahunAjaranId) : '',
				semesterId: activeSemesterId ? String(activeSemesterId) : '',
				'ganjil.id': tanggalBagiRaport.ganjilId ? String(tanggalBagiRaport.ganjilId) : '',
				'ganjil.tanggalBagiRaport': tanggalBagiRaport.ganjil ?? '',
				'genap.id': tanggalBagiRaport.genapId ? String(tanggalBagiRaport.genapId) : '',
				'genap.tanggalBagiRaport': tanggalBagiRaport.genap ?? ''
			}
	);

	type AcademicPayload = {
		tahunAjaranList?: TahunAjaranWithSemester[];
		activeSekolahId?: number;
		activeTahunAjaranId?: number | null;
		activeSemesterId?: number | null;
		tanggalBagiRaport?: {
			ganjilId?: number;
			ganjil?: string | null;
			genapId?: number;
			genap?: string | null;
		};
	};

	const applyAcademicContext = (data?: AcademicPayload) => {
		if (!data) return;

		if (data.tahunAjaranList) {
			tahunAjaranOptions = data.tahunAjaranList;
		}

		if (data.activeSekolahId !== undefined) {
			activeSekolahId = data.activeSekolahId ?? null;
			selectedSekolahId = data.activeSekolahId ? String(data.activeSekolahId) : '';
		}

		if ('activeTahunAjaranId' in data) {
			selectedTahunAjaranId = data.activeTahunAjaranId ? String(data.activeTahunAjaranId) : '';
		}

		if ('activeSemesterId' in data) {
			selectedSemesterId = data.activeSemesterId ? String(data.activeSemesterId) : '';
		}

		const rapor = data.tanggalBagiRaport ?? {
			ganjilId: formInitPengaturan['ganjil.id']
				? Number(formInitPengaturan['ganjil.id'])
				: undefined,
			ganjil: tanggalRaporGanjil || null,
			genapId: formInitPengaturan['genap.id'] ? Number(formInitPengaturan['genap.id']) : undefined,
			genap: tanggalRaporGenap || null
		};

		tanggalRaporGanjil = rapor.ganjil ?? '';
		tanggalRaporGenap = rapor.genap ?? '';

		formInitPengaturanOverride = {
			tahunAjaranId: selectedTahunAjaranId,
			semesterId: selectedSemesterId,
			'ganjil.id': rapor.ganjilId ? String(rapor.ganjilId) : '',
			'ganjil.tanggalBagiRaport': rapor.ganjil ?? '',
			'genap.id': rapor.genapId ? String(rapor.genapId) : '',
			'genap.tanggalBagiRaport': rapor.genap ?? ''
		};
	};

	const refreshAppContext = async () => {
		await invalidateAll();
	};

	const handleSwitchSuccess = async ({ data }: { data?: AcademicPayload }) => {
		applyAcademicContext(data);
		await refreshAppContext();
	};

	const handleSaveSuccess = async ({ data }: { data?: AcademicPayload }) => {
		applyAcademicContext(data);
		await refreshAppContext();
	};

	// permission runes (single permission for managing rapor)
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	let canRaporManage = $derived.by(() => {
		const perms = (page.data.user ?? { permissions: [] }).permissions ?? [];
		return page.data.user?.type === 'admin' || (perms as string[]).includes('rapor_manage');
	});

	// Check if selected school is different from active school
	let isSekolahChanged = $derived.by(() => {
		if (!activeSekolahId || !selectedSekolahId) return false;
		return String(activeSekolahId) !== selectedSekolahId;
	});

	const canSubmitSekolah = $derived(Boolean(selectedSekolahId) && !disabledSekolahActions);

	let downloadDataSiswaHref = $derived.by(() => {
		const params = new URLSearchParams();
		if (selectedSemesterId) params.set('semesterId', selectedSemesterId);
		return `/api/rapor/unduh-data-siswa${params.size ? `?${params.toString()}` : ''}`;
	});
</script>

<div class="grid grid-cols-1 gap-6">
	<section class="card bg-base-100 rounded-lg border border-none p-6 shadow-md">
		<div class="space-y-6">
			<header>
				<h1 class="text-2xl font-bold">Pengaturan Data Rapor</h1>
				<p class="text-base-content/70 text-sm">
					Kelola sekolah aktif, tahun ajaran, semester, dan tanggal bagi rapor.
				</p>
			</header>

			<fieldset class="fieldset">
				<legend class="fieldset-legend">Ganti sekolah</legend>
				<FormEnhance action="?/switch" init={formInitSekolah} onsuccess={handleSwitchSuccess}>
					{#snippet children({ submitting })}
						<div class="flex flex-row">
							<select
								class="select bg-base-200 dark:bg-base-300 w-full rounded-r-none dark:border-none"
								name="sekolahId"
								bind:value={selectedSekolahId}
								required
								disabled={disabledSekolahActions || submitting || !canRaporManage}
							>
								<option value="" disabled>Pilih Sekolah</option>
								{#if sekolahList.length === 0}
									<option disabled value="">Belum ada data sekolah</option>
								{:else}
									{#each sekolahList as item (item.id)}
										<option value={String(item.id)}>{item.nama}</option>
									{/each}
								{/if}
							</select>
							<button
								class="btn btn-primary rounded-l-none shadow-none"
								type="submit"
								disabled={submitting ||
									disabledSekolahActions ||
									!canRaporManage ||
									!canSubmitSekolah}
								aria-disabled={!canRaporManage || !canSubmitSekolah}
								title={!canRaporManage
									? 'Anda tidak memiliki izin untuk mengganti sekolah'
									: !canSubmitSekolah
										? 'Pilih sekolah terlebih dahulu'
										: ''}
							>
								<Icon name="repeat" />
								{submitting ? 'Menyimpan…' : isSekolahChanged ? 'Ganti' : 'Segarkan'}
							</button>
						</div>
					{/snippet}
				</FormEnhance>
				<p class="text-base-content/70 mt-1 text-xs">
					Operator dapat memilih sekolah aktif di sini.
				</p>
			</fieldset>

			<FormEnhance
				action="?/save"
				init={formInitPengaturan}
				onsuccess={handleSaveSuccess}
				enctype="multipart/form-data"
			>
				{#snippet children({ submitting, invalid })}
					<input
						type="hidden"
						name="ganjil.id"
						value={semesterGanjil
							? String(semesterGanjil.id)
							: (formInitPengaturan['ganjil.id'] ?? '')}
					/>
					<input
						type="hidden"
						name="genap.id"
						value={semesterGenap
							? String(semesterGenap.id)
							: (formInitPengaturan['genap.id'] ?? '')}
					/>
					<input type="hidden" name="targetSemesterId" value={selectedSemesterId} />
					<input
						type="hidden"
						name="sourceSemesterId"
						value={semesterGanjil ? String(semesterGanjil.id) : ''}
					/>
					<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
						<fieldset class="fieldset">
							<legend class="fieldset-legend">Tahun Ajaran</legend>
							<select
								class="select bg-base-200 dark:bg-base-300 w-full dark:border-none"
								name="tahunAjaranId"
								bind:value={selectedTahunAjaranId}
								required
								disabled={!canRaporManage}
							>
								<option value="" disabled>Pilih Tahun Ajaran</option>
								{#each tahunAjaranOptions as item (item.id)}
									<option value={String(item.id)}>
										{item.nama}
										{item.isAktif ? ' (aktif)' : ''}
									</option>
								{/each}
							</select>
						</fieldset>

						<fieldset class="fieldset">
							<legend class="fieldset-legend">Semester</legend>
							<select
								class="select bg-base-200 dark:bg-base-300 w-full dark:border-none"
								name="semesterId"
								bind:value={selectedSemesterId}
								required
								disabled={semesterOptions.length === 0 || !canRaporManage}
							>
								<option value="" disabled>Pilih Semester</option>
								{#each semesterOptions as item (item.id)}
									<option value={String(item.id)}>
										{item.nama}
										{item.isAktif ? ' (aktif)' : ''}
									</option>
								{/each}
							</select>
						</fieldset>

						<fieldset class="fieldset">
							<legend class="fieldset-legend">Tanggal bagi rapor semester ganjil</legend>
							{#if disableTanggalGanjil}
								<input type="hidden" name="ganjil.tanggalBagiRaport" value={tanggalRaporGanjil} />
							{/if}
							<input
								class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
								type="date"
								name="ganjil.tanggalBagiRaport"
								bind:value={tanggalRaporGanjil}
								disabled={disableTanggalGanjil || !canRaporManage}
							/>
							<p class="text-base-content/70 mt-2 text-xs">
								Tanggal ini akan muncul di catatan rapor semester ganjil.
							</p>
						</fieldset>

						<fieldset class="fieldset">
							<legend class="fieldset-legend">Tanggal bagi rapor semester genap</legend>
							{#if disableTanggalGenap}
								<input type="hidden" name="genap.tanggalBagiRaport" value={tanggalRaporGenap} />
							{/if}
							<input
								class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
								type="date"
								name="genap.tanggalBagiRaport"
								bind:value={tanggalRaporGenap}
								disabled={disableTanggalGenap || !canRaporManage}
							/>
							<p class="text-base-content/70 mt-2 text-xs">
								Tanggal ini akan muncul di catatan rapor semester genap.
							</p>
						</fieldset>

						<fieldset class="fieldset md:col-span-2">
							<legend class="fieldset-legend">Import data siswa dan kelas</legend>
							<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
								<input
									type="file"
									class="file-input file-input-ghost"
									accept=".xlsx, .xls"
									name="data"
									disabled={!canRaporManage}
									aria-disabled={!canRaporManage}
									title={!canRaporManage
										? 'Anda tidak memiliki izin untuk mengimpor data siswa'
										: ''}
								/>
								{#if canRaporManage}
									<a
										class="btn btn-soft shadow-none"
										href={resolve('/api/rapor/import-siswa-kelas-template')}
										download
									>
										<Icon name="download" />
										Download template
									</a>
								{:else}
									<button
										class="btn btn-soft shadow-none"
										type="button"
										disabled
										title="Anda tidak memiliki izin untuk mengunduh template"
									>
										<Icon name="download" />
										Download template
									</button>
								{/if}
							</div>
							<div class="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
								{#if canRaporManage}
									<a class="btn btn-soft shadow-none" href={downloadDataSiswaHref} download>
										<Icon name="download" />
										Unduh data siswa
									</a>
								{:else}
									<button
										class="btn btn-soft shadow-none"
										type="button"
										disabled
										title="Anda tidak memiliki izin untuk mengunduh data siswa"
									>
										<Icon name="download" />
										Unduh data siswa
									</button>
								{/if}
							</div>
							<p class="text-base-content/70 mt-1 text-xs">
								Gunakan template Excel atau file daftar siswa dari Dapodik. Kolom Nama, NIPD/NIS,
								dan Rombel wajib diisi.
							</p>
						</fieldset>
					</div>

					<div class="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-between">
						<button
							class="btn btn-soft shadow-none"
							type="submit"
							formaction="?/copy-semester"
							disabled={submitting || !canCopySemester || !canRaporManage}
							aria-disabled={!canRaporManage}
							title={!canRaporManage
								? 'Anda tidak memiliki izin untuk menyalin semester'
								: (copyButtonTooltip ?? undefined)}
						>
							<Icon name="copy" />
							Salin Semester Ganjil
						</button>
						<button
							class="btn btn-primary shadow-none"
							type="submit"
							disabled={submitting || invalid || disabledSave || !canRaporManage}
							aria-disabled={!canRaporManage}
							title={!canRaporManage
								? 'Anda tidak memiliki izin untuk menyimpan pengaturan rapor'
								: ''}
						>
							<Icon name="save" />
							{submitting ? 'Menyimpan…' : 'Simpan'}
						</button>
					</div>
				{/snippet}
			</FormEnhance>
		</div>
	</section>
</div>
