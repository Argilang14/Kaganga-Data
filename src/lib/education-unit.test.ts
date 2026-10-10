import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	resolveEducationIdentity,
	resolveSchoolFormNpsn,
	suggestedEducationLevel,
	validateEducationUnit
} from './education-unit.ts';

const parent = { nama: 'SRT Bengkulu', npsn: '70055420', jenjangPendidikan: 'srt' };
test('integrated school form preserves previous NPSN and ignores posted placeholders', () => {
	for (const npsn of [undefined, '', 'Diatur di Satuan Pendidikan', '12345678'])
		assert.equal(resolveSchoolFormNpsn({ ...parent, npsn }, '70055420'), '70055420');
	assert.equal(resolveSchoolFormNpsn({ ...parent, npsn: 'Diatur di Satuan Pendidikan' }), '');
});
test('ordinary school form requires eight digits and permits trimmed NPSN', () => {
	assert.equal(resolveSchoolFormNpsn({ jenjangPendidikan: 'sd', npsn: ' 76550273 ' }), '76550273');
	for (const npsn of [
		undefined,
		'',
		'Diatur di Satuan Pendidikan',
		'1234567',
		'123456789',
		'abcdefgh'
	])
		assert.throws(() => resolveSchoolFormNpsn({ jenjangPendidikan: 'sd', npsn }), /8 digit/);
});
test('unmapped integrated classes never default to SMA', () => {
	assert.throws(() => resolveEducationIdentity(parent, null, 'Kelas Biru'), /belum dipetakan/);
	for (const nama of ['I.A', 'II.A', 'III.A', 'IV', 'V', 'VI'])
		assert.equal(suggestedEducationLevel({ nama }), 'sd');
	assert.equal(suggestedEducationLevel({ nama: 'VII.A' }), 'smp');
	assert.equal(suggestedEducationLevel({ nama: 'X.A' }), 'sma');
	assert.equal(suggestedEducationLevel({ nama: 'Kelas Biru' }), null);
});
test('ordinary schools retain their single identity', () => {
	assert.deepEqual(resolveEducationIdentity({ ...parent, jenjangPendidikan: 'sd' }, null, '1'), {
		nama: parent.nama,
		npsn: parent.npsn,
		jenjang: 'sd',
		satuanId: null
	});
});
test('returning to a single-level school ignores retained unit mappings for new documents', () => {
	const school = { ...parent, jenjangPendidikan: 'sd', jenjangVariant: 'sd', npsn: '12345678' };
	const retained = { nama: 'Identitas satuan lama', npsn: '76550273', jenjang: 'sd', satuanId: 10 };
	assert.equal(resolveEducationIdentity(school, retained, 'VI').npsn, school.npsn);
	assert.equal(resolveEducationIdentity(school, retained, 'VI').nama, school.nama);
});
test('confirmed class snapshots override current parent identity', () => {
	const unit = {
		nama: 'Sekolah Rakyat Dasar Provinsi Bengkulu',
		npsn: '76550273',
		jenjang: 'sd',
		satuanId: 10
	};
	assert.deepEqual(resolveEducationIdentity(parent, unit, 'VI'), unit);
});
test('unit identity validation rejects invalid NPSN and levels', () => {
	assert.equal(validateEducationUnit({ nama: 'SD', npsn: '76550273', jenjang: 'sd' }), null);
	for (const npsn of ['7655027', '765502730', 'ABCDEFGH', '765 0273'])
		assert.ok(validateEducationUnit({ nama: 'SD', npsn, jenjang: 'sd' }));
	assert.ok(validateEducationUnit({ nama: '', npsn: '76550273', jenjang: 'sd' }));
	assert.ok(validateEducationUnit({ nama: 'Sekolah', npsn: '76550273', jenjang: 'srt' }));
});
