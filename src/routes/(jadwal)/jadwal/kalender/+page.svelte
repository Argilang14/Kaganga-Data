<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/icon.svelte';

	type KalenderJenis =
		| 'hari_efektif'
		| 'libur_nasional'
		| 'libur_sekolah'
		| 'ujian'
		| 'asesmen'
		| 'pembagian_rapor'
		| 'kegiatan_sekolah'
		| 'kegiatan_asrama'
		| 'lainnya';
	type Jenjang = 'semua' | 'srd' | 'srmp' | 'srma' | 'sd' | 'smp' | 'sma';
	type TahunAjaran = { id: number; nama: string; isAktif: boolean };
	type Semester = { id: number; nama: string; tipe: 'ganjil' | 'genap'; isAktif: boolean };
	type Kelas = { id: number; nama: string; fase?: string | null };
	type KalenderItem = {
		id: number;
		tahunAjaranId: number | null;
		semesterId: number | null;
		kelasId: number | null;
		tanggalMulai: string;
		tanggalSelesai: string;
		judul: string;
		jenis: KalenderJenis;
		jenjang: Jenjang;
		warna: string | null;
		keterangan: string | null;
		tahunAjaran?: { id: number; nama: string } | null;
		semester?: { id: number; nama: string; tipe: 'ganjil' | 'genap' } | null;
		kelas?: Kelas | null;
	};
	type PageForm = { message?: string; fail?: string } | null;
	type PageData = {
		sekolahNama: string;
		canEdit: boolean;
		selectedTahunAjaranId: number | null;
		selectedSemesterId: number | null;
		selectedKelasId: number | null;
		selectedJenis: KalenderJenis | null;
		selectedJenjang: Jenjang | null;
		jenisOptions: KalenderJenis[];
		jenjangOptions: Jenjang[];
		kalenderList: KalenderItem[];
		tahunAjaranList: TahunAjaran[];
		semesterList: Semester[];
		kelasList: Kelas[];
	};

	let { data, form }: { data: PageData; form: PageForm } = $props();

	const jenisLabels: Record<KalenderJenis, string> = {
		hari_efektif: 'Hari Efektif',
		libur_nasional: 'Libur Nasional',
		libur_sekolah: 'Libur Sekolah',
		ujian: 'Ujian',
		asesmen: 'Asesmen',
		pembagian_rapor: 'Pembagian Rapor',
		kegiatan_sekolah: 'Kegiatan Sekolah',
		kegiatan_asrama: 'Kegiatan Asrama',
		lainnya: 'Lainnya'
	};
	const jenjangLabels: Record<Jenjang, string> = {
		semua: 'Semua Jenjang',
		srd: 'SRD',
		srmp: 'SRMP',
		srma: 'SRMA',
		sd: 'SRD',
		smp: 'SRMP',
		sma: 'SRMA'
	};
	const jenisTone: Record<KalenderJenis, string> = {
		hari_efektif: 'badge-success',
		libur_nasional: 'badge-error',
		libur_sekolah: 'badge-warning',
		ujian: 'badge-primary',
		asesmen: 'badge-info',
		pembagian_rapor: 'badge-secondary',
		kegiatan_sekolah: 'badge-accent',
		kegiatan_asrama: 'badge-neutral',
		lainnya: 'badge-ghost'
	};

	const totalAgenda = $derived(data.kalenderList.length);
	const totalLibur = $derived(
		data.kalenderList.filter(
			(item) => item.jenis === 'libur_nasional' || item.jenis === 'libur_sekolah'
		).length
	);
	const totalAkademik = $derived(
		data.kalenderList.filter((item) => ['ujian', 'asesmen', 'pembagian_rapor'].includes(item.jenis))
			.length
	);
	const selectedTahunAjaran = $derived(
		data.tahunAjaranList.find((item) => item.id === data.selectedTahunAjaranId) ?? null
	);
	const selectedSemester = $derived(
		data.semesterList.find((item) => item.id === data.selectedSemesterId) ?? null
	);
	const previewSemesterTipe = $derived(resolveSemesterTipe(selectedSemester));
	const previewPeriodeLabel = $derived.by(() =>
		selectedSemester
			? `Semester ${previewSemesterTipe === 'ganjil' ? 'Ganjil' : 'Genap'} Tahun Ajaran ${selectedTahunAjaran?.nama ?? '-'}`
			: `Tahun Ajaran ${selectedTahunAjaran?.nama ?? '-'}`
	);
	const previewMonths = $derived.by(() => buildAcademicYearMonths(selectedTahunAjaran?.nama));
	const previewHariEfektif = $derived.by(() => countHariEfektif(previewMonths));
	const previewMingguEfektif = $derived(Math.ceil(previewHariEfektif / 5));
	const dayLabels = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
	const monthLabels = [
		'Januari',
		'Februari',
		'Maret',
		'April',
		'Mei',
		'Juni',
		'Juli',
		'Agustus',
		'September',
		'Oktober',
		'November',
		'Desember'
	];

	let agendaDialog = $state<HTMLDialogElement | null>(null);
	let quickAgendaDialog = $state<HTMLDialogElement | null>(null);
	let importDialog = $state<HTMLDialogElement | null>(null);
	let selectedDate = $state('');
	let selectedAgendaIds = $state<number[]>([]);
	const selectedDateAgendas = $derived.by(() => (selectedDate ? agendaForDate(selectedDate) : []));
	const visibleAgendaIds = $derived(data.kalenderList.map((item) => item.id));
	const selectedAgendaCount = $derived(
		selectedAgendaIds.filter((id) => visibleAgendaIds.includes(id)).length
	);
	const allAgendaSelected = $derived(
		visibleAgendaIds.length > 0 && selectedAgendaCount === visibleAgendaIds.length
	);

	function queryHref(
		path: '/api/jadwal/kalender/template' | '/api/jadwal/kalender/export',
		values: Record<string, string | number | null | undefined>
	) {
		const query = new URLSearchParams();
		for (const [key, value] of Object.entries(values)) {
			if (value === null || value === undefined || value === '') continue;
			query.set(key, String(value));
		}
		const search = query.toString();
		return `${resolve(path)}${search ? `?${search}` : ''}`;
	}

	function kalenderTemplateHref() {
		return queryHref('/api/jadwal/kalender/template', {
			tahun_ajaran_id: data.selectedTahunAjaranId,
			semester_id: data.selectedSemesterId,
			periode_mode: 'tahun_kalender'
		});
	}

	function kalenderExportHref() {
		return queryHref('/api/jadwal/kalender/export', {
			tahun_ajaran_id: data.selectedTahunAjaranId,
			semester_id: data.selectedSemesterId,
			periode_mode: 'tahun_kalender',
			kelas_id: data.selectedKelasId,
			jenis: data.selectedJenis,
			jenjang: data.selectedJenjang
		});
	}

	function openQuickAgendaDialog() {
		selectedDate = '';
		quickAgendaDialog?.showModal();
	}

	function formatTanggal(value: string) {
		return new Date(`${value}T00:00:00`).toLocaleDateString('id-ID', {
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		});
	}

	function formatRentang(item: KalenderItem) {
		if (item.tanggalMulai === item.tanggalSelesai) return formatTanggal(item.tanggalMulai);
		return `${formatTanggal(item.tanggalMulai)} - ${formatTanggal(item.tanggalSelesai)}`;
	}

	function resolveSemesterTipe(semester: Semester | null): 'ganjil' | 'genap' {
		if (semester?.tipe === 'genap') return 'genap';
		if (semester?.tipe === 'ganjil') return 'ganjil';
		const name = semester?.nama?.toLowerCase() ?? '';
		return name.includes('genap') ? 'genap' : 'ganjil';
	}

	function academicYears(tahunAjaranNama?: string | null) {
		const match = tahunAjaranNama?.match(/(\d{4})\s*[/-]\s*(\d{4})/);
		if (match) return { start: Number(match[1]), end: Number(match[2]) };
		const current = new Date().getFullYear();
		return { start: current, end: current + 1 };
	}

	function buildMonthItems(monthItems: Array<{ year: number; month: number }>) {
		return monthItems.map(({ year, month }) => ({
			year,
			month,
			label: `${monthLabels[month]} ${year}`,
			weeks: calendarWeeks(year, month),
			agendas: agendaForMonth(year, month)
		}));
	}

	function buildAcademicYearMonths(tahunAjaranNama?: string | null) {
		const years = academicYears(tahunAjaranNama);
		return buildMonthItems([
			...Array.from({ length: 6 }, (_, index) => ({ year: years.start, month: index + 6 })),
			...Array.from({ length: 6 }, (_, index) => ({ year: years.end, month: index }))
		]);
	}

	function calendarWeeks(year: number, month: number) {
		const totalDays = new Date(year, month + 1, 0).getDate();
		const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
		const cells: Array<number | null> = [];
		for (let i = 0; i < firstDay; i += 1) cells.push(null);
		for (let day = 1; day <= totalDays; day += 1) cells.push(day);
		while (cells.length % 7 !== 0) cells.push(null);
		const weeks: Array<Array<number | null>> = [];
		for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
		return weeks;
	}

	function dateValue(value: string) {
		return new Date(`${value}T00:00:00`).getTime();
	}

	function agendaForMonth(year: number, month: number) {
		const start = new Date(year, month, 1).getTime();
		const end = new Date(year, month + 1, 0).getTime();
		return data.kalenderList.filter(
			(item) => dateValue(item.tanggalMulai) <= end && dateValue(item.tanggalSelesai) >= start
		);
	}

	function formatDateInput(year: number, month: number, day: number) {
		return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
	}

	function agendaForDate(value: string) {
		return data.kalenderList.filter(
			(item) => item.tanggalMulai <= value && item.tanggalSelesai >= value
		);
	}

	function isLiburAgenda(agenda: KalenderItem) {
		return agenda.jenis === 'libur_nasional' || agenda.jenis === 'libur_sekolah';
	}

	function agendaColor(agenda: KalenderItem) {
		if (isLiburAgenda(agenda)) return '#dc2626';
		return agenda.warna || '#2563eb';
	}

	function agendaCellStyle(agendas: KalenderItem[]) {
		const ordered = orderedDayAgendas(agendas);
		const primaryAgenda = ordered[0];
		if (!primaryAgenda) return '';
		if (isLiburAgenda(primaryAgenda)) return 'background:#fee2e2; color:#991b1b;';
		return `background:${agendaColor(primaryAgenda)}22; color:#1e293b;`;
	}

	function orderedDayAgendas(agendas: KalenderItem[]) {
		return [...agendas].sort((a, b) => {
			if (isLiburAgenda(a) && !isLiburAgenda(b)) return -1;
			if (!isLiburAgenda(a) && isLiburAgenda(b)) return 1;
			return a.tanggalMulai.localeCompare(b.tanggalMulai) || a.judul.localeCompare(b.judul);
		});
	}

	function calendarDayStyle(agendas: KalenderItem[], dayIndex: number) {
		if (agendas.some(isLiburAgenda)) return 'background:#fee2e2; color:#991b1b;';
		if (dayIndex === 6) return 'background:#fee2e2; color:#991b1b;';
		if (dayIndex === 5) return '';
		if (agendas.length > 0) return agendaCellStyle(agendas);
		return '';
	}

	function openAgendaDialog(year: number, month: number, day: number) {
		if (!data.canEdit) return;
		selectedDate = formatDateInput(year, month, day);
		agendaDialog?.showModal();
	}

	function agendaTanggalDalamBulan(item: KalenderItem, year: number, month: number) {
		const monthStart = new Date(year, month, 1).getTime();
		const monthEnd = new Date(year, month + 1, 0).getTime();
		const start = new Date(Math.max(dateValue(item.tanggalMulai), monthStart));
		const end = new Date(Math.min(dateValue(item.tanggalSelesai), monthEnd));
		const startDay = start.getDate();
		const endDay = end.getDate();
		return startDay === endDay ? `${startDay}` : `${startDay}-${endDay}`;
	}

	function isLiburDate(date: Date) {
		const value = date.toISOString().slice(0, 10);
		return data.kalenderList.some(
			(item) =>
				(item.jenis === 'libur_nasional' || item.jenis === 'libur_sekolah') &&
				item.tanggalMulai <= value &&
				item.tanggalSelesai >= value
		);
	}

	function countHariEfektif(months: ReturnType<typeof buildAcademicYearMonths>) {
		let total = 0;
		for (const item of months) {
			const days = new Date(item.year, item.month + 1, 0).getDate();
			for (let day = 1; day <= days; day += 1) {
				const date = new Date(item.year, item.month, day);
				const weekDay = date.getDay();
				if (weekDay === 0 || weekDay === 6 || isLiburDate(date)) continue;
				total += 1;
			}
		}
		return total;
	}

	function toggleAgendaSelection(id: number, checked: boolean) {
		selectedAgendaIds = checked
			? Array.from(new Set([...selectedAgendaIds, id]))
			: selectedAgendaIds.filter((selectedId) => selectedId !== id);
	}

	function toggleAllAgendaSelection(checked: boolean) {
		selectedAgendaIds = checked ? visibleAgendaIds : [];
	}

	function printPage() {
		window.print();
	}
