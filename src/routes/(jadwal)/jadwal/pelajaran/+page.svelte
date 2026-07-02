<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- filter memakai query dinamis */
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Icon from '$lib/components/icon.svelte';

	type Hari = 'senin' | 'selasa' | 'rabu' | 'kamis' | 'jumat';
	type SlotType = 'pelajaran' | 'kegiatan' | 'istirahat' | 'kosong';
	type JenjangFilter = 'semua' | 'srd' | 'srmp' | 'srma';
	type ViewMode = 'master' | 'guru';
	type MasterEditTarget = { kelasId: number; jamId: number };
	type DragPayload =
		| { kind: 'tipe'; tipe: SlotType }
		| { kind: 'kegiatan'; id: number }
		| { kind: 'kokurikuler'; id: number }
		| { kind: 'mapel'; id: number }
		| { kind: 'guru'; id: number };
	type MasterDraft = {
		tipe?: SlotType;
		jadwalMapelId?: number | null;
		mataPelajaranId?: number | null;
		kegiatanId?: number | null;
		kokurikulerId?: number | null;
		guruPegawaiId?: number | null;
	};
	type ConflictDetail = {
		key: string;
		kind: 'guru' | 'mapel';
		title: string;
		jamId: number;
		hari: Hari;
		jamKe: number;
		pukul: string;
		slots: Array<{ kelasId: number; kelasNama: string; label: string }>;
	};
	type KelasRow = {
		id: number;
		nama: string;
		fase: string | null;
		jenjang: Exclude<JenjangFilter, 'semua'>;
	};
	type JamRow = {
		id: number;
		hari: Hari;
		jamKe: number;
		label: string | null;
		pukulMulai: string;
		pukulSelesai: string;
		tipe: SlotType;
		namaDefault: string | null;
		jenjang: Exclude<JenjangFilter, 'semua'>;
	};
	type JadwalRow = {
		id: number;
		kelasId: number;
		jamId: number;
		tipe: SlotType;
		jadwalMapelId: number | null;
		mataPelajaranId: number | null;
		kokurikulerId: number | null;
		kegiatanId: number | null;
		guruPegawaiId: number | null;
		catatan: string | null;
	};
	type PageData = {
		sekolahNama: string;
		activeSemesterId: number | null;
		kelasId: number | null;
		viewMode: ViewMode;
		selectedJenjang: JenjangFilter;
		kelasList: KelasRow[];
		masterKelasList: KelasRow[];
		canEdit: boolean;
		hariLabels: Record<Hari, string>;
		jamList: JamRow[];
		jadwalList: JadwalRow[];
		mapelList: Array<{
			id: number;
			kode: string;
			nama: string;
			jenjang: JenjangFilter;
			guruPegawaiId: number | null;
			warna: string | null;
			aktif: boolean;
		}>;
		kokurikulerList: Array<{ id: number; kelasId: number; kode: string; tujuan: string }>;
		kegiatanList: Array<{
			id: number;
			kode: string;
			nama: string;
			kategori: string;
			warna: string | null;
		}>;
		guruList: Array<{ id: number; nama: string; nip: string }>;
	};

	let { data }: { data: PageData } = $props();
	let masterEditTarget = $state<MasterEditTarget | null>(null);
	let masterDraft = $state<MasterDraft>({});
	let dragHoverKey = $state<string | null>(null);
	const hariOrder: Hari[] = ['senin', 'selasa', 'rabu', 'kamis', 'jumat'];
	const jenjangLabels: Record<JenjangFilter, string> = {
		semua: 'Semua Jenjang',
		srd: 'SRD',
		srmp: 'SRMP',
		srma: 'SRMA'
	};
	const typeLabels: Record<SlotType, string> = {
		pelajaran: 'Pelajaran',
		kegiatan: 'Kegiatan',
		istirahat: 'Istirahat',
		kosong: 'Kosong'
	};
	const jadwalByKelasJam = $derived(
		new Map(data.jadwalList.map((slot) => [slotKey(slot.kelasId, slot.jamId), slot]))
	);
	const selectedKelas = $derived(data.kelasList.find((kelas) => kelas.id === data.kelasId) ?? null);
	const masterEditKelas = $derived(
		masterEditTarget
			? (data.masterKelasList.find((kelas) => kelas.id === masterEditTarget?.kelasId) ?? null)
			: null
	);
	const masterEditJam = $derived(
		masterEditTarget
			? (data.jamList.find((jam) => jam.id === masterEditTarget?.jamId) ?? null)
			: null
	);
	const masterEditSlot = $derived(
		masterEditTarget ? masterSlotFor(masterEditTarget.kelasId, masterEditTarget.jamId) : null
	);
	const masterEditMapelList = $derived.by(() =>
		masterEditTarget ? mapelListForKelas(masterEditTarget.kelasId) : []
	);
	const masterEditKokurikulerList = $derived(
		masterEditTarget
			? data.kokurikulerList.filter((item) => item.kelasId === masterEditTarget?.kelasId)
			: []
	);
	const quickMapelList = $derived(data.mapelList.slice(0, 18));
	const quickKokurikulerList = $derived(
		data.kokurikulerList
			.filter((item) => data.masterKelasList.some((kelas) => kelas.id === item.kelasId))
			.slice(0, 12)
	);
	let dragSearch = $state('');
	const printRowIndexes = $derived.by(() => {
		const maxRows = Math.max(0, ...hariOrder.map((hari) => jamByHari(hari).length));
		return Array.from({ length: maxRows }, (_, index) => index);
	});
	const masterStats = $derived.by(() => {
		const totalCells = data.masterKelasList.length * data.jamList.length;
		const filled = data.jadwalList.filter((slot) => slot.tipe !== 'kosong').length;
		return { totalCells, filled, empty: Math.max(totalCells - filled, 0) };
	});
	const guruConflictDetails = $derived.by(() => {
		const grouped = new Map<string, JadwalRow[]>();
		for (const slot of data.jadwalList) {
			if (!slot.guruPegawaiId) continue;
			const key = guruSlotKey(slot.jamId, slot.guruPegawaiId);
			grouped.set(key, [...(grouped.get(key) ?? []), slot]);
		}
		return [...grouped.entries()]
			.filter(([, slots]) => slots.length > 1)
			.map(([key, slots]) => {
				const firstSlot = slots[0];
				const jam = data.jamList.find((item) => item.id === firstSlot.jamId);
				const guru = data.guruList.find((item) => item.id === firstSlot.guruPegawaiId);
				const hari = jam?.hari ?? 'senin';
				return {
					key,
					kind: 'guru',
					title: guru?.nama ?? 'Guru',
					jamId: firstSlot.jamId,
					hari,
					jamKe: jam?.jamKe ?? 0,
					pukul: jam ? `${jam.pukulMulai} - ${jam.pukulSelesai}` : '-',
					slots: slots
						.map((slot) => {
							const kelas = data.masterKelasList.find((item) => item.id === slot.kelasId);
							return {
								kelasId: slot.kelasId,
								kelasNama: kelas?.nama ?? 'Kelas',
								label: shortSlotLabel(jam ?? fallbackJam(slot.jamId), slot)
							};
						})
						.sort((a, b) => a.kelasNama.localeCompare(b.kelasNama))
				} satisfies ConflictDetail;
			})
			.sort((a, b) => {
				const hariDiff = hariOrder.indexOf(a.hari) - hariOrder.indexOf(b.hari);
				if (hariDiff !== 0) return hariDiff;
				if (a.jamKe !== b.jamKe) return a.jamKe - b.jamKe;
				return a.title.localeCompare(b.title);
			});
	});
	const mapelConflictDetails = $derived.by(() => {
		const grouped = new Map<string, JadwalRow[]>();
		for (const slot of data.jadwalList) {
			if (!slot.jadwalMapelId || slot.tipe !== 'pelajaran') continue;
			const key = mapelSlotKey(slot.jamId, slot.jadwalMapelId);
			grouped.set(key, [...(grouped.get(key) ?? []), slot]);
		}
		return [...grouped.entries()]
			.filter(([, slots]) => slots.length > 1)
			.map(([key, slots]) => {
				const firstSlot = slots[0];
				const jam = data.jamList.find((item) => item.id === firstSlot.jamId);
				const mapel = data.mapelList.find((item) => item.id === firstSlot.jadwalMapelId);
				const hari = jam?.hari ?? 'senin';
				return {
					key,
					kind: 'mapel',
					title: mapel?.kode || mapel?.nama || 'Mapel',
					jamId: firstSlot.jamId,
					hari,
					jamKe: jam?.jamKe ?? 0,
					pukul: jam ? jam.pukulMulai + ' - ' + jam.pukulSelesai : '-',
					slots: slots
						.map((slot) => {
							const kelas = data.masterKelasList.find((item) => item.id === slot.kelasId);
							return {
								kelasId: slot.kelasId,
								kelasNama: kelas?.nama ?? 'Kelas',
								label: guruName(slot) ?? 'Guru belum diisi'
							};
						})
						.sort((a, b) => a.kelasNama.localeCompare(b.kelasNama))
				} satisfies ConflictDetail;
			})
			.sort((a, b) => {
				const hariDiff = hariOrder.indexOf(a.hari) - hariOrder.indexOf(b.hari);
				if (hariDiff !== 0) return hariDiff;
				if (a.jamKe !== b.jamKe) return a.jamKe - b.jamKe;
				return a.title.localeCompare(b.title);
			});
	});
	const allConflictDetails = $derived([...guruConflictDetails, ...mapelConflictDetails]);
	const guruConflictKeys = $derived(new Set(guruConflictDetails.map((item) => item.key)));
	const dragMapelList = $derived.by(() =>
		quickMapelList.filter((mapel) =>
			(mapel.kode + ' ' + mapel.nama).toLowerCase().includes(dragSearch.trim().toLowerCase())
		)
	);
	const dragKegiatanList = $derived.by(() =>
		data.kegiatanList.filter((kegiatan) =>
			(kegiatan.kode + ' ' + kegiatan.nama).toLowerCase().includes(dragSearch.trim().toLowerCase())
		)
	);
	const dragKokurikulerList = $derived.by(() =>
		quickKokurikulerList.filter((item) =>
			(item.kode + ' ' + item.tujuan).toLowerCase().includes(dragSearch.trim().toLowerCase())
		)
	);
	const guruPanelRows = $derived.by(() => {
		return data.guruList
			.map((guru) => {
				const slots = data.jadwalList.filter((slot) => slot.guruPegawaiId === guru.id);
				const conflicts = slots.filter((slot) =>
					guruConflictKeys.has(guruSlotKey(slot.jamId, guru.id))
				).length;
				return { ...guru, total: slots.length, conflicts };
			})
			.filter((guru) => guru.total > 0)
			.sort(
				(a, b) => b.conflicts - a.conflicts || b.total - a.total || a.nama.localeCompare(b.nama)
			);
	});

	function slotKey(kelasId: number, jamId: number) {
		return `${kelasId}:${jamId}`;
	}

	function guruSlotKey(jamId: number, guruId: number) {
		return `${jamId}:${guruId}`;
	}

	function mapelSlotKey(jamId: number, mapelId: number) {
		return `${jamId}:${mapelId}`;
	}

	function fallbackJam(jamId: number): JamRow {
		return {
			id: jamId,
			hari: 'senin',
			jamKe: 0,
			label: null,
			pukulMulai: '-',
			pukulSelesai: '-',
			tipe: 'kosong',
			namaDefault: null,
			jenjang: 'srma'
		};
	}

	function jamByHari(hari: Hari) {
		return data.jamList.filter((jam) => jam.hari === hari);
	}

	function isJamForKelas(jam: JamRow, kelas: KelasRow) {
		return jam.jenjang === kelas.jenjang;
	}

	function mapelListForKelas(kelasId: number) {
		const kelas = data.kelasList.find((item) => item.id === kelasId);
		if (!kelas) return data.mapelList;
		return data.mapelList.filter(
			(mapel) => mapel.jenjang === 'semua' || mapel.jenjang === kelas.jenjang
		);
	}

	function slotFor(jamId: number) {
		return data.kelasId ? (jadwalByKelasJam.get(slotKey(data.kelasId, jamId)) ?? null) : null;
	}

	function masterSlotFor(kelasId: number, jamId: number) {
		return jadwalByKelasJam.get(slotKey(kelasId, jamId)) ?? null;
	}

	function slotConflictDetails(slot: JadwalRow | null) {
		if (!slot) return [];
		return allConflictDetails.filter((item) => {
			if (item.kind === 'guru' && slot.guruPegawaiId) {
				return item.key === guruSlotKey(slot.jamId, slot.guruPegawaiId);
			}
			if (item.kind === 'mapel' && slot.jadwalMapelId) {
				return item.key === mapelSlotKey(slot.jamId, slot.jadwalMapelId);
			}
			return false;
		});
	}

	function conflictDetailFor(slot: JadwalRow | null) {
		return slotConflictDetails(slot)[0] ?? null;
	}

	function conflictTitle(slot: JadwalRow | null) {
		const detail = conflictDetailFor(slot);
		if (!detail) return '';
		const kelasList = detail.slots.map((item) => item.kelasNama).join(', ');
		const jenis = detail.kind === 'guru' ? 'Guru' : 'Mapel';
		return (
			jenis +
			' ' +
			detail.title +
			' bentrok pada ' +
			data.hariLabels[detail.hari] +
			' jam ' +
			detail.jamKe +
			': ' +
			kelasList
		);
	}

	function isSlotConflict(slot: JadwalRow | null) {
		return slotConflictDetails(slot).length > 0;
	}

	function viewHref(
		mode: ViewMode,
		jenjang = data.selectedJenjang,
		kelasId: number | null = data.kelasId
	) {
		const params = new URLSearchParams(page.url.search);
		params.set('mode', mode);
		if (jenjang === 'semua') params.delete('jenjang');
		else params.set('jenjang', jenjang);
		if (mode === 'master' || mode === 'guru') params.delete('kelas_id');
		else if (kelasId) params.set('kelas_id', String(kelasId));
		return `${page.url.pathname}?${params.toString()}`;
	}

	function updateJenjang(value: string) {
		const jenjang = (value || 'semua') as JenjangFilter;
		void goto(viewHref(data.viewMode, jenjang, null), { replaceState: true, keepFocus: true });
	}

	function actionWithFilter(actionName: string) {
		const params = new URLSearchParams();
		params.set('mode', data.viewMode);
		params.set('jenjang', data.selectedJenjang);
		if (data.kelasId) params.set('kelas_id', String(data.kelasId));
		return `?/${actionName}&${params.toString()}`;
	}
	function openMasterEditor(kelasId: number, jamId: number, draft: MasterDraft = {}) {
		if (!data.canEdit) {
			void goto(viewHref('master', data.selectedJenjang, kelasId));
			return;
		}
		masterDraft = draft;
		masterEditTarget = { kelasId, jamId };
	}

	function closeMasterEditor() {
		masterEditTarget = null;
		masterDraft = {};
	}

	function setMasterDraftType(tipe: SlotType) {
		masterDraft = { ...masterDraft, tipe };
	}

	function activeMasterType() {
		return masterDraft.tipe ?? masterEditSlot?.tipe ?? masterEditJam?.tipe ?? 'pelajaran';
	}

	function dragPayloadText(payload: DragPayload) {
		return JSON.stringify(payload);
	}

	function startDrag(event: DragEvent, payload: DragPayload) {
		if (!data.canEdit || !event.dataTransfer) return;
		event.dataTransfer.effectAllowed = 'copy';
		event.dataTransfer.setData('application/x-raporkumer-jadwal', dragPayloadText(payload));
		event.dataTransfer.setData('text/plain', dragPayloadText(payload));
	}

	function parseDragPayload(event: DragEvent): DragPayload | null {
		const raw =
			event.dataTransfer?.getData('application/x-raporkumer-jadwal') ||
			event.dataTransfer?.getData('text/plain');
		if (!raw) return null;
		try {
			const parsed = JSON.parse(raw) as DragPayload;
			return parsed && typeof parsed === 'object' && 'kind' in parsed ? parsed : null;
		} catch {
			return null;
		}
	}

	function draftFromPayload(
		payload: DragPayload,
		kelasId: number,
		currentSlot: JadwalRow | null
	): MasterDraft | null {
		if (payload.kind === 'tipe') return { tipe: payload.tipe };
		if (payload.kind === 'kegiatan') return { tipe: 'kegiatan', kegiatanId: payload.id };
		if (payload.kind === 'kokurikuler') return { tipe: 'kegiatan', kokurikulerId: payload.id };
		if (payload.kind === 'mapel') return { tipe: 'pelajaran', jadwalMapelId: payload.id };
		if (payload.kind === 'guru') {
			return {
				tipe: currentSlot?.tipe === 'pelajaran' ? 'pelajaran' : undefined,
				jadwalMapelId: currentSlot?.jadwalMapelId ?? null,
				mataPelajaranId: currentSlot?.mataPelajaranId ?? null,
				guruPegawaiId: payload.id
			};
		}
		return null;
	}

	function handleSlotDragOver(event: DragEvent, kelasId: number, jamId: number) {
		const kelas = data.masterKelasList.find((item) => item.id === kelasId);
		const jam = data.jamList.find((item) => item.id === jamId);
		if (!kelas || !jam || !isJamForKelas(jam, kelas)) return;
		if (!data.canEdit || !event.dataTransfer) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = 'copy';
		dragHoverKey = slotKey(kelasId, jamId);
	}

	function handleSlotDrop(
		event: DragEvent,
		kelasId: number,
		jamId: number,
		currentSlot: JadwalRow | null
	) {
		event.preventDefault();
		dragHoverKey = null;
		const kelas = data.masterKelasList.find((item) => item.id === kelasId);
		const jam = data.jamList.find((item) => item.id === jamId);
		if (!kelas || !jam || !isJamForKelas(jam, kelas)) return;
		const payload = parseDragPayload(event);
		if (!payload) return;
		const draft = draftFromPayload(payload, kelasId, currentSlot);
		if (!draft) return;
		openMasterEditor(kelasId, jamId, draft);
	}

	function handleSlotDragLeave(kelasId: number, jamId: number) {
		if (dragHoverKey === slotKey(kelasId, jamId)) dragHoverKey = null;
	}

	function shortSlotLabel(jam: JamRow, slot: JadwalRow | null) {
		if (!slot) return jam.namaDefault ?? '-';
		if (slot.tipe === 'pelajaran') {
			const mapel = data.mapelList.find((item) => item.id === slot.jadwalMapelId);
			return mapel?.kode || mapel?.nama || 'Pelajaran';
		}
		if (slot.tipe === 'kegiatan' || slot.tipe === 'istirahat') {
			const kegiatan = data.kegiatanList.find((item) => item.id === slot.kegiatanId);
			const kokurikuler = data.kokurikulerList.find((item) => item.id === slot.kokurikulerId);
			return kegiatan?.nama || kokurikuler?.kode || slot.catatan || typeLabels[slot.tipe];
		}
		return '-';
	}

	function slotCardClass(slot: JadwalRow | null, jam: JamRow) {
		if (isSlotConflict(slot)) return 'border-error bg-error/10 text-error-content';
		const tipe = slot?.tipe ?? jam.tipe;
		if (tipe === 'pelajaran')
			return mapelForSlot(slot)?.warna
				? 'border-base-300 bg-base-100'
				: 'border-info/40 bg-info/10';
		if (tipe === 'kegiatan') return 'border-success/40 bg-success/10';
		if (tipe === 'istirahat') return 'border-warning/40 bg-warning/15';
		return 'border-base-300 bg-base-100';
	}

	function mapelForSlot(slot: JadwalRow | null) {
		return slot?.jadwalMapelId
			? data.mapelList.find((item) => item.id === slot.jadwalMapelId)
			: null;
	}

	function colorAlpha(color: string, alpha: string) {
		return /^#[0-9a-fA-F]{6}$/.test(color) ? color + alpha : color;
	}

	function slotStyle(slot: JadwalRow | null) {
		const color = mapelForSlot(slot)?.warna;
		return color ? 'background: ' + colorAlpha(color, '24') + '; border-color: ' + color + ';' : '';
	}

	function mapelButtonStyle(mapel: { warna: string | null }) {
		return mapel.warna
			? 'background: ' + colorAlpha(mapel.warna, '24') + '; border-color: ' + mapel.warna + ';'
			: '';
	}

	function guruName(slot: JadwalRow | null) {
		if (!slot?.guruPegawaiId) return null;
		return data.guruList.find((item) => item.id === slot.guruPegawaiId)?.nama ?? 'Guru';
	}
