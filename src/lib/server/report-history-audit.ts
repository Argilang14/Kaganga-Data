import type { Client, Row } from '@libsql/client';
import { identityIntegrityProblem } from './murid-identity-integrity.ts';
import { normalizedNisn, validNisn } from './murid-identity.ts';

export type ValueCoverage = {
	status: 'data_tidak_tersedia' | 'nilai_belum_lengkap' | 'nilai_inti_lengkap';
	expected: number;
	filled: number;
	observed: number;
	final: false;
};

export function valueCoverage(expected: number, filled: number, observed: number): ValueCoverage {
	return {
		status:
			observed === 0
				? 'data_tidak_tersedia'
				: expected > 0 && filled === expected
					? 'nilai_inti_lengkap'
					: 'nilai_belum_lengkap',
		expected,
		filled,
		observed,
		final: false
	};
}

const tableNames = [
	'sekolah',
	'tahun_ajaran',
	'semester',
	'kelas',
	'murid',
	'murid_identity_link',
	'murid_riwayat_kelas',
	'murid_lifecycle',
	'mata_pelajaran',
	'asesmen_sumatif',
	'keasramaan',
	'keasramaan_indikator',
	'keasramaan_tujuan',
	'asesmen_keasramaan',
	'asesmen_kokurikuler',
	'asesmen_ekstrakurikuler',
	'catatan_wali_kelas',
	'catatan_wali_asrama',
	'kehadiran_murid'
] as const;
type TableName = (typeof tableNames)[number];
const n = (row: Row | undefined, key: string) => Number(row?.[key] ?? 0);
const s = (row: Row | undefined, key: string) => String(row?.[key] ?? '');
const byId = (rows: Row[]) => new Map(rows.map((row) => [n(row, 'id'), row]));
function grouped(rows: Row[], key: string) {
	const map = new Map<number, Row[]>();
	for (const row of rows) {
		const id = n(row, key);
		map.set(id, [...(map.get(id) ?? []), row]);
	}
	return map;
}
const score = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
const predikats = new Set(['sangat-baik', 'baik', 'cukup', 'perlu-bimbingan']);

