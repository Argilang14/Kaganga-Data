import {
	applySessionCookie,
	createSession,
	deleteSessionsForUser,
	updateUserPassword,
	verifyUserPassword
} from '$lib/server/auth';
import { validatePassword } from '$lib/password-policy';
import db from '$lib/server/db';
import { tableAuthUser, tablePegawai } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { getAppVersion } from '$lib/server/app-info';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { networkInterfaces } from 'node:os';
import { isIPv4 } from 'node:net';
import {
	clearAiSettings,
	clearUserAiSettings,
	DEFAULT_AI_BASE_URL,
	DEFAULT_AI_MODEL,
	getStoredAiSettings,
	getStoredUserAiSettings,
	maskApiKey,
	saveAiSettings,
	saveUserAiSettings
} from '$lib/server/ai';
import { getOrCreateBukuTamuSettings, setBukuTamuPasskey } from '$lib/server/buku-tamu-pass';
import { getStorageInfo, saveStorageRoot } from '$lib/server/storage-settings';
import { writeAuditLog } from '$lib/server/audit-log';

type AddressEntry = { name: string; address: string; raw: string };

function collectAddresses(port: string, currentHost: string) {
	const entries: AddressEntry[] = [];
	for (const [name, values] of Object.entries(networkInterfaces())) {
		for (const item of values ?? []) {
			if (item.family === 'IPv4' && !item.internal && item.address) {
				entries.push({ name, raw: item.address, address: `${item.address}:${port}` });
			}
		}
	}
	const current = isIPv4(currentHost) ? entries.filter((entry) => entry.raw === currentHost) : [];
	const privateEntries = entries.filter(
		(entry) => entry.raw.startsWith('10.') || entry.raw.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(entry.raw)
	);
	return [...new Set((current.length ? current : privateEntries.length ? privateEntries : entries).map((entry) => entry.address))];
}

function requireUser(locals: App.Locals) {
	if (!locals.user) throw redirect(303, '/login');
	return locals.user;
}

function parseAi(form: FormData) {
	const provider = String(form.get('provider') ?? '');
	const apiKey = String(form.get('apiKey') ?? '').trim();
	const model = String(form.get('model') ?? '').trim();
	const baseUrl = String(form.get('baseUrl') ?? '').trim();
	if (provider !== 'gemini' && provider !== 'openai_compatible') {
		throw new Error('Penyedia AI tidak valid.');
	}
	if (apiKey.length < 10 || apiKey.length > 500) throw new Error('Kunci API tidak valid.');
	if (!/^[A-Za-z0-9._:/-]{2,100}$/.test(model)) throw new Error('Nama model tidak valid.');
	return { provider, apiKey, model, baseUrl } as const;
}

export const load: PageServerLoad = async ({ url, locals }) => {
	const user = requireUser(locals);
	const protocol = url.protocol === 'https:' ? 'https:' : 'http:';
	const port = url.port || (protocol === 'https:' ? '443' : '80');
	const addresses = collectAddresses(port, url.hostname);
	if (isIPv4(url.hostname) && !addresses.includes(url.host)) addresses.push(url.host);

	const sekolahId = locals.sekolah?.id;
	const isAdmin = user.type === 'admin';
	const schoolAi = isAdmin && sekolahId ? await getStoredAiSettings(sekolahId) : null;
	const personalAi = await getStoredUserAiSettings(user.id);
	const guestBook = isAdmin && sekolahId ? await getOrCreateBukuTamuSettings(sekolahId) : null;
	const profile = user.pegawaiId && sekolahId
		? await db.query.tablePegawai.findFirst({
			columns: { id: true, nama: true, nip: true, jenis: true, jabatan: true, foto: true },
			where: and(eq(tablePegawai.id, user.pegawaiId), eq(tablePegawai.sekolahId, sekolahId))
		})
		: null;

	return {
		meta: { title: 'Pengaturan', description: 'Pengaturan Kaganga' } satisfies PageMeta,
		appAddresses: addresses,
		protocol,
		appVersion: getAppVersion(),
		mustChangePassword: Boolean(user.mustChangePassword),
		profile,
		storage: isAdmin ? await getStorageInfo() : null,
		guestBook: guestBook ? {
			publicUrl: `${protocol}//${url.host}/tamu/${guestBook.publicToken}`,
			passkeySet: Boolean(guestBook.passkeyHash && guestBook.passkeySalt)
		} : null,
		schoolAi: {
			visible: isAdmin,
			configured: Boolean(schoolAi || process.env.GEMINI_API_KEY),
			stored: Boolean(schoolAi),
			maskedKey: schoolAi ? maskApiKey(schoolAi.apiKey) : null,
			provider: schoolAi?.provider ?? 'gemini',
			model: schoolAi?.model ?? DEFAULT_AI_MODEL,
			baseUrl: schoolAi?.baseUrl ?? DEFAULT_AI_BASE_URL
		},
		personalAi: {
			stored: Boolean(personalAi),
			maskedKey: personalAi ? maskApiKey(personalAi.apiKey) : null,
			provider: personalAi?.provider ?? 'gemini',
			model: personalAi?.model ?? DEFAULT_AI_MODEL,
			baseUrl: personalAi?.baseUrl ?? DEFAULT_AI_BASE_URL
		}
	};
};

