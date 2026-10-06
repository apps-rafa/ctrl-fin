// Service worker do app (copiado para dist/sw.js pelo build, com a lista de arquivos e a versão preenchidas).
// Objetivo: o app abre na hora nas visitas seguintes (JS/CSS vêm do aparelho) e abre até sem internet (os DADOS é que precisam de rede).
//  - Páginas (index.html, mini app): REDE PRIMEIRO (sempre pega a versão nova quando há internet; com rede lenta, em 3 s abre a guardada).
//  - app.<hash>.js/css e mod.<hash>.js: nome com hash = nunca muda → CACHE PRIMEIRO.
//  - Imagens e CSS soltos: usa o guardado e atualiza em segundo plano.
//  - supabase-js do CDN (versão fixa): cache primeiro. Todo o resto (API do Supabase, Telegram, etc.) passa direto, sem cache.
const VERSAO = "__VERSAO__";
const CACHE = "ctrlfin-" + VERSAO;
const PRECACHE = __PRECACHE__;
const INDEX = new URL("./index.html", self.location).href;

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all([...PRECACHE.map((u) => c.add(new Request(u, { cache: "reload" }))), c.add(new Request(INDEX, { cache: "reload" }))]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("ctrlfin-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const guardavel = (res) => res && (res.ok || res.type === "opaque");

async function cachePrimeiro(req) {
  const c = await caches.open(CACHE);
  const guardado = await c.match(req);
  if (guardado) return guardado;
  const res = await fetch(req);
  if (guardavel(res)) c.put(req, res.clone());
  return res;
}

async function atualizaEmSegundoPlano(req) {
  const c = await caches.open(CACHE);
  const guardado = await c.match(req);
  const rede = fetch(req).then((res) => { if (guardavel(res)) c.put(req, res.clone()); return res; });
  if (guardado) { rede.catch(() => {}); return guardado; }
  return rede;
}

async function paginaRedePrimeiro(req) {
  const c = await caches.open(CACHE);
  const url = new URL(req.url);
  const ehIndex = req.mode === "navigate" && (url.pathname.endsWith("/") || url.pathname.endsWith("/index.html"));
  const chave = ehIndex ? INDEX : req; // qualquer endereço do app (com ?code= do login, por exemplo) usa o mesmo index guardado
  const rede = fetch(req, { cache: "no-cache" }).then((res) => { if (res.ok) c.put(chave, res.clone()); return res; });
  const demora = new Promise((resolve) => setTimeout(resolve, 3000, null));
  try {
    const res = await Promise.race([rede, demora]);
    if (res) return res;
    return (await c.match(chave)) || rede; // rede lenta: abre a versão guardada (a nova fica guardada para a próxima)
  } catch (_) {
    return (await c.match(chave)) || Response.error(); // sem internet
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (req.mode === "navigate" || url.pathname.endsWith(".html")) return e.respondWith(paginaRedePrimeiro(req));
    if (/\/(app|mod)\.[^/]+\.(js|css)$/.test(url.pathname)) return e.respondWith(cachePrimeiro(req));
    return e.respondWith(atualizaEmSegundoPlano(req));
  }
  if (url.hostname === "cdn.jsdelivr.net") return e.respondWith(cachePrimeiro(req));
});
