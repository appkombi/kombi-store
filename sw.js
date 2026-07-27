const CACHE='kombi-v4';
const SKIP=['firebaseapp','googleapis','gstatic','firestore','identitytoolkit','script.google'];

self.addEventListener('install',e=>self.skipWaiting());

self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch',e=>{
  if(SKIP.some(s=>e.request.url.includes(s)))return;
  if(e.request.method!=='GET')return;

  e.respondWith(
    fetch(e.request)
      .then(res=>{
        if(res.ok){
          const clone=res.clone();
          caches.open(CACHE).then(c=>c.put(e.request,clone));
        }
        return res;
      })
      .catch(()=>{
        // Si no hay cache devuelve respuesta vacía en vez de undefined
        return caches.match(e.request).then(r=>r||new Response('',{status:503}));
      })
  );
});
