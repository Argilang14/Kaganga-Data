import db from '$lib/server/db';
import { resolveSekolahAcademicContext } from '$lib/server/db/academic';
import {
	tableSekolah,
	tableAsesmenSumatif,
	tableMataPelajaran,
	tableKelas
} from '$lib/server/db/schema';
import { isAuthorizedUser } from '../../../pengguna/permissions';
import { json } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';

function recalcNilaiAkhirRts(
	naLingkup: number | null | undefined,
	sts: number | null | undefined,
	bobotLingkup: number,
	bobotSts: number
) {
	let weighted = 0;
	let totalW = 0;
	if (naLingkup != null) {
		weighted += naLingkup * bobotLingkup;
		totalW += bobotLingkup;
	}
	if (sts != null) {
		weighted += sts * bobotSts;
		totalW += bobotSts;
	}
	if (totalW === 0) return null;
	return Math.round((weighted / totalW) * 100) / 100;
}

function recalcNilaiAkhir(
	naLingkup: number | null | undefined,
	sts: number | null | undefined,
	sas: number | null | undefined,
	bobotLingkup: number,
	bobotSts: number,
	bobotSas: number
) {
	const eff =
		sts == null
			? { lingkup: 70, sts: 0, sas: 30 }
			: { lingkup: bobotLingkup, sts: bobotSts, sas: bobotSas };
	let weighted = 0;
	let totalW = 0;
	if (naLingkup != null) {
		weighted += naLingkup * eff.lingkup;
		totalW += eff.lingkup;
	}
	if (sts != null) {
		weighted += sts * eff.sts;
		totalW += eff.sts;
	}
	if (sas != null) {
		weighted += sas * eff.sas;
		totalW += eff.sas;
	}
	if (totalW === 0) return null;
	return Math.round((weighted / totalW) * 100) / 100;
}

export async function GET({ locals }) {
	const sekolah = locals.sekolah ?? null;
	if (!sekolah) return json({ error: 'Sekolah tidak ditemukan.' }, { status: 401 });

	return json({
		ras: {
			lingkup: Number(sekolah.sumatifBobotLingkup ?? 60),
			sts: Number(sekolah.sumatifBobotSts ?? 20),
			sas: Number(sekolah.sumatifBobotSas ?? 20)
		},
		rts: {
			lingkup: Number(sekolah.sumatifBobotRtsLingkup ?? 70),
			sts: Number(sekolah.sumatifBobotRtsSts ?? 30)
		}
	});
}

