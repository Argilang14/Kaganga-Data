<script lang="ts">
	import DormEvaluationScope from '$lib/components/keasramaan/DormEvaluationScope.svelte';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';

	import Icon from '$lib/components/icon.svelte';
	import { showModal } from '$lib/components/global-modal.svelte';
	import ImportMatevDialog from '$lib/components/keasramaan/import-matev-dialog.svelte';
	import MataEvaluasiDisplay from '$lib/components/keasramaan/MataEvaluasiDisplay.svelte';

	interface MataEvaluasi {
		id: number;
		nama: string;
		indikator: Array<{
			id: number;
			deskripsi: string;
		}>;
	}

	let { data } = $props<{
		data: Awaited<
			ReturnType<typeof import('$lib/server/dorm-evaluation-pages').loadDormMasterPage>
		>;
	}>();

	const mataEvaluasi = $derived((data.mataEvaluasi as MataEvaluasi[]) ?? []);
	const tableReady = $derived((data.tableReady as boolean) ?? true);
	const asramaLabel = $derived(data.room ? `${data.room.asrama} / ${data.room.nama}` : '-');
	const canEdit = $derived(data.canMaster);
	const contextQuery = $derived(
		new URLSearchParams({
			kamar_id: String(data.room?.id ?? 0),
			semester_id: String(data.period?.id ?? 0),
			...(data.history ? { riwayat: '1' } : {})
		}).toString()
	);

	const navigateToMatEval = () => {
		if (!canEdit) return;
		goto(resolve(`/keasramaan/mata-evaluasi?${contextQuery}`));
	};

	const handleExport = async () => {
		if (!canEdit) return;
		try {
			const response = await fetch(`/api/keasramaan/export?${contextQuery}`);

			if (!response.ok) {
				const errorData = await response.json();
				const message = errorData?.fail || 'Gagal mengekspor data';
				alert(message);
				return;
			}

			// Create blob and download
			const blob = await response.blob();
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;

			// Extract filename from Content-Disposition header
			const contentDisposition = response.headers.get('Content-Disposition');
			let filename = 'Mata-Evaluasi-Keasramaan.xlsx';
			if (contentDisposition) {
				const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
				if (filenameMatch && filenameMatch[1]) {
					filename = filenameMatch[1];
				}
			}

			a.download = filename;
			document.body.appendChild(a);
			a.click();
			window.URL.revokeObjectURL(url);
			document.body.removeChild(a);
		} catch (error) {
			console.error('Export error:', error);
			alert('Terjadi kesalahan saat mengekspor data');
		}
	};
</script>

<div class="alert alert-info alert-soft mb-4 flex items-center gap-2 text-sm">
	<Icon name="info" />
	<span> Halaman ini khusus sekolah yang memiliki program keasramaan. </span>
</div>

<div class="card bg-base-100 rounded-lg border border-none p-4 shadow-md">
	<!-- Judul dan tombol -->
	<div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
		<!-- Judul -->
		<div>
			<h2 class="text-xl font-bold">Daftar Nilai Keasramaan</h2>
			<p class="text-base-content/70 text-sm">Asrama aktif: {asramaLabel}</p>
		</div>
		<!-- Tombol untuk mengelola mata evaluasi -->
		<div class="flex flex-row max-sm:w-full">
			<button
				type="button"
				class="btn btn-soft rounded-r-none shadow-none max-sm:flex-1"
				title="Kelola mata evaluasi keasramaan"
				disabled={!canEdit}
				onclick={navigateToMatEval}
			>
				<Icon name="edit" />
				Kelola Mata Evaluasi
			</button>
			<div class="dropdown dropdown-end">
				<button
					title="Export dan Import keasramaan"
					type="button"
					tabindex="0"
					class="btn btn-soft rounded-l-none shadow-none"
					disabled={!canEdit}
					aria-disabled={!canEdit}
				>
					<Icon name="down" />
				</button>
				<ul
					tabindex="-1"
					class="border-base-300 dropdown-content menu bg-base-100 z-50 mt-2 w-48 rounded-md border p-2 shadow-lg"
				>
					<li>
						<button
							type="button"
							class="w-full text-left"
							disabled={!canEdit}
							aria-disabled={!canEdit}
							onclick={() =>
								showModal({
									title: 'Impor Matev',
									body: ImportMatevDialog,
									bodyProps: { action: `?/import_matev&${contextQuery}` },
									dismissible: true
								})}
						>
							<Icon name="import" />
							Impor Matev
						</button>
					</li>
					<li>
						<button
							type="button"
							class="w-full text-left"
							disabled={!canEdit}
							aria-disabled={!canEdit}
							onclick={handleExport}
						>
							<Icon name="export" />
							Ekspor Matev
						</button>
					</li>
				</ul>
			</div>
		</div>
	</div>

	{#if !tableReady}
		<div class="alert border-error/60 bg-error/10 text-error-content mt-4 border border-dashed">
			<Icon name="warning" />
			<span>
				Database keasramaan belum siap. Jalankan <code>pnpm db:push</code> untuk menerapkan migrasi terbaru.
			</span>
		</div>
	{/if}

	<div class="mt-4">
		<DormEvaluationScope
			rooms={data.rooms}
			room={data.room}
			periods={data.periods}
			period={data.period}
			history={data.history}
		/>
	</div>
	<!-- Daftar Mata Evaluasi dengan Tabel Individual -->
	<MataEvaluasiDisplay {mataEvaluasi} {tableReady} {canEdit} {contextQuery} />
	{#if data.wide && data.legacy.length && data.canMaster}<details class="mt-6">
			<summary class="cursor-pointer text-sm">Salin susunan dari kelas lama</summary>
			<form
				method="POST"
				action={`?/copy_legacy&${contextQuery}`}
				class="mt-2 flex flex-col gap-2 sm:flex-row"
			>
				<input type="hidden" name="operation" value="copy-legacy" /><input
					type="hidden"
					name="kamar_id"
					value={data.room?.id ?? 0}
				/><input type="hidden" name="semester_id" value={data.period?.id ?? 0} /><select
					class="select w-full sm:flex-1"
					name="sumber_lama_id"
					aria-label="Mata evaluasi kelas lama"
					>{#each data.legacy as item (item.id)}<option value={item.id}
							>{item.kelas} · {item.periode} · {item.nama}</option
						>{/each}</select
				><button class="btn btn-soft" type="submit">Salin susunan</button>
			</form>
			<p class="mt-2 text-sm opacity-70">Nilai lama tetap tersimpan pada riwayat kelas.</p>
		</details>{/if}
</div>
