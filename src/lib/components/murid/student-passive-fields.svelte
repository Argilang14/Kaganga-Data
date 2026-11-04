<script lang="ts">
	import { passiveStatusLabels } from '$lib/student-status';
	import { dormToday } from '$lib/dormitory';
	let { formId }: { formId?: string } = $props();
</script>

<div class="mt-4 space-y-3">
	<label class="fieldset">
		<span class="fieldset-legend">Alasan menjadi pasif</span>
		<select class="select w-full" name="reason" form={formId} required>
			<option value="">Pilih alasan</option>
			{#each Object.entries(passiveStatusLabels) as [value, label] (value)}
				<option {value}>{label}</option>
			{/each}
		</select>
	</label>
	<label class="fieldset">
		<span class="fieldset-legend">Tanggal perubahan</span>
		<input
			class="input w-full"
			type="date"
			name="tanggal"
			form={formId}
			value={dormToday()}
			max={dormToday()}
			required
		/>
	</label>
	<label class="fieldset">
		<span class="fieldset-legend">Catatan (opsional)</span>
		<textarea
			class="textarea w-full"
			name="catatan"
			form={formId}
			maxlength="500"
			rows="2"
			placeholder="Contoh: pindah dari kelas bawah ke kelas 1.1"></textarea>
	</label>
	<p class="text-sm text-base-content/70">
		Kelas dan asrama saat ini dikosongkan. Riwayat penempatan, nilai, presensi, foto, dan QR tetap
		tersimpan.
	</p>
</div>
