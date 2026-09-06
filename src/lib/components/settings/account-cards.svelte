<script lang="ts">
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	let showConfirm = $state(false), showCurrent = $state(false), showNew = $state(false), showRepeat = $state(false);
</script>
<div class="grid gap-5 lg:grid-cols-2">
<section class="bg-base-100 rounded-lg p-5 shadow-md">
	<h2 class="text-lg font-semibold">Ganti Nama Pengguna</h2><p class="text-base-content/65 mb-3 text-sm">Konfirmasikan perubahan dengan kata sandi saat ini.</p>
	<FormEnhance action="?/change-admin-username" onsuccess={({form}) => form.reset()}>{#snippet children({submitting,invalid})}
		<fieldset class="fieldset"><legend class="fieldset-legend">Nama pengguna baru</legend><label class="input bg-base-200 w-full"><Icon name="users" /><input name="adminUsername" required pattern="^[A-Za-z0-9._-]+$" minlength="3" /></label></fieldset>
		<fieldset class="fieldset"><legend class="fieldset-legend">Kata sandi saat ini</legend><label class="input bg-base-200 w-full"><Icon name="lock" /><input name="adminPassword" type={showConfirm ? 'text':'password'} required /><button class="btn btn-ghost btn-xs btn-square" type="button" onclick={() => showConfirm=!showConfirm}><Icon name={showConfirm?'eye-off':'eye'} /></button></label></fieldset>
		<div class="mt-4 flex justify-end"><button class="btn btn-primary" disabled={submitting||invalid}><Icon name="save" />{submitting?'Menyimpan...':'Simpan'}</button></div>
	{/snippet}</FormEnhance>
</section>
<section id="ganti-password" class="bg-base-100 rounded-lg p-5 shadow-md">
	<h2 class="text-lg font-semibold">Ganti Kata Sandi</h2><p class="text-base-content/65 mb-3 text-sm">Gunakan minimal 8 karakter yang memuat huruf dan angka.</p>
	<FormEnhance action="?/change-password" onsuccess={({form}) => form.reset()}>{#snippet children({submitting,invalid})}
		{#each [{name:'currentPassword',label:'Kata sandi saat ini',value:showCurrent,toggle:()=>showCurrent=!showCurrent},{name:'newPassword',label:'Kata sandi baru',value:showNew,toggle:()=>showNew=!showNew},{name:'confirmPassword',label:'Ulangi kata sandi baru',value:showRepeat,toggle:()=>showRepeat=!showRepeat}] as item}
		<fieldset class="fieldset"><legend class="fieldset-legend">{item.label}</legend><label class="input bg-base-200 w-full"><Icon name="lock" /><input name={item.name} type={item.value?'text':'password'} minlength={item.name==='currentPassword'?undefined:8} required /><button class="btn btn-ghost btn-xs btn-square" type="button" onclick={item.toggle}><Icon name={item.value?'eye-off':'eye'} /></button></label></fieldset>
		{/each}
		<div class="mt-4 flex justify-end"><button class="btn btn-primary" disabled={submitting||invalid}><Icon name="save" />{submitting?'Menyimpan...':'Simpan'}</button></div>
	{/snippet}</FormEnhance>
</section>
</div>