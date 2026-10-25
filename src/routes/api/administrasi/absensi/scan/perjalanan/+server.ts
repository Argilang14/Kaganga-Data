import { error, json } from '@sveltejs/kit';
import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import { assertTravelAccess } from '$lib/server/attendance-travel-access';
import { attendanceStaffName } from '$lib/server/attendance-staff';
import {
	travelLocalTime,
	travelPermitProblem,
	travelReturnDeadline,
	pickupProblem,
	type TravelOperation
} from '$lib/attendance-travel';
import db from '$lib/server/db';
import {
	tableIzinPulangMurid as permitTable,
	tableMurid,
	tablePegawai,
	tablePerjalananMurid as journeyTable,
	tableQrMurid
} from '$lib/server/db/schema';
import { ensureAbsenceMonitoringSchema } from '$lib/server/db/ensure-absence-monitoring';
import { ensureAbsensiDigitalSchema } from '$lib/server/db/ensure-absensi-digital';
import { ensureDataGovernanceSchema } from '$lib/server/db/ensure-data-governance';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import { hashQrToken } from '$lib/server/absensi-digital';
import { activeMuridFilter } from '$lib/server/murid-query';
import { writeAuditLog } from '$lib/server/audit-log';

export async function POST({ request, locals }) {
	const { user, sekolah } = locals;
	if (!user || !sekolah) throw error(401, 'Sesi sekolah tidak valid.');
	await assertTravelAccess(locals);
	const body = await request.json().catch(() => null);
	if (
		!body ||
		typeof body.token !== 'string' ||
		!body.token.trim() ||
		body.token.length > 512 ||
		!['pulang_ke_rumah', 'kembali_ke_sekolah'].includes(body.operation) ||
		(body.confirm !== undefined && typeof body.confirm !== 'boolean') ||
		body.capturedAt !== undefined
	)
		throw error(400, 'Scan perjalanan tidak valid. Pilih kegiatan lalu pindai QR saat terhubung.');
	const operation = body.operation as TravelOperation;
	if (body.confirm && (!Number.isSafeInteger(body.permitId) || typeof body.revision !== 'string'))
		throw error(400, 'Verifikasi izin terlebih dahulu sebelum konfirmasi.');
	await ensureAbsensiDigitalSchema();
	await ensureAbsenceMonitoringSchema();
	await ensureDataGovernanceSchema();
	const academic = await resolveSekolahAcademicContext(sekolah.id);
	const hash = hashQrToken(body.token.trim());
	// QR, active identity, permit and write are checked in one transaction to prevent stale confirmations.
	const result = await db.transaction(async (tx) => {
		if (user.type === 'tim_keamanan') {
			const employee = await tx.query.tablePegawai.findFirst({
				columns: { id: true },
				where: and(
					eq(tablePegawai.id, user.pegawaiId ?? -1),
					eq(tablePegawai.sekolahId, sekolah.id),
					eq(tablePegawai.status, 'aktif'),
					eq(tablePegawai.jenis, 'keamanan')
				)
			});
			if (!employee)
				throw error(403, 'Akun harus terhubung ke pegawai keamanan yang aktif. Hubungi operator.');
		}
		const qr = await tx.query.tableQrMurid.findFirst({ where: eq(tableQrMurid.tokenHash, hash) });
		if (!qr || qr.revokedAt)
			throw error(404, 'QR tidak berlaku. Gunakan kartu absensi murid yang aktif.');
		const murid = await tx.query.tableMurid.findFirst({
			columns: { id: true, nama: true, kelasId: true },
			where: and(
				eq(tableMurid.id, qr.muridId),
				eq(tableMurid.sekolahId, sekolah.id),
				eq(tableMurid.semesterId, academic.activeSemesterId ?? -1),
				activeMuridFilter()
			),
			with: { kelas: { columns: { nama: true } } }
		});
		if (!murid) throw error(404, 'Murid aktif tidak ditemukan di sekolah ini.');
		const permits = await tx.query.tableIzinPulangMurid.findMany({
			where: and(
				eq(permitTable.sekolahId, sekolah.id),
				eq(permitTable.muridId, murid.id),
				ne(permitTable.status, 'dibatalkan'),
				isNull(permitTable.tanggalKembali)
			),
			with: { perjalanan: true },
			orderBy: desc(permitTable.id)
		});
		const duplicateReceipt = async (permit: (typeof permits)[number], returning: boolean) => {
			const actorId = returning
				? (permit.perjalanan?.kembaliOleh ?? permit.petugasKembaliUserId)
				: permit.perjalanan?.keluarOleh;
			const nama = await attendanceStaffName(actorId ?? null, sekolah.id, tx);
			const waktu = returning ? permit.perjalanan?.kembaliPada : permit.perjalanan?.keluarPada;
			return {
				ok: false,
				code: 'already_present',
				metode: waktu ? 'qr' : 'manual',
				message: `${returning ? 'Kembali ke sekolah' : 'Keberangkatan'} sudah ${waktu ? 'dipindai' : 'tercatat'}${nama ? ` oleh ${nama}` : ''}${waktu ? ` pukul ${travelLocalTime(new Date(waktu)).time} WIB` : ''}. Data pertama tidak diubah.`,
				murid: { id: murid.id, nama: murid.nama, kelas: murid.kelas?.nama ?? '-' },
				petugas: actorId && nama ? { id: actorId, nama } : null,
				waktuScan: waktu ?? null,
				status: returning ? 'kembali' : 'pulang'
			};
		};
		if (!permits.length && operation === 'kembali_ke_sekolah') {
			const last = await tx.query.tableIzinPulangMurid.findFirst({
				where: and(
					eq(permitTable.sekolahId, sekolah.id),
					eq(permitTable.muridId, murid.id),
					ne(permitTable.status, 'dibatalkan')
				),
				with: { perjalanan: true },
				orderBy: desc(permitTable.id)
			});
			if (last?.tanggalKembali) return duplicateReceipt(last, true);
		}
		if (permits.length !== 1)
			throw error(
				409,
				permits.length
					? 'Ada lebih dari satu izin aktif. Minta operator memeriksanya.'
					: 'Tidak ada izin pulang aktif. Hubungi petugas penerbit izin.'
			);
		const permit = permits[0];
		if (operation === 'pulang_ke_rumah' && permit.perjalanan?.keluarPada)
			return duplicateReceipt(permit, false);
		const now = new Date();
		const problem = travelPermitProblem(permit, operation, now);
		if (problem) throw error(409, problem);
		const revision = JSON.stringify([
			permit.id,
			permit.updatedAt,
			permit.perjalanan?.updatedAt ?? null,
			permit.penjemputNama,
			permit.penjemputHubungan
		]);
		if (body.confirm && (body.permitId !== permit.id || body.revision !== revision))
			throw error(409, 'Izin berubah setelah QR dibaca. Pindai ulang sebelum konfirmasi.');
		const local = travelLocalTime(now);
		const terlambat = `${local.date}T${local.time}` > travelReturnDeadline(permit);
		const verification = {
			id: permit.id,
			revision,
			operation,
			murid: { id: murid.id, nama: murid.nama, kelas: murid.kelas?.nama ?? '-' },
			izin: {
				tanggalKeluar: permit.tanggalKeluar,
				rencanaKembali: permit.rencanaKembali,
				waktuRencanaKembali: permit.waktuRencanaKembali,
				nomorDokumen: permit.nomorDokumen,
				penjemputNama: permit.penjemputNama,
				penjemputHubungan: permit.penjemputHubungan
			},
			keluarPada: permit.perjalanan?.keluarPada ?? null,
			terlambat
		};
		if (!body.confirm) return { ok: true, code: 'verification', verification };
		if (operation === 'pulang_ke_rumah') {
			const pickupError = pickupProblem(permit.penjemputNama, permit.penjemputHubungan);
			if (pickupError) throw error(409, `${pickupError} Hubungi pemberi izin sebelum anak keluar.`);
			if (body.pickupVerified !== true)
				throw error(400, 'Cocokkan penjemput dengan izin sebelum konfirmasi keluar.');
		}
		const timestamp = now.toISOString();
		if (operation === 'pulang_ke_rumah') {
			await tx.insert(journeyTable).values({
				izinId: permit.id,
				keluarPada: timestamp,
				keluarOleh: user.id,
				createdAt: timestamp,
				updatedAt: timestamp
			});
			await tx
				.update(permitTable)
				.set({ updatedAt: timestamp })
				.where(eq(permitTable.id, permit.id));
		} else {
			const changed = await tx
				.update(permitTable)
				.set({
					tanggalKembali: local.date,
					waktuKembali: local.time,
					status: terlambat ? 'terlambat_kembali' : 'sudah_kembali',
					petugasKembaliUserId: user.id,
					updatedAt: timestamp
				})
				.where(
					and(
						eq(permitTable.id, permit.id),
						isNull(permitTable.tanggalKembali),
						ne(permitTable.status, 'dibatalkan')
					)
				)
				.returning({ id: permitTable.id });
			if (!changed.length) throw error(409, 'Kepulangan sudah dicatat petugas lain. Pindai ulang.');
			if (permit.perjalanan) {
				await tx
					.update(journeyTable)
					.set({ kembaliPada: timestamp, kembaliOleh: user.id, updatedAt: timestamp })
					.where(eq(journeyTable.id, permit.perjalanan.id));
			} else {
				// Legacy/manual permits already represent an authorized departure; do not fabricate its scan time.
				await tx.insert(journeyTable).values({
					izinId: permit.id,
					kembaliPada: timestamp,
					kembaliOleh: user.id,
					createdAt: timestamp,
					updatedAt: timestamp
				});
			}
		}
		await writeAuditLog(
			{
				locals,
				request,
				action: 'status_change',
				entityType: 'izin_pulang_perjalanan',
				entityId: permit.id,
				summary: `${operation === 'pulang_ke_rumah' ? 'Keberangkatan' : 'Kembali ke sekolah'} ${murid.nama}`,
				before: { status: permit.status, perjalanan: permit.perjalanan },
				after: {
					operation,
					waktu: timestamp,
					petugasId: user.id,
					...(operation === 'pulang_ke_rumah'
						? {
								penjemputDiverifikasi: true,
								penjemputNama: permit.penjemputNama,
								penjemputHubungan: permit.penjemputHubungan
							}
						: {})
				}
			},
			tx
		);
		return {
			ok: true,
			code: 'success',
			murid: verification.murid,
			waktuScan: timestamp,
			status: operation === 'pulang_ke_rumah' ? 'pulang' : 'kembali',
			petugas: {
				id: user.id,
				nama: (await attendanceStaffName(user.id, sekolah.id, tx)) ?? user.username
			},
			message:
				operation === 'pulang_ke_rumah'
					? 'Keberangkatan ke rumah tercatat.'
					: 'Kembali ke sekolah tercatat. Absensi kegiatan tetap dicatat pada kegiatannya.'
		};
	});
	return json(result, {
		status: result.code === 'already_present' ? 409 : 200,
		headers: { 'cache-control': 'private, no-store' }
	});
}
