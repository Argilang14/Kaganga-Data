<script lang="ts">
	import { deserialize } from '$app/forms';
	import { createEventDispatcher } from 'svelte';
	import Icon from '$lib/components/icon.svelte';
	import { toast } from '$lib/components/toast.svelte';

	type Role = 'user' | 'wali_asuh' | 'wali_asrama';
	type PegawaiOption = {
		id: number;
		nama: string;
		nip: string;
		jenis: string;
		jabatan: string | null;
		status: string;
	};
	type MapelOption = { id: number; nama: string };
	type KelasOption = { id: number; nama: string; fase: string | null };
	type CreateUserBody = {
		message?: string;
		displayName?: string;
		user?: { id?: number };
		[key: string]: unknown;
	};

	let { open = $bindable(false) } = $props<{ open?: boolean }>();
	const dispatch = createEventDispatcher();

	let username = $state('');
	let password = $state('');
	let type = $state<Role>('user');
	let pegawaiId = $state('');
	let mataPelajaranIds = $state(new Set<number>());
	let kelasIds = $state(new Set<number>());
	let pegawaiList = $state<PegawaiOption[]>([]);
	let mataPelajaran = $state<MapelOption[]>([]);
	let kelasList = $state<KelasOption[]>([]);
	let initialized = $state(false);
	let loadingOptions = $state(false);
	let optionsError = $state('');
	let showPassword = $state(false);

	const allowedJenis: Record<Role, string[]> = {
		user: ['guru', 'kepala_sekolah'],
		wali_asuh: ['wali_asuh'],
		wali_asrama: ['wali_asrama']
	};
	let filteredPegawai = $derived(
		pegawaiList.filter(
			(pegawai) => pegawai.status === 'aktif' && allowedJenis[type].includes(pegawai.jenis)
		)
	);
	let selectedPegawai = $derived(
		filteredPegawai.find((pegawai) => pegawai.id === Number(pegawaiId)) ?? null
	);
	let uniqueMataPelajaran = $derived.by(() => {
		const unique = new Map<string, MapelOption>();
		for (const mapel of mataPelajaran) {
			const key = mapel.nama.trim().toLowerCase();
			if (!unique.has(key)) unique.set(key, mapel);
		}
		return [...unique.values()];
	});
	let isValid = $derived(
		!!selectedPegawai &&
			username.trim().length > 0 &&
			password.trim().length > 0 &&
			(type !== 'user' || mataPelajaranIds.size > 0)
	);

	$effect(() => {
		if (open && !initialized) {
			initialized = true;
			resetForm();
			void loadOptions();
		}
		if (!open) initialized = false;
	});

	$effect(() => {
		if (pegawaiId && !filteredPegawai.some((pegawai) => String(pegawai.id) === pegawaiId)) {
			pegawaiId = '';
		}
		if (type !== 'user') {
			mataPelajaranIds = new Set<number>();
			kelasIds = new Set<number>();
		}
	});

	function resetForm() {
		username = '';
		password = '';
		type = 'user';
		pegawaiId = '';
		mataPelajaranIds = new Set<number>();
		kelasIds = new Set<number>();
		showPassword = false;
	}

	async function loadOptions() {
		loadingOptions = true;
		optionsError = '';
		try {
			const response = await fetch('/api/pengguna/options');
			const body = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(body.message || 'Gagal memuat data');
			pegawaiList = body.pegawaiList ?? [];
			mataPelajaran = body.mataPelajaran ?? [];
			kelasList = body.kelasList ?? [];
		} catch (error) {
			optionsError = error instanceof Error ? error.message : 'Gagal memuat data';
		} finally {
			loadingOptions = false;
		}
	}

	function toggle(set: Set<number>, id: number) {
		const next = new Set(set);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		return next;
	}

	function close() {
		open = false;
		dispatch('cancel');
	}

	async function save() {
		if (!isValid || !selectedPegawai) return;
		const form = new FormData();
		form.set('username', username.trim());
		form.set('password', password);
		form.set('type', type);
		form.set('pegawaiId', pegawaiId);
		form.set('mataPelajaranIds', JSON.stringify([...mataPelajaranIds]));
		form.set('kelasIds', JSON.stringify([...kelasIds]));

		try {
			const response = await fetch('?/create_user', { method: 'POST', body: form });
			const result = deserialize(await response.text());
			const body = ('data' in result ? (result.data ?? {}) : {}) as CreateUserBody;
			if (result.type !== 'success') {
				const errorMessage =
					result.type === 'error' && result.error instanceof Error
						? result.error.message
						: String(body.message ?? 'Gagal membuat pengguna');
				throw new Error(errorMessage);
			}
			dispatch('saved', {
				body: {
					...body,
					displayName: body.displayName ?? selectedPegawai.nama,
					__server_user_returned: Boolean(body.user?.id)
				}
			});
			toast({ message: 'Pengguna dibuat', type: 'success' });
			open = false;
		} catch (error) {
			toast({
				message: error instanceof Error ? error.message : 'Gagal membuat pengguna',
				type: 'error'
			});
		}
	}
</script>

