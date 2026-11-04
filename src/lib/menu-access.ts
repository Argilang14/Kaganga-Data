import { schoolWideDorm, hasRole } from './user-role.ts';
import type { ExportUser } from './export-access';

export type AccessArea = 'sekolah' | 'kelas' | 'keasramaan';
export type AccessAction = 'lihat' | 'manage' | 'input' | 'export';

export function canAccessArea(
	user: ExportUser | null | undefined,
	area: AccessArea,
	action: AccessAction = 'lihat'
) {
	if (!user) return false;
	if (user.type === 'admin') return true;
	const permissions = user.permissions ?? [];
	if (area !== 'keasramaan') {
		return (
			permissions.includes(`${area}_manage`) ||
			(action === 'lihat' && permissions.includes(`${area}_lihat`))
		);
	}
	if (schoolWideDorm(user))
		return action !== 'input' || (user.permissions ?? []).includes('keasramaan_input');
	if (!hasRole(user, 'wali_asuh', 'wali_asrama')) return false;
	if (action === 'lihat' || action === 'export') return true;
	return action === 'input' ? hasRole(user, 'wali_asuh') : hasRole(user, 'wali_asrama');
}

export function getProtectedArea(path: string): AccessArea | null {
	const matches = (root: string) => path === root || path.startsWith(root + '/');
	if (matches('/sekolah')) return 'sekolah';
	if (matches('/kelas')) return 'kelas';
	if (
		[
			'/keasramaan',
			'/asesmen-keasramaan',
			'/catatan-wali-asrama',
			'/rekap-nilai-asrama',
			'/api/keasramaan',
			'/api/asesmen-keasramaan'
		].some(matches)
	)
		return 'keasramaan';
	return null;
}

export function getAreaAction(path: string, method: string): AccessAction {
	if (path === '/api/keasramaan/export') return 'export';
	if (path.startsWith('/api/asesmen-keasramaan/download-template')) return 'export';
	if (
		path.startsWith('/api/asesmen-keasramaan') ||
		path.startsWith('/asesmen-keasramaan/form-asesmen') ||
		(path.startsWith('/asesmen-keasramaan') && !['GET', 'HEAD'].includes(method))
	)
		return 'input';
	if (!['GET', 'HEAD'].includes(method) || /\/(form|mata-evaluasi)(\/|$)/.test(path))
		return 'manage';
	return 'lihat';
}
