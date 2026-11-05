import db from '$lib/server/db';
import type { AcademicContext } from '$lib/server/db/academic';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import { ensurePresensiSettingsSchema } from '$lib/server/db/ensure-presensi-settings';
import {
	tableKelas,
	tableMurid,
	tablePresensiSettings,
	tableSekolah,
	tableSemester,
	tableTahunAjaran,
	tableAuthUser
} from '$lib/server/db/schema';
import { cookieNames, unflattenFormData } from '$lib/utils';
import { error, fail } from '@sveltejs/kit';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { syncMuridGovernance } from '$lib/server/murid-lifecycle';
import { writeAuditLog } from '$lib/server/audit-log';
import { activeMuridFilter } from '$lib/server/murid-query';

type TahunAjaranRow = typeof tableTahunAjaran.$inferSelect;
type SemesterRow = typeof tableSemester.$inferSelect;

type CopySummary = {
	insertedKelas: number;
	updatedKelas: number;
	insertedMurid: number;
	skippedMurid: number;
	totalSourceMurid: number;
	totalSourceKelas: number;
};

async function copyKelasDanMuridDariGanjilKeGenap(opts: {
	sekolahId: number;
	sourceSemester: SemesterRow;
	targetSemester: SemesterRow;
}): Promise<CopySummary> {
	const timestamp = new Date().toISOString();

	return db.transaction(async (tx) => {
		const sourceKelas = await tx.query.tableKelas.findMany({
			where: and(
				eq(tableKelas.sekolahId, opts.sekolahId),
				eq(tableKelas.semesterId, opts.sourceSemester.id)
			),
			columns: {
				id: true,
				nama: true,
				fase: true,
				waliKelasId: true
			}
		});

		if (!sourceKelas.length) {
			return {
				insertedKelas: 0,
				updatedKelas: 0,
				updatedMurid: 0,
				insertedMurid: 0,
				skippedMurid: 0,
				totalSourceMurid: 0,
				totalSourceKelas: 0
			};
		}

		const targetKelas = await tx.query.tableKelas.findMany({
			where: and(
				eq(tableKelas.sekolahId, opts.sekolahId),
				eq(tableKelas.semesterId, opts.targetSemester.id)
			),
			columns: {
				id: true,
				nama: true,
				fase: true,
				waliKelasId: true
			}
		});

		const targetByName = new Map<string, (typeof targetKelas)[number]>();
		for (const kelas of targetKelas) {
			targetByName.set(kelas.nama.toLowerCase(), kelas);
		}

		const sourceToTarget = new Map<number, number>();
		let insertedKelas = 0;
		let updatedKelas = 0;

		for (const kelas of sourceKelas) {
			const key = kelas.nama.toLowerCase();
			const existing = targetByName.get(key);
			if (existing) {
				const needsUpdate =
					(existing.fase ?? '') !== (kelas.fase ?? '') ||
					(existing.waliKelasId ?? null) !== (kelas.waliKelasId ?? null);
				if (needsUpdate) {
					await tx
						.update(tableKelas)
						.set({
							fase: kelas.fase,
							waliKelasId: kelas.waliKelasId,
							updatedAt: timestamp
						})
						.where(eq(tableKelas.id, existing.id));
					updatedKelas += 1;
				}
				sourceToTarget.set(kelas.id, existing.id);
				continue;
			}

			const [inserted] = await tx
				.insert(tableKelas)
				.values({
					nama: kelas.nama,
					fase: kelas.fase,
					waliKelasId: kelas.waliKelasId,
					sekolahId: opts.sekolahId,
					tahunAjaranId: opts.targetSemester.tahunAjaranId,
					semesterId: opts.targetSemester.id,
					updatedAt: timestamp
				})
				.returning({ id: tableKelas.id });

			if (inserted) {
				sourceToTarget.set(kelas.id, inserted.id);
				insertedKelas += 1;
			}
		}

		let insertedMurid = 0;
		let skippedMurid = 0;
		let totalSourceMurid = 0;

		for (const [sourceId, targetId] of sourceToTarget) {
			const unit = (
				await tx.all<{ satuan_id: number; nama: string; npsn: string }>(
					sql`SELECT m.satuan_id,u.nama,u.npsn FROM kelas_satuan_pendidikan m JOIN sekolah_satuan_pendidikan u ON u.id=m.satuan_id WHERE m.kelas_id=${sourceId} AND u.sekolah_id=${opts.sekolahId}`
				)
			)[0];
			if (unit) {
				const targetUnit = (
					await tx.all<{ satuan_id: number }>(
						sql`SELECT satuan_id FROM kelas_satuan_pendidikan WHERE kelas_id=${targetId}`
					)
				)[0];
				if (targetUnit && targetUnit.satuan_id !== unit.satuan_id)
					throw new Error(
						'Satuan kelas tujuan berbeda dari sumber penyalinan semester. Periksa pemetaan terlebih dahulu.'
					);
				if (!targetUnit)
					await tx.run(
						sql`INSERT INTO kelas_satuan_pendidikan (kelas_id,satuan_id,nama_snapshot,npsn_snapshot,created_at) VALUES (${targetId},${unit.satuan_id},${unit.nama},${unit.npsn},${timestamp})`
					);
			}
			const sourceMuridList = await tx.query.tableMurid.findMany({
				where: and(
					eq(tableMurid.sekolahId, opts.sekolahId),
					eq(tableMurid.semesterId, opts.sourceSemester.id),
					eq(tableMurid.kelasId, sourceId),
					activeMuridFilter()
				)
			});
			totalSourceMurid += sourceMuridList.length;
			if (!sourceMuridList.length) continue;

			const existingTargetMurid = await tx.query.tableMurid.findMany({
				where: and(
					eq(tableMurid.sekolahId, opts.sekolahId),
					eq(tableMurid.semesterId, opts.targetSemester.id),
					eq(tableMurid.kelasId, targetId)
				),
				columns: { nis: true }
			});

			const existingNis = new Set(existingTargetMurid.map((row) => row.nis));
			const values: (typeof tableMurid.$inferInsert)[] = [];

			for (const murid of sourceMuridList) {
				if (existingNis.has(murid.nis)) {
					skippedMurid += 1;
					continue;
				}
				existingNis.add(murid.nis);
				values.push({
					sekolahId: opts.sekolahId,
					kelasId: targetId,
					semesterId: opts.targetSemester.id,
					nama: murid.nama,
					nis: murid.nis,
					nisn: murid.nisn,
					tempatLahir: murid.tempatLahir,
					tanggalLahir: murid.tanggalLahir,
					jenisKelamin: murid.jenisKelamin,
					agama: murid.agama,
					pendidikanSebelumnya: murid.pendidikanSebelumnya,
					tanggalMasuk: murid.tanggalMasuk,
					alamatId: murid.alamatId,
					ibuId: murid.ibuId,
					ayahId: murid.ayahId,
					waliId: murid.waliId,
					updatedAt: timestamp
				});
			}

			if (values.length) {
				const inserted = await tx
					.insert(tableMurid)
					.values(values)
					.returning({ id: tableMurid.id });
				await syncMuridGovernance(
					opts.sekolahId,
					inserted.map((row) => row.id),
					undefined,
					{},
					tx
				);
				insertedMurid += values.length;
			}
		}

		return {
			insertedKelas,
			updatedKelas,
			insertedMurid,
			skippedMurid,
			totalSourceMurid,
			totalSourceKelas: sourceKelas.length
		};
	});
}

