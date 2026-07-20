const CACHE='kombi-v2';
const SKIP=['firebaseapp','googleapis','gstatic','firestore','identitytoolkit'];

self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/kombi-store/'])).catch(()=>{}));
});

self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
});

self.addEventListener('fetch',e=>{
  if(SKIP.some(s=>e.request.url.includes(s)))return;
  e.respondWith(
    caches.match(e.request).then(r=>r||fetch(e.request).catch(()=>caches.match('/kombi-store/')))
  );
});
