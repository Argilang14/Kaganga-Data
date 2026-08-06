import {
	buildKelasAccessWhere,
	createPreviewableQrToken,
	hashQrToken,
	loadAbsensiKelasOptions,
	parsePositiveInteger,
	requireAbsensiDigitalAccess,
	resolveKelasId,
	resolvePrintableQrToken
} from '$lib/server/absensi-digital';
import db from '$lib/server/db';
import { tableKelas, tableMurid, tableQrMurid } from '$lib/server/db/schema';
import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import QRCode from 'qrcode';

type CardPayload = {
	muridId: number;
	nama: string;
	nis: string;
	kelas: string;
	sekolah: string;
	logoUrl: string;
	qrDataUrl: string;
	issuedAt: string;
};

type QrRow = Pick<
	typeof tableQrMurid.$inferSelect,
	'muridId' | 'tokenHash' | 'tokenVersion' | 'issuedAt' | 'revokedAt'
>;

function kelasLabel(kelas: { nama: string; fase: string | null }) {
	return kelas.fase ? `${kelas.nama} - ${kelas.fase}` : kelas.nama;
}

async function getAccessibleActiveKelas(
	sekolahId: number,
	user: Pick<AuthUser, 'id' | 'type' | 'pegawaiId' | 'permissions'>,
	kelasId: number
) {
	const { academic } = await loadAbsensiKelasOptions(sekolahId, user);
	if (!academic.activeSemesterId) return null;
	return db.query.tableKelas.findFirst({
		columns: { id: true, nama: true, fase: true, semesterId: true },
		where: and(
			buildKelasAccessWhere(sekolahId, kelasId, user),
			eq(tableKelas.semesterId, academic.activeSemesterId)
		)
	});
}

async function buildCardFromQr(
	murid: { id: number; nama: string; nis: string },
	qr: Pick<QrRow, 'muridId' | 'tokenVersion' | 'issuedAt' | 'tokenHash'>,
	kelasLabel: string,
	sekolahNama: string
) {
	const token = resolvePrintableQrToken(qr);
	if (!token) return null;
	return {
		muridId: murid.id,
		nama: murid.nama,
		nis: murid.nis,
		kelas: kelasLabel,
		sekolah: sekolahNama,
		logoUrl: '/sekolah/logo',
		qrDataUrl: await QRCode.toDataURL(token, { margin: 1, width: 240 }),
		issuedAt: qr.issuedAt
	} satisfies CardPayload;
}

async function generateCard(
	murid: { id: number; nama: string; nis: string },
	kelasLabel: string,
	sekolahNama: string
) {
	const now = new Date().toISOString();
	const latest = await db.query.tableQrMurid.findFirst({
		columns: { tokenVersion: true },
		where: eq(tableQrMurid.muridId, murid.id),
		orderBy: (table, { desc }) => [desc(table.tokenVersion)]
	});
	const tokenVersion = (latest?.tokenVersion ?? 0) + 1;
	const token = createPreviewableQrToken({
		muridId: murid.id,
		tokenVersion,
		issuedAt: now
	});
	const tokenHash = hashQrToken(token);

	await db
		.update(tableQrMurid)
		.set({ revokedAt: now, updatedAt: now })
		.where(and(eq(tableQrMurid.muridId, murid.id), isNull(tableQrMurid.revokedAt)));

	await db.insert(tableQrMurid).values({
		muridId: murid.id,
		tokenHash,
		tokenVersion,
		issuedAt: now,
		createdAt: now,
		updatedAt: now
	});

	return {
		muridId: murid.id,
		nama: murid.nama,
		nis: murid.nis,
		kelas: kelasLabel,
		sekolah: sekolahNama,
		logoUrl: '/sekolah/logo',
		qrDataUrl: await QRCode.toDataURL(token, { margin: 1, width: 240 }),
		issuedAt: now
	} satisfies CardPayload;
}

