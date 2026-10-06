import { creatableUserRoles } from './user-role.ts';

export const bulkUserRoles = creatableUserRoles;
export type BulkUserRole = (typeof bulkUserRoles)[number];
export const bulkUserRoleLabels: Record<BulkUserRole, string> = {
	user: 'Guru',
	wali_asuh: 'Wali Asuh',
	wali_asrama: 'Wali Asrama',
	tim_dapur: 'Tim Dapur',
	operator: 'Operator'
};
export const BULK_USER_LIMIT = 100;
export type BulkUserCandidate = {
	pegawaiId: number;
	nama: string;
	jenis: string;
	role: BulkUserRole;
	username: string;
	status: 'ready' | 'review' | 'blocked' | 'existing';
	reasons: string[];
	accountNames: string[];
	kelasIds: number[];
	mataPelajaranIds: number[];
	studentIds: number[];
	classes: string[];
	subjects: string[];
	permissions: string[];
	fingerprint: string;
};
export type BulkUserPreview = {
	role: BulkUserRole;
	sekolahId: number;
	semesterId: number | null;
	periode: string;
	candidates: BulkUserCandidate[];
};
export type BulkUserResult = {
	created: Array<{
		id: number;
		pegawaiId: number;
		nama: string;
		username: string;
		password: string;
		role: BulkUserRole;
	}>;
	skipped: Array<{ pegawaiId: number; nama: string; reason: string }>;
};

export function parseBulkUserRole(value: unknown): BulkUserRole | null {
	return bulkUserRoles.includes(value as BulkUserRole) ? (value as BulkUserRole) : null;
}
export function normalizedEmployeeName(value: string) {
	return value.trim().toLowerCase();
}
export function proposeBulkUsername(
	role: BulkUserRole,
	name: string,
	id: number,
	used: Set<string>
) {
	const slug = name
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '.')
		.replace(/^\.+|\.+$/g, '')
		.slice(0, 40)
		.replace(/\.+$/g, '');
	const prefix = {
		user: 'guru',
		wali_asuh: 'asuh',
		wali_asrama: 'asrama',
		tim_dapur: 'dapur',
		operator: 'operator'
	}[role];
	const base = `${prefix}.${slug || `pegawai${id}`}`;
	let username = base;
	let suffix = 0;
	while (used.has(username.toLowerCase())) {
		suffix++;
		username = `${base}.${id}${suffix === 1 ? '' : `.${suffix}`}`;
	}
	used.add(username.toLowerCase());
	return username;
}

export function classifyBulkCandidate(options: {
	accountNames: string[];
	name: string;
	duplicateName: boolean;
	assignmentCount: number;
	otherResponsibilities: string[];
	activeSemester: boolean;
	requiresAcademicAssignment?: boolean;
}): Pick<BulkUserCandidate, 'status' | 'reasons'> {
	if (options.accountNames.length)
		return { status: 'existing', reasons: ['Akun sudah ada; tidak diubah.'] };
	const reasons: string[] = [];
	const requiresAcademicAssignment = options.requiresAcademicAssignment !== false;
	if (requiresAcademicAssignment && !options.activeSemester)
		reasons.push('Tahun ajaran/semester aktif belum tersedia.');
	if (!options.name.trim()) reasons.push('Nama pegawai belum diisi.');
	if (options.duplicateName) reasons.push('Nama pegawai sama; periksa identitas dan penugasan.');
	if (requiresAcademicAssignment && !options.assignmentCount)
		reasons.push('Penugasan aktif belum lengkap.');
	if (reasons.length) return { status: 'blocked', reasons };
	return options.otherResponsibilities.length
		? { status: 'review', reasons: options.otherResponsibilities }
		: { status: 'ready', reasons: [] };
}

export function bulkCredentialsCsv(rows: BulkUserResult['created']) {
	const cell = (value: string) =>
		`"${(/^[\s]*[=+@-]/.test(value) ? "'" : '') + value.replaceAll('"', '""')}"`;
	return (
		'\uFEFF' +
		[
			['Nama Pegawai', 'Role', 'Nama Pengguna', 'Sandi Sementara'],
			...rows.map((row) => [row.nama, bulkUserRoleLabels[row.role], row.username, row.password])
		]
			.map((row) => row.map(cell).join(','))
			.join('\r\n')
	);
}
