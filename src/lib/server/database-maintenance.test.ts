import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	assertDatabaseAvailable,
	beginDatabaseMaintenance,
	endDatabaseMaintenance,
	isDatabaseMaintenanceActive,
	markDatabaseRecoveryFailed,
	waitForDatabaseDrain,
	withDatabaseBackground,
	withDatabaseRequest
} from './database-maintenance.ts';

test('pemulihan menunggu pekerjaan lama, menolak request baru, dan pulih setelah selesai', async () => {
	let release!: () => void;
	let reached!: () => void;
	const ready = new Promise<void>((resolve) => {
		reached = resolve;
	});
	const running = withDatabaseBackground(async () => {
		reached();
		await new Promise<void>((resolve) => {
			release = resolve;
		});
		assertDatabaseAvailable();
	});
	await ready;
	await withDatabaseRequest(async () => {
		assert.equal(beginDatabaseMaintenance(), true);
		assert.equal(beginDatabaseMaintenance(), false);
		try {
			await assert.rejects(() => withDatabaseRequest(async () => 1), { status: 503 });
			assert.equal(await withDatabaseBackground(async () => 1), undefined);
			let drained = false;
			const waiting = waitForDatabaseDrain().then(() => {
				drained = true;
			});
			await new Promise((resolve) => setTimeout(resolve, 35));
			assert.equal(drained, false);
			release();
			await running;
			await waiting;
			assertDatabaseAvailable();
		} finally {
			endDatabaseMaintenance();
		}
	});
	assert.equal(isDatabaseMaintenanceActive(), false);
	assert.equal(await withDatabaseRequest(async () => 2), 2);
});

test('batas waktu drain membatalkan pemulihan tanpa membuka akses saat rollback gagal', async () => {
	let release!: () => void;
	const running = withDatabaseBackground(
		() =>
			new Promise<void>((resolve) => {
				release = resolve;
			})
	);
	await withDatabaseRequest(async () => {
		assert.equal(beginDatabaseMaintenance(), true);
		await assert.rejects(() => waitForDatabaseDrain(1), { status: 409 });
		endDatabaseMaintenance();
	});
	release();
	await running;
	assertDatabaseAvailable();
	markDatabaseRecoveryFailed();
	endDatabaseMaintenance();
	assert.equal(isDatabaseMaintenanceActive(), true);
	assert.throws(assertDatabaseAvailable, { status: 503 });
	await assert.rejects(() => withDatabaseRequest(async () => 3), { status: 503 });
	assert.equal(await withDatabaseBackground(async () => 3), undefined);
});
