import { error } from '@sveltejs/kit';
import { and, desc, eq, inArray, lte } from 'drizzle-orm';
import db from './db';
import {
	tableKesehatanMurid,
	tableMurid,
	tableMuridIdentityLink,
	tableMuridProfilTambahan as profiles,
	tableMuridProfilFoto as photos,
	tablePegawai
} from './db/schema';
import { ensureMuridProfileSchema } from './db/ensure-murid-profile';
import { ensureDataGovernanceSchema } from './db/ensure-data-governance';
import { ensureKesehatanMuridSchema } from './db/ensure-kesehatan-murid';
import { resolveSekolahAcademicContext } from './db/academic';
import { assertStudentAccess } from './student-access';
import { assertMuridIdentityConsistent } from './murid-identity-service';
import { MuridIdentityConflictError } from './murid-identity-integrity';
import { writeAuditLog } from './audit-log';
import {
	canUseStudentProfile,
	emptyStudentProfile,
	studentProfileDate,
	validateStudentProfilePatch,
	validateStudentProfileConsistency,
	type StudentProfileAction,
	type StudentProfileValues
} from '$lib/murid-profile';

const today = () =>
	new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Jakarta',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date());

export async function requireStudentProfileAccess(
	locals: App.Locals,
	muridId: number,
	action: StudentProfileAction
) {
	const user = locals.user;
	const school = locals.sekolah;
	if (!user) error(401, 'Silakan masuk terlebih dahulu.');
	if (!school || !canUseStudentProfile(user, school.id, action))
		error(403, 'Akses profil tambahan murid belum diizinkan. Hubungi admin sekolah.');
	if (!Number.isSafeInteger(muridId) || muridId < 1)
		error(400, 'Murid tidak valid. Pilih kembali murid yang akan dibuka.');
	if (user.type !== 'admin') {
		const employee = await db.query.tablePegawai.findFirst({
			columns: { id: true },
			where: and(
				eq(tablePegawai.id, user.pegawaiId ?? -1),
				eq(tablePegawai.sekolahId, school.id),
				eq(tablePegawai.status, 'aktif')
			)
		});
		if (!employee) error(403, 'Akun harus terhubung dengan pegawai aktif di sekolah ini.');
	}
	await ensureDataGovernanceSchema();
	await ensureMuridProfileSchema();
	// Attendance-wide access deliberately does not apply to private student profiles.
	const student = await assertStudentAccess(
		user,
		school.id,
		muridId,
		action === 'edit',
		'assigned'
	);
	if (!student) error(404, 'Murid tidak ditemukan atau berada di luar cakupan akses.');
	if (user.type !== 'admin') {
		const academic = await resolveSekolahAcademicContext(school.id);
		if (!academic.activeSemesterId || student.semesterId !== academic.activeSemesterId)
			error(403, 'Profil pribadi hanya dapat diakses melalui penugasan pada semester aktif.');
	}
	const link = await db.query.tableMuridIdentityLink.findFirst({
		where: and(
			eq(tableMuridIdentityLink.muridId, muridId),
			eq(tableMuridIdentityLink.sekolahId, school.id)
		)
	});
	if (!link) error(409, 'Identitas murid belum dipetakan. Periksa identitas melalui Arsip Murid.');
	try {
		await assertMuridIdentityConsistent(db, school.id, link.identityUid, muridId);
	} catch (cause) {
		if (cause instanceof MuridIdentityConflictError)
			error(
				409,
				'Identitas murid perlu diperiksa. Periksa hubungan identitas melalui Arsip Murid.'
			);
		throw cause;
	}
	return { user, school, student, uid: link.identityUid };
}

