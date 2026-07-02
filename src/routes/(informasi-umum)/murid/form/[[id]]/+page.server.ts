import fs from 'node:fs/promises';
import path from 'node:path';
import db from '$lib/server/db/index.js';
import { ensureMuridWaliAsramaSchema } from '$lib/server/db/ensure-murid-wali-asrama';
import { tableAlamat, tableKelas, tableMurid, tableWaliMurid } from '$lib/server/db/schema.js';
import { unflattenFormData } from '$lib/utils.js';
import { error, fail, redirect } from '@sveltejs/kit';
import { and, eq, ne } from 'drizzle-orm';
import { isAuthorizedUser } from '../../../../pengguna/permissions';

export async function load({ params, locals }) {
	await ensureMuridWaliAsramaSchema();

	// Allow homeroom/full users to manage student data; wali_asrama gets limited edit access.
	if (
		locals.user?.type !== 'wali_kelas' &&
		locals.user?.type !== 'wali_asuh' &&
		locals.user?.type !== 'wali_asrama' &&
		!isAuthorizedUser(['kelas_manage'], locals.user)
	) {
		redirect(303, '/forbidden?required=kelas_manage');
	}

	const meta: PageMeta = { title: 'Form Murid' };
	if (!params.id) return { meta };

	const murid = await db.query.tableMurid.findFirst({
		where: eq(tableMurid.id, +params.id),
		with: { alamat: true, ibu: true, ayah: true, wali: true }
	});
	if (!murid) error(404, `Data murid tidak ditemukan`);
	return { murid, meta };
}

