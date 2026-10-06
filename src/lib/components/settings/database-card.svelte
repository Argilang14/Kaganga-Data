<script lang="ts">
	import { browser } from '$app/environment';
	import Icon from '$lib/components/icon.svelte';
	import { showModal } from '$lib/components/global-modal.svelte';
	import ImportDatabaseModal from '$lib/components/modals/import-database-modal.svelte';
	import { toast } from '$lib/components/toast.svelte';
	let loading=$state(false);
	async function backup(){
		if(!browser||loading)return; loading=true;
		try{const response=await fetch('/api/database/backup');if(!response.ok)throw new Error(await response.text());const blob=await response.blob();const match=response.headers.get('content-disposition')?.match(/filename="?([^";]+)"?/i);const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=match?.[1]??'kaganga-backup.sqlite3';link.click();URL.revokeObjectURL(link.href);toast('Backup database berhasil diunduh.','success');}
		catch(error){toast(error instanceof Error?error.message:'Backup gagal.','error');}finally{loading=false;}
	}
</script>
<section class="bg-base-100 rounded-lg p-5 shadow-md"><h2 class="text-lg font-semibold">Database</h2><p class="text-base-content/65 mb-4 text-sm">Backup atau pulihkan data. Import selalu membuat backup otomatis sebelum mengganti database.</p>
<div class="grid gap-2 sm:grid-cols-2"><button class="btn btn-accent btn-soft" type="button" onclick={backup} disabled={loading}><Icon name="database" />{loading?'Menyiapkan...':'Backup Data'}</button><button class="btn btn-accent btn-soft" type="button" onclick={() => showModal({title:'Import Database',body:ImportDatabaseModal,dismissible:true})}><Icon name="import" />Import Data</button></div>
<p class="text-base-content/55 mt-3 text-xs">Reset total tidak disediakan di sini untuk mencegah penghapusan data tanpa sengaja.</p></section>