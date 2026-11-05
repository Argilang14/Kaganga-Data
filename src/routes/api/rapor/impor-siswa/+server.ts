import { canAttendance } from '$lib/attendance-access';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	commitStudentExchange,
	previewStudentExchange,
	readStudentExchange,
	requireStudentExchangeAccess,
	StudentExchangeError
} from '$lib/server/student-exchange';

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const schoolId = requireStudentExchangeAccess(locals);
		const form = await request.formData();
		const semesterId = Number(form.get('semesterId'));
		if (!Number.isInteger(semesterId) || semesterId <= 0)
			throw new StudentExchangeError('Pilih semester tujuan terlebih dahulu.');
		const file = form.get('file');
		if (!(file instanceof File))
			throw new StudentExchangeError('Pilih file siswa terlebih dahulu.');
		const parsed = await readStudentExchange(file);
		const context = { schoolId, semesterId, qrManage: canAttendance(locals.user, 'qr_manage') };
		if (form.get('operation') === 'preview')
			return json(await previewStudentExchange(parsed, context), {
				headers: { 'Cache-Control': 'private, no-store' }
			});
		if (form.get('operation') !== 'commit')
			throw new StudentExchangeError('Operasi impor tidak dikenali.');
		const selected = form.getAll('rows').map(Number);
		const result = await commitStudentExchange(
			parsed,
			context,
			String(form.get('token') ?? ''),
			selected,
			{ locals, request }
		);
		return json(
			{
				message: `Impor selesai: ${result.inserted} siswa baru masuk Murid Pasif, ${result.updated} biodata siswa diperbarui.`
			},
			{ headers: { 'Cache-Control': 'private, no-store' } }
		);
	} catch (cause) {
		if (cause instanceof StudentExchangeError) error(cause.status, cause.message);
		console.error('Student exchange failed', {
			name: cause instanceof Error ? cause.name : 'UnknownError'
		});
		error(500, 'Impor belum berhasil. Data tidak disimpan. Periksa file atau coba lagi.');
	}
};
