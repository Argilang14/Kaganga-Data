import { dormEvaluationContext } from '$lib/server/dorm-evaluation';
import { canPrintDocument } from '$lib/role-menu-access';
import { error } from '@sveltejs/kit';
import { loadCetakContext } from '$lib/server/cetak-context';
import { loadCetakBawaan } from '$lib/server/cetak-bawaan';
import { getSchoolPrintFormat } from '$lib/school-print-format';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const asrama =
		event.url.searchParams.get('bagian') === 'asrama' ||
		event.url.searchParams.get('dokumen') === 'keasramaan';
	if (asrama && !canPrintDocument(event.locals.user, 'keasramaan'))
		error(403, 'Cetak rapor asrama tidak diizinkan untuk akun ini.');
	if (asrama) {
		const ctx = await dormEvaluationContext(event);
		const { academicContext } = await event.parent();
		// ponytail: satu baris per murid memakai penempatan terakhir di asrama terpilih;
		// riwayat penempatan lengkap tetap tersedia melalui menu Semua Murid.
		const students = [...new Map(ctx.students.map((s) => [s.id, s])).values()];
		return {
			dormReport: {
				label: ctx.room
					? ctx.room.asrama === ctx.room.nama
						? ctx.room.nama
						: `${ctx.room.asrama} / ${ctx.room.nama}`
					: 'Pilih asrama melalui menu di atas',
				semesterId: ctx.period?.id ?? null
			},
			academicContext: academicContext
				? { ...academicContext, activeSemesterId: ctx.period?.id ?? null }
				: null,
			kelasId: null,
			daftarMurid: students.map((s) => ({
				id: s.id,
				nama: s.nama,
				nis: null,
				nisn: s.nisn,
				penempatan_id: s.penempatan_id
			})),
			muridCount: students.length,
			format: getSchoolPrintFormat(event.locals.sekolah)
		};
	}
	const format = getSchoolPrintFormat(event.locals.sekolah);
	return {
		...(format === 'sr'
			? await loadCetakContext(event)
			: format === 'default'
				? await loadCetakBawaan(event)
				: {}),
		format,
		dormReport: null
	};
};
