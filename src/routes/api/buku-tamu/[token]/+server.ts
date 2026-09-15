import { error, json } from '@sveltejs/kit';
import { pdfFilename, pdfDisposition } from '$lib/pdf-filename';
import { and, asc, eq, like, or, sql } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import db from '$lib/server/db';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import { tableBukuTamu, tableSekolah } from '$lib/server/db/schema';
import { getBukuTamuSettingsByToken, isBukuTamuUnlocked } from '$lib/server/buku-tamu-pass';
import {
	bukuTamuSignatureDataUrl,
	removeBukuTamuSignature,
	saveBukuTamuSignature
} from '$lib/server/buku-tamu-signature';
import { isAuthorizedUser } from '../../../pengguna/permissions';
import { renderPDF } from '$lib/server/pdf/pagedpdf';
import { renderBukuTamuHTML } from '$lib/server/pdf/templates/buku-tamu';
import {
	composeAlamat,
	formatTanggal,
	getLogoDinasSrc,
	getLogoSrc
} from '$lib/server/pdf/preview-utils';
import type { RequestHandler } from './$types';

/* eslint-disable @typescript-eslint/no-explicit-any -- ExcelJS runtime API is broader than its bundled types. */

const submissions = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_SUBMISSIONS = 10;

function checkSubmissionLimit(key: string) {
	const cutoff = Date.now() - WINDOW_MS;
	const values = (submissions.get(key) ?? []).filter((value) => value >= cutoff);
	if (values.length >= MAX_SUBMISSIONS) return false;
	submissions.set(key, [...values, Date.now()]);
	return true;
}

function requiredText(value: unknown, label: string, max: number) {
	const text = typeof value === 'string' ? value.trim() : '';
	if (!text) throw error(400, `${label} wajib diisi.`);
	if (text.length > max) throw error(400, `${label} maksimal ${max} karakter.`);
	return text;
}

function optionalText(value: unknown, max: number) {
	const text = typeof value === 'string' ? value.trim() : '';
	if (text.length > max) throw error(400, `Isian maksimal ${max} karakter.`);
	return text || null;
}

function requiredDate(url: URL, key: string) {
	const value = url.searchParams.get(key);
	if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		throw error(400, `Parameter ${key} tidak valid.`);
	}
	return value;
}

async function loadExportRows(sekolahId: number, url: URL) {
	const start = requiredDate(url, 'tanggal_mulai');
	const end = requiredDate(url, 'tanggal_selesai');
	const q = url.searchParams.get('q')?.trim() ?? '';
	const startIso = new Date(`${start}T00:00:00`).toISOString();
	const endIso = new Date(`${end}T23:59:59.999`).toISOString();
	const rows = await db.query.tableBukuTamu.findMany({
		where: and(
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
		),
		orderBy: asc(tableBukuTamu.createdAt)
	});
	return { start, end, rows };
}

