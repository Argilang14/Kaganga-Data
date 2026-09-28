import fs from 'node:fs/promises';
import path from 'node:path';
import { error } from '@sveltejs/kit';
import db from '$lib/server/db/index.js';
import { tableMurid } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import {
	isSupportedPhoto,
	photoDirectory,
	removePhotoFiles,
	safePhotoFilename,
	thumbnailDirectory,
	thumbnailFilename,
	writePhotoThumbnail
} from '$lib/server/photo-storage';

function contentTypeFor(filename: string) {
	if (filename.endsWith('.png')) return 'image/png';
	return 'image/jpeg';
}

function slugifyName(name: string) {
	if (!name) return 'murid';
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
	dbInstance: typeof db,
	base: string,
	ext: string,
	dir: string
) {
	let filename = `${base}${ext}`;
	let counter = 1;
	let exists = false;

	do {
		try {
			await fs.access(path.join(dir, filename));
			exists = true;
			filename = `${base}-${counter}${ext}`;
			counter++;
		} catch {
			exists = false;
		}
	} while (exists && counter < 1000);

	return filename;
}

export async function GET({ params, url }: { params: Record<string, string>; url: URL }) {
	const id = +params.id;
	if (!id) throw error(400, 'Invalid id');

	const murid = await db.query.tableMurid.findFirst({
		where: eq(tableMurid.id, id),
		columns: { foto: true }
	});
	if (!murid || !murid.foto) throw error(404, 'Not found');

	const filename = safePhotoFilename(murid.foto);
	if (!filename) throw error(404, 'Not found');
	const originalPath = path.join(photoDirectory('murid'), filename);
	const thumbnailPath = path.join(thumbnailDirectory('murid'), thumbnailFilename(filename));
	const filePath = url.searchParams.get('thumbnail') === '1' ? thumbnailPath : originalPath;
	try {
		const data = await fs.readFile(filePath);
		return new Response(Buffer.from(data), {
			headers: {
				'Content-Type': filePath === thumbnailPath ? 'image/jpeg' : contentTypeFor(filename),
				'Cache-Control': 'private, max-age=3600'
			}
		});
	} catch {
		if (filePath === originalPath) throw error(404, 'Not found');
		try {
			const data = await fs.readFile(originalPath);
			return new Response(Buffer.from(data), {
				headers: {
					'Content-Type': contentTypeFor(filename),
					'Cache-Control': 'private, max-age=3600'
				}
			});
		} catch {
			throw error(404, 'Not found');
		}
	}
}

export async function DELETE({
	params,
	locals
}: {
	params: Record<string, string>;
	locals: App.Locals;
}) {
	const id = +params.id;
	if (!id) return new Response(JSON.stringify({ message: 'Invalid id' }), { status: 400 });

	const murid = await db.query.tableMurid.findFirst({
		where: eq(tableMurid.id, id),
		columns: { foto: true, sekolahId: true }
	});
	if (!murid) return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 });

	// ensure sekolah ownership
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId || murid.sekolahId !== sekolahId)
		return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 });

	if (murid.foto) {
		await removePhotoFiles('murid', murid.foto);
		await db.update(tableMurid).set({ foto: null }).where(eq(tableMurid.id, id));
	}
	return new Response(JSON.stringify({ message: 'OK' }), {
		headers: { 'Content-Type': 'application/json' }
	});
}

export async function POST({
	params,
	request,
	locals
}: {
	params: Record<string, string>;
	request: Request;
	locals: App.Locals;
}) {
	const id = +params.id;
	if (!id) return new Response(JSON.stringify({ message: 'Invalid id' }), { status: 400 });

	const murid = await db.query.tableMurid.findFirst({
		where: eq(tableMurid.id, id),
		columns: { id: true, nama: true, foto: true, sekolahId: true }
	});
	if (!murid) return new Response(JSON.stringify({ message: 'Murid not found' }), { status: 404 });

	// ensure sekolah ownership
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId || murid.sekolahId !== sekolahId)
		return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 });

	const formData = await request.formData();
	const uploadedFile = formData.get('foto') as File | null;
	const thumbnail = formData.get('thumbnail');

	if (!uploadedFile || uploadedFile.size === 0) {
		return new Response(JSON.stringify({ message: 'No file provided' }), { status: 400 });
	}

	const allowed = ['image/png', 'image/jpeg'];
	if (!allowed.includes(uploadedFile.type)) {
		return new Response(
			JSON.stringify({ message: 'Format file tidak didukung; hanya JPG dan PNG yang diizinkan' }),
			{ status: 400 }
		);
	}

	if (uploadedFile.size > 500 * 1024) {
		return new Response(
			JSON.stringify({ message: 'Ukuran file foto tidak boleh lebih dari 500KB' }),
			{ status: 400 }
		);
	}

	try {
		const buffer = Buffer.from(await uploadedFile.arrayBuffer());
		if (!isSupportedPhoto(buffer, uploadedFile.type)) {
			return new Response(JSON.stringify({ message: 'Isi file foto tidak valid' }), {
				status: 400
			});
		}
		const dir = photoDirectory('murid');
		await fs.mkdir(dir, { recursive: true });

		const ext = uploadedFile.type === 'image/png' ? '.png' : '.jpg';
		const base = slugifyName(murid.nama || `murid-${murid.id}`);
		const filename = await generateUniqueFilename(db, base, ext, dir);
		const filePath = path.join(dir, filename);

		const temporaryPath = `${filePath}.${process.pid}.tmp`;
		await fs.writeFile(temporaryPath, buffer, { mode: 0o644, flag: 'wx' });
		await fs.rename(temporaryPath, filePath);
		if (thumbnail instanceof File) {
			await writePhotoThumbnail('murid', filename, thumbnail).catch((thumbnailError) =>
				console.warn('[murid-photo] Thumbnail tidak dapat disimpan:', thumbnailError)
			);
		}
		await db.update(tableMurid).set({ foto: filename }).where(eq(tableMurid.id, id));
		if (murid.foto && murid.foto !== filename) await removePhotoFiles('murid', murid.foto);

		return new Response(JSON.stringify({ foto: filename, message: 'Foto berhasil diperbarui' }), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		console.error('Upload error:', err);
		return new Response(JSON.stringify({ message: 'Gagal upload foto' }), { status: 500 });
	}
}
