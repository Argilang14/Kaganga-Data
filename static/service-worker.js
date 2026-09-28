const CACHE_NAME = 'kaganga-static-v1';
const STATIC_ASSETS = [
	'/manifest.webmanifest',
	'/favicon.png',
	'/logo.png',
	'/kaganga-pwa-192.png',
	'/kaganga-pwa-512.png'
];

self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		Promise.all([
			caches
				.keys()
				.then((keys) =>
					Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
				),
			self.clients.claim()
		])
	);
});

self.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;
	const cacheable =
		url.pathname.startsWith('/_app/immutable/') || STATIC_ASSETS.includes(url.pathname);
	if (!cacheable) return;

	event.respondWith(
		caches.match(request).then(
			(cached) =>
				cached ||
				fetch(request).then((response) => {
					if (response.ok) {
						const copy = response.clone();
						void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
					}
					return response;
				})
		)
	);
});