export async function loadStudentProfile(
	locals: App.Locals,
	muridId: number,
	options: { action?: 'read' | 'print'; asOf?: string } = {}
) {
	const ctx = await requireStudentProfileAccess(locals, muridId, options.action ?? 'read');
	const asOf = studentProfileDate(options.asOf ?? today(), 'Tanggal data');
	if (!asOf) error(400, 'Tanggal data belum diisi. Pilih tanggal yang akan digunakan.');
	await ensureKesehatanMuridSchema();
	const profile = await db.query.tableMuridProfilTambahan.findFirst({
		where: and(eq(profiles.sekolahId, ctx.school.id), eq(profiles.identityUid, ctx.uid))
	});
	const student = await db.query.tableMurid.findFirst({
		where: and(eq(tableMurid.id, muridId), eq(tableMurid.sekolahId, ctx.school.id)),
		with: { alamat: true, ayah: true, ibu: true, wali: true, kelas: true }
	});
	const members = await db.query.tableMuridIdentityLink.findMany({
		columns: { muridId: true },
		where: and(
			eq(tableMuridIdentityLink.sekolahId, ctx.school.id),
			eq(tableMuridIdentityLink.identityUid, ctx.uid)
		)
	});
	const health = await db.query.tableKesehatanMurid.findFirst({
		columns: {
			tanggalPengukuran: true,
			kondisiFisik: true,
			ukuranBaju: true,
			ukuranCelana: true,
			ukuranSepatu: true
		},
		where: and(
			eq(tableKesehatanMurid.sekolahId, ctx.school.id),
			inArray(
				tableKesehatanMurid.muridId,
				members.map((row) => row.muridId)
			),
			lte(tableKesehatanMurid.tanggalPengukuran, asOf)
		),
		orderBy: [desc(tableKesehatanMurid.tanggalPengukuran), desc(tableKesehatanMurid.id)]
	});
	// Never expose storage paths or hashes in data destined for a page load.
	const photoList = profile
		? await db
				.select({ id: photos.id, jenis: photos.jenis, updatedAt: photos.updatedAt })
				.from(photos)
				.where(and(eq(photos.profilId, profile.id), eq(photos.sekolahId, ctx.school.id)))
		: [];
	return { student, profile: profile ?? null, health: health ?? null, photos: photoList, asOf };
}

export async function saveStudentProfile(
	locals: App.Locals,
	muridId: number,
	input: unknown,
	expectedRevision: number,
	request?: Request
) {
	const ctx = await requireStudentProfileAccess(locals, muridId, 'edit');
	if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
		error(400, 'Versi profil tidak valid. Muat ulang formulir sebelum menyimpan.');
	const patch = validateStudentProfilePatch(input);
	if (!Object.keys(patch).length) error(400, 'Belum ada perubahan profil untuk disimpan.');
	return db.transaction(async (tx) => {
		const existing = await tx.query.tableMuridProfilTambahan.findFirst({
			where: and(eq(profiles.sekolahId, ctx.school.id), eq(profiles.identityUid, ctx.uid))
		});
		if ((existing?.revisi ?? 0) !== expectedRevision)
			error(409, 'Profil telah diperbarui pengguna lain. Muat ulang sebelum menyimpan kembali.');
		const merged: StudentProfileValues = { ...emptyStudentProfile, ...existing, ...patch };
		validateStudentProfileConsistency(merged);
		for (const date of [merged.tanggalPendataan, merged.tanggalSuratPernyataan])
			if (date && date > today())
				error(400, 'Tanggal pendataan atau penandatanganan tidak boleh melewati hari ini.');
		let surveyorName = existing?.petugasPendataanNama ?? null;
		if (Object.hasOwn(patch, 'petugasPendataanId')) {
			surveyorName = null;
			if (patch.petugasPendataanId) {
				const surveyor = await tx.query.tablePegawai.findFirst({
					columns: { nama: true },
					where: and(
						eq(tablePegawai.id, patch.petugasPendataanId),
						eq(tablePegawai.sekolahId, ctx.school.id),
						eq(tablePegawai.status, 'aktif')
					)
				});
				if (!surveyor) error(400, 'Pilih petugas pendataan yang masih aktif di sekolah ini.');
				surveyorName = surveyor.nama;
			}
		}
		const values = {
			...patch,
			petugasPendataanNama: surveyorName,
			updatedBy: ctx.user.id,
			updatedAt: new Date().toISOString(),
			revisi: expectedRevision + 1
		};
		let saved;
		if (existing) {
			[saved] = await tx
				.update(profiles)
				.set(values)
				.where(
					and(
						eq(profiles.id, existing.id),
						eq(profiles.sekolahId, ctx.school.id),
						eq(profiles.revisi, expectedRevision)
					)
				)
				.returning();
		} else {
			[saved] = await tx
				.insert(profiles)
				.values({
					...values,
					sekolahId: ctx.school.id,
					identityUid: ctx.uid,
					createdBy: ctx.user.id
				})
				.onConflictDoNothing({ target: [profiles.sekolahId, profiles.identityUid] })
				.returning();
		}
		if (!saved)
			error(409, 'Profil telah diperbarui pengguna lain. Muat ulang sebelum menyimpan kembali.');
		await writeAuditLog(
			{
				locals,
				request,
				action: existing ? 'update' : 'create',
				entityType: 'murid_profil',
				entityId: saved.id,
				summary: 'Profil tambahan murid diperbarui',
				// Record field names and revisions, not KK, income, consent, or personal notes.
				after: { fields: Object.keys(patch), revision: saved.revisi }
			},
			tx
		);
		return { id: saved.id, revisi: saved.revisi };
	});
}
