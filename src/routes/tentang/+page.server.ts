import { getAppVersion } from '$lib/server/app-info';

export async function load() {
	const meta: PageMeta = {
		title: 'Tentang Aplikasi',
		description: 'Informasi tentang aplikasi Kaganga Data'
	};
	return { meta, appVersion: getAppVersion() };
}
