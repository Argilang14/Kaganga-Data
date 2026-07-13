<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '$lib/components/icon.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import type { PageData } from './$types';

	const { data } = $props<{ data: PageData }>();

	type Kelas = { id: number; nama: string; fase?: string | null };
	type JadwalEntry = { hari: string; jamKe: number; kelasId: number; kodeKegiatan: string };
	type JenjangFilter = 'semua' | 'srd' | 'srmp' | 'srma';
	type TableDensity = 'normal' | 'padat';
	type PaletteItem = {
		source: 'mapel' | 'kegiatan';
		id: number;
		kode: string;
		nama: string;
		warna: string | null;
		detail: string | null;
		jenjang?: JenjangFilter;
		jpPerMinggu?: number;
		guruId?: number | null;
		guru?: string | null;
	};
	type DropScope = 'cell' | 'jenjang' | 'row' | 'sameJamAllDays';
	type PendingDrop = { item: PaletteItem; hari: string; jamKe: number; kelasId: number };
	type SelectedCell = { hari: string; jamKe: number; kelasId: number; kode: string };

	const hariList = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
	const hariLabel: Record<string, string> = {
		senin: 'Senin',
		selasa: 'Selasa',
		rabu: 'Rabu',
		kamis: 'Kamis',
		jumat: 'Jumat',
		sabtu: 'Sabtu'
	};
	const jenjangLabel: Record<string, string> = { srd: 'SRD', srmp: 'SRMP', srma: 'SRMA/SRT' };

	const daftarKelas = $derived((data.daftarKelas ?? []) as Kelas[]);
	const mapelItems = $derived(
		(
			(data.daftarMapelItems ?? []) as Array<{
				id: number;
				kode: string;
				nama: string;
				jenjang: string;
				kategori: string;
				warna: string | null;
				jpPerMinggu: number;
				guruId: number | null;
				guru: string | null;
			}>
		).map((item) => ({
			source: 'mapel' as const,
			id: item.id,
			kode: item.kode,
			nama: item.nama,
			warna: item.warna ?? '#dbeafe',
			detail: item.guru ?? String(item.jpPerMinggu ?? 0) + ' JP/minggu',
			jenjang: item.jenjang as JenjangFilter,
			jpPerMinggu: item.jpPerMinggu ?? 0,
			guruId: item.guruId,
			guru: item.guru
		}))
	);
	const kegiatanItems = $derived(
		(
			(data.daftarKegiatanItems ?? []) as Array<{
				id: number;
				kode: string;
				nama: string;
				kategori: string;
				warna: string | null;
			}>
		).map((item) => ({
			source: 'kegiatan' as const,
			id: item.id,
			kode: item.kode,
			nama: item.nama,
			warna: item.warna ?? '#dcfce7',
			detail: item.kategori
		}))
	);
	const paletteItems = $derived([...mapelItems, ...kegiatanItems]);
	const canManage = $derived(
		((page.data.user as { permissions?: string[] } | null)?.permissions ?? []).includes(
			'rapor_manage'
		)
	);
	const savedJadwal = $derived((data.jadwalPelajaran ?? []) as JadwalEntry[]);

	let cells = $state<Record<string, string>>({});
	let jumlahJam = $state(8);
	let saving = $state(false);
	let settingsSaving = $state(false);
	let jamMulai = $state('07:00');
	let jamPelajaranMenit = $state(35);
	let durasiIstirahat = $state(30);
	let durasiUpacara = $state(70);
	let bellActive = $state(false);
	let activePalette = $state<'mapel' | 'kegiatan'>('mapel');
	let activeJenjang = $state<JenjangFilter>('semua');
	let tableDensity = $state<TableDensity>('normal');
	let paletteSearch = $state('');
	let draggedItem = $state<PaletteItem | null>(null);
	let pendingDrop = $state<PendingDrop | null>(null);
	let selectedCell = $state<SelectedCell | null>(null);
	let editKode = $state('');
	let dropDialog = $state<HTMLDialogElement | null>(null);
	let cellDialog = $state<HTMLDialogElement | null>(null);

	const kodeMeta = $derived.by(() => {
		const map = new Map<string, PaletteItem>();
		for (const item of paletteItems) map.set(item.kode, item);
		return map;
	});
	const teacherByCode = $derived.by(() => {
		const groups = new Map<string, PaletteItem[]>();
		for (const item of mapelItems) {
			const group = groups.get(item.kode) ?? [];
			group.push(item);
			groups.set(item.kode, group);
		}
		const result = new Map<string, { id: number; nama: string }>();
		for (const [kode, group] of groups) {
			const ids = [...new Set(group.map((item) => item.guruId).filter((id): id is number => !!id))];
			if (ids.length !== 1) continue;
			const teacher = group.find((item) => item.guruId === ids[0]);
			result.set(kode, { id: ids[0], nama: teacher?.guru ?? 'Guru' });
		}
		return result;
	});
	const teacherConflicts = $derived.by(() => {
		const slots = new Map<string, { guru: string; hari: string; jamKe: number; kelasIds: Set<number>; cellKeys: string[] }>();
		for (const [cellKey, kode] of Object.entries(cells)) {
			const teacher = teacherByCode.get(kode);
			if (!teacher) continue;
			const [hari, jamRaw, kelasRaw] = cellKey.split('|');
			const jamKe = Number(jamRaw);
			const kelasId = Number(kelasRaw);
			const key = hari + '|' + jamKe + '|' + teacher.id;
			const slot = slots.get(key) ?? { guru: teacher.nama, hari, jamKe, kelasIds: new Set<number>(), cellKeys: [] };
			slot.kelasIds.add(kelasId);
			slot.cellKeys.push(cellKey);
			slots.set(key, slot);
		}
		return [...slots.values()].filter((slot) => slot.kelasIds.size > 1).map((slot) => ({
			...slot,
			kelas: [...slot.kelasIds].map((id) => daftarKelas.find((kelas) => kelas.id === id)?.nama ?? 'Kelas ' + id)
		}));
	});
	const conflictCellKeys = $derived(new Set(teacherConflicts.flatMap((conflict) => conflict.cellKeys)));
	const visiblePaletteItems = $derived.by(() => {
		const query = paletteSearch.trim().toLowerCase();
		return paletteItems.filter((item) => {
			if (item.source !== activePalette) return false;
			if (!query) return true;
			return `${item.kode} ${item.nama} ${item.detail ?? ''}`.toLowerCase().includes(query);
		});
	});
	const selectedKelas = $derived.by(() =>
		selectedCell ? daftarKelas.find((kelas) => kelas.id === selectedCell?.kelasId) : null
	);
	const pendingKelas = $derived.by(() =>
		pendingDrop ? daftarKelas.find((kelas) => kelas.id === pendingDrop?.kelasId) : null
	);
	const pendingJenjang = $derived(pendingKelas ? kelasJenjang(pendingKelas) : 'semua');
	const visibleKelas = $derived.by(() =>
		activeJenjang === 'semua'
			? daftarKelas
			: daftarKelas.filter((kelas) => kelasJenjang(kelas) === activeJenjang)
	);
	const activeJenjangName = $derived(jenjangLabel[activeJenjang] ?? 'Semua Jenjang');
	const scheduleChecks = $derived.by(() => {
		const visibleIds = new Set(visibleKelas.map((kelas) => kelas.id));
		const unknownCodes = new Set<string>();
		let filledSlots = 0;

		for (const [key, kode] of Object.entries(cells)) {
			const [, , kelasIdRaw] = key.split('|');
			const kelasId = Number(kelasIdRaw);
			if (!visibleIds.has(kelasId) || !kode) continue;
			filledSlots += 1;
			if (!kodeMeta.has(kode)) unknownCodes.add(kode);
		}

		const jpIssues: Array<{
			kelas: string;
			kode: string;
			nama: string;
			target: number;
			actual: number;
		}> = [];
		for (const kelas of visibleKelas) {
			const jenjang = kelasJenjang(kelas);
			for (const item of mapelItems) {
				const target = item.jpPerMinggu ?? 0;
				if (target <= 0) continue;
				if (item.jenjang !== 'semua' && item.jenjang !== jenjang) continue;
				let actual = 0;
				for (const hari of hariList) {
					for (let jamKe = 1; jamKe <= jumlahJam; jamKe += 1) {
						if (cells[keyFor(hari, jamKe, kelas.id)] === item.kode) actual += 1;
					}
				}
				if (actual !== target) {
					jpIssues.push({ kelas: kelas.nama, kode: item.kode, nama: item.nama, target, actual });
				}
			}
		}

		return {
			filledSlots,
			unknownCodes: [...unknownCodes],
			jpIssues,
			visibleSlotTotal: visibleKelas.length * hariList.length * jumlahJam
		};
	});

	$effect(() => {
		const nextCells: Record<string, string> = {};
		for (const entry of savedJadwal) {
			nextCells[`${entry.hari}|${entry.jamKe}|${entry.kelasId}`] = entry.kodeKegiatan;
		}
		cells = nextCells;
		jumlahJam = Math.max(8, ...savedJadwal.map((entry) => entry.jamKe), 8);
	});

	$effect(() => {
		jamMulai = data.bellSettings?.jamMulai ?? '07:00';
		jamPelajaranMenit = data.bellSettings?.jamPelajaranMenit ?? 35;
		durasiIstirahat = data.bellSettings?.durasiIstirahat ?? 30;
		durasiUpacara = data.bellSettings?.durasiUpacara ?? 70;
		bellActive = Boolean(data.bellSettings?.isActive);
	});

	function keyFor(hari: string, jamKe: number, kelasId: number) {
		return `${hari}|${jamKe}|${kelasId}`;
	}

	function kelasJenjang(kelas: Kelas | null | undefined) {
		const raw = `${kelas?.fase ?? ''} ${kelas?.nama ?? ''}`.toLowerCase();
		if (/\b(srd|fase\s*[abc])\b/.test(raw) || /\b(iv|v|vi)\b/i.test(kelas?.nama ?? ''))
			return 'srd';
		if (/\b(srmp|fase\s*d)\b/.test(raw) || /\b(vii|viii|ix)\b/i.test(kelas?.nama ?? ''))
			return 'srmp';
		if (/\b(srma|srt|fase\s*[ef])\b/.test(raw) || /\b(x|xi|xii)\b/i.test(kelas?.nama ?? ''))
			return 'srma';
		return 'semua';
	}

	function setCell(hari: string, jamKe: number, kelasId: number, kode: string) {
		const key = keyFor(hari, jamKe, kelasId);
		if (kode) cells[key] = kode;
		else delete cells[key];
		cells = { ...cells };
	}

	function setMany(targets: Array<{ hari: string; jamKe: number; kelasId: number }>, kode: string) {
		const next = { ...cells };
		for (const target of targets) {
			const key = keyFor(target.hari, target.jamKe, target.kelasId);
			if (kode) next[key] = kode;
			else delete next[key];
		}
		cells = next;
	}

	function fillRow(hari: string, jamKe: number, kode: string) {
		setMany(
			visibleKelas.map((kelas) => ({ hari, jamKe, kelasId: kelas.id })),
			kode
		);
	}

	function clearAll() {
		cells = {};
	}

	function normalizeColor(value: string | null | undefined, fallback: string) {
		return /^#[0-9a-fA-F]{6}$/.test(value ?? '') ? value! : fallback;
	}

	function cellStyle(kode: string | undefined) {
		const item = kode ? kodeMeta.get(kode) : null;
		if (!item) return '';
		const color = normalizeColor(item.warna, item.source === 'mapel' ? '#dbeafe' : '#dcfce7');
		return `background:${color};border-color:${color};`;
	}

	function textFor(kode: string | undefined) {
		return kode ? (kodeMeta.get(kode)?.nama ?? kode) : '';
	}

	function detailFor(kode: string | undefined) {
		return kode ? (kodeMeta.get(kode)?.detail ?? '') : '';
	}

	function startDrag(event: DragEvent, item: PaletteItem) {
		if (!canManage || !event.dataTransfer) return;
		draggedItem = item;
		event.dataTransfer.effectAllowed = 'copy';
		event.dataTransfer.setData('application/json', JSON.stringify(item));
		event.dataTransfer.setData('text/plain', item.kode);
	}

	function allowDrop(event: DragEvent) {
		if (!canManage) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
	}

	function readDraggedItem(event: DragEvent) {
		let item = draggedItem;
		const raw = event.dataTransfer?.getData('application/json');
		if (raw) {
			try {
				item = JSON.parse(raw) as PaletteItem;
			} catch {
				item = draggedItem;
			}
		}
		return item;
	}

	function dropToCell(event: DragEvent, hari: string, jamKe: number, kelasId: number) {
		if (!canManage) return;
		event.preventDefault();
		const item = readDraggedItem(event);
		if (!item?.kode) return;
		pendingDrop = { item, hari, jamKe, kelasId };
		draggedItem = null;
		dropDialog?.showModal();
	}

	function targetsForDrop(scope: DropScope) {
		if (!pendingDrop) return [];
		const { hari, jamKe, kelasId } = pendingDrop;
		if (scope === 'cell') return [{ hari, jamKe, kelasId }];
		if (scope === 'row') return visibleKelas.map((kelas) => ({ hari, jamKe, kelasId: kelas.id }));
		if (scope === 'sameJamAllDays') {
			return hariList.flatMap((day) =>
				visibleKelas.map((kelas) => ({ hari: day, jamKe, kelasId: kelas.id }))
			);
		}
		const targetJenjang = pendingJenjang;
		return visibleKelas
			.filter((kelas) => kelasJenjang(kelas) === targetJenjang)
			.map((kelas) => ({ hari, jamKe, kelasId: kelas.id }));
	}

	function overwriteCountForDrop(scope: DropScope) {
		if (!pendingDrop) return 0;
		return targetsForDrop(scope).filter((target) => {
			const existing = cells[keyFor(target.hari, target.jamKe, target.kelasId)];
			return existing && existing !== pendingDrop.item.kode;
		}).length;
	}
	function applyPendingDrop(scope: DropScope) {
		if (!pendingDrop) return;
		setMany(targetsForDrop(scope), pendingDrop.item.kode);
		pendingDrop = null;
		dropDialog?.close();
	}

	function openCell(hari: string, jamKe: number, kelasId: number, kode: string) {
		if (!canManage) return;
		selectedCell = { hari, jamKe, kelasId, kode };
		editKode = kode;
		cellDialog?.showModal();
	}

	function saveSelectedCell() {
		if (!selectedCell) return;
		setCell(selectedCell.hari, selectedCell.jamKe, selectedCell.kelasId, editKode);
		selectedCell = null;
		cellDialog?.close();
	}

	function clearSelectedCell() {
		if (!selectedCell) return;
		setCell(selectedCell.hari, selectedCell.jamKe, selectedCell.kelasId, '');
		selectedCell = null;
		cellDialog?.close();
	}

	async function postAction(action: string, formData: FormData) {
		const res = await fetch(`?/${action}`, { method: 'POST', body: formData, redirect: 'error' });
		if (!res.ok) {
			let message = 'Gagal memproses permintaan';
			try {
				const payload = await res.json();
				message = payload?.data?.fail ?? payload?.fail ?? message;
			} catch {
				// ignore non-json action response
			}
			throw new Error(message);
		}
	}

	async function saveSettings() {
		if (!canManage || settingsSaving) return;
		settingsSaving = true;
		const formData = new FormData();
		formData.set('jamMulai', jamMulai);
		formData.set('jamPelajaranMenit', String(jamPelajaranMenit));
		formData.set('durasiIstirahat', String(durasiIstirahat));
		formData.set('durasiUpacara', String(durasiUpacara));
		formData.set('isActive', bellActive ? '1' : '0');
		try {
			await postAction('saveSettings', formData);
			toast('Pengaturan jadwal tersimpan', 'success');
			await invalidateAll();
		} catch (error) {
			toast(error instanceof Error ? error.message : 'Gagal menyimpan pengaturan', 'error');
		} finally {
			settingsSaving = false;
		}
	}

	async function saveJadwal() {
		if (!canManage || saving) return;
		saving = true;
		const entries = Object.entries(cells)
			.map(([key, kode]) => {
				const [hari, jamKe, kelasId] = key.split('|');
				return { hari, jamKe: Number(jamKe), kelasId: Number(kelasId), kodeKegiatan: kode };
			})
			.filter((entry) => entry.kodeKegiatan);
		const formData = new FormData();
		formData.set('data', JSON.stringify(entries));
		try {
			await postAction('saveJadwal', formData);
			toast('Jadwal pelajaran tersimpan', 'success');
			await invalidateAll();
		} catch (error) {
			toast(error instanceof Error ? error.message : 'Gagal menyimpan jadwal', 'error');
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>Jadwal Pelajaran</title>
</svelte:head>

<div class="grid grid-cols-1 gap-4">
	<section class="bg-base-100 rounded-lg p-4 shadow-md">
		<div class="flex flex-wrap items-center gap-2">
			<a href="/rapor" class="btn btn-soft shadow-none">
				<Icon name="left" />
				Kembali
			</a>
			<div class="min-w-0 flex-1">
				<h1 class="text-xl font-bold">Jadwal Pelajaran</h1>
				<p class="text-base-content/70 text-sm">Kelola jadwal kelas dan kode kegiatan.</p>
			</div>
			<button
				class="btn btn-primary shadow-none"
				type="button"
				onclick={saveJadwal}
				disabled={!canManage || saving}
			>
				{#if saving}
					<span class="loading loading-spinner loading-sm"></span>
					Menyimpan
				{:else}
					<Icon name="save" />
					Simpan Jadwal
				{/if}
			</button>
		</div>
	</section>

	<section class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
		<div class="bg-base-100 flex min-h-0 flex-col rounded-lg p-4 shadow-md">
			<div class="mb-3 flex flex-wrap items-end gap-2">
				<label class="form-control w-40">
					<span class="label-text text-xs">Jenjang</span>
					<select class="select select-sm bg-base-200" bind:value={activeJenjang}>
						<option value="semua">Semua Jenjang</option>
						<option value="srd">SRD</option>
						<option value="srmp">SRMP</option>
						<option value="srma">SRMA</option>
					</select>
				</label>
				<div class="form-control">
					<span class="label-text text-xs">Tampilan</span>
					<div class="join">
						<button
							class="btn btn-sm join-item"
							class:btn-primary={tableDensity === 'normal'}
							type="button"
							onclick={() => (tableDensity = 'normal')}>Normal</button
						>
						<button
							class="btn btn-sm join-item"
							class:btn-primary={tableDensity === 'padat'}
							type="button"
							onclick={() => (tableDensity = 'padat')}>Padat</button
						>
					</div>
				</div>
				<button
					class="btn btn-sm btn-soft shadow-none"
					type="button"
					onclick={clearAll}
					disabled={!canManage}
				>
					<Icon name="del" />
					Kosongkan
				</button>
			</div>

			<div
				class="alert mb-3 items-start gap-3"
				class:alert-success={scheduleChecks.jpIssues.length === 0 &&
					scheduleChecks.unknownCodes.length === 0 &&
					scheduleChecks.teacherConflicts.length === 0}
				class:alert-warning={scheduleChecks.jpIssues.length > 0 ||
					scheduleChecks.unknownCodes.length > 0 ||
					scheduleChecks.teacherConflicts.length > 0}
			>
				<Icon
					name={scheduleChecks.jpIssues.length === 0 &&
						scheduleChecks.unknownCodes.length === 0 &&
						scheduleChecks.teacherConflicts.length === 0
						? 'check'
						: 'warning'}
				/>
				<div class="min-w-0 flex-1 text-sm">
					<div class="font-semibold">
						Pemeriksaan {activeJenjangName}: {scheduleChecks.filledSlots}/{scheduleChecks.visibleSlotTotal}
						slot terisi.
					</div>
					{#if scheduleChecks.unknownCodes.length}
						<div class="mt-1">Kode belum dikenal: {scheduleChecks.unknownCodes.join(', ')}</div>
					{/if}
					{#if scheduleChecks.teacherConflicts.length}
						{#each scheduleChecks.teacherConflicts.slice(0, 6) as conflict}
							<div class='mt-1 font-semibold text-error'>Bentrok guru {conflict.guru}: {hariLabel[conflict.hari]} jam ke-{conflict.jamKe} di {conflict.kelas.join(', ')}.</div>
						{/each}
					{/if}
					{#if scheduleChecks.jpIssues.length}
						<div class="mt-1 grid gap-1 md:grid-cols-2">
							{#each scheduleChecks.jpIssues.slice(0, 6) as issue (`${issue.kelas}-${issue.kode}`)}
								<div>
									{issue.kelas} - {issue.kode}: {issue.actual}/{issue.target} JP
								</div>
							{/each}
						</div>
						{#if scheduleChecks.jpIssues.length > 6}
							<div class="mt-1">+{scheduleChecks.jpIssues.length - 6} catatan lain.</div>
						{/if}
					{:else if scheduleChecks.unknownCodes.length === 0}
						<div class="mt-1">Target JP/minggu sudah sesuai untuk mapel yang memiliki jatah.</div>
					{/if}
				</div>
			</div>

			{#if daftarKelas.length === 0}
				<div class="alert alert-warning">Belum ada kelas pada semester aktif.</div>
			{:else if visibleKelas.length === 0}
				<div class="alert alert-info">Tidak ada kelas pada filter jenjang ini.</div>
			{:else}
				<div class="border-base-300 min-h-[32rem] flex-1 overflow-auto rounded-md border lg:min-h-[calc(100vh-22rem)]">
					<table
						class="table-sm schedule-table table"
						class:compact-schedule={tableDensity === 'padat'}
					>
						<thead class="sticky top-0 z-10">
							<tr>
								<th class="schedule-head sticky-col sticky-col-day w-24">Hari</th>
								<th class="schedule-head sticky-col sticky-col-jam w-16 text-center">Jam</th>
								{#each visibleKelas as kelas (kelas.id)}
									<th class="schedule-head min-w-40 text-center">{kelas.nama}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each hariList as hari (hari)}
								{#each Array.from({ length: jumlahJam }, (_, index) => index + 1) as jamKe (jamKe)}
									<tr>
										{#if jamKe === 1}
											<td
												class="sticky-col sticky-col-day bg-base-100 align-top font-semibold"
												rowspan={jumlahJam}>{hariLabel[hari]}</td
											>
										{/if}
										<td class="sticky-col sticky-col-jam bg-base-100 text-center font-semibold"
											>{jamKe}</td
										>
										{#each visibleKelas as kelas (kelas.id)}
											{@const key = keyFor(hari, jamKe, kelas.id)}
											{@const kode = cells[key]}
											<td class="schedule-cell">
												<button
													class={`slot-button ${kode ? 'has-value' : ''}`}
													class:is-conflict={conflictCellKeys.has(key)}
													type="button"
													style={cellStyle(kode)}
													ondragover={allowDrop}
													ondrop={(event) => dropToCell(event, hari, jamKe, kelas.id)}
													onclick={() => openCell(hari, jamKe, kelas.id, kode ?? '')}
													disabled={!canManage}
													title={kode ? `${kode} - ${textFor(kode)}` : 'Kosong'}
												>
													{#if kode}
														<span class="slot-code">{kode}</span>
														<span class="slot-name">{textFor(kode)}</span>
														{#if detailFor(kode)}<span class="slot-detail">{detailFor(kode)}</span
															>{/if}
													{:else}
														<span class="slot-empty">-</span>
													{/if}
												</button>
											</td>
										{/each}
									</tr>
								{/each}
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

		<aside class="space-y-4">
			<div class="bg-base-100 rounded-lg p-4 shadow-md">
				<div class="mb-3 flex items-center gap-2">
					<h2 class="flex-1 font-bold">Item Jadwal</h2>
					<span class="badge badge-soft">{visiblePaletteItems.length}</span>
				</div>
				<div class="join mb-3 grid grid-cols-2">
					<button
						class="btn btn-sm join-item"
						class:btn-primary={activePalette === 'mapel'}
						type="button"
						onclick={() => (activePalette = 'mapel')}>Mata Pelajaran</button
					>
					<button
						class="btn btn-sm join-item"
						class:btn-primary={activePalette === 'kegiatan'}
						type="button"
						onclick={() => (activePalette = 'kegiatan')}>Kegiatan</button
					>
				</div>
				<label class="input input-sm bg-base-200 mb-3 flex items-center gap-2">
					<Icon name="search" />
					<input class="grow" placeholder="Cari kode" bind:value={paletteSearch} />
				</label>
				<div class="max-h-[560px] space-y-2 overflow-y-auto pr-1">
					{#each visiblePaletteItems as item (`${item.source}-${item.id}`)}
						<button
							class="palette-item"
							type="button"
							draggable={canManage}
							ondragstart={(event) => startDrag(event, item)}
							disabled={!canManage}
						>
							<span
								class="palette-swatch"
								style={`background:${normalizeColor(item.warna, item.source === 'mapel' ? '#dbeafe' : '#dcfce7')}`}
							></span>
							<span class="min-w-0 flex-1 text-left">
								<span class="block leading-tight font-bold">{item.kode}</span>
								<span class="text-base-content/70 block truncate text-xs">{item.nama}</span>
							</span>
							{#if item.detail}<span class="badge badge-outline max-w-24 truncate"
									>{item.detail}</span
								>{/if}
						</button>
					{:else}
						<div class="border-base-200 text-base-content/60 rounded-lg border p-3 text-sm">
							Data belum tersedia.
						</div>
					{/each}
				</div>
			</div>

		</aside>
	</section>
</div>

<dialog class="modal" bind:this={dropDialog}>
	<div class="modal-box max-w-md">
		<h3 class="text-lg font-bold">Terapkan Item Jadwal</h3>
		{#if pendingDrop}
			<p class="text-base-content/70 mt-1 text-sm">
				{pendingDrop.item.kode} - {pendingDrop.item.nama} ke {hariLabel[pendingDrop.hari]} jam {pendingDrop.jamKe}.
			</p>
			<div class="mt-4 grid gap-2">
				<button
					class="btn btn-primary justify-start shadow-none"
					type="button"
					onclick={() => applyPendingDrop('cell')}
				>
					<span class="flex-1 text-left">Cell ini saja</span>
					{#if overwriteCountForDrop('cell')}<span class="badge badge-warning"
							>Timpa {overwriteCountForDrop('cell')}</span
						>{/if}
				</button>
				<button
					class="btn btn-soft justify-start shadow-none"
					type="button"
					onclick={() => applyPendingDrop('jenjang')}
				>
					<span class="flex-1 text-left"
						>Semua kelas jenjang {jenjangLabel[pendingJenjang] ?? 'yang sama'}</span
					>
					{#if overwriteCountForDrop('jenjang')}<span class="badge badge-warning"
							>Timpa {overwriteCountForDrop('jenjang')}</span
						>{/if}
				</button>
				<button
					class="btn btn-soft justify-start shadow-none"
					type="button"
					onclick={() => applyPendingDrop('row')}
				>
					<span class="flex-1 text-left">Semua kelas pada jam ini</span>
					{#if overwriteCountForDrop('row')}<span class="badge badge-warning"
							>Timpa {overwriteCountForDrop('row')}</span
						>{/if}
				</button>
				<button
					class="btn btn-soft justify-start shadow-none"
					type="button"
					onclick={() => applyPendingDrop('sameJamAllDays')}
				>
					<span class="flex-1 text-left">Semua hari pada jam ke-{pendingDrop.jamKe}</span>
					{#if overwriteCountForDrop('sameJamAllDays')}<span class="badge badge-warning"
							>Timpa {overwriteCountForDrop('sameJamAllDays')}</span
						>{/if}
				</button>
			</div>
		{/if}
		<div class="modal-action">
			<button
				class="btn"
				type="button"
				onclick={() => {
					pendingDrop = null;
					dropDialog?.close();
				}}>Batal</button
			>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop"><button>Batal</button></form>
</dialog>

<dialog class="modal" bind:this={cellDialog}>
	<div class="modal-box max-w-md">
		<h3 class="text-lg font-bold">Edit Cell Jadwal</h3>
		{#if selectedCell}
			<p class="text-base-content/70 mt-1 text-sm">
				{hariLabel[selectedCell.hari]} jam {selectedCell.jamKe} - {selectedKelas?.nama ?? 'Kelas'}
			</p>
			<label class="form-control mt-4">
				<span class="label-text mb-1">Item Jadwal</span>
				<select class="select select-bordered" bind:value={editKode}>
					<option value="">Kosong</option>
					<optgroup label="Mata Pelajaran">
						{#each mapelItems as item (`edit-mapel-${item.id}`)}
							<option value={item.kode}>{item.kode} - {item.nama}</option>
						{/each}
					</optgroup>
					<optgroup label="Kegiatan">
						{#each kegiatanItems as item (`edit-kegiatan-${item.id}`)}
							<option value={item.kode}>{item.kode} - {item.nama}</option>
						{/each}
					</optgroup>
				</select>
			</label>
		{/if}
		<div class="modal-action flex-wrap">
			<button class="btn btn-error btn-outline" type="button" onclick={clearSelectedCell}
				>Kosongkan</button
			>
			<button class="btn btn-primary" type="button" onclick={saveSelectedCell}>Simpan Cell</button>
			<button
				class="btn"
				type="button"
				onclick={() => {
					selectedCell = null;
					cellDialog?.close();
				}}>Batal</button
			>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop"><button>Batal</button></form>
</dialog>

<style>
	.schedule-table :global(th),
	.schedule-table :global(td) {
		border-color: hsl(var(--b3, 220 13% 91%));
	}

	.schedule-head {
		background: #2563eb;
		color: white;
		font-weight: 700;
	}

	.schedule-cell {
		min-width: 10rem;
		padding: 0.25rem;
	}

	.sticky-col {
		position: sticky;
		z-index: 12;
	}

	.sticky-col-day {
		left: 0;
		min-width: 5.5rem;
	}

	.sticky-col-jam {
		left: 5.5rem;
		min-width: 3.75rem;
	}

	.schedule-head.sticky-col {
		z-index: 22;
	}

	.compact-schedule .schedule-cell {
		min-width: 7rem;
		padding: 0.15rem;
	}

	.compact-schedule .schedule-head {
		font-size: 0.75rem;
	}

	.compact-schedule .slot-button {
		min-height: 2.25rem;
		padding: 0.2rem;
	}

	.compact-schedule .slot-code {
		font-size: 0.72rem;
	}

	.compact-schedule .slot-name {
		max-width: 5.75rem;
		font-size: 0.58rem;
	}

	.compact-schedule .slot-detail {
		display: none;
	}

	.slot-button {
		border: 1px dashed color-mix(in srgb, currentColor 25%, transparent);
		border-radius: 0.375rem;
		display: flex;
		min-height: 3.1rem;
		width: 100%;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.05rem;
		background: hsl(var(--b1));
		padding: 0.35rem;
		text-align: center;
	}

	.slot-button:not(:disabled):hover {
		outline: 2px solid #60a5fa;
		outline-offset: -2px;
	}

	.slot-button.is-conflict {
		border-color: var(--color-error);
		box-shadow: inset 0 0 0 2px color-mix(in oklab, var(--color-error) 35%, transparent);
	}

	.slot-button.has-value {
		border-style: solid;
		color: #0f172a;
	}

	.slot-code {
		font-size: 0.82rem;
		font-weight: 800;
		line-height: 1;
	}

	.slot-name,
	.slot-detail {
		max-width: 8.5rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.slot-name {
		font-size: 0.68rem;
	}

	.slot-detail,
	.slot-empty {
		font-size: 0.65rem;
		opacity: 0.72;
	}

	.palette-item {
		align-items: center;
		border: 1px solid hsl(var(--b3, 220 13% 91%));
		border-radius: 0.5rem;
		display: flex;
		gap: 0.625rem;
		min-height: 3.25rem;
		padding: 0.55rem;
		width: 100%;
	}

	.palette-item:not(:disabled) {
		cursor: grab;
	}

	.palette-item:not(:disabled):active {
		cursor: grabbing;
	}

	.palette-item:hover {
		border-color: #60a5fa;
		background: color-mix(in srgb, #dbeafe 38%, transparent);
	}

	.palette-swatch {
		border: 1px solid rgba(15, 23, 42, 0.15);
		border-radius: 999px;
		height: 1rem;
		width: 1rem;
		flex: 0 0 auto;
	}
</style>
