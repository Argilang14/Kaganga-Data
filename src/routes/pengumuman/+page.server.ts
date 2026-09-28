import { writeAuditLog } from '$lib/server/audit-log';
import db from '$lib/server/db';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import { ensureInventarisPengumumanSchema } from '$lib/server/db/ensure-inventaris-pengumuman';
import { tableKalenderPendidikan, tablePengumuman } from '$lib/server/db/schema';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { authority } from '../pengguna/utils.server';

const CATEGORIES = ['umum', 'sekolah', 'asrama', 'akademik'] as const;
const AUDIENCES = ['semua', 'admin', 'guru', 'wali_kelas', 'wali_asuh', 'wali_asrama'] as const;
const PRIORITIES = ['normal', 'penting'] as const;

const canManage = (locals: App.Locals) =>
	locals.user?.type === 'admin' || locals.user?.permissions?.includes('pengumuman_manage') === true;
const textValue = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const roleAudience = (type: string | undefined) => (type === 'user' ? 'guru' : type);

async function ownedAnnouncement(sekolahId: number, id: number) {
	return db.query.tablePengumuman.findFirst({
		where: and(eq(tablePengumuman.id, id), eq(tablePengumuman.sekolahId, sekolahId))
	});
}

export async function load({ locals, url }) {
	authority('pengumuman_lihat', 'pengumuman_manage');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw redirect(303, '/login');
	await ensureInventarisPengumumanSchema();
	const academic = await resolveSekolahAcademicContext(sekolahId);
	const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
	const categoryValue = url.searchParams.get('kategori') ?? '';
	const kategori = CATEGORIES.includes(categoryValue as (typeof CATEGORIES)[number])
		? categoryValue
		: '';
	const manage = canManage(locals);
	const audience = roleAudience(locals.user?.type);
	const visibility = manage
		? undefined
		: and(
				eq(tablePengumuman.aktif, true),
				lte(tablePengumuman.tanggalMulai, today),
				or(isNull(tablePengumuman.tanggalSelesai), gte(tablePengumuman.tanggalSelesai, today)),
				audience
					? or(
							eq(tablePengumuman.audiens, 'semua'),
							eq(tablePengumuman.audiens, audience as (typeof AUDIENCES)[number])
						)
					: eq(tablePengumuman.audiens, 'semua')
			);
	const announcements = await db
		.select()
		.from(tablePengumuman)
		.where(
			and(
				eq(tablePengumuman.sekolahId, sekolahId),
				kategori
					? eq(tablePengumuman.kategori, kategori as (typeof CATEGORIES)[number])
					: undefined,
				visibility
			)
		)
		.orderBy(
			desc(tablePengumuman.prioritas),
			desc(tablePengumuman.tanggalMulai),
			desc(tablePengumuman.id)
		);
	const agenda = await db
		.select({
			id: tableKalenderPendidikan.id,
			judul: tableKalenderPendidikan.judul,
			jenis: tableKalenderPendidikan.jenis,
			tanggalMulai: tableKalenderPendidikan.tanggalMulai,
			tanggalSelesai: tableKalenderPendidikan.tanggalSelesai,
			jenjang: tableKalenderPendidikan.jenjang,
			keterangan: tableKalenderPendidikan.keterangan,
			warna: tableKalenderPendidikan.warna
		})
		.from(tableKalenderPendidikan)
		.where(
			and(
				eq(tableKalenderPendidikan.sekolahId, sekolahId),
				gte(tableKalenderPendidikan.tanggalSelesai, today),
				academic.activeTahunAjaranId
					? eq(tableKalenderPendidikan.tahunAjaranId, academic.activeTahunAjaranId)
					: undefined
			)
		)
		.orderBy(asc(tableKalenderPendidikan.tanggalMulai))
		.limit(30);
	return {
		meta: { title: 'Pengumuman dan Agenda' } satisfies PageMeta,
		announcements,
		agenda,
		categories: CATEGORIES,
		audiences: AUDIENCES,
		priorities: PRIORITIES,
		canManage: manage,
		filters: { kategori },
		context: {
			today,
			tahunAjaran:
				academic.tahunAjaranList.find((item) => item.id === academic.activeTahunAjaranId)?.nama ??
				'-'
		}
	};
}

