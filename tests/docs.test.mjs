// Estrutura da Documentação do app (js/docs.js): links {ver:id} válidos, "+ detalhes" ligados a um item que existe,
// todo item com título e resumo, e a busca funcionando com qualquer item (o complemento "m" é opcional).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const elementos = {};
const el = (id) => (elementos[id] ??= { id, value: "", innerHTML: "", hidden: false, style: {}, dataset: {}, addEventListener() {}, querySelectorAll: () => [], classList: { contains: () => false, add() {}, remove() {}, toggle() {} } });
const ctx = vm.createContext({ window: { addEventListener() {} }, document: { getElementById: (id) => (["docsBusca", "docsConteudo"].includes(id) ? el(id) : null), querySelector: () => null, querySelectorAll: () => [], readyState: "complete", addEventListener() {} } });
vm.runInContext(fs.readFileSync(new URL("../js/docs.js", import.meta.url), "utf8"), ctx, { filename: "docs.js" });
const SECOES = vm.runInContext("DOCS_SECOES", ctx);
const DETALHES = vm.runInContext("DOCS_DETALHES", ctx);

test("seções com id único e itens com título e resumo", () => {
  const ids = SECOES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of SECOES) for (const it of s.itens) {
    assert.ok(it.t && it.r, `item sem título/resumo em ${s.id}`);
  }
});

test("todo {ver:id} aponta para uma seção que existe", () => {
  const ids = new Set(SECOES.map((s) => s.id));
  const texto = JSON.stringify(SECOES) + JSON.stringify(DETALHES);
  const quebrados = [...texto.matchAll(/\{ver:(\w+)\}/g)].map((m) => m[1]).filter((id) => !ids.has(id));
  assert.deepEqual(quebrados, []);
});

test("todo '+ detalhes' corresponde a um item pelo título", () => {
  const titulos = new Set(SECOES.flatMap((s) => s.itens.map((it) => it.t)));
  assert.deepEqual(Object.keys(DETALHES).filter((k) => !titulos.has(k)), []);
});

test("a busca acha itens sem quebrar (inclusive item sem complemento)", () => {
  assert.ok(SECOES.some((s) => s.itens.some((it) => !it.m)), "há pelo menos um item sem 'm' para o teste valer");
  el("docsBusca").value = "notificações";
  vm.runInContext("renderDocs()", ctx);
  assert.match(el("docsConteudo").innerHTML, /Notificações/);
});