</script>

<svelte:head>
	<style>
		@media print {
			:global(body) {
				background: white !important;
			}
			:global(.no-print),
			:global(nav),
			:global(aside) {
				display: none !important;
			}
			.print-area {
				padding: 0 !important;
			}
			.print-card {
				box-shadow: none !important;
				border: 1px solid #111 !important;
			}
			.kaldik-preview {
				break-inside: avoid;
				page-break-inside: avoid;
			}
		}
	</style>
</svelte:head>

<div class="print-area space-y-4">
	<div class="no-print flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<h2 class="text-2xl font-bold">Kalender Pendidikan</h2>
			<p class="text-base-content/70 text-sm">
				Kelola hari efektif, libur, ujian, asesmen, pembagian rapor, dan kegiatan sekolah/asrama.
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			{#if data.canEdit}
				<button
					class="btn btn-primary btn-sm shadow-none"
					type="button"
					onclick={openQuickAgendaDialog}
				>
					<Icon name="plus" />
					Tambah Agenda
				</button>
				<div class="dropdown dropdown-end">
					<button type="button" tabindex="0" class="btn btn-soft btn-sm shadow-none">
						<Icon name="down" />
						Data Excel
					</button>
					<ul
						tabindex="-1"
						class="dropdown-content menu bg-base-100 rounded-box border-base-300 z-20 mt-2 w-56 border p-2 shadow-xl"
					>
						<li>
							<button type="button" onclick={() => (window.location.href = kalenderTemplateHref())}>
								<Icon name="download" />
								Template Data
							</button>
						</li>
						<li>
							<button type="button" onclick={() => importDialog?.showModal()}>
								<Icon name="import" />
								Import Excel
							</button>
						</li>
						<li>
							<button type="button" onclick={() => (window.location.href = kalenderExportHref())}>
								<Icon name="export" />
								Export Data
							</button>
						</li>
					</ul>
				</div>
			{/if}
			<a class="btn btn-soft btn-sm shadow-none" href={resolve('/jadwal/pengaturan')}>
				<Icon name="gear" />
				Pengaturan Jadwal
			</a>
			<button class="btn btn-primary btn-sm shadow-none" type="button" onclick={printPage}>
				<Icon name="print" />
				Cetak
			</button>
		</div>
	</div>

	<form
		class="no-print rounded-box border-base-300 bg-base-100 grid gap-3 border p-4 lg:grid-cols-6"
		method="GET"
		action={resolve('/jadwal/kalender')}
	>
		<label class="form-control gap-1">
			<span class="label-text font-medium">Tahun Ajaran</span>
			<select class="select select-bordered w-full" name="tahun_ajaran_id">
				<option value="">Aktif</option>
				{#each data.tahunAjaranList as tahunAjaran (tahunAjaran.id)}
					<option value={tahunAjaran.id} selected={tahunAjaran.id === data.selectedTahunAjaranId}>
						{tahunAjaran.nama}{tahunAjaran.isAktif ? ' (Aktif)' : ''}
					</option>
				{/each}
			</select>
		</label>
		<label class="form-control gap-1">
			<span class="label-text font-medium">Semester</span>
			<select class="select select-bordered w-full" name="semester_id">
				<option value="">Semua semester</option>
				{#each data.semesterList as semester (semester.id)}
					<option value={semester.id} selected={semester.id === data.selectedSemesterId}>
						{semester.nama}{semester.isAktif ? ' (Aktif)' : ''}
					</option>
				{/each}
			</select>
		</label>
		<label class="form-control gap-1">
			<span class="label-text font-medium">Kelas</span>
			<select class="select select-bordered w-full" name="kelas_id">
				<option value="">Semua kelas</option>
				{#each data.kelasList as kelas (kelas.id)}
					<option value={kelas.id} selected={kelas.id === data.selectedKelasId}>
						{kelas.nama}{kelas.fase ? ` - Fase ${kelas.fase}` : ''}
					</option>
				{/each}
			</select>
		</label>
		<label class="form-control gap-1">
			<span class="label-text font-medium">Jenis</span>
			<select class="select select-bordered w-full" name="jenis">
				<option value="">Semua jenis</option>
				{#each data.jenisOptions as jenis (jenis)}
					<option value={jenis} selected={jenis === data.selectedJenis}>{jenisLabels[jenis]}</option
					>
				{/each}
			</select>
		</label>
		<label class="form-control gap-1">
			<span class="label-text font-medium">Jenjang</span>
			<select class="select select-bordered w-full" name="jenjang">
				<option value="">Semua jenjang</option>
				{#each data.jenjangOptions as jenjang (jenjang)}
					<option value={jenjang} selected={jenjang === data.selectedJenjang}
						>{jenjangLabels[jenjang]}</option
					>
				{/each}
			</select>
		</label>
		<div class="flex items-end gap-2">
			<button class="btn btn-primary flex-1 shadow-none" type="submit">Terapkan</button>
			<a class="btn btn-ghost flex-1 shadow-none" href={resolve('/jadwal/kalender')}>Reset</a>
		</div>
	</form>

	{#if form?.message}
		<div class="alert alert-success no-print items-start">
			<Icon name="success" />
			<span>{form.message}</span>
		</div>
	{:else if form?.fail}
		<div class="alert alert-error no-print items-start">
			<Icon name="error" />
			<span>{form.fail}</span>
		</div>
	{/if}

	<section class="no-print grid gap-3 lg:grid-cols-[1.2fr_1fr]">
		<div class="rounded-box border-base-300 bg-base-100 border p-4 shadow-sm">
			<div class="flex items-start gap-3">
				<div class="bg-primary/10 text-primary rounded-box p-2"><Icon name="database" /></div>
				<div>
					<h3 class="font-semibold">Desain Data Kaldik yang Dipakai</h3>
					<p class="text-base-content/70 mt-1 text-sm">
						Setiap agenda disimpan berdasarkan tahun ajaran, semester, rentang tanggal, jenis,
						jenjang SRT, kelas opsional, warna, dan keterangan. Struktur ini aman untuk preview
						kalender 12 bulan dan tersambung ke Cetak Dokumen SR.
					</p>
				</div>
			</div>
		</div>
		<div class="rounded-box border-base-300 bg-base-100 border p-4 shadow-sm">
			<div class="mb-2 text-sm font-semibold">Kode Jenjang</div>
			<div class="flex flex-wrap gap-2">
				<span class="badge badge-primary badge-outline">semua</span>
				<span class="badge badge-primary badge-outline">srd</span>
				<span class="badge badge-primary badge-outline">srmp</span>
				<span class="badge badge-primary badge-outline">srma</span>
			</div>
			<p class="text-base-content/60 mt-2 text-xs">
				Data lama SD/SMP/SMA tetap terbaca, tetapi input baru memakai SRD/SRMP/SRMA.
			</p>
		</div>
	</section>

	{#if data.canEdit}
		<dialog class="modal" bind:this={importDialog}>
			<div class="modal-box max-w-2xl">
				<form method="dialog">
					<button class="btn btn-sm btn-circle btn-ghost absolute top-3 right-3">x</button>
				</form>
				<h3 class="text-lg font-bold">Import Kalender Pendidikan</h3>
				<p class="text-base-content/70 mt-1 text-sm">
					Upload file Excel kalender. Data import mengikuti tahun ajaran yang dipilih; semester
					boleh dikosongkan untuk kalender 12 bulan.
				</p>
				<form
					class="mt-5 grid gap-4 md:grid-cols-2"
					method="POST"
					action="?/importKalender"
					enctype="multipart/form-data"
				>
					<input type="hidden" name="tahunAjaranId" value={data.selectedTahunAjaranId ?? ''} />
					<input type="hidden" name="semesterId" value={data.selectedSemesterId ?? ''} />
					<label class="form-control gap-1 md:col-span-2">
						<span class="label-text font-medium">File Excel Kalender</span>
						<input
							class="file-input file-input-bordered w-full"
							type="file"
							name="file"
							accept=".xlsx,.xls"
							required
						/>
					</label>
					{#if !data.selectedTahunAjaranId}
						<p class="text-warning text-sm md:col-span-2">
							Pilih tahun ajaran dulu sebelum import.
						</p>
					{/if}
					<div class="modal-action md:col-span-2">
						<button
							class="btn btn-ghost shadow-none"
							type="button"
							onclick={() => importDialog?.close()}
						>
							Batal
						</button>
						<button
							class="btn btn-primary shadow-none"
							type="submit"
							disabled={!data.selectedTahunAjaranId}
						>
							<Icon name="import" />
							Import Excel
						</button>
					</div>
				</form>
			</div>
			<form method="dialog" class="modal-backdrop"><button>Tutup</button></form>
		</dialog>

		<dialog class="modal" bind:this={quickAgendaDialog}>
			<div class="modal-box max-w-4xl">
				<form method="dialog">
					<button class="btn btn-sm btn-circle btn-ghost absolute top-3 right-3">x</button>
				</form>
				<h3 class="text-lg font-bold">Tambah Agenda Kalender</h3>
				<p class="text-base-content/70 mt-1 text-sm">
					Isi satu agenda per rentang tanggal. Untuk agenda semua murid, biarkan kelas opsional
					kosong.
				</p>
				<form class="mt-5 grid gap-4 md:grid-cols-2" method="POST" action="?/saveAgenda">
					<input type="hidden" name="tahunAjaranId" value={data.selectedTahunAjaranId ?? ''} />
					<input type="hidden" name="semesterId" value={data.selectedSemesterId ?? ''} />
					<label class="form-control gap-1 md:col-span-2">
						<span class="label-text font-medium">Judul</span>
						<input
							class="input input-bordered"
							name="judul"
							placeholder="Contoh: Penilaian Akhir Semester"
							required
						/>
					</label>
					<label class="form-control gap-1">
						<span class="label-text font-medium">Mulai</span>
						<input class="input input-bordered" type="date" name="tanggalMulai" required />
					</label>
					<label class="form-control gap-1">
						<span class="label-text font-medium">Selesai</span>
						<input class="input input-bordered" type="date" name="tanggalSelesai" required />
					</label>
					<label class="form-control gap-1">
						<span class="label-text font-medium">Jenis</span>
						<select class="select select-bordered" name="jenis" required>
							{#each data.jenisOptions as jenis (jenis)}
								<option value={jenis} selected={jenis === (data.selectedJenis ?? 'hari_efektif')}
									>{jenisLabels[jenis]}</option
								>
							{/each}
						</select>
					</label>
					<label class="form-control gap-1">
						<span class="label-text font-medium">Jenjang</span>
						<select class="select select-bordered" name="jenjang">
							{#each data.jenjangOptions as jenjang (jenjang)}
								<option value={jenjang} selected={jenjang === (data.selectedJenjang ?? 'semua')}
									>{jenjangLabels[jenjang]}</option
								>
							{/each}
						</select>
					</label>
					<label class="form-control gap-1">
						<span class="label-text font-medium">Kelas Opsional</span>
						<select class="select select-bordered" name="kelasId">
							<option value="" selected={!data.selectedKelasId}>Berlaku umum</option>
							{#each data.kelasList as kelas (kelas.id)}
								<option value={kelas.id} selected={kelas.id === data.selectedKelasId}
									>{kelas.nama}{kelas.fase ? ` - Fase ${kelas.fase}` : ''}</option
								>
							{/each}
						</select>
					</label>
					<label class="form-control gap-1">
						<span class="label-text font-medium">Warna</span>
						<input class="input input-bordered" type="color" name="warna" value="#2563eb" />
					</label>
					<label class="form-control gap-1 md:col-span-2">
						<span class="label-text font-medium">Keterangan</span>
						<input class="input input-bordered" name="keterangan" placeholder="Catatan singkat" />
					</label>
					<div class="modal-action md:col-span-2">
						<button
							class="btn btn-ghost shadow-none"
							type="button"
							onclick={() => quickAgendaDialog?.close()}
						>
							Batal
						</button>
						<button class="btn btn-primary shadow-none" type="submit">
							<Icon name="save" />
							Simpan Agenda
						</button>
					</div>
				</form>
			</div>
			<form method="dialog" class="modal-backdrop"><button>Tutup</button></form>
		</dialog>
	{/if}

	<section
		class="kaldik-preview print-card rounded-box border-base-300 bg-base-100 border p-4 shadow-sm"
	>
		<div class="mb-4 text-center">
			<h3 class="text-2xl font-bold">Kalender Pendidikan</h3>
			<p class="text-base font-semibold tracking-wide uppercase">{data.sekolahNama}</p>
			<p class="text-base-content/70 text-base">{previewPeriodeLabel}</p>
			{#if data.canEdit}
				<p class="no-print text-base-content/60 mt-1 text-xs">
					Klik tanggal pada kalender untuk menambah agenda langsung di tanggal tersebut.
				</p>
			{/if}
		</div>

		<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
			{#each previewMonths as month (month.label)}
				<div class="border-base-300 rounded-lg border p-3">
					<h4 class="mb-2 text-center text-sm font-bold uppercase">{month.label}</h4>
					<table class="w-full table-fixed border-collapse text-center text-[11px]">
						<thead>
							<tr>
								{#each dayLabels as day, index (`${day}-${index}`)}
									<th
										class={`border-base-300 border py-1 font-semibold ${index === 6 ? 'bg-error/15 text-error' : 'bg-base-200'}`}
									>
										{day}
									</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each month.weeks as week, weekIndex (weekIndex)}
								<tr>
									{#each week as day, dayIndex (dayIndex)}
										{@const cellDate = day ? formatDateInput(month.year, month.month, day) : ''}
										{@const dayAgendas = day ? agendaForDate(cellDate) : []}
										<td class="border-base-300 h-11 border p-0 align-top">
											{#if day}
												<button
													class={`group relative flex h-11 w-full flex-col items-center justify-center gap-1 rounded-none px-0.5 font-semibold transition disabled:cursor-default ${data.canEdit ? 'cursor-pointer hover:brightness-95' : ''}`}
													style={calendarDayStyle(dayAgendas, dayIndex)}
													type="button"
													disabled={!data.canEdit}
													title={`${formatTanggal(cellDate)}${dayAgendas.length ? ` - ${dayAgendas.length} agenda` : ''}`}
													onclick={() => openAgendaDialog(month.year, month.month, day)}
												>
													<span>{day}</span>
													{#if dayAgendas.length > 0}
														<div
															class="flex max-w-full items-center justify-center gap-0.5 overflow-hidden"
														>
															{#each orderedDayAgendas(dayAgendas).slice(0, 4) as agenda (agenda.id)}
																<span
																	class="border-base-100 inline-block h-1.5 w-1.5 shrink-0 rounded-full border"
																	style={`background:${agendaColor(agenda)}`}
																	title={agenda.judul}
																></span>
															{/each}
															{#if dayAgendas.length > 4}
																<span class="text-[8px] leading-none">+{dayAgendas.length - 4}</span
																>
															{/if}
														</div>
													{/if}
												</button>
											{/if}
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>

					<div class="mt-3 min-h-24 space-y-1 text-xs">
						{#each month.agendas as agenda (agenda.id)}
							<div class="grid grid-cols-[48px_1fr] gap-2 leading-tight">
								<div class="font-semibold">
									{agendaTanggalDalamBulan(agenda, month.year, month.month)}
								</div>
								<div>
									<span
										class="mr-1 inline-block h-2.5 w-2.5 rounded-full"
										style={`background:${agendaColor(agenda)}`}
									></span>
									{agenda.judul}
								</div>
							</div>
						{:else}
							<p class="text-base-content/50 text-center">Belum ada agenda.</p>
						{/each}
					</div>
				</div>
			{/each}
		</div>

		<div class="mt-4 grid gap-3 text-sm sm:grid-cols-2">
			<div class="border-base-300 rounded-lg border p-3">
				<span class="font-semibold">Hari Pembelajaran Efektif</span> = {previewHariEfektif} Hari
			</div>
			<div class="border-base-300 rounded-lg border p-3">
				<span class="font-semibold">Minggu Efektif</span> = {previewMingguEfektif} Minggu
			</div>
		</div>
	</section>

	<section class="print-card rounded-box border-base-300 bg-base-100 border p-4 shadow-sm">
		<div class="mb-4 text-center">
			<h3 class="text-2xl font-bold">Kalender Pendidikan</h3>
			<p class="text-base font-semibold tracking-wide uppercase">{data.sekolahNama}</p>
			<p class="text-base-content/70 text-sm">Daftar agenda berdasarkan filter yang dipilih</p>
		</div>

		<div class="no-print mb-4 grid gap-3 sm:grid-cols-3">
			<div class="rounded-box bg-base-200 p-3">
				<p class="text-base-content/60 text-xs font-semibold uppercase">Total Agenda</p>
				<p class="text-2xl font-bold">{totalAgenda}</p>
			</div>
			<div class="rounded-box bg-base-200 p-3">
				<p class="text-base-content/60 text-xs font-semibold uppercase">Agenda Libur</p>
				<p class="text-2xl font-bold">{totalLibur}</p>
			</div>
			<div class="rounded-box bg-base-200 p-3">
				<p class="text-base-content/60 text-xs font-semibold uppercase">Agenda Akademik</p>
				<p class="text-2xl font-bold">{totalAkademik}</p>
			</div>
		</div>

		{#if data.kalenderList.length === 0}
			<div class="alert alert-info items-start">
				<Icon name="info" />
				<div>
					<div class="font-semibold">Belum ada agenda kalender.</div>
					<p class="text-sm">Tambahkan agenda baru atau ubah filter yang sedang digunakan.</p>
				</div>
			</div>
		{:else}
			<div class="no-print mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<form id="bulk-delete-agenda-form" method="POST" action="?/deleteSelectedAgenda"></form>
				<p class="text-base-content/60 text-sm">
					{selectedAgendaCount > 0
						? `${selectedAgendaCount} agenda dipilih`
						: 'Pilih agenda dengan checkbox untuk hapus massal.'}
				</p>
				{#if data.canEdit}
					<button
						class="btn btn-error btn-sm shadow-none"
						type="submit"
						form="bulk-delete-agenda-form"
						disabled={selectedAgendaCount === 0}
					>
						<Icon name="del" />
						Hapus Terpilih
					</button>
				{/if}
			</div>
			<div class="rounded-box border-base-300 overflow-x-auto border">
				<table class="table-sm table">
					<thead class="bg-base-200">
						<tr>
							<th class="no-print w-10">
								{#if data.canEdit}
									<input
										class="checkbox checkbox-sm"
										type="checkbox"
										checked={allAgendaSelected}
										onchange={(event) =>
											toggleAllAgendaSelection((event.currentTarget as HTMLInputElement).checked)}
										title="Pilih semua agenda"
									/>
								{/if}
							</th>
							<th class="w-4">Warna</th>
							<th>Tanggal</th>
							<th>Agenda</th>
							<th>Jenis</th>
							<th>Jenjang/Kelas</th>
							<th class="no-print">Aksi</th>
						</tr>
					</thead>
					<tbody>
						{#each data.kalenderList as item (item.id)}
							<tr>
								<td class="no-print">
									{#if data.canEdit}
										<input
											class="checkbox checkbox-sm"
											type="checkbox"
											name="ids"
											value={item.id}
											form="bulk-delete-agenda-form"
											checked={selectedAgendaIds.includes(item.id)}
											onchange={(event) =>
												toggleAgendaSelection(
													item.id,
													(event.currentTarget as HTMLInputElement).checked
												)}
										/>
									{/if}
								</td>
								<td>
									<span
										class="border-base-300 inline-block h-3 w-3 rounded-full border"
										style={`background:${agendaColor(item)}`}
									></span>
								</td>
								<td class="font-semibold whitespace-nowrap">{formatRentang(item)}</td>
								<td>
									<div class="font-semibold">{item.judul}</div>
									{#if item.keterangan}
										<div class="text-base-content/60 text-xs">{item.keterangan}</div>
									{/if}
								</td>
								<td
									><span class={`badge ${jenisTone[item.jenis]}`}>{jenisLabels[item.jenis]}</span
									></td
								>
								<td>
									<div>{jenjangLabels[item.jenjang]}</div>
									<div class="text-base-content/60 text-xs">{item.kelas?.nama ?? 'Umum'}</div>
								</td>
								<td class="no-print min-w-48">
									{#if data.canEdit}
										<details class="collapse-arrow bg-base-200 collapse">
											<summary class="collapse-title min-h-0 px-3 py-2 text-sm font-semibold"
												>Edit</summary
											>
											<div class="collapse-content px-3 pb-3">
												<form class="grid gap-2" method="POST" action="?/saveAgenda">
													<input type="hidden" name="id" value={item.id} />
													<input
														type="hidden"
														name="tahunAjaranId"
														value={item.tahunAjaranId ?? ''}
													/>
													<input type="hidden" name="semesterId" value={item.semesterId ?? ''} />
													<input
														class="input input-bordered input-sm"
														name="judul"
														value={item.judul}
														required
													/>
													<div class="grid grid-cols-2 gap-2">
														<input
															class="input input-bordered input-sm"
															type="date"
															name="tanggalMulai"
															value={item.tanggalMulai}
															required
														/>
														<input
															class="input input-bordered input-sm"
															type="date"
															name="tanggalSelesai"
															value={item.tanggalSelesai}
															required
														/>
													</div>
													<select class="select select-bordered select-sm" name="jenis" required>
														{#each data.jenisOptions as jenis (jenis)}
															<option value={jenis} selected={jenis === item.jenis}
																>{jenisLabels[jenis]}</option
															>
														{/each}
													</select>
													<select class="select select-bordered select-sm" name="jenjang">
														{#each data.jenjangOptions as jenjang (jenjang)}
															<option value={jenjang} selected={jenjang === item.jenjang}
																>{jenjangLabels[jenjang]}</option
															>
														{/each}
													</select>
													<select class="select select-bordered select-sm" name="kelasId">
														<option value="" selected={!data.selectedKelasId}>Berlaku umum</option>
														{#each data.kelasList as kelas (kelas.id)}
															<option value={kelas.id} selected={kelas.id === item.kelasId}
																>{kelas.nama}</option
															>
														{/each}
													</select>
													<input
														class="input input-bordered input-sm"
														type="color"
														name="warna"
														value={item.warna || '#2563eb'}
													/>
													<input
														class="input input-bordered input-sm"
														name="keterangan"
														value={item.keterangan ?? ''}
														placeholder="Keterangan"
													/>
													<div class="grid grid-cols-2 gap-2">
														<button class="btn btn-primary btn-sm shadow-none" type="submit">
															<Icon name="save" />
															Simpan
														</button>
														<button
															class="btn btn-error btn-sm shadow-none"
															type="submit"
															formaction="?/deleteAgenda"
														>
															<Icon name="del" />
															Hapus
														</button>
													</div>
												</form>
											</div>
										</details>
									{:else}
										<span class="text-base-content/60 text-xs">Hanya lihat</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	{#if data.canEdit}
		<dialog class="modal" bind:this={agendaDialog}>
			<div class="modal-box max-w-5xl">
				<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div class="flex items-start gap-3">
						<div class="bg-primary/10 text-primary rounded-box p-2"><Icon name="calendar" /></div>
						<div>
							<h3 class="text-lg font-bold">Agenda Kalender</h3>
							<p class="text-base-content/70 text-sm">
								{selectedDate
									? `Kelola agenda untuk ${formatTanggal(selectedDate)}`
									: 'Pilih tanggal kalender terlebih dahulu.'}
							</p>
						</div>
					</div>
					<form method="dialog">
						<button class="btn btn-ghost btn-sm shadow-none" type="submit">Tutup</button>
					</form>
				</div>

				<div class="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
					<section class="rounded-box border-base-300 border p-3">
						<div class="mb-3 flex items-center justify-between gap-2">
							<div>
								<h4 class="font-semibold">Agenda di Tanggal Ini</h4>
								<p class="text-base-content/60 text-xs">
									Agenda yang rentang tanggalnya mencakup tanggal pilihan.
								</p>
							</div>
							<span class="badge badge-primary badge-outline"
								>{selectedDateAgendas.length} agenda</span
							>
						</div>

						{#if selectedDateAgendas.length === 0}
							<div class="rounded-box bg-base-200/60 text-base-content/60 p-4 text-center text-sm">
								Belum ada agenda pada tanggal ini.
							</div>
						{:else}
							<div class="max-h-[520px] space-y-3 overflow-y-auto pr-1">
								{#each selectedDateAgendas as agenda (agenda.id)}
									<div class="rounded-box border-base-300 bg-base-100 border p-3">
										<div class="flex items-start gap-2">
											<span
												class="border-base-300 mt-1 inline-block h-3 w-3 shrink-0 rounded-full border"
												style={`background:${agendaColor(agenda)}`}
											></span>
											<div class="min-w-0 flex-1">
												<div class="font-semibold">{agenda.judul}</div>
												<div class="text-base-content/60 text-xs">{formatRentang(agenda)}</div>
												<div class="mt-2 flex flex-wrap gap-1">
													<span class={`badge badge-sm ${jenisTone[agenda.jenis]}`}
														>{jenisLabels[agenda.jenis]}</span
													>
													<span class="badge badge-sm badge-outline"
														>{jenjangLabels[agenda.jenjang]}</span
													>
													<span class="badge badge-sm badge-ghost"
														>{agenda.kelas?.nama ?? 'Umum'}</span
													>
												</div>
												{#if agenda.keterangan}
													<p class="text-base-content/70 mt-2 text-xs">{agenda.keterangan}</p>
												{/if}
											</div>
										</div>

										<details class="collapse-arrow bg-base-200/60 collapse mt-3">
											<summary class="collapse-title min-h-0 px-3 py-2 text-sm font-semibold"
												>Edit agenda</summary
											>
											<div class="collapse-content px-3 pb-3">
												<form class="grid gap-3 md:grid-cols-2" method="POST" action="?/saveAgenda">
													<input type="hidden" name="id" value={agenda.id} />
													<input
														type="hidden"
														name="tahunAjaranId"
														value={agenda.tahunAjaranId ?? data.selectedTahunAjaranId ?? ''}
													/>
													<input
														type="hidden"
														name="semesterId"
														value={agenda.semesterId ?? data.selectedSemesterId ?? ''}
													/>
													<label class="form-control gap-1 md:col-span-2">
														<span class="label-text font-medium">Judul</span>
														<input
															class="input input-bordered input-sm"
															name="judul"
															value={agenda.judul}
															required
														/>
													</label>
													<label class="form-control gap-1">
														<span class="label-text font-medium">Mulai</span>
														<input
															class="input input-bordered input-sm"
															type="date"
															name="tanggalMulai"
															value={agenda.tanggalMulai}
															required
														/>
													</label>
													<label class="form-control gap-1">
														<span class="label-text font-medium">Selesai</span>
														<input
															class="input input-bordered input-sm"
															type="date"
															name="tanggalSelesai"
															value={agenda.tanggalSelesai}
															required
														/>
													</label>
													<label class="form-control gap-1">
														<span class="label-text font-medium">Jenis</span>
														<select class="select select-bordered select-sm" name="jenis" required>
															{#each data.jenisOptions as jenis (jenis)}
																<option value={jenis} selected={jenis === agenda.jenis}
																	>{jenisLabels[jenis]}</option
																>
															{/each}
														</select>
													</label>
													<label class="form-control gap-1">
														<span class="label-text font-medium">Jenjang</span>
														<select class="select select-bordered select-sm" name="jenjang">
															{#each data.jenjangOptions as jenjang (jenjang)}
																<option value={jenjang} selected={jenjang === agenda.jenjang}
																	>{jenjangLabels[jenjang]}</option
																>
															{/each}
														</select>
													</label>
													<label class="form-control gap-1">
														<span class="label-text font-medium">Kelas</span>
														<select class="select select-bordered select-sm" name="kelasId">
															<option value="">Berlaku umum</option>
															{#each data.kelasList as kelas (kelas.id)}
																<option value={kelas.id} selected={kelas.id === agenda.kelasId}
																	>{kelas.nama}</option
																>
															{/each}
														</select>
													</label>
													<label class="form-control gap-1">
														<span class="label-text font-medium">Warna</span>
														<input
															class="input input-bordered input-sm"
															type="color"
															name="warna"
															value={agenda.warna || '#2563eb'}
														/>
													</label>
													<label class="form-control gap-1 md:col-span-2">
														<span class="label-text font-medium">Keterangan</span>
														<input
															class="input input-bordered input-sm"
															name="keterangan"
															value={agenda.keterangan ?? ''}
															placeholder="Catatan singkat"
														/>
													</label>
													<div class="grid gap-2 sm:grid-cols-2 md:col-span-2">
														<button class="btn btn-primary btn-sm shadow-none" type="submit">
															<Icon name="save" />
															Simpan Perubahan
														</button>
														<button
															class="btn btn-error btn-sm shadow-none"
															type="submit"
															formaction="?/deleteAgenda"
															formnovalidate
														>
															<Icon name="del" />
															Hapus Agenda
														</button>
													</div>
												</form>
											</div>
										</details>
									</div>
								{/each}
							</div>
						{/if}
					</section>

					<section class="rounded-box border-base-300 border p-3">
						<h4 class="mb-1 font-semibold">Tambah Agenda Baru</h4>
						<p class="text-base-content/60 mb-3 text-xs">
							Tanggal mulai dan selesai otomatis mengikuti tanggal yang diklik.
						</p>
						<form class="grid gap-4 md:grid-cols-2" method="POST" action="?/saveAgenda">
							<input type="hidden" name="tahunAjaranId" value={data.selectedTahunAjaranId ?? ''} />
							<input type="hidden" name="semesterId" value={data.selectedSemesterId ?? ''} />
							<label class="form-control gap-1 md:col-span-2">
								<span class="label-text font-medium">Judul</span>
								<input
									class="input input-bordered"
									name="judul"
									placeholder="Contoh: Libur Tahun Baru"
									required
								/>
							</label>
							<label class="form-control gap-1">
								<span class="label-text font-medium">Mulai</span>
								<input
									class="input input-bordered"
									type="date"
									name="tanggalMulai"
									value={selectedDate}
									required
								/>
							</label>
							<label class="form-control gap-1">
								<span class="label-text font-medium">Selesai</span>
								<input
									class="input input-bordered"
									type="date"
									name="tanggalSelesai"
									value={selectedDate}
									required
								/>
							</label>
							<label class="form-control gap-1">
								<span class="label-text font-medium">Jenis</span>
								<select class="select select-bordered" name="jenis" required>
									{#each data.jenisOptions as jenis (jenis)}
										<option
											value={jenis}
											selected={jenis === (data.selectedJenis ?? 'hari_efektif')}
											>{jenisLabels[jenis]}</option
										>
									{/each}
								</select>
							</label>
							<label class="form-control gap-1">
								<span class="label-text font-medium">Jenjang</span>
								<select class="select select-bordered" name="jenjang">
									{#each data.jenjangOptions as jenjang (jenjang)}
										<option value={jenjang} selected={jenjang === (data.selectedJenjang ?? 'semua')}
											>{jenjangLabels[jenjang]}</option
										>
									{/each}
								</select>
							</label>
							<label class="form-control gap-1">
								<span class="label-text font-medium">Kelas Opsional</span>
								<select class="select select-bordered" name="kelasId">
									<option value="" selected={!data.selectedKelasId}>Berlaku umum</option>
									{#each data.kelasList as kelas (kelas.id)}
										<option value={kelas.id} selected={kelas.id === data.selectedKelasId}
											>{kelas.nama}{kelas.fase ? ` - Fase ${kelas.fase}` : ''}</option
										>
									{/each}
								</select>
							</label>
							<label class="form-control gap-1">
								<span class="label-text font-medium">Warna</span>
								<input class="input input-bordered" type="color" name="warna" value="#2563eb" />
							</label>
							<label class="form-control gap-1 md:col-span-2">
								<span class="label-text font-medium">Keterangan</span>
								<input
									class="input input-bordered"
									name="keterangan"
									placeholder="Catatan singkat"
								/>
							</label>
							<div class="modal-action md:col-span-2">
								<button class="btn btn-primary shadow-none" type="submit">
									<Icon name="save" />
									Simpan Agenda Baru
								</button>
							</div>
						</form>
					</section>
				</div>
			</div>
			<form method="dialog" class="modal-backdrop">
				<button>Tutup</button>
			</form>
		</dialog>
	{/if}
</div>






