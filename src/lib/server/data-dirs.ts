import path from 'node:path';

export function defaultDataRoot() {
	if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
		return path.join(process.env.LOCALAPPDATA, 'Kaganga-data');
	}
	return path.resolve(process.cwd(), 'data');
}

export function dataRoot() {
	return path.resolve(process.env.KAGANGA_DATA_DIR?.trim() || defaultDataRoot());
}

function fromFileEnv(value: string | undefined, fallback: string) {
	return value ? path.resolve(value.replace(/^file:/, '')) : fallback;
}

export function uploadsDir() {
	return fromFileEnv(process.env.photo, path.join(dataRoot(), 'uploads'));
}

export function soundsDir() {
	return fromFileEnv(process.env.sounds, path.join(dataRoot(), 'sounds'));
}
