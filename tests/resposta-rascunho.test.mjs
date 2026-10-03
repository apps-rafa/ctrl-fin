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

const HOJE = "2026-10-03";
const ap = (r, t) => aplicarRespostaAoRascunho(r, t, cats, mets, HOJE);

test("'receita' troca o tipo (sem forma de pagamento, categoria válida do tipo)", () => {
  const r = ap(base, "receita");
  assert.equal(r.tipo, "entradas"); assert.equal(r.metodo, null); assert.equal(r.parcelas ?? null, null);
  assert.equal(r.categoria, "Salário"); // "Outros" não existe em receita na lista de teste -> fallback do tipo
  assert.equal(r.descricao, "Compra X");
});
test("'despesa' volta de receita e põe uma forma de pagamento", () => {
  const rec = { ...base, tipo: "entradas", metodo: null, metodoKind: null, categoria: "Salário" };
  const r = ap(rec, "despesa");
  assert.equal(r.tipo, "saidas"); assert.equal(r.metodo, "PIX"); assert.notEqual(r.categoria, "Salário");
});
test("novo valor", () => {
  assert.equal(ap(base, "80,50").valor, 80.5);
  assert.equal(ap(base, "r$ 120").valor, 120);
  assert.equal(ap(base, "120").descricao, "Compra X");
});
test("número dentro de descrição não vira valor", () => {
  const r = ap(base, "apartamento 302");
  assert.equal(r.valor, 50); assert.equal(r.descricao, "Apartamento 302");
});
test("data numérica e relativa", () => {
  assert.equal(ap(base, "25/09").data, "2026-09-25");
  assert.equal(ap(base, "foi ontem").data, "2026-10-02");
  assert.equal(ap(base, "foi ontem").descricao, "Compra X");
  assert.equal(ap(base, "semana passada").data, "2026-09-26");
  assert.equal(ap(base, "mês passado").data, "2026-09-03");
  assert.equal(ap(base, "há 3 dias").data, "2026-09-30");
  assert.equal(ap(base, "ontem").competencia, null);
});
test("parcelado em 5 (crédito) e à vista", () => {
  assert.equal(ap(base, "parcelado em 5").parcelas, 5);
  assert.equal(ap(base, "parcelado em 5").valor, 50);
  assert.equal(ap({ ...base, parcelas: 10 }, "à vista").parcelas, null);
  assert.equal(ap({ ...base, parcelas: 10 }, "5x").parcelas, 5);
});
test("parcelas ignoradas fora do crédito", () => {
  const pix = { ...base, metodo: "PIX", metodoKind: "PIX", diaFechamento: null };
  assert.equal(ap(pix, "parcelado em 5").parcelas ?? null, null);
});
