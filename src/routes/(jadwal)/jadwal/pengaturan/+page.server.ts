/* eslint-disable @typescript-eslint/no-explicit-any -- Tipe ExcelJS di workspace ini tidak memuat semua API runtime. */
import { parsePositiveInteger } from '$lib/server/absensi-digital';
import db from '$lib/server/db';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import { tableJadwalJam, tableJadwalKegiatan, tableJadwalPelajaran } from '$lib/server/db/schema';
import {
	ensureDefaultJadwalFoundation,
	JADWAL_HARI,
	JADWAL_HARI_LABELS,
	JADWAL_JENIS,
	JADWAL_JENIS_LABELS,
	JADWAL_JENJANG,
	JADWAL_JENJANG_LABELS,
	loadJadwalJam,
	loadJadwalKegiatan,
	normalizeJadwalJenjang,
	requireJadwalManageAccess,
	selectJadwalContext
} from '$lib/server/jadwal';
import { fail, redirect } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import ExcelJS from 'exceljs';

const JADWAL_TIPES = ['pelajaran', 'kegiatan', 'istirahat', 'kosong'] as const;
const JADWAL_KATEGORI = ['umum', 'kokurikuler', 'keagamaan', 'istirahat'] as const;
const JADWAL_HARI_SET = new Set<string>(JADWAL_HARI);

function normalizeTime(value: FormDataEntryValue | null) {
	const raw = value?.toString().trim() ?? '';
	return /^\d{2}:\d{2}$/.test(raw) ? raw : null;
}

function normalizeImportText(value: unknown) {
	if (value == null) return '';
	if (typeof value === 'object' && 'text' in value) return String(value.text ?? '').trim();
	if (typeof value === 'object' && 'result' in value) return String(value.result ?? '').trim();
	return String(value).trim();
}

function normalizeBoolean(value: unknown) {
	const raw = normalizeImportText(value).toLowerCase();
	return raw === 'aktif' || raw === 'true' || raw === 'ya' || raw === '1';
}

async function resolveFormContext(sekolahId: number, formData: FormData) {
	const academic = await resolveSekolahAcademicContext(sekolahId);
	return selectJadwalContext(academic, {
		tahunAjaranId: formData.get('tahunAjaranId')?.toString(),
		jenis: formData.get('jenis')?.toString()
	});
}
function normalizeJadwalType(value: FormDataEntryValue | null) {
	const raw = value?.toString();
	return JADWAL_TIPES.includes(raw as (typeof JADWAL_TIPES)[number])
		? (raw as (typeof JADWAL_TIPES)[number])
		: null;
}

function normalizeJadwalKategori(value: FormDataEntryValue | null) {
	const raw = value?.toString();
	return JADWAL_KATEGORI.includes(raw as (typeof JADWAL_KATEGORI)[number])
		? (raw as (typeof JADWAL_KATEGORI)[number])
		: null;
}

async function findUsedSlot(sekolahId: number, slots: Array<{ hari: string; jamKe: number }>) {
	for (const slot of slots) {
		const used = await db.query.tableJadwalPelajaran.findFirst({
			columns: { id: true },
			where: and(
				eq(tableJadwalPelajaran.sekolahId, sekolahId),
				eq(tableJadwalPelajaran.hari, slot.hari),
				eq(tableJadwalPelajaran.jamKe, slot.jamKe)
			)
		});
		if (used) return slot;
	}
	return null;
}

