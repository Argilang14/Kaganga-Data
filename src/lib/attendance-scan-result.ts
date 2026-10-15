export type RecordedAttendance = {
	status: string;
	waktuScan: string | null;
	petugasUserId: number | null;
	metode: string;
};

export function scanReceipt(
	record: RecordedAttendance,
	duplicate: boolean,
	petugasNama: string | null
) {
	const labels: Record<string, string> = {
		hadir: 'hadir',
		terlambat: 'terlambat',
		sakit: 'sakit',
		izin: 'izin',
		alfa: 'alfa',
		pulang: 'pulang'
	};
	const time = record.waktuScan ? new Date(record.waktuScan) : null;
	const at =
		time && Number.isFinite(time.getTime())
			? ` pukul ${time.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' })} WIB`
			: '';
	const by = petugasNama ? ` oleh ${petugasNama}` : '';
	return {
		ok: true,
		code: duplicate ? 'already_present' : 'success',
		message: duplicate
			? `${record.metode === 'qr' ? 'Sudah dipindai' : 'Sudah tercatat'}${by}${at}. Status ${labels[record.status] ?? record.status}; data pertama tidak diubah.`
			: `Absensi berhasil dicatat sebagai ${labels[record.status] ?? record.status}.`,
		status: record.status,
		waktuScan: record.waktuScan,
		metode: record.metode,
		petugas:
			record.petugasUserId && petugasNama ? { id: record.petugasUserId, nama: petugasNama } : null
	};
}
