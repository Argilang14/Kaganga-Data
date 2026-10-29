<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/icon.svelte';
	import './employee-profile.css';
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

<div class="employee-profile min-w-0 pb-6" data-ui-revision="employee-profile-self-service-1">
	<header class="profile-page-heading">
		<div class="flex min-w-0 items-center gap-3">
			<span class="profile-heading-icon" aria-hidden="true"
				><Icon name="user" class="size-5" /></span
			>
			<div class="min-w-0">
				<h1 class="text-xl font-semibold">Profil Pegawai Saya</h1>
				<p class="mt-1 break-words text-sm text-base-content/60">{data.profile.nama}</p>
			</div>
		</div>
		<a href={resolve('/pengaturan')} class="btn btn-soft h-10 min-h-10"
			><Icon name="left" />Kembali</a
		>
	</header>

	<div class="profile-workspace">
		<aside class="profile-identity" aria-label="Identitas pegawai">
			<div class="profile-person">
				<div class="profile-photo">
					{#if data.profile.foto}<img
							src={`/api/pegawai-photo/${data.profile.id}?v=${encodeURIComponent(data.profile.foto)}`}
							alt={`Foto ${data.profile.nama}`}
							class="h-full w-full object-cover"
						/>{:else}<Icon name="user" class="h-8 w-8 opacity-40" />{/if}
				</div>
				<div class="min-w-0">
					<h2 class="break-words text-base font-semibold">{data.profile.nama}</h2>
					<p class="mt-1 break-words text-sm text-base-content/60">
						{data.profile.jabatan || data.profile.jenis.replaceAll('_', ' ')}
					</p>
					<span class="badge badge-soft mt-2" class:badge-success={data.profile.status === 'aktif'}
						>{data.profile.status === 'aktif' ? 'Pegawai aktif' : 'Pegawai nonaktif'}</span
					>
				</div>
			</div>
			<div class="profile-photo-actions">
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
			<dl class="profile-identity-details">
				<div>
					<dt>Kode pegawai</dt>
					<dd>{data.profile.kodePegawai || '-'}</dd>
				</div>
				<div>
					<dt>NIP</dt>
					<dd>{data.profile.nip || '-'}</dd>
				</div>
				<div>
					<dt>Unit penempatan</dt>
					<dd>{data.profile.unitPenempatan || '-'}</dd>
				</div>
			</dl>
			<div class="profile-record-counts" aria-label="Ringkasan berkas profil">
				{#each [{ key: 'pendidikan', label: 'Pendidikan', total: data.pendidikan.length }, { key: 'sertifikasi', label: 'Sertifikasi', total: data.sertifikasi.length }, { key: 'berkas', label: 'Berkas', total: data.dokumen.length }] as item (item.key)}
					<button
						type="button"
						onclick={() => (activeTab = item.key)}
						aria-label={`Buka ${item.label}: ${item.total} data`}
						><strong>{item.total}</strong><span>{item.label}</span></button
					>
				{/each}
			</div>
		</aside>

		<div class="profile-content">
			<div class="profile-tabs-bar">
				<div
					role="tablist"
					class="tabs tabs-border profile-tabs"
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
				class="profile-panel"
				aria-label="Biodata pegawai"
			>
				<FormEnhance action="/pengaturan/profil?/saveProfile" init={data.profile}>
					{#snippet children({ submitting })}
						<input type="hidden" name="updatedAt" value={data.profile.updatedAt ?? ''} />
						<fieldset disabled={submitting} class="min-w-0 space-y-6">
							{#each groups as group, index (group.title)}
								<fieldset class="profile-field-group">
									<legend class="profile-group-heading"
										><span class="profile-group-icon" aria-hidden="true"
											><Icon
												name={index === 0
													? 'user'
													: index === 1
														? 'book'
														: index === 2
															? 'users'
															: 'briefcase'}
												class="size-4"
											/></span
										>{group.title}</legend
									>
									<div class="profile-fields">
										{#each group.fields as field (field.key)}
											<label
												class="flex min-w-0 flex-col gap-1.5"
												class:profile-field-wide={field.wide}
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
												{#if field.key === 'nip'}<span class="text-xs text-base-content/55"
														>Gunakan '-' jika belum memiliki NIP.</span
													>{/if}
											</label>
										{/each}
									</div>
								</fieldset>
							{/each}
						</fieldset>
						<div class="profile-save-bar">
							<button type="submit" class="btn btn-success min-h-10" disabled={submitting}
								>{#if submitting}<span class="loading loading-spinner loading-sm"
									></span>{:else}<Icon name="save" />{/if}{submitting
									? 'Menyimpan...'
									: 'Simpan biodata'}</button
							>
						</div>
					{/snippet}
				</FormEnhance>
			</section>
			<section
				id="profile-panel-pendidikan"
				hidden={activeTab !== 'pendidikan'}
				class="profile-panel profile-related"
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
				class="profile-panel profile-related"
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
				class="profile-panel profile-related"
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
</div>

<PegawaiPhotoUploadModal
	bind:isOpen={uploadingPhoto}
	pegawaiId={data.profile.id}
	pegawaiNama={data.profile.nama}
	onSuccess={() => {
		void invalidateAll();
	}}
/>
