export async function fetchAttendanceSnapshot<T>(url: string, signal: AbortSignal): Promise<T> {
	const response = await fetch(url, { signal, cache: 'no-store', redirect: 'error' });
	if (!response.ok || !response.headers.get('content-type')?.includes('application/json'))
		throw new Error(
			response.status === 401 || response.status === 403
				? 'Sesi atau izin berubah. Muat ulang halaman untuk melanjutkan.'
				: 'Data gagal diperbarui. Tampilan masih memakai pembaruan sebelumnya.'
		);
	const data = await response.json();
	signal.throwIfAborted();
	return data as T;
}
