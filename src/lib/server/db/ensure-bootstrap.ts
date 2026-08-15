import { ensureDefaultAdmin } from '$lib/server/auth';
import { ensureCoreSchema } from './ensure-core-schema';
import { resetEnsuredSchemas } from './ensure-helper';
import { ensureJadwalBellSchema } from './ensure-jadwal-bell';
import { ensureJadwalKurikulumSchema } from './ensure-jadwal-kurikulum';
import { ensureJurnalMengajarSchema } from './ensure-jurnal-mengajar';
import { ensurePegawaiSchema, resetPegawaiSchemaEnsure } from './ensure-pegawai';
import { ensurePresensiSettingsSchema } from './ensure-presensi-settings';
import { ensureSuratMenyuratSchema } from './ensure-surat-menyurat';

let startupPromise: Promise<void> | null = null;

async function applyStartupEnsures() {
	await ensureCoreSchema();
	await ensurePegawaiSchema();
	await ensureJadwalBellSchema();
	await ensurePresensiSettingsSchema();
	await ensureJadwalKurikulumSchema();
	await ensureJurnalMengajarSchema();
	await ensureSuratMenyuratSchema();
	await ensureDefaultAdmin();
}

/** Skema minimum yang harus siap sebelum aplikasi melayani permintaan. */
export async function runStartupEnsures() {
	if (!startupPromise) {
		startupPromise = applyStartupEnsures().catch((error) => {
			startupPromise = null;
			throw error;
		});
	}
	await startupPromise;
}

/** Dipanggil setelah file database diganti agar cache tidak merujuk database lama. */
export function resetStartupEnsures() {
	startupPromise = null;
	resetEnsuredSchemas();
	resetPegawaiSchemaEnsure();
}
