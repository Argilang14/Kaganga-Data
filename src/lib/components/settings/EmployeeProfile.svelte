<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/icon.svelte';
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import PendidikanPegawai from '$lib/components/pegawai/PendidikanPegawai.svelte';
	import DokumenPegawai from '$lib/components/pegawai/DokumenPegawai.svelte';
	import PegawaiPhotoUploadModal from '$lib/components/pegawai/PegawaiPhotoUploadModal.svelte';
	import { profileGroups, type ProfileField, type ProfileKey } from '$lib/pegawai-profile';
	import type { tablePegawai } from '$lib/server/db/schema';
	import type {
		DokumenPegawai as Document,
		PendidikanPegawai as Education,
		SertifikasiPegawai as Certificate
	} from '$lib/components/pegawai/types';

	let {
		data
	}: {
		data: {
			profile: typeof tablePegawai.$inferSelect;
			pendidikan: Education[];
			sertifikasi: Certificate[];
			dokumen: Document[];
		};
	} = $props();
	let activeTab = $state('biodata');
	let uploadingPhoto = $state(false);
	let deletingPhoto = $state(false);
	const groups: readonly { title: string; fields: readonly ProfileField[] }[] = profileGroups;
	const tabs = [
		{ key: 'biodata', label: 'Biodata' },
		{ key: 'pendidikan', label: 'Pendidikan' },
		{ key: 'sertifikasi', label: 'Sertifikasi' },
		{ key: 'berkas', label: 'Berkas' }
	];

	async function deletePhoto() {
		if (
			deletingPhoto ||
			!confirm('Hapus foto profil Anda? Foto yang dihapus tidak bisa dikembalikan.')
		)
			return;
		deletingPhoto = true;
		try {
			const response = await fetch(`/api/pegawai-photo/${data.profile.id}`, { method: 'DELETE' });
			const result = await response.json();
			if (!response.ok) throw new Error(result.message || 'Foto gagal dihapus.');
			await invalidateAll();
			toast('Foto profil berhasil dihapus.', 'success');
		} catch (error) {
			toast(error instanceof Error ? error.message : 'Foto gagal dihapus. Coba lagi.', 'error');
		} finally {
			deletingPhoto = false;
		}
	}
</script>

<div
	class="employee-profile min-w-0 space-y-5 pb-6"
	data-ui-revision="employee-profile-self-service-1"
