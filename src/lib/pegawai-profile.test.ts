import test from 'node:test';
import assert from 'node:assert/strict';
import { editableProfileKeys, validateProfileForm } from './pegawai-profile.ts';

function form(values: Record<string, string> = {}) {
	const result = new FormData();
	result.set('nama', 'Pegawai QA');
	result.set('nip', '-');
	result.set('updatedAt', '2026-10-15T00:00:00Z');
	for (const [key, value] of Object.entries(values)) result.set(key, value);
	return result;
}

test('complete biodata keeps identifiers as text and permits optional empty fields', () => {
	const result = validateProfileForm(
		form({ nip: '001234567890123456', nik: '0012345678901234', alamat: 'Jl. Sekolah' })
	);
	assert.equal(result.values?.nip, '001234567890123456');
	assert.equal(result.values?.nik, '0012345678901234');
	assert.equal(result.values?.email, '');
	assert.equal(Object.keys(result.values ?? {}).length, editableProfileKeys.length);
});

test('self service rejects ownership, access, file paths and administrative status fields', () => {
	for (const key of [
		'id',
		'pegawaiId',
		'sekolahId',
		'type',
		'role',
		'permissions',
		'jabatanAkses',
		'jenis',
		'status',
		'jabatan',
		'kodePegawai',
		'foto'
	]) {
		assert.ok(validateProfileForm(form({ [key]: 'admin' })).error, key);
	}
	const duplicate = form();
	duplicate.append('nama', 'Nama kedua');
	assert.ok(validateProfileForm(duplicate).error);
	const file = form();
	file.set('alamat', new File(['bad'], 'alamat.txt'));
	assert.ok(validateProfileForm(file).error);
});

test('self-service validates birth and employment dates, selections, lengths and email', () => {
	const invalid: Record<string, string>[] = [
		{ nama: '' },
		{ nip: '' },
		{ email: 'bukan-email' },
		{ tanggalLahir: '2026-02-30' },
		{ tanggalLahir: '2999-01-01' },
		{ tanggalSk: '2026-13-01' },
		{ tanggalMulaiKerja: 'invalid' },
		{ jenisKelamin: 'unknown' },
		{ nama: 'x'.repeat(256) },
		{ alamat: 'x'.repeat(1001) }
	];
	for (const values of invalid) {
		assert.ok(validateProfileForm(form(values)).error, JSON.stringify(values));
	}
	assert.ok(
		validateProfileForm(form({ tanggalLahir: '2000-02-29', email: 'pegawai@example.test' })).values
	);
});
