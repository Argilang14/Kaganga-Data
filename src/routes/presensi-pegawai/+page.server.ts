import { error, fail } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import db from '$lib/server/db';
import { tablePresensiPegawai } from '$lib/server/db/schema';
import { ensurePresensiPegawaiSchema } from '$lib/server/db/ensure-presensi-pegawai';
import {
	getPresensiPegawaiSettings,
	isPresensiPegawaiWorkday,
	listPresensiPegawaiBulanan,
	listPresensiPegawaiHarian,
	savePresensiPegawai
} from '$lib/server/presensi-pegawai';
import { isPresensiPegawaiStatus, normalizePegawaiJenis } from '$lib/presensi-pegawai-utils';
import { isValidDate, todayDateString } from '$lib/server/absen/utils';
import { authority } from '../pengguna/utils.server';
import type { Actions, PageServerLoad } from './$types';

const PER_PAGE = 25;

function positiveInt(value: FormDataEntryValue | null) {
	const number = Number(value);
	return Number.isInteger(number) && number > 0 ? number : null;
}

function validTime(value: FormDataEntryValue | null) {
	const text = String(value ?? '').trim();
	return !text || /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text || null : undefined;
}

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	authority('administrasi_presensi_pegawai');
	depends('app:presensi-pegawai');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw error(400, 'Sekolah aktif tidak ditemukan.');
	await ensurePresensiPegawaiSchema();

	const mode = url.searchParams.get('mode') === 'bulanan' ? 'bulanan' : 'harian';
	const q = url.searchParams.get('q')?.trim().slice(0, 100) ?? '';
	const jenis = normalizePegawaiJenis(url.searchParams.get('jenis'));
	const requestedPage = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const settings = await getPresensiPegawaiSettings(sekolahId);
	const disabled = settings?.presensiPegawaiEnabled === false;

	if (mode === 'bulanan') {
		const now = new Date();
		const monthParam = Number(url.searchParams.get('bulan'));
		const yearParam = Number(url.searchParams.get('tahun'));
		const bulan = Number.isInteger(monthParam) && monthParam >= 1 && monthParam <= 12 ? monthParam : now.getMonth() + 1;
		const tahun = Number.isInteger(yearParam) && yearParam >= 2000 && yearParam <= 2200 ? yearParam : now.getFullYear();
		const result = await listPresensiPegawaiBulanan(sekolahId, tahun, bulan, q, jenis);
		const total = result.rows.length;
		const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
		const currentPage = Math.min(requestedPage, totalPages);
		return {
			meta: { title: 'Presensi Pegawai' } satisfies PageMeta,
			mode,
			disabled,
			q,
			jenis,
			bulan,
			tahun,
			dates: result.dates,
			workdays: [...result.workdays],
			rows: result.rows.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE),
			page: { currentPage, totalPages, total },
			settings
		};
	}

	const requestedDate = url.searchParams.get('tanggal');
	const tanggal = requestedDate && isValidDate(requestedDate) ? requestedDate : todayDateString();
	const [rows, day] = await Promise.all([
		listPresensiPegawaiHarian(sekolahId, tanggal, q, jenis),
		isPresensiPegawaiWorkday(sekolahId, tanggal)
	]);
	const total = rows.length;
	const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
	const currentPage = Math.min(requestedPage, totalPages);
	return {
		meta: { title: 'Presensi Pegawai' } satisfies PageMeta,
		mode,
		disabled,
		q,
		jenis,
		tanggal,
		isWorkday: day.isWorkday,
		rows: rows.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE),
		page: { currentPage, totalPages, total },
		settings
	};
};

export const actions: Actions = {
	save: async ({ locals, request }) => {
		authority('administrasi_presensi_pegawai');
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });
		const form = await request.formData();
		const pegawaiId = positiveInt(form.get('pegawaiId'));
		const tanggal = String(form.get('tanggal') ?? '');
		const status = form.get('status');
		const waktuMasuk = validTime(form.get('waktuMasuk'));
		const waktuPulang = validTime(form.get('waktuPulang'));
		const keterangan = String(form.get('keterangan') ?? '').trim().slice(0, 500) || null;
		if (!pegawaiId || !isValidDate(tanggal) || !isPresensiPegawaiStatus(status)) {
			return fail(400, { fail: 'Data presensi tidak valid.' });
		}
		if (waktuMasuk === undefined || waktuPulang === undefined) {
			return fail(400, { fail: 'Jam harus menggunakan format HH:mm.' });
		}
		await savePresensiPegawai({
			sekolahId,
			pegawaiId,
			tanggal,
			status,
			waktuMasuk,
			waktuPulang,
			keterangan,
			petugasUserId: locals.user?.id ?? null
		});
		return { message: 'Presensi pegawai berhasil disimpan.' };
	},
	bulkSave: async ({ locals, request }) => {
		authority('administrasi_presensi_pegawai');
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });
		const form = await request.formData();
		const tanggal = String(form.get('tanggal') ?? '');
		const status = form.get('status');
		const ids = String(form.get('pegawaiIds') ?? '').split(',').map(Number).filter((id) => Number.isInteger(id) && id > 0);
		if (!isValidDate(tanggal) || !isPresensiPegawaiStatus(status) || !ids.length || ids.length > PER_PAGE) {
			return fail(400, { fail: 'Data pengisian massal tidak valid.' });
		}
		for (const pegawaiId of ids) {
			await savePresensiPegawai({ sekolahId, pegawaiId, tanggal, status, petugasUserId: locals.user?.id ?? null });
		}
		return { message: `${ids.length} data presensi berhasil diisi.` };
	},
	delete: async ({ locals, request }) => {
		authority('administrasi_presensi_pegawai');
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });
		const form = await request.formData();
		const pegawaiId = positiveInt(form.get('pegawaiId'));
		const tanggal = String(form.get('tanggal') ?? '');
		if (!pegawaiId || !isValidDate(tanggal)) return fail(400, { fail: 'Data presensi tidak valid.' });
		await db.delete(tablePresensiPegawai).where(and(
			eq(tablePresensiPegawai.sekolahId, sekolahId),
			eq(tablePresensiPegawai.pegawaiId, pegawaiId),
			eq(tablePresensiPegawai.tanggal, tanggal)
		));
		return { message: 'Data presensi dikosongkan.' };
	}
};
