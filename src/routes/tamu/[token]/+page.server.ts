import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import db from '$lib/server/db';
import { tableSekolah } from '$lib/server/db/schema';
import {
	applyBukuTamuUnlockCookie,
	checkBukuTamuUnlockLimit,
	clearBukuTamuUnlockFailures,
	getBukuTamuSettingsByToken,
	isBukuTamuUnlocked,
	recordBukuTamuUnlockFailure,
	verifyBukuTamuPasskey
} from '$lib/server/buku-tamu-pass';

export async function load({ params, cookies }) {
	const settings = await getBukuTamuSettingsByToken(params.token);
	if (!settings?.publicToken) return { invalid: true, meta: { title: 'Buku Tamu' } };
	const sekolah = await db.query.tableSekolah.findFirst({
		columns: { id: true, nama: true, logo: true, logoType: true },
		where: eq(tableSekolah.id, settings.sekolahId)
	});
	if (!sekolah) return { invalid: true, meta: { title: 'Buku Tamu' } };
	return {
		invalid: false,
		token: settings.publicToken,
		sekolah: {
			nama: sekolah.nama,
			logoUrl: sekolah.logo?.length
				? `data:${sekolah.logoType || 'image/png'};base64,${Buffer.from(sekolah.logo).toString('base64')}`
				: null
		},
		passkeySet: Boolean(settings.passkeyHash && settings.passkeySalt),
		unlocked: isBukuTamuUnlocked(cookies, settings),
		meta: { title: 'Buku Tamu' }
	};
}

export const actions = {
	unlock: async ({ params, request, cookies, getClientAddress, locals }) => {
		const settings = await getBukuTamuSettingsByToken(params.token);
		if (!settings?.publicToken || !settings.passkeyHash || !settings.passkeySalt) {
			return fail(400, { fail: 'Tautan atau passkey Buku Tamu tidak valid.' });
		}
		const ip = getClientAddress();
		const limit = checkBukuTamuUnlockLimit(settings.publicToken, ip);
		if (limit.blocked) {
			return fail(429, {
				fail: `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(limit.retryAfterSeconds / 60)} menit.`
			});
		}
		const passkey = String((await request.formData()).get('passkey') ?? '');
		if (!verifyBukuTamuPasskey(passkey, settings.passkeyHash, settings.passkeySalt)) {
			recordBukuTamuUnlockFailure(settings.publicToken, ip);
			return fail(401, { fail: 'Passkey tidak sesuai.' });
		}
		clearBukuTamuUnlockFailures(settings.publicToken, ip);
		applyBukuTamuUnlockCookie(cookies, settings, locals.requestIsSecure ?? false);
		throw redirect(303, `/tamu/${settings.publicToken}`);
	}
};
