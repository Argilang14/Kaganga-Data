import { compare, valid } from 'semver';

export function normalizeVersion(input: string | null | undefined): string {
	const trimmed = input?.trim();
	if (!trimmed) return '0.0.0';
	return /^[vV]/.test(trimmed) ? trimmed.slice(1) : trimmed;
}

export function compareVersions(a: string, b: string): number {
	return compare(valid(normalizeVersion(a)) ?? '0.0.0', valid(normalizeVersion(b)) ?? '0.0.0');
}
