import { hasSchoolWideOperationalAccess } from './access-position.ts';
import { canAttendance, canAttendActivity, type AttendanceUser } from './attendance-access.ts';
import {
	canonicalAttendanceActivityCode,
	selectAttendanceActivitySources
} from './attendance-activity.ts';
import { classMonitoringCapabilities } from './class-monitoring.ts';

export const attendanceScanModes = ['pegawai', 'sekolah', 'makan', 'asrama', 'pulang'] as const;
export type AttendanceScanMode = (typeof attendanceScanModes)[number];
export const attendanceScanModeLabels: Record<AttendanceScanMode, string> = {
	pegawai: 'Absensi Pegawai',
	sekolah: 'Absensi Sekolah',
	makan: 'Absensi Makan',
	asrama: 'Absensi Asrama',
	pulang: 'Absensi Pulang'
};

export type ScanActivity = {
	id: number;
	kode: string;
	nama: string;
	kategori: string;
	aksesEdit: string;
};
export type AttendanceScanOption = {
	key: string;
	label: string;
	activityId: number | null;
};
export type AttendanceScanGroup = {
	mode: AttendanceScanMode;
	label: string;
	qrKind: 'murid' | 'kelas';
	status: 'available' | 'prepared';
	onlineRequired: boolean;
	activities: AttendanceScanOption[];
};

export type ClassScanOptions = {
	tanggal: string;
	jenis: 'persiapan' | 'ganjil' | 'genap';
	meetings: Array<{
		key: string;
		kelas: string;
		mapel: string;
		guru: string;
		mulai: string;
		selesai: string;
		canScan: boolean;
		scannedAt: string | null;
		journalUrl: string;
	}>;
};

export function parseAttendanceScanMode(value: unknown): AttendanceScanMode | null {
	return attendanceScanModes.includes(value as AttendanceScanMode)
		? (value as AttendanceScanMode)
		: null;
}

export function canScanStudentTravel(user: AttendanceUser) {
	return canAttendance(user, 'scan') && canAttendance(user, 'perjalanan');
}

function belongsToMode(activity: ScanActivity, mode: AttendanceScanMode) {
	if (mode === 'makan') return activity.kategori === 'makan';
	if (mode === 'sekolah')
		return (
			activity.kategori === 'sekolah' ||
			(activity.kategori === 'sholat' &&
				['sholat_zuhur', 'sholat_asar'].includes(canonicalAttendanceActivityCode(activity.kode)))
		);
	return mode === 'asrama' && ['asrama', 'sholat'].includes(activity.kategori);
}

export function canScanModeActivity(
	user: AttendanceUser,
	mode: AttendanceScanMode,
	activity: ScanActivity,
	tanggal: string
) {
	if (!canAttendance(user, 'scan') || !belongsToMode(activity, mode)) return false;
	if (!hasSchoolWideOperationalAccess(user)) {
		if (mode === 'sekolah' && !['user', 'wali_kelas'].includes(user?.type ?? '')) return false;
		if (mode === 'asrama' && !['wali_asuh', 'wali_asrama'].includes(user?.type ?? '')) return false;
		if (mode === 'makan' && user?.type !== 'tim_dapur') return false;
	}
	return canAttendActivity(user, activity.aksesEdit, activity.kategori, {
		kode: activity.kode,
		tanggal
	});
}

export function buildAttendanceScanGroups(
	user: AttendanceUser,
	activities: readonly ScanActivity[],
	tanggal: string
): AttendanceScanGroup[] {
	if (!user) return [];
	const sources = selectAttendanceActivitySources(activities);
	const groups: AttendanceScanGroup[] = [];
	if (classMonitoringCapabilities(user).canScan) {
		groups.push({
			mode: 'pegawai',
			label: attendanceScanModeLabels.pegawai,
			qrKind: 'kelas',
			status: 'available',
			onlineRequired: true,
			activities: [{ key: 'absen_kelas', label: 'Absen Kelas', activityId: null }]
		});
	}
	for (const mode of ['sekolah', 'makan', 'asrama'] as const) {
		const allowed = sources.filter((activity) =>
			canScanModeActivity(user, mode, activity, tanggal)
		);
		if (!allowed.length) continue;
		groups.push({
			mode,
			label: attendanceScanModeLabels[mode],
			qrKind: 'murid',
			status: 'available',
			onlineRequired: false,
			activities: allowed.map((activity) => ({
				key: canonicalAttendanceActivityCode(activity.kode),
				label: activity.nama,
				activityId: activity.id
			}))
		});
	}
	if (canScanStudentTravel(user)) {
		groups.push({
			mode: 'pulang',
			label: attendanceScanModeLabels.pulang,
			qrKind: 'murid',
			status: 'available',
			onlineRequired: true,
			activities: [
				{ key: 'pulang_ke_rumah', label: 'Pulang ke Rumah', activityId: null },
				{ key: 'kembali_ke_sekolah', label: 'Kembali ke Sekolah', activityId: null }
			]
		});
	}
	return groups.sort(
		(a, b) => attendanceScanModes.indexOf(a.mode) - attendanceScanModes.indexOf(b.mode)
	);
}
