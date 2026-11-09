import { error } from '@sveltejs/kit';
import { and, asc, eq, isNull, lte, gt, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import db from './db';
import {
	tableMurid,
	tableKelas,
	tablePegawai,
	tableMuridIdentityLink,
	tableAsrama,
	tableAsramaKamar,
	tableAsramaPenempatan
} from './db/schema';
import { canPrintDocument } from '$lib/role-menu-access';
import { resolveSekolahAcademicContext } from './db/academic';
import { studentAccessCondition } from './student-access';
import { activeMuridFilter } from './murid-query';
import { dormToday } from '$lib/dormitory';
import type {
	RosterContext,
	RosterStudent,
	RosterOptions,
	RosterChoice
} from '$lib/caregiver-roster';

export async function requireRosterAccess(locals: App.Locals) {
	const { user, sekolah: school } = locals;
	if (!user) error(401, 'Silakan masuk kembali sebelum mencetak.');
	if (
		!school ||
		!canPrintDocument(user, 'daftar-wali-asuh') ||
		(user.type !== 'admin' && user.sekolahId !== school.id)
	)
		error(403, 'Akun ini belum memiliki akses cetak daftar murid. Hubungi admin sekolah.');
	if (user.type !== 'admin') {
		const employee = await db.query.tablePegawai.findFirst({
			columns: { id: true },
			where: and(
				eq(tablePegawai.id, user.pegawaiId ?? -1),
				eq(tablePegawai.sekolahId, school.id),
				eq(tablePegawai.status, 'aktif')
			)
		});
		if (!employee) error(403, 'Akun perlu terhubung dengan pegawai aktif. Hubungi admin sekolah.');
	}
	return { user, school };
}

export async function loadCaregiverRoster(locals: App.Locals) {
	const { user, school } = await requireRosterAccess(locals);
	const academic = await resolveSekolahAcademicContext(school.id);
	const year = academic.tahunAjaranList.find((item) => item.id === academic.activeTahunAjaranId);
	const period = year
		? `Semester ${academic.activeSemesterTipe === 'genap' ? 'Genap' : 'Ganjil'} (${year.nama})`
		: 'Belum ada periode aktif';
	const students: RosterStudent[] = [];
	if (academic.activeSemesterId) {
		const caregiver = alias(tablePegawai, 'roster_caregiver');
		const homeroom = alias(tablePegawai, 'roster_homeroom');
		const rows = await db
			.select({
				id: tableMurid.id,
				nama: tableMurid.nama,
				nis: tableMurid.nis,
				kelasId: tableKelas.id,
				kelas: tableKelas.nama,
				waliKelas: homeroom.nama,
				waliAsuhId: caregiver.id,
				waliAsuh: caregiver.nama,
				legacyAsuh: tableMurid.waliAsuhNama,
				asramaId: tableAsrama.id,
				asrama: tableAsrama.nama
			})
			.from(tableMurid)
			.leftJoin(
				tableKelas,
				and(
					eq(tableKelas.id, tableMurid.kelasId),
					eq(tableKelas.sekolahId, school.id),
					eq(tableKelas.semesterId, academic.activeSemesterId)
				)
			)
			.leftJoin(
				homeroom,
				and(eq(homeroom.id, tableKelas.waliKelasId), eq(homeroom.sekolahId, school.id))
			)
			.leftJoin(
				caregiver,
				and(eq(caregiver.id, tableMurid.waliAsuhPegawaiId), eq(caregiver.sekolahId, school.id))
			)
			.leftJoin(
				tableMuridIdentityLink,
				and(
					eq(tableMuridIdentityLink.muridId, tableMurid.id),
					eq(tableMuridIdentityLink.sekolahId, school.id)
				)
			)
			.leftJoin(
				tableAsramaPenempatan,
				and(
					eq(tableAsramaPenempatan.identityUid, tableMuridIdentityLink.identityUid),
					eq(tableAsramaPenempatan.sekolahId, school.id),
					lte(tableAsramaPenempatan.mulai, dormToday()),
					or(isNull(tableAsramaPenempatan.selesai), gt(tableAsramaPenempatan.selesai, dormToday()))
				)
			)
			.leftJoin(
				tableAsramaKamar,
				and(
					eq(tableAsramaKamar.id, tableAsramaPenempatan.kamarId),
					eq(tableAsramaKamar.sekolahId, school.id),
					eq(tableAsramaKamar.aktif, 1),
					isNull(tableAsramaKamar.deletedAt)
				)
			)
			.leftJoin(
				tableAsrama,
				and(
					eq(tableAsrama.id, tableAsramaKamar.asramaId),
					eq(tableAsrama.sekolahId, school.id),
					eq(tableAsrama.semesterId, academic.activeSemesterId),
					eq(tableAsrama.aktif, 1),
					isNull(tableAsrama.deletedAt)
				)
			)
			.where(
				and(
					await studentAccessCondition(user, school.id, academic.activeSemesterId, 'assigned'),
					activeMuridFilter()
				)
			)
			.orderBy(asc(tableMurid.nama), asc(tableMurid.id));
		const seen = new Map<number, number | null>();
		for (const row of rows) {
			if (seen.has(row.id)) {
				if (seen.get(row.id) !== row.asramaId)
					error(
						409,
						'Ada penempatan asrama yang bertumpuk. Periksa penempatan murid sebelum mencetak.'
					);
				continue;
			}
			seen.set(row.id, row.asramaId);
			students.push({
				...row,
				nis: row.nis ?? '-',
				kelas: row.kelas ?? 'Belum memiliki kelas',
				waliKelas: row.waliKelas ?? 'Belum ditetapkan',
				asrama: row.asrama ?? 'Belum ditempatkan',
				waliAsuh:
					row.waliAsuh ??
					(row.legacyAsuh?.trim()
						? `${row.legacyAsuh.trim()} (belum ditautkan)`
						: 'Belum ditetapkan')
			});
		}
	}
	function choices(
		id: 'kelasId' | 'asramaId' | 'waliAsuhId',
		name: 'kelas' | 'asrama' | 'waliAsuh'
	): RosterChoice[] {
		const groups = new Map<number, RosterChoice>();
		for (const row of students) {
			const key = row[id];
			if (key === null) continue;
			const group = groups.get(key) ?? { id: key, nama: row[name], count: 0 };
			group.count++;
			groups.set(key, group);
		}
		return [...groups.values()].sort(
			(a, b) => a.nama.localeCompare(b.nama, 'id', { numeric: true }) || a.id - b.id
		);
	}
	const context: RosterContext = {
		period,
		classes: choices('kelasId', 'kelas'),
		dorms: choices('asramaId', 'asrama'),
		caregivers: choices('waliAsuhId', 'waliAsuh')
	};
	return { context, students, school };
}

export function selectRoster(
	data: Awaited<ReturnType<typeof loadCaregiverRoster>>,
	options: RosterOptions
) {
	const key =
		options.scope === 'kelas' ? 'kelasId' : options.scope === 'asrama' ? 'asramaId' : 'waliAsuhId';
	const groups =
		options.scope === 'kelas'
			? data.context.classes
			: options.scope === 'asrama'
				? data.context.dorms
				: data.context.caregivers;
	const group = groups.find((item) => item.id === options.id);
	if (!group)
		error(
			404,
			'Kelompok tidak ditemukan dalam periode dan cakupan akses akun ini. Pilih kembali kelompoknya.'
		);
	return { group, students: data.students.filter((row) => row[key] === options.id) };
}