export async function load({ locals, url }) {
	requireAbsensiDigitalAccess(locals.user);
	const sekolahId = locals.sekolah?.id;
	if (!sekolahId || !locals.user) throw redirect(303, '/login');

	const { academic, kelasList } = await loadAbsensiKelasOptions(sekolahId, locals.user);
	const kelasId = resolveKelasId(kelasList, parsePositiveInteger(url.searchParams.get('kelas_id')));
	const muridList =
		academic.activeSemesterId && kelasId
			? await db.query.tableMurid.findMany({
					columns: { id: true, nama: true, nis: true, nisn: true },
					where: and(
						eq(tableMurid.sekolahId, sekolahId),
						eq(tableMurid.semesterId, academic.activeSemesterId),
						eq(tableMurid.kelasId, kelasId)
					),
					orderBy: asc(tableMurid.nama)
				})
			: [];
	const qrRows = muridList.length
		? await db.query.tableQrMurid.findMany({
				columns: {
					muridId: true,
					tokenHash: true,
					issuedAt: true,
					revokedAt: true,
					tokenVersion: true
				},
				where: inArray(
					tableQrMurid.muridId,
					muridList.map((murid) => murid.id)
				)
			})
		: [];
	const activeQr = new Map(qrRows.filter((row) => !row.revokedAt).map((row) => [row.muridId, row]));

	return {
		meta: { title: 'Kartu Absensi Murid' } satisfies PageMeta,
		kelasId,
		kelasList,
		sekolahNama: locals.sekolah?.nama ?? 'Sekolah',
		muridList: await Promise.all(
			muridList.map(async (murid) => {
				const qr = activeQr.get(murid.id) ?? null;
				const token = qr ? resolvePrintableQrToken(qr) : null;
				return {
					...murid,
					logoUrl: '/sekolah/logo',
					qr: qr
						? {
								issuedAt: qr.issuedAt,
								tokenVersion: qr.tokenVersion,
								previewable: Boolean(token),
								qrDataUrl: token ? await QRCode.toDataURL(token, { margin: 1, width: 240 }) : null
							}
						: null
				};
			})
		)
	};
}

