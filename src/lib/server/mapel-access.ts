import { schoolWideAcademic, type RoleUser } from '$lib/user-role';
import db from '$lib/server/db';
import {
	tableAuthUserMataPelajaran,
	tableAuthUserKelas,
	tableAuthUser,
	tableMataPelajaran
} from '$lib/server/db/schema';
import { agamaMapelNames, agamaParentName, pksMapelNames, pksParentName } from '$lib/statics';
import { and, eq, inArray, or, type SQL } from 'drizzle-orm';

// Pusat cek akses mapel untuk akun tipe "user" (guru mapel).
// Aturan:
// 1. ID mapel yang di-assign (auth_user_mata_pelajaran + legacy kolom).
// 2. Nama mapel yang di-assign (lintas kelas/semester, nama normalized sama).
// 3. Keluarga nama agama/PKS: varian di-assign → membuka nama induknya.
// 4. Sub pembelajaran: child (dapodikIndukPembelajaranId) yang terikat ke
//    pembelajaran induk milik guru (kelas sama) otomatis ikut diakses —
//    ID dan namanya (nama ikut agar pindah kelas tetap jalan).

/** Cek apakah user perlu difilter hanya ke mapel yang di-assign.
 *  - tipe 'user' → selalu filter.
 *  - tipe 'wali_kelas' → filter di kelas BUKAN miliknya, bebas di kelasnya sendiri. */
export function needsMapelFilter(
	user:
		| {
				type?: string;
				id?: number;
				jabatanAkses?: string | null;
				kelasId?: number | null;
				roles?: readonly string[] | null;
				waliKelasIds?: readonly number[];
				ownKelasIds?: number[] | null;
		  }
		| null
		| undefined,
	selectedKelasId: number | null | undefined
): boolean {
	if (!user?.id) return false;
	if (schoolWideAcademic(user)) return false;
	if (selectedKelasId && user.waliKelasIds?.includes(selectedKelasId)) return false;
	if (user.type === 'user') return true;
	if (user.type === 'wali_kelas' && selectedKelasId != null) {
		const ownIds = user.ownKelasIds?.length ? user.ownKelasIds : [user.kelasId];
		if (!ownIds.includes(selectedKelasId)) return true;
	}
	return false;
}

type MapelInti = { id: number; kelasId: number; nama: string | null };

function norm(value: string | null | undefined) {
	return (value ?? '').trim().toLowerCase();
}

const FAMILIES: Array<{ members: string[]; parent: string }> = [
	{ members: agamaMapelNames.map(norm), parent: norm(agamaParentName) },
	{ members: pksMapelNames.map(norm), parent: norm(pksParentName) }
];

function familyParentName(nama: string | null | undefined): string | null {
	const n = norm(nama);
	for (const family of FAMILIES) {
		if (family.members.includes(n) && n !== family.parent) {
			return family.parent;
		}
	}
	return null;
}

export type AksesMapel = {
	ids: Set<number>;
	/** Nama normalized (trim+lowercase) untuk perbandingan di sisi aplikasi. */
	names: Set<string>;
	/** Nama asli (hanya trim) untuk dipakai di query SQL (inArray dsb). */
	rawNames: Set<string>;
};

export async function getAksesMapelUser(
	user: {
		id: number;
		mataPelajaranId?: number | null;
	},
	targetKelasId?: number | null
): Promise<AksesMapel> {
	const assigned = await db.query.tableAuthUserMataPelajaran.findMany({
		columns: { mataPelajaranId: true },
		where: eq(tableAuthUserMataPelajaran.authUserId, user.id)
	});
	const ids = new Set(assigned.map((row) => row.mataPelajaranId));
	if (user.mataPelajaranId) ids.add(user.mataPelajaranId);

	if (!ids.size) return { ids, names: new Set(), rawNames: new Set() };

	const intiRows = await db.query.tableMataPelajaran.findMany({
		columns: { id: true, kelasId: true, nama: true, dapodikPembelajaranId: true },
		with: { kelas: { columns: { nama: true, tahunAjaranId: true, semesterId: true } } },
		where: inArray(tableMataPelajaran.id, Array.from(ids))
	});

	if (targetKelasId) {
		const target = await db.query.tableKelas.findFirst({
			where: (k, { eq }) => eq(k.id, targetKelasId),
			columns: { id: true, sekolahId: true, nama: true, tahunAjaranId: true, semesterId: true }
		});
		const account = await db.query.tableAuthUser.findFirst({
			where: eq(tableAuthUser.id, user.id),
			columns: { sekolahId: true, kelasId: true }
		});
		const links = await db.query.tableAuthUserKelas.findMany({
			where: eq(tableAuthUserKelas.authUserId, user.id),
			columns: { kelasId: true }
		});
		const classIds = [
			...links.map((row) => row.kelasId),
			...(account?.kelasId ? [account.kelasId] : [])
		];
		const assignedClasses = classIds.length
			? await db.query.tableKelas.findMany({
					where: (k, { inArray }) => inArray(k.id, classIds),
					columns: { id: true, sekolahId: true, nama: true, tahunAjaranId: true, semesterId: true }
				})
			: [];
		const matches =
			target &&
			target.sekolahId === account?.sekolahId &&
			assignedClasses.some(
				(row) =>
					row.sekolahId === target.sekolahId &&
					(row.id === target.id ||
						(row.nama === target.nama &&
							row.tahunAjaranId === target.tahunAjaranId &&
							row.semesterId !== target.semesterId &&
							!assignedClasses.some((current) => current.semesterId === target.semesterId)))
			);
		if (!matches) return { ids: new Set(), names: new Set(), rawNames: new Set() };
	}

	const names = new Set<string>();
	const rawNames = new Set<string>();
	for (const row of intiRows) {
		names.add(norm(row.nama));
		rawNames.add((row.nama ?? '').trim());
		const parent = familyParentName(row.nama);
		if (parent) names.add(parent);
	}

	// Sub pembelajaran: child terikat ke pembelajaran induk milik guru.
	// When targetKelasId is given, only expand sub-mapel for that kelas so
	// names from other kelas don't leak into the filter.
	const subParents = targetKelasId
		? intiRows.filter((row) => row.dapodikPembelajaranId && row.kelasId === targetKelasId)
		: intiRows.filter((row) => row.dapodikPembelajaranId);
	const pasangan = subParents.map((row): SQL =>
		and(
			eq(tableMataPelajaran.kelasId, row.kelasId),
			eq(tableMataPelajaran.dapodikIndukPembelajaranId, row.dapodikPembelajaranId!)
		)!
	);
	if (pasangan.length) {
		const subs = await db.query.tableMataPelajaran.findMany({
			columns: { id: true, nama: true },
			where: or(...pasangan)
		});
		for (const sub of subs) {
			ids.add(sub.id);
			names.add(norm(sub.nama));
			rawNames.add((sub.nama ?? '').trim());
		}
	}

	return { ids, names, rawNames };
}

export async function bolehAksesMapel(
	user: NonNullable<RoleUser> & {
		id: number;
		mataPelajaranId?: number | null;
		waliKelasIds?: readonly number[];
	},
	mapel: Pick<MapelInti, 'id' | 'nama'>
): Promise<boolean> {
	const target = await db.query.tableMataPelajaran.findFirst({
		where: (m, { eq }) => eq(m.id, mapel.id),
		columns: { kelasId: true }
	});
	if (!target) return false;
	if (schoolWideAcademic(user) || user.waliKelasIds?.includes(target.kelasId)) return true;
	const akses = await getAksesMapelUser(user, target.kelasId);
	return akses.ids.has(mapel.id) || akses.names.has(norm(mapel.nama));
}
