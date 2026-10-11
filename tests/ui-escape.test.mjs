// Texto vindo de fora (descrição do banco/Pluggy, nome de conta) nunca vira HTML na lista de lançamentos.
// Roda js/ui.js num contexto isolado com um DOM mínimo de mentira (só o necessário para os scripts carregarem).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const el = () => ({ addEventListener() {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, style: {}, dataset: {}, querySelector: () => null, querySelectorAll: () => [] });
const ctx = vm.createContext({
  console,
  window: { supabase: { createClient: () => ({ from: () => ({}) }) }, addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) },
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: el, body: el(), documentElement: el() },
  localStorage: { getItem: () => null, setItem() {} },
  requestAnimationFrame: () => 0, ResizeObserver: class { observe() {} }, MutationObserver: class { observe() {} },
});
for (const f of ["config", "state", "recorrencia", "feriados", "utils", "menus-api", "data", "ui"]) {
  vm.runInContext(fs.readFileSync(new URL(`../js/${f}.js`, import.meta.url), "utf8"), ctx, { filename: `${f}.js` });
}
vm.runInContext("estadoApp.menus = { metodos: [], cores: { categoria: {}, metodo: {} } };", ctx);

const html = (descricao) => {
  ctx.__t = { id: 1, tipo: "saidas", data: "2026-10-05", valor: 10, descricao, categoria: "Casa", metodo: "PIX" };
  return vm.runInContext("gerarHTMLTransacao(__t, 'saida')", ctx);
};

test("escaparHtml: < > & \" viram entidades", () => {
  assert.equal(ctx.escaparHtml(`<b a="1">x & y</b>`), "&lt;b a=&quot;1&quot;&gt;x &amp; y&lt;/b&gt;");
  assert.equal(ctx.escaparHtml(null), "");
});

test("descrição com HTML (ex.: vinda do banco) aparece como texto, sem tag nenhuma", () => {
  const h = html('<img src=x onerror="alert(1)"> A&B');
  assert.match(h, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; A&amp;B/);
  assert.doesNotMatch(h, /<img/);
});

test("descrição comum continua igual e vazia segue com o espaço reservado", () => {
  assert.match(html("Mercado do João"), />Mercado do João</);
  assert.match(html(""), /despesa-desc--vazia/);
});
