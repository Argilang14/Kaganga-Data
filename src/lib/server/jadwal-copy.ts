import db from '$lib/server/db';
import { tableJadwalJam, tableJadwalPelajaran, tableJadwalTemplate } from '$lib/server/db/schema';
import {
	ensureTemplateForJenjang,
	findJadwalJamTemplate,
	inferKelasJadwalJenjang,
	JADWAL_HARI,
	type JadwalHari,
	type JadwalJenjang,
	type JadwalJenis
} from '$lib/server/jadwal';
import { and, eq, inArray } from 'drizzle-orm';

export type JadwalJamContext = {
	tahunAjaranId: number;
	semesterId: number | null;
	jenis: JadwalJenis;
	jenjang: JadwalJenjang;
};

export type JadwalJamCopyRequest = {
	source: JadwalJamContext & { hari: JadwalHari };
	target: JadwalJamContext & { hari: JadwalHari[] };
	scope: 'semua' | 'terpilih';
	policy: 'gabung' | 'ganti';
	selectedJamIds?: number[];
};

type JamRow = typeof tableJadwalJam.$inferSelect;

type CopyOperation = {
	targetHari: JadwalHari;
	source: JamRow;
	existing: JamRow | null;
};

type RemoveOperation = { targetHari: JadwalHari; existing: JamRow };

export type JadwalJamCopyPlan = {
	sourceCount: number;
	targetDayCount: number;
	added: number;
	updated: number;
	unchanged: number;
	removed: number;
	conflicts: string[];
	operations: CopyOperation[];
	removeOperations: RemoveOperation[];
};

function sameJamValue(source: JamRow, target: JamRow) {
	return (
		source.pukulMulai === target.pukulMulai &&
		source.pukulSelesai === target.pukulSelesai &&
		source.tipe === target.tipe &&
		(source.label ?? null) === (target.label ?? null) &&
		(source.namaDefault ?? null) === (target.namaDefault ?? null) &&
		source.aktif === target.aktif
	);
}

function uniqueDays(days: JadwalHari[]) {
	return [...new Set(days)];
}

async function loadUsageBySlot(
	sekolahId: number,
	context: JadwalJamContext,
	targetRows: JamRow[],
	targetDays: JadwalHari[]
) {
	const scheduleTemplates = await db.query.tableJadwalTemplate.findMany({
		columns: { id: true },
		where: and(
			eq(tableJadwalTemplate.sekolahId, sekolahId),
			eq(tableJadwalTemplate.tahunAjaranId, context.tahunAjaranId),
			eq(tableJadwalTemplate.jenis, context.jenis),
			eq(tableJadwalTemplate.jenjang, 'semua')
		)
	});
	const scheduleTemplateIds = new Set(scheduleTemplates.map((item) => item.id));
	const targetRowIds = new Set(targetRows.map((item) => item.id));
	const rows = await db.query.tableJadwalPelajaran.findMany({
		columns: {
			id: true,
			templateId: true,
			jamId: true,
			hari: true,
			jamKe: true,
			tipe: true,
			jadwalMapelId: true
		},
		where: and(
			eq(tableJadwalPelajaran.sekolahId, sekolahId),
			inArray(tableJadwalPelajaran.hari, targetDays)
		),
		with: { kelas: { columns: { nama: true, fase: true } } }
	});
	const usage = new Map<string, typeof rows>();
	for (const row of rows) {
		if (!row.kelas || inferKelasJadwalJenjang(row.kelas) !== context.jenjang) continue;
		const exactJam = row.jamId != null && targetRowIds.has(row.jamId);
		const legacyContext = row.templateId != null && scheduleTemplateIds.has(row.templateId);
		if (!exactJam && !legacyContext) continue;
		const key = `${row.hari}:${row.jamKe}`;
		const group = usage.get(key) ?? [];
		group.push(row);
		usage.set(key, group);
	}
	return usage;
}

