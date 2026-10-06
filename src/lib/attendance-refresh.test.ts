import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAttendanceSnapshot } from './attendance-refresh.ts';

test('Refresh uses private uncached JSON and returns a successful snapshot', async (t) => {
	t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
		assert.equal(options.cache, 'no-store');
		assert.equal(options.redirect, 'error');
		return Response.json({ total: 3 });
	});
	assert.deepEqual(await fetchAttendanceSnapshot('/api/test', new AbortController().signal), {
		total: 3
	});
});

test('Refresh rejects changed permissions and login HTML instead of replacing data', async (t) => {
	for (const response of [new Response('', { status: 403 }), new Response('<html>login</html>')]) {
		t.mock.method(globalThis, 'fetch', async () => response);
		await assert.rejects(fetchAttendanceSnapshot('/api/test', new AbortController().signal));
	}
});

test('A canceled refresh cannot return stale data after filters change', async (t) => {
	const controller = new AbortController();
	t.mock.method(globalThis, 'fetch', async () => {
		controller.abort();
		return Response.json({ total: 99 });
	});
	await assert.rejects(fetchAttendanceSnapshot('/api/test', controller.signal));
});
