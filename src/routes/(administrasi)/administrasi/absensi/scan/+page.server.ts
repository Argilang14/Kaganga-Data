import {
	canAccessAbsensiDigital,
	requireAbsensiDigitalAccess,
	todayLocalDate
} from '$lib/server/absensi-digital';
import {
	canAccessAbsensiKegiatan,
	canEditAbsensiKegiatan,
	loadKegiatanAbsensiOptions
} from '$lib/server/absensi-kegiatan';
import { redirect } from '@sveltejs/kit';
import { canAttendActivity } from '$lib/attendance-access';

export async function load({ locals }) {
	if (!canAccessAbsensiDigital(locals.user) && !canAccessAbsensiKegiatan(locals.user)) {
		requireAbsensiDigitalAccess(locals.user);
	}
	if (!locals.sekolah?.id) throw redirect(303, '/login');
	const kegiatanList = (
		await loadKegiatanAbsensiOptions(locals.sekolah.id, true, locals.user)
	).filter((kegiatan) =>
		canEditAbsensiKegiatan(locals.user, kegiatan.aksesEdit, kegiatan.kategori, {
			kode: kegiatan.kode,
			tanggal: todayLocalDate()
		})
	);
	return {
		meta: { title: 'Scan QR Absensi' } satisfies PageMeta,
		canScanSekolah: canAttendActivity(locals.user, 'sekolah'),
		kegiatanList
	};
}