export async function planJadwalJamCopy(
	sekolahId: number,
	request: JadwalJamCopyRequest
): Promise<JadwalJamCopyPlan> {
	const targetDays = uniqueDays(request.target.hari);
	const conflicts: string[] = [];
	if (!targetDays.length) conflicts.push('Pilih minimal satu hari tujuan.');
	if (request.scope === 'terpilih' && request.policy === 'ganti') {
		conflicts.push('Mode ganti seluruh susunan hanya tersedia saat menyalin seluruh hari.');
	}

	const sourceTemplate = await findJadwalJamTemplate(
		sekolahId,
		request.source.jenjang,
		request.source
	);
	let sourceRows = sourceTemplate
		? await db.query.tableJadwalJam.findMany({
				where: and(
					eq(tableJadwalJam.sekolahId, sekolahId),
					eq(tableJadwalJam.templateId, sourceTemplate.id),
					eq(tableJadwalJam.jenjang, request.source.jenjang),
					eq(tableJadwalJam.hari, request.source.hari)
				)
			})
		: [];
	if (request.scope === 'terpilih') {
		const selected = new Set(request.selectedJamIds ?? []);
		sourceRows = sourceRows.filter((row) => selected.has(row.id));
		if (!selected.size) conflicts.push('Pilih minimal satu slot dari hari sumber.');
	}
	sourceRows.sort((a, b) => a.jamKe - b.jamKe);
	if (!sourceRows.length && !conflicts.length)
		conflicts.push('Hari sumber belum memiliki susunan jam.');

	const targetTemplate = await findJadwalJamTemplate(
		sekolahId,
		request.target.jenjang,
		request.target
	);
	const targetRows = targetTemplate
		? await db.query.tableJadwalJam.findMany({
				where: and(
					eq(tableJadwalJam.sekolahId, sekolahId),
					eq(tableJadwalJam.templateId, targetTemplate.id),
					eq(tableJadwalJam.jenjang, request.target.jenjang),
					inArray(tableJadwalJam.hari, targetDays)
				)
			})
		: [];
	const usage = await loadUsageBySlot(sekolahId, request.target, targetRows, targetDays);
	const operations: CopyOperation[] = [];
	const removeOperations: RemoveOperation[] = [];
	let added = 0;
	let updated = 0;
	let unchanged = 0;

	for (const targetHari of targetDays) {
		const byJamKe = new Map(
			targetRows.filter((row) => row.hari === targetHari).map((row) => [row.jamKe, row])
		);
		for (const source of sourceRows) {
			const existing = byJamKe.get(source.jamKe) ?? null;
			if (
				request.source.tahunAjaranId === request.target.tahunAjaranId &&
				request.source.jenis === request.target.jenis &&
				request.source.jenjang === request.target.jenjang &&
				request.source.hari === targetHari
			) {
				conflicts.push(`Hari ${targetHari} sama dengan hari sumber.`);
				continue;
			}
			const used = usage.get(`${targetHari}:${source.jamKe}`) ?? [];
			if (
				used.length &&
				((existing && existing.tipe !== source.tipe) ||
					!source.aktif ||
					used.some((row) => row.tipe !== source.tipe))
			) {
				conflicts.push(
					`${targetHari} slot ${source.jamKe} masih digunakan dan tipenya tidak aman untuk diubah.`
				);
				continue;
			}
			operations.push({ targetHari, source, existing });
			if (!existing) added += 1;
			else if (sameJamValue(source, existing)) unchanged += 1;
			else updated += 1;
		}
		if (request.policy === 'ganti' && request.scope === 'semua') {
			const sourceJamKe = new Set(sourceRows.map((row) => row.jamKe));
			for (const existing of byJamKe.values()) {
				if (sourceJamKe.has(existing.jamKe)) continue;
				if ((usage.get(`${targetHari}:${existing.jamKe}`) ?? []).length) {
					conflicts.push(
						`${targetHari} slot ${existing.jamKe} tidak dapat dihapus karena masih digunakan.`
					);
					continue;
				}
				removeOperations.push({ targetHari, existing });
			}
		}
	}

	return {
		sourceCount: sourceRows.length,
		targetDayCount: targetDays.length,
		added,
		updated,
		unchanged,
		removed: removeOperations.length,
		conflicts: [...new Set(conflicts)],
		operations,
		removeOperations
	};
}

export async function applyJadwalJamCopy(sekolahId: number, request: JadwalJamCopyRequest) {
	await ensureTemplateForJenjang(sekolahId, request.target.jenjang, request.target);
	const plan = await planJadwalJamCopy(sekolahId, request);
	if (plan.conflicts.length) return plan;
	const targetTemplate = await findJadwalJamTemplate(
		sekolahId,
		request.target.jenjang,
		request.target
	);
	if (!targetTemplate) throw new Error('Template jam tujuan gagal dibuat.');
	const now = new Date().toISOString();
	await db.transaction(async (tx) => {
		for (const operation of plan.operations) {
			const payload = {
				label: operation.source.label,
				pukulMulai: operation.source.pukulMulai,
				pukulSelesai: operation.source.pukulSelesai,
				tipe: operation.source.tipe,
				namaDefault: operation.source.namaDefault,
				urutan: JADWAL_HARI.indexOf(operation.targetHari) * 100 + operation.source.jamKe,
				aktif: operation.source.aktif,
				updatedAt: now
			};
			if (operation.existing) {
				await tx
					.update(tableJadwalJam)
					.set(payload)
					.where(eq(tableJadwalJam.id, operation.existing.id));
			} else {
				await tx.insert(tableJadwalJam).values({
					...payload,
					sekolahId,
					templateId: targetTemplate.id,
					jenjang: request.target.jenjang,
					hari: operation.targetHari,
					jamKe: operation.source.jamKe,
					createdAt: now
				});
			}
		}
		for (const operation of plan.removeOperations) {
			await tx.delete(tableJadwalJam).where(eq(tableJadwalJam.id, operation.existing.id));
		}
	});
	return plan;
}