export async function load({ locals, url }) {
	requireJadwalManageAccess(locals.user);
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId || !locals.user) throw redirect(303, '/login');

	const selectedJenjang = normalizeJadwalJenjang(url.searchParams.get('jenjang'));
	const academic = await resolveSekolahAcademicContext(sekolahId);
	const context = selectJadwalContext(academic, {
		tahunAjaranId: url.searchParams.get('tahunAjaranId'),
		jenis: url.searchParams.get('jenis')
	});
	const seedResult = await ensureDefaultJadwalFoundation(sekolahId, {
		...context,
		jenjang: selectedJenjang
	});

	const jamList = await loadJadwalJam(sekolahId, selectedJenjang, seedResult.template.id);
	const kegiatanList = await loadJadwalKegiatan(sekolahId);

	return {
		meta: { title: 'Pengaturan Jadwal' } satisfies PageMeta,
		activeTahunAjaranId: academic.activeTahunAjaranId,
		activeSemesterId: academic.activeSemesterId,
		tahunAjaranList: academic.tahunAjaranList.map((item) => ({ id: item.id, nama: item.nama })),
		jenisOptions: JADWAL_JENIS.map((value) => ({ value, label: JADWAL_JENIS_LABELS[value] })),
		selectedContext: context,
		selectedJenjang,
		jenjangOptions: JADWAL_JENJANG.map((value) => ({ value, label: JADWAL_JENJANG_LABELS[value] })),
		seedInfo: {
			jamInserted: seedResult.jamInserted,
			kegiatanInserted: seedResult.kegiatanInserted
		},
		hariLabels: JADWAL_HARI_LABELS,
		jamList,
		kegiatanList
	};
}

