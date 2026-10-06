import { fail } from '@sveltejs/kit';
import {
	applyDapodikSync,
	getDapodikSettings,
	previewDapodikSync,
	testDapodikConnection,
	type DapodikCategory
} from '$lib/server/dapodik';
import { previewDapodikNilai, sendDapodikNilai } from '$lib/server/dapodik-nilai';
import { authority } from '../../../../pengguna/utils.server';

export async function load({ locals }) {
	authority('sekolah_manage');
	if (!locals.sekolah?.id) {
		return {
			meta: { title: 'Sinkronisasi Dapodik' },
			settings: null,
			npsn: '',
			blocked: 'Pilih atau buat sekolah terlebih dahulu.'
		};
	}
	return {
		meta: { title: 'Sinkronisasi Dapodik' },
		settings: await getDapodikSettings(locals.sekolah.id),
		npsn: locals.sekolah.npsn ?? '',
		blocked: null
	};
}

const CATEGORIES = new Set<DapodikCategory>([
	'sekolah',
	'pegawai',
	'kelas',
	'murid',
	'mapel',
	'ekstrakurikuler'
]);

function readInput(form: FormData) {
	return {
		url: String(form.get('url') ?? '').trim(),
		token: String(form.get('token') ?? '').trim(),
		npsn: String(form.get('npsn') ?? '').trim(),
		semesterId: String(form.get('semesterId') ?? '').trim()
	};
}

export const actions = {
	async run({ request, locals }) {
		authority('sekolah_manage');
		const sekolahId = locals.sekolah?.id;
		if (!sekolahId) return fail(400, { message: 'Sekolah aktif tidak ditemukan.' });
		const form = await request.formData();
		const operation = String(form.get('operation') ?? '');
		const input = readInput(form);

		try {
			if (operation === 'test') {
				const result = await testDapodikConnection(sekolahId, input);
				return { operation, ...result };
			}
			if (operation === 'preview') {
				const preview = await previewDapodikSync(sekolahId, input);
				return { operation, message: 'Pratinjau berhasil dibuat.', preview };
			}
			if (operation === 'preview-nilai') {
				const nilaiPreview = await previewDapodikNilai(sekolahId, input);
				return { operation, message: 'Pratinjau nilai berhasil dibuat.', nilaiPreview };
			}
			if (operation === 'send-nilai') {
				if (form.get('confirmSendNilai') !== 'yes') {
					return fail(400, { message: 'Konfirmasi pengiriman nilai wajib dicentang.' });
				}
				const sent = await sendDapodikNilai(sekolahId, {
					...input,
					selectedKeys: form.getAll('nilaiItems').map(String)
				});
				return { operation, ...sent };
			}
			if (operation === 'apply') {
				if (form.get('confirmApply') !== 'yes') {
					return fail(400, { message: 'Konfirmasi penerapan data wajib dicentang.' });
				}
				const categories = form
					.getAll('categories')
					.map(String)
					.filter((item): item is DapodikCategory => CATEGORIES.has(item as DapodikCategory));
				if (categories.includes('murid') && !categories.includes('kelas')) {
					return fail(400, {
						message: 'Data Kelas/Rombel wajib dipilih saat menerapkan Data Murid.'
					});
				}
				if (categories.includes('mapel') && !categories.includes('kelas')) {
					return fail(400, {
						message: 'Data Kelas/Rombel wajib dipilih saat menerapkan Mata Pelajaran.'
					});
				}
				if (
					categories.includes('ekstrakurikuler') &&
					(!categories.includes('kelas') || !categories.includes('murid'))
				) {
					return fail(400, {
						message:
							'Data Kelas/Rombel dan Data Murid wajib dipilih saat menerapkan Ekstrakurikuler.'
					});
				}
				const applied = await applyDapodikSync(sekolahId, {
					...input,
					categories,
					activateSemester: form.get('activateSemester') === 'yes',
					selectedMapelKeys: form.getAll('mapelItems').map(String)
				});
				locals.sekolahDirty = true;
				return { operation, ...applied };
			}
			return fail(400, { message: 'Operasi Dapodik tidak dikenali.' });
		} catch (error) {
			console.error(`[dapodik:${operation || 'unknown'}]`, error);
			return fail(502, {
				message: error instanceof Error ? error.message : 'Proses Dapodik gagal.'
			});
		}
	}
};
