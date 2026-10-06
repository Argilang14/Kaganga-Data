const labels: Record<string, string> = { cover: 'Cover Raport', biodata: 'Biodata Murid', rapor: 'Raport', piagam: 'Piagam', keasramaan: 'Raport Keasramaan', 'kartu-absensi': 'Kartu Absensi Murid', 'jadwal-pelajaran': 'Jadwal Pelajaran', 'kalender-pendidikan': 'Kalender Pendidikan' };

export function pdfFilename(...parts: Array<string | number | null | undefined>) {
	const name = parts.filter(part => part !== null && part !== undefined && String(part).trim()).map(part => String(part).replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '-').replace(/\s+/g, ' ').trim()).join(' - ').replace(/[. ]+$/, '').slice(0, 180);
	return `${name || 'Dokumen'}.pdf`;
}
export function documentPdfFilename(docType: string, data: Record<string, unknown>, identity?: { nama?: string; kelas?: string; tahun?: string }, count?: number) {
	const murid = data.murid as { nama?: string } | undefined;
	const rombel = data.rombel as { nama?: string } | undefined;
	const periode = data.periode as { tahunPelajaran?: string; tahunAjaran?: string; label?: string; semester?: string } | undefined;
	return pdfFilename(labels[docType] ?? docType, count ? `${count} Murid` : identity?.nama ?? murid?.nama,
		identity?.kelas ?? rombel?.nama ?? data.jenjangLabel as string | undefined,
		identity?.tahun ?? periode?.tahunPelajaran ?? periode?.tahunAjaran ?? periode?.label,
		periode?.semester);
}
export function pdfDisposition(filename: string, mode = 'inline') {
	const ascii = filename.normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '-');
	return `${mode}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}
export function responsePdfFilename(response: Response, fallback = 'Dokumen.pdf') {
	const header = response.headers.get('content-disposition') ?? '';
	const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
	try { if (encoded) return decodeURIComponent(encoded); } catch { /* Use the plain filename if the encoded header is invalid. */ }
	return /filename="([^"]+)"/i.exec(header)?.[1] ?? fallback;
}