export const actions = {
	async save({ locals, request, params }) {
		await ensureMuridWaliAsramaSchema();

		// Allow homeroom/full users to manage student data; wali_asrama gets limited edit access.
		if (
			locals.user?.type !== 'wali_kelas' &&
			locals.user?.type !== 'wali_asuh' &&
			locals.user?.type !== 'wali_asrama' &&
			!isAuthorizedUser(['kelas_manage'], locals.user)
		) {
			redirect(303, '/forbidden?required=kelas_manage');
		}

		const formData = await request.formData();
		const uploadedFile = formData.get('foto') as File | null;
		const formMurid = unflattenFormData<Murid>(formData);
		const isLimitedWaliAsramaEdit = locals.user?.type === 'wali_asrama';

		function uploadsDir() {
			const envPhoto = process.env.photo || 'file:./data/uploads';
			const raw = envPhoto.startsWith('file:') ? envPhoto.slice(5) : envPhoto;
			return path.resolve(raw);
		}

		function slugifyName(name: string) {
			if (!name) return 'murid';
			// remove unicode combining marks (diacritics), keep letters/numbers/spaces/dash
			// use unicode property escapes to allow international letters
			const cleaned = name
				.normalize('NFKD')
				.replace(/[\u0300-\u036f]/g, '')
				.replace(/[^\p{L}\p{N}\s-]/gu, '')
				.trim()
				.replace(/\s+/g, '-')
				.toLowerCase();
			return cleaned.substring(0, 80) || 'murid';
		}

		async function generateUniqueFilename(
			dbTrans: DBTransaction,
			base: string,
			ext: string,
			dir: string,
			currentId?: number | null
		) {
			let i = 0;
			let candidate = `${base}${ext}`;
			while (true) {
				// check DB for existing usage
				const existing = await dbTrans.query.tableMurid.findFirst({
					where: eq(tableMurid.foto, candidate),
					columns: { id: true }
				});
				const usedByOther = !!(existing && (!currentId || existing.id !== currentId));
				// check filesystem
				let existsOnDisk = false;
				try {
					await fs.stat(path.join(dir, candidate));
					existsOnDisk = true;
				} catch {
					existsOnDisk = false;
				}
				if (!usedByOther && !existsOnDisk) return candidate;
				i += 1;
				candidate = `${base}-${i}${ext}`;
				if (i > 1000) throw error(500, 'Gagal membuat nama file unik');
			}
		}
		formMurid.sekolahId = locals.sekolah!.id;

		if (isLimitedWaliAsramaEdit) {
			if (!params.id) {
				error(403, 'Wali Asrama hanya dapat mengubah data wali pada murid yang sudah ada');
			}

			const murid = await db.query.tableMurid.findFirst({
				where: eq(tableMurid.id, +params.id),
				columns: { id: true, sekolahId: true, foto: true }
			});
			if (!murid || murid.sekolahId !== locals.sekolah!.id) {
				error(404, 'Data murid tidak ditemukan');
			}

			await db
				.update(tableMurid)
				.set({
					waliAsramaNama: formMurid.waliAsramaNama ?? null,
					waliAsramaNip: formMurid.waliAsramaNip ?? null,
					waliAsuhNama: formMurid.waliAsuhNama ?? null,
					waliAsuhNip: formMurid.waliAsuhNip ?? null,
					updatedAt: new Date().toISOString()
				})
				.where(eq(tableMurid.id, +params.id));

			return {
				message: `Data wali asrama dan wali asuh berhasil disimpan`,
				id: murid.id,
				foto: murid.foto ?? null,
				waliAsramaNama: formMurid.waliAsramaNama ?? null,
				waliAsramaNip: formMurid.waliAsramaNip ?? null,
				waliAsuhNama: formMurid.waliAsuhNama ?? null,
				waliAsuhNip: formMurid.waliAsuhNip ?? null
			};
		}

		if (!formMurid.kelasId) {
			error(400, 'Kelas harus dipilih');
		}

		const kelas = await db.query.tableKelas.findFirst({
			where: eq(tableKelas.id, formMurid.kelasId),
			columns: { id: true, sekolahId: true, semesterId: true }
		});

		if (!kelas || kelas.sekolahId !== formMurid.sekolahId) {
			error(400, 'Kelas tidak valid untuk sekolah ini');
		}

		formMurid.semesterId = kelas.semesterId;

		const nis = String(formMurid.nis ?? '').trim();
		if (!nis) {
			return fail(400, { fail: 'NIS wajib diisi.' });
		}

		const duplicateNis = await db.query.tableMurid.findFirst({
			columns: { id: true, nama: true },
			where: params.id
				? and(
						eq(tableMurid.sekolahId, formMurid.sekolahId),
						eq(tableMurid.semesterId, formMurid.semesterId),
						eq(tableMurid.nis, nis),
						ne(tableMurid.id, +params.id)
					)
				: and(
						eq(tableMurid.sekolahId, formMurid.sekolahId),
						eq(tableMurid.semesterId, formMurid.semesterId),
						eq(tableMurid.nis, nis)
					)
		});
		if (duplicateNis) {
			return fail(400, {
				fail: `NIS ${nis} sudah digunakan oleh ${duplicateNis.nama} pada semester kelas yang dipilih. Gunakan NIS yang berbeda atau edit data murid yang sudah ada.`
			});
		}

		await db.transaction(async (db) => {
			if (params.id) {
				// update
				const murid = await db.query.tableMurid.findFirst({
					where: eq(tableMurid.id, +params.id)
				});
				if (!murid) error(404, `Data murid tidak ditemukan`);

				// handle uploaded foto (update)
				if (uploadedFile && uploadedFile.size) {
					const allowed = ['image/png', 'image/jpeg'];
					if (uploadedFile.size > 500 * 1024) {
						error(400, 'Ukuran file foto tidak boleh lebih dari 500KB');
					}
					if (!allowed.includes(uploadedFile.type)) {
						error(400, 'Format file tidak didukung; hanya JPG dan PNG yang diizinkan');
					}

					const buffer = Buffer.from(await uploadedFile.arrayBuffer());
					const dir = uploadsDir();
					await fs.mkdir(dir, { recursive: true });
					const ext = uploadedFile.type === 'image/png' ? '.png' : '.jpg';
					const base = slugifyName(formMurid.nama || murid.nama || `murid-${murid.id}`);
					const filename = await generateUniqueFilename(db, base, ext, dir, murid.id);
					const filePath = path.join(dir, filename);
					// remove old file if exists and different
					if (murid.foto && murid.foto !== filename) {
						try {
							await fs.unlink(path.join(dir, murid.foto));
						} catch {
							// ignore
						}
					}
					await fs.writeFile(filePath, buffer, { mode: 0o644 });
					formMurid.foto = filename;
				}

				await db
					.update(tableAlamat)
					.set(formMurid.alamat)
					.where(eq(tableAlamat.id, murid.alamatId));

				formMurid.alamatId = murid.alamatId;
				formMurid.ibuId = await upsertWaliMurid(db, formMurid.ibu, murid.ibuId);
				formMurid.ayahId = await upsertWaliMurid(db, formMurid.ayah, murid.ayahId);
				formMurid.waliId = await upsertWaliMurid(db, formMurid.wali, murid.waliId);
				await db.update(tableMurid).set(formMurid).where(eq(tableMurid.id, +params.id));
			} else {
				// insert
				if (formMurid.alamat?.jalan) {
					const [alamat] = await db
						.insert(tableAlamat)
						.values(formMurid.alamat)
						.returning({ id: tableAlamat.id });
					formMurid.alamatId = alamat?.id;
				}

				formMurid.ibuId = await upsertWaliMurid(db, formMurid.ibu);
				formMurid.ayahId = await upsertWaliMurid(db, formMurid.ayah);
				formMurid.waliId = await upsertWaliMurid(db, formMurid.wali);
				formMurid.updatedAt = new Date().toISOString();
				const [murid] = await db
					.insert(tableMurid)
					.values(formMurid)
					.returning({ id: tableMurid.id });
				formMurid.id = murid?.id;

				// handle uploaded foto (new insert)
				if (uploadedFile && uploadedFile.size) {
					const allowed = ['image/png', 'image/jpeg'];
					if (uploadedFile.size > 500 * 1024) {
						error(400, 'Ukuran file foto tidak boleh lebih dari 500KB');
					}
					if (!allowed.includes(uploadedFile.type)) {
						error(400, 'Format file tidak didukung; hanya JPG dan PNG yang diizinkan');
					}

					const buffer = Buffer.from(await uploadedFile.arrayBuffer());
					const dir = uploadsDir();
					await fs.mkdir(dir, { recursive: true });
					const ext = uploadedFile.type === 'image/png' ? '.png' : '.jpg';
					const base = slugifyName(formMurid.nama || `murid-${formMurid.id}`);
					const filename = await generateUniqueFilename(db, base, ext, dir, formMurid.id);
					const filePath = path.join(dir, filename);
					// remove old file if exists
					const existing = await db.query.tableMurid.findFirst({
						where: eq(tableMurid.id, formMurid.id),
						columns: { foto: true }
					});
					if (existing?.foto && existing.foto !== filename) {
						try {
							await fs.unlink(path.join(dir, existing.foto));
						} catch {
							// ignore
						}
					}
					await fs.writeFile(filePath, buffer, { mode: 0o644 });
					await db
						.update(tableMurid)
						.set({ foto: filename })
						.where(eq(tableMurid.id, formMurid.id));
				}
			}
		});
		// return the created/updated murid id and foto filename (if any)
		return {
			message: `Data murid berhasil disimpan`,
			id: formMurid.id,
			foto: formMurid.foto ?? null,
			waliAsramaNama: formMurid.waliAsramaNama ?? null,
			waliAsramaNip: formMurid.waliAsramaNip ?? null,
			waliAsuhNama: formMurid.waliAsuhNama ?? null,
			waliAsuhNip: formMurid.waliAsuhNip ?? null
		};
	}
};

async function upsertWaliMurid(db: DBTransaction, wali: WaliMurid, waliId?: number | null) {
	if (waliId) {
		await db
			.update(tableWaliMurid) //
			.set(wali)
			.where(eq(tableWaliMurid.id, waliId));
	} else {
		const [newWali] = await db
			.insert(tableWaliMurid) //
			.values(wali)
			.returning({ id: tableWaliMurid.id });
		waliId = newWali?.id;
	}
	return waliId;
}
