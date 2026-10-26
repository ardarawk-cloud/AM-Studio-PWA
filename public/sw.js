const CACHE='am-studio-public-v1';const STATIC=['/styles.css','/icon.svg','/manifest.webmanifest'];
self.addEventListener('install',e=>{self.skipWaiting()});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('am-studio-')&&k!==CACHE).map(k=>caches.delete(k))))])));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;
if(!STATIC.includes(u.pathname)){e.respondWith(fetch(e.request,{cache:'no-store'}));return;}
e.respondWith(fetch(e.request).then(r=>{if(r.ok)e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,r.clone())));return r}).catch(()=>caches.match(e.request)));});
