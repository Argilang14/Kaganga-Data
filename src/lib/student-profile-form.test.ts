import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyStudentProfile } from './murid-profile.ts';
import {
	studentProfileDraft,
	parseStudentProfileDraft,
	studentProfileCompleteness
} from './student-profile-form.ts';

test('formulir opsional tidak mengubah kosong menjadi nol atau tidak', () => {
	assert.deepEqual(
		parseStudentProfileDraft(studentProfileDraft(emptyStudentProfile), []),
		emptyStudentProfile
	);
});
test('KK dan RT tetap teks; nol dan Tidak tetap diisi', () => {
	const values = {
		...emptyStudentProfile,
		nomorKk: '0012345678901234',
		rt: '001',
		jumlahTanggungan: 0,
		bersediaAsrama: false
	};
	assert.deepEqual(parseStudentProfileDraft(studentProfileDraft(values), []), values);
	assert.equal(studentProfileCompleteness(values, 1).filled, 5);
});
test('formulir menolak bilangan tidak bulat dan pilihan tidak sah', () => {
	assert.throws(() => parseStudentProfileDraft({ desilDtsen: '2.5' }, []));
	assert.throws(() => parseStudentProfileDraft({ bersediaAsrama: 'mungkin' }, []));
	assert.throws(() => parseStudentProfileDraft({ nomorKk: '123' }, []));
});
test('perubahan bantuan dan pernyataan tidak menghapus rincian secara diam-diam', () => {
	assert.throws(() => parseStudentProfileDraft({ statusBansos: 'tidak_menerima' }, ['pkh']));
	assert.throws(() =>
		parseStudentProfileDraft(
			{ suratPernyataanDitandatangani: 'false', tanggalSuratPernyataan: '2026-10-01' },
			[]
		)
	);
});
