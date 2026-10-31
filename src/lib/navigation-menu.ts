import { canAccessArea, getProtectedArea } from './menu-access.ts';
import { canAccessMenu } from './role-menu-access.ts';
import { isAuthorizedUser } from '../routes/pengguna/permissions.ts';
import { dormSections, dormSectionVisible } from './dormitory.ts';

export type NavigationUser = Pick<AuthUser, 'permissions' | 'type'> & {
	id?: number;
	jabatanAkses?: AuthUser['jabatanAkses'];
	sekolahId?: number | null;
	mustChangePassword?: boolean;
};

/** Kebijakan tampilan saja; endpoint tetap memeriksa izin dan penugasan. */
export function visibleNavigation(
	items: MenuItem[],
	user: NavigationUser | null | undefined,
	semester: string | null
): MenuItem[] {
	if (!user) return [];
	return items.flatMap((item) => {
		const dormSection=dormSections.find(section=>item.path===`/asrama/${section.slug}`);
		if(dormSection&&!dormSectionVisible(user,dormSection.key)) return [];
		if (item.condition && item.condition !== semester) return [];
		if (item.path && !canAccessMenu(user, item.path)) return [];
		const area = item.path ? getProtectedArea(item.path) : null;
		if (area && !canAccessArea(user, area)) return [];
		if (item.permission && !isAuthorizedUser([item.permission], user)) return [];
		if (!item.subMenu) return [item];
		const subMenu = visibleNavigation(item.subMenu, user, semester);
		return subMenu.length ? [{ ...item, subMenu }] : [];
	});
}

export function navigationLeaves(items: MenuItem[]): MenuItem[] {
	return items.flatMap((item) =>
		item.subMenu ? navigationLeaves(item.subMenu) : item.path ? [item] : []
	);
}

export function allowedNavigationFavorites<T extends { path: string; userId?: number }>(
	favorites: T[],
	items: MenuItem[],
	user: NavigationUser | null | undefined,
	semester: string | null
): T[] {
	if (!user) return [];
	const paths = new Set(
		navigationLeaves(visibleNavigation(items, user, semester)).map((item) => item.path)
	);
	return favorites.filter(
		(favorite) =>
			(favorite.userId === undefined || favorite.userId === user.id) && paths.has(favorite.path)
	);
}
