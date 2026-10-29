import { AsyncLocalStorage } from 'node:async_hooks';
import { error } from '@sveltejs/kit';

const stateKey = '__kagangaDatabaseMaintenance';

type MaintenanceState = {
	active: boolean;
	exclusive: boolean;
	recoveryFailed: boolean;
	owner?: symbol;
	jobs: Set<symbol>;
	context: AsyncLocalStorage<symbol>;
};

function getState() {
	const store = globalThis as typeof globalThis & { [stateKey]?: MaintenanceState };
	store[stateKey] ??= {
		active: false,
		exclusive: false,
		recoveryFailed: false,
		jobs: new Set(),
		context: new AsyncLocalStorage<symbol>()
	};
	// Preserve an existing maintenance gate when a development module is reloaded.
	store[stateKey].jobs ??= new Set();
	store[stateKey].context ??= new AsyncLocalStorage<symbol>();
	store[stateKey].exclusive ??= false;
	store[stateKey].recoveryFailed ??= false;
	return store[stateKey];
}

export function beginDatabaseMaintenance() {
	const state = getState();
	if (state.active || state.recoveryFailed) return false;
	state.active = true;
	state.owner = state.context.getStore();
	return true;
}

export function endDatabaseMaintenance() {
	const state = getState();
	state.active = false;
	state.exclusive = false;
	state.owner = undefined;
}

export function isDatabaseMaintenanceActive() {
	return getState().active || getState().recoveryFailed;
}

export function markDatabaseRecoveryFailed() {
	getState().recoveryFailed = true;
}

export function assertDatabaseAvailable() {
	const state = getState();
	const token = state.context.getStore();
	const owner = token !== undefined && token === state.owner;
	const draining = !state.exclusive && token !== undefined && state.jobs.has(token);
	if (state.recoveryFailed || (state.active && !owner && !draining)) {
		throw error(
			503,
			state.recoveryFailed
				? 'Pemulihan database memerlukan pemeriksaan admin. Akses data sementara dihentikan.'
				: 'Database sedang dipulihkan. Silakan coba beberapa saat lagi.'
		);
	}
}

async function tracked<T>(operation: () => Promise<T>): Promise<T> {
	const state = getState();
	const token = Symbol('database-operation');
	state.jobs.add(token);
	try {
		return await state.context.run(token, operation);
	} finally {
		state.jobs.delete(token);
	}
}

export async function withDatabaseRequest<T>(operation: () => Promise<T>): Promise<T> {
	if (isDatabaseMaintenanceActive())
		throw error(503, 'Database sementara tidak tersedia. Silakan hubungi admin atau coba kembali.');
	return tracked(operation);
}

export async function withDatabaseBackground<T>(
	operation: () => Promise<T>
): Promise<T | undefined> {
	if (isDatabaseMaintenanceActive()) return undefined;
	return tracked(operation);
}

/** Hanya permintaan pemulihan sendiri yang boleh tersisa sebelum klien ditukar. */
export async function waitForDatabaseDrain(timeoutMs = 10_000) {
	const state = getState();
	if (!state.active || state.context.getStore() !== state.owner || !state.owner) {
		throw new Error('Pemulihan harus berjalan di dalam permintaan terpantau.');
	}
	const deadline = Date.now() + timeoutMs;
	while ([...state.jobs].some((job) => job !== state.owner)) {
		if (Date.now() >= deadline)
			throw error(409, 'Database masih digunakan. Pemulihan dibatalkan; silakan coba kembali.');
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	state.exclusive = true;
}
