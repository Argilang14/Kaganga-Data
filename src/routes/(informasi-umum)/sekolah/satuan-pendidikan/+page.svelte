<script lang="ts">
	import FormEnhance from '$lib/components/form-enhance.svelte';
	import Icon from '$lib/components/icon.svelte';
	import { resolve } from '$app/paths';
	let { data } = $props();
	const levels = ['sd', 'smp', 'sma'];
	const mappedCount = $derived(data.classes.filter((kelas) => kelas.satuanId !== null).length);
</script>

<div class="space-y-5">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-xl font-bold">Satuan Pendidikan</h1>
		<a href={resolve('/sekolah')} class="btn btn-soft"><Icon name="school" /> Data Sekolah</a>
	</div>
	{#if data.integrated}
		<div class="grid grid-cols-1 gap-4 xl:grid-cols-3">
			{#each levels as level (level)}
				{@const unit = data.units.find((row) => row.jenjang === level)}
				<div class="rounded-lg bg-base-100 p-5 shadow-md">
					<h2 class="mb-4 text-lg font-bold">{level.toUpperCase()}</h2>
					<FormEnhance action="?/saveUnit">
						{#snippet children({ submitting })}
							<input type="hidden" name="jenjang" value={level} />
							<div class="space-y-4">
								<label class="block"
									><span class="mb-1 block">Nama resmi</span><input
										class="input w-full"
										name="nama"
										value={unit?.nama || ''}
										required
										maxlength="200"
									/></label
								>
								<label class="block"
									><span class="mb-1 block">NPSN</span><input
										class="input w-full"
										name="npsn"
										value={unit?.npsn || ''}
										required
										pattern="[0-9]{8}"
										inputmode="numeric"
										minlength="8"
										maxlength="8"
									/></label
								>
								<button class="btn btn-soft w-full" disabled={submitting}
									><Icon name="save" /> Simpan {level.toUpperCase()}</button
								>
							</div>
						{/snippet}
					</FormEnhance>
				</div>
			{/each}
		</div>
		<section class="mapping-section min-w-0 rounded-lg bg-base-100 p-4 shadow-md sm:p-5">
			<div class="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div class="min-w-0">
					<h2 class="flex items-center gap-2 text-lg font-bold">
						<Icon name="school" class="h-5 w-5 shrink-0 text-info" /> Pemetaan Kelas
					</h2>
					<p class="mt-1 text-sm text-base-content/60">
						{data.classes.length} kelas <span class="px-1" aria-hidden="true">/</span>
						{mappedCount} terpetakan
					</p>
				</div>
				<form method="GET" class="w-full lg:w-80 lg:shrink-0">
					<label for="mapping-semester" class="mb-1 block text-sm font-medium"
						>Tahun Ajaran / Semester</label
					>
					<select
						id="mapping-semester"
						name="semester_id"
						class="select w-full"
						value={data.semesterId}
						onchange={(event) => event.currentTarget.form?.requestSubmit()}
						aria-label="Semester pemetaan"
						>{#each data.periods as period (period.id)}<option value={period.id}
								>{period.nama}</option
							>{/each}</select
					>
				</form>
			</div>
			{#key data.semesterId}
				<FormEnhance action="?/mapClasses">
					{#snippet children({ submitting })}
						<input type="hidden" name="semesterId" value={data.semesterId} />
						<div class="overflow-hidden rounded-lg border border-base-300">
							<table
								class="mapping-table table w-full"
								aria-label="Pemetaan kelas ke satuan pendidikan"
							>
								<thead class="bg-base-200/70 text-sm text-base-content/75">
									<tr
										><th scope="col">Kelas</th><th scope="col">Fase</th><th scope="col"
											>Satuan Pendidikan</th
										><th scope="col">NPSN Tersimpan</th></tr
									>
								</thead><tbody>
									{#each data.classes as kelas (kelas.id)}
										<tr class="hover:bg-base-200/35">
											<td class="mapping-class font-semibold"
												><span class="mapping-mobile-label">Kelas</span>{kelas.nama}</td
											>
											<td class="mapping-phase"
												><span class="mapping-mobile-label">Fase</span><span
													class="text-base-content/70">{kelas.fase || '-'}</span
												></td
											>
											<td class="mapping-selection">
												<span class="mapping-mobile-label">Satuan Pendidikan</span>
												<select
													class="select h-10 min-h-10 w-full"
													name={`kelas_${kelas.id}`}
													required
													value={kelas.satuanId ||
														data.units.find((unit) => unit.jenjang === kelas.suggestion)?.id ||
														''}
													aria-label={`Satuan kelas ${kelas.nama}`}
													><option value="">Pilih satuan pendidikan</option
													>{#each data.units as unit (unit.id)}<option value={unit.id}
															>{unit.jenjang.toUpperCase()} - {unit.npsn}</option
														>{/each}</select
												>
											</td>
											<td class="mapping-snapshot">
												<span class="mapping-mobile-label">NPSN Tersimpan</span>
												<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
													{#if kelas.npsn}<span class="font-mono text-sm tabular-nums"
															>{kelas.npsn}</span
														><span class="badge badge-success badge-soft badge-sm whitespace-nowrap"
															>Terpetakan</span
														>
													{:else}<span
															class="badge badge-warning badge-soft badge-sm whitespace-nowrap"
															>Belum dipetakan</span
														>{/if}
												</div>
											</td>
										</tr>
									{:else}
										<tr class="mapping-empty"
											><td colspan="4" class="py-10 text-center text-base-content/60"
												>Belum ada kelas pada semester ini.</td
											></tr
										>
									{/each}
								</tbody>
							</table>
						</div>
						<div
							class="mt-5 flex flex-col gap-4 border-t border-base-200 pt-4 lg:flex-row lg:items-center lg:justify-between"
						>
							<label class="flex min-w-0 cursor-pointer items-start gap-3 text-sm leading-relaxed">
								<input
									class="checkbox checkbox-sm mt-0.5 shrink-0"
									type="checkbox"
									name="confirmed"
									required
								/>
								<span>Pemetaan kelas pada semester ini sudah saya periksa.</span>
							</label>
							<button
								class="btn btn-primary w-full lg:w-auto lg:shrink-0"
								disabled={submitting || !data.classes.length || !data.units.length}
							>
								{#if submitting}<span class="loading loading-spinner loading-sm"></span>{:else}<Icon
										name="save"
									/>{/if}
								{submitting ? 'Menyimpan...' : 'Simpan Pemetaan'}
							</button>
						</div>
					{/snippet}
				</FormEnhance>
			{/key}
		</section>
	{:else}
		<div class="alert">Sekolah ini menggunakan identitas tunggal.</div>
	{/if}
</div>

<style>
	.mapping-table {
		table-layout: fixed;
	}
	.mapping-table th,
	.mapping-table td {
		padding: 0.875rem 1rem;
		vertical-align: middle;
		overflow-wrap: anywhere;
	}
	.mapping-table th:nth-child(1) {
		width: 18%;
	}
	.mapping-table th:nth-child(2) {
		width: 14%;
	}
	.mapping-table th:nth-child(3) {
		width: 35%;
	}
	.mapping-table th:nth-child(4) {
		width: 33%;
	}
	.mapping-mobile-label {
		display: none;
	}
	@media (max-width: 767px) {
		.mapping-table,
		.mapping-table tbody {
			display: block;
		}
		.mapping-table thead {
			display: none;
		}
		.mapping-section .mapping-table tr {
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			gap: 0.75rem 1rem;
			padding: 1rem;
			border-bottom: 1px solid var(--color-base-200);
		}
		.mapping-section .mapping-table tr:last-child {
			border-bottom: 0;
		}
		.mapping-section .mapping-table td {
			display: block;
			min-width: 0;
			max-width: none;
			padding: 0;
			border: 0;
		}
		.mapping-table .mapping-selection,
		.mapping-table .mapping-snapshot,
		.mapping-table .mapping-empty td {
			grid-column: 1 / -1;
		}
		.mapping-mobile-label {
			display: block;
			margin-bottom: 0.25rem;
			font-size: 0.75rem;
			font-weight: 500;
			color: color-mix(in oklab, var(--color-base-content) 60%, transparent);
		}
	}
</style>
