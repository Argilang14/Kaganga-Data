<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Icon from '$lib/components/icon.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import type { PageData } from './$types';

	const { data } = $props<{ data: PageData }>();

	type Kelas = { id: number; nama: string; fase?: string | null };
	type JadwalEntry = { hari: string; jamKe: number; kelasId: number; kodeKegiatan: string };
	type JamSlot = { hari: string; jamKe: number; jenjang: JenjangFilter; pukulMulai: string; pukulSelesai: string; tipe: string; namaDefault: string | null; aktif: boolean };
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
	type JadwalExcelRow = { hari: string; jamKe: number; kelasId: number; kode: string };
	type ImportPreview = {
		validRows: Array<JadwalExcelRow & { kelas: string }>;
		invalidRows: Array<{
			rowNumber: number;
			hari: string;
			jamKe: string;
			kelas: string;
			kode: string;
			reason: string;
		}>;
		total: number;
		context: { tahunAjaran: string; jenisLabel: string };
	};

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
	const jadwalJam = $derived((data.jadwalJam ?? []) as JamSlot[]);

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
	let tableDensity = $state<TableDensity>('padat');
	let paletteSearch = $state('');
	let draggedItem = $state<PaletteItem | null>(null);
	let pendingDrop = $state<PendingDrop | null>(null);
	let selectedCell = $state<SelectedCell | null>(null);
	let editKode = $state('');
	let dropDialog = $state<HTMLDialogElement | null>(null);
	let cellDialog = $state<HTMLDialogElement | null>(null);
	let importDialog = $state<HTMLDialogElement | null>(null);
	let importFile = $state<File | null>(null);
	let importPreview = $state<ImportPreview | null>(null);
	let importLoading = $state(false);
	let importMode = $state<'merge' | 'replace'>('merge');
	let panelCollapsed = $state(false);
	let panelSide = $state<'left' | 'right'>('right');
	let panelWidth = $state(240);

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
					for (let jamKe = 1; jamKe <= jumlahJamFor(hari); jamKe += 1) {
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
			teacherConflicts,
			visibleSlotTotal: visibleKelas.length * hariList.reduce((total, hari) => total + jumlahJamFor(hari), 0)
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

	function savePanelPreference() {
		localStorage.setItem('jadwal-item-panel', JSON.stringify({ panelCollapsed, panelSide, panelWidth }));
	}

	function panelStyle() {
		return '--panel-width:' + (panelCollapsed ? 96 : panelWidth) + 'px';
	}

	function togglePanel() {
		panelCollapsed = !panelCollapsed;
		savePanelPreference();
	}

	function movePanel() {
		panelSide = panelSide === 'right' ? 'left' : 'right';
		savePanelPreference();
	}

	onMount(() => {
		try {
			const saved = JSON.parse(localStorage.getItem('jadwal-item-panel') ?? '{}');
			panelCollapsed = Boolean(saved.panelCollapsed);
			panelSide = saved.panelSide === 'left' ? 'left' : 'right';
			panelWidth = Math.min(360, Math.max(200, Number(saved.panelWidth) || 240));
		} catch {
			// Gunakan preferensi panel default jika penyimpanan browser tidak valid.
		}
	});

	function configuredSlots(hari: string) {
		return jadwalJam.filter(
			(slot) => slot.aktif && slot.hari === hari && (activeJenjang === 'semua' || slot.jenjang === activeJenjang)
		);
	}

	function jumlahJamFor(hari: string) {
		const configured = configuredSlots(hari).map((slot) => slot.jamKe);
		const scheduled = savedJadwal
			.filter((entry) => entry.hari === hari && visibleKelas.some((kelas) => kelas.id === entry.kelasId))
			.map((entry) => entry.jamKe);
		return Math.max(...configured, ...scheduled, configured.length ? 0 : jumlahJam);
	}

	function waktuFor(hari: string, jamKe: number) {
		const ranges = [
			...new Set(
				configuredSlots(hari)
					.filter((slot) => slot.jamKe === jamKe)
					.map((slot) => slot.pukulMulai + '-' + slot.pukulSelesai)
			)
		];
		return ranges.length === 1 ? ranges[0] : ranges.length > 1 ? 'Berbeda' : '';
	}

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

	function excelHref(kind: 'template' | 'export') {
		const query = new URLSearchParams({
			tahunAjaranId: String(data.selectedContext?.tahunAjaranId ?? ''),
			jenis: data.selectedContext?.jenis ?? 'ganjil'
		});
		return '/api/jadwal/pelajaran/' + kind + '?' + query;
	}

	function openImportDialog() {
		importFile = null;
		importPreview = null;
		importMode = 'merge';
		importDialog?.showModal();
	}

	async function previewImport() {
		if (!importFile || importLoading) return;
		importLoading = true;
		importPreview = null;
		const query = new URLSearchParams({
			tahunAjaranId: String(data.selectedContext?.tahunAjaranId ?? ''),
			jenis: data.selectedContext?.jenis ?? 'ganjil'
		});
		const formData = new FormData();
		formData.set('file', importFile);
		try {
			const response = await fetch('/api/jadwal/pelajaran/import-preview?' + query, {
				method: 'POST',
				body: formData
			});
			const payload = await response.json();
			if (!response.ok) throw new Error(payload?.message ?? 'File Excel tidak dapat dibaca');
			importPreview = payload as ImportPreview;
		} catch (error) {
			toast(error instanceof Error ? error.message : 'Gagal membaca file Excel', 'error');
		} finally {
			importLoading = false;
		}
	}

	function applyImportPreview() {
		if (!importPreview?.validRows.length) return;
		const next: Record<string, string> = importMode === 'replace' ? {} : { ...cells };
		for (const row of importPreview.validRows) {
			next[keyFor(row.hari, row.jamKe, row.kelasId)] = row.kode;
		}
		cells = next;
		importDialog?.close();
		toast(
			importPreview.validRows.length +
				' baris diterapkan ke tabel. Tekan Simpan Jadwal untuk menyimpan.',
			'success'
		);
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
		const pendingKode = pendingDrop.item.kode;
		return targetsForDrop(scope).filter((target) => {
			const existing = cells[keyFor(target.hari, target.jamKe, target.kelasId)];
			return existing && existing !== pendingKode;
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
		formData.set('tahunAjaranId', String(data.selectedContext?.tahunAjaranId ?? ''));
		formData.set('jenis', data.selectedContext?.jenis ?? 'ganjil');
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
			<div class="min-w-0 flex-1">
				<h1 class="text-xl font-bold">Jadwal Pelajaran</h1>
				<p class="text-base-content/70 text-sm">Kelola jadwal kelas dan kode kegiatan.</p>
			</div>
			<form method="GET" class="flex flex-wrap items-center gap-2">
				<label class="flex items-center gap-2 text-sm font-semibold">
					<span>Tahun Ajaran</span>
					<select class="select select-sm bg-base-200 w-36" name="tahunAjaranId" value={data.selectedContext?.tahunAjaranId ?? ''} onchange={(event) => (event.currentTarget as HTMLSelectElement).form?.requestSubmit()}>
						{#each data.tahunAjaranList ?? [] as tahun (tahun.id)}
							<option value={tahun.id}>{tahun.nama}</option>
						{/each}
					</select>
				</label>
				<label class="flex items-center gap-2 text-sm font-semibold">
					<span>Jadwal</span>
					<select class="select select-sm bg-base-200 w-44" name="jenis" value={data.selectedContext?.jenis ?? 'ganjil'} onchange={(event) => (event.currentTarget as HTMLSelectElement).form?.requestSubmit()}>
						{#each data.jenisOptions ?? [] as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</label>
			</form>
			<div class="dropdown dropdown-end">
				<button type="button" tabindex="0" class="btn btn-soft shadow-none">
					<Icon name="down" /> Data Excel
				</button>
				<ul tabindex="-1" class="dropdown-content menu bg-base-100 border-base-300 z-30 mt-2 w-56 rounded-md border p-2 shadow-xl">
					<li><a href={excelHref('template')}><Icon name="download" /> Download Template</a></li>
					<li><button type="button" onclick={openImportDialog}><Icon name="import" /> Import dan Pratinjau</button></li>
					<li><a href={excelHref('export')}><Icon name="export" /> Export Jadwal</a></li>
				</ul>
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

	<section class="schedule-workspace grid grid-cols-1 gap-3" class:panel-left={panelSide === 'left'} style={panelStyle()}>
		<div class="schedule-main bg-base-100 flex min-h-0 flex-col rounded-lg p-4 shadow-md">
			<div class="mb-3 flex flex-wrap items-end gap-2">
				<label class="flex items-center gap-2">
					<span class="label-text text-sm font-semibold">Jenjang</span>
					<select class="select select-sm bg-base-200 w-36" bind:value={activeJenjang}>
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
									<th class="schedule-head min-w-24 text-center">{kelas.nama}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each hariList as hari (hari)}
								{#each Array.from({ length: jumlahJamFor(hari) }, (_, index) => index + 1) as jamKe (jamKe)}
									<tr>
										{#if jamKe === 1}
											<td
												class="sticky-col sticky-col-day bg-base-100 align-top font-semibold"
												rowspan={jumlahJamFor(hari)}>{hariLabel[hari]}</td
											>
										{/if}
										<td class="sticky-col sticky-col-jam bg-base-100 text-center">
											<div class="font-semibold">{jamKe}</div>
											{#if waktuFor(hari, jamKe)}
												<div class="text-base-content/60 whitespace-nowrap text-[10px] font-normal">
													{waktuFor(hari, jamKe)}
												</div>
											{/if}
										</td>
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

		<aside class="schedule-panel space-y-3 xl:sticky xl:top-4 xl:self-start">
			<div class="bg-base-100 rounded-lg p-3 shadow-md">
				<div class="flex items-center gap-1">
					<h2 class="min-w-0 flex-1 truncate font-bold">{panelCollapsed ? 'Item' : 'Item Jadwal'}</h2>
					{#if !panelCollapsed}<span class="badge badge-soft">{visiblePaletteItems.length}</span>{/if}
					<button class="btn btn-ghost btn-xs" type="button" onclick={movePanel} title="Pindahkan panel">
						<Icon name={panelSide === 'right' ? 'left' : 'right'} />
					</button>
					<button class="btn btn-ghost btn-xs" type="button" onclick={togglePanel} title={panelCollapsed ? 'Buka panel' : 'Ciutkan panel'}>
						<Icon name={panelCollapsed ? 'right' : 'left'} />
					</button>
				</div>
				{#if !panelCollapsed}
					<label class="mt-2 mb-2 flex items-center gap-2 text-xs">
						<span>Lebar</span>
						<input
							class="range range-xs flex-1"
							type="range"
							min="200"
							max="360"
							step="10"
							bind:value={panelWidth}
							onchange={savePanelPreference}
						/>
						<span class="w-12 text-right">{panelWidth}px</span>
					</label>
				<div class="join mb-2 grid grid-cols-2">
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
				<label class="input input-sm bg-base-200 mb-2 flex items-center gap-2">
					<Icon name="search" />
					<input class="grow" placeholder="Cari kode" bind:value={paletteSearch} />
				</label>
				<div class="max-h-[calc(100vh-19rem)] space-y-1 overflow-y-auto pr-1">
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
							{#if item.detail}<span class="badge badge-outline max-w-16 truncate text-[10px]"
									>{item.detail}</span
								>{/if}
						</button>
					{:else}
						<div class="border-base-200 text-base-content/60 rounded-lg border p-3 text-sm">
							Data belum tersedia.
						</div>
					{/each}
				</div>
				{/if}
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

<dialog class="modal" bind:this={importDialog}>
	<div class="modal-box w-11/12 max-w-5xl rounded-lg">
		<div class="flex items-start justify-between gap-3">
			<div>
				<h3 class="text-lg font-bold">Import Jadwal Pelajaran</h3>
				<p class="text-base-content/70 mt-1 text-sm">
					Data diperiksa untuk {data.selectedContext?.jenis === 'persiapan'
						? 'Masa Persiapan'
						: data.selectedContext?.jenis === 'genap'
							? 'Semester Genap'
							: 'Semester Ganjil'} dan tidak langsung disimpan.
				</p>
			</div>
			<button class="btn btn-ghost btn-sm btn-square" type="button" title="Tutup" onclick={() => importDialog?.close()}>
				<Icon name="close" />
			</button>
		</div>

		<div class="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
			<label class="form-control min-w-0 flex-1">
				<span class="label-text mb-1 font-semibold">File Excel</span>
				<input
					class="file-input file-input-bordered w-full"
					type="file"
					accept=".xlsx"
					onchange={(event) => {
						importFile = (event.currentTarget as HTMLInputElement).files?.[0] ?? null;
						importPreview = null;
					}}
				/>
			</label>
			<button class="btn btn-primary shadow-none" type="button" disabled={!importFile || importLoading} onclick={previewImport}>
				{#if importLoading}<span class="loading loading-spinner loading-sm"></span>{:else}<Icon name="search" />{/if}
				Periksa File
			</button>
		</div>

		{#if importPreview}
			<div class="mt-5 grid grid-cols-3 gap-2">
				<div class="bg-base-200 rounded-md p-3"><div class="text-xs">Total Terisi</div><div class="text-xl font-bold">{importPreview.total}</div></div>
				<div class="bg-success/15 rounded-md p-3"><div class="text-xs">Valid</div><div class="text-success text-xl font-bold">{importPreview.validRows.length}</div></div>
				<div class="bg-error/15 rounded-md p-3"><div class="text-xs">Ditolak</div><div class="text-error text-xl font-bold">{importPreview.invalidRows.length}</div></div>
			</div>

			{#if importPreview.invalidRows.length}
				<div class="mt-4">
					<h4 class="text-error mb-2 font-semibold">Baris yang perlu diperbaiki</h4>
					<div class="border-base-300 max-h-52 overflow-auto rounded-md border">
						<table class="table table-sm">
							<thead class="bg-base-200 sticky top-0"><tr><th>Baris</th><th>Hari/Jam</th><th>Kelas</th><th>Kode</th><th>Masalah</th></tr></thead>
							<tbody>
								{#each importPreview.invalidRows as row (row.rowNumber)}
									<tr><td>{row.rowNumber}</td><td>{row.hari} {row.jamKe}</td><td>{row.kelas}</td><td>{row.kode}</td><td class="text-error">{row.reason}</td></tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{/if}

			{#if importPreview.validRows.length}
				<div class="mt-4">
					<h4 class="mb-2 font-semibold">Pratinjau data valid</h4>
					<div class="border-base-300 max-h-64 overflow-auto rounded-md border">
						<table class="table table-sm">
							<thead class="bg-base-200 sticky top-0"><tr><th>Hari</th><th>Jam</th><th>Kelas</th><th>Kode</th></tr></thead>
							<tbody>
								{#each importPreview.validRows.slice(0, 100) as row (row.hari + '-' + row.jamKe + '-' + row.kelasId)}
									<tr><td>{hariLabel[row.hari]}</td><td>{row.jamKe}</td><td>{row.kelas}</td><td class="font-semibold">{row.kode}</td></tr>
								{/each}
							</tbody>
						</table>
					</div>
					{#if importPreview.validRows.length > 100}
						<p class="text-base-content/60 mt-1 text-xs">100 dari {importPreview.validRows.length} baris ditampilkan.</p>
					{/if}
				</div>
			{/if}

			<div class="mt-5 flex flex-wrap items-center justify-between gap-3">
				<div class="join">
					<button class="btn btn-sm join-item" class:btn-primary={importMode === 'merge'} type="button" onclick={() => (importMode = 'merge')}>Gabungkan</button>
					<button class="btn btn-sm join-item" class:btn-primary={importMode === 'replace'} type="button" onclick={() => (importMode = 'replace')}>Ganti Isi Tabel</button>
				</div>
				<button class="btn btn-primary shadow-none" type="button" disabled={!importPreview.validRows.length} onclick={applyImportPreview}>
					<Icon name="check" /> Terapkan ke Tabel
				</button>
			</div>
		{/if}
	</div>
	<form method="dialog" class="modal-backdrop"><button>Tutup</button></form>
</dialog>
<style>
	@media (min-width: 80rem) {
		.schedule-workspace {
			grid-template-columns: minmax(0, 1fr) var(--panel-width);
		}

		.schedule-workspace.panel-left {
			grid-template-columns: var(--panel-width) minmax(0, 1fr);
		}

		.panel-left .schedule-main {
			order: 2;
		}

		.panel-left .schedule-panel {
			order: 1;
		}
	}
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
		min-width: 4rem;
	}

	.sticky-col-jam {
		left: 4rem;
		min-width: 2.75rem;
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
		max-width: 4.25rem;
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
		gap: 0.375rem;
		min-height: 2.5rem;
		padding: 0.35rem;
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