// No schema ensure/migration: unknown data stays unlinked and missing tables stay visible.
export async function auditReportHistory(client: Client, options: { schoolId?: number } = {}) {
	if (
		options.schoolId !== undefined &&
		(!Number.isSafeInteger(options.schoolId) || options.schoolId < 1)
	)
		throw new Error('ID sekolah tidak valid.');
	await client.execute('PRAGMA query_only=ON');
	const schema = new Set(
		(await client.execute("SELECT name FROM sqlite_master WHERE type='table'")).rows.map((row) =>
			s(row, 'name')
		)
	);
	const data = {} as Record<TableName, Row[]>;
	for (const table of tableNames)
		data[table] = schema.has(table) ? (await client.execute(`SELECT * FROM "${table}"`)).rows : [];
	const students = byId(data.murid);
	const classes = byId(data.kelas);
	const semesters = byId(data.semester);
	const years = byId(data.tahun_ajaran);
	const schools = byId(data.sekolah);
	const links = new Map(data.murid_identity_link.map((row) => [n(row, 'murid_id'), row]));
	const histories = grouped(data.murid_riwayat_kelas, 'murid_id');
	const subjects = grouped(data.mata_pelajaran, 'kelas_id');
	const subjectIds = byId(data.mata_pelajaran);
	const grades = grouped(data.asesmen_sumatif, 'murid_id');
	const dorms = byId(data.keasramaan);
	const indicators = byId(data.keasramaan_indikator);
	const targets = byId(data.keasramaan_tujuan);
	const dormGrades = grouped(data.asesmen_keasramaan, 'murid_id');
	const expectedDorm = new Map<number, number[]>();
	for (const target of data.keasramaan_tujuan) {
		const dorm = dorms.get(n(indicators.get(n(target, 'indikator_id')), 'keasramaan_id'));
		if (dorm) {
			const id = n(dorm, 'kelas_id');
			expectedDorm.set(id, [...(expectedDorm.get(id) ?? []), n(target, 'id')]);
		}
	}
	const identities = new Map<string, Row[]>();
	for (const link of data.murid_identity_link) {
		const key = JSON.stringify([n(link, 'sekolah_id'), s(link, 'identity_uid')]);
		identities.set(key, [...(identities.get(key) ?? []), link]);
	}
	const identityProblems = new Map<string, string>();
	for (const [key, group] of identities) {
		const members = group.flatMap((link) => {
			const row = students.get(n(link, 'murid_id'));
			return row
				? [
						{
							id: n(row, 'id'),
							sekolahId: n(row, 'sekolah_id'),
							semesterId: n(row, 'semester_id'),
							linkSchoolId: n(link, 'sekolah_id'),
							linkSemesterId: n(link, 'semester_id'),
							nis: s(row, 'nis'),
							nama: s(row, 'nama'),
							tanggalLahir: s(row, 'tanggal_lahir')
						}
					]
				: [];
		});
		const problem =
			group.length !== members.length
				? 'Hubungan identitas kehilangan data sumber.'
				: identityIntegrityProblem(members, n(group[0], 'sekolah_id'));
		if (problem) identityProblems.set(key, problem);
	}
	const selected = data.murid.filter(
		(row) => !options.schoolId || n(row, 'sekolah_id') === options.schoolId
	);
	const nationalNumbers = new Map<string, Set<string>>();
	for (const row of data.murid) {
		if (!validNisn(row.nisn)) continue;
		const key = JSON.stringify([n(row, 'sekolah_id'), normalizedNisn(row.nisn)]);
		const owners = nationalNumbers.get(key) ?? new Set<string>();
		owners.add(s(links.get(n(row, 'id')), 'identity_uid').trim() || `record:${n(row, 'id')}`);
		nationalNumbers.set(key, owners);
	}
	const entries = selected.map((student) => {
		const id = n(student, 'id'),
			schoolId = n(student, 'sekolah_id'),
			classId = n(student, 'kelas_id'),
			semesterId = n(student, 'semester_id');
		const kelas = classes.get(classId),
			semester = semesters.get(semesterId),
			year = years.get(n(kelas, 'tahun_ajaran_id'));
		const link = links.get(id),
			uid = s(link, 'identity_uid').trim();
		const issues: string[] = [];
		if (!uid) issues.push('identitas_internal_belum_tersedia');
		if (uid && s(link, 'identity_uid') !== uid) issues.push('identitas_internal_tidak_kanonik');
		if (
			validNisn(student.nisn) &&
			(nationalNumbers.get(JSON.stringify([schoolId, normalizedNisn(student.nisn)]))?.size ?? 0) > 1
		)
			issues.push('nisn_sama_pada_identitas_berbeda');
		if (link && (n(link, 'sekolah_id') !== schoolId || n(link, 'semester_id') !== semesterId))
			issues.push('konteks_identitas_tidak_cocok');
		if (identityProblems.has(JSON.stringify([schoolId, uid])))
			issues.push('identitas_internal_bermasalah');
		if (
			data.murid_lifecycle.some(
				(row) =>
					n(row, 'sekolah_id') === schoolId &&
					s(row, 'identity_key') === `uid:${uid}` &&
					n(row, 'needs_identity_review')
			)
		)
			issues.push('identitas_menunggu_pemeriksaan');
		if (
			!schools.has(schoolId) ||
			!kelas ||
			!semester ||
			!year ||
			n(kelas, 'sekolah_id') !== schoolId ||
			n(kelas, 'semester_id') !== semesterId ||
			n(year, 'sekolah_id') !== schoolId ||
			n(semester, 'tahun_ajaran_id') !== n(kelas, 'tahun_ajaran_id')
		)
			issues.push('relasi_periode_kelas_tidak_cocok');
		const history = histories.get(id) ?? [];
		if (!history.length) issues.push('riwayat_kelas_belum_tersedia');
		if (history.length > 1) issues.push('riwayat_kelas_ganda');
		if (
			history.some(
				(row) =>
					n(row, 'sekolah_id') !== schoolId ||
					s(row, 'identity_key') !== `uid:${uid}` ||
					n(row, 'kelas_id') !== classId ||
					n(row, 'semester_id') !== semesterId ||
					n(row, 'tahun_ajaran_id') !== n(kelas, 'tahun_ajaran_id')
			)
		)
			issues.push('riwayat_tidak_cocok_dengan_sumber');
		const expected = subjects.get(classId) ?? [];
		const assessments = grades.get(id) ?? [];
		const usable = assessments.filter(
			(row) =>
				n(subjectIds.get(n(row, 'mata_pelajaran_id')), 'kelas_id') === classId &&
				subjectIds.has(n(row, 'mata_pelajaran_id'))
		);
		if (usable.length !== assessments.length) issues.push('nilai_akademik_di_luar_kelas');
		if (new Set(usable.map((row) => n(row, 'mata_pelajaran_id'))).size !== usable.length)
			issues.push('nilai_akademik_ganda');
		const academic = Object.fromEntries(
			(['rts', 'ras'] as const).map((mode) => {
				const key = mode === 'rts' ? 'nilai_akhir_rts' : 'nilai_akhir';
				const filled = new Set(
					usable.filter((row) => score(row[key])).map((row) => n(row, 'mata_pelajaran_id'))
				).size;
				if (usable.some((row) => row[key] !== null && row[key] !== undefined && !score(row[key])))
					issues.push(`nilai_${mode}_tidak_valid`);
				return [mode, valueCoverage(expected.length, filled, usable.length)];
			})
		) as Record<'rts' | 'ras', ValueCoverage>;
		const dormAssessments = dormGrades.get(id) ?? [];
		const validDorm = dormAssessments.filter((row) => {
			const target = targets.get(n(row, 'tujuan_id'));
			const indicator = indicators.get(n(target, 'indikator_id'));
			return (
				!!target &&
				n(indicator, 'keasramaan_id') === n(row, 'keasramaan_id') &&
				n(dorms.get(n(row, 'keasramaan_id')), 'kelas_id') === classId
			);
		});
		if (validDorm.length !== dormAssessments.length)
			issues.push('nilai_asrama_di_luar_kelas_atau_tujuan');
		if (validDorm.some((row) => !predikats.has(s(row, 'kategori'))))
			issues.push('predikat_asrama_tidak_valid');
		if (new Set(validDorm.map((row) => n(row, 'tujuan_id'))).size !== validDorm.length)
			issues.push('nilai_asrama_ganda');
		const filledDorm = new Set(
			validDorm.filter((row) => predikats.has(s(row, 'kategori'))).map((row) => n(row, 'tujuan_id'))
		).size;
		return {
			studentId: id,
			schoolId,
			identityUid: uid || null,
			source: 'murid' as const,
			yearId: n(kelas, 'tahun_ajaran_id'),
			semesterId,
			classId,
			year: s(year, 'nama'),
			semester: s(semester, 'nama'),
			className: s(kelas, 'nama'),
			historyIds: history.map((row) => n(row, 'id')),
			identityVerified: !!uid && !issues.some((v) => /identitas/.test(v)),
			safeHistoricalContext: issues.length === 0,
			issues: [...new Set(issues)],
			warnings: validNisn(student.nisn) ? [] : ['nisn_belum_valid'],
			academic,
			dorm: valueCoverage((expectedDorm.get(classId) ?? []).length, filledDorm, validDorm.length),
			supporting: {
				kokurikuler: data.asesmen_kokurikuler.filter((r) => n(r, 'murid_id') === id).length,
				ekstrakurikuler: data.asesmen_ekstrakurikuler.filter((r) => n(r, 'murid_id') === id).length,
				catatanWali: data.catatan_wali_kelas.some(
					(r) => n(r, 'murid_id') === id && s(r, 'catatan').trim()
				),
				catatanAsrama: data.catatan_wali_asrama.some(
					(r) => n(r, 'murid_id') === id && s(r, 'catatan').trim()
				),
				kehadiran: data.kehadiran_murid.some((r) => n(r, 'murid_id') === id)
			}
		};
	});
	const snapshotsOnly = data.murid_riwayat_kelas
		.filter(
			(row) =>
				!students.has(n(row, 'murid_id')) &&
				(!options.schoolId || n(row, 'sekolah_id') === options.schoolId)
		)
		.map((row) => ({
			historyId: n(row, 'id'),
			schoolId: n(row, 'sekolah_id'),
			studentId: row.murid_id === null ? null : n(row, 'murid_id'),
			year: s(row, 'tahun_ajaran_snapshot'),
			semester: s(row, 'semester_snapshot'),
			className: s(row, 'kelas_snapshot'),
			source: 'snapshot-only' as const,
			status: 'data_sumber_tidak_tersedia',
			safeHistoricalContext: false
		}));
	const periods = data.semester.flatMap((semester) => {
		const year = years.get(n(semester, 'tahun_ajaran_id')),
			schoolId = n(year, 'sekolah_id');
		if (options.schoolId && schoolId !== options.schoolId) return [];
		const items = entries.filter(
			(row) => row.schoolId === schoolId && row.semesterId === n(semester, 'id')
		);
		return [
			{
				schoolId,
				yearId: n(year, 'id'),
				semesterId: n(semester, 'id'),
				year: s(year, 'nama'),
				semester: s(semester, 'nama'),
				students: items.length,
				safeContexts: items.filter((r) => r.safeHistoricalContext).length,
				academicRts: countStatuses(items.map((r) => r.academic.rts)),
				academicRas: countStatuses(items.map((r) => r.academic.ras)),
				dorm: countStatuses(items.map((r) => r.dorm))
			}
		];
	});
	const integrity = await client.execute('PRAGMA integrity_check');
	const foreignKeys = await client.execute('PRAGMA foreign_key_check');
	return {
		version: 1,
		mode: 'read-only',
		basis: 'nilai_inti_seluruh_mapel_kelas_dan_tujuan_asrama',
		finalizedArchiveChecked: false,
		limitations: [
			'Kelengkapan nilai inti bukan persetujuan rapor final; catatan, absensi, pilihan mapel/agama, identitas satuan dan penandatangan masih perlu verifikasi.',
			'Tidak mengambil nilai dari murid atau semester lain ketika data tidak tersedia.',
			'Tidak membuat, memperbaiki, atau menggabungkan UID secara otomatis.'
		],
		missingTables: tableNames.filter((name) => !schema.has(name)),
		integrity: integrity.rows.every((row) => s(row, 'integrity_check') === 'ok') ? 'ok' : 'failed',
		foreignKeyViolations: foreignKeys.rows.length,
		summary: {
			students: entries.length,
			internalIdentities: new Set(
				entries.filter((r) => r.identityUid).map((r) => JSON.stringify([r.schoolId, r.identityUid]))
			).size,
			multiPeriodIdentities: [...identities.values()].filter(
				(group) =>
					(!options.schoolId || n(group[0], 'sekolah_id') === options.schoolId) &&
					new Set(group.map((link) => n(link, 'semester_id'))).size > 1
			).length,
			identityReview: entries.filter((r) => !r.identityVerified).length,
			relationshipReview: entries.filter((r) => !r.safeHistoricalContext).length,
			snapshotsOnly: snapshotsOnly.length,
			missingOrInvalidNisn: selected.filter((r) => !validNisn(normalizedNisn(r.nisn))).length,
			legacyLifecycleRows: data.murid_lifecycle.filter(
				(r) =>
					(!options.schoolId || n(r, 'sekolah_id') === options.schoolId) &&
					!s(r, 'identity_key').startsWith('uid:')
			).length
		},
		periods,
		entries,
		snapshotsOnly
	};
}

function countStatuses(items: ValueCoverage[]) {
	return Object.fromEntries(
		['data_tidak_tersedia', 'nilai_belum_lengkap', 'nilai_inti_lengkap'].map((status) => [
			status,
			items.filter((item) => item.status === status).length
		])
	);
}
