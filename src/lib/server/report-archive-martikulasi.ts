import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import db from './db';
import { tableMartikulasiHasil, tableMartikulasiSettings } from './db/schema';
import { ensureMartikulasiSchema } from './db/ensure-martikulasi';
import { martikulasiArchiveCoverage } from '../report-martikulasi';
import { getClassEducationIdentity } from './education-units';
import { getLogoSrc, getLogoDinasSrc, formatTanggal } from './pdf/preview-utils';
import type { ReportMetadata } from '../report-archive';
import type { renderRaportMartikulasiHTML } from './pdf/templates/martikulasi';

export async function martikulasiArchiveSource(
	schoolId: number,
	yearId: number,
	classId: number,
	studentId: number
) {
	await ensureMartikulasiSchema();
	const result = await db.query.tableMartikulasiHasil.findFirst({
		where: and(
			eq(tableMartikulasiHasil.sekolahId, schoolId),
			eq(tableMartikulasiHasil.tahunAjaranId, yearId),
			eq(tableMartikulasiHasil.muridId, studentId)
		),
		with: { nilai: true }
	});
	if (result && result.kelasId !== classId)
		throw error(409, 'Hasil martikulasi tidak sesuai kelas riwayat ini.');
	const coverage = martikulasiArchiveCoverage(result?.nilai ?? [], result?.levelPenempatan ?? null);
	if (coverage.relationIssue)
		throw error(409, 'Aspek penilaian martikulasi tidak sesuai. Periksa sumber nilai.');
	return { result, coverage };
}

export async function martikulasiArchivePayload(
	locals: App.Locals,
	context: {
		yearId: number;
		classId: number;
		studentId: number;
		year: string;
		className: string;
		studentName: string;
		nis: string;
		nisn: string;
	},
	metadata: ReportMetadata
): Promise<Parameters<typeof renderRaportMartikulasiHTML>[0]> {
	const schoolId = locals.sekolah!.id;
	const { result } = await martikulasiArchiveSource(
		schoolId,
		context.yearId,
		context.classId,
		context.studentId
	);
	if (!result) throw error(409, 'Hasil martikulasi belum tersedia pada tahun pelajaran ini.');
	const settings = await db.query.tableMartikulasiSettings.findFirst({
		where: and(
			eq(tableMartikulasiSettings.sekolahId, schoolId),
			eq(tableMartikulasiSettings.tahunAjaranId, context.yearId)
		)
	});
	if (!settings)
		throw error(409, 'Pengaturan martikulasi untuk tahun pelajaran ini belum tersedia.');
	const identity = await getClassEducationIdentity(schoolId, context.classId);
	return {
		school: {
			nama: metadata.schoolName,
			npsn: metadata.npsn,
			alamat: metadata.address,
			naungan: settings.naunganSnapshot || locals.sekolah!.naungan,
			email: settings.emailSnapshot || locals.sekolah!.email,
			logoUrl: await getLogoSrc(schoolId),
			logoDinasUrl: await getLogoDinasSrc(schoolId),
			kepalaSekolah: {
				nama: metadata.principalName,
				nip: metadata.principalNip,
				status: metadata.principalStatus
			}
		},
		settings: {
			tahunAjaran: context.year,
			periodeMulai: formatTanggal(settings.periodeMulai),
			periodeSelesai: formatTanggal(metadata.date),
			nomorSk: settings.nomorSk,
			tanggalSk: formatTanggal(settings.tanggalSk),
			lokasiPenetapan: metadata.place
		},
		students: [
			{
				nama: context.studentName,
				nis: context.nis,
				nisn: context.nisn,
				kelas: context.className,
				jenjang: identity.jenjang.toUpperCase(),
				nomorSttm: null,
				tanggalSttm: '',
				levelPenempatan: result.levelPenempatan,
				rekomendasi: result.rekomendasi,
				catatanUmum: result.catatanUmum,
				waliKelas: { nama: metadata.teacherName, nip: metadata.teacherNip },
				nilai: result.nilai.map(
					({ aspekKode, capaianAwal, capaianAkhir, ketuntasan, catatan, deskripsiCapaian }) => ({
						aspekKode,
						capaianAwal,
						capaianAkhir,
						ketuntasan,
						catatan,
						deskripsiCapaian
					})
				)
			}
		]
	};
}
