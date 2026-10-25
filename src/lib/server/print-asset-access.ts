import { error } from '@sveltejs/kit';
import db from './db';
import { isIntegratedSchool } from '$lib/education-unit';
import {
	printAssetKinds,
	printAssetScopes,
	type PrintAssetKind,
	type PrintAssetScope
} from './print-assets';

export async function requirePrintAssetAccess(locals: App.Locals, url: URL, rawKind?: string) {
	if (!locals.user) throw error(401, 'Silakan masuk terlebih dahulu.');
	if (locals.user.type !== 'admin' || locals.user.mustChangePassword)
		throw error(403, 'Hanya admin dapat mengelola aset cetak sekolah.');
	const school = locals.sekolah;
	if (!school?.id) throw error(400, 'Pilih sekolah aktif terlebih dahulu.');
	const scope = url.searchParams.get('scope') ?? 'induk';
	if (!printAssetScopes.includes(scope as PrintAssetScope))
		throw error(400, 'Satuan pendidikan tidak valid.');
	if (rawKind !== undefined && !printAssetKinds.includes(rawKind as PrintAssetKind))
		throw error(404, 'Jenis aset tidak ditemukan.');
	if (scope !== 'induk') {
		if (!isIntegratedSchool(school))
			throw error(400, 'Sekolah ini tidak memakai satuan pendidikan terpisah.');
		const unit = await db.$client.execute({
			sql: 'SELECT id FROM sekolah_satuan_pendidikan WHERE sekolah_id=? AND jenjang=?',
			args: [school.id, scope]
		});
		if (!unit.rows.length) throw error(409, 'Lengkapi satuan pendidikan terlebih dahulu.');
	}
	return { schoolId: school.id, scope: scope as PrintAssetScope, kind: rawKind as PrintAssetKind };
}
