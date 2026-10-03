// Reply a um rascunho: categoria/forma de pagamento citadas trocam o campo; o resto vira descrição.
import test from "node:test";
import assert from "node:assert/strict";
import { aplicarRespostaAoRascunho } from "../supabase/functions/telegram-webhook/parser.ts";

const cats = [{ nome: "Saúde", categoria_tipo: "saidas" }, { nome: "Mercado", categoria_tipo: "saidas" }, { nome: "Salário", categoria_tipo: "entradas" }];
const mets = [
  { nome: "PIX", metodo_kind: "PIX", banco: null, dia_fechamento: null },
  { nome: "Nubank", metodo_kind: "Crédito", banco: "Nubank", dia_fechamento: 10 },
];
const base = { tipo: "saidas", valor: 50, descricao: "Compra X", categoria: "Outros", metodo: "Crédito Nubank", metodoKind: "Crédito", diaFechamento: 10, data: "2026-10-03", competencia: "2026-11-01" };

test("reply com nome de categoria troca a categoria e mantém a descrição", () => {
  const r = aplicarRespostaAoRascunho(base, "Saúde", cats, mets);
  assert.equal(r.categoria, "Saúde");
  assert.equal(r.descricao, "Compra X");
});
test("reply 'PIX' troca a forma de pagamento", () => {
  const r = aplicarRespostaAoRascunho(base, "PIX", cats, mets);
  assert.equal(r.metodo, "PIX"); assert.equal(r.metodoKind, "PIX");
  assert.equal(r.competencia, null);
  assert.equal(r.descricao, "Compra X");
});
test("categoria + forma + descrição na mesma resposta", () => {
  const r = aplicarRespostaAoRascunho(base, "mercado pix padaria do zé", cats, mets);
  assert.equal(r.categoria, "Mercado"); assert.equal(r.metodo, "PIX"); assert.equal(r.descricao, "Padaria do zé");
});
test("texto sem categoria/forma vira descrição", () => {
  assert.equal(aplicarRespostaAoRascunho(base, "almoço com a equipe", cats, mets).descricao, "Almoço com a equipe");
});
test("receita não troca forma de pagamento", () => {
  const r = aplicarRespostaAoRascunho({ ...base, tipo: "entradas", metodo: null, metodoKind: null }, "pix", cats, mets);
  assert.equal(r.metodo, null); assert.equal(r.descricao, "Pix");
});
