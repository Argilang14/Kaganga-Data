import db from '$lib/server/db';
import { writeAuditLog } from '$lib/server/audit-log';
import { ensureDataGovernanceSchema } from '$lib/server/db/ensure-data-governance';
import {
	tablePegawaiDokumen,
	tablePegawaiPendidikan,
	tablePegawaiRiwayat,
	tablePegawaiSertifikasi
} from '$lib/server/db/schema';
import { removePegawaiDocument, storePegawaiDocument } from '$lib/server/pegawai-documents';
import { fail, type Actions, type RequestEvent } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';

type PersonalContext = { sekolahId: number; pegawaiId: number };
type ResolveContext = (event: RequestEvent) => Promise<PersonalContext>;

const MAX_TEXT_LENGTH = 1000;

function parseRequiredId(value: FormDataEntryValue | null) {
	const raw = value?.toString().trim() ?? '';
	const id = Number(raw);
	return raw && Number.isInteger(id) && id > 0 ? id : null;
}

function parseOptionalId(value: FormDataEntryValue | null) {
	const raw = value?.toString().trim() ?? '';
	if (!raw) return { id: null, valid: true };
	const id = Number(raw);
	return Number.isInteger(id) && id > 0 ? { id, valid: true } : { id: null, valid: false };
}

function normalizeText(value: FormDataEntryValue | null) {
	const text = value?.toString().trim() ?? '';
	return text || null;
}

function readTextFields<const T extends readonly string[]>(formData: FormData, fields: T) {
	const values = {} as Record<T[number], string | null>;
	for (const field of fields) {
		const value = normalizeText(formData.get(field));
		if (value && value.length > MAX_TEXT_LENGTH) return null;
		values[field as T[number]] = value;
	}
	return values;
}

function hasOnlyFields(formData: FormData, fields: readonly string[]) {
	const allowed = new Set(fields);
	return [...formData].every(
		([key, value]) =>
			allowed.has(key) &&
			formData.getAll(key).length === 1 &&
			(key === 'file' || typeof value === 'string')
	);
}

function normalizeDate(value: FormDataEntryValue | null) {
	const date = normalizeText(value);
	if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
	const [year, month, day] = date.split('-').map(Number);
	const parsed = new Date(Date.UTC(year, month - 1, day));
	return parsed.getUTCFullYear() === year &&
		parsed.getUTCMonth() === month - 1 &&
		parsed.getUTCDate() === day
		? date
		: null;
}

function historyValues(
	event: RequestEvent,
	context: PersonalContext,
	options: { aksi: string; bagian: string; ringkasan: string }
) {
	return {
		sekolahId: context.sekolahId,
		pegawaiId: context.pegawaiId,
		authUserId: Number(event.locals.user?.id) || null,
		...options
	};
}

