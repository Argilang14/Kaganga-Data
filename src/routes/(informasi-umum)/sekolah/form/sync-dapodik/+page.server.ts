import { fail } from '@sveltejs/kit';
import {
	applyDapodikSync,
	getDapodikSettings,
	previewDapodikSync,
	testDapodikConnection,
	saveDapodikConfiguration,
	type DapodikCategory
} from '$lib/server/dapodik';
import { previewDapodikNilai, sendDapodikNilai } from '$lib/server/dapodik-nilai';
import { authority } from '../../../../pengguna/utils.server';
import db from '$lib/server/db';
import { ensureEducationUnitsSchema } from '$lib/server/db/ensure-education-units';
import { isIntegratedSchool } from '$lib/education-unit';

export async function load({ locals, url }) {
	authority('sekolah_manage');
	if (!locals.sekolah?.id) {
		return {
			meta: { title: 'Sinkronisasi Dapodik' },
			settings: null,
			units: [],
			satuanId: null,
			integrated: false,
			npsn: '',
			blocked: 'Pilih atau buat sekolah terlebih dahulu.'
		};
	}
	await ensureEducationUnitsSchema();
	const integrated = isIntegratedSchool(locals.sekolah);
	const rows = await db.$client.execute({
		sql: 'SELECT id,nama,npsn,jenjang FROM sekolah_satuan_pendidikan WHERE sekolah_id=? ORDER BY jenjang',
		args: [locals.sekolah.id]
	});
	const units = rows.rows.map((row) => ({
		id: Number(row.id),
		nama: String(row.nama),
		npsn: String(row.npsn),
		jenjang: String(row.jenjang)
	}));
	const requested = Number(url.searchParams.get('satuan_id'));
	const satuanId = integrated
		? (units.find((row) => row.id === requested)?.id ?? units[0]?.id ?? null)
		: null;
	return {
		meta: { title: 'Sinkronisasi Dapodik' },
		settings:
			integrated && !satuanId
				? null
				: await getDapodikSettings(locals.sekolah.id, satuanId || undefined),
		npsn: integrated
			? units.find((row) => row.id === satuanId)?.npsn || ''
			: (locals.sekolah.npsn ?? ''),
		units,
		satuanId,
		integrated,
		blocked:
			integrated && !units.length ? 'Isi Satuan Pendidikan di Data Sekolah terlebih dahulu.' : null
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
		semesterId: String(form.get('semesterId') ?? '').trim(),
		satuanId: Number(form.get('satuanId')) || undefined
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
			if (operation === 'save')
				return { operation, ...(await saveDapodikConfiguration(sekolahId, input)) };
			if (
				isIntegratedSchool(locals.sekolah!) &&
				['apply', 'preview-nilai', 'send-nilai'].includes(operation)
			)
				return fail(409, {
					message:
						'Dapodik SRT hanya mendukung konfigurasi dan pratinjau data masuk per satuan untuk saat ini.'
				});
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
