import { json } from '@sveltejs/kit';
import { loadAttendanceSummary, loadSummaryOptions } from '$lib/server/attendance-summary';

export async function GET({ locals, url }) {
	const result =
		url.searchParams.get('options') === '1'
			? await loadSummaryOptions(locals)
			: await loadAttendanceSummary(locals, url.searchParams);
	return json(result, { headers: { 'cache-control': 'no-store, private' } });
}
