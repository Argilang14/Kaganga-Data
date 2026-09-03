import { error, fail } from '@sveltejs/kit';
import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import db from '$lib/server/db';
import { tableBukuTamu } from '$lib/server/db/schema';
import { ensureBukuTamuSchema } from '$lib/server/db/ensure-buku-tamu';
import {
	getOrCreateBukuTamuSettings,
	rotateBukuTamuPublicToken,
	setBukuTamuPasskey
} from '$lib/server/buku-tamu-pass';
import { removeBukuTamuSignature } from '$lib/server/buku-tamu-signature';
import { authority } from '../pengguna/utils.server';

const PER_PAGE = 20;

function validDate(value: string | null) {
	return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function positiveId(value: FormDataEntryValue | null) {
	const id = Number(value);
	return Number.isInteger(id) && id > 0 ? id : null;
}

export async function load({ locals, url, depends }) {
	authority('administrasi_buku_tamu');
	depends('app:buku-tamu');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw error(400, 'Sekolah aktif tidak ditemukan.');
	await ensureBukuTamuSchema();
	const settings = await getOrCreateBukuTamuSettings(sekolahId);
	const q = url.searchParams.get('q')?.trim() ?? '';
	const today = new Date();
	const defaultStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
	const defaultEnd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
	const tanggalMulai = validDate(url.searchParams.get('tanggal_mulai')) ?? defaultStart;
	const tanggalSelesai = validDate(url.searchParams.get('tanggal_selesai')) ?? defaultEnd;
	const requestedPage = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const startIso = new Date(`${tanggalMulai}T00:00:00`).toISOString();
	const endIso = new Date(`${tanggalSelesai}T23:59:59.999`).toISOString();
	const filter = and(
		eq(tableBukuTamu.sekolahId, sekolahId),
		sql`${tableBukuTamu.createdAt} >= ${startIso}`,
		sql`${tableBukuTamu.createdAt} <= ${endIso}`,
		q
			? or(
					like(tableBukuTamu.nama, `%${q}%`),
					like(tableBukuTamu.asalInstansi, `%${q}%`),
					like(tableBukuTamu.keperluan, `%${q}%`)
				)
			: undefined
	);
	const [{ count }] = await db
		.select({ count: sql<number>`count(*)` })
		.from(tableBukuTamu)
		.where(filter);
	const total = Number(count ?? 0);
	const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
	const currentPage = Math.min(requestedPage, totalPages);
	const offset = (currentPage - 1) * PER_PAGE;
	const daftar = await db.query.tableBukuTamu.findMany({
		where: filter,
		orderBy: [desc(tableBukuTamu.createdAt), desc(tableBukuTamu.id)],
		limit: PER_PAGE,
		offset
	});
	return {
		meta: { title: 'Buku Tamu' } satisfies PageMeta,
		daftar: daftar.map((row, index) => ({ ...row, no: offset + index + 1 })),
		total,
		filter: { q, tanggalMulai, tanggalSelesai, currentPage, totalPages },
		publicUrl: `${url.origin}/tamu/${settings.publicToken}`,
		passkeySet: Boolean(settings.passkeyHash && settings.passkeySalt)
	};
}

export const actions = {
	setPasskey: async ({ locals, request }) => {
		authority('administrasi_buku_tamu');
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });
		const passkey = String((await request.formData()).get('passkey') ?? '').trim();
		if (passkey && (passkey.length < 4 || passkey.length > 64)) {
			return fail(400, { fail: 'Passkey harus terdiri dari 4-64 karakter.' });
		}
		await setBukuTamuPasskey(sekolahId, passkey || null);
		return { message: passkey ? 'Passkey Buku Tamu diperbarui.' : 'Passkey Buku Tamu dinonaktifkan.' };
	},
	rotateToken: async ({ locals }) => {
		authority('administrasi_buku_tamu');
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });
		await rotateBukuTamuPublicToken(sekolahId);
		return { message: 'Tautan publik baru berhasil dibuat. Tautan lama sudah tidak berlaku.' };
	},
	delete: async ({ locals, request }) => {
		authority('administrasi_buku_tamu');
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });
		const id = positiveId((await request.formData()).get('id'));
		if (!id) return fail(400, { fail: 'Data tamu tidak valid.' });
		const row = await db.query.tableBukuTamu.findFirst({
			columns: { id: true, tandaTangan: true },
			where: and(eq(tableBukuTamu.id, id), eq(tableBukuTamu.sekolahId, sekolahId))
		});
		if (!row) return fail(404, { fail: 'Data tamu tidak ditemukan pada sekolah aktif.' });
		await db
			.delete(tableBukuTamu)
			.where(and(eq(tableBukuTamu.id, id), eq(tableBukuTamu.sekolahId, sekolahId)));
		await removeBukuTamuSignature(row.tandaTangan);
		return { message: 'Data tamu berhasil dihapus.' };
	}
};