export async function PUT({ request, locals }) {
	if (!isAuthorizedUser(['sekolah_manage'], locals.user)) {
		return json({ error: 'Tidak memiliki izin.' }, { status: 403 });
	}

	const sekolah = locals.sekolah ?? null;
	if (!sekolah) return json({ error: 'Sekolah tidak ditemukan.' }, { status: 401 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Payload tidak valid.' }, { status: 400 });
	}

	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return json({ error: 'Payload tidak valid.' }, { status: 400 });
	}
	const payload = body as Record<string, unknown>;
	const rapor = payload['rapor'] === 'rts' ? 'rts' : 'ras';

	if (rapor === 'rts') {
		const lingkup = Number(payload['lingkup'] ?? NaN);
		const sts = Number(payload['sts'] ?? NaN);

		if (![lingkup, sts].every((value) => Number.isFinite(value) && value >= 0 && value <= 100)) {
			return json({ error: 'Nilai bobot harus angka.' }, { status: 400 });
		}

		const intLingkup = Math.max(0, Math.min(100, Math.round(lingkup)));
		const intSts = Math.max(0, Math.min(100, Math.round(sts)));

		if (intLingkup + intSts !== 100) {
			return json({ error: 'Jumlah bobot harus berjumlah 100.' }, { status: 400 });
		}

		try {
			await db.transaction(async (tx) => {
				const context = await resolveSekolahAcademicContext(sekolah.id, tx);
				if (!context.activeSemesterId || !context.tahunAjaranList.some((tahun) => tahun.isAktif && tahun.semester.some((semester) => semester.id === context.activeSemesterId && semester.isAktif))) throw new Error('Semester aktif belum tersedia.');
				await tx
					.update(tableSekolah)
					.set({
						sumatifBobotRtsLingkup: intLingkup,
						sumatifBobotRtsSts: intSts,
						updatedAt: new Date().toISOString()
					})
					.where(eq(tableSekolah.id, sekolah.id));
				// Rapor semester terdahulu tidak dihitung ulang.
				const kelasRecords = await tx
					.select({ id: tableKelas.id })
					.from(tableKelas)
					.where(
						and(
							eq(tableKelas.sekolahId, sekolah.id),
							eq(tableKelas.semesterId, context.activeSemesterId)
						)
					);
				const kelasIds = kelasRecords.map((r) => r.id);
				if (kelasIds.length > 0) {
					const mapelRecords = await tx
						.select({ id: tableMataPelajaran.id })
						.from(tableMataPelajaran)
						.where(inArray(tableMataPelajaran.kelasId, kelasIds));
					const mapelIds = mapelRecords.map((r) => r.id);
					if (mapelIds.length > 0) {
						const records = await tx
							.select({
								id: tableAsesmenSumatif.id,
								naLingkup: tableAsesmenSumatif.naLingkup,
								sts: tableAsesmenSumatif.sts,
								nilaiAkhirRts: tableAsesmenSumatif.nilaiAkhirRts
							})
							.from(tableAsesmenSumatif)
							.where(inArray(tableAsesmenSumatif.mataPelajaranId, mapelIds));

						for (const record of records) {
							const newNilai = recalcNilaiAkhirRts(
								record.naLingkup,
								record.sts,
								intLingkup,
								intSts
							);
							if (newNilai !== record.nilaiAkhirRts) {
								await tx
									.update(tableAsesmenSumatif)
									.set({ nilaiAkhirRts: newNilai })
									.where(eq(tableAsesmenSumatif.id, record.id));
							}
						}
					}
				}
			});
		} catch (err) {
			console.error('Gagal memperbarui nilai akhir RTS', err);
			return json(
				{ error: 'Bobot dan nilai RTS belum diubah. Periksa semester aktif lalu coba kembali.' },
				{ status: 500 }
			);
		}

		return json({ message: 'Bobot sumatif RTS berhasil diperbarui.' });
	}

	// RAS default
	const lingkup = Number(payload['lingkup'] ?? NaN);
	const sts = Number(payload['sts'] ?? NaN);
	const sas = Number(payload['sas'] ?? NaN);

	if (![lingkup, sts, sas].every((value) => Number.isFinite(value) && value >= 0 && value <= 100)) {
		return json({ error: 'Nilai bobot harus angka.' }, { status: 400 });
	}

	const intLingkup = Math.max(0, Math.min(100, Math.round(lingkup)));
	const intSts = Math.max(0, Math.min(100, Math.round(sts)));
	const intSas = Math.max(0, Math.min(100, Math.round(sas)));

	if (intLingkup + intSts + intSas !== 100) {
		return json({ error: 'Jumlah bobot harus berjumlah 100.' }, { status: 400 });
	}

	try {
		await db.transaction(async (tx) => {
			const context = await resolveSekolahAcademicContext(sekolah.id, tx);
			if (!context.activeSemesterId || !context.tahunAjaranList.some((tahun) => tahun.isAktif && tahun.semester.some((semester) => semester.id === context.activeSemesterId && semester.isAktif))) throw new Error('Semester aktif belum tersedia.');
			await tx
				.update(tableSekolah)
				.set({
					sumatifBobotLingkup: intLingkup,
					sumatifBobotSts: intSts,
					sumatifBobotSas: intSas,
					updatedAt: new Date().toISOString()
				})
				.where(eq(tableSekolah.id, sekolah.id));
			const kelasRecords = await tx
				.select({ id: tableKelas.id })
				.from(tableKelas)
				.where(
					and(
						eq(tableKelas.sekolahId, sekolah.id),
						eq(tableKelas.semesterId, context.activeSemesterId)
					)
				);
			const kelasIds = kelasRecords.map((r) => r.id);
			if (kelasIds.length > 0) {
				const mapelRecords = await tx
					.select({ id: tableMataPelajaran.id })
					.from(tableMataPelajaran)
					.where(inArray(tableMataPelajaran.kelasId, kelasIds));
				const mapelIds = mapelRecords.map((r) => r.id);
				if (mapelIds.length > 0) {
					const records = await tx
						.select({
							id: tableAsesmenSumatif.id,
							naLingkup: tableAsesmenSumatif.naLingkup,
							sts: tableAsesmenSumatif.sts,
							sas: tableAsesmenSumatif.sas,
							nilaiAkhir: tableAsesmenSumatif.nilaiAkhir
						})
						.from(tableAsesmenSumatif)
						.where(inArray(tableAsesmenSumatif.mataPelajaranId, mapelIds));

					for (const record of records) {
						const newNilai = recalcNilaiAkhir(
							record.naLingkup,
							record.sts,
							record.sas,
							intLingkup,
							intSts,
							intSas
						);
						if (newNilai !== record.nilaiAkhir) {
							await tx
								.update(tableAsesmenSumatif)
								.set({ nilaiAkhir: newNilai })
								.where(eq(tableAsesmenSumatif.id, record.id));
						}
					}
				}
			}
		});
	} catch (err) {
		console.error('Gagal memperbarui nilai akhir', err);
		return json(
			{ error: 'Bobot dan nilai belum diubah. Periksa semester aktif lalu coba kembali.' },
			{ status: 500 }
		);
	}

	return json({ message: 'Bobot sumatif berhasil diperbarui.' });
}