export const actions = {
	createJam: async ({ request, locals }) => {
		requireJadwalManageAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });

		const formData = await request.formData();
		const jenjang = normalizeJadwalJenjang(formData.get('jenjang'));
		const hariRaw = formData.get('hari')?.toString() ?? '';
		const hari = JADWAL_HARI_SET.has(hariRaw) ? (hariRaw as (typeof JADWAL_HARI)[number]) : null;
		const jamKe = parsePositiveInteger(formData.get('jamKe'));
		const pukulMulai = normalizeTime(formData.get('pukulMulai'));
		const pukulSelesai = normalizeTime(formData.get('pukulSelesai'));
		const tipe = normalizeJadwalType(formData.get('tipe'));
		const label = formData.get('label')?.toString().trim() || null;
		const namaDefault = formData.get('namaDefault')?.toString().trim() || null;

		if (!hari || !jamKe || !pukulMulai || !pukulSelesai || !tipe) {
			return fail(400, { fail: 'Data jam baru belum lengkap.' });
		}
		if (pukulMulai >= pukulSelesai) {
			return fail(400, { fail: 'Pukul selesai harus lebih besar dari pukul mulai.' });
		}

		const context = await resolveFormContext(sekolahId, formData);
		const { template } = await ensureDefaultJadwalFoundation(sekolahId, {
			...context,
			jenjang
		});

		const existing = await db.query.tableJadwalJam.findFirst({
			columns: { id: true },
			where: and(
				eq(tableJadwalJam.sekolahId, sekolahId),
				eq(tableJadwalJam.templateId, template.id),
				eq(tableJadwalJam.jenjang, jenjang),
				eq(tableJadwalJam.hari, hari),
				eq(tableJadwalJam.jamKe, jamKe)
			)
		});
		if (existing)
			return fail(400, { fail: 'Jam ke tersebut sudah ada pada hari dan jenjang yang dipilih.' });

		const now = new Date().toISOString();
		await db.insert(tableJadwalJam).values({
			sekolahId,
			templateId: template.id,
			jenjang,
			hari,
			jamKe,
			label: label ?? `Jam ${jamKe}`,
			pukulMulai,
			pukulSelesai,
			tipe,
			namaDefault,
			urutan: JADWAL_HARI.indexOf(hari) * 100 + jamKe,
			aktif: formData.get('aktif') === 'on',
			createdAt: now,
			updatedAt: now
		});

		return { message: 'Jam jadwal baru berhasil ditambahkan.' };
	},
	updateJam: async ({ request, locals }) => {
		requireJadwalManageAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });

		const formData = await request.formData();
		const jenjang = normalizeJadwalJenjang(formData.get('jenjang'));
		const jamId = parsePositiveInteger(formData.get('jamId'));
		const pukulMulai = normalizeTime(formData.get('pukulMulai'));
		const pukulSelesai = normalizeTime(formData.get('pukulSelesai'));
		const tipe = normalizeJadwalType(formData.get('tipe'));
		const label = formData.get('label')?.toString().trim() || null;
		const namaDefault = formData.get('namaDefault')?.toString().trim() || null;
		const aktif = formData.get('aktif') === 'on';

		if (!jamId || !pukulMulai || !pukulSelesai || !tipe) {
			return fail(400, { fail: 'Data jam belum lengkap.' });
		}

		const existing = await db.query.tableJadwalJam.findFirst({
			columns: { id: true, hari: true, jamKe: true, aktif: true },
			where: and(
				eq(tableJadwalJam.id, jamId),
				eq(tableJadwalJam.sekolahId, sekolahId),
				eq(tableJadwalJam.jenjang, jenjang)
			)
		});
		if (!existing) return fail(404, { fail: 'Jam jadwal tidak ditemukan pada jenjang ini.' });
		if (existing.aktif && !aktif && (await findUsedSlot(sekolahId, [existing]))) {
			return fail(400, {
				fail:
					existing.hari +
					' jam ke-' +
					existing.jamKe +
					' masih dipakai pada Jadwal Pelajaran dan tidak dapat dinonaktifkan.'
			});
		}

		await db
			.update(tableJadwalJam)
			.set({
				label,
				pukulMulai,
				pukulSelesai,
				tipe,
				namaDefault,
				aktif,
				updatedAt: new Date().toISOString()
			})
			.where(eq(tableJadwalJam.id, jamId));

		return { message: 'Jam jadwal berhasil disimpan.' };
	},
	deleteJam: async ({ request, locals }) => {
		requireJadwalManageAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });
		const formData = await request.formData();
		const jenjang = normalizeJadwalJenjang(formData.get('jenjang'));
		const jamId = parsePositiveInteger(formData.get('jamId'));
		if (!jamId) return fail(400, { fail: 'Jam jadwal belum dipilih.' });
		const slot = await db.query.tableJadwalJam.findFirst({
			columns: { id: true, hari: true, jamKe: true },
			where: and(
				eq(tableJadwalJam.id, jamId),
				eq(tableJadwalJam.sekolahId, sekolahId),
				eq(tableJadwalJam.jenjang, jenjang)
			)
		});
		if (!slot) return fail(404, { fail: 'Jam jadwal tidak ditemukan.' });
		if (await findUsedSlot(sekolahId, [slot])) {
			return fail(400, {
				fail:
					slot.hari +
					' jam ke-' +
					slot.jamKe +
					' masih dipakai pada Jadwal Pelajaran dan tidak dapat dihapus.'
			});
		}
		await db
			.delete(tableJadwalJam)
			.where(
				and(
					eq(tableJadwalJam.id, jamId),
					eq(tableJadwalJam.sekolahId, sekolahId),
					eq(tableJadwalJam.jenjang, jenjang)
				)
			);
		return { message: 'Jam jadwal berhasil dihapus.' };
	},

	bulkJam: async ({ request, locals }) => {
		requireJadwalManageAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });
		const formData = await request.formData();
		const jenjang = normalizeJadwalJenjang(formData.get('jenjang'));
		const ids = formData
			.getAll('jamIds')
			.map((value) => Number.parseInt(value.toString(), 10))
			.filter((value) => Number.isInteger(value) && value > 0);
		const bulkAction = formData.get('bulkAction')?.toString();
		if (!ids.length) return fail(400, { fail: 'Pilih minimal satu jam pelajaran.' });
		const selectedSlots = await db.query.tableJadwalJam.findMany({
			columns: { id: true, hari: true, jamKe: true },
			where: and(
				eq(tableJadwalJam.sekolahId, sekolahId),
				eq(tableJadwalJam.jenjang, jenjang),
				inArray(tableJadwalJam.id, ids)
			)
		});
		if (bulkAction === 'hapus' || bulkAction === 'nonaktif') {
			const used = await findUsedSlot(sekolahId, selectedSlots);
			if (used) {
				return fail(400, {
					fail: used.hari + ' jam ke-' + used.jamKe + ' masih dipakai pada Jadwal Pelajaran.'
				});
			}
		}

		if (bulkAction === 'hapus') {
			await db
				.delete(tableJadwalJam)
				.where(
					and(
						eq(tableJadwalJam.sekolahId, sekolahId),
						eq(tableJadwalJam.jenjang, jenjang),
						inArray(tableJadwalJam.id, ids)
					)
				);
			return { message: `${ids.length} jam jadwal berhasil dihapus.` };
		}

		if (bulkAction === 'aktif' || bulkAction === 'nonaktif') {
			await db
				.update(tableJadwalJam)
				.set({ aktif: bulkAction === 'aktif', updatedAt: new Date().toISOString() })
				.where(
					and(
						eq(tableJadwalJam.sekolahId, sekolahId),
						eq(tableJadwalJam.jenjang, jenjang),
						inArray(tableJadwalJam.id, ids)
					)
				);
			return {
				message: `${ids.length} jam jadwal berhasil ${bulkAction === 'aktif' ? 'diaktifkan' : 'dinonaktifkan'}.`
			};
		}

		return fail(400, { fail: 'Aksi massal tidak dikenali.' });
	},
	createKegiatan: async ({ request, locals }) => {
		requireJadwalManageAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });

		const formData = await request.formData();
		const kode = formData.get('kode')?.toString().trim().toLowerCase().replace(/\s+/g, '_') || '';
		const nama = formData.get('nama')?.toString().trim() || '';
		const kategori = normalizeJadwalKategori(formData.get('kategori'));
		const warnaRaw = formData.get('warna')?.toString().trim() || '';
		const warna = /^#[0-9a-fA-F]{6}$/.test(warnaRaw) ? warnaRaw : null;

		if (!kode || !nama || !kategori) {
			return fail(400, { fail: 'Kode, nama, dan kategori kegiatan wajib diisi.' });
		}

		const existing = await db.query.tableJadwalKegiatan.findFirst({
			columns: { id: true },
			where: and(eq(tableJadwalKegiatan.sekolahId, sekolahId), eq(tableJadwalKegiatan.kode, kode))
		});
		if (existing) return fail(400, { fail: 'Kode kegiatan sudah dipakai.' });

		const now = new Date().toISOString();
		await db.insert(tableJadwalKegiatan).values({
			sekolahId,
			kode,
			nama,
			kategori,
			warna,
			aktif: formData.get('aktif') === 'on',
			createdAt: now,
			updatedAt: now
		});

		return { message: 'Kegiatan jadwal berhasil ditambahkan.' };
	},

	deleteKegiatan: async ({ request, locals }) => {
		requireJadwalManageAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });
		const formData = await request.formData();
		const kegiatanId = parsePositiveInteger(formData.get('kegiatanId'));
		if (!kegiatanId) return fail(400, { fail: 'Kegiatan belum dipilih.' });

		await db
			.update(tableJadwalPelajaran)
			.set({ kegiatanId: null, updatedAt: new Date().toISOString() })
			.where(
				and(
					eq(tableJadwalPelajaran.sekolahId, sekolahId),
					eq(tableJadwalPelajaran.kegiatanId, kegiatanId)
				)
			);
		await db
			.delete(tableJadwalKegiatan)
			.where(
				and(eq(tableJadwalKegiatan.id, kegiatanId), eq(tableJadwalKegiatan.sekolahId, sekolahId))
			);

		return { message: 'Kegiatan non-mapel berhasil dihapus.' };
	},
	importJam: async ({ request, locals }) => {
		requireJadwalManageAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });
		const formData = await request.formData();
		const jenjang = normalizeJadwalJenjang(formData.get('jenjang'));
		const file = formData.get('file');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { fail: 'File Excel jam jadwal wajib dipilih.' });
		}
		const context = await resolveFormContext(sekolahId, formData);
		const { template } = await ensureDefaultJadwalFoundation(sekolahId, {
			...context,
			jenjang
		});
		const workbook = new ExcelJS.Workbook() as any;
		await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()));
		const sheet = (workbook.getWorksheet('Jam Jadwal') ?? workbook.worksheets[0]) as any;
		if (!sheet) return fail(400, { fail: 'File Excel tidak memiliki worksheet.' });
		let saved = 0;
		let skipped = 0;
		const now = new Date().toISOString();
		for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
			const row = sheet.getRow(rowNumber);
			const hariRaw = normalizeImportText(row.getCell(1).value).toLowerCase();
			const hari = JADWAL_HARI_SET.has(hariRaw) ? (hariRaw as (typeof JADWAL_HARI)[number]) : null;
			const jamKe = Number.parseInt(normalizeImportText(row.getCell(2).value), 10);
			const pukulMulai = normalizeTime(row.getCell(3).value as never);
			const pukulSelesai = normalizeTime(row.getCell(4).value as never);
			const tipe = normalizeJadwalType(row.getCell(5).value as never);
			const label = normalizeImportText(row.getCell(6).value) || null;
			const namaDefault = normalizeImportText(row.getCell(7).value) || null;
			const aktif = normalizeBoolean(row.getCell(8).value);
			if (!hari && !jamKe && !pukulMulai && !pukulSelesai) continue;
			if (
				!hari ||
				!Number.isInteger(jamKe) ||
				jamKe <= 0 ||
				!pukulMulai ||
				!pukulSelesai ||
				!tipe
			) {
				skipped += 1;
				continue;
			}
			if (pukulMulai >= pukulSelesai) {
				skipped += 1;
				continue;
			}
			const existing = await db.query.tableJadwalJam.findFirst({
				columns: { id: true },
				where: and(
					eq(tableJadwalJam.sekolahId, sekolahId),
					eq(tableJadwalJam.templateId, template.id),
					eq(tableJadwalJam.jenjang, jenjang),
					eq(tableJadwalJam.hari, hari),
					eq(tableJadwalJam.jamKe, jamKe)
				)
			});
			const payload = {
				sekolahId,
				templateId: template.id,
				jenjang,
				hari,
				jamKe,
				label: label ?? `Jam ${jamKe}`,
				pukulMulai,
				pukulSelesai,
				tipe,
				namaDefault,
				urutan: JADWAL_HARI.indexOf(hari) * 100 + jamKe,
				aktif,
				updatedAt: now
			};
			if (existing) {
				await db.update(tableJadwalJam).set(payload).where(eq(tableJadwalJam.id, existing.id));
			} else {
				await db.insert(tableJadwalJam).values({ ...payload, createdAt: now });
			}
			saved += 1;
		}
		return {
			message: `Import jam jadwal ${JADWAL_JENJANG_LABELS[jenjang]} selesai. Tersimpan: ${saved}, dilewati: ${skipped}.`
		};
	},
	resetDefault: async ({ request, locals }) => {
		requireJadwalManageAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sesi tidak valid.' });

		const formData = await request.formData();
		const jenjang = normalizeJadwalJenjang(formData.get('jenjang'));
		const context = await resolveFormContext(sekolahId, formData);
		const result = await ensureDefaultJadwalFoundation(sekolahId, {
			...context,
			jenjang,
			restoreMissingJam: true
		});

		return {
			message: `Fondasi jadwal dicek. Jam baru: ${result.jamInserted}, kegiatan baru: ${result.kegiatanInserted}.`
		};
	}
};
