import db from '$lib/server/db';
import { ensureJurnalMengajarSchema } from '$lib/server/db/ensure-jurnal-mengajar';
import {
	tableAuthUserKelas,
	tableAuthUserMataPelajaran,
	tableJadwalPelajaran,
	tableJadwalMapel,
	tableJurnalMengajar,
	tableKelas,
	tableMataPelajaran,
	tableTujuanPembelajaran
} from '$lib/server/db/schema';
import {
	describeJurnalSchedule,
	findJurnalScheduleEntries,
	loadJurnalScheduleContext,
	splitJurnalScheduleBlocks
} from '$lib/server/jurnal-mengajar';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { buildKelasContext } from '$lib/server/route-utils';

const PER_PAGE = 20;

function isValidDate(s: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
	const [y, m, d] = s.split('-').map(Number);
	const date = new Date(y, m - 1, d);
	return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export async function load({ locals, url, depends, parent }) {
	depends('app:jurnal-mengajar');
	await ensureJurnalMengajarSchema();

	const parentData = await parent();
	const { sekolahId, kelasId, kelasIds, academicContext } = await buildKelasContext(
		locals,
		parentData,
		url
	);

	const user = locals.user as {
		id?: number;
		type?: string;
		pegawaiId?: number | null;
		mataPelajaranId?: number | null;
	} | null;

	const tanggalParam = url.searchParams.get('tanggal');
	const today = new Date().toISOString().split('T')[0];
	const tanggal = tanggalParam && isValidDate(tanggalParam) ? tanggalParam : today;

	const requestedPage = Number(url.searchParams.get('page')) || 1;
	const pageNumber =
		Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;

	if (!sekolahId || !kelasIds.length) {
		return {
			meta: { title: 'Jurnal Mengajar' },
			academicContext,
			daftarJurnal: [],
			tujuanPembelajaranList: [],
			lingkupMateriList: [],
			mataPelajaranList: [],
			scheduleOptions: [],
			scheduleSummary: null,
			emptyScheduleMessage: 'Pilih kelas untuk melihat jadwal mengajar.',
			hasAnyMapel: false,
			mapelId: null,
			tanggal: null,
			scheduleContext: null,
			page: {
				kelasId,
				kelasNama: null,
				currentPage: 1,
				totalPages: 1,
				totalItems: 0,
				perPage: PER_PAGE
			}
		};
	}

	const userType = user?.type ?? '';
	const requestedJenis = url.searchParams.get('jenis_jadwal');
	const scheduleContext = academicContext
		? await loadJurnalScheduleContext(sekolahId, academicContext, tanggal, requestedJenis)
		: null;

	// Determine which mataPelajaranIds are available
	const kelasIdNum = kelasId ? Number(kelasId) : null;
	const effectiveKelasIds = kelasIdNum ? [kelasIdNum] : kelasIds;

	// Get all mata pelajaran for the relevant classes
	let mataPelajaranList: Array<{
		id: number;
		jadwalMapelId: number;
		mataPelajaranId: number | null;
		nama: string;
		kode: string | null;
	}> = [];
	let scheduleOptions: Array<{
		value: string;
		jadwalMapelId: number;
		mataPelajaranId: number | null;
		nama: string;
		jamPelajaran: string;
		pukul: string | null;
	}> = [];
	let mapelIds: number[] = [];

	let hasAnyMapel = false;
	let scheduleSummary: {
		hari: string;
		hariLabel: string;
		kelasNama: string;
		blokPelajaran: number;
		slotPelajaran: number;
		slotKegiatan: number;
		kegiatan: string[];
	} | null = null;

	if (userType === 'admin' || userType === 'wali_kelas' || userType === 'user') {
		let userMpIds: number[] = [];
		if (userType === 'user' && user?.mataPelajaranId) userMpIds.push(user.mataPelajaranId);
		if (userType === 'user' && user?.id) {
			const extra = await db.query.tableAuthUserMataPelajaran.findMany({
				columns: { mataPelajaranId: true },
				where: eq(tableAuthUserMataPelajaran.authUserId, user.id)
			});
			for (const e of extra) {
				if (!userMpIds.includes(e.mataPelajaranId)) userMpIds.push(e.mataPelajaranId);
			}
		}

		if (scheduleContext?.templateIds.length) {
			const dayNames = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
			const dateObj = new Date(tanggal + 'T00:00:00');
			const hari = dayNames[dateObj.getDay()];
			const tambahanKode = new Set(['IST', 'PLG']);

			const jadwalEntries = await db.query.tableJadwalPelajaran.findMany({
				columns: { kodeKegiatan: true, mataPelajaranId: true, jadwalMapelId: true },
				where: and(
					eq(tableJadwalPelajaran.sekolahId, sekolahId),
					inArray(tableJadwalPelajaran.kelasId, effectiveKelasIds),
					eq(tableJadwalPelajaran.hari, hari),
					eq(tableJadwalPelajaran.tipe, 'pelajaran'),
					inArray(tableJadwalPelajaran.templateId, scheduleContext.templateIds)
				)
			});
			const directGlobalIds = [
				...new Set(jadwalEntries.map((j) => j.jadwalMapelId).filter((id): id is number => !!id))
			];
			const directLegacyIds = [
				...new Set(jadwalEntries.map((j) => j.mataPelajaranId).filter((id): id is number => !!id))
			];
			const uniqueKode = [
				...new Set(
					jadwalEntries.map((j) => j.kodeKegiatan).filter((k) => !tambahanKode.has(k.toUpperCase()))
				)
			];

			if (directGlobalIds.length || directLegacyIds.length || uniqueKode.length) {
				const globalMapels = await db.query.tableJadwalMapel.findMany({
					columns: { id: true, kode: true, nama: true, guruPegawaiId: true },
					where: and(
						eq(tableJadwalMapel.sekolahId, sekolahId),
						directGlobalIds.length && uniqueKode.length
							? sql`(${inArray(tableJadwalMapel.id, directGlobalIds)} OR ${inArray(tableJadwalMapel.kode, uniqueKode)})`
							: directGlobalIds.length
								? inArray(tableJadwalMapel.id, directGlobalIds)
								: inArray(tableJadwalMapel.kode, uniqueKode)
					)
				});
				const legacyMapels = await db.query.tableMataPelajaran.findMany({
					columns: { id: true, kode: true, nama: true },
					where: and(
						inArray(tableMataPelajaran.kelasId, effectiveKelasIds),
						directLegacyIds.length && uniqueKode.length
							? sql`(${inArray(tableMataPelajaran.id, directLegacyIds)} OR ${inArray(tableMataPelajaran.kode, uniqueKode)})`
							: directLegacyIds.length
								? inArray(tableMataPelajaran.id, directLegacyIds)
								: inArray(tableMataPelajaran.kode, uniqueKode)
					)
				});
				const legacyByCode = new Map(
					legacyMapels.filter((item) => item.kode).map((item) => [item.kode!, item])
				);
				mataPelajaranList = globalMapels
					.filter(
						(mp) =>
							userType !== 'user' ||
							!user?.pegawaiId ||
							!mp.guruPegawaiId ||
							mp.guruPegawaiId === user.pegawaiId
					)
					.map((mp) => {
						const legacy = mp.kode ? legacyByCode.get(mp.kode) : null;
						return {
							id: mp.id,
							jadwalMapelId: mp.id,
							mataPelajaranId: legacy?.id ?? null,
							nama: mp.nama,
							kode: mp.kode
						};
					})
					.sort((a, b) => a.nama.localeCompare(b.nama));
				mapelIds = mataPelajaranList
					.map((mp) => mp.mataPelajaranId)
					.filter((id): id is number => !!id);
			}
		}
		hasAnyMapel = mataPelajaranList.length > 0;
		if (kelasIdNum && scheduleContext && mataPelajaranList.length) {
			const options = await Promise.all(
				mataPelajaranList.map(async (mapel) => {
					const entries = await findJurnalScheduleEntries({
						sekolahId,
						kelasId: kelasIdNum,
						tanggal,
						templateIds: scheduleContext.templateIds,
						jadwalMapelId: mapel.jadwalMapelId,
						kode: mapel.kode
					});
					return Promise.all(
						splitJurnalScheduleBlocks(entries).map(async (block) => {
							const description = await describeJurnalSchedule(block);
							return {
								value: block.map((entry) => entry.id).join(','),
								jadwalMapelId: mapel.jadwalMapelId,
								mataPelajaranId: mapel.mataPelajaranId,
								nama: mapel.nama,
								jamPelajaran: description.jamPelajaran,
								pukul: description.pukul
							};
						})
					);
				})
			);
			scheduleOptions = options.flat();
			hasAnyMapel = scheduleOptions.length > 0;
		}
	}

	if (kelasIdNum && scheduleContext) {
		const dayNames = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
		const hari = dayNames[new Date(`${tanggal}T00:00:00`).getDay()];
		const entries = scheduleContext.templateIds.length
			? await db.query.tableJadwalPelajaran.findMany({
					columns: { tipe: true, kodeKegiatan: true },
					where: and(
						eq(tableJadwalPelajaran.sekolahId, sekolahId),
						eq(tableJadwalPelajaran.kelasId, kelasIdNum),
						eq(tableJadwalPelajaran.hari, hari),
						inArray(tableJadwalPelajaran.templateId, scheduleContext.templateIds)
					)
				})
			: [];
		const kelasNama =
			(parentData.daftarKelas as Array<{ id: number; nama?: string }> | undefined)?.find(
				(item) => item.id === kelasIdNum
			)?.nama ?? `Kelas #${kelasIdNum}`;
		const kegiatan = [
			...new Set(
				entries
					.filter((entry) => entry.tipe !== 'pelajaran')
					.map((entry) => entry.kodeKegiatan)
					.filter((kode): kode is string => Boolean(kode))
			)
		];
		scheduleSummary = {
			hari,
			hariLabel: hari.charAt(0).toUpperCase() + hari.slice(1),
			kelasNama,
			blokPelajaran: scheduleOptions.length,
			slotPelajaran: entries.filter((entry) => entry.tipe === 'pelajaran').length,
			slotKegiatan: entries.filter((entry) => entry.tipe !== 'pelajaran').length,
			kegiatan
		};
	}

	const emptyScheduleMessage = !kelasIdNum
		? 'Pilih kelas untuk melihat jadwal mengajar.'
		: !scheduleContext?.templateIds.length
			? `Template ${scheduleContext?.jenisLabel ?? 'jadwal'} belum tersedia pada tahun ajaran ini.`
			: scheduleSummary?.slotKegiatan
				? `Tidak ada mata pelajaran kelas ${scheduleSummary.kelasNama} pada ${scheduleSummary.hariLabel}. Terdapat kegiatan non-mapel: ${scheduleSummary.kegiatan.join(', ') || `${scheduleSummary.slotKegiatan} slot`}.`
				: `Tidak ada mata pelajaran kelas ${scheduleSummary?.kelasNama ?? ''} pada ${scheduleSummary?.hariLabel ?? 'hari ini'}.`;

	// Get mapelId from URL param or default to first
	const mapelIdParam = url.searchParams.get('mapel_id');
	const mapelId =
		mapelIdParam && mataPelajaranList.some((item) => item.jadwalMapelId === Number(mapelIdParam))
			? Number(mapelIdParam)
			: (mataPelajaranList[0]?.jadwalMapelId ?? null);

	// Load Tujuan Pembelajaran for lingkupMateri + TP dropdowns
	const tujuanPembelajaranList = mapelIds.length
		? await db
				.select({
					id: tableTujuanPembelajaran.id,
					deskripsi: tableTujuanPembelajaran.deskripsi,
					lingkupMateri: tableTujuanPembelajaran.lingkupMateri,
					mataPelajaranId: tableTujuanPembelajaran.mataPelajaranId
				})
				.from(tableTujuanPembelajaran)
				.where(inArray(tableTujuanPembelajaran.mataPelajaranId, mapelIds))
				.orderBy(asc(tableTujuanPembelajaran.lingkupMateri))
		: [];

	const lingkupMateriSet = new Set<string>();
	for (const tp of tujuanPembelajaranList) {
		if (tp.lingkupMateri) lingkupMateriSet.add(tp.lingkupMateri);
	}
	const lingkupMateriList = Array.from(lingkupMateriSet).sort();

	// Count total journals
	const countFilter = and(
		eq(tableJurnalMengajar.authUserId, user?.id ?? 0),
		tanggal ? eq(tableJurnalMengajar.tanggal, tanggal) : undefined,
		scheduleContext ? eq(tableJurnalMengajar.jenisJadwal, scheduleContext.jenis) : undefined,
		kelasIdNum
			? eq(tableJurnalMengajar.kelasId, kelasIdNum)
			: inArray(tableJurnalMengajar.kelasId, kelasIds)
	);

	const [{ totalItems }] = await db
		.select({ totalItems: sql<number>`count(*)` })
		.from(tableJurnalMengajar)
		.where(countFilter);

	const total = totalItems ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
	const currentPage = Math.min(Math.max(pageNumber, 1), totalPages);
	const offset = (currentPage - 1) * PER_PAGE;

	if (pageNumber !== currentPage) {
		const params = new URLSearchParams(url.searchParams);
		if (currentPage <= 1) {
			params.delete('page');
		} else {
			params.set('page', String(currentPage));
		}
		throw redirect(303, `${url.pathname}${params.size ? `?${params}` : ''}`);
	}

	// Load journal entries with joins
	const rows = await db
		.select({
			id: tableJurnalMengajar.id,
			tanggal: tableJurnalMengajar.tanggal,
			jamPelajaran: tableJurnalMengajar.jamPelajaran,
			pukul: tableJurnalMengajar.pukul,
			jenisJadwal: tableJurnalMengajar.jenisJadwal,
			lingkupMateri: tableJurnalMengajar.lingkupMateri,
			tujuanPembelajaranManual: tableJurnalMengajar.tujuanPembelajaranManual,
			catatan: tableJurnalMengajar.catatan,
			mataPelajaranId: tableJurnalMengajar.mataPelajaranId,
			jadwalMapelId: tableJurnalMengajar.jadwalMapelId,
			jadwalPelajaranIds: tableJurnalMengajar.jadwalPelajaranIds,
			kelasNama: tableKelas.nama,
			mapelNamaLegacy: tableMataPelajaran.nama,
			mapelNamaJadwal: tableJadwalMapel.nama,
			tpDeskripsi: tableTujuanPembelajaran.deskripsi,
			tpId: tableTujuanPembelajaran.id,
			updatedAt: tableJurnalMengajar.updatedAt,
			kelasId: tableJurnalMengajar.kelasId
		})
		.from(tableJurnalMengajar)
		.leftJoin(tableKelas, eq(tableJurnalMengajar.kelasId, tableKelas.id))
		.leftJoin(tableMataPelajaran, eq(tableJurnalMengajar.mataPelajaranId, tableMataPelajaran.id))
		.leftJoin(tableJadwalMapel, eq(tableJurnalMengajar.jadwalMapelId, tableJadwalMapel.id))
		.leftJoin(
			tableTujuanPembelajaran,
			eq(tableJurnalMengajar.tujuanPembelajaranId, tableTujuanPembelajaran.id)
		)
		.where(countFilter)
		.orderBy(desc(tableJurnalMengajar.tanggal))
		.limit(PER_PAGE)
		.offset(offset);

	const daftarJurnal = rows.map((row, index) => ({
		id: row.id,
		tanggal: row.tanggal,
		jamPelajaran: row.jamPelajaran,
		pukul: row.pukul,
		jenisJadwal: row.jenisJadwal,
		lingkupMateri: row.lingkupMateri,
		catatan: row.catatan ?? '',
		mataPelajaranId: row.mataPelajaranId,
		jadwalMapelId: row.jadwalMapelId,
		jadwalPelajaranIds: row.jadwalPelajaranIds,
		kelasNama: row.kelasNama ?? '',
		mapelNama: row.mapelNamaJadwal ?? row.mapelNamaLegacy ?? '',
		tpDeskripsi: row.tpDeskripsi ?? row.tujuanPembelajaranManual ?? '',
		tpId: row.tpId,
		tujuanPembelajaranManual: row.tujuanPembelajaranManual ?? '',
		kelasId: row.kelasId,
		updatedAt: row.updatedAt,
		no: offset + index + 1
	}));

	return {
		meta: { title: 'Jurnal Mengajar' },
		academicContext,
		daftarJurnal,
		tujuanPembelajaranList,
		lingkupMateriList,
		mataPelajaranList,
		scheduleOptions,
		scheduleSummary,
		emptyScheduleMessage,
		hasAnyMapel,
		mapelId,
		tanggal,
		scheduleContext,
		userType,
		page: {
			kelasId,
			kelasNama:
				(parentData.daftarKelas as Array<{ id: number; nama?: string }> | undefined)?.find(
					(item) => item.id === Number(kelasId)
				)?.nama ?? null,
			currentPage,
			totalPages,
			totalItems: total,
			perPage: PER_PAGE
		}
	};
}

export const actions = {
	save: async ({ request, locals }) => {
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) {
			return fail(401, { fail: 'Sekolah tidak ditemukan' });
		}

		const user = locals.user as {
			id?: number;
			type?: string;
			pegawaiId?: number | null;
			mataPelajaranId?: number | null;
		} | null;
		if (!user?.id) {
			return fail(401, { fail: 'Anda harus login terlebih dahulu' });
		}

		if (user.type === 'wali_asuh') {
			return fail(403, { fail: 'Anda tidak memiliki izin untuk menulis jurnal mengajar.' });
		}

		await ensureJurnalMengajarSchema();

		const formData = await request.formData();
		const idRaw = formData.get('id');
		const kelasIdRaw = formData.get('kelasId');
		const mataPelajaranIdRaw = formData.get('mataPelajaranId');
		const jadwalMapelIdRaw = formData.get('jadwalMapelId');
		const lingkupMateri = ((formData.get('lingkupMateri') as string | null) ?? '').trim();
		const tujuanPembelajaranIdRaw = formData.get('tujuanPembelajaranId');
		const tujuanPembelajaranManual = (
			(formData.get('tujuanPembelajaranManual') as string | null) ?? ''
		).trim();
		const catatan = ((formData.get('catatan') as string | null) ?? '').trim();
		const tanggal = (formData.get('tanggal') as string | null) ?? '';
		const jenisJadwal = formData.get('jenisJadwal')?.toString() ?? null;
		const jadwalIds = (formData.get('jadwalIds')?.toString() ?? '')
			.split(',')
			.map(Number)
			.filter((value) => Number.isInteger(value) && value > 0);

		const kelasId = Number(kelasIdRaw);
		const mataPelajaranId = mataPelajaranIdRaw ? Number(mataPelajaranIdRaw) : null;
		const jadwalMapelId = jadwalMapelIdRaw ? Number(jadwalMapelIdRaw) : null;
		const tujuanPembelajaranId = tujuanPembelajaranIdRaw ? Number(tujuanPembelajaranIdRaw) : null;
		const id = idRaw ? Number(idRaw) : null;
		const existing = id
			? await db.query.tableJurnalMengajar.findFirst({
					columns: {
						id: true,
						authUserId: true,
						kelasId: true,
						mataPelajaranId: true,
						jadwalMapelId: true
					},
					where: eq(tableJurnalMengajar.id, id)
				})
			: null;

		if (!lingkupMateri) {
			return fail(400, { fail: 'Lingkup materi harus diisi' });
		}
		if (lingkupMateri.length > 500) {
			return fail(400, { fail: 'Lingkup materi maksimal 500 karakter' });
		}
		if (
			tujuanPembelajaranIdRaw &&
			(!Number.isInteger(tujuanPembelajaranId) || Number(tujuanPembelajaranId) <= 0)
		) {
			return fail(400, { fail: 'Tujuan pembelajaran tidak valid' });
		}
		if (tujuanPembelajaranManual.length > 500) {
			return fail(400, { fail: 'Tujuan pembelajaran maksimal 500 karakter' });
		}
		if (tujuanPembelajaranId && tujuanPembelajaranManual) {
			return fail(400, { fail: 'Pilih tujuan pembelajaran dari data atau isi manual' });
		}

		if (catatan.length > 300) {
			return fail(400, { fail: 'Catatan maksimal 300 karakter' });
		}

		if (!Number.isInteger(kelasId) || kelasId <= 0) {
			return fail(400, { fail: 'Kelas tidak valid' });
		}
		const kelasCheck = await db.query.tableKelas.findFirst({
			columns: { id: true, sekolahId: true, tahunAjaranId: true, semesterId: true },
			where: eq(tableKelas.id, kelasId)
		});
		if (!kelasCheck || kelasCheck.sekolahId !== sekolahId) {
			return fail(400, { fail: 'Kelas tidak valid' });
		}
		if (!id && (!Number.isInteger(jadwalMapelId) || Number(jadwalMapelId) <= 0)) {
			return fail(400, { fail: 'Mata pelajaran tidak valid' });
		}
		const effectiveJadwalMapelId = jadwalMapelId || existing?.jadwalMapelId || null;
		const effectiveMataPelajaranId = mataPelajaranId || existing?.mataPelajaranId || null;
		const jadwalMapel = effectiveJadwalMapelId
			? await db.query.tableJadwalMapel.findFirst({
					columns: { id: true, sekolahId: true, kode: true, nama: true, guruPegawaiId: true },
					where: eq(tableJadwalMapel.id, effectiveJadwalMapelId)
				})
			: null;
		if (!id && (!jadwalMapel || jadwalMapel.sekolahId !== sekolahId)) {
			return fail(400, { fail: 'Mata pelajaran tidak terdaftar di sekolah ini' });
		}
		if (effectiveMataPelajaranId) {
			const legacyMapel = await db.query.tableMataPelajaran.findFirst({
				columns: { id: true, kelasId: true },
				where: eq(tableMataPelajaran.id, effectiveMataPelajaranId)
			});
			if (!legacyMapel || legacyMapel.kelasId !== kelasId) {
				return fail(400, { fail: 'Data tujuan pembelajaran tidak sesuai dengan kelas' });
			}
		}
		if (!id && user.type === 'user') {
			const kelasAssignments = await db.query.tableAuthUserKelas.findMany({
				columns: { kelasId: true },
				where: eq(tableAuthUserKelas.authUserId, user.id)
			});
			const allowedKelas = kelasAssignments.some((item) => item.kelasId === kelasId);
			const allowedMapel =
				!jadwalMapel?.guruPegawaiId || jadwalMapel.guruPegawaiId === user.pegawaiId;
			if (!allowedKelas || !allowedMapel) {
				return fail(403, { fail: 'Mata pelajaran atau kelas tidak termasuk penugasan Anda' });
			}
		}

		if (tujuanPembelajaranId) {
			const tujuanPembelajaran = await db.query.tableTujuanPembelajaran.findFirst({
				columns: { mataPelajaranId: true, lingkupMateri: true },
				where: eq(tableTujuanPembelajaran.id, tujuanPembelajaranId)
			});
			if (
				!tujuanPembelajaran ||
				!effectiveMataPelajaranId ||
				tujuanPembelajaran.mataPelajaranId !== effectiveMataPelajaranId ||
				tujuanPembelajaran.lingkupMateri !== lingkupMateri
			) {
				return fail(400, { fail: 'Tujuan pembelajaran tidak sesuai mata pelajaran dan materi' });
			}
		}

		const now = new Date().toISOString();
		if (id) {
			if (
				!existing ||
				(existing.authUserId !== user.id && user.type !== 'admin' && user.type !== 'wali_kelas')
			) {
				return fail(404, { fail: 'Jurnal tidak ditemukan' });
			}

			await db
				.update(tableJurnalMengajar)
				.set({
					kelasId,
					mataPelajaranId: effectiveMataPelajaranId,
					jadwalMapelId: effectiveJadwalMapelId,
					lingkupMateri,
					tujuanPembelajaranId,
					tujuanPembelajaranManual: tujuanPembelajaranManual || null,
					catatan: catatan || null,
					updatedAt: now
				})
				.where(eq(tableJurnalMengajar.id, id));
		} else {
			if (!isValidDate(tanggal)) {
				return fail(400, { fail: 'Tanggal tidak valid' });
			}
			if (!jadwalMapel) return fail(400, { fail: 'Mata pelajaran tidak valid' });
			const academic = await resolveSekolahAcademicContext(sekolahId);
			const context = await loadJurnalScheduleContext(sekolahId, academic, tanggal, jenisJadwal);
			if (!context) return fail(400, { fail: 'Konteks tahun ajaran tidak ditemukan' });
			const availableEntries = await findJurnalScheduleEntries({
				sekolahId,
				kelasId,
				tanggal,
				templateIds: context.templateIds,
				jadwalMapelId: Number(jadwalMapelId),
				mataPelajaranId: mataPelajaranId ?? undefined,
				kode: jadwalMapel.kode
			});
			const jadwalEntries = availableEntries.filter((entry) => jadwalIds.includes(entry.id));
			if (!jadwalIds.length || jadwalEntries.length !== jadwalIds.length) {
				return fail(400, {
					fail: 'Blok jadwal tidak valid atau sudah berubah. Muat ulang halaman.'
				});
			}
			if (!jadwalEntries.length) {
				return fail(400, { fail: 'Tidak ada jadwal untuk mata pelajaran ini hari ini' });
			}
			const schedule = await describeJurnalSchedule(jadwalEntries);
			const duplicate = await db.query.tableJurnalMengajar.findFirst({
				columns: { id: true },
				where: and(
					eq(tableJurnalMengajar.authUserId, user.id),
					eq(tableJurnalMengajar.kelasId, kelasId),
					eq(tableJurnalMengajar.tanggal, tanggal),
					eq(tableJurnalMengajar.jadwalPelajaranIds, schedule.jadwalPelajaranIds)
				)
			});
			if (duplicate) return fail(409, { fail: 'Jurnal untuk blok jadwal ini sudah tersimpan' });

			await db.insert(tableJurnalMengajar).values({
				sekolahId,
				authUserId: user.id,
				kelasId,
				mataPelajaranId,
				jadwalMapelId: Number(jadwalMapelId),
				tahunAjaranId: context.tahunAjaranId,
				semesterId: context.semesterId,
				jenisJadwal: context.jenis,
				jadwalTemplateId: jadwalEntries[0]?.templateId ?? null,
				jadwalPelajaranIds: schedule.jadwalPelajaranIds,
				tanggal,
				jamPelajaran: schedule.jamPelajaran,
				pukul: schedule.pukul,
				lingkupMateri,
				tujuanPembelajaranId,
				tujuanPembelajaranManual: tujuanPembelajaranManual || null,
				catatan: catatan || null,
				updatedAt: now
			});
		}

		return { message: 'Jurnal tersimpan' };
	},

	delete: async ({ request, locals }) => {
		const user = locals.user as { id?: number; type?: string } | null;
		if (!user?.id) {
			return fail(401, { fail: 'Anda harus login terlebih dahulu' });
		}

		if (user.type === 'wali_asuh') {
			return fail(403, { fail: 'Anda tidak memiliki izin untuk menghapus jurnal.' });
		}

		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) {
			return fail(401, { fail: 'Sekolah tidak ditemukan' });
		}

		await ensureJurnalMengajarSchema();

		const formData = await request.formData();
		const idRaw = formData.get('id');
		const id = Number(idRaw);

		if (!Number.isInteger(id) || id <= 0) {
			return fail(400, { fail: 'ID jurnal tidak valid' });
		}

		const existing = await db.query.tableJurnalMengajar.findFirst({
			columns: { id: true, authUserId: true, kelasId: true },
			where: eq(tableJurnalMengajar.id, id)
		});
		if (
			!existing ||
			(existing.authUserId !== user.id && user.type !== 'admin' && user.type !== 'wali_kelas')
		) {
			return fail(404, { fail: 'Jurnal tidak ditemukan' });
		}

		const kelasCheck = await db.query.tableKelas.findFirst({
			columns: { id: true, sekolahId: true },
			where: eq(tableKelas.id, existing.kelasId)
		});
		if (!kelasCheck || kelasCheck.sekolahId !== sekolahId) {
			return fail(404, { fail: 'Jurnal tidak ditemukan' });
		}

		await db.delete(tableJurnalMengajar).where(eq(tableJurnalMengajar.id, id));
		return { message: 'Jurnal dihapus' };
	}
};
