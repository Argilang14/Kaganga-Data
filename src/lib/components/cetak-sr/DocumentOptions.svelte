<script lang="ts">
	let {
		options,
		grouped = false
	}: {
		options: Array<{ value: string; label: string }>;
		grouped?: boolean;
	} = $props();
	const groups = [
		{ label: 'Data Murid', values: ['informasi-siswa', 'daftar-wali-asuh'] },
		{ label: 'Absensi', values: ['kartu-absensi', 'qr-kelas', 'rekap-absensi-kegiatan'] },
		{
			label: 'Akademik & Ujian',
			values: [
				'jadwal-pelajaran',
				'kalender-pendidikan',
				'jurnal-mengajar',
				'kartu-ujian',
				'kartu-ujian-meja'
			]
		},
		{ label: 'Administrasi', values: ['buku-tamu'] }
	];
	// The caller supplies only documents allowed for the current account.
	const groupedOptions = $derived(
		groups
			.map((group) => ({
				label: group.label,
				options: options.filter((option) => group.values.includes(option.value))
			}))
			.filter((group) => group.options.length > 0)
	);
	const ungroupedOptions = $derived(
		options.filter((option) => !groups.some((group) => group.values.includes(option.value)))
	);
</script>

{#if grouped}
	{#each groupedOptions as group (group.label)}
		<optgroup label={group.label}>
			{#each group.options as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</optgroup>
	{/each}
{/if}
{#each grouped ? ungroupedOptions : options as option (option.value)}
	<option value={option.value}>{option.label}</option>
{/each}
