<script lang="ts">
	import type { EvaluationRoom, EvaluationPeriod } from '$lib/server/dorm-evaluation';
	let {
		rooms,
		room,
		periods,
		period,
		history = false
	}: {
		rooms: EvaluationRoom[];
		room: EvaluationRoom | null;
		periods: EvaluationPeriod[];
		period: EvaluationPeriod | null;
		history?: boolean;
	} = $props();
</script>

<form method="GET" class="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
	<select
		class="select bg-base-200 w-full sm:w-auto sm:max-w-xs"
		name="kamar_id"
		aria-label="Asrama"
		value={room?.id ?? 0}
	>
		<option value="0">Pilih asrama</option>
		{#each rooms as item (item.id)}<option value={item.id}
				>{item.asrama === item.nama ? item.nama : `${item.asrama} / ${item.nama}`}</option
			>{/each}
	</select>
	<select
		class="select bg-base-200 w-full sm:w-auto"
		name="semester_id"
		aria-label="Semester"
		value={period?.id ?? 0}
	>
		{#each periods as item (item.id)}<option value={item.id}>{item.nama} {item.tahun}</option
			>{/each}
	</select>
	<label class="label cursor-pointer gap-2"
		><input
			type="checkbox"
			class="checkbox checkbox-sm"
			name="riwayat"
			value="1"
			checked={history}
		/>Riwayat</label
	>
	<button class="btn btn-soft shadow-none" type="submit">Tampilkan</button>
</form>
{#if history || (period && !period.aktif)}<p
		class="text-base-content/70 mb-4 text-sm"
		role="status"
	>
		Riwayat hanya dapat dibaca.
	</p>{/if}
