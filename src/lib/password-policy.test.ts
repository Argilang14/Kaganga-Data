import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePassword } from './password-policy.ts';

test('password policy menolak kata sandi lemah', () => {
	assert.equal(validatePassword('pendek').valid, false);
	assert.equal(validatePassword('tanpaangka').valid, false);
});

test('password policy menerima kombinasi huruf dan angka', () => {
	assert.deepEqual(validatePassword('Kaganga2026'), { valid: true });
});
