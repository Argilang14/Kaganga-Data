<script lang="ts">
	import Icon from '$lib/components/icon.svelte';

	type ProgressItem = {
		percentage: number;
		completed: number;
		total: number;
	};

	let { progress, kelasNama } = $props<{
		kelasNama?: string;
		progress: {
			akademik: ProgressItem;
			ekstrakurikuler: ProgressItem;
			kokurikuler: ProgressItem;
			keasramaan: ProgressItem;
		};
	}>();
</script>

<div class="dashboard-panel dashboard-progress min-w-0 rounded-lg shadow-sm">
	<div class="space-y-4 p-5">
		<h2 class="flex items-center gap-2 text-lg font-bold">
			<span class="text-info">
				<Icon name="bar-chart" class="size-5" />
			</span>
			Pengisian Nilai Kelas Aktif
		</h2>
		{#if kelasNama}<p class="text-sm text-base-content/70">Kelas {kelasNama}</p>{/if}

		<div>
			<label class="label" for="progress-akademik">
				<span class="label-text">Nilai Intrakurikuler</span>
				<span class="label-text-alt font-semibold">{progress.akademik.percentage}%</span>
			</label>
			<progress
				id="progress-akademik"
				class="progress progress-success w-full"
				value={progress.akademik.percentage}
				max="100"
			></progress>
			<p class="text-base-content/70 mt-1 text-xs">
				{progress.akademik.completed} dari {progress.akademik.total} penilaian sudah diinput.
			</p>
		</div>

		<!-- Absensi Siswa section removed as requested -->

		<div>
			<label class="label" for="progress-ekskul">
				<span class="label-text">Nilai Ekstrakurikuler</span>
				<span class="label-text-alt font-semibold">{progress.ekstrakurikuler.percentage}%</span>
			</label>
			<progress
				id="progress-ekskul"
				class="progress progress-warning w-full"
				value={progress.ekstrakurikuler.percentage}
				max="100"
			></progress>
			<p class="text-base-content/70 mt-1 text-xs">
				{progress.ekstrakurikuler.completed} dari {progress.ekstrakurikuler.total} murid sudah dinilai.
			</p>
		</div>

		<div>
			<label class="label" for="progress-keasramaan">
				<span class="label-text">Nilai Keasramaan</span>
				<span class="label-text-alt font-semibold">{progress.keasramaan.percentage}%</span>
			</label>
			<progress
				id="progress-keasramaan"
				class="progress progress-info w-full"
				value={progress.keasramaan.percentage}
				max="100"
			></progress>
			<p class="text-base-content/70 mt-1 text-xs">
				{progress.keasramaan.completed} dari {progress.keasramaan.total} penilaian sudah diinput.
			</p>
		</div>

		<div>
			<label class="label" for="progress-kokur">
				<span class="label-text">Nilai Kokurikuler</span>
				<span class="label-text-alt font-semibold">{progress.kokurikuler.percentage}%</span>
			</label>
			<progress
				id="progress-kokur"
				class="progress progress-error w-full"
				value={progress.kokurikuler.percentage}
				max="100"
			></progress>
			<p class="text-base-content/70 mt-1 text-xs">
				{progress.kokurikuler.completed} dari {progress.kokurikuler.total} murid sudah dinilai.
			</p>
		</div>
	</div>
</div>