export const actions = {
	previewOne: async ({ request, locals }) => {
		requireAbsensiDigitalAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sekolah aktif tidak ditemukan.' });
		const user = locals.user;
		const formData = await request.formData();
		const muridId = parsePositiveInteger(formData.get('muridId'));
		const kelasId = parsePositiveInteger(formData.get('kelasId'));
		if (!muridId || !kelasId) return fail(400, { fail: 'Siswa tidak valid.' });
		const kelas = await getAccessibleActiveKelas(sekolahId, user, kelasId);
		if (!kelas) return fail(403, { fail: 'Anda tidak memiliki akses ke kelas ini.' });

		const murid = await db.query.tableMurid.findFirst({
			columns: { id: true, nama: true, nis: true },
			where: and(
				eq(tableMurid.id, muridId),
				eq(tableMurid.sekolahId, sekolahId),
				eq(tableMurid.semesterId, kelas.semesterId),
				eq(tableMurid.kelasId, kelas.id)
			)
		});
		if (!murid) return fail(404, { fail: 'Siswa tidak ditemukan.' });

		const qr = await db.query.tableQrMurid.findFirst({
			columns: {
				muridId: true,
				tokenHash: true,
				tokenVersion: true,
				issuedAt: true,
				revokedAt: true
			},
			where: and(eq(tableQrMurid.muridId, murid.id), isNull(tableQrMurid.revokedAt))
		});
		if (!qr) return fail(404, { fail: 'QR siswa belum dibuat.' });

		const card = await buildCardFromQr(
			murid,
			qr,
			kelasLabel(kelas),
			locals.sekolah?.nama ?? 'Sekolah'
		);
		if (!card) {
			return fail(409, {
				fail: 'Kartu lama tidak bisa direview ulang. Klik Perbarui QR sekali lagi untuk membuat kartu absensi yang bisa dicetak ulang.'
			});
		}

		return { cards: [card], preview: true };
	},
	previewClass: async ({ request, locals }) => {
		requireAbsensiDigitalAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sekolah aktif tidak ditemukan.' });
		const user = locals.user;
		const formData = await request.formData();
		const kelasId = parsePositiveInteger(formData.get('kelasId'));
		if (!kelasId) return fail(400, { fail: 'Kelas tidak valid.' });
		const kelas = await getAccessibleActiveKelas(sekolahId, user, kelasId);
		if (!kelas) return fail(403, { fail: 'Anda tidak memiliki akses ke kelas ini.' });

		const muridList = await db.query.tableMurid.findMany({
			columns: { id: true, nama: true, nis: true },
			where: and(
				eq(tableMurid.sekolahId, sekolahId),
				eq(tableMurid.semesterId, kelas.semesterId),
				eq(tableMurid.kelasId, kelas.id)
			),
			orderBy: asc(tableMurid.nama)
		});
		if (!muridList.length) return fail(404, { fail: 'Belum ada siswa pada kelas ini.' });

		const qrRows = await db.query.tableQrMurid.findMany({
			columns: {
				muridId: true,
				tokenHash: true,
				tokenVersion: true,
				issuedAt: true,
				revokedAt: true
			},
			where: inArray(
				tableQrMurid.muridId,
				muridList.map((murid) => murid.id)
			)
		});
		const activeQr = new Map(
			qrRows.filter((row) => !row.revokedAt).map((row) => [row.muridId, row])
		);

		const cards: CardPayload[] = [];
		let skipped = 0;
		for (const murid of muridList) {
			const qr = activeQr.get(murid.id);
			const card = qr
				? await buildCardFromQr(murid, qr, kelasLabel(kelas), locals.sekolah?.nama ?? 'Sekolah')
				: null;
			if (card) cards.push(card);
			else skipped += 1;
		}

		if (!cards.length) {
			return fail(409, {
				fail: 'Belum ada kartu yang bisa direview. Klik Generate/Perbarui Massal sekali, lalu berikutnya gunakan Review Cetak.'
			});
		}

		return { cards, preview: true, skipped };
	},
	generateOne: async ({ request, locals }) => {
		requireAbsensiDigitalAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sekolah aktif tidak ditemukan.' });
		const user = locals.user;
		const formData = await request.formData();
		const muridId = parsePositiveInteger(formData.get('muridId'));
		const kelasId = parsePositiveInteger(formData.get('kelasId'));
		if (!muridId || !kelasId) return fail(400, { fail: 'Siswa tidak valid.' });
		const kelas = await getAccessibleActiveKelas(sekolahId, user, kelasId);
		if (!kelas) return fail(403, { fail: 'Anda tidak memiliki akses ke kelas ini.' });

		const murid = await db.query.tableMurid.findFirst({
			columns: { id: true, nama: true, nis: true },
			where: and(
				eq(tableMurid.id, muridId),
				eq(tableMurid.sekolahId, sekolahId),
				eq(tableMurid.semesterId, kelas.semesterId),
				eq(tableMurid.kelasId, kelas.id)
			)
		});
		if (!murid) return fail(404, { fail: 'Siswa tidak ditemukan.' });

		return {
			cards: [await generateCard(murid, kelasLabel(kelas), locals.sekolah?.nama ?? 'Sekolah')]
		};
	},
	generateClass: async ({ request, locals }) => {
		requireAbsensiDigitalAccess(locals.user);
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId || !locals.user) return fail(401, { fail: 'Sekolah aktif tidak ditemukan.' });
		const user = locals.user;
		const formData = await request.formData();
		const kelasId = parsePositiveInteger(formData.get('kelasId'));
		if (!kelasId) return fail(400, { fail: 'Kelas tidak valid.' });
		const kelas = await getAccessibleActiveKelas(sekolahId, user, kelasId);
		if (!kelas) return fail(403, { fail: 'Anda tidak memiliki akses ke kelas ini.' });

		const muridList = await db.query.tableMurid.findMany({
			columns: { id: true, nama: true, nis: true },
			where: and(
				eq(tableMurid.sekolahId, sekolahId),
				eq(tableMurid.semesterId, kelas.semesterId),
				eq(tableMurid.kelasId, kelas.id)
			),
			orderBy: asc(tableMurid.nama)
		});

		const cards: CardPayload[] = [];
		for (const murid of muridList) {
			cards.push(await generateCard(murid, kelasLabel(kelas), locals.sekolah?.nama ?? 'Sekolah'));
		}

		return { cards };
	}
};
