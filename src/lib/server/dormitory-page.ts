import { error, fail, isHttpError, type Actions, type RequestEvent } from '@sveltejs/kit';
import { DormValidationError, dormSections, dormSectionVisible } from '$lib/dormitory';
import {
	loadDormitory,
	mutateDormitory,
	previewPlacement,
	placementInput,
	dormErrorMessage
} from './dormitory';

export async function loadDormitoryPage(event: RequestEvent) {
	const section = dormSections.find((section) => section.slug === event.params.bagian);
	if (!section) error(404, 'Halaman asrama tidak ditemukan.');
	if (!dormSectionVisible(event.locals.user, section.key))
		error(403, 'Halaman ini tidak diizinkan untuk akun Anda.');
	const params = new URLSearchParams(event.url.searchParams);
	params.set('view', section.key === 'gedung' ? 'kamar' : section.key);
	event.setHeaders({ 'cache-control': 'private, no-store' });
	return {
		meta: { title: section.title },
		section,
		dorm: await loadDormitory(event.locals, params, event.cookies)
	};
}
export const dormitoryActions: Actions = {
	save: async ({ locals, request }) => {
		try {
			const form = await request.formData();
			if (form.get('operation') === 'preview')
				return { preview: await previewPlacement(locals, placementInput(form)), success: false };
			return await mutateDormitory(locals, String(form.get('operation')), form);
		} catch (cause) {
			if (isHttpError(cause))
				return fail(cause.status, { success: false, message: cause.body.message });
			if (cause instanceof DormValidationError)
				return fail(400, { success: false, message: cause.message });
			console.error('[asrama] action failed', cause);
			return fail(409, { success: false, message: dormErrorMessage(cause) });
		}
	}
};
