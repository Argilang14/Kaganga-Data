async function download(
	endpoint: string,
	kamarId: string | number,
	semesterId: number,
	evaluation?: string | number
): Promise<boolean> {
	try {
		const params = new URLSearchParams({
			kamar_id: String(kamarId),
			semester_id: String(semesterId)
		});
		if (evaluation) params.set('evaluasi_id', String(evaluation));
		const response = await fetch('/api/asesmen-keasramaan/' + endpoint + '?' + params);
		if (!response.ok) return false;
		const url = URL.createObjectURL(await response.blob());
		const link = document.createElement('a');
		link.href = url;
		link.download =
			response.headers.get('content-disposition')?.match(/filename="([^"\n]+)"/)?.[1] ??
			'keasramaan.xlsx';
		document.body.appendChild(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(url);
		return true;
	} catch (cause) {
		console.error(cause);
		return false;
	}
}
async function upload(
	endpoint: string,
	file: File,
	kamarId: string | number,
	semesterId: number,
	evaluation?: string | number
): Promise<{ success: boolean; message?: string }> {
	if (!file.name.toLowerCase().endsWith('.xlsx'))
		return { success: false, message: 'Hanya file .xlsx yang didukung' };
	try {
		const form = new FormData();
		form.set('file', file);
		form.set('kamar_id', String(kamarId));
		form.set('semester_id', String(semesterId));
		if (evaluation) form.set('evaluasi_id', String(evaluation));
		const response = await fetch('/api/asesmen-keasramaan/' + endpoint, {
			method: 'POST',
			headers: { accept: 'application/json' },
			body: form
		});
		const result = await response.json();
		return { success: response.ok, message: result.fail ?? result.message };
	} catch (cause) {
		console.error(cause);
		return { success: false, message: 'Berkas belum diimpor. Coba lagi.' };
	}
}
export const downloadTemplate = (
	evaluation: string | number,
	kamarId: string | number,
	semesterId: number
) => download('download-template', kamarId, semesterId, evaluation);
export const downloadTemplateMassal = (kamarId: string | number, semesterId: number) =>
	download('download-template-massal', kamarId, semesterId);
export const importNilai = (
	file: File,
	evaluation: string | number,
	kamarId: string | number,
	semesterId: number
) => upload('import', file, kamarId, semesterId, evaluation);
export const importNilaiMassal = (file: File, kamarId: string | number, semesterId: number) =>
	upload('import-massal', file, kamarId, semesterId);
