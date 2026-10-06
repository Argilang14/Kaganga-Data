<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/icon.svelte';
	let { data, form } = $props();
	const fields = [
		['telepon', 'Nomor Telepon', 'tel'],
		['email', 'Email', 'email'],
		['tempatLahir', 'Tempat Lahir', 'text'],
		['tanggalLahir', 'Tanggal Lahir', 'date'],
		['kontakDaruratNama', 'Nama Kontak Darurat', 'text'],
		['kontakDaruratHubungan', 'Hubungan Kontak Darurat', 'text'],
		['kontakDaruratTelepon', 'Telepon Kontak Darurat', 'tel']
	] as const;
</script>

<section class="bg-base-100 rounded-lg p-5 shadow-md">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="text-xl font-semibold">Profil Pegawai Saya</h1>
			<p class="text-base-content/65 mt-1">
				{data.profile.nama} · {data.profile.jabatan || data.profile.jenis}
			</p>
			<p class="text-sm mt-1">NIP: {data.profile.nip || '-'}</p>
		</div>
		<a href="/pengaturan" class="btn btn-sm"><Icon name="left" />Kembali</a>
	</div>
	{#if form?.message}<div
			class="alert mt-4"
			class:alert-success={form.success}
			class:alert-error={!form.success}
		>
			{form.message}
		</div>{/if}
	<form method="POST" use:enhance class="mt-5">
		<input type="hidden" name="updatedAt" value={data.profile.updatedAt} />
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			{#each fields as [key, label, type]}
				<label class="fieldset min-w-0"
					><span class="fieldset-legend">{label}</span><input
						class="input w-full"
						name={key}
						{type}
						value={data.profile[key] ?? ''}
						maxlength="1000"
					/></label
				>
			{/each}
			<label class="fieldset min-w-0 md:col-span-2"
				><span class="fieldset-legend">Alamat</span><textarea
					class="textarea w-full"
					name="alamat"
					rows="3"
					maxlength="1000">{data.profile.alamat ?? ''}</textarea
				></label
			>
		</div>
		<div class="mt-4 flex justify-end">
			<button class="btn btn-success" type="submit"><Icon name="save" />Simpan Profil</button>
		</div>
	</form>
</section>
