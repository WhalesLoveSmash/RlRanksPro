const CACHE = "rlranks-v1";
const ASSETS = [
  "/", "/index.html", "/style.css", "/script.js",
  "/ranks/2v2.json", "/site.webmanifest", "/icons/spark.svg"
];

self.addEventListener("install", e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate", e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE&&caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e=>{
  const {request} = e; if (request.method !== "GET") return;
  e.respondWith(
    caches.match(request).then(cached => cached ||
      fetch(request).then(resp=>{
        const copy = resp.clone();
        caches.open(CACHE).then(c=>c.put(request, copy));
        return resp;
      }).catch(()=> caches.match("/index.html"))
    )
  );
});