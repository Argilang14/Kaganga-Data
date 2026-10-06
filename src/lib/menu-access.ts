import type { ExportUser } from './export-access';

export type AccessArea = 'sekolah' | 'kelas' | 'keasramaan';
export type AccessAction = 'lihat' | 'manage' | 'input' | 'export';

export function canAccessArea(user: ExportUser | null | undefined, area: AccessArea, action: AccessAction = 'lihat') {
	if (!user) return false;
	if (user.type === 'admin') return true;
	const permissions = user.permissions ?? [];
	if (area !== 'keasramaan') {
		return permissions.includes(`${area}_manage`) || (action === 'lihat' && permissions.includes(`${area}_lihat`));
	}
	if (action === 'export') return ['wali_kelas', 'wali_asuh', 'wali_asrama'].includes(user.type ?? '') || permissions.includes('mata_pelajaran_keasramaan');
	if (['wali_kelas', 'wali_asuh', 'wali_asrama'].includes(user.type ?? '')) return true;
	return permissions.includes(`keasramaan_${action}`) ||
		(action === 'lihat' && (permissions.includes('keasramaan_manage') || permissions.includes('keasramaan_input')));
}

export function getProtectedArea(path: string): AccessArea | null {
	const matches = (root: string) => path === root || path.startsWith(root + '/');
	if (matches('/sekolah')) return 'sekolah';
	if (matches('/kelas')) return 'kelas';
	if (['/keasramaan', '/asesmen-keasramaan', '/catatan-wali-asrama', '/rekap-nilai-asrama',
		'/api/keasramaan', '/api/asesmen-keasramaan'].some(matches)) return 'keasramaan';
	return null;
}

export function getAreaAction(path: string, method: string): AccessAction {
	if (path === '/api/keasramaan/export') return 'export';
	if (path.startsWith('/api/asesmen-keasramaan/download-template')) return 'export';
	if (path.startsWith('/api/asesmen-keasramaan') || path.startsWith('/asesmen-keasramaan/form-asesmen')) return 'input';
	if (!['GET', 'HEAD'].includes(method) || /\/(form|mata-evaluasi)(\/|$)/.test(path)) return 'manage';
	return 'lihat';
}
