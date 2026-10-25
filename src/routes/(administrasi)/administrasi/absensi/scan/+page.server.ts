import { canAccessAbsensiDigital, todayLocalDate } from '$lib/server/absensi-digital';
import {
	canAccessAbsensiKegiatan,
	canEditAbsensiKegiatan,
	loadKegiatanAbsensiOptions
} from '$lib/server/absensi-kegiatan';
import { redirect } from '@sveltejs/kit';
import { canAttendance, canAttendActivity } from '$lib/attendance-access';
import { buildAttendanceScanGroups } from '$lib/attendance-scan';
import { selectAttendanceActivitySources } from '$lib/attendance-activity';

export async function load({ locals, url }) {
	if (!canAttendance(locals.user, 'scan')) {
		throw redirect(303, '/forbidden?required=absensi_scan');
	}
	if (!locals.sekolah?.id) throw redirect(303, '/login');
	const activities =
		canAccessAbsensiDigital(locals.user) || canAccessAbsensiKegiatan(locals.user)
			? await loadKegiatanAbsensiOptions(locals.sekolah.id, true, locals.user)
			: [];
	const kegiatanList = selectAttendanceActivitySources(activities).filter((kegiatan) =>
		canEditAbsensiKegiatan(locals.user, kegiatan.aksesEdit, kegiatan.kategori, {
			kode: kegiatan.kode,
			tanggal: todayLocalDate()
		})
	);
	return {
		travelEntry: url.searchParams.get('mode') === 'pulang' ? {
			operation: ['pulang_ke_rumah', 'kembali_ke_sekolah'].includes(url.searchParams.get('kegiatan') ?? '') ? url.searchParams.get('kegiatan')! : '',
			permitId: Number(url.searchParams.get('izin')) || null
		} : null,
		meta: { title: 'Scan QR Absensi' } satisfies PageMeta,
		offlineScope: `${locals.sekolah.id}:${locals.user!.id}`,
		canSummary: canAttendance(locals.user, 'export'),
		canRecordActivities: canAttendance(locals.user, 'lihat'),
		canScanSekolah: canAttendActivity(locals.user, 'sekolah'),
		scanGroups: buildAttendanceScanGroups(locals.user, activities, todayLocalDate()),
		kegiatanList
	};
}
