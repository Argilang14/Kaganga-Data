import test from 'node:test';
import assert from 'node:assert/strict';
import {
	proposeBulkUsername,
	classifyBulkCandidate,
	parseBulkUserRole,
	bulkCredentialsCsv
} from './bulk-user.ts';

test('bulk role accepts teacher, guardians, kitchen team and operator', () => {
	for (const role of ['user', 'wali_asuh', 'wali_asrama', 'tim_dapur', 'operator'])
		assert.equal(parseBulkUserRole(role), role);
	for (const role of ['admin', 'kepala_sekolah', 'wali_kelas', '', undefined])
		assert.equal(parseBulkUserRole(role), null);
});
test('bulk username collisions and diacritics remain deterministic', () => {
	const used = new Set(['guru.siti.aminah', 'guru.siti.aminah.12']);
	assert.equal(proposeBulkUsername('user', 'Siti Aminah', 12, used), 'guru.siti.aminah.12.2');
	assert.equal(proposeBulkUsername('user', '\u00C1ri', 8, used), 'guru.ari');
	assert.equal(proposeBulkUsername('wali_asuh', '___', 9, used), 'asuh.pegawai9');
	assert.equal(proposeBulkUsername('tim_dapur', 'Siti', 10, used), 'dapur.siti');
	assert.equal(proposeBulkUsername('operator', 'Siti', 11, used), 'operator.siti');
	assert.equal(proposeBulkUsername('wali_asrama', 'A'.repeat(200), 99, used).length, 47);
});
const baseline = {
	accountNames: [],
	name: 'Guru',
	duplicateName: false,
	assignmentCount: 1,
	otherResponsibilities: [],
	activeSemester: true
};
test('existing bulk accounts are skipped even if assignments need review', () => {
	assert.equal(
		classifyBulkCandidate({
			...baseline,
			accountNames: ['lama'],
			duplicateName: true,
			assignmentCount: 0
		}).status,
		'existing'
	);
});
test('bulk assignments fail closed for empty, duplicate or inactive academic context', () => {
	for (const override of [
		{ name: '' },
		{ duplicateName: true },
		{ assignmentCount: 0 },
		{ activeSemester: false }
	])
		assert.equal(classifyBulkCandidate({ ...baseline, ...override }).status, 'blocked');
	assert.equal(classifyBulkCandidate(baseline).status, 'ready');
});
test('dual duties require an explicit review', () => {
	assert.equal(
		classifyBulkCandidate({ ...baseline, otherResponsibilities: ['Wali kelas A'] }).status,
		'review'
	);
});
test('operational roles do not require subjects or wards but still validate identity', () => {
	const operational = {
		...baseline,
		activeSemester: false,
		assignmentCount: 0,
		requiresAcademicAssignment: false
	};
	assert.equal(classifyBulkCandidate(operational).status, 'ready');
	assert.equal(classifyBulkCandidate({ ...operational, name: '' }).status, 'blocked');
	assert.equal(classifyBulkCandidate({ ...operational, duplicateName: true }).status, 'blocked');
	assert.equal(
		classifyBulkCandidate({ ...operational, accountNames: ['existing'] }).status,
		'existing'
	);
});
test('initial credential CSV escapes fields and spreadsheet formulas', () => {
	const csv = bulkCredentialsCsv([
		{
			id: 1,
			pegawaiId: 1,
			nama: '=HYPERLINK("x")',
			username: 'guru.a',
			password: 'Kg9!temporary',
			role: 'user'
		}
	]);
	assert.ok(csv.startsWith('\uFEFF'));
	assert.ok(csv.includes('"\'=HYPERLINK(""x"")"'));
	assert.ok(csv.includes('Sandi Sementara'));
});