export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('app:akademik');

	const meta: PageMeta = {
		title: 'Akademik',
		description: 'Kelola sekolah aktif, tahun ajaran, semester, presensi, dan jadwal pelajaran.'
	};

	const activeSekolahId = locals.sekolah?.id ?? null;
	let tahunAjaranList: Array<TahunAjaranRow & { semester: SemesterRow[] }> = [];
	let activeTahunAjaranId: number | null = null;
	let activeSemesterId: number | null = null;
	let tanggalBagiRaport: AcademicContext['tanggalBagiRaport'] = {};
	let tanggalMasuk: AcademicContext['tanggalMasuk'] = {};

	const [sekolahList, academicContext] = await Promise.all([
		db.query.tableSekolah.findMany({
			columns: { logo: false, logoDinas: false },
			orderBy: [desc(tableSekolah.id)]
		}),
		activeSekolahId ? resolveSekolahAcademicContext(activeSekolahId) : null
	]);

	if (academicContext) {
		({ tahunAjaranList, activeTahunAjaranId, activeSemesterId, tanggalBagiRaport, tanggalMasuk } =
			academicContext);
	}

	let presensiSettingsList: (typeof tablePresensiSettings.$inferSelect)[] = [];
	if (activeSekolahId) {
		await ensurePresensiSettingsSchema();
		presensiSettingsList = await db.query.tablePresensiSettings.findMany({
			where: eq(tablePresensiSettings.sekolahId, activeSekolahId)
		});
	}

	return {
		meta,
		sekolahList,
		activeSekolahId,
		tahunAjaranList,
		activeTahunAjaranId,
		activeSemesterId,
		tanggalBagiRaport,
		tanggalMasuk,
		presensiSettingsList
	};
};

