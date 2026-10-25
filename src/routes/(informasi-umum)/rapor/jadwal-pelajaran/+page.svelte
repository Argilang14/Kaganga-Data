<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Icon from '$lib/components/icon.svelte';
	import {
		buildJpNumberBySlot,
		canPlaceJadwalItem,
		jadwalSlotKey,
		normalizeJadwalKegiatanKode,
		normalizeJadwalKode,
		uniqueJadwalSlots
	} from '$lib/jadwal-slots';
	import { toast } from '$lib/components/toast.svelte';
	import { calculateWeeklyJp, summarizeWeeklyJp, summarizeWeeklyJpBySubject } from '$lib/jadwal-jp';
	import { buildJadwalSegments, type JadwalSegment } from '$lib/jadwal-segments';
	import type { PageData } from './$types';

	const { data } = $props<{ data: PageData }>();

	type Kelas = { id: number; nama: string; fase?: string | null };
	type JadwalEntry = {
		hari: string;
		jamKe: number;
		kelasId: number;
		kodeKegiatan: string;
		guruPegawaiId?: number | null;
	};
	type JamSlot = {
		hari: string;
		jamKe: number;
		jenjang: JenjangFilter;
		pukulMulai: string;
		pukulSelesai: string;
		tipe: string;
		namaDefault: string | null;
		aktif: boolean;
		urutan?: number | null;
	};
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
	type DropScope = 'cell' | 'block' | 'jenjang' | 'row' | 'sameJamAllDays';
	type PendingDrop = {
		item: PaletteItem;
		hari: string;
		jamKe: number;
		kelasId: number;
		blockCellKeys: string[];
	};
	type SelectedCell = {
		hari: string;
		jamKe: number;
		kelasId: number;
		kode: string;
		blockCellKeys: string[];
	};
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
	const jenjangOrder: Exclude<JenjangFilter, 'semua'>[] = ['srd', 'srmp', 'srma'];

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
			kode: normalizeJadwalKode(item.kode),
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
			kode: normalizeJadwalKode(item.kode),
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
	const savedJadwalByCell = $derived.by(
		() =>
			new Map(savedJadwal.map((entry) => [keyFor(entry.hari, entry.jamKe, entry.kelasId), entry]))
	);
	const jadwalJam = $derived.by(() => uniqueJadwalSlots((data.jadwalJam ?? []) as JamSlot[]));

	let cells = $state<Record<string, string>>({});
	let saving = $state(false);
	let settingsSaving = $state(false);
	let jamMulai = $state('07:00');
	let jamPelajaranMenit = $state(35);
	let durasiIstirahat = $state(30);
	let durasiUpacara = $state(70);
	let bellActive = $state(false);
	let activePalette = $state<'mapel' | 'kegiatan'>('mapel');
	const jpNumberBySlot = $derived.by(() => buildJpNumberBySlot(jadwalJam));
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
	let jpTargetDialog = $state<HTMLDialogElement | null>(null);
	let jpTargetDraft = $state<Record<string, number>>({});
	let jpTargetSaving = $state(false);
	let importFile = $state<File | null>(null);
	let importPreview = $state<ImportPreview | null>(null);
	let importLoading = $state(false);
	let importMode = $state<'merge' | 'replace'>('merge');
	let panelCollapsed = $state(false);
	let panelSide = $state<'left' | 'right'>('right');
	let panelWidth = $state(240);
	let mobilePanelOpen = $state(false);

	const kodeMeta = $derived.by(() => {
		const map = new Map<string, PaletteItem>();
		for (const item of paletteItems) map.set(item.kode, item);
		return map;
	});
	const mapelByCode = $derived.by(() => {
		const groups = new Map<string, PaletteItem[]>();
		for (const item of mapelItems) {
			const group = groups.get(item.kode) ?? [];
			group.push(item);
			groups.set(item.kode, group);
		}
		return groups;
	});
	const kegiatanCodes = $derived(new Set(kegiatanItems.map((item) => item.kode)));
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
		const slots = new Map<
			string,
			{ guru: string; hari: string; jamKe: number; kelasIds: Set<number>; cellKeys: string[] }
		>();
		for (const [cellKey, kode] of Object.entries(cells)) {
			const teacher = teacherByCode.get(kode);
			if (!teacher) continue;
			const [hari, jamRaw, kelasRaw] = cellKey.split('|');
			const jamKe = Number(jamRaw);
			const kelasId = Number(kelasRaw);
			const key = hari + '|' + jamKe + '|' + teacher.id;
			const slot = slots.get(key) ?? {
				guru: teacher.nama,
				hari,
				jamKe,
				kelasIds: new Set<number>(),
				cellKeys: []
			};
			slot.kelasIds.add(kelasId);
			slot.cellKeys.push(cellKey);
			slots.set(key, slot);
		}
		return [...slots.values()]
			.filter((slot) => slot.kelasIds.size > 1)
			.map((slot) => ({
				...slot,
				kelas: [...slot.kelasIds].map(
					(id) => daftarKelas.find((kelas) => kelas.id === id)?.nama ?? 'Kelas ' + id
				)
			}));
	});
	const conflictCellKeys = $derived(
		new Set(teacherConflicts.flatMap((conflict) => conflict.cellKeys))
	);
	const visiblePaletteItems = $derived.by(() => {
		const query = paletteSearch.trim().toLowerCase();
		return paletteItems.filter((item) => {
			if (item.source !== activePalette) return false;
			if (
				item.source === 'mapel' &&
				activeJenjang !== 'semua' &&
				item.jenjang !== 'semua' &&
				item.jenjang !== activeJenjang
			)
				return false;
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
	const visibleGroups = $derived.by(() =>
		jenjangOrder
			.filter((jenjang) => activeJenjang === 'semua' || activeJenjang === jenjang)
			.map((jenjang) => ({
				jenjang,
				kelas: visibleKelas.filter((kelas) => kelasJenjang(kelas) === jenjang)
			}))
			.filter((group) => group.kelas.length > 0)
	);
	const targetJpByClassMapel = $derived.by(
		() =>
			new Map(
				(
					(data.targetJp ?? []) as Array<{
						kelasId: number;
						jadwalMapelId: number;
						jpPerMinggu: number;
					}>
				).map((target) => [`${target.kelasId}|${target.jadwalMapelId}`, target.jpPerMinggu])
			)
	);
	const weeklyJpTargets = $derived.by(() => [
		...mapelItems.map((item) => ({
			id: item.id,
			kode: item.kode,
			nama: item.nama,
			jenjang: item.jenjang ?? 'semua',
			jpPerMinggu: item.jpPerMinggu ?? 0
		})),
		...(
			(data.targetJp ?? []) as Array<{
				kelasId: number;
				jadwalMapelId: number;
				jpPerMinggu: number;
			}>
		).flatMap((target) => {
			const item = mapelItems.find((mapel) => mapel.id === target.jadwalMapelId);
			return item
				? [
						{
							id: item.id,
							kelasId: target.kelasId,
							kode: item.kode,
							nama: item.nama,
							jenjang: item.jenjang ?? 'semua',
							jpPerMinggu: target.jpPerMinggu
						}
					]
				: [];
		})
	]);
	const jadwalSegments = $derived.by(() => {
		const mergeCells = hariList.flatMap((hari) =>
			Array.from({ length: jumlahJamFor(hari) }, (_, index) => index + 1).flatMap((jamKe) =>
				visibleGroups.flatMap((group) =>
					group.kelas.flatMap((kelas, column) => {
						if (!slotAktif(hari, jamKe, group.jenjang)) return [];
						const key = keyFor(hari, jamKe, kelas.id);
						const kode = cells[key];
						if (!kode) return [];
						const saved = savedJadwalByCell.get(key);
						const savedTeacher =
							normalizeJadwalKode(saved?.kodeKegiatan) === kode
								? (saved?.guruPegawaiId ?? null)
								: null;
						const inferredTeachers = (mapelByCode.get(kode) ?? [])
							.filter((item) => itemSesuaiKelas(item, kelas))
							.map((item) => item.guruId)
							.filter((id): id is number => Boolean(id))
							.sort((a, b) => a - b);
						const kegiatan = kegiatanCodes.has(kode);
						return [
							{
								key,
								hari,
								row: jamKe,
								column,
								group: group.jenjang,
								kode,
								kind: kegiatan ? ('kegiatan' as const) : ('mapel' as const),
								mergeIdentity: kegiatan
									? kode
									: kode + '|guru:' + (savedTeacher ?? (inferredTeachers.join(',') || 'tanpa'))
							}
						];
					})
				)
			)
		);
		return buildJadwalSegments(mergeCells);
	});
	const selectedMapelItems = $derived.by(() => {
		const kelas = selectedKelas;
		const cell = selectedCell;
		if (!kelas || !cell) return mapelItems;
		return mapelItems.filter(
			(item) => itemSesuaiKelas(item, kelas) && itemSesuaiSlot(item, cell.hari, cell.jamKe, kelas)
		);
	});
	const activeJenjangName = $derived(jenjangLabel[activeJenjang] ?? 'Semua Jenjang');
	const activeJenisLabel = $derived(
		((data.jenisOptions ?? []) as Array<{ value: string; label: string }>).find(
			(item) => item.value === data.selectedContext?.jenis
		)?.label ?? 'jadwal aktif'
	);
	const activeTahunAjaranName = $derived(
		((data.tahunAjaranList ?? []) as Array<{ id: number; nama: string }>).find(
			(item) => item.id === data.selectedContext?.tahunAjaranId
		)?.nama ?? '-'
	);
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

		const jpResults = calculateWeeklyJp({
			classes: visibleKelas
				.map((kelas) => ({ ...kelas, jenjang: kelasJenjang(kelas) }))
				.filter((kelas) => kelas.jenjang !== 'semua'),
			targets: weeklyJpTargets,
			slots: jadwalJam,
			entries: Object.entries(cells)
				.filter(([, kode]) => Boolean(kode))
				.map(([key, kode]) => {
					const [hari, jamKe, kelasId] = key.split('|');
					return { hari, jamKe: Number(jamKe), kelasId: Number(kelasId), kode };
				})
		});
		const jpIssues = jpResults.filter((result) => result.status !== 'tepat');

		return {
			filledSlots,
			unknownCodes: [...unknownCodes],
			jpResults,
			jpSummary: summarizeWeeklyJp(jpResults),
			jpIssues,
			teacherConflicts,
			visibleSlotTotal: visibleGroups.reduce(
				(total, group) =>
					total +
					group.kelas.length *
						hariList.reduce(
							(dayTotal, hari) => dayTotal + slotsForJenjang(hari, group.jenjang).length,
							0
						),
				0
			)
		};
	});
	const paletteJpStatus = $derived.by(() => {
		return summarizeWeeklyJpBySubject(scheduleChecks.jpResults);
	});

	function targetKey(kelasId: number, mapelId: number) {
		return `${kelasId}|${mapelId}`;
	}

	function resolvedJpTarget(kelasId: number, item: PaletteItem) {
		return targetJpByClassMapel.get(targetKey(kelasId, item.id)) ?? item.jpPerMinggu ?? 0;
	}

	function openJpTargetDialog() {
		const draft: Record<string, number> = {};
		for (const kelas of visibleKelas) {
			for (const item of mapelItems) {
				if (itemSesuaiKelas(item, kelas))
					draft[targetKey(kelas.id, item.id)] = resolvedJpTarget(kelas.id, item);
			}
		}
		jpTargetDraft = draft;
		jpTargetDialog?.showModal();
	}

	async function saveJpTargets() {
		if (!canManage || jpTargetSaving) return;
		jpTargetSaving = true;
		const targets = Object.entries(jpTargetDraft).map(([key, jpPerMinggu]) => {
			const [kelasId, jadwalMapelId] = key.split('|').map(Number);
			return { kelasId, jadwalMapelId, jpPerMinggu: Number(jpPerMinggu) };
		});
		const formData = new FormData();
		formData.set('tahunAjaranId', String(data.selectedContext?.tahunAjaranId ?? ''));
		formData.set('jenis', data.selectedContext?.jenis ?? 'ganjil');
		formData.set('targets', JSON.stringify(targets));
		try {
			const result = await postAction('saveJpTargets', formData);
			toast(String(result.message ?? 'Target JP berhasil disimpan'), 'success');
			jpTargetDialog?.close();
			await invalidateAll();
		} catch (error) {
			toast(error instanceof Error ? error.message : 'Target JP gagal disimpan', 'error');
		} finally {
			jpTargetSaving = false;
		}
	}

	$effect(() => {
		const nextCells: Record<string, string> = {};
		for (const entry of savedJadwal) {
			const kode = normalizeJadwalKode(entry.kodeKegiatan);
			if (kode) nextCells[`${entry.hari}|${entry.jamKe}|${entry.kelasId}`] = kode;
		}
		cells = nextCells;
	});

	$effect(() => {
		jamMulai = data.bellSettings?.jamMulai ?? '07:00';
		jamPelajaranMenit = data.bellSettings?.jamPelajaranMenit ?? 35;
		durasiIstirahat = data.bellSettings?.durasiIstirahat ?? 30;
		durasiUpacara = data.bellSettings?.durasiUpacara ?? 70;
		bellActive = Boolean(data.bellSettings?.isActive);
	});

	function savePanelPreference() {
		localStorage.setItem(
			'jadwal-item-panel',
			JSON.stringify({ panelCollapsed, panelSide, panelWidth })
		);
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

	function slotsForJenjang(hari: string, jenjang: Exclude<JenjangFilter, 'semua'>) {
		const slots = jadwalJam.filter(
			(slot) => slot.aktif && slot.hari === hari && slot.jenjang === jenjang
		);
		return [...new Map(slots.map((slot) => [slot.jamKe, slot])).values()].sort(
			(a, b) => a.jamKe - b.jamKe
		);
	}

	function slotForJenjang(hari: string, jamKe: number, jenjang: Exclude<JenjangFilter, 'semua'>) {
		return slotsForJenjang(hari, jenjang).find((slot) => slot.jamKe === jamKe) ?? null;
	}

	function slotDefaultForJenjang(
		hari: string,
		jamKe: number,
		jenjang: Exclude<JenjangFilter, 'semua'>
	) {
		const slot = slotForJenjang(hari, jamKe, jenjang);
		return slot && slot.tipe !== 'pelajaran' ? slot.namaDefault : null;
	}
	function slotAktif(hari: string, jamKe: number, jenjang: Exclude<JenjangFilter, 'semua'>) {
		return slotsForJenjang(hari, jenjang).some((slot) => slot.jamKe === jamKe);
	}

	function jpForJenjang(hari: string, jamKe: number, jenjang: Exclude<JenjangFilter, 'semua'>) {
		return jpNumberBySlot.get(jadwalSlotKey({ hari, jamKe, jenjang })) ?? null;
	}

	function jumlahJamFor(hari: string) {
		const configured = visibleGroups.flatMap((group) =>
			slotsForJenjang(hari, group.jenjang).map((slot) => slot.jamKe)
		);
		return Math.max(...configured, 0);
	}

	function waktuForJenjang(hari: string, jamKe: number, jenjang: Exclude<JenjangFilter, 'semua'>) {
		const slot = slotsForJenjang(hari, jenjang).find((item) => item.jamKe === jamKe);
		return slot ? `${slot.pukulMulai}-${slot.pukulSelesai}` : '';
	}

	function keyFor(hari: string, jamKe: number, kelasId: number) {
		return `${hari}|${jamKe}|${kelasId}`;
	}

	function targetsFromCellKeys(cellKeys: string[]) {
		return cellKeys
			.map((cellKey) => {
				const [hari, jamKe, kelasId] = cellKey.split('|');
				return { hari, jamKe: Number(jamKe), kelasId: Number(kelasId) };
			})
			.filter((target) => Number.isInteger(target.jamKe) && Number.isInteger(target.kelasId));
	}

	function segmentHasConflict(segment: JadwalSegment | undefined, cellKey: string) {
		return (segment?.cellKeys ?? [cellKey]).some((key) => conflictCellKeys.has(key));
	}

	function kelasJenjang(kelas: Kelas | null | undefined): JenjangFilter {
		const raw = `${kelas?.fase ?? ''} ${kelas?.nama ?? ''}`.toLowerCase();
		if (/\b(srd|fase\s*[abc])\b/.test(raw) || /\b(iv|v|vi)\b/i.test(kelas?.nama ?? ''))
			return 'srd';
		if (/\b(srmp|fase\s*d)\b/.test(raw) || /\b(vii|viii|ix)\b/i.test(kelas?.nama ?? ''))
			return 'srmp';
		if (/\b(srma|srt|fase\s*[ef])\b/.test(raw) || /\b(x|xi|xii)\b/i.test(kelas?.nama ?? ''))
			return 'srma';
		return 'semua';
	}

	function itemSesuaiKelas(item: PaletteItem, kelas: Kelas) {
		return (
			item.source === 'kegiatan' || item.jenjang === 'semua' || item.jenjang === kelasJenjang(kelas)
		);
	}

	function itemSesuaiSlot(item: PaletteItem, hari: string, jamKe: number, kelas: Kelas) {
		const jenjang = kelasJenjang(kelas);
		if (jenjang === 'semua') return false;
		const slot = slotForJenjang(hari, jamKe, jenjang);
		return Boolean(slot?.aktif) && canPlaceJadwalItem(slot?.tipe, item.source);
	}
	function kodeSesuaiKelas(kode: string, kelas: Kelas) {
		if (kegiatanCodes.has(kode)) return true;
		return (mapelByCode.get(kode) ?? []).some((item) => itemSesuaiKelas(item, kelas));
	}

	function slotAktifUntukKelas(hari: string, jamKe: number, kelas: Kelas) {
		const jenjang = kelasJenjang(kelas);
		return jenjang !== 'semua' && slotAktif(hari, jamKe, jenjang);
	}

	function setCell(hari: string, jamKe: number, kelasId: number, kode: string) {
		const key = keyFor(hari, jamKe, kelasId);
		const normalized = normalizeJadwalKode(kode);
		if (normalized) cells[key] = normalized;
		else delete cells[key];
		cells = { ...cells };
	}

	function setMany(targets: Array<{ hari: string; jamKe: number; kelasId: number }>, kode: string) {
		const normalized = normalizeJadwalKode(kode);
		const next = { ...cells };
		for (const target of targets) {
			const key = keyFor(target.hari, target.jamKe, target.kelasId);
			if (normalized) next[key] = normalized;
			else delete next[key];
		}
		cells = next;
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
		return `--slot-color:${color};`;
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

	function dropToCell(
		event: DragEvent,
		hari: string,
		jamKe: number,
		kelasId: number,
		segment?: JadwalSegment
	) {
		if (!canManage) return;
		event.preventDefault();
		const item = readDraggedItem(event);
		const kelas = daftarKelas.find((entry) => entry.id === kelasId);
		if (!item?.kode || !kelas) return;
		if (!slotAktifUntukKelas(hari, jamKe, kelas)) {
			toast(`Jam ke-${jamKe} tidak aktif untuk kelas ${kelas.nama}.`, 'error');
			return;
		}
		if (!itemSesuaiKelas(item, kelas)) {
			toast(
				`${item.kode} hanya tersedia untuk ${jenjangLabel[item.jenjang ?? ''] ?? item.jenjang}.`,
				'error'
			);
			return;
		}
		if (!itemSesuaiSlot(item, hari, jamKe, kelas)) {
			toast('Mata pelajaran hanya dapat ditempatkan pada slot bertipe Pelajaran.', 'error');
			return;
		}
		pendingDrop = {
			item,
			hari,
			jamKe,
			kelasId,
			blockCellKeys: segment?.cellKeys ?? [keyFor(hari, jamKe, kelasId)]
		};
		draggedItem = null;
		dropDialog?.showModal();
	}

	function targetsForDrop(scope: DropScope) {
		if (!pendingDrop) return [];
		const { hari, jamKe, kelasId, item } = pendingDrop;
		let targets: Array<{ hari: string; jamKe: number; kelasId: number }>;
		if (scope === 'cell') targets = [{ hari, jamKe, kelasId }];
		else if (scope === 'block') targets = targetsFromCellKeys(pendingDrop.blockCellKeys);
		else if (scope === 'row') {
			targets = visibleKelas.map((kelas) => ({ hari, jamKe, kelasId: kelas.id }));
		} else if (scope === 'sameJamAllDays') {
			targets = hariList.flatMap((day) =>
				visibleKelas.map((kelas) => ({ hari: day, jamKe, kelasId: kelas.id }))
			);
		} else {
			const targetJenjang = pendingJenjang;
			targets = visibleKelas
				.filter((kelas) => kelasJenjang(kelas) === targetJenjang)
				.map((kelas) => ({ hari, jamKe, kelasId: kelas.id }));
		}
		return targets.filter((target) => {
			const kelas = daftarKelas.find((entry) => entry.id === target.kelasId);
			return (
				kelas &&
				itemSesuaiKelas(item, kelas) &&
				itemSesuaiSlot(item, target.hari, target.jamKe, kelas) &&
				slotAktifUntukKelas(target.hari, target.jamKe, kelas)
			);
		});
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
		const targets = targetsForDrop(scope);
		if (!targets.length) {
			toast('Tidak ada kelas dengan jenjang dan jam aktif yang sesuai.', 'error');
			return;
		}
		setMany(targets, pendingDrop.item.kode);
		pendingDrop = null;
		dropDialog?.close();
	}

	function openCell(
		hari: string,
		jamKe: number,
		kelasId: number,
		kode: string,
		segment?: JadwalSegment
	) {
		if (!canManage) return;
		selectedCell = {
			hari,
			jamKe,
			kelasId,
			kode,
			blockCellKeys: segment?.cellKeys ?? [keyFor(hari, jamKe, kelasId)]
		};
		editKode = kode;
		cellDialog?.showModal();
	}

	function saveSelectedCell(scope: 'cell' | 'block' = 'block') {
		if (!selectedCell) return;
		const targets =
			scope === 'block'
				? targetsFromCellKeys(selectedCell.blockCellKeys)
				: [{ hari: selectedCell.hari, jamKe: selectedCell.jamKe, kelasId: selectedCell.kelasId }];
		for (const target of targets) {
			const kelas = daftarKelas.find((entry) => entry.id === target.kelasId);
			if (editKode && kelas && !kodeSesuaiKelas(editKode, kelas)) {
				toast(`Mata pelajaran ${editKode} tidak tersedia untuk kelas ${kelas.nama}.`, 'error');
				return;
			}
		}
		const selectedItem = editKode ? kodeMeta.get(editKode) : null;
		if (selectedItem) {
			for (const target of targets) {
				const kelas = daftarKelas.find((entry) => entry.id === target.kelasId);
				if (kelas && !itemSesuaiSlot(selectedItem, target.hari, target.jamKe, kelas)) {
					toast('Mata pelajaran hanya dapat ditempatkan pada slot bertipe Pelajaran.', 'error');
					return;
				}
			}
		}
		setMany(targets, editKode);
		selectedCell = null;
		cellDialog?.close();
	}

	function clearSelectedCell(scope: 'cell' | 'block' = 'block') {
		if (!selectedCell) return;
		const targets =
			scope === 'block'
				? targetsFromCellKeys(selectedCell.blockCellKeys)
				: [{ hari: selectedCell.hari, jamKe: selectedCell.jamKe, kelasId: selectedCell.kelasId }];
		setMany(targets, '');
		selectedCell = null;
		cellDialog?.close();
	}

	async function postAction(action: string, formData: FormData): Promise<Record<string, unknown>> {
		const res = await fetch(`?/${action}`, { method: 'POST', body: formData, redirect: 'error' });
		let result;
		try {
			result = deserialize(await res.text());
		} catch {
			throw new Error('Respons penyimpanan tidak valid');
		}
		if (result.type === 'failure') {
			const data = result.data as { fail?: string; message?: string } | undefined;
			throw new Error(data?.fail ?? data?.message ?? 'Gagal memproses permintaan');
		}
		if (result.type === 'error') {
			const error = result.error as { message?: string } | string | undefined;
			throw new Error(
				typeof error === 'string' ? error : (error?.message ?? 'Terjadi kesalahan server')
			);
		}
		if (result.type === 'redirect') {
			throw new Error('Sesi berubah. Muat ulang halaman sebelum menyimpan kembali.');
		}
		if (!res.ok || result.type !== 'success') throw new Error('Gagal memproses permintaan');
		return (result.data ?? {}) as Record<string, unknown>;
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
				return {
					hari,
					jamKe: Number(jamKe),
					kelasId: Number(kelasId),
					kodeKegiatan: normalizeJadwalKode(kode)
				};
			})
			.filter((entry) => entry.kodeKegiatan);
		const formData = new FormData();
		formData.set('data', JSON.stringify(entries));
		formData.set('tahunAjaranId', String(data.selectedContext?.tahunAjaranId ?? ''));
		formData.set('jenis', data.selectedContext?.jenis ?? 'ganjil');
		try {
			const result = await postAction('saveJadwal', formData);
			const savedEntries = (
				Array.isArray(result.savedEntries) ? result.savedEntries : entries
			) as Array<{
				hari: string;
				jamKe: number;
				kelasId: number;
				kodeKegiatan: string;
			}>;
			const warnings = Array.isArray(result.warnings) ? result.warnings : [];
			toast(
				warnings.length
					? `Jadwal tersimpan dengan ${warnings.length} peringatan jadwal.`
					: 'Jadwal pelajaran tersimpan',
				warnings.length ? 'warning' : 'success'
			);
			await invalidateAll();
			cells = Object.fromEntries(
				savedEntries
					.map((entry) => [
						keyFor(entry.hari, Number(entry.jamKe), Number(entry.kelasId)),
						normalizeJadwalKode(entry.kodeKegiatan)
					])
					.filter((entry) => entry[1])
			);
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

<div class="schedule-page grid min-w-0 grid-cols-1 gap-4">
	<section
		class="schedule-header bg-base-100 rounded-lg p-4 shadow-md"
		aria-labelledby="schedule-title"
	>
		<div class="schedule-heading">
			<div class="min-w-0">
				<h1 id="schedule-title" class="text-xl font-bold">Jadwal Pelajaran</h1>
				<p class="text-base-content/70 mt-1 text-sm">
					{activeTahunAjaranName} · {activeJenisLabel}
				</p>
			</div>
		</div>
		<div class="schedule-toolbar">
			<form method="GET" class="schedule-context">
				<label class="schedule-field">
					<span>Tahun Ajaran</span>
					<select
						class="select w-full"
						name="tahunAjaranId"
						value={data.selectedContext?.tahunAjaranId ?? ''}
						onchange={(event) => (event.currentTarget as HTMLSelectElement).form?.requestSubmit()}
					>
						{#each data.tahunAjaranList ?? [] as tahun (tahun.id)}
							<option value={tahun.id}>{tahun.nama}</option>
						{/each}
					</select>
				</label>
				<label class="schedule-field">
					<span>Jenis Jadwal</span>
					<select
						class="select w-full"
						name="jenis"
						value={data.selectedContext?.jenis ?? 'ganjil'}
						onchange={(event) => (event.currentTarget as HTMLSelectElement).form?.requestSubmit()}
					>
						{#each data.jenisOptions ?? [] as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</label>
			</form>
			<div class="schedule-actions">
				<details class="dropdown dropdown-start">
					<summary class="btn btn-soft shadow-none">
						<Icon name="export" /> Data Excel <Icon name="down" />
					</summary>
					<ul
						class="dropdown-content menu bg-base-100 border-base-300 z-30 mt-2 w-48 rounded-md border p-1 shadow-lg"
					>
						<li><a href={excelHref('template')}><Icon name="download" /> Download Template</a></li>
						<li>
							<button
								type="button"
								onclick={(event) => {
									(
										event.currentTarget.closest('details') as HTMLDetailsElement | null
									)?.removeAttribute('open');
									openImportDialog();
								}}><Icon name="import" /> Import dan Pratinjau</button
							>
						</li>
						<li><a href={excelHref('export')}><Icon name="export" /> Export Jadwal</a></li>
					</ul>
				</details>
				<button
					class="btn btn-soft schedule-mobile-trigger"
					type="button"
					aria-expanded={mobilePanelOpen}
					aria-controls="schedule-item-panel"
					onclick={() => (mobilePanelOpen = !mobilePanelOpen)}
				>
					<Icon name="menu-drawer" /> Item Jadwal <Icon name={mobilePanelOpen ? 'up' : 'down'} />
				</button>
				<button
					class="btn btn-soft shadow-none"
					type="button"
					onclick={openJpTargetDialog}
					disabled={!canManage || !daftarKelas.length}
				>
					<Icon name="edit" /> Target JP
				</button>
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
		</div>
	</section>

	<section
		class="schedule-workspace grid grid-cols-1 gap-3"
		class:panel-left={panelSide === 'left'}
		class:panel-collapsed={panelCollapsed}
		class:mobile-panel-open={mobilePanelOpen}
		style={panelStyle()}
	>
		<div class="schedule-main bg-base-100 flex min-h-0 min-w-0 flex-col rounded-lg p-4 shadow-md">
			<div class="schedule-view-toolbar">
				<label class="schedule-field schedule-jenjang">
					<span>Jenjang</span>
					<select class="select w-full" bind:value={activeJenjang}>
						<option value="semua">Semua Jenjang</option>
						<option value="srd">SRD</option>
						<option value="srmp">SRMP</option>
						<option value="srma">SRMA</option>
					</select>
				</label>
				<div class="schedule-field">
					<span id="schedule-density-label">Tampilan</span>
					<div class="join" role="group" aria-labelledby="schedule-density-label">
						<button
							class="btn btn-sm join-item"
							class:btn-primary={tableDensity === 'normal'}
							aria-pressed={tableDensity === 'normal'}
							type="button"
							onclick={() => (tableDensity = 'normal')}>Normal</button
						>
						<button
							class="btn btn-sm join-item"
							class:btn-primary={tableDensity === 'padat'}
							aria-pressed={tableDensity === 'padat'}
							type="button"
							onclick={() => (tableDensity = 'padat')}>Padat</button
						>
					</div>
				</div>
				<button
					class="btn btn-sm btn-ghost text-error schedule-clear shadow-none"
					type="button"
					onclick={clearAll}
					disabled={!canManage}
				>
					<Icon name="del" />
					Kosongkan
				</button>
			</div>

			<details class="schedule-checks border-base-300 mb-3 rounded-md border">
				<summary class="schedule-check-summary">
					<div class="flex min-w-0 items-start gap-2">
						<Icon
							name={scheduleChecks.jpIssues.length === 0 &&
							scheduleChecks.unknownCodes.length === 0 &&
							scheduleChecks.teacherConflicts.length === 0
								? 'check'
								: 'warning'}
						/>
						<div class="min-w-0 flex-1">
							<div class="font-semibold">Pemeriksaan {activeJenjangName}</div>
							<div class="text-base-content/65 mt-0.5 text-xs">
								{scheduleChecks.filledSlots}/{scheduleChecks.visibleSlotTotal} slot terisi
							</div>
						</div>
						<Icon name="down" />
					</div>
					<div class="schedule-check-badges" aria-label="Ringkasan target JP mingguan">
						<span class="badge badge-soft badge-warning badge-sm">
							Kurang JP <strong>{scheduleChecks.jpSummary.kurang}</strong>
						</span>
						<span class="badge badge-soft badge-success badge-sm">
							Sesuai <strong>{scheduleChecks.jpSummary.tepat}</strong>
						</span>
						<span class="badge badge-soft badge-warning badge-sm">
							Lebih JP <strong>{scheduleChecks.jpSummary.lebih}</strong>
						</span>
						<span
							class="badge badge-soft badge-sm"
							class:badge-error={scheduleChecks.teacherConflicts.length > 0}
						>
							Bentrok <strong>{scheduleChecks.teacherConflicts.length}</strong>
						</span>
						{#if scheduleChecks.unknownCodes.length}<span
								class="badge badge-soft badge-error badge-sm"
								>Kode tidak dikenal {scheduleChecks.unknownCodes.length}</span
							>{/if}
					</div>
				</summary>
				<div class="schedule-check-details border-base-200 border-t text-sm">
					{#if scheduleChecks.unknownCodes.length}
						<div class="mt-1">Kode belum dikenal: {scheduleChecks.unknownCodes.join(', ')}</div>
					{/if}
					{#if scheduleChecks.teacherConflicts.length}
						{#each scheduleChecks.teacherConflicts as conflict}
							<div class="mt-1 font-semibold text-error">
								Bentrok guru {conflict.guru}: {hariLabel[conflict.hari]} jam ke-{conflict.jamKe} di {conflict.kelas.join(
									', '
								)}.
							</div>
						{/each}
					{/if}
					{#if scheduleChecks.jpIssues.length}
						<div class="mt-1 grid gap-1 md:grid-cols-2">
							{#each scheduleChecks.jpIssues as issue (`${issue.kelas}-${issue.kode}`)}
								<div class="flex items-center gap-2">
									<span
										class="badge badge-xs"
										class:badge-warning={issue.status === 'kurang'}
										class:badge-error={issue.status === 'lebih'}
									>
										{issue.status === 'kurang' ? 'Kurang' : 'Lebih'}
									</span>
									<span>
										{issue.kelas} - {issue.kode}: {issue.actual}/{issue.target} JP ({Math.abs(
											issue.difference
										)} JP)
									</span>
								</div>
							{/each}
						</div>
					{:else if scheduleChecks.unknownCodes.length === 0}
						<div class="mt-1">Target JP/minggu sudah sesuai untuk mapel yang memiliki jatah.</div>
					{/if}
				</div>
			</details>

			{#if daftarKelas.length === 0}
				<div class="alert alert-warning">Belum ada kelas pada semester aktif.</div>
			{:else if visibleKelas.length === 0}
				<div class="alert alert-info">Tidak ada kelas pada filter jenjang ini.</div>
			{:else}
				<!-- svelte-ignore a11y_no_noninteractive_tabindex (Allow keyboard scrolling of the wide timetable.) -->
				<div
					class="schedule-table-scroll border-base-300 overflow-auto rounded-md border"
					tabindex="0"
					role="region"
					aria-label="Tabel jadwal pelajaran"
				>
					<table
						class="table-sm schedule-table table"
						class:compact-schedule={tableDensity === 'padat'}
					>
						<thead class="sticky top-0 z-10">
							<tr>
								<th scope="col" class="schedule-head sticky-col sticky-col-day">Hari</th>
								{#each visibleGroups as group (group.jenjang)}
									<th scope="col" class="schedule-head group-jam-head min-w-20 text-center">
										{activeJenjang === 'semua' ? `Jam ${jenjangLabel[group.jenjang]}` : 'Jam'}
									</th>
									{#each group.kelas as kelas (kelas.id)}
										<th scope="col" class="schedule-head min-w-24 text-center">{kelas.nama}</th>
									{/each}
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each hariList as hari (hari)}
								{#each Array.from({ length: jumlahJamFor(hari) }, (_, index) => index + 1) as jamKe (jamKe)}
									<tr class:day-start={jamKe === 1}>
										{#if jamKe === 1}
											<td
												class="sticky-col sticky-col-day bg-base-100 align-top font-semibold"
												rowspan={jumlahJamFor(hari)}>{hariLabel[hari]}</td
											>
										{/if}
										{#each visibleGroups as group (group.jenjang)}
											{@const activeSlot = slotAktif(hari, jamKe, group.jenjang)}
											{@const jpNumber = jpForJenjang(hari, jamKe, group.jenjang)}
											{@const slotDefault = slotDefaultForJenjang(hari, jamKe, group.jenjang)}
											<td class="group-jam-cell text-center" class:is-inactive={!activeSlot}>
												{#if activeSlot}
													<div class="font-semibold">{jpNumber ? `JP ${jpNumber}` : '-'}</div>
													<div
														class="text-base-content/60 whitespace-nowrap text-[10px] font-normal"
													>
														{waktuForJenjang(hari, jamKe, group.jenjang)}
													</div>
												{:else}
													<span class="text-base-content/30">-</span>
												{/if}
											</td>
											{#each group.kelas as kelas (kelas.id)}
												{@const key = keyFor(hari, jamKe, kelas.id)}
												{@const kode = cells[key]}
												{@const segment = jadwalSegments.get(key)}
												{#if !segment || segment.anchorKey === key}
													<td
														class="schedule-cell"
														class:is-inactive={!activeSlot}
														class:is-merged={(segment?.cellKeys.length ?? 0) > 1}
														class:is-merged-activity={segment?.kind === 'kegiatan' &&
															segment.colSpan > 1}
														class:is-merged-subject={segment?.kind === 'mapel' &&
															segment.rowSpan > 1}
														rowspan={segment?.rowSpan ?? 1}
														colspan={segment?.colSpan ?? 1}
													>
														<button
															class={`slot-button ${kode && activeSlot ? 'has-value' : ''}`}
															class:is-conflict={activeSlot && segmentHasConflict(segment, key)}
															type="button"
															style={activeSlot ? cellStyle(kode) : ''}
															ondragover={allowDrop}
															ondrop={(event) => dropToCell(event, hari, jamKe, kelas.id, segment)}
															onclick={() => openCell(hari, jamKe, kelas.id, kode ?? '', segment)}
															aria-label={`${hariLabel[hari]}, ${kelas.nama}, jam ${jamKe}: ${activeSlot ? (kode ? `${kode} - ${textFor(kode)}` : slotDefault || 'Kosong') : 'Tidak aktif'}`}
															disabled={!canManage || !activeSlot}
															title={activeSlot
																? kode
																	? `${kode} - ${textFor(kode)}`
																	: 'Kosong'
																: `Jam tidak aktif untuk ${jenjangLabel[group.jenjang]}`}
														>
															{#if !activeSlot}
																<span class="slot-inactive">Tidak aktif</span>
															{:else if kode}
																<span class="slot-code">{kode}</span>
																<span class="slot-name">{textFor(kode)}</span>
																{#if segment && segment.cellKeys.length > 1}
																	<span class="slot-span">
																		{segment.kind === 'mapel'
																			? `${segment.rowSpan} JP`
																			: `${segment.colSpan} kelas`}
																	</span>
																{/if}
																{#if detailFor(kode)}<span class="slot-detail"
																		>{detailFor(kode)}</span
																	>{/if}
															{:else}
																{#if slotDefault}
																	<span class="slot-name">{slotDefault}</span>
																	<span class="slot-detail">Kegiatan default · Non-JP</span>
																{:else}
																	<span class="slot-empty">-</span>
																{/if}
															{/if}
														</button>
													</td>
												{/if}
											{/each}
										{/each}
									</tr>
								{/each}
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

		<aside
			id="schedule-item-panel"
			class="schedule-panel min-w-0 space-y-3 xl:sticky xl:top-4 xl:self-start"
			aria-label="Item Jadwal"
		>
			<div class="bg-base-100 rounded-lg p-3 shadow-md">
				<div class="schedule-panel-heading flex items-center gap-1">
					<h2 class="min-w-0 flex-1 truncate font-bold">
						<span class="schedule-panel-title">Item Jadwal</span><span
							class="schedule-panel-short-title">Item</span
						>
					</h2>
					<span class="badge badge-soft schedule-panel-count">{visiblePaletteItems.length}</span>
					<button
						class="btn btn-ghost btn-sm btn-square schedule-panel-desktop-control"
						type="button"
						onclick={movePanel}
						title="Pindahkan panel"
						aria-label="Pindahkan panel"
					>
						<Icon name={panelSide === 'right' ? 'left' : 'right'} />
					</button>
					<button
						class="btn btn-ghost btn-sm btn-square schedule-panel-desktop-control"
						type="button"
						onclick={togglePanel}
						title={panelCollapsed ? 'Buka panel' : 'Ciutkan panel'}
						aria-label={panelCollapsed ? 'Buka panel' : 'Ciutkan panel'}
						aria-expanded={!panelCollapsed}
					>
						<Icon name={panelCollapsed ? 'right' : 'left'} />
					</button>
					<button
						class="btn btn-ghost btn-sm btn-square schedule-mobile-trigger"
						type="button"
						title="Tutup panel item"
						aria-label="Tutup panel item"
						onclick={() => (mobilePanelOpen = false)}><Icon name="close" /></button
					>
				</div>
				<div class="schedule-panel-body">
					<label class="schedule-panel-desktop-control mt-3 mb-3 flex items-center gap-2 text-xs">
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
							aria-pressed={activePalette === 'mapel'}
							type="button"
							onclick={() => (activePalette = 'mapel')}>Mata Pelajaran</button
						>
						<button
							class="btn btn-sm join-item"
							class:btn-primary={activePalette === 'kegiatan'}
							aria-pressed={activePalette === 'kegiatan'}
							type="button"
							onclick={() => (activePalette = 'kegiatan')}>Kegiatan</button
						>
					</div>
					<label class="input input-sm bg-base-200 mb-2 flex items-center gap-2">
						<Icon name="search" />
						<input
							class="min-w-0 grow"
							aria-label="Cari item jadwal"
							placeholder="Cari kode atau nama"
							bind:value={paletteSearch}
						/>
					</label>
					<div class="schedule-palette-list space-y-1 overflow-y-auto pr-1">
						{#each visiblePaletteItems as item (`${item.source}-${item.id}`)}
							{@const jpState = item.source === 'mapel' ? paletteJpStatus.get(item.kode) : null}
							<button
								class="palette-item"
								type="button"
								draggable={canManage}
								ondragstart={(event) => startDrag(event, item)}
								title={`${item.kode} - ${item.nama}${item.detail ? ` · ${item.detail}` : ''}`}
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
								<span class="flex max-w-24 shrink-0 flex-col items-end gap-1">
									{#if jpState}
										<span
											class="badge badge-sm whitespace-nowrap text-[10px]"
											class:badge-warning={jpState.kurangJp > 0}
											class:badge-error={jpState.kurangJp === 0 && jpState.lebihJp > 0}
											class:badge-success={jpState.kurangJp === 0 && jpState.lebihJp === 0}
											title={`Total ${jpState.actual}/${jpState.target} JP pada kelas yang tampil`}
										>
											{jpState.kurangJp > 0
												? `${jpState.kurangJp} JP kurang`
												: jpState.lebihJp > 0
													? `${jpState.lebihJp} JP lebih`
													: 'Sesuai'}
										</span>
									{/if}
									{#if item.detail}
										<span
											class="text-base-content/60 max-w-24 truncate text-[10px]"
											title={item.detail}
										>
											{item.detail}
										</span>
									{/if}
								</span>
							</button>
						{:else}
							<div class="border-base-200 text-base-content/60 rounded-lg border p-3 text-sm">
								{paletteSearch.trim() ? 'Tidak ada item yang cocok.' : 'Data belum tersedia.'}
							</div>
						{/each}
					</div>
				</div>
			</div>
		</aside>
	</section>
</div>

<dialog
	class="modal app-modal schedule-modal schedule-target-modal"
	bind:this={jpTargetDialog}
	aria-labelledby="jp-target-title"
>
	<div class="modal-box app-modal-box">
		<div class="flex items-start justify-between gap-3">
			<div>
				<h3 id="jp-target-title" class="app-modal-title">Target JP per Kelas</h3>
				<p class="text-base-content/70 mt-1 text-sm">
					Target ini hanya berlaku untuk {activeJenisLabel} pada tahun ajaran {activeTahunAjaranName}.
				</p>
			</div>
			<button
				class="btn btn-ghost btn-square btn-sm"
				type="button"
				title="Tutup"
				aria-label="Tutup Target JP"
				onclick={() => jpTargetDialog?.close()}
			>
				<Icon name="close" />
			</button>
		</div>
		<div class="app-modal-body">
			<div class="bg-info/10 border-info/20 rounded-md border p-3 text-sm">
				Nilai awal mengikuti JP per kelas/minggu dari Data Mata Pelajaran. Isi 0 jika mapel tidak
				digunakan pada kelas dan jenis jadwal ini.
			</div>
			<!-- svelte-ignore a11y_no_noninteractive_tabindex (Allow keyboard scrolling of the target matrix.) -->
			<div
				class="schedule-target-scroll border-base-300 mt-4 overflow-auto rounded-md border"
				tabindex="0"
				role="region"
				aria-label="Target JP per kelas"
			>
				<table class="table-sm table">
					<thead class="bg-base-200 sticky top-0 z-10">
						<tr>
							<th class="sticky left-0 z-20 min-w-48 bg-inherit">Mata Pelajaran</th>
							{#each visibleKelas as kelas (kelas.id)}
								<th class="min-w-24 text-center">{kelas.nama}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each mapelItems as item (item.id)}
							{#if visibleKelas.some((kelas) => itemSesuaiKelas(item, kelas))}
								<tr>
									<th class="bg-base-100 sticky left-0 z-10">
										<div class="font-bold">{item.kode}</div>
										<div class="text-base-content/60 max-w-44 truncate text-xs" title={item.nama}>
											{item.nama}
										</div>
									</th>
									{#each visibleKelas as kelas (kelas.id)}
										<td class="text-center">
											{#if itemSesuaiKelas(item, kelas)}
												{@const key = targetKey(kelas.id, item.id)}
												<input
													class="input input-sm input-bordered w-20 text-center"
													type="number"
													min="0"
													max="50"
													value={jpTargetDraft[key] ?? 0}
													oninput={(event) =>
														(jpTargetDraft[key] = Number(event.currentTarget.value))}
													aria-label={`Target ${item.kode} kelas ${kelas.nama}`}
												/>
											{:else}
												<span class="text-base-content/30">-</span>
											{/if}
										</td>
									{/each}
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
			</div>
		</div>
		<div class="modal-action app-modal-actions">
			<button class="btn" type="button" onclick={() => jpTargetDialog?.close()}>Batal</button>
			<button
				class="btn btn-primary"
				type="button"
				onclick={saveJpTargets}
				disabled={jpTargetSaving}
			>
				{#if jpTargetSaving}<span class="loading loading-spinner loading-sm"></span>{:else}<Icon
						name="save"
					/>{/if}
				Simpan Target JP
			</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop"><button>Tutup</button></form>
</dialog>

<dialog
	class="modal app-modal schedule-modal schedule-drop-modal"
	bind:this={dropDialog}
	aria-labelledby="schedule-drop-title"
>
	<div class="modal-box app-modal-box">
		<h3 id="schedule-drop-title" class="app-modal-title">Terapkan Item Jadwal</h3>
		<div class="app-modal-body">
			{#if pendingDrop}
				<p class="text-base-content/70 mt-1 text-sm">
					{pendingDrop.item.kode} - {pendingDrop.item.nama} ke {hariLabel[pendingDrop.hari]} jam {pendingDrop.jamKe}.
				</p>
				<div class="mt-4 grid gap-2">
					{#if pendingDrop.blockCellKeys.length > 1}
						<button
							class="btn btn-primary justify-start shadow-none"
							type="button"
							onclick={() => applyPendingDrop('block')}
						>
							<span class="flex-1 text-left"
								>Seluruh blok ({pendingDrop.blockCellKeys.length} sel)</span
							>
							{#if overwriteCountForDrop('block')}<span class="badge badge-warning"
									>Timpa {overwriteCountForDrop('block')}</span
								>{/if}
						</button>
					{/if}
					<button
						class="btn btn-primary justify-start shadow-none"
						type="button"
						onclick={() => applyPendingDrop('cell')}
					>
						<span class="flex-1 text-left">Sel ini saja</span>
						{#if overwriteCountForDrop('cell')}<span class="badge badge-warning"
								>Timpa {overwriteCountForDrop('cell')}</span
							>{/if}
					</button>
					{#if pendingDrop.item.source === 'kegiatan'}
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
					{/if}
				</div>
			{/if}
		</div>
		<div class="modal-action app-modal-actions">
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

<dialog
	class="modal app-modal schedule-modal"
	bind:this={cellDialog}
	aria-labelledby="schedule-cell-title"
>
	<div class="modal-box app-modal-box">
		<h3 id="schedule-cell-title" class="app-modal-title">Edit Blok Jadwal</h3>
		<div class="app-modal-body">
			{#if selectedCell}
				<p class="text-base-content/70 mt-1 text-sm">
					{hariLabel[selectedCell.hari]} jam {selectedCell.jamKe} - {selectedKelas?.nama ?? 'Kelas'}
					{#if selectedCell.blockCellKeys.length > 1}
						<span class="badge badge-info ml-1"
							>{selectedCell.blockCellKeys.length} sel tergabung</span
						>
					{/if}
				</p>
				<label class="schedule-field mt-4">
					<span>Item Jadwal</span>
					<select class="select w-full" bind:value={editKode}>
						<option value="">Kosong</option>
						<optgroup label="Mata Pelajaran">
							{#each selectedMapelItems as item (`edit-mapel-${item.id}`)}
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
		</div>
		<div class="modal-action app-modal-actions schedule-cell-actions">
			<button
				class="btn"
				type="button"
				onclick={() => {
					selectedCell = null;
					cellDialog?.close();
				}}>Batal</button
			>
			{#if selectedCell && selectedCell.blockCellKeys.length > 1}
				<button
					class="btn btn-error btn-outline"
					type="button"
					onclick={() => clearSelectedCell('block')}>Kosongkan Blok</button
				>
				<button class="btn btn-soft" type="button" onclick={() => saveSelectedCell('cell')}
					>Simpan Sel Awal</button
				>
				<button class="btn btn-primary" type="button" onclick={() => saveSelectedCell('block')}
					>Simpan Seluruh Blok</button
				>
			{:else}
				<button
					class="btn btn-error btn-outline"
					type="button"
					onclick={() => clearSelectedCell('cell')}>Kosongkan</button
				>
				<button class="btn btn-primary" type="button" onclick={() => saveSelectedCell('cell')}
					>Simpan Sel</button
				>
			{/if}
		</div>
	</div>
	<form method="dialog" class="modal-backdrop"><button>Batal</button></form>
</dialog>

<dialog
	class="modal app-modal schedule-modal schedule-import-modal"
	bind:this={importDialog}
	aria-labelledby="schedule-import-title"
>
	<div class="modal-box app-modal-box">
		<div class="flex items-start justify-between gap-3">
			<div>
				<h3 id="schedule-import-title" class="app-modal-title">Impor Jadwal Pelajaran</h3>
				<p class="text-base-content/70 mt-1 text-sm">
					Data diperiksa untuk {data.selectedContext?.jenis === 'persiapan'
						? 'Masa Persiapan'
						: data.selectedContext?.jenis === 'genap'
							? 'Semester Genap'
							: 'Semester Ganjil'} dan tidak langsung disimpan.
				</p>
			</div>
			<button
				class="btn btn-ghost btn-sm btn-square"
				type="button"
				title="Tutup"
				aria-label="Tutup impor jadwal"
				onclick={() => importDialog?.close()}
			>
				<Icon name="close" />
			</button>
		</div>

		<div class="app-modal-body">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-end">
				<label class="schedule-field min-w-0 flex-1">
					<span>File Excel</span>
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
				<button
					class="btn btn-primary shadow-none"
					type="button"
					disabled={!importFile || importLoading}
					onclick={previewImport}
				>
					{#if importLoading}<span class="loading loading-spinner loading-sm"></span>{:else}<Icon
							name="search"
						/>{/if}
					Periksa File
				</button>
			</div>

			{#if importPreview}
				<div class="mt-5 grid grid-cols-3 gap-2">
					<div class="bg-base-200 rounded-md p-3">
						<div class="text-xs">Total Terisi</div>
						<div class="text-xl font-bold">{importPreview.total}</div>
					</div>
					<div class="bg-success/15 rounded-md p-3">
						<div class="text-xs">Valid</div>
						<div class="text-success text-xl font-bold">{importPreview.validRows.length}</div>
					</div>
					<div class="bg-error/15 rounded-md p-3">
						<div class="text-xs">Ditolak</div>
						<div class="text-error text-xl font-bold">{importPreview.invalidRows.length}</div>
					</div>
				</div>

				{#if importPreview.invalidRows.length}
					<div class="mt-4">
						<h4 class="text-error mb-2 font-semibold">Baris yang perlu diperbaiki</h4>
						<div class="border-base-300 max-h-52 overflow-auto rounded-md border">
							<table class="table table-sm">
								<thead class="bg-base-200 sticky top-0"
									><tr
										><th>Baris</th><th>Hari/Jam</th><th>Kelas</th><th>Kode</th><th>Masalah</th></tr
									></thead
								>
								<tbody>
									{#each importPreview.invalidRows as row (row.rowNumber)}
										<tr
											><td>{row.rowNumber}</td><td>{row.hari} {row.jamKe}</td><td>{row.kelas}</td
											><td>{row.kode}</td><td class="text-error">{row.reason}</td></tr
										>
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
								<thead class="bg-base-200 sticky top-0"
									><tr><th>Hari</th><th>Jam</th><th>Kelas</th><th>Kode</th></tr></thead
								>
								<tbody>
									{#each importPreview.validRows.slice(0, 100) as row (row.hari + '-' + row.jamKe + '-' + row.kelasId)}
										<tr
											><td>{hariLabel[row.hari]}</td><td>{row.jamKe}</td><td>{row.kelas}</td><td
												class="font-semibold">{row.kode}</td
											></tr
										>
									{/each}
								</tbody>
							</table>
						</div>
						{#if importPreview.validRows.length > 100}
							<p class="text-base-content/60 mt-1 text-xs">
								100 dari {importPreview.validRows.length} baris ditampilkan.
							</p>
						{/if}
					</div>
				{/if}

				<div class="mt-5 flex flex-wrap items-center justify-between gap-3">
					<div class="join">
						<button
							class="btn btn-sm join-item"
							class:btn-primary={importMode === 'merge'}
							aria-pressed={importMode === 'merge'}
							type="button"
							onclick={() => (importMode = 'merge')}>Gabungkan</button
						>
						<button
							class="btn btn-sm join-item"
							class:btn-primary={importMode === 'replace'}
							aria-pressed={importMode === 'replace'}
							type="button"
							onclick={() => (importMode = 'replace')}>Ganti Isi Tabel</button
						>
					</div>
				</div>
			{/if}
		</div>
		<div class="modal-action app-modal-actions">
			<button class="btn" type="button" onclick={() => importDialog?.close()}>Batal</button>
			{#if importPreview}
				<button
					class="btn btn-primary shadow-none"
					type="button"
					disabled={!importPreview.validRows.length}
					onclick={applyImportPreview}
				>
					<Icon name="check" /> Terapkan ke Tabel
				</button>
			{/if}
		</div>
	</div>
	<form method="dialog" class="modal-backdrop"><button>Tutup</button></form>
</dialog>

<style>
	.schedule-page {
		--schedule-control-height: 2.5rem;
		--schedule-gap: 0.75rem;
	}

	.schedule-heading {
		margin-bottom: 1rem;
	}

	.schedule-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 1rem;
	}

	.schedule-context {
		display: grid;
		min-width: 0;
		flex: 1 1 22rem;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--schedule-gap);
	}

	.schedule-field {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 0.5rem;
		font-size: 0.875rem;
		font-weight: 600;
	}

	.schedule-field .select {
		height: var(--schedule-control-height, 2.5rem);
		font-weight: 400;
	}

	.schedule-actions,
	.schedule-view-toolbar {
		display: flex;
		min-width: 0;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.5rem;
	}

	.schedule-view-toolbar {
		gap: var(--schedule-gap);
		margin-bottom: 1rem;
	}

	.schedule-jenjang {
		width: 12rem;
		max-width: 100%;
	}

	.schedule-view-toolbar .join .btn {
		height: var(--schedule-control-height);
	}

	.schedule-clear {
		margin-left: auto;
	}

	.schedule-check-summary {
		display: grid;
		cursor: pointer;
		gap: 0.75rem;
		padding: 0.75rem;
		list-style: none;
		font-size: 0.875rem;
	}

	.schedule-check-summary::-webkit-details-marker {
		display: none;
	}

	.schedule-check-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.schedule-check-details {
		max-height: 15rem;
		overflow-y: auto;
		padding: 0.75rem;
	}

	.schedule-check-details .badge {
		flex-shrink: 0;
	}

	.schedule-check-details span {
		overflow-wrap: anywhere;
	}

	.schedule-table-scroll {
		height: clamp(24rem, 65dvh, 52rem);
		overscroll-behavior: contain;
	}

	.schedule-palette-list {
		max-height: 20rem;
		overscroll-behavior: contain;
	}

	.schedule-panel {
		display: none;
		order: -1;
	}

	.mobile-panel-open .schedule-panel {
		display: block;
	}

	.schedule-panel-desktop-control {
		display: none;
	}

	.schedule-panel-short-title {
		display: none;
	}

	.schedule-page :is(button, summary, select, input, [tabindex='0']):focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: -2px;
	}

	.schedule-modal {
		--app-modal-width: 42rem;
	}

	.schedule-target-modal {
		--app-modal-width: 80rem;
	}

	.schedule-drop-modal {
		--app-modal-width: 28rem;
	}

	.schedule-import-modal {
		--app-modal-width: 64rem;
	}

	.schedule-target-scroll {
		max-height: 50dvh;
	}

	.schedule-table thead,
	.schedule-target-scroll :global(thead) {
		z-index: 30;
	}

	.schedule-cell-actions .btn-error {
		margin-right: auto;
	}

	@media (max-width: 39.99rem) {
		.schedule-actions {
			display: grid;
			width: 100%;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			align-items: stretch;
		}

		.schedule-actions :is(.btn, .dropdown) {
			width: 100%;
			min-width: 0;
		}

		.schedule-actions .btn {
			min-height: 2.5rem;
			height: auto;
			padding: 0.5rem;
			font-size: 0.8125rem;
		}

		.schedule-actions > .btn,
		.schedule-actions .dropdown .btn {
			height: 100%;
		}

		.schedule-table-scroll {
			height: 65dvh;
			min-height: 20rem;
		}

		.schedule-jenjang {
			width: 100%;
		}

		.schedule-target-scroll :global(th:first-child) {
			min-width: 9rem;
			max-width: 9rem;
		}

		.schedule-target-scroll :global(th:first-child div) {
			max-width: 7rem;
		}
	}

	@media (max-width: 23.99rem) {
		.schedule-context {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (min-width: 80rem) {
		.schedule-workspace {
			grid-template-columns: minmax(0, 1fr) var(--panel-width);
		}

		.schedule-workspace.panel-left {
			grid-template-columns: var(--panel-width) minmax(0, 1fr);
		}

		.schedule-panel {
			display: block;
			order: 0;
		}

		.schedule-panel-desktop-control {
			display: flex;
		}

		.panel-collapsed .schedule-panel-heading {
			flex-wrap: wrap;
		}

		.panel-collapsed .schedule-panel-heading h2 {
			flex-basis: 100%;
		}

		.panel-collapsed .schedule-panel-body,
		.panel-collapsed .schedule-panel-title,
		.panel-collapsed .schedule-panel-count {
			display: none;
		}

		.panel-collapsed .schedule-panel-short-title {
			display: inline;
		}

		.schedule-mobile-trigger {
			display: none;
		}

		.schedule-palette-list {
			max-height: min(65dvh, 44rem);
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
		border-color: var(--color-base-300);
	}

	.schedule-table {
		border-collapse: separate;
		border-spacing: 0;
	}

	.schedule-table :global(tr.day-start > td) {
		border-top: 2px solid var(--color-base-300);
	}

	.schedule-head {
		background: var(--color-base-200);
		color: var(--color-base-content);
		font-weight: 700;
		height: 2.75rem;
	}

	.schedule-cell {
		min-width: 10rem;
		padding: 0.25rem;
	}

	.schedule-cell.is-merged {
		padding: 0.2rem;
		position: relative;
	}

	.schedule-cell.is-merged .slot-button {
		border-width: 2px;
		inset: 0.2rem;
		position: absolute;
		width: auto;
	}

	.slot-span {
		border: 1px solid color-mix(in srgb, currentColor 28%, transparent);
		border-radius: 999px;
		font-size: 0.58rem;
		font-weight: 700;
		line-height: 1;
		margin-top: 0.1rem;
		padding: 0.15rem 0.35rem;
	}

	.sticky-col {
		position: sticky;
		z-index: 12;
	}

	.sticky-col-day {
		left: 0;
		min-width: 4rem;
		width: 4rem;
	}

	.group-jam-head,
	.group-jam-cell {
		border-left: 2px solid color-mix(in oklab, var(--color-info) 35%, var(--color-base-300));
		min-width: 5.5rem;
	}

	.group-jam-cell {
		background: color-mix(in oklab, var(--color-info) 6%, var(--color-base-100));
		padding: 0.25rem;
	}

	.group-jam-cell.is-inactive,
	.schedule-cell.is-inactive {
		background: color-mix(in srgb, var(--color-base-300) 45%, var(--color-base-100));
	}

	.slot-button:disabled .slot-inactive {
		color: color-mix(in srgb, currentColor 48%, transparent);
		font-size: 0.62rem;
		font-weight: 600;
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
		min-height: 2.625rem;
		padding: 0.2rem;
	}

	.compact-schedule .slot-code {
		font-size: 0.75rem;
	}

	.compact-schedule .slot-name {
		max-width: 6.25rem;
		font-size: 0.6875rem;
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
		gap: 0.125rem;
		background: var(--color-base-100);
		padding: 0.35rem;
		text-align: center;
	}

	.slot-button:not(:disabled):hover {
		outline: 2px solid var(--color-primary);
		outline-offset: -2px;
	}

	.slot-button.is-conflict {
		border-color: var(--color-error);
		box-shadow: inset 0 0 0 2px color-mix(in oklab, var(--color-error) 35%, transparent);
	}

	.slot-button.has-value {
		border-style: solid;
		border-color: color-mix(in oklab, var(--slot-color) 40%, var(--color-base-300));
		border-left: 3px solid var(--slot-color);
		background: color-mix(in oklab, var(--slot-color) 18%, var(--color-base-100));
		color: var(--color-base-content);
	}

	.slot-button.has-value.is-conflict {
		border-color: var(--color-error);
	}

	.slot-code {
		font-size: 0.8125rem;
		font-weight: 800;
		line-height: 1.2;
	}

	.slot-name,
	.slot-detail {
		max-width: 8.5rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.slot-name {
		font-size: 0.75rem;
	}

	.slot-detail,
	.slot-empty {
		font-size: 0.6875rem;
		opacity: 0.72;
	}

	.palette-item {
		align-items: center;
		border: 1px solid var(--color-base-300);
		border-radius: 0.375rem;
		display: flex;
		gap: 0.375rem;
		min-height: 3.25rem;
		padding: 0.5rem;
		width: 100%;
	}

	.palette-item:not(:disabled) {
		cursor: grab;
	}

	.palette-item:not(:disabled):active {
		cursor: grabbing;
	}

	.palette-item:hover {
		border-color: var(--color-primary);
		background: var(--color-base-200);
	}

	.palette-swatch {
		border: 1px solid rgba(15, 23, 42, 0.15);
		border-radius: 999px;
		height: 1rem;
		width: 1rem;
		flex: 0 0 auto;
	}
</style>
