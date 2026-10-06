import { randomUUID } from 'node:crypto';
import db from '$lib/server/db';
import { tableMurid, tableMuridIdentityLink, tableMuridLifecycle } from '$lib/server/db/schema';
import { and, eq, ne, sql } from 'drizzle-orm';
import {
	muridIdentityKey,
	normalizedIdentityText,
	normalizedNisn,
	sameMuridPerson,
	validNisn
} from './murid-identity';

type Reader = typeof db | DBTransaction;
type StudentInput = {
	id?: number;
	nis: string;
	nisn: string;
	nama: string;
	tanggalLahir: string;
	semesterId: number;
};

export async function validateMuridIdentityInput(
	reader: Reader,
	sekolahId: number,
	input: StudentInput,
	options: { originalNisn?: string | null; imported?: boolean } = {}
) {
	const nisn = normalizedNisn(input.nisn);
	if (nisn && !validNisn(nisn) && (options.imported || input.nisn !== options.originalNisn)) {
		throw new Error(
			`NISN ${input.nisn} tidak valid. Gunakan 10 digit sebagai teks atau kosongkan jika belum tersedia; jangan menambah angka perkiraan.`
		);
	}
	if (!normalizedIdentityText(input.nis)) throw new Error('NIS wajib diisi.');
	if (input.id) {
		const link = await reader.query.tableMuridIdentityLink.findFirst({
			where: and(
				eq(tableMuridIdentityLink.muridId, input.id),
				eq(tableMuridIdentityLink.sekolahId, sekolahId)
			)
		});
		if (link) {
			if (link.semesterId !== input.semesterId)
				throw new Error(
					'Pindah semester harus melalui kenaikan kelas atau salin semester agar riwayat lama tetap tersimpan.'
				);
			await assertMuridNotArchived(reader, sekolahId, link.identityUid);
		}
	}
	const candidates = await reader.query.tableMurid.findMany({
		where: and(
			eq(tableMurid.sekolahId, sekolahId),
			input.id ? ne(tableMurid.id, input.id) : undefined,
			sql`(lower(trim(${tableMurid.nis}))=${normalizedIdentityText(input.nis)} OR (${validNisn(nisn) ? 1 : 0}=1 AND trim(${tableMurid.nisn})=${nisn}))`
		)
	});
	for (const candidate of candidates) {
		if (sameMuridPerson(candidate, input)) {
			const link = await reader.query.tableMuridIdentityLink.findFirst({
				where: and(
					eq(tableMuridIdentityLink.muridId, candidate.id),
					eq(tableMuridIdentityLink.sekolahId, sekolahId)
				)
			});
			if (link) await assertMuridNotArchived(reader, sekolahId, link.identityUid);
		}
		if (
			normalizedIdentityText(candidate.nis) === normalizedIdentityText(input.nis) &&
			candidate.semesterId === input.semesterId
		)
			throw new Error(`NIS ${input.nis} sudah digunakan oleh ${candidate.nama} pada semester ini.`);
		if (
			validNisn(nisn) &&
			candidate.nisn.trim() === nisn &&
			!sameMuridPerson(candidate, input) &&
			!(input.id && input.nisn === options.originalNisn && !options.imported)
		) {
			throw new Error(
				`NISN ${nisn} sudah digunakan oleh ${candidate.nama}. Periksa data; murid tidak akan digabung atau ditimpa otomatis.`
			);
		}
	}
	return nisn;
}

export async function linkMuridIdentity(
	reader: Reader,
	sekolahId: number,
	row: StudentInput & { id: number },
	sourceUid?: string
) {
	const existing = await reader.query.tableMuridIdentityLink.findFirst({
		where: and(
			eq(tableMuridIdentityLink.muridId, row.id),
			eq(tableMuridIdentityLink.sekolahId, sekolahId)
		)
	});
	if (existing) return existing.identityUid;
	let uid = sourceUid;
	if (!uid) {
		const prior = await reader
			.select({
				identityUid: tableMuridIdentityLink.identityUid,
				nis: tableMurid.nis,
				nama: tableMurid.nama,
				tanggalLahir: tableMurid.tanggalLahir
			})
			.from(tableMurid)
			.innerJoin(tableMuridIdentityLink, eq(tableMuridIdentityLink.muridId, tableMurid.id))
			.where(
				and(
					eq(tableMurid.sekolahId, sekolahId),
					ne(tableMurid.id, row.id),
					sql`lower(trim(${tableMurid.nis}))=${normalizedIdentityText(row.nis)}`
				)
			);
		const uids = [
			...new Set(prior.filter((p) => sameMuridPerson(p, row)).map((p) => p.identityUid))
		];
		if (uids.length > 1)
			throw new Error(
				'Identitas historis ambigu; periksa Arsip Murid sebelum menambah periode baru.'
			);
		uid = uids[0] || randomUUID();
	}
	await reader
		.insert(tableMuridIdentityLink)
		.values({ muridId: row.id, sekolahId, semesterId: row.semesterId, identityUid: uid });
	return uid;
}

export async function assertMuridNotArchived(reader: Reader, sekolahId: number, uid: string) {
	const lifecycle = await reader.query.tableMuridLifecycle.findFirst({
		where: and(
			eq(tableMuridLifecycle.sekolahId, sekolahId),
			eq(tableMuridLifecycle.identityKey, muridIdentityKey({ identityUid: uid }))
		)
	});
	if (lifecycle && (lifecycle.status !== 'aktif' || lifecycle.needsIdentityReview))
		throw new Error(
			'Murid berada dalam arsip atau menunggu pemeriksaan identitas. Pulihkan melalui Arsip Murid, bukan impor ulang.'
		);
}
