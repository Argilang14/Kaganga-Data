<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import StudentPlacement from './student-placement.svelte';
	import StudentHistory from './student-history.svelte';
	import MuridModals from './modals.svelte';
	import { modalRoute } from '$lib/utils';
	import { passiveStatusLabels } from '$lib/student-status';
	import Icon from '$lib/components/icon.svelte';
	import { showModal } from '$lib/components/global-modal.svelte';
	import type { RegistryStudent } from '$lib/server/student-registry';
	import './student-workspace.css';
	import type { loadStudentRegistry } from '$lib/server/student-registry';
	let { data }: { data: Awaited<ReturnType<typeof loadStudentRegistry>> } = $props();
	const registry = $derived(data.registry);
	function pageHref(number: number) {
		const params = new URLSearchParams(page.url.search);
		params.set('page', String(number));
		const pathname = (
			{
				semua: '/murid/semua',
				pasif: '/murid/pasif',
				asrama: '/murid/asrama',
				kelas: '/murid'
			} as const
		)[registry.view];
		return `${pathname}?${params}` as const;
	}
	const statusLabels: Record<string, string> = {
		...passiveStatusLabels,
		aktif: 'Aktif',
		pindah: 'Pindah sekolah',
		keluar: 'Keluar sekolah',
		alumni: 'Alumni'
	};
	function showHistory(student: RegistryStudent) {
		showModal({
			title: 'Riwayat murid',
			body: StudentHistory,
			bodyProps: { student },
			dismissible: true,
			onNeutral: { label: 'Tutup' }
		});
	}
</script>

<section
	class="student-workspace rounded-lg bg-base-100 p-4 shadow-md"
	class:student-dorm-workspace={registry.view === 'asrama'}
