const CACHE="habit-grid-v7";const ASSETS=["./","./index.html","./manifest.webmanifest","./sync.js","./app.js","./workout.js"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS.map(a=>new Request(a,{cache:"reload"})))).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("habit-grid-")&&k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()])));
// Network-first for everything on this origin so updates always show; cache is only the offline fallback.
self.addEventListener("fetch",e=>{if(e.request.method!=="GET"||new URL(e.request.url).origin!==location.origin)return;
e.respondWith(fetch(e.request,{cache:"no-store"}).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return r}).catch(()=>caches.match(e.request,{ignoreSearch:true}).then(hit=>hit||caches.match("./index.html"))))});
