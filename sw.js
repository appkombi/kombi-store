// ============================================
// SW AUTODESTRUCTIVO
// Este archivo reemplaza el Service Worker anterior.
// Se desregistra solo y borra todos los caches, para
// que la app siempre cargue la versión más reciente.
// ============================================

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Borrar todos los caches
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    // Desregistrarse
    await self.registration.unregister();
    // Recargar todas las pestañas abiertas
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(c => c.navigate(c.url));
  })());
});

// No interceptar nada
