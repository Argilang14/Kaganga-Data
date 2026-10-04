<script lang="ts">
	import { deserialize } from '$app/forms';
	import { createEventDispatcher } from 'svelte';
	import Icon from '$lib/components/icon.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import { validatePassword } from '$lib/password-policy';
	import {
		accessPositionLabels,
		accessPositionValues,
		type AccessPosition
	} from '$lib/access-position';

	type Role = 'user' | 'wali_asuh' | 'wali_asrama' | 'wali_kelas' | 'admin';
	type PegawaiOption = {
		id: number;
		nama: string;
		nip: string;
		jenis: string;
		jabatan: string | null;
		status: string;
	};
	type MapelOption = { id: number; nama: string };
	type KelasOption = {
		id: number;
		nama: string;
		fase: string | null;
		tahunAjaran?: string;
		semester?: string;
	};
	type EditUser = {
		id: number;
		username: string;
		type: Role;
		pegawaiId: number | null;
		updatedAt?: string | null;
		pegawaiName?: string | null;
		pegawaiNip?: string | null;
		pegawaiJenis?: string | null;
		jabatanAkses?: AccessPosition | null;
		mataPelajaranIds?: number[];
		kelasIds?: number[];
	} | null;
	type ActionBody = {
		message?: string;
		displayName?: string;
		mataPelajaranIds?: number[];
		kelasIds?: number[];
		user?: { id?: number };
		[key: string]: unknown;
	};

	let { open = $bindable(false), editUser = null } = $props<{
		open?: boolean;
		editUser?: EditUser;
	}>();
	const dispatch = createEventDispatcher();

	let username = $state('');
	let password = $state('');
	let type = $state<Role>('user');
	let jabatanAkses = $state<AccessPosition | ''>('');
	let pegawaiId = $state('');
	let mataPelajaranIds = $state(new Set<number>());
	let kelasIds = $state(new Set<number>());
	let pegawaiList = $state<PegawaiOption[]>([]);
	let mataPelajaran = $state<MapelOption[]>([]);
	let kelasList = $state<KelasOption[]>([]);
	let initialized = $state(false);
	let loadingOptions = $state(false);
	let saving = $state(false);
	let optionsError = $state('');
	let showPassword = $state(false);
	let optionsVersion = 0;

	const isEditMode = $derived(editUser !== null);
	const isLegacyWaliKelas = $derived(editUser?.type === 'wali_kelas');
	const allowedJenis: Record<Role, string[]> = {
		user: ['guru', 'kepala_sekolah'],
		wali_asuh: ['wali_asuh'],
		wali_asrama: ['wali_asrama'],
		wali_kelas: ['guru', 'kepala_sekolah'],
		admin: []
	};
	let filteredPegawai = $derived(
		pegawaiList.filter(
			(pegawai) =>
				pegawai.status === 'aktif' &&
				(jabatanAkses !== '' || allowedJenis[type].includes(pegawai.jenis))
		)
	);
	let selectedPegawai = $derived(
		filteredPegawai.find((pegawai) => pegawai.id === Number(pegawaiId)) ?? null
	);
	let uniqueMataPelajaran = $derived.by(() => {
		const unique = new Map<string, MapelOption & { ids: number[] }>();
		for (const mapel of mataPelajaran) {
			const key = mapel.nama.trim().toLowerCase();
			const group = unique.get(key);
			if (group) group.ids.push(mapel.id);
			else unique.set(key, { ...mapel, ids: [mapel.id] });
		}
		return [...unique.values()];
	});
	let isValid = $derived(
		!!selectedPegawai &&
			username.trim().length >= 3 &&
			(isEditMode || password.trim().length > 0) &&
			(type !== 'user' || jabatanAkses !== '' || mataPelajaranIds.size > 0)
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
		if (
			!isEditMode &&
			!loadingOptions &&
			pegawaiId &&
			pegawaiList.length > 0 &&
			!filteredPegawai.some((pegawai) => String(pegawai.id) === pegawaiId)
		) {
			pegawaiId = '';
		}
		if (type !== 'user' && type !== 'wali_kelas') {
			if (!isEditMode) jabatanAkses = '';
			mataPelajaranIds = new Set<number>();
			kelasIds = new Set<number>();
		}
	});

	function resetForm() {
		username = editUser?.username ?? '';
		password = '';
		type = editUser?.type ?? 'user';
		jabatanAkses = editUser?.jabatanAkses ?? '';
		pegawaiId = editUser?.pegawaiId ? String(editUser.pegawaiId) : '';
		mataPelajaranIds = new Set(editUser?.mataPelajaranIds ?? []);
		kelasIds = new Set(editUser?.kelasIds ?? []);
		showPassword = false;
		optionsError = '';
		pegawaiList = [];
		mataPelajaran = [];
		kelasList = [];
	}

	async function loadOptions() {
		const version = ++optionsVersion;
		loadingOptions = true;
		optionsError = '';
		try {
			const suffix = editUser?.id ? `?includeUserId=${editUser.id}` : '';
			const response = await fetch(`/api/pengguna/options${suffix}`);
			const body = await response.json().catch(() => ({}));
			if (version !== optionsVersion || !open) return;
			if (!response.ok) throw new Error(body.message || 'Gagal memuat data');
			pegawaiList = body.pegawaiList ?? [];
			mataPelajaran = body.mataPelajaran ?? [];
			kelasList = body.kelasList ?? [];
			if (
				editUser?.pegawaiId &&
				!pegawaiList.some((pegawai) => pegawai.id === editUser?.pegawaiId)
			) {
				pegawaiList = [
					...pegawaiList,
					{
						id: editUser.pegawaiId,
						nama: editUser.pegawaiName ?? editUser.username,
						nip: editUser.pegawaiNip ?? '',
						jenis:
							editUser.pegawaiJenis ?? (editUser.type === 'wali_kelas' ? 'guru' : editUser.type),
						jabatan: null,
						status: 'aktif'
					}
				];
			}
		} catch (error) {
			if (version === optionsVersion)
				optionsError = error instanceof Error ? error.message : 'Gagal memuat data';
		} finally {
			if (version === optionsVersion) loadingOptions = false;
		}
	}

	function toggle(set: Set<number>, id: number) {
		const next = new Set(set);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		return next;
	}
	function toggleMapel(mapel: MapelOption & { ids: number[] }) {
		const next = new Set(mataPelajaranIds);
		if (mapel.ids.some((id) => next.has(id))) {
			for (const id of mapel.ids) next.delete(id);
		} else next.add(mapel.id);
		mataPelajaranIds = next;
	}

	function close() {
		if (saving) return;
		optionsVersion++;
		loadingOptions = false;
		open = false;
		dispatch('cancel');
	}

	async function save() {
		if (!isValid || !selectedPegawai || saving) return;
		if (password.trim()) {
			const validation = validatePassword(password);
			if (!validation.valid) {
				toast({ message: validation.message, type: 'error' });
				return;
			}
		}
		const form = new FormData();
		if (editUser?.id) form.set('id', String(editUser.id));
		if (editUser?.id) form.set('updatedAt', editUser.updatedAt ?? '');
		form.set('username', username.trim());
		form.set('password', password);
		form.set('type', type);
		form.set('jabatanAkses', jabatanAkses);
		form.set('pegawaiId', pegawaiId);
		form.set('mataPelajaranIds', JSON.stringify([...mataPelajaranIds]));
		form.set('kelasIds', JSON.stringify([...kelasIds]));

		saving = true;
		try {
			const endpoint = isEditMode ? '?/update_user' : '?/create_user';
			const response = await fetch(endpoint, { method: 'POST', body: form });
			const result = deserialize(await response.text());
			const body = ('data' in result ? (result.data ?? {}) : {}) as ActionBody;
			if (result.type !== 'success') {
				const message =
					result.type === 'error' && result.error instanceof Error
						? result.error.message
						: String(body.message ?? 'Gagal menyimpan pengguna');
				throw new Error(message);
			}
			dispatch('saved', { body });
			toast({
				message: isEditMode ? 'Pengguna berhasil diperbarui' : 'Pengguna berhasil dibuat',
				type: 'success'
			});
			open = false;
		} catch (error) {
			toast({
				message: error instanceof Error ? error.message : 'Gagal menyimpan pengguna',
				type: 'error'
			});
		} finally {
			saving = false;
		}
	}