export const actions: Actions = {
	'change-password': async ({ request, locals, cookies, getClientAddress, url }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		const currentPassword = String(form.get('currentPassword') ?? '');
		const newPassword = String(form.get('newPassword') ?? '');
		const confirmPassword = String(form.get('confirmPassword') ?? '');
		if (!(await verifyUserPassword(user.id, currentPassword))) return fail(400, { message: 'Kata sandi lama tidak sesuai.' });
		const validation = validatePassword(newPassword);
		if (!validation.valid) return fail(400, { message: validation.message });
		if (newPassword === currentPassword) return fail(400, { message: 'Kata sandi baru harus berbeda dari kata sandi saat ini.' });
		if (newPassword !== confirmPassword) return fail(400, { message: 'Konfirmasi kata sandi tidak cocok.' });
		await updateUserPassword(user.id, newPassword);
		await writeAuditLog({
			locals,
			request,
			action: 'update',
			entityType: 'auth_user',
			entityId: user.id,
			summary: user.mustChangePassword
				? 'Pengguna mengganti kata sandi saat login pertama.'
				: 'Pengguna mengganti kata sandi akun.'
		});
		await deleteSessionsForUser(user.id);
		const session = await createSession(user.id, { userAgent: request.headers.get('user-agent'), ipAddress: getClientAddress() });
		applySessionCookie(cookies, session.token, session.expiresAt, locals.requestIsSecure ?? url.protocol === 'https:');
		return { message: 'Kata sandi berhasil diperbarui.' };
	},
	'change-admin-username': async ({ request, locals }) => {
		const user = requireUser(locals);
		if (user.mustChangePassword) return fail(403, { message: 'Ganti kata sandi bawaan terlebih dahulu.' });
		const form = await request.formData();
		const username = String(form.get('adminUsername') ?? '').trim();
		const password = String(form.get('adminPassword') ?? '');
		if (!/^[A-Za-z0-9._-]{3,}$/.test(username)) return fail(400, { message: 'Nama pengguna minimal 3 karakter dan hanya boleh memuat huruf, angka, titik, garis bawah, atau minus.' });
		if (!(await verifyUserPassword(user.id, password))) return fail(400, { message: 'Kata sandi konfirmasi tidak sesuai.' });
		const normalized = username.toLowerCase();
		const existing = await db.query.tableAuthUser.findFirst({ where: eq(tableAuthUser.usernameNormalized, normalized) });
		if (existing && existing.id !== user.id) return fail(400, { message: 'Nama pengguna sudah digunakan.' });
		await db.update(tableAuthUser).set({ username, usernameNormalized: normalized, updatedAt: new Date().toISOString() }).where(eq(tableAuthUser.id, user.id));
		return { message: 'Nama pengguna berhasil diperbarui.' };
	},
	'save-ai-settings': async ({ request, locals }) => {
		const user = requireUser(locals);
		if (user.mustChangePassword) return fail(403, { message: 'Ganti kata sandi bawaan terlebih dahulu.' });
		if (user.type !== 'admin' || !locals.sekolah?.id) return fail(403, { message: 'Akses ditolak.' });
		try { await saveAiSettings(locals.sekolah.id, parseAi(await request.formData())); }
		catch (error) { return fail(400, { message: error instanceof Error ? error.message : 'Pengaturan AI gagal disimpan.' }); }
		return { message: 'AI sekolah aktif berhasil disimpan.' };
	},
	'clear-ai-settings': async ({ locals }) => {
		const user = requireUser(locals);
		if (user.mustChangePassword) return fail(403, { message: 'Ganti kata sandi bawaan terlebih dahulu.' });
		if (user.type !== 'admin' || !locals.sekolah?.id) return fail(403, { message: 'Akses ditolak.' });
		await clearAiSettings(locals.sekolah.id);
		return { message: 'AI sekolah berhasil dihapus.' };
	},
	'save-personal-ai': async ({ request, locals }) => {
		const user = requireUser(locals);
		if (user.mustChangePassword) return fail(403, { message: 'Ganti kata sandi bawaan terlebih dahulu.' });
		try { await saveUserAiSettings(user.id, parseAi(await request.formData())); }
		catch (error) { return fail(400, { message: error instanceof Error ? error.message : 'AI pribadi gagal disimpan.' }); }
		return { message: 'AI pribadi berhasil disimpan.' };
	},
	'clear-personal-ai': async ({ locals }) => {
		const user = requireUser(locals);
		if (user.mustChangePassword) return fail(403, { message: 'Ganti kata sandi bawaan terlebih dahulu.' });
		await clearUserAiSettings(user.id);
		return { message: 'AI pribadi berhasil dihapus; konfigurasi sekolah akan digunakan.' };
	},
	'set-guest-passkey': async ({ request, locals }) => {
		const user = requireUser(locals);
		if (user.mustChangePassword) return fail(403, { message: 'Ganti kata sandi bawaan terlebih dahulu.' });
		if (user.type !== 'admin' || !locals.sekolah?.id) return fail(403, { message: 'Akses ditolak.' });
		const passkey = String((await request.formData()).get('passkey') ?? '').trim();
		if (passkey && (passkey.length < 4 || passkey.length > 64)) return fail(400, { message: 'Passkey harus terdiri dari 4-64 karakter.' });
		await setBukuTamuPasskey(locals.sekolah.id, passkey || null);
		return { message: passkey ? 'Passkey Buku Tamu diperbarui.' : 'Passkey Buku Tamu dinonaktifkan.' };
	},
	'save-storage': async ({ request, locals }) => {
		const user = requireUser(locals);
		if (user.mustChangePassword) return fail(403, { message: 'Ganti kata sandi bawaan terlebih dahulu.' });
		if (user.type !== 'admin') return fail(403, { message: 'Akses ditolak.' });
		try {
			const result = await saveStorageRoot(String((await request.formData()).get('dataRoot') ?? ''));
			return { message: `Lokasi disimpan dan ${result.copied} berkas disalin. Mulai ulang Kaganga untuk mengaktifkannya.` };
		} catch (error) {
			return fail(400, { message: error instanceof Error ? error.message : 'Lokasi tidak dapat disimpan.' });
		}
	}
};
