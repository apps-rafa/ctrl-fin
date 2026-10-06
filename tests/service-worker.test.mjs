// Lógica do service worker (scripts/sw.template.js) rodando num "navegador" falso: cache primeiro para arquivos com hash, rede primeiro
// (com limite de 3 s) para as páginas, atualização em segundo plano para o resto, e limpeza de caches antigos ao ativar.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function novoSW({ rede }) {
  const lojas = new Map(); // nome -> Map(url -> Response)
  const chave = (r) => (typeof r === "string" ? r : r.url);
  const caches = {
    open: async (nome) => {
      if (!lojas.has(nome)) lojas.set(nome, new Map());
      const m = lojas.get(nome);
      return {
        match: async (r) => { const v = m.get(chave(r)); return v ? v.clone() : undefined; },
        put: async (r, res) => { m.set(chave(r), res); },
        add: async (r) => { const res = await rede(r); m.set(chave(r), res); },
      };
    },
    keys: async () => [...lojas.keys()],
    delete: async (n) => lojas.delete(n),
  };
  const ouvintes = {};
  const self = { location: new URL("https://x.test/ctrl-fin/sw.js"), addEventListener: (t, f) => { ouvintes[t] = f; }, skipWaiting: async () => {}, clients: { claim: async () => {} } };
  const codigo = fs.readFileSync(new URL("../scripts/sw.template.js", import.meta.url), "utf8")
    .replace("__VERSAO__", "v1").replace("__PRECACHE__", JSON.stringify(["app.aaa.js", "app.bbb.css"]));
  // no navegador, new Request("app.js") resolve o endereço relativo ao do service worker; aqui isso é imitado
  const RequestSW = class extends Request { constructor(u, i) { super(typeof u === "string" ? new URL(u, self.location).href : u, i); } };
  const ctx = vm.createContext({ self, caches, fetch: (r) => rede(r instanceof RequestSW || r instanceof Request ? r : new RequestSW(r)), Request: RequestSW, Response, URL, Promise, setTimeout, console });
  vm.runInContext(codigo, ctx);
  const evento = async (tipo, extra = {}) => { let p; await ouvintes[tipo]({ ...extra, waitUntil: (x) => { p = x; }, respondWith: (x) => { p = x; if (extra.respondWith) extra.respondWith(x); } }); return p ? await p : undefined; };
  return { lojas, evento, caches };
}
const txt = async (res) => (res ? res.text() : null);
const resp = (corpo, init) => new Response(corpo, init);

test("instalar: guarda os arquivos do núcleo e o index; ativar apaga caches de versões antigas", async () => {
  const sw = novoSW({ rede: async (r) => resp("conteudo de " + new URL(r.url).pathname) });
  await sw.lojas.set("ctrlfin-velho", new Map());
  await sw.evento("install");
  const guardados = [...sw.lojas.get("ctrlfin-v1").keys()].map((u) => new URL(u).pathname);
  assert.deepEqual(guardados.sort(), ["/ctrl-fin/app.aaa.js", "/ctrl-fin/app.bbb.css", "/ctrl-fin/index.html"].sort());
  await sw.evento("activate");
  assert.ok(!sw.lojas.has("ctrlfin-velho"), "cache de versão antiga some");
  assert.ok(sw.lojas.has("ctrlfin-v1"));
});

test("arquivo com hash: cache primeiro (não vai à rede se já guardado)", async () => {
  let idas = 0;
  const sw = novoSW({ rede: async () => { idas++; return resp("js"); } });
  const req = new Request("https://x.test/ctrl-fin/app.zzz.js");
  assert.equal(await txt(await sw.evento("fetch", { request: req })), "js");
  assert.equal(idas, 1);
  assert.equal(await txt(await sw.evento("fetch", { request: req })), "js");
  assert.equal(idas, 1, "2ª vez vem do cache");
});

test("página: rede primeiro (versão nova aparece); sem internet cai para a guardada", async () => {
  let versao = "A", online = true;
  const sw = novoSW({ rede: async () => { if (!online) throw new TypeError("offline"); return resp("index " + versao); } });
  const nav = () => { const r = new Request("https://x.test/ctrl-fin/?code=123"); Object.defineProperty(r, "mode", { value: "navigate" }); return r; };
  assert.equal(await txt(await sw.evento("fetch", { request: nav() })), "index A");
  versao = "B";
  assert.equal(await txt(await sw.evento("fetch", { request: nav() })), "index B", "com internet, sempre a nova");
  online = false;
  assert.equal(await txt(await sw.evento("fetch", { request: nav() })), "index B", "offline abre a última guardada (mesmo com ?code= no endereço)");
});

test("rede lenta (mais de 3 s): abre a versão guardada em vez de esperar", async () => {
  let lento = false;
  const sw = novoSW({ rede: async () => { if (lento) await new Promise((r) => setTimeout(r, 3600)); return resp("index nova"); } });
  const nav = () => { const r = new Request("https://x.test/ctrl-fin/"); Object.defineProperty(r, "mode", { value: "navigate" }); return r; };
  await sw.evento("fetch", { request: nav() }); // guarda
  lento = true;
  const t0 = Date.now();
  const res = await sw.evento("fetch", { request: nav() });
  assert.ok(Date.now() - t0 < 3500, "não esperou a rede lenta inteira");
  assert.equal(await txt(res), "index nova");
});

test("arquivo vendor.<hash>.js (supabase-js do próprio site): cache primeiro", async () => {
  let idas = 0;
  const sw = novoSW({ rede: async () => { idas++; return resp("lib"); } });
  const req = new Request("https://x.test/ctrl-fin/vendor.supabase.abc123.js");
  await sw.evento("fetch", { request: req });
  assert.equal(await txt(await sw.evento("fetch", { request: req })), "lib");
  assert.equal(idas, 1);
});

test("não mexe em escritas nem no que é de outros sites (API do Supabase)", async () => {
  const sw = novoSW({ rede: async () => resp("x") });
  let respondeu = false;
  const ouvir = async (request) => { let r = false; await sw.evento("fetch", { request, respondWith: () => { r = true; } }); return r; };
  assert.equal(await ouvir(new Request("https://x.test/ctrl-fin/api", { method: "POST", body: "{}" })), false);
  assert.equal(await ouvir(new Request("https://hhmuqgkabknquvhxafmf.supabase.co/rest/v1/transacoes")), false);
  assert.equal(await ouvir(new Request("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js")), true, "a biblioteca (versão fixa) é guardada");
  void respondeu;
});
