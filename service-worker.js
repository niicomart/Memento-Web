/* Memento — Service Worker para la versión móvil (PWA offline).
 *
 * Funciona aunque el sitio viva en una SUBRUTA (ej: https://usuario.github.io/memento/):
 * todas las rutas se resuelven de forma relativa al scope de este archivo,
 * nunca contra la raíz del dominio.
 *
 * Estrategia: precache de todos los archivos estáticos al instalarse y,
 * una vez cacheados, servir siempre desde la caché (cache-first) para que
 * la app funcione 100% offline. Ante una versión nueva del worker se
 * actualiza la caché en segundo plano (network-first solo para los archivos
 * propios de la app).
 */

const NOMBRE_CACHE = 'memento-movil-v1';

// Archivos de la app. Se resuelven relativos al script del SW
// (por eso './' es la carpeta web-movil aunque esté en una subruta).
const ARCHIVOS_CORE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './data-mobile.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(NOMBRE_CACHE)
      .then((cache) => cache.addAll(ARCHIVOS_CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== NOMBRE_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Convierte una url en la "clave" de caché, siempre sin la raíz del dominio:
// /usuario/memento/index.html -> index.html
function normalizarURL(url) {
  let u;
  try {
    u = new URL(url);
  } catch (e) {
    return url;
  }
  const base = new URL('./', self.registration.scope).pathname;
  let pathname = u.pathname;
  if (pathname.startsWith(base)) pathname = pathname.slice(base.length - 1); // conserva '/' inicial
  // index.html sirve como índice
  if (pathname === '/' || pathname === './') pathname = '/index.html';
  return u.origin + pathname;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Solo GET y mismo origen (no cacheamos nada externo).
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegaciones (como abrir la app desde "Agregar a pantalla de inicio"
  // o recargar estando offline): responder siempre con index.html cacheado.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetchWithCacheFallback(request)
    );
    return;
  }

  // Resto de recursos: cache-first, y ante un fallo se intenta la red
  // (para capturar actualizaciones cuando hay conexión).
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((respuesta) => {
          if (respuesta && respuesta.ok) {
            const copia = respuesta.clone();
            caches.open(NOMBRE_CACHE).then((cache) => cache.put(request, copia));
          }
          return respuesta;
        })
        .catch(() => {
          // Última red de seguridad: devolver el index cacheado
          // para que la SPA siga en pie sin red.
          if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
            return caches.match('./index.html');
          }
          return new Response('', { status: 404, statusText: 'Offline' });
        });
    })
  );
});

// Para navegaciones: preferimos la red (para ver actualizaciones) pero
// sin conexión usamos el index.html de la caché.
function fetchWithCacheFallback(request) {
  return fetch(request)
    .then((respuesta) => {
      if (respuesta && respuesta.ok) {
        const copia = respuesta.clone();
        caches.open(NOMBRE_CACHE).then((cache) => cache.put('./index.html', copia));
        return respuesta;
      }
      return caches.match('./index.html');
    })
    .catch(() => caches.match('./index.html').then((r) => r || new Response('', { status: 503 })));
}