import { randomBytes, createHash } from 'node:crypto';
import { error } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';
import db from './db';
import {
	tableAuthUser,
	tableAuthUserKelas,
	tableAuthUserMataPelajaran,
	tablePegawai,
	tableKelas,
	tableMataPelajaran,
	tableMurid,
	tableSekolah
} from './db/schema';
import { resolveSekolahAcademicContext } from './db/academic';
import { activeMuridFilter } from './murid-query';
import { hashPassword } from './auth';
import { writeAuditLog } from './audit-log';
import { ensureDataGovernanceSchema } from './db/ensure-data-governance';
import { ensurePenggunaIdentitySchema } from './db/ensure-pengguna';
import { defaultPermissionsForType, effectivePermissions } from '../../routes/pengguna/permissions';
import { resolveUserRole } from '../user-role';
import {
	BULK_USER_LIMIT,
	classifyBulkCandidate,
	normalizedEmployeeName,
	proposeBulkUsername,
	type BulkUserCandidate,
	type BulkUserPreview,
	type BulkUserResult,
	type BulkUserRole
} from '../bulk-user';

type UserDatabase = typeof db | DBTransaction;

export function requireBulkUserAdmin(locals: App.Locals) {
	if (locals.user?.type !== 'admin') throw error(403, 'Akun massal hanya dapat dibuat oleh admin.');
	if (!locals.sekolah?.id) throw error(400, 'Sekolah aktif tidak ditemukan.');
	return locals.sekolah.id;
}

