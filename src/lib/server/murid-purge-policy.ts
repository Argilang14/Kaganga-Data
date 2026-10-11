export function muridPurgeProblem(row: {
	status: string;
	needsIdentityReview: number;
	identityKey: string;
	lastMuridId: number | null;
}) {
	if (row.status !== 'keluar')
		return 'Hanya murid berstatus Keluar Sekolah yang boleh dihapus permanen.';
	if (row.needsIdentityReview)
		return 'Selesaikan pemeriksaan identitas sebelum menghapus permanen.';
	if (!row.identityKey.startsWith('uid:') && row.lastMuridId)
		return 'Snapshot lama masih terhubung dengan data sumber; penghapusan diblokir.';
	return null;
}
