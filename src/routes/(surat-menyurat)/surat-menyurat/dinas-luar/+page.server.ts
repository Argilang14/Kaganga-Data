import db from '$lib/server/db';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import { ensureSuratMenyuratSchema } from '$lib/server/db/ensure-surat-menyurat';
import {
	tableDinasLuarPermohonan,
	tableDinasLuarBukti,
	tablePegawai,
	tableSppd,
	tableSppdPegawai
} from '$lib/server/db/schema';
import { deleteDinasLuarFile, saveBuktiFile, saveUndanganFile } from '$lib/server/dinas-luar';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, desc, eq } from 'drizzle-orm';
import { authority } from '../../../pengguna/utils.server';

const STATUS = ['diajukan', 'disetujui', 'ditolak', 'selesai'] as const;

function isPdfBuffer(buffer: Buffer) {
	return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

function imageExtension(buffer: Buffer) {
	if (
		buffer.length >= 8 &&
		buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
	)
		return 'png';
	if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
		return 'jpg';
	if (
		buffer.length >= 12 &&
		buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
		buffer.subarray(8, 12).toString('ascii') === 'WEBP'
	)
		return 'webp';
	return null;
}

function text(formData: FormData, key: string) {
	const value = formData.get(key)?.toString().trim() ?? '';
	return value || null;
}

function positiveId(value: FormDataEntryValue | null) {
	const id = Number(value?.toString() ?? '');
	return Number.isInteger(id) && id > 0 ? id : null;
}

function validDate(value: string | null) {
	return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export async function load({ locals }) {
	authority('surat_dinas_luar');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId) throw redirect(303, '/login');
	await ensureSuratMenyuratSchema();

	const [pegawai, daftar] = await Promise.all([
		db.query.tablePegawai.findMany({
			columns: { id: true, nama: true, nip: true, jenis: true },
			where: and(eq(tablePegawai.sekolahId, sekolahId), eq(tablePegawai.status, 'aktif')),
			orderBy: asc(tablePegawai.nama)
		}),
		db.query.tableDinasLuarPermohonan.findMany({
			with: {
				pegawai: { columns: { id: true, nama: true, nip: true } },
				sppd: {
					columns: { id: true, nomorSurat: true, status: true },
					with: { bukti: true }
				}
			},
			where: eq(tableDinasLuarPermohonan.sekolahId, sekolahId),
			orderBy: [desc(tableDinasLuarPermohonan.tanggalBerangkat), desc(tableDinasLuarPermohonan.id)]
		})
	]);

	return {
		meta: { title: 'Dinas Luar' } satisfies PageMeta,
		pegawai,
		daftar,
		pegawaiAktifId: locals.user?.pegawaiId ?? null,
		isAdmin: locals.user?.type === 'admin'
	};
}

export const actions = {
	create: async ({ request, locals }) => {
		authority('surat_dinas_luar');
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });
		await ensureSuratMenyuratSchema();

		const formData = await request.formData();
		const selectedPegawaiId = positiveId(formData.get('pegawaiId'));
		const pegawaiId = locals.user.type === 'admin' ? selectedPegawaiId : locals.user.pegawaiId;
		const maksud = text(formData, 'maksud');
		const tempatTujuan = text(formData, 'tempatTujuan');
		const tanggalBerangkat = text(formData, 'tanggalBerangkat');
		const tanggalKembali = text(formData, 'tanggalKembali');
		if (!pegawaiId || !maksud || !tempatTujuan) {
			return fail(400, { fail: 'Pegawai, maksud perjalanan, dan tujuan wajib diisi.' });
		}
		if (!validDate(tanggalBerangkat) || !validDate(tanggalKembali)) {
			return fail(400, { fail: 'Tanggal berangkat dan kembali wajib diisi.' });
		}
		if (tanggalKembali! < tanggalBerangkat!) {
			return fail(400, { fail: 'Tanggal kembali tidak boleh sebelum tanggal berangkat.' });
		}

		const pegawai = await db.query.tablePegawai.findFirst({
			columns: { id: true },
			where: and(eq(tablePegawai.id, Number(pegawaiId)), eq(tablePegawai.sekolahId, sekolahId))
		});
		if (!pegawai) return fail(404, { fail: 'Pegawai tidak ditemukan pada sekolah aktif.' });

		const upload = formData.get('undangan');
		let undanganFile: string | null = null;
		if (upload instanceof File && upload.size > 0) {
			const buffer = Buffer.from(await upload.arrayBuffer());
			if (upload.size > 10 * 1024 * 1024 || !isPdfBuffer(buffer)) {
				return fail(400, { fail: 'Undangan harus berupa PDF dengan ukuran maksimal 10 MB.' });
			}
			undanganFile = await saveUndanganFile(
				sekolahId,
				`${locals.user.id}-${Date.now()}.pdf`,
				buffer
			);
		}
		try {
			await db.insert(tableDinasLuarPermohonan).values({
				sekolahId,
				pegawaiId: Number(pegawaiId),
				maksud,
				tempatTujuan,
				tanggalBerangkat: tanggalBerangkat!,
				tanggalKembali: tanggalKembali!,
				status: 'diajukan',
				catatan: text(formData, 'catatan'),
				undanganFile
			});
		} catch (cause) {
			await deleteDinasLuarFile(undanganFile);
			throw cause;
		}
		return { message: 'Pengajuan dinas luar berhasil ditambahkan.' };
	},
	setStatus: async ({ request, locals }) => {
		authority('surat_dinas_luar');
		if (locals.user?.type !== 'admin')
			return fail(403, { fail: 'Hanya admin yang dapat mengubah status pengajuan.' });
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });
		const formData = await request.formData();
		const id = positiveId(formData.get('id'));
		const status = formData.get('status')?.toString() as (typeof STATUS)[number];
		if (!id || !STATUS.includes(status))
			return fail(400, { fail: 'Status pengajuan tidak valid.' });
		const requestRow = await db.query.tableDinasLuarPermohonan.findFirst({
			with: { pegawai: { columns: { id: true, nama: true } } },
			where: and(
				eq(tableDinasLuarPermohonan.id, id),
				eq(tableDinasLuarPermohonan.sekolahId, sekolahId)
			)
		});
		if (!requestRow) return fail(404, { fail: 'Pengajuan tidak ditemukan.' });
		let sppdId = requestRow.sppdId;
		if (status === 'disetujui' && !sppdId) {
			const academic = await resolveSekolahAcademicContext(sekolahId);
			const [sppd] = await db
				.insert(tableSppd)
				.values({
					sekolahId,
					pegawaiId: requestRow.pegawaiId,
					tahunAjaranId: academic?.activeTahunAjaranId ?? null,
					semesterId: academic?.activeSemesterId ?? null,
					maksud: requestRow.maksud,
					tempatTujuan: requestRow.tempatTujuan,
					tanggalBerangkat: requestRow.tanggalBerangkat,
					tanggalKembali: requestRow.tanggalKembali,
					undanganFile: requestRow.undanganFile,
					status: 'draft'
				})
				.returning({ id: tableSppd.id });
			sppdId = sppd.id;
			await db.insert(tableSppdPegawai).values({
				sppdId,
				pegawaiId: requestRow.pegawaiId,
				nama: requestRow.pegawai.nama,
				urutan: 0
			});
		}
		await db
			.update(tableDinasLuarPermohonan)
			.set({ status, sppdId, updatedAt: new Date().toISOString() })
			.where(
				and(eq(tableDinasLuarPermohonan.id, id), eq(tableDinasLuarPermohonan.sekolahId, sekolahId))
			);
		return { message: 'Status dinas luar berhasil diperbarui.' };
	},
	uploadBukti: async ({ request, locals }) => {
		authority('surat_dinas_luar');
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });
		const formData = await request.formData();
		const sppdId = positiveId(formData.get('sppdId'));
		const upload = formData.get('bukti');
		if (!sppdId || !(upload instanceof File) || upload.size === 0) {
			return fail(400, { fail: 'Pilih bukti perjalanan yang akan diunggah.' });
		}
		const requestRow = await db.query.tableDinasLuarPermohonan.findFirst({
			columns: { pegawaiId: true },
			where: and(
				eq(tableDinasLuarPermohonan.sppdId, sppdId),
				eq(tableDinasLuarPermohonan.sekolahId, sekolahId)
			)
		});
		if (
			!requestRow ||
			(locals.user.type !== 'admin' && requestRow.pegawaiId !== locals.user.pegawaiId)
		) {
			return fail(403, { fail: 'Tidak dapat mengunggah bukti perjalanan ini.' });
		}
		const buffer = Buffer.from(await upload.arrayBuffer());
		const isPdf = isPdfBuffer(buffer);
		const imageExt = imageExtension(buffer);
		const isImage = imageExt !== null;
		if (!isPdf && !isImage)
			return fail(400, { fail: 'Bukti harus berupa PDF, JPG, PNG, atau WebP.' });
		if (upload.size > (isPdf ? 10 : 5) * 1024 * 1024) {
			return fail(400, { fail: `Ukuran ${isPdf ? 'PDF' : 'foto'} melebihi batas.` });
		}
		const existing = await db.query.tableDinasLuarBukti.findMany({
			columns: { jenis: true },
			where: eq(tableDinasLuarBukti.sppdId, sppdId)
		});
		const jenis = isPdf ? 'pdf' : 'foto';
		if (existing.filter((item) => item.jenis === jenis).length >= (isPdf ? 1 : 3)) {
			return fail(409, { fail: isPdf ? 'Maksimal satu bukti PDF.' : 'Maksimal tiga foto bukti.' });
		}
		const extension = isPdf ? 'pdf' : imageExt!;
		const stored = await saveBuktiFile(
			sekolahId,
			sppdId,
			`${locals.user.id}-${Date.now()}.${extension}`,
			buffer
		);
		try {
			await db
				.insert(tableDinasLuarBukti)
				.values({ sppdId, authUserId: locals.user.id, jenis, namaFile: stored });
		} catch (cause) {
			await deleteDinasLuarFile(stored);
			throw cause;
		}
		return { message: 'Bukti perjalanan berhasil diunggah.' };
	},
	deleteBukti: async ({ request, locals }) => {
		authority('surat_dinas_luar');
		const sekolahId = locals.sekolah?.id;
		const id = positiveId((await request.formData()).get('id'));
		if (!sekolahId || !id || !locals.user) return fail(400, { fail: 'Bukti tidak valid.' });
		const proof = await db.query.tableDinasLuarBukti.findFirst({
			with: { sppd: { columns: { sekolahId: true } } },
			where: eq(tableDinasLuarBukti.id, id)
		});
		if (!proof || proof.sppd.sekolahId !== sekolahId)
			return fail(404, { fail: 'Bukti tidak ditemukan.' });
		if (locals.user.type !== 'admin' && proof.authUserId !== locals.user.id)
			return fail(403, { fail: 'Tidak dapat menghapus bukti pengguna lain.' });
		await deleteDinasLuarFile(proof.namaFile);
		await db.delete(tableDinasLuarBukti).where(eq(tableDinasLuarBukti.id, id));
		return { message: 'Bukti perjalanan berhasil dihapus.' };
	},
	delete: async ({ request, locals }) => {
		authority('surat_dinas_luar');
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { fail: 'Sekolah aktif tidak ditemukan.' });
		const id = positiveId((await request.formData()).get('id'));
		if (!id) return fail(400, { fail: 'Pengajuan tidak valid.' });
		const existing = await db.query.tableDinasLuarPermohonan.findFirst({
			columns: { pegawaiId: true, status: true, undanganFile: true },
			where: and(
				eq(tableDinasLuarPermohonan.id, id),
				eq(tableDinasLuarPermohonan.sekolahId, sekolahId)
			)
		});
		if (!existing || existing.status !== 'diajukan')
			return fail(409, { fail: 'Pengajuan tidak dapat dihapus.' });
		if (locals.user?.type !== 'admin' && existing.pegawaiId !== locals.user?.pegawaiId) {
			return fail(403, { fail: 'Tidak dapat menghapus pengajuan pegawai lain.' });
		}
		await deleteDinasLuarFile(existing.undanganFile);
		await db
			.delete(tableDinasLuarPermohonan)
			.where(
				and(eq(tableDinasLuarPermohonan.id, id), eq(tableDinasLuarPermohonan.sekolahId, sekolahId))
			);
		return { message: 'Pengajuan dinas luar berhasil dihapus.' };
	}
};