export async function buildBulkUserPreview(
	sekolahId: number,
	role: BulkUserRole,
	source: UserDatabase = db
): Promise<BulkUserPreview> {
	const resolvedRole = resolveUserRole(role);
	if (!resolvedRole) throw error(400, 'Role pengguna tidak valid.');
	const requiresAcademicAssignment = !['tim_dapur', 'operator'].includes(role);
	const academic = await resolveSekolahAcademicContext(sekolahId, source);
	const employees = await source.query.tablePegawai.findMany({
		columns: { id: true, nama: true, jenis: true, status: true },
		where: eq(tablePegawai.sekolahId, sekolahId),
		orderBy: [asc(tablePegawai.nama), asc(tablePegawai.id)]
	});
	// Usernames are globally unique; account links outside this school also prevent duplicates.
	const users = await source.query.tableAuthUser.findMany({
		columns: { pegawaiId: true, username: true, usernameNormalized: true }
	});
	const semesterId = academic.activeSemesterId;
	const classes = semesterId
		? await source.query.tableKelas.findMany({
				columns: { id: true, nama: true, waliKelasId: true },
				where: and(eq(tableKelas.sekolahId, sekolahId), eq(tableKelas.semesterId, semesterId)),
				orderBy: [asc(tableKelas.nama), asc(tableKelas.id)]
			})
		: [];
	const classIds = classes.map((row) => row.id);
	const subjects = classIds.length
		? await source.query.tableMataPelajaran.findMany({
				columns: { id: true, kelasId: true, pengampuId: true, nama: true },
				where: inArray(tableMataPelajaran.kelasId, classIds),
				orderBy: asc(tableMataPelajaran.id)
			})
		: [];
	const students =
		classIds.length && semesterId
			? await source.query.tableMurid.findMany({
					columns: { id: true, kelasId: true, waliAsuhNama: true, waliAsramaNama: true },
					where: and(
						eq(tableMurid.sekolahId, sekolahId),
						eq(tableMurid.semesterId, semesterId),
						inArray(tableMurid.kelasId, classIds),
						activeMuridFilter()
					),
					orderBy: asc(tableMurid.id)
				})
			: [];
	const school = await source.query.tableSekolah.findFirst({
		columns: { kepalaSekolahId: true },
		where: eq(tableSekolah.id, sekolahId)
	});
	const used = new Set(
		users.flatMap((row) => [row.username.toLowerCase(), row.usernameNormalized])
	);
	const nameCounts = new Map<string, number>();
	for (const employee of employees) {
		const name = normalizedEmployeeName(employee.nama);
		nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
	}
	const candidates: BulkUserCandidate[] = [];
	for (const employee of employees.filter(
		(row) => row.status === 'aktif' && row.jenis === (role === 'user' ? 'guru' : role)
	)) {
		const name = normalizedEmployeeName(employee.nama);
		const ownSubjects = subjects.filter((row) => row.pengampuId === employee.id);
		const ownClasses = classes.filter((row) => row.waliKelasId === employee.id);
		const asuh = students.filter((row) => normalizedEmployeeName(row.waliAsuhNama ?? '') === name);
		const asrama = students.filter(
			(row) => normalizedEmployeeName(row.waliAsramaNama ?? '') === name
		);
		const wards = role === 'wali_asuh' ? asuh : role === 'wali_asrama' ? asrama : [];
		const assignedClasses = new Set(
			role === 'user'
				? [...ownSubjects.map((row) => row.kelasId), ...ownClasses.map((row) => row.id)]
				: wards.map((row) => row.kelasId)
		);
		const otherResponsibilities: string[] = [];
		if (ownClasses.length)
			otherResponsibilities.push(`Wali kelas: ${ownClasses.map((row) => row.nama).join(', ')}.`);
		if (role !== 'user' && ownSubjects.length)
			otherResponsibilities.push('Juga tercatat sebagai pengampu mata pelajaran.');
		if (role !== 'wali_asuh' && asuh.length)
			otherResponsibilities.push(`Juga wali asuh ${asuh.length} murid.`);
		if (role !== 'wali_asrama' && asrama.length)
			otherResponsibilities.push(`Juga wali asrama ${asrama.length} murid.`);
		if (school?.kepalaSekolahId === employee.id)
			otherResponsibilities.push(
				'Tercatat sebagai kepala sekolah; Jabatan Akses harus diatur terpisah oleh admin.'
			);
		const accountNames = users
			.filter((row) => row.pegawaiId === employee.id)
			.map((row) => row.username);
		const classification = classifyBulkCandidate({
			name: employee.nama,
			accountNames,
			duplicateName: (nameCounts.get(name) ?? 0) > 1,
			assignmentCount: role === 'user' ? ownSubjects.length : wards.length,
			otherResponsibilities,
			activeSemester: !!semesterId,
			requiresAcademicAssignment
		});
		const kelasIds = [...assignedClasses].sort((a, b) => a - b);
		const permissions = effectivePermissions({
			...resolvedRole,
			permissions: defaultPermissionsForType(resolvedRole.type, { kelasCount: kelasIds.length })
		});
		const candidate: BulkUserCandidate = {
			pegawaiId: employee.id,
			nama: employee.nama,
			jenis: employee.jenis,
			role,
			username: accountNames[0] ?? proposeBulkUsername(role, employee.nama, employee.id, used),
			...classification,
			accountNames,
			kelasIds,
			mataPelajaranIds: role === 'user' ? ownSubjects.map((row) => row.id) : [],
			studentIds: role === 'user' ? [] : wards.map((row) => row.id),
			classes: classes.filter((row) => assignedClasses.has(row.id)).map((row) => row.nama),
			subjects: role === 'user' ? [...new Set(ownSubjects.map((row) => row.nama))] : [],
			permissions,
			fingerprint: ''
		};
		candidate.fingerprint = createHash('sha256')
			.update(JSON.stringify({ sekolahId, semesterId, ...candidate }))
			.digest('hex');
		candidates.push(candidate);
	}
	const year = academic.tahunAjaranList.find((row) => row.id === academic.activeTahunAjaranId);
	return {
		role,
		sekolahId,
		semesterId,
		periode:
			year && semesterId
				? `${year.nama} - ${academic.activeSemesterTipe === 'genap' ? 'Semester Genap' : 'Semester Ganjil'}`
				: 'Belum ada semester aktif',
		candidates
	};
}