export const actions: Actions = {
	switch: async ({ request, cookies, locals }) => {
		const formData = await request.formData();
		const sekolahIdRaw = formData.get('sekolahId');

		const sekolahId = Number(sekolahIdRaw);
		if (!sekolahIdRaw || Number.isNaN(sekolahId)) {
			error(400, 'Identitas sekolah tidak valid');
		}

		const sekolah = await db.query.tableSekolah.findFirst({
			columns: { id: true, nama: true },
			where: eq(tableSekolah.id, sekolahId)
		});

		if (!sekolah) {
			error(404, 'Data sekolah tidak ditemukan');
		}

		const secure = locals.requestIsSecure ?? false;
		cookies.set(cookieNames.ACTIVE_SEKOLAH_ID, String(sekolah.id), {
			path: '/',
			secure
		});
		locals.sekolahDirty = true;

		// Persist the selected sekolah on the user's account so admin users
		// will retain their last-active sekolah across server restarts.
		try {
			if (locals.user && (locals.user as { id?: number; type?: string }).type === 'admin') {
				await db
					.update(tableAuthUser)
					.set({ sekolahId: sekolah.id })
					.where(eq(tableAuthUser.id, Number((locals.user as { id?: number }).id)));
			}
		} catch (err) {
			console.warn('[akademik.switch] failed to persist sekolahId to user record', err);
		}

		const context = await resolveSekolahAcademicContext(sekolah.id);

		return {
			message: `Sekolah aktif: ${sekolah.nama}`,
			activeSekolahId: sekolah.id,
			...context
		};
	},
	save: async ({ request, locals }) => {
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) {
			return fail(400, { fail: 'Pilih sekolah terlebih dahulu' });
		}

		const formData = await request.formData();
		const tahunAjaranIdRaw = formData.get('tahunAjaranId');
		const semesterIdRaw = formData.get('semesterId');
		const tahunAjaranCandidate = Number(tahunAjaranIdRaw);
		const semesterCandidate = Number(semesterIdRaw);
		const hasSemester = Number.isFinite(semesterCandidate) && semesterCandidate > 0;
		const hasTahunAjaran = Number.isFinite(tahunAjaranCandidate) && tahunAjaranCandidate > 0;

		const resolvedTahunAjaranId: number | null = hasTahunAjaran ? tahunAjaranCandidate : null;
		const resolvedSemesterId: number | null = hasSemester ? semesterCandidate : null;

		let semesterRecord:
			(typeof tableSemester.$inferSelect & { tahunAjaran: TahunAjaranRow }) | null = null;
		let tahunAjaranRecord:
			(typeof tableTahunAjaran.$inferSelect & { semester: SemesterRow[] }) | null = null;

		if (resolvedSemesterId) {
			const semesterRow = await db.query.tableSemester.findFirst({
				where: eq(tableSemester.id, resolvedSemesterId),
				with: { tahunAjaran: true }
			});

			if (!semesterRow || semesterRow.tahunAjaran.sekolahId !== sekolahId) {
				return fail(404, { fail: 'Data semester tidak ditemukan.' });
			}

			if (hasTahunAjaran && semesterRow.tahunAjaranId !== tahunAjaranCandidate) {
				return fail(400, { fail: 'Semester tidak sesuai dengan tahun ajaran yang dipilih.' });
			}

			semesterRecord = semesterRow;
		} else if (resolvedTahunAjaranId) {
			const tahunAjaranRow = await db.query.tableTahunAjaran.findFirst({
				where: and(
					eq(tableTahunAjaran.id, resolvedTahunAjaranId),
					eq(tableTahunAjaran.sekolahId, sekolahId)
				),
				with: { semester: true }
			});

			if (!tahunAjaranRow) {
				return fail(404, { fail: 'Data tahun ajaran tidak ditemukan.' });
			}
			tahunAjaranRecord = tahunAjaranRow;
		}

		const fileField = formData.get('data') ?? formData.get('file');
		if (fileField instanceof File && fileField.size > 0) {
			return fail(400, {
				fail: 'Gunakan Pratinjau impor pada bagian Impor data siswa sebelum menyimpan file.'
			});
		}

		if (semesterRecord) {
			const semesterRow = semesterRecord;
			await db.transaction(async (tx) => {
				await tx
					.update(tableTahunAjaran)
					.set({ isAktif: false })
					.where(eq(tableTahunAjaran.sekolahId, sekolahId));
				await tx
					.update(tableTahunAjaran)
					.set({ isAktif: true })
					.where(eq(tableTahunAjaran.id, semesterRow.tahunAjaranId));
				await tx
					.update(tableSemester)
					.set({ isAktif: false })
					.where(eq(tableSemester.tahunAjaranId, semesterRow.tahunAjaranId));
				await tx
					.update(tableSemester)
					.set({ isAktif: true })
					.where(eq(tableSemester.id, semesterRow.id));
			});
		} else if (tahunAjaranRecord) {
			const tahunRow = tahunAjaranRecord;
			await db.transaction(async (tx) => {
				await tx
					.update(tableTahunAjaran)
					.set({ isAktif: false })
					.where(eq(tableTahunAjaran.sekolahId, sekolahId));
				await tx
					.update(tableTahunAjaran)
					.set({ isAktif: true })
					.where(eq(tableTahunAjaran.id, tahunRow.id));

				if (!tahunRow.semester.some((item) => item.isAktif)) {
					const ganjil = tahunRow.semester.find((item) => item.tipe === 'ganjil');
					if (ganjil) {
						await tx
							.update(tableSemester)
							.set({ isAktif: true })
							.where(eq(tableSemester.id, ganjil.id));
					}
				}
			});
		}

		const form = unflattenFormData<{
			ganjil?: { id?: string; tanggalBagiRaport?: string; tanggalMasuk?: string };
			genap?: { id?: string; tanggalBagiRaport?: string; tanggalMasuk?: string };
		}>(formData);

		const ids = [form.ganjil?.id, form.genap?.id]
			.map((value) => Number(value))
			.filter((value) => Number.isFinite(value) && value > 0) as number[];

		if (ids.length) {
			const semesterList = await db.query.tableSemester.findMany({
				where: inArray(tableSemester.id, ids),
				with: { tahunAjaran: true }
			});

			for (const semester of semesterList) {
				if (semester.tahunAjaran.sekolahId !== sekolahId) {
					return fail(403, { fail: 'Semester tidak sesuai dengan sekolah aktif' });
				}
			}

			await db.transaction(async (tx) => {
				for (const semester of semesterList) {
					const tipe = semester.tipe as 'ganjil' | 'genap';
					const tanggal = form[tipe]?.tanggalBagiRaport?.trim() || null;
					const tanggalMasukVal = form[tipe]?.tanggalMasuk?.trim() || null;
					await tx
						.update(tableSemester)
						.set({ tanggalBagiRaport: tanggal, tanggalMasuk: tanggalMasukVal })
						.where(eq(tableSemester.id, semester.id));
				}
			});
		}

		const context = await resolveSekolahAcademicContext(sekolahId);

		return {
			message: 'Pengaturan tersimpan',
			activeSekolahId: sekolahId,
			...context
		};
	},
	'copy-semester': async ({ request, locals }) => {
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) {
			return fail(400, { fail: 'Pilih sekolah terlebih dahulu' });
		}

		const formData = await request.formData();
		const targetSemesterId = Number(formData.get('targetSemesterId'));
		const sourceSemesterIdRaw = formData.get('sourceSemesterId');
		const sourceSemesterId = sourceSemesterIdRaw ? Number(sourceSemesterIdRaw) : null;

		if (!Number.isFinite(targetSemesterId) || targetSemesterId <= 0) {
			return fail(400, { fail: 'Semester tujuan tidak valid.' });
		}

		const targetSemester = await db.query.tableSemester.findFirst({
			where: eq(tableSemester.id, targetSemesterId),
			with: { tahunAjaran: true }
		});

		if (!targetSemester || targetSemester.tahunAjaran.sekolahId !== sekolahId) {
			return fail(404, { fail: 'Semester tujuan tidak ditemukan.' });
		}

		if (targetSemester.tipe !== 'genap') {
			return fail(400, { fail: 'Penyalinan hanya tersedia untuk semester genap.' });
		}

		let sourceSemester:
			(typeof tableSemester.$inferSelect & { tahunAjaran: TahunAjaranRow }) | null;

		if (Number.isFinite(sourceSemesterId) && (sourceSemesterId ?? 0) > 0) {
			const candidate = await db.query.tableSemester.findFirst({
				where: eq(tableSemester.id, Number(sourceSemesterId)),
				with: { tahunAjaran: true }
			});

			if (
				!candidate ||
				candidate.tipe !== 'ganjil' ||
				candidate.tahunAjaranId !== targetSemester.tahunAjaranId ||
				candidate.tahunAjaran.sekolahId !== sekolahId
			) {
				return fail(404, { fail: 'Semester ganjil sumber tidak valid.' });
			}

			sourceSemester = candidate ?? null;
		} else {
			const fetched = await db.query.tableSemester.findFirst({
				where: and(
					eq(tableSemester.tahunAjaranId, targetSemester.tahunAjaranId),
					eq(tableSemester.tipe, 'ganjil')
				),
				with: { tahunAjaran: true }
			});
			sourceSemester = fetched ?? null;
		}

		if (!sourceSemester || sourceSemester.tahunAjaran.sekolahId !== sekolahId) {
			return fail(404, { fail: 'Semester ganjil sumber tidak ditemukan.' });
		}

		if (sourceSemester.id === targetSemester.id) {
			return fail(400, { fail: 'Semester tujuan tidak boleh sama dengan semester sumber.' });
		}

		const summary = await copyKelasDanMuridDariGanjilKeGenap({
			sekolahId,
			sourceSemester,
			targetSemester
		});
		const targetMurid = await db.query.tableMurid.findMany({
			columns: { id: true },
			where: and(eq(tableMurid.sekolahId, sekolahId), eq(tableMurid.semesterId, targetSemester.id))
		});
		await syncMuridGovernance(
			sekolahId,
			targetMurid.map((murid) => murid.id)
		);
		await writeAuditLog({
			locals,
			request,
			action: 'promote',
			entityType: 'semester',
			entityId: targetSemester.id,
			summary: `Penyalinan semester memproses ${summary.insertedMurid} murid dan ${summary.insertedKelas} kelas baru.`,
			after: summary
		});

		if (summary.totalSourceKelas === 0) {
			return fail(400, { fail: 'Tidak ada kelas pada semester ganjil untuk disalin.' });
		}

		const context = await resolveSekolahAcademicContext(sekolahId);

		const kelasParts: string[] = [];
		if (summary.insertedKelas) {
			kelasParts.push(`${summary.insertedKelas} kelas baru`);
		}
		if (summary.updatedKelas) {
			kelasParts.push(`${summary.updatedKelas} kelas diperbarui`);
		}

		const kelasInfo = kelasParts.length ? kelasParts.join(', ') : 'Tidak ada perubahan kelas';
		const muridInfo = summary.insertedMurid
			? `${summary.insertedMurid} murid disalin`
			: 'Tidak ada murid yang disalin';
		const skippedInfo = summary.skippedMurid
			? ` ${summary.skippedMurid} murid dilewati karena sudah ada pada semester genap.`
			: '';

		return {
			message: `Penyalinan semester selesai. ${kelasInfo}. ${muridInfo}.${skippedInfo}`,
			activeSekolahId: sekolahId,
			...context
		};
	},
	'set-tahun-ajaran': async ({ request, locals }) => {
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) {
			return fail(400, { fail: 'Pilih sekolah terlebih dahulu' });
		}

		const formData = await request.formData();
		const tahunAjaranId = Number(formData.get('tahunAjaranId'));
		if (!tahunAjaranId) {
			return fail(400, { fail: 'Tahun ajaran tidak valid' });
		}

		const tahunAjaran = await db.query.tableTahunAjaran.findFirst({
			where: and(eq(tableTahunAjaran.id, tahunAjaranId), eq(tableTahunAjaran.sekolahId, sekolahId)),
			with: { semester: true }
		});

		if (!tahunAjaran) {
			return fail(404, { fail: 'Data tahun ajaran tidak ditemukan' });
		}

		await db.transaction(async (tx) => {
			await tx
				.update(tableTahunAjaran)
				.set({ isAktif: false })
				.where(eq(tableTahunAjaran.sekolahId, sekolahId));
			await tx
				.update(tableTahunAjaran)
				.set({ isAktif: true })
				.where(eq(tableTahunAjaran.id, tahunAjaranId));

			if (!tahunAjaran.semester.some((item) => item.isAktif)) {
				const ganjil = tahunAjaran.semester.find((item) => item.tipe === 'ganjil');
				if (ganjil) {
					await tx
						.update(tableSemester)
						.set({ isAktif: true })
						.where(eq(tableSemester.id, ganjil.id));
				}
			}
		});

		return { message: 'Tahun ajaran aktif diperbarui' };
	},
	'set-semester': async ({ request, locals }) => {
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) {
			return fail(400, { fail: 'Pilih sekolah terlebih dahulu' });
		}

		const formData = await request.formData();
		const semesterId = Number(formData.get('semesterId'));
		if (!semesterId) {
			return fail(400, { fail: 'Semester tidak valid' });
		}

		const semester = await db.query.tableSemester.findFirst({
			where: eq(tableSemester.id, semesterId),
			with: {
				tahunAjaran: true
			}
		});

		if (!semester || semester.tahunAjaran.sekolahId !== sekolahId) {
			return fail(404, { fail: 'Data semester tidak ditemukan' });
		}

		await db.transaction(async (tx) => {
			await tx
				.update(tableTahunAjaran)
				.set({ isAktif: false })
				.where(eq(tableTahunAjaran.sekolahId, sekolahId));
			await tx
				.update(tableTahunAjaran)
				.set({ isAktif: true })
				.where(eq(tableTahunAjaran.id, semester.tahunAjaranId));
			await tx
				.update(tableSemester)
				.set({ isAktif: false })
				.where(eq(tableSemester.tahunAjaranId, semester.tahunAjaranId));
			await tx.update(tableSemester).set({ isAktif: true }).where(eq(tableSemester.id, semesterId));
		});

		return { message: 'Semester aktif diperbarui' };
	},
	'update-rapor': async ({ request, locals }) => {
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) {
			return fail(400, { fail: 'Pilih sekolah terlebih dahulu' });
		}

		const formData = await request.formData();
		const form = unflattenFormData<{
			ganjil?: { id?: string; tanggalBagiRaport?: string; tanggalMasuk?: string };
			genap?: { id?: string; tanggalBagiRaport?: string; tanggalMasuk?: string };
		}>(formData);

		const ids = [form.ganjil?.id, form.genap?.id]
			.map((value) => Number(value))
			.filter((value) => Number.isFinite(value)) as number[];

		if (!ids.length) {
			return fail(400, { fail: 'Tidak ada semester yang diperbarui' });
		}

		const semesterList = await db.query.tableSemester.findMany({
			where: inArray(tableSemester.id, ids),
			with: { tahunAjaran: true }
		});

		for (const semester of semesterList) {
			if (semester.tahunAjaran.sekolahId !== sekolahId) {
				return fail(403, { fail: 'Semester tidak sesuai dengan sekolah aktif' });
			}
		}

		await db.transaction(async (tx) => {
			for (const semester of semesterList) {
				const tipe = semester.tipe as 'ganjil' | 'genap';
				const tanggal = form[tipe]?.tanggalBagiRaport?.trim() || null;
				const tanggalMasukVal = form[tipe]?.tanggalMasuk?.trim() || null;
				await tx
					.update(tableSemester)
					.set({ tanggalBagiRaport: tanggal, tanggalMasuk: tanggalMasukVal })
					.where(eq(tableSemester.id, semester.id));
			}
		});

		return { message: 'Tanggal bagi rapor diperbarui' };
	},
	savePresensiSettings: async ({ request, locals }) => {
		const sekolahId = locals.sekolah?.id ?? null;
		if (!sekolahId) {
			return fail(401, { fail: 'Sekolah tidak ditemukan' });
		}

		if (!canAttendance(locals.user, 'pengaturan')) {
			return fail(403, { fail: 'Anda tidak memiliki izin untuk mengubah pengaturan presensi' });
		}

		const formData = await request.formData();
		const tahunAjaranId = Number(formData.get('tahunAjaranId'));
		if (!tahunAjaranId) {
			return fail(400, { fail: 'Tahun ajaran tidak valid' });
		}

		const tahunAjaran = await db.query.tableTahunAjaran.findFirst({
			where: and(eq(tableTahunAjaran.id, tahunAjaranId), eq(tableTahunAjaran.sekolahId, sekolahId))
		});
		if (!tahunAjaran) {
			return fail(404, { fail: 'Data tahun ajaran tidak ditemukan' });
		}

		const jamMasuk = formData.get('jamMasuk')?.toString().trim() ?? '';
		const jamPulang = formData.get('jamPulang')?.toString().trim() ?? '';
		const hariSekolahRaw = formData.get('hariSekolah')?.toString().trim() ?? '';
		const tipePresensi = formData.get('tipePresensi')?.toString().trim() ?? '';
		const liburNasionalRaw = formData.get('liburNasional')?.toString() ?? '[]';

		let liburNasionalParsed: string[] = [];
		try {
			const parsed = JSON.parse(liburNasionalRaw);
			if (Array.isArray(parsed)) {
				liburNasionalParsed = parsed.filter(
					(d: unknown) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
				);
			}
		} catch {
			// invalid JSON, use empty array
		}
		const liburNasional = JSON.stringify(liburNasionalParsed);

		const liburSemesterRaw = formData.get('liburSemester')?.toString() ?? '[]';
		let liburSemesterParsed: Array<{ start: string; end: string }> = [];
		try {
			const parsed = JSON.parse(liburSemesterRaw);
			if (Array.isArray(parsed)) {
				liburSemesterParsed = parsed.filter(
					(d: unknown) =>
						typeof d === 'object' &&
						d !== null &&
						'start' in d &&
						'end' in d &&
						/^\d{4}-\d{2}-\d{2}$/.test((d as { start: string }).start) &&
						/^\d{4}-\d{2}-\d{2}$/.test((d as { end: string }).end) &&
						(d as { start: string; end: string }).start <= (d as { start: string; end: string }).end
				) as Array<{ start: string; end: string }>;
			}
		} catch {
			// invalid JSON, use empty array
		}
		const liburSemester = JSON.stringify(liburSemesterParsed);

		const timeRegex = /^\d{2}:\d{2}$/;
		if (!jamMasuk || !timeRegex.test(jamMasuk)) {
			return fail(400, { fail: 'Jam masuk harus diisi dengan format HH:mm' });
		}
		if (!jamPulang || !timeRegex.test(jamPulang)) {
			return fail(400, { fail: 'Jam pulang harus diisi dengan format HH:mm' });
		}
		if (jamMasuk >= jamPulang) {
			return fail(400, { fail: 'Jam masuk harus lebih awal dari jam pulang' });
		}

		const hariSekolah = Number(hariSekolahRaw);
		if (!Number.isInteger(hariSekolah) || ![5, 6].includes(hariSekolah)) {
			return fail(400, { fail: 'Hari sekolah tidak valid' });
		}

		const validTipe = ['masuk_pulang', 'masuk_saja', 'awal_mapel', 'awal_akhir_mapel'];
		const tipePresensiEnum = tipePresensi as
			'masuk_pulang' | 'masuk_saja' | 'awal_mapel' | 'awal_akhir_mapel';
		if (!validTipe.includes(tipePresensiEnum)) {
			return fail(400, { fail: 'Tipe presensi tidak valid' });
		}

		const jenisPresensi = formData.get('jenisPresensi')?.toString().trim() ?? 'wali_kelas_saja';
		const presensiPegawaiEnabled = formData.get('presensiPegawaiEnabled') !== '0';
		const jenisPresensiEnum = jenisPresensi as 'wali_kelas_saja' | 'tiap_mapel';
		if (!['wali_kelas_saja', 'tiap_mapel'].includes(jenisPresensiEnum)) {
			return fail(400, { fail: 'Jenis presensi tidak valid' });
		}

		if (jenisPresensiEnum === 'tiap_mapel') {
			const jadwalCount = await db.$client.execute({
				sql: `SELECT COUNT(*) as cnt FROM jadwal_pelajaran WHERE sekolah_id = ?`,
				args: [sekolahId]
			});
			const row = (jadwalCount.rows as unknown as Array<{ cnt: number }>)[0];
			if (!row || Number(row.cnt) === 0) {
				return fail(400, {
					fail: 'Jadwal pelajaran harus diisi terlebih dahulu agar dapat menggunakan presensi tiap mapel'
				});
			}
		} else if (['awal_mapel', 'awal_akhir_mapel'].includes(tipePresensiEnum)) {
			return fail(400, {
				fail: 'Tipe presensi Awal/Awal & Akhir Mapel hanya tersedia untuk jenis presensi Tiap Mapel'
			});
		}

		await ensurePresensiSettingsSchema();

		await db
			.insert(tablePresensiSettings)
			.values({
				sekolahId,
				tahunAjaranId,
				jamMasuk,
				jamPulang,
				hariSekolah,
				tipePresensi: tipePresensiEnum,
				jenisPresensi: jenisPresensiEnum,
				liburNasional,
				liburSemester,
				presensiPegawaiEnabled,
				updatedAt: new Date().toISOString()
			})
			.onConflictDoUpdate({
				target: [tablePresensiSettings.sekolahId, tablePresensiSettings.tahunAjaranId],
				set: {
					jamMasuk,
					jamPulang,
					hariSekolah,
					tipePresensi: tipePresensiEnum,
					jenisPresensi: jenisPresensiEnum,
					liburNasional,
					liburSemester,
					presensiPegawaiEnabled,
					updatedAt: new Date().toISOString()
				}
			});

		return { message: 'Pengaturan presensi berhasil disimpan' };
	}
};
import { canAttendance } from '$lib/attendance-access';
