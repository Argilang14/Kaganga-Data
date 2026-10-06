import { and, asc, eq, inArray } from 'drizzle-orm';
import db from '$lib/server/db';
import {
	tablePegawai,
	tableSppd,
	tableSppdPegawai,
	tableSppdPengikut
} from '$lib/server/db/schema';

function text(formData: FormData, key: string) {
	const value = formData.get(key)?.toString().trim() ?? '';
	return value || null;
}

function validDate(value: string | null) {
	return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export async function parseSppdForm(formData: FormData, sekolahId: number) {
	const pegawaiIds = [
		...new Set(
			formData
				.getAll('pegawaiIds')
				.concat(formData.getAll('pegawaiId'))
				.map(Number)
				.filter((id) => Number.isInteger(id) && id > 0)
		)
	].slice(0, 20);
	const maksud = text(formData, 'maksud');
	const tempatTujuan = text(formData, 'tempatTujuan');
	const tanggalBerangkat = text(formData, 'tanggalBerangkat');
	const tanggalKembali = text(formData, 'tanggalKembali');
	if (!pegawaiIds.length || !maksud || !tempatTujuan) {
		return { error: 'Minimal satu pegawai, maksud perjalanan, dan tujuan wajib diisi.' } as const;
	}
	if (!validDate(tanggalBerangkat) || !validDate(tanggalKembali)) {
		return { error: 'Tanggal berangkat dan kembali wajib diisi.' } as const;
	}
	if (tanggalKembali! < tanggalBerangkat!) {
		return { error: 'Tanggal kembali tidak boleh sebelum tanggal berangkat.' } as const;
	}

	const employees = await db.query.tablePegawai.findMany({
		columns: { id: true, nama: true },
		where: and(
			eq(tablePegawai.sekolahId, sekolahId),
			eq(tablePegawai.status, 'aktif'),
			inArray(tablePegawai.id, pegawaiIds)
		),
		orderBy: asc(tablePegawai.nama)
	});
	if (employees.length !== pegawaiIds.length) {
		return { error: 'Terdapat pegawai yang tidak valid untuk sekolah aktif.' } as const;
	}

	const names = formData.getAll('pengikutNama').map(String);
	const places = formData.getAll('pengikutTempatLahir').map(String);
	const dates = formData.getAll('pengikutTanggalLahir').map(String);
	const followers = names
		.map((name, index) => ({
			nama: name.trim(),
			tempatLahir: (places[index] ?? '').trim(),
			tanggalLahir: (dates[index] ?? '').trim()
		}))
		.filter((item) => item.nama || item.tempatLahir || item.tanggalLahir)
		.slice(0, 10);
	if (followers.some((item) => !item.nama || !item.tempatLahir || !validDate(item.tanggalLahir))) {
		return { error: 'Data pengikut harus diisi lengkap.' } as const;
	}

	return {
		values: {
			pegawaiId: employees[0].id,
			nomorSurat: text(formData, 'nomorSurat'),
			tanggalSurat: text(formData, 'tanggalSurat'),
			dasarSurat: text(formData, 'dasarSurat'),
			maksud,
			alatAngkut: text(formData, 'alatAngkut'),
			tempatBerangkat: text(formData, 'tempatBerangkat'),
			tempatTujuan,
			lamanya: text(formData, 'lamanya'),
			tanggalBerangkat: tanggalBerangkat!,
			tanggalKembali: tanggalKembali!,
			keteranganPengikut: text(formData, 'keteranganPengikut'),
			kodeRekening: text(formData, 'kodeRekening'),
			tingkatBiaya: text(formData, 'tingkatBiaya'),
			keteranganLain: text(formData, 'keteranganLain'),
			keterangan: text(formData, 'keterangan')
		},
		employees,
		followers
	} as const;
}

export async function replaceSppdDetails(
	sppdId: number,
	employees: Array<{ id: number; nama: string }>,
	followers: Array<{ nama: string; tempatLahir: string; tanggalLahir: string }>
) {
	await db.delete(tableSppdPegawai).where(eq(tableSppdPegawai.sppdId, sppdId));
	await db.delete(tableSppdPengikut).where(eq(tableSppdPengikut.sppdId, sppdId));
	await db.insert(tableSppdPegawai).values(
		employees.map((employee, index) => ({
			sppdId,
			pegawaiId: employee.id,
			nama: employee.nama,
			urutan: index
		}))
	);
	if (followers.length) {
		await db
			.insert(tableSppdPengikut)
			.values(followers.map((follower) => ({ sppdId, ...follower })));
	}
}

export async function updateSppd(
	id: number,
	sekolahId: number,
	formData: FormData
): Promise<string | null> {
	const existing = await db.query.tableSppd.findFirst({
		columns: { id: true },
		where: and(eq(tableSppd.id, id), eq(tableSppd.sekolahId, sekolahId))
	});
	if (!existing) return 'SPPD tidak ditemukan.';
	const parsed = await parseSppdForm(formData, sekolahId);
	if ('error' in parsed) return parsed.error ?? 'Data SPPD tidak valid.';
	await db
		.update(tableSppd)
		.set({ ...parsed.values, updatedAt: new Date().toISOString() })
		.where(and(eq(tableSppd.id, id), eq(tableSppd.sekolahId, sekolahId)));
	await replaceSppdDetails(id, parsed.employees, parsed.followers);
	return null;
}