>
	<header class="flex min-w-0 flex-wrap items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="text-xl font-semibold">Profil Pegawai Saya</h1>
			<p class="text-base-content/65 mt-1 break-words text-sm">{data.profile.nama}</p>
		</div>
		<a href={resolve('/pengaturan')} class="btn btn-soft h-10 min-h-10"
			><Icon name="left" />Kembali</a
		>
	</header>

	<section
		class="bg-base-100 flex min-w-0 flex-wrap items-center gap-4 p-4 sm:p-5"
		aria-label="Identitas pegawai"
	>
		<div
			class="bg-base-200 flex h-24 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md"
		>
			{#if data.profile.foto}<img
					src={`/api/pegawai-photo/${data.profile.id}?v=${encodeURIComponent(data.profile.foto)}`}
					alt={`Foto ${data.profile.nama}`}
					class="h-full w-full object-cover"
				/>{:else}<Icon name="user" class="h-8 w-8 opacity-40" />{/if}
		</div>
		<div class="min-w-0 flex-1 basis-40">
			<p class="break-words font-semibold">
				{data.profile.jabatan || data.profile.jenis.replaceAll('_', ' ')}
			</p>
			<p class="text-base-content/60 mt-1 break-words text-sm">
				{data.profile.kodePegawai || 'Kode pegawai belum tersedia'}
			</p>
			<span class="badge badge-soft mt-2" class:badge-success={data.profile.status === 'aktif'}
				>{data.profile.status === 'aktif' ? 'Pegawai aktif' : 'Pegawai nonaktif'}</span
			>
		</div>
		<div class="flex flex-wrap gap-2">
			<button
				type="button"
				class="btn btn-soft h-10 min-h-10"
				onclick={() => (uploadingPhoto = true)}
				disabled={deletingPhoto}
				><Icon name="image" />{data.profile.foto ? 'Ubah foto' : 'Unggah foto'}</button
			>
			{#if data.profile.foto}<button
					type="button"
					class="btn btn-error btn-soft btn-square h-10 min-h-10"
					onclick={deletePhoto}
					disabled={deletingPhoto}
					title="Hapus foto profil"
					aria-label="Hapus foto profil"
					>{#if deletingPhoto}<span class="loading loading-spinner loading-sm"></span>{:else}<Icon
							name="del"
						/>{/if}</button
				>{/if}
		</div>
	</section>

	<div class="bg-base-100 min-w-0">
		<div class="border-base-200 overflow-x-auto border-b px-4 sm:px-5">
			<div
				role="tablist"
				class="tabs tabs-border w-max min-w-full flex-nowrap"
				aria-label="Bagian profil pegawai"
			>
				{#each tabs as tab (tab.key)}
					<input
						type="radio"
						name="employee-profile-tab"
						class="tab min-h-12"
						aria-label={tab.label}
						value={tab.key}
						bind:group={activeTab}
						aria-controls={`profile-panel-${tab.key}`}
					/>
				{/each}
			</div>
		</div>
		<section
			id="profile-panel-biodata"
			hidden={activeTab !== 'biodata'}
			class="p-4 sm:p-5"
			aria-label="Biodata pegawai"
		>
			<FormEnhance action="/pengaturan/profil?/saveProfile" init={data.profile}>
				{#snippet children({ submitting })}
					<input type="hidden" name="updatedAt" value={data.profile.updatedAt ?? ''} />
					<fieldset disabled={submitting} class="min-w-0 space-y-6">
						{#each groups as group (group.title)}
							<fieldset class="border-base-200 min-w-0 border-b pb-6 last:border-b-0 last:pb-0">
								<legend class="mb-4 text-base font-semibold">{group.title}</legend>
								<div class="grid min-w-0 grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
									{#each group.fields as field (field.key)}
										<label
											class="flex min-w-0 flex-col gap-1.5"
											class:sm:col-span-2={field.wide}
											class:xl:col-span-3={field.wide}
										>
											<span class="text-sm font-medium"
												>{field.label}{['nama', 'nip'].includes(field.key) ? ' *' : ''}</span
											>
											{#if field.options}
												<select
													name={field.key}
													class="select h-10 min-h-10 w-full min-w-0"
													value={data.profile[field.key as ProfileKey] ?? ''}
													><option value="">Pilih {field.label.toLowerCase()}</option
													>{#each field.options as option (option)}<option value={option}
															>{option === 'laki-laki' ? 'Laki-laki' : 'Perempuan'}</option
														>{/each}</select
												>
											{:else if field.type === 'textarea'}
												<textarea
													name={field.key}
													rows="3"
													maxlength="1000"
													class="textarea w-full min-w-0"
													>{data.profile[field.key as ProfileKey] ?? ''}</textarea
												>
											{:else}
												<input
													name={field.key}
													type={field.type ?? 'text'}
													class="input h-10 min-h-10 w-full min-w-0"
													value={data.profile[field.key as ProfileKey] ?? ''}
													maxlength="255"
													required={['nama', 'nip'].includes(field.key)}
												/>
											{/if}
										</label>
									{/each}
								</div>
							</fieldset>
						{/each}
					</fieldset>
					<div class="border-base-200 mt-5 flex justify-end border-t pt-4">
						<button type="submit" class="btn btn-success min-h-10" disabled={submitting}
							>{#if submitting}<span class="loading loading-spinner loading-sm"></span>{:else}<Icon
									name="save"
								/>{/if}{submitting ? 'Menyimpan...' : 'Simpan biodata'}</button
						>
					</div>
				{/snippet}
			</FormEnhance>
		</section>
		<section
			id="profile-panel-pendidikan"
			hidden={activeTab !== 'pendidikan'}
			class="min-w-0 p-4 sm:p-5"
			aria-label="Pendidikan pegawai"
		>
			<PendidikanPegawai
				pegawaiId={data.profile.id}
				bind:pendidikan={data.pendidikan}
				bind:sertifikasi={data.sertifikasi}
				mode="pendidikan"
				actionBase="/pengaturan/profil"
			/>
		</section>
		<section
			id="profile-panel-sertifikasi"
			hidden={activeTab !== 'sertifikasi'}
			class="min-w-0 p-4 sm:p-5"
			aria-label="Sertifikasi pegawai"
		>
			<PendidikanPegawai
				pegawaiId={data.profile.id}
				bind:pendidikan={data.pendidikan}
				bind:sertifikasi={data.sertifikasi}
				mode="sertifikasi"
				actionBase="/pengaturan/profil"
			/>
		</section>
		<section
			id="profile-panel-berkas"
			hidden={activeTab !== 'berkas'}
			class="min-w-0 p-4 sm:p-5"
			aria-label="Berkas pegawai"
		>
			<h2 class="mb-4 font-semibold">Berkas pribadi</h2>
			<DokumenPegawai
				pegawaiId={data.profile.id}
				bind:dokumen={data.dokumen}
				actionBase="/pengaturan/profil"
			/>
		</section>
	</div>
</div>

<PegawaiPhotoUploadModal
	bind:isOpen={uploadingPhoto}
	pegawaiId={data.profile.id}
	pegawaiNama={data.profile.nama}
	onSuccess={() => {
		void invalidateAll();
	}}
/>
