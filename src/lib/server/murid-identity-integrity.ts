import { sameMuridPerson } from './murid-identity.ts';

export class MuridIdentityConflictError extends Error {}

export type IdentityMember = {
	id: number;
	sekolahId: number;
	semesterId: number;
	linkSchoolId: number;
	linkSemesterId: number;
	nis: string;
	nama: string;
	tanggalLahir: string;
};

export function identityIntegrityProblem(
	members: IdentityMember[],
	sekolahId: number,
	expectedMuridId?: number
) {
	if (!members.length || (expectedMuridId && !members.some((row) => row.id === expectedMuridId)))
		return 'Data sumber tidak lagi terhubung dengan identitas ini.';
	if (
		members.some(
			(row) =>
				row.sekolahId !== sekolahId ||
				row.linkSchoolId !== sekolahId ||
				row.linkSemesterId !== row.semesterId
		)
	)
		return 'Hubungan sekolah atau semester pada identitas tidak konsisten.';
	if (new Set(members.map((row) => row.semesterId)).size !== members.length)
		return 'Lebih dari satu data murid memakai identitas yang sama pada satu semester.';
	// Ambiguous historical links require review, never a cascading status change.
	if (members.some((row) => !sameMuridPerson(members[0], row)))
		return 'Identitas terhubung dengan data pribadi berbeda. Periksa hubungan identitas sebelum mengubah status.';
	return null;
}