</script>

<svelte:head>
	<style>
		@media print {
			@page {
				size: A4 landscape;
				margin: 10mm;
			}
			:global(body) {
				background: white !important;
			}
			:global(.no-print),
			:global(nav),
			:global(aside),
			.screen-schedule {
				display: none !important;
			}
			.print-area {
				padding: 0 !important;
			}
			.print-only {
				display: block !important;
			}
			.print-table th,
			.print-table td {
				border: 1px solid #111 !important;
				padding: 4px 6px !important;
				font-size: 10px !important;
				vertical-align: top !important;
			}
			.print-table th {
				background: #e5e7eb !important;
			}
			.print-master-table {
				table-layout: fixed !important;
				width: 100% !important;
			}
			.print-master-table th,
			.print-master-table td {
				padding: 2px 3px !important;
				font-size: 7.5px !important;
				line-height: 1.15 !important;
			}
			.print-master-table .print-class-col {
				width: auto !important;
			}
			.print-break-avoid {
				break-inside: avoid;
			}
		}
	</style>
</svelte:head>

<div class="print-area space-y-4">
	<div class="no-print flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h2 class="text-2xl font-bold">Jadwal Pelajaran SRT</h2>
			<p class="text-base-content/70 text-sm">
				Pantau jadwal semua kelas dalam satu tampilan, lalu masuk ke mode per kelas untuk input dan
				perbaikan jadwal.
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<a class="btn btn-soft btn-sm shadow-none" href={resolve('/jadwal/pengaturan')}>
				<Icon name="gear" />
				Pengaturan Jadwal
			</a>
		</div>
	</div>

	<div class="no-print card bg-base-100 border-base-200 rounded-lg border p-4 shadow-sm">
		<div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
			<div class="flex flex-col gap-3 md:flex-row md:items-end">
				<div class="join">
					<a
						class={`btn join-item btn-sm shadow-none ${data.viewMode === 'master' ? 'btn-primary' : 'btn-soft'}`}
						href={viewHref('master')}
					>
						Semua Kelas
					</a>
					<a
						class={`btn join-item btn-sm shadow-none ${data.viewMode === 'guru' ? 'btn-primary' : 'btn-soft'}`}
						href={viewHref('guru')}
					>
						Jadwal Guru
					</a>
				</div>
				<label class="form-control w-full md:w-52">
					<span class="label-text mb-1">Jenjang</span>
					<select
						class="select select-bordered select-sm"
						value={data.selectedJenjang}
						onchange={(event) => updateJenjang((event.currentTarget as HTMLSelectElement).value)}
					>
						{#each Object.entries(jenjangLabels) as [value, label] (value)}
							<option {value}>{label}</option>
						{/each}
					</select>
				</label>
			</div>
			<div class="stats stats-horizontal border-base-200 overflow-hidden border shadow-none">
				<div class="stat px-4 py-2">
					<div class="stat-title text-xs">Kelas</div>
					<div class="stat-value text-lg">{data.masterKelasList.length}</div>
				</div>
				<div class="stat px-4 py-2">
					<div class="stat-title text-xs">Terisi</div>
					<div class="stat-value text-lg">{masterStats.filled}</div>
				</div>
				<div class="stat px-4 py-2">
					<div class="stat-title text-xs">Kosong</div>
					<div class="stat-value text-lg">{masterStats.empty}</div>
				</div>
			</div>
		</div>
	</div>

	{#if !data.activeSemesterId}
		<div class="alert alert-warning">
			<Icon name="warning" />
			<span>Semester aktif belum diatur. Atur terlebih dahulu melalui Data Rapor.</span>
		</div>
	{:else if data.masterKelasList.length === 0}
		<div class="alert alert-info">
			<Icon name="info" />
			<span>Belum ada kelas pada filter jenjang ini.</span>
		</div>
	{:else}
		<section class="print-only hidden">
			{#if data.viewMode === 'master'}
				<div class="mb-3 text-center">
					<p class="text-xs font-semibold tracking-wide uppercase">{data.sekolahNama}</p>
					<h3 class="text-lg font-bold">Jadwal Pelajaran Program Akademik</h3>
					<p class="text-xs">
						{jenjangLabels[data.selectedJenjang]} - {data.masterKelasList.length} kelas
					</p>
				</div>
				<table class="print-table print-master-table border-collapse">
					<thead>
						<tr>
							<th class="w-10">Hari</th>
							<th class="w-8">Ke</th>
							<th class="w-16">Jam</th>
							{#each data.masterKelasList as kelas (kelas.id)}
								<th class="print-class-col">
									<div>{kelas.nama}</div>
									<div class="font-normal uppercase">{kelas.jenjang}</div>
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each hariOrder as hari (hari)}
							{#each jamByHari(hari) as jam, index (jam.id)}
								<tr class="print-break-avoid">
									{#if index === 0}
										<td rowspan={jamByHari(hari).length} class="text-center font-semibold">
											{data.hariLabels[hari]}
										</td>
									{/if}
									<td class="text-center font-semibold">{jam.jamKe}</td>
									<td class="text-center">{jam.pukulMulai} - {jam.pukulSelesai}</td>
									{#each data.masterKelasList as kelas (kelas.id)}
										{@const slot = masterSlotFor(kelas.id, jam.id)}
										<td>
											<div class="font-semibold">{shortSlotLabel(jam, slot)}</div>
											{#if guruName(slot)}
												<div>{guruName(slot)}</div>
											{/if}
										</td>
									{/each}
								</tr>
							{/each}
						{/each}
					</tbody>
				</table>
			{:else}
				<div class="mb-4 text-center">
					<p class="text-sm font-semibold tracking-wide uppercase">{data.sekolahNama}</p>
					<h3 class="text-xl font-bold">Jadwal Pelajaran</h3>
					<p class="text-sm">
						{selectedKelas?.nama ?? 'Kelas'}{selectedKelas?.fase
							? ` - Fase ${selectedKelas.fase}`
							: ''}
					</p>
				</div>
				<table class="print-table w-full border-collapse">
					<thead>
						<tr>
							<th class="w-14">Jam</th>
							<th class="w-24">Pukul</th>
							{#each hariOrder as hari (hari)}
								<th>{data.hariLabels[hari]}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each printRowIndexes as rowIndex (rowIndex)}
							{@const firstJam = hariOrder.map((hari) => jamByHari(hari)[rowIndex]).find(Boolean)}
							<tr>
								<td class="text-center font-semibold">{firstJam?.jamKe ?? rowIndex + 1}</td>
								<td class="text-center">
									{firstJam ? `${firstJam.pukulMulai} - ${firstJam.pukulSelesai}` : '-'}
								</td>
								{#each hariOrder as hari (hari)}
									{@const jam = jamByHari(hari)[rowIndex]}
									{@const slot = jam ? slotFor(jam.id) : null}
									<td>
										{#if jam}
											<div class="font-semibold">{shortSlotLabel(jam, slot)}</div>
											{#if guruName(slot)}
												<div>{guruName(slot)}</div>
											{/if}
										{:else}
											-
										{/if}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>

		{#if data.viewMode === 'master'}
			<div class="screen-schedule space-y-4">
				<div class="border-base-200 bg-base-100 overflow-hidden rounded-lg border shadow-sm">
					<div
						class="border-base-200 flex flex-col gap-1 border-b px-4 py-3 md:flex-row md:items-center md:justify-between"
					>
						<div>
							<h3 class="font-semibold">Master Jadwal {jenjangLabels[data.selectedJenjang]}</h3>
							<p class="text-base-content/60 text-xs">
								Klik sel kelas untuk isi/edit cepat tanpa keluar dari master jadwal.
							</p>
						</div>
						<div class="flex flex-wrap items-center gap-2">
							{#if guruConflictKeys.size > 0}
								<div class="badge badge-error badge-outline">Ada bentrok guru</div>
							{/if}
							{#if data.canEdit}
								<form method="POST" action="?/clearScheduleFiltered">
									<input type="hidden" name="semesterId" value={data.activeSemesterId ?? ''} />
									{#each data.masterKelasList as kelas (kelas.id)}
										<input type="hidden" name="kelasIds" value={kelas.id} />
									{/each}
									<button
										class="btn btn-error btn-outline btn-xs shadow-none"
										type="submit"
										disabled={!data.activeSemesterId || data.masterKelasList.length === 0}
										onclick={(event) => {
											if (!confirm('Bersihkan semua jadwal pada tabel/filter ini?'))
												event.preventDefault();
										}}
									>
										<Icon name="del" />
										Bersihkan Jadwal
									</button>
								</form>
							{/if}
						</div>
					</div>
					{#if data.canEdit}
						<div class="border-base-200 bg-base-200/20 border-b p-3">
							<div class="mb-2 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
								<div>
									<h4 class="text-sm font-semibold">Seret ke Jadwal</h4>
									<p class="text-base-content/60 text-xs">
										Tarik item ke sel kelas. Modal akan terbuka untuk cek pilihan sebelum disimpan.
									</p>
								</div>
								<div class="badge badge-outline badge-sm">Drag & drop aktif</div>
							</div>
							<div class="mb-3 grid gap-2 sm:grid-cols-3">
								<div class="border-base-200 bg-base-100 rounded border p-2 text-center">
									<div class="text-base-content/50 text-[10px]">Sisa jam</div>
									<div class="font-bold">{masterStats.empty}</div>
								</div>
								<div class="border-base-200 bg-base-100 rounded border p-2 text-center">
									<div class="text-base-content/50 text-[10px]">Mapel</div>
									<div class="font-bold">{data.mapelList.length}</div>
								</div>
								<div class="border-base-200 bg-base-100 rounded border p-2 text-center">
									<div class="text-base-content/50 text-[10px]">Kelas</div>
									<div class="font-bold">{data.masterKelasList.length}</div>
								</div>
							</div>
							<label
								class="input input-bordered input-sm bg-base-100 mb-3 flex items-center gap-2 shadow-sm"
							>
								<Icon name="search" />
								<input class="grow" bind:value={dragSearch} placeholder="Cari kode / nama" />
							</label>
							<div class="space-y-3">
								<div>
									<div class="text-base-content/60 mb-1 text-[11px] font-semibold uppercase">
										Tipe
									</div>
									<div class="flex flex-wrap gap-1.5">
										{#each Object.entries(typeLabels) as [key, label] (key)}
											<button
												class="badge badge-outline cursor-grab gap-1 px-3 py-3 select-none active:cursor-grabbing"
												type="button"
												draggable="true"
												ondragstart={(event) =>
													startDrag(event, { kind: 'tipe', tipe: key as SlotType })}
											>
												<Icon name="layers" />
												{label}
											</button>
										{/each}
									</div>
								</div>
								<div>
									<div class="text-base-content/60 mb-1 text-[11px] font-semibold uppercase">
										Kegiatan
									</div>
									<div class="flex flex-wrap gap-1.5">
										{#each dragKegiatanList as kegiatan (kegiatan.id)}
											<button
												class="badge badge-info badge-outline cursor-grab gap-1 px-3 py-3 select-none active:cursor-grabbing"
												type="button"
												draggable="true"
												ondragstart={(event) =>
													startDrag(event, { kind: 'kegiatan', id: kegiatan.id })}
												title="Tarik ke slot jadwal"
											>
												<Icon name="calendar" />
												{kegiatan.nama}
											</button>
										{/each}
									</div>
								</div>
								<div>
									<div class="text-base-content/60 mb-1 text-[11px] font-semibold uppercase">
										Mapel
									</div>
									<div class="flex flex-wrap gap-1.5">
										{#each dragMapelList as mapel (mapel.id)}
											<button
												class="badge cursor-grab gap-1 px-3 py-3 text-left select-none active:cursor-grabbing"
												style={mapelButtonStyle(mapel)}
												type="button"
												draggable="true"
												ondragstart={(event) => startDrag(event, { kind: 'mapel', id: mapel.id })}
												title="Tarik ke slot jadwal"
											>
												<Icon name="book" />
												{mapel.kode || mapel.nama}
												<span class="opacity-60">{jenjangLabels[mapel.jenjang]}</span>
											</button>
										{/each}
									</div>
								</div>
								<div>
									<div class="text-base-content/60 mb-1 text-[11px] font-semibold uppercase">
										Kokurikuler
									</div>
									<div class="flex flex-wrap gap-1.5">
										{#each dragKokurikulerList as kokurikuler (kokurikuler.id)}
											<button
												class="badge badge-secondary badge-outline cursor-grab gap-1 px-3 py-3 select-none active:cursor-grabbing"
												type="button"
												draggable="true"
												ondragstart={(event) =>
													startDrag(event, { kind: 'kokurikuler', id: kokurikuler.id })}
												title="Tarik ke slot jadwal"
											>
												<Icon name="book-open" />
												{kokurikuler.kode}
											</button>
										{/each}
									</div>
								</div>
							</div>
						</div>
					{/if}

					<div class="overflow-hidden">
						<table class="table-pin-rows table-xs table w-full table-fixed text-[10px]">
							<thead>
								<tr class="bg-primary text-primary-content">
									<th class="w-14">Hari</th>
									<th class="w-8 text-center">Ke</th>
									<th class="w-20">Jam</th>
									{#each data.masterKelasList as kelas (kelas.id)}
										<th class="px-1 text-center">
											<div>{kelas.nama}</div>
											<div class="text-primary-content/70 text-[9px] uppercase">
												{kelas.jenjang}
											</div>
										</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each hariOrder as hari (hari)}
									{#each jamByHari(hari) as jam, index (jam.id)}
										<tr class={hari === 'selasa' || hari === 'kamis' ? 'bg-success/5' : ''}>
											{#if index === 0}
												<th
													rowspan={jamByHari(hari).length}
													class="bg-base-200/70 text-center align-middle"
												>
													{data.hariLabels[hari]}
												</th>
											{/if}
											<td class="text-center font-semibold">{jam.jamKe}</td>
											<td class="text-[10px] leading-tight"
												>{jam.pukulMulai} - {jam.pukulSelesai}</td
											>
											{#each data.masterKelasList as kelas (kelas.id)}
												{@const slot = masterSlotFor(kelas.id, jam.id)}
												{@const compatibleSlot = isJamForKelas(jam, kelas)}
												<td class="p-0.5 align-top">
													{#if compatibleSlot}
														<button
															class={`block min-h-9 w-full rounded border px-1 py-0.5 text-center leading-tight transition hover:scale-[1.01] hover:shadow-sm ${slotCardClass(slot, jam)} ${dragHoverKey === slotKey(kelas.id, jam.id) ? 'ring-primary ring-2 ring-offset-1' : ''}`}
															style={slotStyle(slot)}
															type="button"
															onclick={() => openMasterEditor(kelas.id, jam.id)}
															ondragover={(event) => handleSlotDragOver(event, kelas.id, jam.id)}
															ondragleave={() => handleSlotDragLeave(kelas.id, jam.id)}
															ondrop={(event) => handleSlotDrop(event, kelas.id, jam.id, slot)}
															title={conflictTitle(slot) || `Isi/edit jadwal ${kelas.nama}`}
														>
															<div class="truncate text-[10px] font-bold">
																{shortSlotLabel(jam, slot)}
															</div>
															{#if guruName(slot)}
																<div class="text-base-content/60 mt-0.5 truncate text-[8px]">
																	{guruName(slot)}
																</div>
															{:else if !slot && jam.tipe === 'kosong'}
																<div class="text-base-content/40 mt-1 text-sm">+</div>
															{/if}
															{#if isSlotConflict(slot)}
																<div class="badge badge-error badge-xs mt-0.5 px-1 text-[9px]">
																	Bentrok {slotConflictDetails(slot).length}
																</div>
															{/if}
														</button>
													{:else}
														<div
															class="bg-base-200/60 text-base-content/40 flex min-h-9 items-center justify-center rounded border border-dashed text-[9px] uppercase"
														>
															{jenjangLabels[jam.jenjang]}
														</div>
													{/if}
												</td>
											{/each}
										</tr>
									{/each}
								{/each}
							</tbody>
						</table>
					</div>
				</div>

				<section class="no-print border-base-200 bg-base-100 rounded-lg border p-4 shadow-sm">
					<h3 class="font-semibold">Deteksi Bentrok Jadwal</h3>
					<p class="text-base-content/60 mb-3 text-xs">
						Guru dan mapel tidak boleh tabrakan pada jam yang sama.
					</p>

					{#if allConflictDetails.length > 0}
						<div class="alert alert-error mb-3 items-start p-3 text-xs">
							<Icon name="warning" />
							<div>
								<div class="font-semibold">{allConflictDetails.length} bentrok ditemukan</div>
								<div>Perbaiki salah satu kelas pada jam yang sama.</div>
							</div>
						</div>
						<div class="mb-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
							{#each allConflictDetails as conflict (conflict.key)}
								<div class="border-error/40 bg-error/5 rounded-lg border p-3">
									<div class="flex items-start justify-between gap-2">
										<div class="min-w-0">
											<div class="truncate text-sm font-semibold">{conflict.title}</div>
											<div class="text-base-content/60 text-xs">
												{data.hariLabels[conflict.hari]}, Jam {conflict.jamKe} ({conflict.pukul})
											</div>
										</div>
										<div class="badge badge-error badge-sm">{conflict.slots.length} kelas</div>
									</div>
									<div class="mt-2 space-y-1">
										{#each conflict.slots as item (`${conflict.key}:${item.kelasId}`)}
											<button
												class="btn btn-ghost btn-xs h-auto min-h-0 w-full justify-start px-2 py-1 text-left shadow-none"
												type="button"
												onclick={() => openMasterEditor(item.kelasId, conflict.jamId)}
											>
												<span class="font-semibold">{item.kelasNama}</span>
												<span class="text-base-content/60">- {item.label}</span>
											</button>
										{/each}
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<div class="alert alert-success mb-3 p-3 text-xs">
							<Icon name="check" />
							<span>Tidak ada bentrok guru/mapel pada filter ini.</span>
						</div>
					{/if}

					<h4 class="mb-2 text-sm font-semibold">Ringkasan Guru</h4>
					{#if guruPanelRows.length === 0}
						<div class="text-base-content/60 rounded-lg border border-dashed p-3 text-sm">
							Belum ada guru yang masuk ke jadwal pada filter ini.
						</div>
					{:else}
						<div class="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
							{#each guruPanelRows as guru (guru.id)}
								<div class="border-base-200 rounded-lg border p-2">
									<div class="flex items-start justify-between gap-2">
										<div class="min-w-0">
											<div class="truncate text-sm font-semibold">{guru.nama}</div>
											<div class="text-base-content/50 text-xs">{guru.total} slot</div>
										</div>
										{#if guru.conflicts > 0}
											<div class="badge badge-error badge-sm">{guru.conflicts}</div>
										{:else}
											<div class="badge badge-success badge-outline badge-sm">Aman</div>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</section>
			</div>
		{:else}
			<div class="screen-schedule space-y-4">
				{#if guruPanelRows.length === 0}
					<div class="alert alert-info">
						<Icon name="info" /><span>Belum ada guru yang masuk ke jadwal pada filter ini.</span>
					</div>
				{:else}
					{#each guruPanelRows as guru (guru.id)}
						<div class="border-base-200 bg-base-100 overflow-hidden rounded-lg border shadow-sm">
							<div class="border-base-200 flex items-center justify-between border-b px-4 py-3">
								<div>
									<h3 class="font-semibold">{guru.nama}</h3>
									<p class="text-base-content/60 text-xs">{guru.total} slot mengajar</p>
								</div>
								{#if guru.conflicts > 0}<div class="badge badge-error">
										{guru.conflicts} bentrok
									</div>{:else}<div class="badge badge-success badge-outline">Aman</div>{/if}
							</div>
							<div class="overflow-x-auto">
								<table class="table-sm table">
									<thead
										><tr
											><th>Hari</th><th>Jam</th><th>Kelas</th><th>Mapel/Kegiatan</th><th>Status</th
											></tr
										></thead
									>
									<tbody>
										{#each data.jadwalList.filter((slot) => slot.guruPegawaiId === guru.id) as slot (slot.id)}
											{@const jam =
												data.jamList.find((item) => item.id === slot.jamId) ??
												fallbackJam(slot.jamId)}
											{@const kelas = data.masterKelasList.find((item) => item.id === slot.kelasId)}
											<tr>
												<td>{data.hariLabels[jam.hari]}</td>
												<td
													>Jam {jam.jamKe}
													<div class="text-base-content/60 text-xs">
														{jam.pukulMulai} - {jam.pukulSelesai}
													</div></td
												>
												<td>{kelas?.nama ?? '-'}</td>
												<td
													><span
														class="inline-block rounded border px-2 py-1 text-xs font-semibold"
														style={slotStyle(slot)}>{shortSlotLabel(jam, slot)}</span
													></td
												>
												<td
													>{#if slotConflictDetails(slot).length}<span
															class="badge badge-error badge-sm">Bentrok</span
														>{:else}<span class="badge badge-success badge-outline badge-sm"
															>Aman</span
														>{/if}</td
												>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</div>
					{/each}
				{/if}
			</div>
		{/if}
	{/if}
</div>
{#if masterEditTarget && masterEditKelas && masterEditJam}
	<div class="modal modal-open no-print">
		<div class="modal-box max-w-xl rounded-lg">
			<div class="mb-4 flex items-start justify-between gap-3">
				<div>
					<h3 class="text-lg font-bold">Isi Jadwal Cepat</h3>
					<p class="text-base-content/60 text-sm">
						{masterEditKelas.nama} - {data.hariLabels[masterEditJam.hari]}, Jam {masterEditJam.jamKe}
						({masterEditJam.pukulMulai} - {masterEditJam.pukulSelesai})
					</p>
				</div>
				<button class="btn btn-circle btn-ghost btn-sm" type="button" onclick={closeMasterEditor}>
					<Icon name="close" />
				</button>
			</div>

			{#if conflictDetailFor(masterEditSlot)}
				{@const conflict = conflictDetailFor(masterEditSlot)}
				<div class="alert alert-error mb-3 items-start text-sm">
					<Icon name="warning" />
					<div>
						<div class="font-semibold">Guru ini bentrok pada jam yang sama.</div>
						<div>
							Terpakai di {conflict?.slots.map((item) => item.kelasNama).join(', ')}.
						</div>
					</div>
				</div>
			{/if}

			<form method="POST" action={actionWithFilter('saveSlot')} class="space-y-3">
				<input type="hidden" name="semesterId" value={data.activeSemesterId} />
				<input type="hidden" name="kelasId" value={masterEditTarget.kelasId} />
				<input type="hidden" name="jamId" value={masterEditTarget.jamId} />
				<div class="grid gap-3 md:grid-cols-2">
					<div class="form-control">
						<span class="label-text mb-1">Tipe Slot</span>
						<input type="hidden" name="tipe" value={activeMasterType()} />
						<div
							class="border-base-200 bg-base-200/30 flex flex-wrap gap-1.5 rounded-lg border p-2"
						>
							{#each Object.entries(typeLabels) as [key, label] (key)}
								<button
									class:badge-primary={activeMasterType() === key}
									class:badge-outline={activeMasterType() !== key}
									class="badge cursor-pointer px-3 py-3"
									type="button"
									onclick={() => setMasterDraftType(key as SlotType)}
								>
									{label}
								</button>
							{/each}
						</div>
					</div>
					<label class="form-control">
						<span class="label-text mb-1">Guru</span>
						<select
							class="select select-bordered"
							name="guruPegawaiId"
							value={masterDraft.guruPegawaiId ?? masterEditSlot?.guruPegawaiId ?? ''}
						>
							<option value="">Pilih guru</option>
							{#each data.guruList as guru (guru.id)}
								<option value={guru.id}>{guru.nama}</option>
							{/each}
						</select>
					</label>
				</div>
				<label class="form-control">
					<span class="label-text mb-1">Mata Pelajaran</span>
					<select
						class="select select-bordered"
						name="jadwalMapelId"
						value={masterDraft.jadwalMapelId ?? masterEditSlot?.jadwalMapelId ?? ''}
					>
						<option value="">Pilih mata pelajaran</option>
						{#each masterEditMapelList as mapel (mapel.id)}
							<option value={mapel.id}>{mapel.kode || mapel.nama}</option>
						{/each}
					</select>
				</label>
				<div class="grid gap-3 md:grid-cols-2">
					<label class="form-control">
						<span class="label-text mb-1">Kegiatan</span>
						<select
							class="select select-bordered"
							name="kegiatanId"
							value={masterDraft.kegiatanId ?? masterEditSlot?.kegiatanId ?? ''}
						>
							<option value="">Pilih kegiatan</option>
							{#each data.kegiatanList as kegiatan (kegiatan.id)}
								<option value={kegiatan.id}>{kegiatan.nama}</option>
							{/each}
						</select>
					</label>
					<label class="form-control">
						<span class="label-text mb-1">Kokurikuler</span>
						<select
							class="select select-bordered"
							name="kokurikulerId"
							value={masterDraft.kokurikulerId ?? masterEditSlot?.kokurikulerId ?? ''}
						>
							<option value="">Pilih kokurikuler</option>
							{#each masterEditKokurikulerList as kokurikuler (kokurikuler.id)}
								<option value={kokurikuler.id}>{kokurikuler.kode}</option>
							{/each}
						</select>
					</label>
				</div>
				<label class="form-control">
					<span class="label-text mb-1">Catatan</span>
					<input
						class="input input-bordered"
						name="catatan"
						value={masterEditSlot?.catatan ?? ''}
						placeholder="Catatan singkat"
					/>
				</label>
				<div class="modal-action flex-wrap gap-2">
					<button class="btn btn-ghost shadow-none" type="button" onclick={closeMasterEditor}
						>Batal</button
					>
					<button class="btn btn-primary shadow-none" type="submit">
						<Icon name="save" />
						Simpan Slot
					</button>
				</div>
			</form>
			{#if masterEditSlot}
				<form method="POST" action={actionWithFilter('clearSlot')} class="mt-3 flex justify-end">
					<input type="hidden" name="kelasId" value={masterEditTarget.kelasId} />
					<input type="hidden" name="jamId" value={masterEditTarget.jamId} />
					<button class="btn btn-error btn-outline btn-sm shadow-none" type="submit">
						<Icon name="del" />
						Kosongkan Slot
					</button>
				</form>
			{/if}
		</div>
		<button class="modal-backdrop" type="button" onclick={closeMasterEditor}>Tutup</button>
	</div>
{/if}
