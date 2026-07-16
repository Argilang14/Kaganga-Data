<script lang="ts">
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import { setLoading } from '$lib/components/global-modal.svelte';

	interface TujuanPembelajaranItem {
		id: number;
		deskripsi: string;
		lingkupMateri: string;
		mataPelajaranId: number;
	}

	interface MataPelajaranItem {
		id: number;
		nama: string;
		kode: string | null;
	}

	interface EditData {
		id: number;
		kelasId: number;
		mataPelajaranId: number;
		lingkupMateri: string;
		tujuanPembelajaranId: number | null;
		tujuanPembelajaranManual: string;
		catatan: string;
	}

	interface Props {
		editData: EditData | null;
		tanggal?: string;
		kelasId?: number;
		mapelId?: number | null;
		mataPelajaranList: MataPelajaranItem[];
		tujuanPembelajaranList: TujuanPembelajaranItem[];
		lingkupMateriList: string[];
		userType: string;
		onAction?: (actions: { submit: () => void }) => void;
		onSuccess?: (params: { data?: Record<string, unknown> }) => void | Promise<void>;
	}

	let {
		editData,
		tanggal,
		kelasId,
		mapelId,
		mataPelajaranList,
		tujuanPembelajaranList,
		onAction,
		onSuccess
	}: Props = $props();

	type TujuanMode = 'data' | 'manual';

	const defaultKelasId = $derived(editData?.kelasId ?? kelasId ?? 0);
	const defaultMapelId = $derived(editData?.mataPelajaranId ?? mapelId ?? 0);

	let formKelasId = $state(defaultKelasId);
	let formMapelId = $state(defaultMapelId);
	let formLingkupMateri = $state(editData?.lingkupMateri ?? '');
	let formTujuanPembelajaranId = $state(editData?.tujuanPembelajaranId ?? null);
	let formTujuanPembelajaranManual = $state(editData?.tujuanPembelajaranManual ?? '');
	let formCatatan = $state(editData?.catatan ?? '');
	let tujuanMode = $state<TujuanMode>(editData?.tujuanPembelajaranManual ? 'manual' : 'data');

	const formId = 'tambah-jurnal-form';

	const filteredLingkupMateri = $derived.by(() => {
		const values = new Set<string>();
		for (const tp of tujuanPembelajaranList) {
			if (formMapelId && tp.mataPelajaranId === formMapelId && tp.lingkupMateri) {
				values.add(tp.lingkupMateri);
			}
		}
		return Array.from(values).sort();
	});

	const filteredTujuanPembelajaran = $derived.by(() =>
		tujuanPembelajaranList.filter(
			(tp) => tp.lingkupMateri === formLingkupMateri && tp.mataPelajaranId === formMapelId
		)
	);

	function setTujuanMode(mode: TujuanMode) {
		tujuanMode = mode;
		if (mode === 'data') {
			formTujuanPembelajaranManual = '';
		} else {
			formTujuanPembelajaranId = null;
		}
	}

	function handleSuccess({ data }: { form: HTMLFormElement; data?: Record<string, unknown> }) {
		void onSuccess?.({ data });
	}

	$effect(() => {
		onAction?.({
			submit: () => (document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit()
		});
	});

	$effect(() => {
		if (tujuanMode === 'data' && formTujuanPembelajaranId) {
			const valid = filteredTujuanPembelajaran.some((tp) => tp.id === formTujuanPembelajaranId);
			if (!valid) formTujuanPembelajaranId = null;
		}
	});
</script>

<FormEnhance action="?/save" id={formId} onsuccess={handleSuccess} submitStateChange={setLoading}>
	{#snippet children()}
		<input type="hidden" name="id" value={editData?.id ?? ''} />
		<input type="hidden" name="kelasId" value={formKelasId} />
		<input type="hidden" name="tanggal" value={tanggal ?? ''} />

		{#if mataPelajaranList.length > 0}
			<fieldset class="fieldset">
				<legend class="fieldset-legend">Mata Pelajaran</legend>
				<select
					class="select bg-base-200 dark:bg-base-300 w-full dark:border-none"
					name="mataPelajaranId"
					value={formMapelId}
					onchange={(e) => {
						formMapelId = Number(e.currentTarget.value);
						formLingkupMateri = '';
						formTujuanPembelajaranId = null;
						formTujuanPembelajaranManual = '';
					}}
					required
				>
					<option value="" disabled>Pilih Mata Pelajaran</option>
					{#each mataPelajaranList as mp}
						<option value={mp.id}>{mp.nama}</option>
					{/each}
				</select>
			</fieldset>
		{/if}

		<fieldset class="fieldset">
			<legend class="fieldset-legend">Lingkup Materi</legend>
			<input
				class="input bg-base-200 dark:bg-base-300 w-full dark:border-none"
				name="lingkupMateri"
				list="lingkup-materi-options"
				value={formLingkupMateri}
				oninput={(e) => {
					formLingkupMateri = e.currentTarget.value;
				}}
				maxlength="500"
				placeholder="Pilih atau tulis lingkup materi"
				required
			/>
			<datalist id="lingkup-materi-options">
				{#each filteredLingkupMateri as lingkupMateri}
					<option value={lingkupMateri}></option>
				{/each}
			</datalist>
		</fieldset>

		<fieldset class="fieldset">
			<legend class="fieldset-legend">Tujuan Pembelajaran</legend>
			<div class="join mb-2 w-full" role="group" aria-label="Sumber tujuan pembelajaran">
				<button type="button" class="btn join-item flex-1 shadow-none" class:btn-active={tujuanMode === 'data'} onclick={() => setTujuanMode('data')}>Pilih Data</button>
				<button type="button" class="btn join-item flex-1 shadow-none" class:btn-active={tujuanMode === 'manual'} onclick={() => setTujuanMode('manual')}>Isi Manual</button>
			</div>

			{#if tujuanMode === 'data'}
				<select
					class="select bg-base-200 dark:bg-base-300 w-full dark:border-none"
					name="tujuanPembelajaranId"
					value={formTujuanPembelajaranId ?? ''}
					onchange={(e) => {
						const value = e.currentTarget.value;
						formTujuanPembelajaranId = value ? Number(value) : null;
					}}
				>
					<option value="">Tanpa tujuan pembelajaran</option>
					{#each filteredTujuanPembelajaran as tp}
						<option value={tp.id}>{tp.deskripsi}</option>
					{/each}
				</select>
				{#if !formLingkupMateri}
					<p class="label">Isi lingkup materi terlebih dahulu</p>
				{/if}
			{:else}
				<textarea
					class="textarea bg-base-200 dark:bg-base-300 w-full dark:border-none"
					name="tujuanPembelajaranManual"
					rows="3"
					maxlength="500"
					value={formTujuanPembelajaranManual}
					oninput={(e) => {
						formTujuanPembelajaranManual = e.currentTarget.value;
					}}
					placeholder="Tuliskan tujuan pembelajaran"
					spellcheck="false"
				></textarea>
				<p class="label">{formTujuanPembelajaranManual.length}/500 karakter</p>
			{/if}
		</fieldset>

		<fieldset class="fieldset">
			<legend class="fieldset-legend">Catatan</legend>
			<textarea
				class="textarea bg-base-200 dark:bg-base-300 w-full dark:border-none"
				name="catatan"
				rows="3"
				maxlength="300"
				value={formCatatan}
				oninput={(e) => {
					formCatatan = e.currentTarget.value;
				}}
				placeholder="Tuliskan catatan (maksimal 300 karakter)"
				spellcheck="false"
			></textarea>
			<p class="label">{formCatatan.length}/300 karakter</p>
		</fieldset>
	{/snippet}
</FormEnhance>
