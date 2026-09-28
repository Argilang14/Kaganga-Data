const REDACTED_KEYS = /password|salt|token|secret|api[_-]?key|authorization|cookie/i;
const MAX_SERIALIZED_LENGTH = 48_000;

export function sanitizeAuditValue(value: unknown, depth = 0): unknown {
	if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
	if (depth >= 5) return '[kedalaman dibatasi]';
	if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeAuditValue(item, depth + 1));
	if (typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.slice(0, 150)
				.map(([key, item]) => [key, REDACTED_KEYS.test(key) ? '[dirahasiakan]' : sanitizeAuditValue(item, depth + 1)])
		);
	}
	return String(value);
}

export function safeAuditRecord(value: unknown): Record<string, unknown> | null {
	if (value == null) return null;
	const sanitized = sanitizeAuditValue(value);
	const serialized = JSON.stringify(sanitized);
	if (serialized.length <= MAX_SERIALIZED_LENGTH) {
		return typeof sanitized === 'object' && sanitized !== null
			? (sanitized as Record<string, unknown>)
			: { value: sanitized };
	}
	return { truncated: true, preview: serialized.slice(0, MAX_SERIALIZED_LENGTH), originalLength: serialized.length };
}
