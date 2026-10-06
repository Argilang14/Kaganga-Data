import assert from 'node:assert/strict';
import test from 'node:test';
const { getJurnalPrintAccessError } = (await import(
	'./jurnal-print-access' + '.ts'
)) as typeof import('./jurnal-print-access');

const valid = {
	userType: 'admin',
	lingkup: 'kelas' as const,
	penandatangan: 'wali_kelas' as const,
	hasSelectedClass: false,
	hasClassAccess: false,
	hasSelectedSubject: false,
	hasSubjectAccess: false
};

test('admin dapat mencetak rekap sekolah', () => {
	assert.equal(getJurnalPrintAccessError(valid), null);
});

test('wali kelas hanya dapat mencetak kelas penugasannya', () => {
	assert.equal(
		getJurnalPrintAccessError({ ...valid, userType: 'wali_kelas', hasSelectedClass: true }),
		'Kelas tidak termasuk dalam penugasan akun ini'
	);
	assert.equal(
		getJurnalPrintAccessError({
			...valid,
			userType: 'wali_kelas',
			hasSelectedClass: true,
			hasClassAccess: true
		}),
		null
	);
});

test('guru wajib memakai kelas, mapel, dan tanda tangan penugasannya', () => {
	assert.equal(
		getJurnalPrintAccessError({
			...valid,
			userType: 'user',
			hasSelectedClass: true,
			hasClassAccess: true
		}),
		'Guru hanya dapat mencetak dengan penandatangan guru mata pelajaran'
	);
	assert.equal(
		getJurnalPrintAccessError({
			...valid,
			userType: 'user',
			lingkup: 'mapel',
			penandatangan: 'guru_mapel',
			hasSelectedClass: true,
			hasClassAccess: true,
			hasSelectedSubject: true,
			hasSubjectAccess: true
		}),
		null
	);
});

test('role nonakademik ditolak', () => {
	assert.match(
		getJurnalPrintAccessError({ ...valid, userType: 'wali_asrama' }) ?? '',
		/tidak memiliki akses/
	);
});
