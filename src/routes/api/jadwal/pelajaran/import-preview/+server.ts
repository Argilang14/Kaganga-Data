import { loadJadwalExcelContext, parseJadwalWorkbook } from '$lib/server/jadwal-excel';
import { requireJadwalManageAccess } from '$lib/server/jadwal';
import { json } from '@sveltejs/kit';

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export async function POST({ locals, request, url }) {
	requireJadwalManageAccess(locals.user);
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) return json({ message: 'Pilih sekolah terlebih dahulu.' }, { status: 400 });
	const formData = await request.formData();
	const file = formData.get('file');
	if (!(file instanceof File) || !file.size) {
		return json({ message: 'File Excel wajib dipilih.' }, { status: 400 });
	}
	if (!file.name.toLowerCase().endsWith('.xlsx')) {
		return json({ message: 'Format file harus .xlsx.' }, { status: 400 });
	}
	if (file.size > MAX_FILE_SIZE) {
		return json({ message: 'Ukuran file maksimal 5 MB.' }, { status: 400 });
	}
	try {
		const data = await loadJadwalExcelContext(sekolahId, {
			tahunAjaranId: url.searchParams.get('tahunAjaranId'),
			jenis: url.searchParams.get('jenis')
		});
		const preview = await parseJadwalWorkbook(file, data);
		return json({
			...preview,
			context: {
				tahunAjaranId: data.context.tahunAjaranId,
				tahunAjaran: data.tahunAjaranNama,
				jenis: data.context.jenis,
				jenisLabel: data.jenisLabel
			}
		});
	} catch (cause) {
		return json(
			{ message: cause instanceof Error ? cause.message : 'File Excel tidak dapat dibaca.' },
			{ status: 400 }
		);
	}
}