export function createPegawaiPersonalActions(resolveContext: ResolveContext) {
	return {
		savePendidikan: async (event) => {
			const { request } = event;
			const context = await resolveContext(event);
			const { sekolahId, pegawaiId } = context;
			const formData = await request.formData();
			if (
				!hasOnlyFields(formData, [
					'id',
					'jenjang',
					'institusi',
					'programStudi',
					'nomorIjazah',
					'tahunLulus',
					'isTerakhir'
				])
			)
				return fail(400, { fail: 'Field riwayat pendidikan tidak valid.' });
			const parsedId = parseOptionalId(formData.get('id'));
			if (!parsedId.valid) return fail(400, { fail: 'Riwayat pendidikan tidak valid.' });
			const id = parsedId.id;
			const values = readTextFields(formData, [
				'jenjang',
				'institusi',
				'programStudi',
				'nomorIjazah'
			] as const);
			if (!values) return fail(400, { fail: 'Teks maksimal 1000 karakter.' });
			const { jenjang, institusi, programStudi, nomorIjazah } = values;
			const tahunRaw = normalizeText(formData.get('tahunLulus'));
			const tahunLulus = tahunRaw ? Number(tahunRaw) : null;
			const isTerakhir = formData.get('isTerakhir') === 'on';
			if (!jenjang || !institusi) return fail(400, { fail: 'Jenjang dan institusi wajib diisi.' });
			if (
				tahunLulus !== null &&
				(!Number.isInteger(tahunLulus) ||
					tahunLulus < 1900 ||
					tahunLulus > new Date().getFullYear() + 10)
			) {
				return fail(400, { fail: 'Tahun lulus tidak valid.' });
			}
			if (id) {
				const owned = await db.query.tablePegawaiPendidikan.findFirst({
					columns: { id: true },
					where: and(
						eq(tablePegawaiPendidikan.id, id),
						eq(tablePegawaiPendidikan.sekolahId, sekolahId),
						eq(tablePegawaiPendidikan.pegawaiId, pegawaiId)
					)
				});
				if (!owned) return fail(404, { fail: 'Riwayat pendidikan tidak ditemukan.' });
			}

			await ensureDataGovernanceSchema();
			const saved = await db.transaction(async (tx) => {
				const updatedAt = new Date().toISOString();
				if (isTerakhir) {
					await tx
						.update(tablePegawaiPendidikan)
						.set({ isTerakhir: false, updatedAt })
						.where(
							and(
								eq(tablePegawaiPendidikan.sekolahId, sekolahId),
								eq(tablePegawaiPendidikan.pegawaiId, pegawaiId)
							)
						);
				}
				const payload = {
					sekolahId,
					pegawaiId,
					jenjang,
					institusi,
					programStudi,
					tahunLulus,
					nomorIjazah,
					isTerakhir,
					updatedAt
				};
				const row = id
					? (
							await tx
								.update(tablePegawaiPendidikan)
								.set(payload)
								.where(
									and(
										eq(tablePegawaiPendidikan.id, id),
										eq(tablePegawaiPendidikan.sekolahId, sekolahId),
										eq(tablePegawaiPendidikan.pegawaiId, pegawaiId)
									)
								)
								.returning()
						)[0]
					: (await tx.insert(tablePegawaiPendidikan).values(payload).returning())[0];
				await tx.insert(tablePegawaiRiwayat).values(
					historyValues(event, context, {
						aksi: id ? 'perbarui' : 'tambah',
						bagian: 'pendidikan',
						ringkasan: `Pendidikan ${jenjang} di ${institusi} ${id ? 'diperbarui' : 'ditambahkan'}.`
					})
				);
				await writeAuditLog(
					{
						locals: event.locals,
						request,
						action: id ? 'update' : 'create',
						entityType: 'pegawai_pendidikan',
						entityId: row.id,
						summary: `Riwayat pendidikan pegawai ${id ? 'diperbarui' : 'ditambahkan'}.`,
						after: row
					},
					tx
				);
				return row;
			});
			return { message: 'Riwayat pendidikan berhasil disimpan.', saved };
		},

		deletePendidikan: async (event) => {
			const context = await resolveContext(event);
			const { sekolahId, pegawaiId } = context;
			const formData = await event.request.formData();
			if (!hasOnlyFields(formData, ['id']))
				return fail(400, { fail: 'Field riwayat pendidikan tidak valid.' });
			const id = parseRequiredId(formData.get('id'));
			if (!id) return fail(400, { fail: 'Riwayat pendidikan tidak valid.' });
			const existing = await db.query.tablePegawaiPendidikan.findFirst({
				where: and(
					eq(tablePegawaiPendidikan.id, id),
					eq(tablePegawaiPendidikan.sekolahId, sekolahId),
					eq(tablePegawaiPendidikan.pegawaiId, pegawaiId)
				)
			});
			if (!existing) return fail(404, { fail: 'Riwayat pendidikan tidak ditemukan.' });
			await ensureDataGovernanceSchema();
			await db.transaction(async (tx) => {
				await tx
					.delete(tablePegawaiPendidikan)
					.where(
						and(
							eq(tablePegawaiPendidikan.id, id),
							eq(tablePegawaiPendidikan.sekolahId, sekolahId),
							eq(tablePegawaiPendidikan.pegawaiId, pegawaiId)
						)
					);
				await tx.insert(tablePegawaiRiwayat).values(
					historyValues(event, context, {
						aksi: 'hapus',
						bagian: 'pendidikan',
						ringkasan: `Pendidikan ${existing.jenjang} di ${existing.institusi} dihapus.`
					})
				);
				await writeAuditLog(
					{
						locals: event.locals,
						request: event.request,
						action: 'delete',
						entityType: 'pegawai_pendidikan',
						entityId: id,
						summary: 'Riwayat pendidikan pegawai dihapus.',
						before: existing
					},
					tx
				);
			});
			return { message: 'Riwayat pendidikan berhasil dihapus.', deletedId: id };
		},

		saveSertifikasi: async (event) => {
			const context = await resolveContext(event);
			const { sekolahId, pegawaiId } = context;
			const formData = await event.request.formData();
			if (
				!hasOnlyFields(formData, [
					'id',
					'jenis',
					'nama',
					'penyelenggara',
					'nomor',
					'catatan',
					'tanggalMulai',
					'tanggalSelesai',
					'berlakuSampai'
				])
			)
				return fail(400, { fail: 'Field sertifikasi tidak valid.' });
			const parsedId = parseOptionalId(formData.get('id'));
			if (!parsedId.valid) return fail(400, { fail: 'Sertifikasi tidak valid.' });
			const id = parsedId.id;
			const values = readTextFields(formData, [
				'jenis',
				'nama',
				'penyelenggara',
				'nomor',
				'catatan'
			] as const);
			if (!values) return fail(400, { fail: 'Teks maksimal 1000 karakter.' });
			const { jenis, nama, penyelenggara, nomor, catatan } = values;
			const dateFields = ['tanggalMulai', 'tanggalSelesai', 'berlakuSampai'] as const;
			const dates = Object.fromEntries(
				dateFields.map((key) => [key, normalizeDate(formData.get(key))])
			) as Record<(typeof dateFields)[number], string | null>;
			if (!jenis || !nama) return fail(400, { fail: 'Jenis dan nama sertifikasi wajib diisi.' });
			for (const key of dateFields) {
				if (normalizeText(formData.get(key)) && !dates[key])
					return fail(400, { fail: 'Format tanggal sertifikasi tidak valid.' });
			}
			if (dates.tanggalMulai && dates.tanggalSelesai && dates.tanggalSelesai < dates.tanggalMulai) {
				return fail(400, { fail: 'Tanggal selesai tidak boleh sebelum tanggal mulai.' });
			}
			if (id) {
				const owned = await db.query.tablePegawaiSertifikasi.findFirst({
					columns: { id: true },
					where: and(
						eq(tablePegawaiSertifikasi.id, id),
						eq(tablePegawaiSertifikasi.sekolahId, sekolahId),
						eq(tablePegawaiSertifikasi.pegawaiId, pegawaiId)
					)
				});
				if (!owned) return fail(404, { fail: 'Sertifikasi tidak ditemukan.' });
			}
			const payload = {
				sekolahId,
				pegawaiId,
				jenis,
				nama,
				penyelenggara,
				nomor,
				...dates,
				catatan,
				updatedAt: new Date().toISOString()
			};
			await ensureDataGovernanceSchema();
			const saved = await db.transaction(async (tx) => {
				const row = id
					? (
							await tx
								.update(tablePegawaiSertifikasi)
								.set(payload)
								.where(
									and(
										eq(tablePegawaiSertifikasi.id, id),
										eq(tablePegawaiSertifikasi.sekolahId, sekolahId),
										eq(tablePegawaiSertifikasi.pegawaiId, pegawaiId)
									)
								)
								.returning()
						)[0]
					: (await tx.insert(tablePegawaiSertifikasi).values(payload).returning())[0];
				await tx.insert(tablePegawaiRiwayat).values(
					historyValues(event, context, {
						aksi: id ? 'perbarui' : 'tambah',
						bagian: 'sertifikasi',
						ringkasan: `${jenis} ${nama} ${id ? 'diperbarui' : 'ditambahkan'}.`
					})
				);
				await writeAuditLog(
					{
						locals: event.locals,
						request: event.request,
						action: id ? 'update' : 'create',
						entityType: 'pegawai_sertifikasi',
						entityId: row.id,
						summary: `Sertifikasi pegawai ${id ? 'diperbarui' : 'ditambahkan'}.`,
						after: row
					},
					tx
				);
				return row;
			});
			return { message: 'Sertifikasi berhasil disimpan.', saved };
		},

		deleteSertifikasi: async (event) => {
			const context = await resolveContext(event);
			const { sekolahId, pegawaiId } = context;
			const formData = await event.request.formData();
			if (!hasOnlyFields(formData, ['id']))
				return fail(400, { fail: 'Field sertifikasi tidak valid.' });
			const id = parseRequiredId(formData.get('id'));
			if (!id) return fail(400, { fail: 'Sertifikasi tidak valid.' });
			const existing = await db.query.tablePegawaiSertifikasi.findFirst({
				where: and(
					eq(tablePegawaiSertifikasi.id, id),
					eq(tablePegawaiSertifikasi.sekolahId, sekolahId),
					eq(tablePegawaiSertifikasi.pegawaiId, pegawaiId)
				)
			});
			if (!existing) return fail(404, { fail: 'Sertifikasi tidak ditemukan.' });
			await ensureDataGovernanceSchema();
			await db.transaction(async (tx) => {
				await tx
					.delete(tablePegawaiSertifikasi)
					.where(
						and(
							eq(tablePegawaiSertifikasi.id, id),
							eq(tablePegawaiSertifikasi.sekolahId, sekolahId),
							eq(tablePegawaiSertifikasi.pegawaiId, pegawaiId)
						)
					);
				await tx.insert(tablePegawaiRiwayat).values(
					historyValues(event, context, {
						aksi: 'hapus',
						bagian: 'sertifikasi',
						ringkasan: `${existing.jenis} ${existing.nama} dihapus.`
					})
				);
				await writeAuditLog(
					{
						locals: event.locals,
						request: event.request,
						action: 'delete',
						entityType: 'pegawai_sertifikasi',
						entityId: id,
						summary: 'Sertifikasi pegawai dihapus.',
						before: existing
					},
					tx
				);
			});
			return { message: 'Sertifikasi berhasil dihapus.', deletedId: id };
		},

		saveDokumen: async (event) => {
			const context = await resolveContext(event);
			const { sekolahId, pegawaiId } = context;
			const formData = await event.request.formData();
			if (!hasOnlyFields(formData, ['id', 'jenis', 'nama', 'nomor', 'tanggal', 'file']))
				return fail(400, { fail: 'Field dokumen tidak valid.' });
			const parsedId = parseOptionalId(formData.get('id'));
			if (!parsedId.valid) return fail(400, { fail: 'Dokumen tidak valid.' });
			const id = parsedId.id;
			const values = readTextFields(formData, ['jenis', 'nama', 'nomor'] as const);
			if (!values) return fail(400, { fail: 'Teks maksimal 1000 karakter.' });
			const { jenis, nama, nomor } = values;
			const tanggalRaw = normalizeText(formData.get('tanggal'));
			const tanggal = normalizeDate(formData.get('tanggal'));
			const file = formData.get('file');
			if (!jenis || !nama) return fail(400, { fail: 'Jenis dan nama dokumen wajib diisi.' });
			if (tanggalRaw && !tanggal) return fail(400, { fail: 'Tanggal dokumen tidak valid.' });
			const existing = id
				? await db.query.tablePegawaiDokumen.findFirst({
						where: and(
							eq(tablePegawaiDokumen.id, id),
							eq(tablePegawaiDokumen.sekolahId, sekolahId),
							eq(tablePegawaiDokumen.pegawaiId, pegawaiId)
						)
					})
				: null;
			if (id && !existing) return fail(404, { fail: 'Dokumen tidak ditemukan.' });
			if (!existing && (!(file instanceof File) || !file.size))
				return fail(400, { fail: 'Pilih berkas dokumen terlebih dahulu.' });

			let stored: Awaited<ReturnType<typeof storePegawaiDocument>> | null = null;
			let committed = false;
			try {
				if (file instanceof File && file.size) stored = await storePegawaiDocument(pegawaiId, file);
				await ensureDataGovernanceSchema();
				const payload = {
					sekolahId,
					pegawaiId,
					jenis,
					nama,
					nomor,
					tanggal,
					filePath: stored?.filename ?? existing!.filePath,
					mimeType: stored?.mimeType ?? existing?.mimeType ?? null,
					ukuran: stored?.size ?? existing?.ukuran ?? null,
					updatedAt: new Date().toISOString()
				};
				const saved = await db.transaction(async (tx) => {
					const row = id
						? (
								await tx
									.update(tablePegawaiDokumen)
									.set(payload)
									.where(
										and(
											eq(tablePegawaiDokumen.id, id),
											eq(tablePegawaiDokumen.sekolahId, sekolahId),
											eq(tablePegawaiDokumen.pegawaiId, pegawaiId)
										)
									)
									.returning()
							)[0]
						: (await tx.insert(tablePegawaiDokumen).values(payload).returning())[0];
					await tx.insert(tablePegawaiRiwayat).values(
						historyValues(event, context, {
							aksi: id ? 'perbarui' : 'tambah',
							bagian: 'dokumen',
							ringkasan: `Dokumen ${nama} ${id ? 'diperbarui' : 'ditambahkan'}.`
						})
					);
					await writeAuditLog(
						{
							locals: event.locals,
							request: event.request,
							action: id ? 'update' : 'create',
							entityType: 'pegawai_dokumen',
							entityId: row.id,
							summary: `Dokumen pegawai ${id ? 'diperbarui' : 'ditambahkan'}.`,
							before: existing,
							after: row
						},
						tx
					);
					return row;
				});
				committed = true;
				if (stored && existing?.filePath) await removePegawaiDocument(existing.filePath);
				return { message: 'Dokumen berhasil disimpan.', saved };
			} catch (documentError) {
				if (stored && !committed) await removePegawaiDocument(stored.filename);
				return fail(400, {
					fail: documentError instanceof Error ? documentError.message : 'Dokumen gagal disimpan.'
				});
			}
		},

		deleteDokumen: async (event) => {
			const context = await resolveContext(event);
			const { sekolahId, pegawaiId } = context;
			const formData = await event.request.formData();
			if (!hasOnlyFields(formData, ['id']))
				return fail(400, { fail: 'Field dokumen tidak valid.' });
			const id = parseRequiredId(formData.get('id'));
			if (!id) return fail(400, { fail: 'Dokumen tidak valid.' });
			const existing = await db.query.tablePegawaiDokumen.findFirst({
				where: and(
					eq(tablePegawaiDokumen.id, id),
					eq(tablePegawaiDokumen.sekolahId, sekolahId),
					eq(tablePegawaiDokumen.pegawaiId, pegawaiId)
				)
			});
			if (!existing) return fail(404, { fail: 'Dokumen tidak ditemukan.' });
			await ensureDataGovernanceSchema();
			await db.transaction(async (tx) => {
				await tx
					.delete(tablePegawaiDokumen)
					.where(
						and(
							eq(tablePegawaiDokumen.id, id),
							eq(tablePegawaiDokumen.sekolahId, sekolahId),
							eq(tablePegawaiDokumen.pegawaiId, pegawaiId)
						)
					);
				await tx.insert(tablePegawaiRiwayat).values(
					historyValues(event, context, {
						aksi: 'hapus',
						bagian: 'dokumen',
						ringkasan: `Dokumen ${existing.nama} dihapus.`
					})
				);
				await writeAuditLog(
					{
						locals: event.locals,
						request: event.request,
						action: 'delete',
						entityType: 'pegawai_dokumen',
						entityId: id,
						summary: 'Dokumen pegawai dihapus.',
						before: existing
					},
					tx
				);
			});
			await removePegawaiDocument(existing.filePath);
			return { message: 'Dokumen berhasil dihapus.', deletedId: id };
		}
	} satisfies Actions;
}
