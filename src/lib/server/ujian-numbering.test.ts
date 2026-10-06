import assert from 'node:assert/strict';
import test from 'node:test';
import {
	examParticipantNumber,
	isValidExamNpsn,
	nextExamSequence,
	participantsInClassAdditionOrder
} from './ujian-numbering.ts';

test('23 peserta kelas pertama diikuti 24 peserta kelas kedua, lalu lebih dari 99', () => {
	const first = Array.from({ length: 23 }, (_, i) => examParticipantNumber('70055420', i + 1));
	const next = nextExamSequence('70055420', first);
	const second = Array.from({ length: 24 }, (_, i) => examParticipantNumber('70055420', next + i));
	assert.equal(first[0], '7005542001');
	assert.equal(first.at(-1), '7005542023');
	assert.equal(second[0], '7005542024');
	assert.equal(second.at(-1), '7005542047');
	assert.equal(new Set([...first, ...second]).size, 47);
	assert.equal(examParticipantNumber('70055420', 100), '70055420100');
});

test('urutan berikutnya tidak menimpa nomor setelah penghapusan atau nomor lama', () => {
	assert.equal(nextExamSequence('70055420', ['7005542001', '7005542003']), 4);
	assert.equal(nextExamSequence('70055420', ['001', '003']), 4);
	assert.equal(nextExamSequence('70055420', ['MANUAL', null]), 3);
	assert.equal(nextExamSequence('70055420', []), 1);
});

test('susun ulang mempertahankan kelas pertama yang ditambahkan, bukan urutan nama kelas', () => {
	const participants = [
		{ id: 1, kelas: 'B' },
		{ id: 2, kelas: 'B' },
		{ id: 3, kelas: 'A' },
		{ id: 4, kelas: 'B' }
	];
	assert.deepEqual(
		participantsInClassAdditionOrder(participants).map((p) => p.id),
		[1, 2, 4, 3]
	);
});

test('NPSN harus delapan digit dan urutan harus positif', () => {
	assert.equal(isValidExamNpsn('01234567'), true);
	assert.equal(examParticipantNumber('01234567', 1), '0123456701');
	for (const npsn of ['', '1234567', '7005542A']) assert.equal(isValidExamNpsn(npsn), false);
	assert.throws(() => examParticipantNumber('70055420', 0));
});