export async function createBulkUsers(options: {
	locals: App.Locals;
	request: Request;
	role: BulkUserRole;
	selected: Array<{ pegawaiId: number; fingerprint: string }>;
	reviewedIds: number[];
}): Promise<BulkUserResult> {
	const sekolahId = requireBulkUserAdmin(options.locals);
	const selected = options.selected;
	if (
		!selected.length ||
		selected.length > BULK_USER_LIMIT ||
		new Set(selected.map((row) => row.pegawaiId)).size !== selected.length ||
		selected.some(
			(row) =>
				!Number.isSafeInteger(row.pegawaiId) ||
				row.pegawaiId <= 0 ||
				!/^[a-f0-9]{64}$/.test(row.fingerprint)
		)
	)
		throw error(400, `Pilih 1 sampai ${BULK_USER_LIMIT} pegawai yang valid.`);
	await ensurePenggunaIdentitySchema();
	await ensureDataGovernanceSchema();
	return db.transaction(async (tx) => {
		const preview = await buildBulkUserPreview(sekolahId, options.role, tx);
		const byId = new Map(preview.candidates.map((row) => [row.pegawaiId, row]));
		const result: BulkUserResult = { created: [], skipped: [] };
		const pending: BulkUserCandidate[] = [];
		// Validate the entire selection before writing any accounts.
		for (const selection of selected) {
			const candidate = byId.get(selection.pegawaiId);
			if (!candidate) throw error(403, 'Pegawai bukan pegawai aktif untuk sekolah dan role ini.');
			if (candidate.status === 'existing') {
				result.skipped.push({
					pegawaiId: candidate.pegawaiId,
					nama: candidate.nama,
					reason: 'Akun sudah ada; tidak diubah.'
				});
				continue;
			}
			if (candidate.fingerprint !== selection.fingerprint)
				throw error(409, 'Data atau username berubah sejak pratinjau. Muat ulang pratinjau.');
			if (candidate.status === 'blocked')
				throw error(409, `${candidate.nama}: ${candidate.reasons.join(' ')}`);
			if (candidate.status === 'review' && !options.reviewedIds.includes(candidate.pegawaiId))
				throw error(
					400,
					`Periksa tugas rangkap ${candidate.nama} dan konfirmasikan peninjauannya.`
				);
			pending.push(candidate);
		}
		const timestamp = new Date().toISOString();
		for (const candidate of pending) {
			const resolvedRole = resolveUserRole(candidate.role);
			if (!resolvedRole) throw error(400, 'Role pengguna tidak valid.');
			const password = `Kg9!${randomBytes(18).toString('base64url')}`;
			const { hash, salt } = hashPassword(password);
			const [created] = await tx
				.insert(tableAuthUser)
				.values({
					username: candidate.username,
					usernameNormalized: candidate.username.toLowerCase(),
					passwordHash: hash,
					passwordSalt: salt,
					passwordUpdatedAt: timestamp,
					mustChangePassword: true,
					sekolahId,
					pegawaiId: candidate.pegawaiId,
					...resolvedRole,
					kelasId: candidate.role === 'user' ? (candidate.kelasIds[0] ?? null) : null,
					mataPelajaranId: candidate.mataPelajaranIds[0] ?? null,
					permissions: defaultPermissionsForType(resolvedRole.type, {
						kelasCount: candidate.kelasIds.length
					}),
					createdAt: timestamp,
					updatedAt: timestamp
				})
				.returning({ id: tableAuthUser.id });
			if (candidate.role === 'user' && candidate.kelasIds.length)
				await tx.insert(tableAuthUserKelas).values(
					candidate.kelasIds.map((kelasId) => ({
						authUserId: created.id,
						kelasId,
						createdAt: timestamp,
						updatedAt: timestamp
					}))
				);
			if (candidate.mataPelajaranIds.length)
				await tx.insert(tableAuthUserMataPelajaran).values(
					candidate.mataPelajaranIds.map((mataPelajaranId) => ({
						authUserId: created.id,
						mataPelajaranId,
						createdAt: timestamp,
						updatedAt: timestamp
					}))
				);
			await writeAuditLog(
				{
					locals: options.locals,
					request: options.request,
					action: 'create',
					entityType: 'pengguna',
					entityId: created.id,
					summary: `Membuat akun massal ${candidate.username}`,
					after: {
						username: candidate.username,
						...resolvedRole,
						pegawaiId: candidate.pegawaiId,
						kelasIds: candidate.kelasIds,
						mataPelajaranIds: candidate.mataPelajaranIds,
						mustChangePassword: true,
						tugasRangkapDitinjau: candidate.status === 'review'
					}
				},
				tx
			);
			result.created.push({
				id: created.id,
				pegawaiId: candidate.pegawaiId,
				nama: candidate.nama,
				username: candidate.username,
				password,
				role: candidate.role
			});
		}
		return result;
	});
}
