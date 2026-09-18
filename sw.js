const SHELL_CACHE='tonninyira-shell-v2';
const IMAGE_CACHE='tonninyira-images-v1';
const SHELL=['./','./index.html','./manifest.webmanifest','./apple-touch-icon.png','./payment-return.html','./payment-return-fixed.html','./assets/market/manifest.json'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(SHELL_CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==SHELL_CACHE&&k!==IMAGE_CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==location.origin) return;

  const imagePath=/\/assets\/market\/optimized\/\d+\.webp$/i.test(url.pathname);
  if(imagePath){
    event.respondWith(caches.open(IMAGE_CACHE).then(async cache=>{
      const cached=await cache.match(req);
      if(cached) return cached;
      const res=await fetch(req);
      if(res.ok) cache.put(req,res.clone());
      return res;
    }));
    return;
  }

  const shellAsset=req.mode==='navigate'||url.pathname.endsWith('.css')||url.pathname.endsWith('.js')||url.pathname.endsWith('.webmanifest')||url.pathname.endsWith('/manifest.json');
  event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(res=>{
    if(res.ok&&shellAsset){const copy=res.clone();caches.open(SHELL_CACHE).then(cache=>cache.put(req,copy));}
    return res;
  }).catch(()=>cached||caches.match('./index.html'))));
});
