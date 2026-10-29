import db from './db';
import { tablePegawai, tableSekolah } from './db/schema';
import { and, eq } from 'drizzle-orm';
import { getSchoolPrintAssets, type PrintAssetScope } from './print-assets';

export async function getPrincipalPrintSignatures(
	schoolId: number,
	level: string,
	waliPegawaiId: number | null | undefined,
	enabled: boolean
) {
	const empty = { principal: null, teacher: null };
	if (!enabled) return empty;
	const school = await db.query.tableSekolah.findFirst({ where: eq(tableSekolah.id, schoolId) });
	if (!school?.kepalaSekolahId) return empty;
	const principal = await db.query.tablePegawai.findFirst({
		columns: { id: true },
		where: and(eq(tablePegawai.id, school.kepalaSekolahId), eq(tablePegawai.sekolahId, schoolId))
	});
	if (!principal) return empty;
	const scopes: Record<string, PrintAssetScope> = {
		sd: 'sd',
		srd: 'sd',
		smp: 'smp',
		srmp: 'smp',
		sma: 'sma',
		srma: 'sma'
	};
	const scope = scopes[level.toLowerCase()] ?? (level === 'srt' ? null : 'induk');
	if (!scope) return empty;
	const assets = await getSchoolPrintAssets(schoolId, scope, 'portrait');
	return {
		principal: assets.signatureUrl,
		teacher: waliPegawaiId === principal.id ? assets.signatureUrl : null
	};
}