{#if open}
	<div class="modal modal-open">
		<div class="modal-box flex max-h-[90vh] max-w-2xl flex-col p-4">
			<h3 class="mb-3 text-lg font-bold">Tambah Pengguna</h3>
			<div class="flex-1 space-y-3 overflow-y-auto px-1">
				{#if optionsError}
					<div class="alert alert-error text-sm">
						<span>{optionsError}</span>
						<button class="btn btn-sm" type="button" onclick={loadOptions}>Muat ulang</button>
					</div>
				{/if}

				<div class="grid gap-3 md:grid-cols-2">
					<fieldset class="fieldset">
						<legend class="fieldset-legend">Role</legend>
						<select class="select dark:bg-base-200 w-full dark:border-none" bind:value={type}>
							<option value="user">Guru Mapel</option>
							<option value="wali_asuh">Wali Asuh</option>
							<option value="wali_asrama">Wali Asrama</option>
						</select>
					</fieldset>

					<fieldset class="fieldset">
						<legend class="fieldset-legend">Pegawai</legend>
						<select
							id="add-user-pegawai"
							class="select dark:bg-base-200 w-full dark:border-none"
							bind:value={pegawaiId}
							disabled={loadingOptions}
						>
							<option value="">{loadingOptions ? 'Memuat pegawai...' : 'Pilih pegawai'}</option>
							{#each filteredPegawai as pegawai (pegawai.id)}
								<option value={String(pegawai.id)}>
									{pegawai.nama}{pegawai.nip ? ` - ${pegawai.nip}` : ''}
								</option>
							{/each}
						</select>
					</fieldset>
				</div>

				{#if type === 'user'}
					<div class="grid gap-3 md:grid-cols-2">
						<fieldset class="fieldset">
							<legend class="fieldset-legend">Mata Pelajaran</legend>
							<details class="dropdown w-full">
								<summary class="select dark:bg-base-200 flex w-full cursor-pointer items-center dark:border-none">
									{mataPelajaranIds.size ? `${mataPelajaranIds.size} dipilih` : 'Pilih mata pelajaran'}
								</summary>
								<div class="dropdown-content bg-base-100 border-base-300 rounded-box z-50 mt-1 max-h-64 w-full overflow-y-auto border p-2 shadow">
									{#each uniqueMataPelajaran as mapel (mapel.id)}
										<label class="hover:bg-base-200 flex cursor-pointer items-center gap-2 rounded p-2">
											<input class="checkbox checkbox-sm" type="checkbox" checked={mataPelajaranIds.has(mapel.id)} onchange={() => (mataPelajaranIds = toggle(mataPelajaranIds, mapel.id))} />
											<span>{mapel.nama}</span>
										</label>
									{:else}
										<p class="p-2 text-sm opacity-60">Belum ada mata pelajaran</p>
									{/each}
								</div>
							</details>
						</fieldset>

						<fieldset class="fieldset">
							<legend class="fieldset-legend">Kelas</legend>
							<details class="dropdown w-full">
								<summary class="select dark:bg-base-200 flex w-full cursor-pointer items-center dark:border-none">
									{kelasIds.size ? `${kelasIds.size} dipilih` : 'Pilih kelas'}
								</summary>
								<div class="dropdown-content bg-base-100 border-base-300 rounded-box z-50 mt-1 max-h-64 w-full overflow-y-auto border p-2 shadow">
									{#each kelasList as kelas (kelas.id)}
										<label class="hover:bg-base-200 flex cursor-pointer items-center gap-2 rounded p-2">
											<input class="checkbox checkbox-sm" type="checkbox" checked={kelasIds.has(kelas.id)} onchange={() => (kelasIds = toggle(kelasIds, kelas.id))} />
											<span>{kelas.nama}{kelas.fase ? ` (${kelas.fase})` : ''}</span>
										</label>
									{:else}
										<p class="p-2 text-sm opacity-60">Belum ada kelas</p>
									{/each}
								</div>
							</details>
						</fieldset>
					</div>
				{/if}

				<fieldset class="fieldset">
					<legend class="fieldset-legend">Akun</legend>
					<div class="flex flex-col gap-2 sm:flex-row">
						<label class="input dark:bg-base-200 w-full dark:border-none">
							<Icon name="user" />
							<input id="add-user-username" required placeholder="Username" bind:value={username} />
						</label>
						<label class="input dark:bg-base-200 w-full dark:border-none">
							<Icon name="lock" />
							<input id="add-user-password" type={showPassword ? 'text' : 'password'} required placeholder="Password" bind:value={password} />
							<button type="button" class="cursor-pointer" onclick={() => (showPassword = !showPassword)} title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}>
								<Icon name={showPassword ? 'eye-off' : 'eye'} />
							</button>
						</label>
					</div>
				</fieldset>
			</div>

			<div class="modal-action sticky bottom-0 z-10">
				<button class="btn btn-soft shadow-none" type="button" onclick={close}><Icon name="close" /> Batal</button>
				<button class="btn btn-primary shadow-none" type="button" onclick={save} disabled={!isValid || loadingOptions}><Icon name="save" /> Simpan</button>
			</div>
		</div>
	</div>
{/if}