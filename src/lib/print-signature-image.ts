/** Hanya data PNG lokal; tidak memuat URL luar atau HTML dari input pengguna. */
export function printSignatureImage(url?: string | null) {
	if (!url || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(url)) return '';
	return `<span style="display:block;position:relative;height:0"><img src="${url}" alt="Tanda tangan" style="position:absolute;bottom:2mm;left:50%;transform:translateX(-50%);width:30mm;height:14mm;object-fit:contain"></span>`;
}