>
	<header class="mb-5 flex flex-wrap items-start justify-between gap-4">
		<div class="min-w-0">
			<h2 class="text-xl font-bold">{data.meta.title}</h2>
			<p class="mt-1 text-sm text-base-content/70">
				{#if registry.view === 'semua'}Data murid aktif dan nonaktif, beserta riwayat penempatannya.
				{:else if registry.view === 'pasif'}Murid yang belum mendapat kelas atau asrama, serta murid
					nonaktif.
				{:else}Daftar penghuni sesuai asrama yang dipilih.{/if}
			</p>
		</div>
		{#if registry.view === 'pasif'}
			<a class="btn btn-primary gap-2" href={resolve('/murid/form')}
				><Icon name="plus" />Tambah murid</a
			>
		{:else if registry.view === 'asrama'}<StudentPlacement {registry} />{/if}
	</header>

	<form method="GET" class="student-toolbar mb-5">
		{#if registry.view === 'asrama'}
			<label class="fieldset w-full sm:w-64">
				<span class="fieldset-legend">Asrama</span>
				<select
					class="select w-full"
					name="kamar_id"
					value={registry.roomId ?? ''}
					onchange={(event) => event.currentTarget.form?.requestSubmit()}
				>
					<option value="">Pilih asrama</option>
					{#each registry.rooms as room (room.id)}<option value={room.id}
							>{room.asrama === room.nama ? room.nama : room.asrama + ' / ' + room.nama}</option
						>{/each}
				</select>
			</label>
		{/if}
		<label class="fieldset student-search min-w-0">
			<span class="fieldset-legend">Cari murid</span>
			<span class="input flex w-full items-center gap-2"
				><Icon name="search" /><input
					type="search"
					name="q"
					value={registry.query}
					placeholder="Nama, NIS, atau NISN"
				/></span
			>
		</label>
		{#if registry.view === 'pasif'}<label class="fieldset w-full sm:w-60"
				><span class="fieldset-legend">Status</span><select
					class="select w-full"
					name="status"
					value={registry.statusFilter}
					><option value="">Semua status</option
					>{#each Object.entries(statusLabels) as [value, label] (value)}<option {value}
							>{label}</option
						>{/each}</select
				></label
			>{/if}
		<button class="btn btn-soft" type="submit">Cari</button>
	</form>

	<div class="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
		<p>
			<strong>{registry.total}</strong>
			<span class="text-base-content/70">murid{registry.query ? ' ditemukan' : ''}</span>
		</p>
		{#if registry.total}<span class="text-base-content/60"
				>{(registry.page - 1) * 20 + 1}–{Math.min(registry.page * 20, registry.total)} dari {registry.total}</span
			>{/if}
	</div>
	{#if registry.students.length}
		<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard access to horizontally scrollable table.) -->
		<div
			class="student-table-scroll"
			tabindex="0"
			role="region"
			aria-label={'Tabel ' + data.meta.title}
		>
			<table class="table student-table">
				<colgroup
					><col class="student-number" /><col /><col class="student-status" /><col
						class="student-class"
					/><col class="student-dorm" />{#if registry.view === 'asrama'}<col
							class="student-caregiver"
						/>{/if}<col class="student-actions" />{#if registry.view === 'asrama'}<col
							class="student-row-actions"
						/>{/if}</colgroup
				>
				<thead
					><tr
						><th scope="col">No</th><th scope="col">Nama murid</th><th scope="col">Status</th><th
							scope="col">Kelas</th
						><th scope="col">Asrama</th>{#if registry.view === 'asrama'}<th scope="col"
								>Wali Asuh</th
							>{/if}<th scope="col" class="text-right">Riwayat</th
						>{#if registry.view === 'asrama'}<th scope="col">Aksi</th>{/if}</tr
					></thead
				>
				<tbody>
					{#each registry.students as student, index (student.id)}
						<tr>
							<td class="text-base-content/60">{(registry.page - 1) * 20 + index + 1}</td>
							<td
								><a
									class="font-semibold hover:text-primary hover:underline"
									href={resolve(`/murid/${student.id}`)}>{student.nama}</a
								>
								<div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-base-content/60">
									<span>NIS: {student.nis || '—'}</span><span>NISN: {student.nisn || '—'}</span>
								</div></td
							>
							<td
								><span
									class="badge badge-sm badge-soft h-auto py-1 text-left whitespace-normal"
									class:badge-success={student.status === 'aktif' &&
										!student.review &&
										!student.placement_status}
									class:badge-warning={student.review === 1 ||
										!!student.placement_status ||
										student.status === 'pindah'}
									class:badge-neutral={student.status === 'keluar' || student.status === 'alumni'}
									>{student.review
										? 'Periksa identitas'
										: (statusLabels[student.placement_status ?? student.status] ??
											student.status)}</span
								>{#if student.tanggal_status}<p class="mt-1 text-xs text-base-content/60">
										{student.tanggal_status}
									</p>{/if}{#if student.alasan}<p
										class="mt-1 line-clamp-2 text-xs break-words text-base-content/60"
										title={student.alasan}
									>
										{student.alasan}
									</p>{/if}</td
							>
							<td class={!student.kelas ? 'text-base-content/55' : ''}
								>{student.kelas ??
									'Belum ditempatkan'}{#if !student.kelas && student.classHistory[0]}<p
										class="mt-1 text-xs text-base-content/60"
									>
										Terakhir: {student.classHistory[0].kelas_snapshot}
									</p>{/if}</td
							>
							<td class={!student.asrama ? 'text-base-content/55' : ''}
								>{student.asrama?.replace(/^(.+) \/ \1$/, '$1') ??
									'Belum ditempatkan'}{#if !student.asrama && student.dormHistory[0]}<p
										class="mt-1 text-xs text-base-content/60"
									>
										Terakhir: {student.dormHistory[0].asrama}
									</p>{/if}</td
							>
							{#if registry.view === 'asrama'}
								<td class={!student.wali_asuh ? 'text-base-content/55' : ''}
									>{student.wali_asuh || 'Belum ditentukan'}</td
								>
							{/if}
							<td class="text-right"
								><button
									class="btn btn-sm btn-soft"
									type="button"
									aria-label={'Riwayat ' + student.nama}
									onclick={() => showHistory(student)}>Riwayat</button
								></td
							>
							{#if registry.view === 'asrama'}
								<td>
									<div class="flex flex-row">
										<a
											class="btn btn-sm btn-soft pointer-events-auto rounded-r-none shadow-none"
											href={resolve(`/murid/${student.id}`)}
											use:modalRoute={'detail-murid'}
											title="Lihat detail murid"
											aria-label={'Lihat detail ' + student.nama}><Icon name="eye" /></a
										>
										{#if student.canPassivate}
											<a
												class="btn btn-sm btn-error btn-soft rounded-l-none shadow-none"
												href={resolve(`/murid/${student.id}/delete`)}
												use:modalRoute={'delete-murid'}
												title="Jadikan pasif murid"
												aria-label={'Jadikan pasif ' + student.nama}><Icon name="del" /></a
											>
										{:else}
											<button
												type="button"
												class="btn btn-sm btn-disabled rounded-l-none shadow-none"
												disabled
												aria-disabled="true"
												title="Anda tidak memiliki izin menjadikan murid ini pasif"
												aria-label={'Jadikan pasif ' + student.nama}><Icon name="del" /></button
											>
										{/if}
									</div>
								</td>
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="mt-2 text-xs text-base-content/60 xl:hidden">
			Geser tabel untuk melihat seluruh kolom.
		</p>
	{:else}
		<div class="rounded-lg border border-base-300 px-4 py-12 text-center" role="status">
			<Icon name="users" class="mx-auto mb-3 size-8 text-base-content/40" />
			<p class="font-semibold">
				{registry.view === 'asrama' && !registry.roomId
					? 'Pilih asrama terlebih dahulu'
					: registry.query
						? 'Murid tidak ditemukan'
						: 'Belum ada murid'}
			</p>
			<p class="mt-1 text-sm text-base-content/60">
				{registry.view === 'asrama' && !registry.roomId
					? 'Gunakan pilihan asrama untuk menampilkan penghuninya.'
					: registry.query
						? 'Coba nama atau nomor identitas lainnya.'
						: registry.view === 'pasif'
							? 'Gunakan Tambah murid untuk mulai mengisi data.'
							: 'Data akan tampil setelah murid ditambahkan atau ditempatkan.'}
			</p>
		</div>
	{/if}
	<footer class="mt-4 flex flex-wrap items-center justify-between gap-3">
		<span class="text-sm text-base-content/65"
			>Halaman {registry.page} dari {registry.pageCount}</span
		>
		<div class="join">
			<button
				class="btn btn-sm join-item"
				disabled={registry.page <= 1}
				onclick={() => goto(resolve(pageHref(registry.page - 1)))}>Sebelumnya</button
			><button
				class="btn btn-sm join-item"
				disabled={registry.page >= registry.pageCount}
				onclick={() => goto(resolve(pageHref(registry.page + 1)))}>Berikutnya</button
			>
		</div>
	</footer>
</section>

{#if registry.view === 'asrama'}
	<MuridModals formSubmitting={false} submitBulkDelete={(event) => event.preventDefault()} />
{/if}