function parseAnnouncement(form: FormData) {
	const judul = textValue(form, 'judul');
	const isi = textValue(form, 'isi');
	const kategori = textValue(form, 'kategori');
	const audiens = textValue(form, 'audiens');
	const prioritas = textValue(form, 'prioritas');
	const tanggalMulai = textValue(form, 'tanggalMulai');
	const tanggalSelesai = textValue(form, 'tanggalSelesai') || null;
	if (!judul || !isi || !tanggalMulai)
		return { error: 'Judul, isi, dan tanggal mulai wajib diisi.' } as const;
	if (
		!CATEGORIES.includes(kategori as (typeof CATEGORIES)[number]) ||
		!AUDIENCES.includes(audiens as (typeof AUDIENCES)[number]) ||
		!PRIORITIES.includes(prioritas as (typeof PRIORITIES)[number])
	)
		return { error: 'Kategori, audiens, atau prioritas tidak valid.' } as const;
	if (tanggalSelesai && tanggalSelesai < tanggalMulai)
		return { error: 'Tanggal selesai tidak boleh sebelum tanggal mulai.' } as const;
	return {
		values: {
			judul,
			isi,
			kategori: kategori as (typeof CATEGORIES)[number],
			audiens: audiens as (typeof AUDIENCES)[number],
			prioritas: prioritas as (typeof PRIORITIES)[number],
			tanggalMulai,
			tanggalSelesai
		}
	} as const;
}

export const actions = {
	create: async ({ request, locals }) => {
		if (!canManage(locals))
			return fail(403, { fail: 'Anda tidak memiliki izin mengelola pengumuman.' });
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });
		const parsed = parseAnnouncement(await request.formData());
		if ('error' in parsed) return fail(400, { fail: parsed.error });
		const [created] = await db
			.insert(tablePengumuman)
			.values({ sekolahId, ...parsed.values, aktif: true, dibuatOlehId: locals.user.id })
			.returning();
		await writeAuditLog({
			locals,
			request,
			action: 'create',
			entityType: 'pengumuman',
			entityId: created.id,
			summary: `Pengumuman ${created.judul} diterbitkan.`,
			after: created
		});
		return { message: 'Pengumuman berhasil diterbitkan.' };
	},
	update: async ({ request, locals }) => {
		if (!canManage(locals))
			return fail(403, { fail: 'Anda tidak memiliki izin mengelola pengumuman.' });
		const sekolahId = locals.sekolah?.id;
		const form = await request.formData();
		const id = Number(textValue(form, 'id'));
		const before =
			sekolahId && Number.isInteger(id) ? await ownedAnnouncement(sekolahId, id) : null;
		if (!before) return fail(404, { fail: 'Pengumuman tidak ditemukan.' });
		const parsed = parseAnnouncement(form);
		if ('error' in parsed) return fail(400, { fail: parsed.error });
		const changes = { ...parsed.values, updatedAt: new Date().toISOString() };
		await db
			.update(tablePengumuman)
			.set(changes)
			.where(and(eq(tablePengumuman.id, id), eq(tablePengumuman.sekolahId, sekolahId!)));
		await writeAuditLog({
			locals,
			request,
			action: 'update',
			entityType: 'pengumuman',
			entityId: id,
			summary: `Pengumuman ${parsed.values.judul} diperbarui.`,
			before,
			after: changes
		});
		return { message: 'Pengumuman berhasil diperbarui.' };
	},
	toggle: async ({ request, locals }) => {
		if (!canManage(locals))
			return fail(403, { fail: 'Anda tidak memiliki izin mengelola pengumuman.' });
		const sekolahId = locals.sekolah?.id;
		const id = Number(textValue(await request.formData(), 'id'));
		const before =
			sekolahId && Number.isInteger(id) ? await ownedAnnouncement(sekolahId, id) : null;
		if (!before) return fail(404, { fail: 'Pengumuman tidak ditemukan.' });
		const changes = { aktif: !before.aktif, updatedAt: new Date().toISOString() };
		await db.update(tablePengumuman).set(changes).where(eq(tablePengumuman.id, id));
		await writeAuditLog({
			locals,
			request,
			action: 'status_change',
			entityType: 'pengumuman',
			entityId: id,
			summary: `Pengumuman ${before.judul} ${changes.aktif ? 'diaktifkan' : 'dinonaktifkan'}.`,
			before,
			after: changes
		});
		return { message: `Pengumuman berhasil ${changes.aktif ? 'diaktifkan' : 'dinonaktifkan'}.` };
	},
	delete: async ({ request, locals }) => {
		if (!canManage(locals))
			return fail(403, { fail: 'Anda tidak memiliki izin menghapus pengumuman.' });
		const sekolahId = locals.sekolah?.id;
		const id = Number(textValue(await request.formData(), 'id'));
		const before =
			sekolahId && Number.isInteger(id) ? await ownedAnnouncement(sekolahId, id) : null;
		if (!before) return fail(404, { fail: 'Pengumuman tidak ditemukan.' });
		await db
			.delete(tablePengumuman)
			.where(and(eq(tablePengumuman.id, id), eq(tablePengumuman.sekolahId, sekolahId!)));
		await writeAuditLog({
			locals,
			request,
			action: 'delete',
			entityType: 'pengumuman',
			entityId: id,
			summary: `Pengumuman ${before.judul} dihapus.`,
			before
		});
		return { message: 'Pengumuman berhasil dihapus.' };
	}
};
