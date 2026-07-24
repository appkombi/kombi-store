// Network first — siempre busca versión nueva, caché solo como respaldo
const CACHE='kombi-v3';
const SKIP=['firebaseapp','googleapis','gstatic','firestore','identitytoolkit','script.google'];

self.addEventListener('install',e=>{
  self.skipWaiting();
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.map(k=>caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch',e=>{
  // Skip Firebase and external APIs — never cache
  if(SKIP.some(s=>e.request.url.includes(s))) return;
  // Skip non-GET
  if(e.request.method!=='GET') return;

  e.respondWith(
    fetch(e.request)
      .then(res=>{
        // Cache successful responses
        if(res.ok){
          const clone=res.clone();
          caches.open(CACHE).then(c=>c.put(e.request,clone));
        }
        return res;
      })
      .catch(()=>{
        // Offline fallback — use cache
        return caches.match(e.request);
      })
  );
});
