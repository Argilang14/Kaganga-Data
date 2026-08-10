import fs from 'node:fs/promises';
import path from 'node:path';
import db from '$lib/server/db';
import { ensurePegawaiSchema } from '$lib/server/db/ensure-pegawai';
import { tablePegawai } from '$lib/server/db/schema';
import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { authority } from '../../../pengguna/utils.server';

function uploadsDir() {
	const configured = process.env.photo || 'file:./data/uploads';
	const raw = configured.startsWith('file:') ? configured.slice(5) : configured;
	return path.resolve(raw, 'pegawai');
}

function parseId(value: string | undefined) {
	const id = Number(value);
	return Number.isInteger(id) && id > 0 ? id : null;
}

function safeStoredFilename(value: string | null) {
	return value && path.basename(value) === value ? value : null;
}

function isSupportedImage(buffer: Buffer, mimeType: string) {
	if (mimeType === 'image/png') {
		return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
	}
	return mimeType === 'image/jpeg' && buffer[0] === 0xff && buffer[1] === 0xd8;
}

async function findOwnedPegawai(id: number, sekolahId: number) {
	await ensurePegawaiSchema();
	return db.query.tablePegawai.findFirst({
		columns: { id: true, foto: true },
		where: and(eq(tablePegawai.id, id), eq(tablePegawai.sekolahId, sekolahId))
	});
}

export async function GET({
	params,
	locals
}: {
	params: Record<string, string>;
	locals: App.Locals;
}) {
	const id = parseId(params.id);
	const sekolahId = locals.sekolah?.id;
	if (!locals.user || !id || !sekolahId) throw error(404, 'Foto pegawai tidak ditemukan.');
	const pegawai = await findOwnedPegawai(id, sekolahId);
	const filename = safeStoredFilename(pegawai?.foto ?? null);
	if (!filename) throw error(404, 'Foto pegawai tidak ditemukan.');

	try {
		const data = await fs.readFile(path.join(uploadsDir(), filename));
		return new Response(data, {
			headers: {
				'Content-Type': filename.endsWith('.png') ? 'image/png' : 'image/jpeg',
				'Cache-Control': 'private, max-age=3600'
			}
		});
	} catch {
		throw error(404, 'Foto pegawai tidak ditemukan.');
	}
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
	authority('sekolah_manage');
	const id = parseId(params.id);
	const sekolahId = locals.sekolah?.id;
	if (!id || !sekolahId) return Response.json({ message: 'Pegawai tidak valid.' }, { status: 400 });
	const pegawai = await findOwnedPegawai(id, sekolahId);
	if (!pegawai) return Response.json({ message: 'Pegawai tidak ditemukan.' }, { status: 404 });

	const file = (await request.formData()).get('foto');
	if (!(file instanceof File) || !file.size) {
		return Response.json({ message: 'Pilih foto terlebih dahulu.' }, { status: 400 });
	}
	if (!['image/png', 'image/jpeg'].includes(file.type)) {
		return Response.json({ message: 'Foto harus berformat JPG atau PNG.' }, { status: 400 });
	}
	if (file.size > 500 * 1024) {
		return Response.json({ message: 'Ukuran foto maksimal 500 KB.' }, { status: 400 });
	}

	const buffer = Buffer.from(await file.arrayBuffer());
	if (!isSupportedImage(buffer, file.type)) {
		return Response.json(
			{ message: 'Isi file bukan gambar JPG atau PNG yang valid.' },
			{ status: 400 }
		);
	}

	const directory = uploadsDir();
	await fs.mkdir(directory, { recursive: true });
	const extension = file.type === 'image/png' ? '.png' : '.jpg';
	const filename = `pegawai-${id}-${Date.now()}${extension}`;
	const temporaryPath = path.join(directory, `${filename}.tmp`);
	const finalPath = path.join(directory, filename);

	try {
		await fs.writeFile(temporaryPath, buffer, { mode: 0o644, flag: 'wx' });
		await fs.rename(temporaryPath, finalPath);
		await db
			.update(tablePegawai)
			.set({ foto: filename, updatedAt: new Date().toISOString() })
			.where(and(eq(tablePegawai.id, id), eq(tablePegawai.sekolahId, sekolahId)));
		const previous = safeStoredFilename(pegawai.foto);
		if (previous && previous !== filename) {
			await fs.unlink(path.join(directory, previous)).catch(() => undefined);
		}
		return Response.json({ foto: filename, message: 'Foto pegawai berhasil diperbarui.' });
	} catch (uploadError) {
		await fs.unlink(temporaryPath).catch(() => undefined);
		await fs.unlink(finalPath).catch(() => undefined);
		console.error('[pegawai-photo] Gagal menyimpan foto:', uploadError);
		return Response.json({ message: 'Foto pegawai gagal disimpan.' }, { status: 500 });
	}
}

export async function DELETE({
	params,
	locals
}: {
	params: Record<string, string>;
	locals: App.Locals;
}) {
	authority('sekolah_manage');
	const id = parseId(params.id);
	const sekolahId = locals.sekolah?.id;
	if (!id || !sekolahId) return Response.json({ message: 'Pegawai tidak valid.' }, { status: 400 });
	const pegawai = await findOwnedPegawai(id, sekolahId);
	if (!pegawai) return Response.json({ message: 'Pegawai tidak ditemukan.' }, { status: 404 });

	await db
		.update(tablePegawai)
		.set({ foto: null, updatedAt: new Date().toISOString() })
		.where(and(eq(tablePegawai.id, id), eq(tablePegawai.sekolahId, sekolahId)));
	const filename = safeStoredFilename(pegawai.foto);
	if (filename) await fs.unlink(path.join(uploadsDir(), filename)).catch(() => undefined);
	return Response.json({ message: 'Foto pegawai berhasil dihapus.' });
}