</script>

{#if open}
	<div class="modal modal-open" id="edit-user-modal">
		<div class="modal-box flex max-h-[92vh] w-[min(94vw,52rem)] max-w-4xl flex-col p-4 sm:p-6">
			<header class="mb-4">
				<h3 class="text-xl font-bold">{isEditMode ? 'Edit Pengguna' : 'Tambah Pengguna'}</h3>
				<p class="text-base-content/65 mt-1 text-sm">
					Akun selalu mengikuti sekolah aktif dan terhubung ke satu Data Pegawai.
				</p>
			</header>

			<div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-1">
				{#if optionsError}
					<div class="alert alert-error text-sm">
						<span>{optionsError}</span>
						<button class="btn btn-sm" type="button" onclick={loadOptions}>Muat ulang</button>
					</div>
				{/if}

				<div class="grid gap-3 sm:grid-cols-2">
					<fieldset class="fieldset">
						<legend class="fieldset-legend">Role</legend>
						<select
							class="select bg-base-200 w-full"
							bind:value={type}
							disabled={isLegacyWaliKelas || loadingOptions || saving}
						>
							{#if isLegacyWaliKelas}<option value="wali_kelas">Wali Kelas (akun lama)</option>{/if}
							<option value="user">Guru Mapel</option>
							<option value="wali_asuh">Wali Asuh</option>
							<option value="wali_asrama">Wali Asrama</option>
						</select>
						{#if isLegacyWaliKelas}
							<p class="label text-wrap">Role ini mengikuti penugasan pada Data Kelas.</p>
						{/if}
					</fieldset>

					<fieldset class="fieldset">
						<legend class="fieldset-legend">Pegawai</legend>
						<select
							id="user-pegawai"
							class="select bg-base-200 w-full"
							bind:value={pegawaiId}
							disabled={isEditMode || loadingOptions}
						>
							<option value="">{loadingOptions ? 'Memuat pegawai...' : 'Pilih pegawai'}</option>
							{#each filteredPegawai as pegawai (pegawai.id)}
								<option value={String(pegawai.id)}>
									{pegawai.nama}{pegawai.nip ? ` - ${pegawai.nip}` : ''}
								</option>
							{/each}
						</select>
						{#if isEditMode}<p class="label">
								Tautan pegawai tidak dipindahkan saat edit akun.
							</p>{/if}
					</fieldset>
				</div>

				{#if type === 'user' || isEditMode}
					<fieldset class="fieldset">
						<legend class="fieldset-legend">Jabatan Akses</legend>
						<select
							id="user-jabatan-akses"
							class="select bg-base-200 w-full"
							bind:value={jabatanAkses}
							disabled={loadingOptions || saving}
						>
							<option value="">Tanpa jabatan akses khusus</option>
							{#each accessPositionValues as position (position)}
								<option value={position}>{accessPositionLabels[position]}</option>
							{/each}
						</select>
						<p class="label text-wrap">
							Jabatan akses membuka seluruh fitur operasional sekolah. Pengaturan sistem dan
							manajemen pengguna tetap khusus admin.
						</p>
					</fieldset>
				{/if}

				{#if type === 'user' || type === 'wali_kelas'}
					<div class="grid gap-3 sm:grid-cols-2">
						<fieldset class="fieldset">
							<legend class="fieldset-legend">Mata Pelajaran</legend>
							<details id="user-mapel-options" class="w-full rounded-lg border border-base-300">
								<summary class="select bg-base-200 flex w-full cursor-pointer items-center">
									{uniqueMataPelajaran.filter((mapel) =>
										mapel.ids.some((id) => mataPelajaranIds.has(id))
									).length || 'Pilih'} mata pelajaran
								</summary>
								<div class="bg-base-100 max-h-52 w-full overflow-y-auto p-2">
									{#each uniqueMataPelajaran as mapel (mapel.id)}
										<label
											class="hover:bg-base-200 flex cursor-pointer items-center gap-2 rounded p-2"
										>
											<input
												class="checkbox checkbox-sm"
												type="checkbox"
												aria-label={`Mata pelajaran ${mapel.nama}`}
												checked={mapel.ids.some((id) => mataPelajaranIds.has(id))}
												onchange={() => toggleMapel(mapel)}
												disabled={loadingOptions || saving}
											/>
											<span>{mapel.nama}</span>
										</label>
									{:else}
										<p class="p-2 text-sm opacity-60">Belum ada mata pelajaran</p>
									{/each}
								</div>
							</details>
						</fieldset>

						<fieldset class="fieldset">
							<legend class="fieldset-legend">Kelas Mengajar</legend>
							<details id="user-kelas-options" class="w-full rounded-lg border border-base-300">
								<summary class="select bg-base-200 flex w-full cursor-pointer items-center">
									{kelasIds.size ? `${kelasIds.size} dipilih` : 'Pilih kelas'}
								</summary>
								<div class="bg-base-100 max-h-52 w-full overflow-y-auto p-2">
									{#each kelasList as kelas (kelas.id)}
										<label
											class="hover:bg-base-200 flex cursor-pointer items-center gap-2 rounded p-2"
										>
											<input
												class="checkbox checkbox-sm"
												type="checkbox"
												aria-label={`Kelas ${kelas.nama} ${kelas.id}`}
												checked={kelasIds.has(kelas.id)}
												onchange={() => (kelasIds = toggle(kelasIds, kelas.id))}
												disabled={loadingOptions || saving}
											/>
											<span
												>{kelas.nama}{kelas.fase ? ` (${kelas.fase})` : ''}{kelas.tahunAjaran
													? ` - ${kelas.tahunAjaran} ${kelas.semester === 'genap' ? 'Genap' : 'Ganjil'}`
													: ''}</span
											>
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
					<div class="grid gap-3 sm:grid-cols-2">
						<label class="input validator bg-base-200 w-full">
							<Icon name="user" />
							<input
								id="user-username"
								required
								minlength="3"
								placeholder="Nama pengguna"
								bind:value={username}
							/>
						</label>
						<label class="input bg-base-200 w-full">
							<Icon name="lock" />
							<input
								id="user-password"
								autocomplete="new-password"
								type={showPassword ? 'text' : 'password'}
								required={!isEditMode}
								minlength="8"
								maxlength="128"
								placeholder={isEditMode ? 'Kata sandi baru (opsional)' : 'Kata sandi'}
								bind:value={password}
							/>
							<button
								type="button"
								class="btn btn-ghost btn-xs btn-square"
								onclick={() => (showPassword = !showPassword)}
								aria-label="Lihat atau sembunyikan kata sandi"
							>
								<Icon name={showPassword ? 'eye-off' : 'eye'} />
							</button>
						</label>
					</div>
					<p class="label text-wrap">
						Minimal 8 karakter dengan huruf dan angka. Kata sandi buatan admin wajib diganti saat
						pengguna masuk.
					</p>
				</fieldset>
			</div>

			<div class="modal-action mt-4 flex justify-between border-t border-base-300 pt-4">
				<button class="btn btn-soft shadow-none" type="button" onclick={close} disabled={saving}>
					<Icon name="close" /> Batal
				</button>
				<button
					class="btn btn-primary shadow-none"
					type="button"
					onclick={save}
					disabled={!isValid || loadingOptions || saving}
				>
					<Icon name="save" />
					{saving ? 'Menyimpan...' : 'Simpan'}
				</button>
			</div>
		</div>
	</div>
{/if}
