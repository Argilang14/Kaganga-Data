export type TravelOperation = 'pulang_ke_rumah' | 'kembali_ke_sekolah';
export type TravelVerification = {
	id: number;
	revision: string;
	operation: TravelOperation;
	murid: { id: number; nama: string; kelas: string };
	izin: {
		tanggalKeluar: string;
		rencanaKembali: string;
		waktuRencanaKembali: string | null;
		nomorDokumen: string | null;
		penjemputNama: string | null;
		penjemputHubungan: string | null;
	};
	keluarPada: string | null;
	terlambat: boolean;
};

export function pickupProblem(nama: unknown, hubungan: unknown) {
	if (typeof nama !== 'string' || !nama.trim() || typeof hubungan !== 'string' || !hubungan.trim())
		return 'Nama penjemput dan hubungan dengan murid wajib diisi oleh pemberi izin.';
	if (nama.trim().length > 150 || hubungan.trim().length > 100)
		return 'Nama penjemput maksimal 150 karakter dan hubungan maksimal 100 karakter.';
	return null;
}

const jakartaTimeFormatter = new Intl.DateTimeFormat('sv-SE', {
	timeZone: 'Asia/Jakarta',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hourCycle: 'h23'
});

export function travelLocalTime(date = new Date()) {
	const parts = jakartaTimeFormatter.formatToParts(date);
	const get = (key: string) => parts.find((item) => item.type === key)!.value;
	return {
		date: `${get('year')}-${get('month')}-${get('day')}`,
		time: `${get('hour')}:${get('minute')}:${get('second')}`
	};
}

export function travelReturnDeadline(permit: {
	rencanaKembali: string;
	waktuRencanaKembali: string | null;
}) {
	const time = permit.waktuRencanaKembali ?? '23:59:59';
	return `${permit.rencanaKembali}T${time.length === 5 ? `${time}:00` : time}`;
}

export function travelPermitProblem(
	permit: {
		status: string;
		tanggalKeluar: string;
		waktuKeluar: string | null;
		rencanaKembali: string;
		waktuRencanaKembali: string | null;
		tanggalKembali: string | null;
		perjalanan?: { keluarPada: string | null; kembaliPada: string | null } | null;
	},
	operation: TravelOperation,
	now = new Date()
) {
	if (permit.status === 'dibatalkan')
		return 'Izin sudah dibatalkan. Hubungi petugas penerbit izin.';
	if (
		permit.tanggalKembali ||
		permit.perjalanan?.kembaliPada ||
		!['sedang_izin', 'terlambat_kembali'].includes(permit.status)
	)
		return 'Murid sudah tercatat kembali. Perjalanan ini sudah ditutup.';
	const local = travelLocalTime(now);
	const point = `${local.date}T${local.time}`;
	if (`${permit.tanggalKeluar}T${permit.waktuKeluar ?? '00:00'}` > point)
		return 'Jadwal izin belum dimulai. Periksa tanggal dan waktu izin.';
	if (operation === 'pulang_ke_rumah') {
		if (permit.perjalanan?.keluarPada)
			return 'Keberangkatan sudah dipindai. Tidak perlu scan ulang.';
		if (travelReturnDeadline(permit) < point)
			return 'Rencana kembali sudah terlewati. Minta petugas meninjau izin sebelum keberangkatan.';
	}
	if (permit.perjalanan?.keluarPada && new Date(permit.perjalanan.keluarPada) > now)
		return 'Waktu kembali tidak boleh sebelum keberangkatan. Periksa waktu server.';
	return null;
}
