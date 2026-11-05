/* AluConecta · Service Worker de recursos publicos · version 1
 * Solo guarda una pantalla informativa sin conexion y los iconos publicos.
 * Nunca almacena HTML de cuentas ni respuestas de API/Supabase.
 */
'use strict';

const CACHE_ACTUAL = 'aluconecta-publica-v1';
const PREFIJO_CACHE = 'aluconecta-publica-v';
const RECURSOS_PUBLICOS = ['/sin-conexion.html', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (evento) => {
  evento.waitUntil((async () => {
    const cache = await caches.open(CACHE_ACTUAL);
    // La pantalla sin conexion es obligatoria. Los iconos son opcionales.
    const respuesta = await fetch('/sin-conexion.html', { cache: 'reload', credentials: 'omit' });
    if (!respuesta.ok || respuesta.type !== 'basic') {
      throw new Error('No se pudo preparar la pantalla publica sin conexion.');
    }
    await cache.put('/sin-conexion.html', respuesta);
    await Promise.all(RECURSOS_PUBLICOS.slice(1).map(async (ruta) => {
      try {
        const recurso = await fetch(ruta, { cache: 'reload', credentials: 'omit' });
        if (recurso.ok && recurso.type === 'basic') await cache.put(ruta, recurso);
      } catch (_) {
        // La falta de un icono no impide instalar el service worker.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres
      .filter((nombre) => nombre.startsWith(PREFIJO_CACHE) && nombre !== CACHE_ACTUAL)
      .map((nombre) => caches.delete(nombre)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (evento) => {
  const solicitud = evento.request;
  if (solicitud.method !== 'GET') return;
  const destino = new URL(solicitud.url);
  if (destino.origin !== self.location.origin) return;

  // Solo los dos iconos publicos se pueden recuperar sin conexion.
  // Con Internet siempre pedimos primero su version mas reciente.
  if (destino.pathname === '/icon-192.png' || destino.pathname === '/icon-512.png') {
    evento.respondWith((async () => {
      try {
        const respuesta = await fetch(solicitud);
        if (respuesta.ok && respuesta.type === 'basic') {
          const cache = await caches.open(CACHE_ACTUAL);
          await cache.put(solicitud, respuesta.clone());
        }
        return respuesta;
      } catch (_) {
        return (await caches.match(solicitud, { cacheName: CACHE_ACTUAL })) || Response.error();
      }
    })());
    return;
  }

  // El HTML de todas las paginas siempre se obtiene por red. Nunca se guarda
  // una sesion, proyecto, cotizacion, archivo privado o respuesta de Supabase.
  if (solicitud.mode !== 'navigate') return;
  evento.respondWith((async () => {
    try {
      return await fetch(solicitud);
    } catch (_) {
      const cache = await caches.open(CACHE_ACTUAL);
      return (await cache.match('/sin-conexion.html')) || new Response(
        'AluConecta necesita una conexion a Internet para continuar.',
        { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
      );
    }
  })());
});
