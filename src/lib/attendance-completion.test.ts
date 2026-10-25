import assert from 'node:assert/strict';
import { test } from 'node:test';
import { completionStatuses, parseCompletionEntries } from './attendance-completion.ts';
import { buildAttendanceSummary } from './attendance-summary.ts';

test('manual completion accepts explicit statuses and never accepts empty or duplicate selections', () => {
	for (const status of completionStatuses)
		assert.deepEqual(parseCompletionEntries([{ muridId: 1, status, catatan: ' info wali ' }]), [
			{ muridId: 1, status, catatan: 'info wali' }
		]);
	for (const value of [
		null,
		[],
		[{ muridId: 1, status: '', catatan: '' }],
		[{ muridId: -1, status: 'hadir', catatan: '' }],
		[{ muridId: 1, status: 'sakit', catatan: 'x'.repeat(501) }],
		[
			{ muridId: 1, status: 'hadir', catatan: '' },
			{ muridId: 1, status: 'izin', catatan: '' }
		],
		Array.from({ length: 101 }, (_, i) => ({ muridId: i + 1, status: 'hadir', catatan: '' }))
	])
		assert.throws(() => parseCompletionEntries(value));
});
test('only unresolved students remain in structured follow-up without inventing alfa or absence', () => {
	const result = buildAttendanceSummary({
		tanggal: '2026-10-25',
		kegiatan: 'Apel',
		cakupan: 'kelas',
		classes: [{ id: 1, nama: 'X.A', jenjang: 'sma' }],
		students: Array.from({ length: 7 }, (_, i) => ({
			id: i + 1,
			nama: `Murid ${i + 1}`,
			kelasId: 1
		})),
		attendance: [
			{ muridId: 1, status: 'hadir' },
			{ muridId: 2, status: 'sakit' },
			{ muridId: 3, status: 'izin' },
			{ muridId: 4, status: 'alfa' }
		],
		permitStudentIds: [5]
	});
	assert.deepEqual(
		result.missingStudents.map((item) => item.id),
		[6, 7]
	);
	assert.equal(result.totals.belum, 2);
	assert.equal(result.totals.jumlah - result.totals.belum, 5);
	assert.ok(result.missingStudents.every((item) => item.kelas === 'X.A'));
	assert.match(result.text, /Belum tercatat : 2/);
});
