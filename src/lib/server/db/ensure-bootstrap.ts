import { ensureDefaultAdmin } from '$lib/server/auth';
import { ensureCoreSchema } from './ensure-core-schema';
import { resetEnsuredSchemas } from './ensure-helper';
import { ensureJadwalBellSchema } from './ensure-jadwal-bell';
import { ensureJadwalKurikulumSchema } from './ensure-jadwal-kurikulum';
import { ensureJurnalMengajarSchema } from './ensure-jurnal-mengajar';
import { ensurePegawaiSchema, resetPegawaiSchemaEnsure } from './ensure-pegawai';
import { ensurePresensiSettingsSchema } from './ensure-presensi-settings';
import { ensureSuratMenyuratSchema } from './ensure-surat-menyurat';
import { ensureBukuTamuSchema } from './ensure-buku-tamu';
import { ensurePresensiPegawaiSchema } from './ensure-presensi-pegawai';
import { ensureLoginAttemptSchema } from './ensure-login-attempt';
import { ensureAiSettingsSchema } from './ensure-ai-settings';
import { ensureMartikulasiSchema } from './ensure-martikulasi';
import { ensureDapodikSchema } from './ensure-dapodik';
import { ensureAccountSettingsSchema } from './ensure-account-settings';

let startupPromise: Promise<void> | null = null;

async function applyStartupEnsures() {
	await ensureCoreSchema();
	await ensureAccountSettingsSchema();
	await ensurePegawaiSchema();
	await ensureJadwalBellSchema();
	await ensurePresensiSettingsSchema();
	await ensureJadwalKurikulumSchema();
	await ensureJurnalMengajarSchema();
	await ensureSuratMenyuratSchema();
	await ensureBukuTamuSchema();
	await ensurePresensiPegawaiSchema();
	await ensureLoginAttemptSchema();
	await ensureAiSettingsSchema();
	await ensureMartikulasiSchema();
	await ensureDapodikSchema();
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
