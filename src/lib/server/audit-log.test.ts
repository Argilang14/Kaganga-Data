import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeAuditValue } from './audit-sanitize.ts';

test('audit log menyamarkan data rahasia', () => {
	const result = sanitizeAuditValue({
		nama: 'Admin',
		password: 'rahasia',
		nested: { apiKey: 'secret-key', nilai: 90 }
	}) as Record<string, unknown>;
	assert.equal(result.nama, 'Admin');
	assert.equal(result.password, '[dirahasiakan]');
	assert.deepEqual(result.nested, { apiKey: '[dirahasiakan]', nilai: 90 });
});
