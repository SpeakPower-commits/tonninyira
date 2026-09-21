/* Cache names are versioned: bumping SHELL_CACHE is what makes `activate`
   delete the previous one. v2 held a cache-first copy of every script, so a
   browser that had once loaded the site kept running that JavaScript forever
   -- a deploy could not reach it, and a hard refresh did not help, because a
   hard refresh bypasses the service worker for the page but not for the
   subresources it requests. */
const SHELL_CACHE='tonninyira-shell-v3';
const IMAGE_CACHE='tonninyira-images-v1';
const SHELL=['./','./index.html','./manifest.webmanifest','./apple-touch-icon.png','./payment-return.html','./payment-return-fixed.html','./assets/market/manifest.json'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(SHELL_CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==SHELL_CACHE&&k!==IMAGE_CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

/* Lets the page tell a waiting worker to take over at once. */
self.addEventListener('message',e=>{ if(e.data==='tn-skip-waiting') self.skipWaiting(); });

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==location.origin) return;

  /* Market photographs are content, not code, and they do not change under a
     fixed name -- cache-first is right for them and saves a lot of data. */
  if(/\/assets\/market\/optimized\/\d+\.webp$/i.test(url.pathname)){
    event.respondWith(caches.open(IMAGE_CACHE).then(async cache=>{
      const cached=await cache.match(req);
      if(cached) return cached;
      const res=await fetch(req);
      if(res.ok) cache.put(req,res.clone());
      return res;
    }));
    return;
  }

  /* Everything else -- pages, scripts, styles, manifests -- is network-first.
     The cache is a fallback for being offline, never the source of truth, so
     a deployed fix always reaches the browser on the next load. */
  const cacheable=req.mode==='navigate'||/\.(js|css|webmanifest)$/.test(url.pathname)||url.pathname.endsWith('/manifest.json');
  event.respondWith(
    fetch(req).then(res=>{
      if(res.ok&&cacheable){const copy=res.clone();caches.open(SHELL_CACHE).then(cache=>cache.put(req,copy));}
      return res;
    }).catch(async()=>{
      const cached=await caches.match(req);
      if(cached) return cached;
      if(req.mode==='navigate'){const shell=await caches.match('./index.html'); if(shell) return shell;}
      throw new Error('offline and not cached');
    })
  );
});
