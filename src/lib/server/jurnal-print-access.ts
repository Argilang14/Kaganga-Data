export type JurnalPrintAccessInput = {
	userType: string | null | undefined;
	schoolWide?: boolean;
	lingkup: 'kelas' | 'mapel';
	penandatangan: 'wali_kelas' | 'guru_mapel';
	hasSelectedClass: boolean;
	hasClassAccess: boolean;
	hasSelectedSubject: boolean;
	hasSubjectAccess: boolean;
};

export function getJurnalPrintAccessError(input: JurnalPrintAccessInput): string | null {
	if (input.userType === 'admin' || input.schoolWide) return null;
	if (input.userType !== 'wali_kelas' && input.userType !== 'user') {
		return 'Akun ini tidak memiliki akses untuk mencetak jurnal mengajar';
	}
	if (!input.hasSelectedClass || !input.hasClassAccess) {
		return 'Kelas tidak termasuk dalam penugasan akun ini';
	}
	if (input.userType === 'wali_kelas') {
		if (input.lingkup === 'mapel' && !input.hasSelectedSubject) {
			return 'Pilih mata pelajaran yang akan dicetak';
		}
		if (input.penandatangan === 'guru_mapel' && !input.hasSelectedSubject) {
			return 'Pilih mata pelajaran untuk penandatangan guru';
		}
		return null;
	}
	if (input.penandatangan !== 'guru_mapel') {
		return 'Guru hanya dapat mencetak dengan penandatangan guru mata pelajaran';
	}
	if (!input.hasSelectedSubject || !input.hasSubjectAccess) {
		return 'Mata pelajaran tidak termasuk dalam penugasan akun ini';
	}
	return null;
}
