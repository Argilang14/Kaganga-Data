<script lang="ts">
	import type { ReportMetadata, ArchiveKind } from '$lib/report-archive';
	let {
		value = $bindable(),
		kind,
		disabled = false
	}: { value: ReportMetadata; kind: ArchiveKind; disabled?: boolean } = $props();
	const fields: [keyof ReportMetadata, string][] = [
		['schoolName', 'Nama resmi sekolah / satuan pendidikan'],
		['npsn', 'NPSN'],
		['address', 'Alamat sekolah'],
		['principalName', 'Nama kepala sekolah'],
		['principalNip', 'NIP kepala sekolah'],
		['principalStatus', 'Status kepala sekolah'],
		['teacherName', 'Nama wali penandatangan'],
		['teacherNip', 'NIP wali'],
		['caregiverName', 'Nama Wali Asuh'],
		['caregiverNip', 'NIP Wali Asuh'],
		['place', 'Tempat penetapan'],
		['date', 'Tanggal rapor']
	];
</script>

<div class="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
	{#each fields.filter(([key]) => kind === 'asrama' || !key.startsWith('caregiver')) as [key, label] (key)}
		<label class="block min-w-0"
			><span class="mb-1 block text-sm font-medium">{label}</span>
			{#if key === 'principalStatus'}<select
					class="select h-10 w-full"
					bind:value={value[key]}
					{disabled}
					><option value="definitif">Definitif</option><option value="plt"
						>Pelaksana Tugas (Plt.)</option
					></select
				>
			{:else if key === 'date'}<input
					class="input h-10 w-full"
					type="date"
					bind:value={value[key]}
					{disabled}
					required
				/>
			{:else}<input
					class="input h-10 w-full"
					type="text"
					bind:value={value[key]}
					{disabled}
					required={!key.endsWith('Nip')}
					maxlength="600"
				/>{/if}
		</label>
	{/each}
</div>
