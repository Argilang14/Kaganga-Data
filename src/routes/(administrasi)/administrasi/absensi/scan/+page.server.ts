import { canAccessAbsensiDigital, requireAbsensiDigitalAccess } from '$lib/server/absensi-digital';
import {
	canAccessAbsensiKegiatan,
	canEditAbsensiKegiatan,
	loadKegiatanAbsensiOptions
} from '$lib/server/absensi-kegiatan';
import { redirect } from '@sveltejs/kit';

export async function load({ locals }) {
	if (!canAccessAbsensiDigital(locals.user) && !canAccessAbsensiKegiatan(locals.user)) {
		requireAbsensiDigitalAccess(locals.user);
	}
	if (!locals.sekolah?.id) throw redirect(303, '/login');
	const kegiatanList = (await loadKegiatanAbsensiOptions(locals.sekolah.id)).filter((kegiatan) =>
		canEditAbsensiKegiatan(locals.user, kegiatan.aksesEdit)
	);
	return {
		meta: { title: 'Scan QR Absensi' } satisfies PageMeta,
		canScanSekolah: canAccessAbsensiDigital(locals.user),
		kegiatanList
	};
}
