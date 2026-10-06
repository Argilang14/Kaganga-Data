const stateKey = '__kagangaDatabaseMaintenance';

type MaintenanceState = {
	active: boolean;
};

function getState() {
	const store = globalThis as typeof globalThis & { [stateKey]?: MaintenanceState };
	store[stateKey] ??= { active: false };
	return store[stateKey];
}

export function beginDatabaseMaintenance() {
	const state = getState();
	if (state.active) return false;
	state.active = true;
	return true;
}

export function endDatabaseMaintenance() {
	getState().active = false;
}

export function isDatabaseMaintenanceActive() {
	return getState().active;
}