export const GET = (async ({ params, locals, url }) => {
	if (!['export', 'print'].includes(params.token)) throw error(404, 'Not found');
	if (!isAuthorizedUser(['administrasi_buku_tamu'], locals.user)) throw error(403, 'Forbidden');
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId || !locals.sekolah) throw error(400, 'Sekolah aktif tidak ditemukan.');
	const { start, end, rows } = await loadExportRows(sekolahId, url);

	if (params.token === 'export') {
		const workbook: any = new ExcelJS.Workbook();
		workbook.creator = 'Kaganga';
		const sheet: any = workbook.addWorksheet('Buku Tamu', {
			views: [{ state: 'frozen', ySplit: 1 }]
		});
		sheet.columns = [
			{ header: 'No.', key: 'no', width: 7 },
			{ header: 'Tanggal dan Waktu', key: 'waktu', width: 23 },
			{ header: 'Nama', key: 'nama', width: 28 },
			{ header: 'Asal / Instansi', key: 'asal', width: 30 },
			{ header: 'NIP', key: 'nip', width: 20 },
			{ header: 'Keperluan', key: 'keperluan', width: 45 },
			{ header: 'Pesan dan Kesan', key: 'pesan', width: 45 },
			{ header: 'Tanda Tangan', key: 'ttd', width: 18 }
		];
		rows.forEach((row, index) =>
			sheet.addRow({
				no: index + 1,
				waktu: new Intl.DateTimeFormat('id-ID', {
					dateStyle: 'medium',
					timeStyle: 'short'
				}).format(new Date(row.createdAt)),
				nama: row.nama,
				asal: row.asalInstansi,
				nip: row.nip ?? '',
				keperluan: row.keperluan,
				pesan: row.pesanKesan ?? '',
				ttd: row.tandaTangan ? 'Ada' : 'Tidak ada'
			})
		);
		sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
		sheet.getRow(1).fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: 'FF1F5FAF' }
		};
		sheet.eachRow((row: any) => {
			row.alignment = { vertical: 'top', wrapText: true };
		});
		sheet.autoFilter = { from: 'A1', to: 'H1' };
		const buffer = await workbook.xlsx.writeBuffer();
		return new Response(buffer as unknown as BodyInit, {
			headers: {
				'content-type':
					'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'content-disposition': `attachment; filename="buku-tamu-${start}-${end}.xlsx"`,
				'cache-control': 'no-store'
			}
		});
	}

	const sekolah = await db.query.tableSekolah.findFirst({
		columns: { nama: true, npsn: true },
		where: eq(tableSekolah.id, sekolahId)
	});
	const [logoUrl, logoDinasUrl, printRows] = await Promise.all([
		getLogoSrc(sekolahId),
		getLogoDinasSrc(sekolahId),
		Promise.all(
			rows.map(async (row, index) => ({
				no: index + 1,
				waktu: new Intl.DateTimeFormat('id-ID', {
					dateStyle: 'medium',
					timeStyle: 'short'
				}).format(new Date(row.createdAt)),
				nama: row.nama,
				asal: row.asalInstansi,
				nip: row.nip ?? '',
				keperluan: row.keperluan,
				pesan: row.pesanKesan ?? '',
				tandaTangan: await bukuTamuSignatureDataUrl(row.tandaTangan)
			}))
		)
	]);
	const html = renderBukuTamuHTML({
		sekolah: {
			nama: sekolah?.nama ?? '',
			npsn: sekolah?.npsn ?? '',
			alamat: composeAlamat(locals.sekolah),
			logoUrl,
			logoDinasUrl
		},
		periode: `${formatTanggal(start)} s.d. ${formatTanggal(end)}`,
		rows: printRows
	});
	const pdf = Buffer.from(await renderPDF(html));
	return new Response(new Blob([pdf], { type: 'application/pdf' }), {
		headers: {
			'content-disposition': pdfDisposition(pdfFilename('Buku Tamu Digital', start, end)),
			'cache-control': 'no-store'
		}
	});
}) satisfies RequestHandler;

export const POST = (async ({ params, request, cookies, getClientAddress }) => {
	const settings = await getBukuTamuSettingsByToken(params.token);
	if (!settings?.publicToken) throw error(404, 'Tautan Buku Tamu tidak ditemukan.');
	if (!isBukuTamuUnlocked(cookies, settings)) throw error(403, 'Passkey diperlukan.');
	if (!checkSubmissionLimit(`${settings.publicToken}:${getClientAddress()}`)) {
		throw error(429, 'Terlalu banyak pengisian dari perangkat ini. Coba beberapa saat lagi.');
	}
	const sekolah = await db.query.tableSekolah.findFirst({
		columns: { id: true },
		where: eq(tableSekolah.id, settings.sekolahId)
	});
	if (!sekolah) throw error(404, 'Sekolah tidak ditemukan.');

	const body = (await request.json()) as Record<string, unknown>;
	const nama = requiredText(body.nama, 'Nama', 120);
	const asalInstansi = requiredText(body.asalInstansi, 'Asal atau instansi', 160);
	const keperluan = requiredText(body.keperluan, 'Keperluan', 1000);
	const nip = optionalText(body.nip, 40);
	const pesanKesan = optionalText(body.pesanKesan, 1000);
	const signatureData = optionalText(body.tandaTangan, 500_000);
	const academic = await resolveSekolahAcademicContext(sekolah.id);
	const tandaTangan = signatureData ? await saveBukuTamuSignature(signatureData) : null;

	try {
		await db.insert(tableBukuTamu).values({
			sekolahId: sekolah.id,
			tahunAjaranId: academic?.activeTahunAjaranId ?? null,
			semesterId: academic?.activeSemesterId ?? null,
			nama,
			asalInstansi,
			nip,
			keperluan,
			pesanKesan,
			tandaTangan,
			createdAt: new Date().toISOString()
		});
	} catch (cause) {
		await removeBukuTamuSignature(tandaTangan);
		throw cause;
	}
	return json({ message: 'Data kunjungan berhasil disimpan.' });
}) satisfies RequestHandler;
