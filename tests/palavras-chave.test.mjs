// Palavras-chave por categoria: a busca do servidor (_shared/palavras-chave.ts) e a cópia do navegador (js/pluggy.js)
// têm de dar o mesmo resultado, e a migração do banco tem de trazer os mesmos padrões do cadastro de novos usuários.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { categoriaPorPalavraChave } from "../supabase/functions/_shared/palavras-chave.ts";
import { sugerirCategoriaTexto } from "../supabase/functions/telegram-webhook/parser.ts";
import { PADRAO, comPalavras } from "./helpers/palavras-padrao.mjs";

const ler = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const ctx = vm.createContext({});
const pluggy = ler("js/pluggy.js");
vm.runInContext(pluggy.slice(pluggy.indexOf("function _normalizarPalavraChave"), pluggy.indexOf("/** Sugestão de categoria calculada no cliente")) + "\nthis.cliente = categoriaPorPalavraChaveCliente;", ctx);

const DESPESAS = ["Saúde", "Mercado", "Alimentação", "Transporte app", "Transporte", "Assinaturas", "Lazer", "Educação", "Casa"].map((n) => comPalavras(n, "saidas"));

test("migração do banco traz os mesmos padrões do cadastro de novos usuários", () => {
  const sql = ler("supabase/migrations/20261106_palavras_chave_categorias.sql");
  const doSql = {};
  for (const m of sql.matchAll(/palavras_chave = array\[(.+?)\] where tipo = 'Categoria' and nome = '([^']+)'/g)) {
    doSql[m[2]] = [...m[1].matchAll(/'((?:[^']|'')*)'/g)].map((x) => x[1].replace(/''/g, "'"));
  }
  assert.deepEqual(doSql, PADRAO);
});

test("uber vai para Transporte app; táxi para Transporte", () => {
  assert.equal(categoriaPorPalavraChave("UBER *TRIP help.uber.com", DESPESAS)?.nome, "Transporte app");
  assert.equal(categoriaPorPalavraChave("táxi pro aeroporto", DESPESAS)?.nome, "Transporte");
});

test("a palavra vale no início de uma palavra do texto: 'posto' não pega 'imposto'; 'gás' não pega 'gastei'", () => {
  assert.equal(categoriaPorPalavraChave("Drogarias Imperial Ltda", DESPESAS)?.nome, "Saúde");
  assert.equal(categoriaPorPalavraChave("imposto de renda", DESPESAS), null);
  assert.equal(categoriaPorPalavraChave("gastei 50 em xyz", DESPESAS), null);
  assert.equal(categoriaPorPalavraChave("conta de gás", DESPESAS)?.nome, "Casa");
  assert.equal(categoriaPorPalavraChave("conta de gas", DESPESAS)?.nome, "Casa");
});

test("várias categorias casando: vale a palavra mais longa", () => {
  assert.equal(categoriaPorPalavraChave("gasolina no posto", DESPESAS)?.nome, "Transporte");
  const cats = [{ nome: "A", palavras_chave: ["mercado"] }, { nome: "B", palavras_chave: ["mercado pago"] }];
  assert.equal(categoriaPorPalavraChave("mercado pago", cats)?.nome, "B");
});

test("lista do usuário manda: sem palavras (ou null) não sugere; palavra nova passa a valer", () => {
  assert.equal(categoriaPorPalavraChave("uber", [{ nome: "Transporte app", palavras_chave: [] }]), null);
  assert.equal(categoriaPorPalavraChave("uber", [{ nome: "Transporte app" }]), null);
  assert.equal(categoriaPorPalavraChave("padaria do zé", [{ nome: "Padaria", palavras_chave: ["padaria"] }])?.nome, "Padaria");
});

test("o bot usa as palavras da categoria (e 'Outros' quando nada casa)", () => {
  const cats = [...DESPESAS, comPalavras("Outros", "saidas")];
  assert.equal(sugerirCategoriaTexto("uber 20", "saidas", cats).nome, "Transporte app");
  assert.equal(sugerirCategoriaTexto("xyz 20", "saidas", cats).nome, "Outros");
  const semUber = DESPESAS.map((c) => (c.nome === "Transporte app" ? { ...c, palavras_chave: ["99"] } : c));
  assert.equal(sugerirCategoriaTexto("uber 20", "saidas", [...semUber, comPalavras("Outros", "saidas")]).nome, "Outros");
});

test("a busca do navegador dá o mesmo resultado que a do servidor", () => {
  const textos = ["UBER *TRIP", "Drogarias Imperial", "imposto de renda", "gastei 50 em xyz", "conta de gás", "gasolina no posto", "Pão de Açúcar", "luzes de natal", "luz", "netflix.com", "", "SMART FIT academia"];
  for (const t of textos) {
    const s = categoriaPorPalavraChave(t, DESPESAS);
    const c = ctx.cliente(t, JSON.parse(JSON.stringify(DESPESAS)));
    assert.deepEqual(c && { nome: c.nome, termo: c.termo }, s, `texto: ${t}`);
  }
});
