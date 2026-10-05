// E-mail de conta: comparar com os lançamentos que já existem antes de criar/atualizar qualquer coisa.
import test from "node:test";
import assert from "node:assert/strict";
import { buscarSimilares } from "../supabase/functions/telegram-webhook/email.ts";

// admin falso: from().select().eq()...order() devolve as linhas já "filtradas" pelo teste
const adminCom = (linhas) => {
  const q = { select: () => q, eq: () => q, gte: () => q, lte: () => q, order: () => Promise.resolve({ data: linhas }) };
  return { from: () => q };
};
const rec = { id: 4, descricao: "Internet Predial", categoria: "Casa", remetentes: "" };
const t = (o) => ({ id: 1, data: "2026-10-26", valor: 99.9, descricao: "Internet Predial", categoria: "Casa", recorrencia_id: null, ...o });

test("parecido pela descrição (mesmas palavras da recorrência)", async () => {
  const r = await buscarSimilares(adminCom([t({ id: 7, descricao: "predialnet fatura" })]), "u", rec, { valor: null, vencimento: "2026-10-26" }, "2026-10-05");
  assert.deepEqual(r.map((x) => x.id), [7]);
});
test("parecido por ser da própria recorrência", async () => {
  const r = await buscarSimilares(adminCom([t({ id: 8, descricao: "x", recorrencia_id: 4 })]), "u", rec, { valor: null, vencimento: null }, "2026-10-05");
  assert.deepEqual(r.map((x) => x.id), [8]);
});
test("mesmo valor na mesma data (±3 dias) conta; mesmo valor em data distante não", async () => {
  const dados = { valor: 99.9, vencimento: "2026-10-26" };
  const perto = await buscarSimilares(adminCom([t({ id: 9, descricao: "outra coisa", data: "2026-10-27" })]), "u", rec, dados, "2026-10-05");
  assert.deepEqual(perto.map((x) => x.id), [9]);
  const longe = await buscarSimilares(adminCom([t({ id: 10, descricao: "outra coisa", data: "2026-10-12" })]), "u", rec, dados, "2026-10-05");
  assert.deepEqual(longe, []);
});
test("nada parecido: lista vazia (segue o fluxo normal)", async () => {
  const r = await buscarSimilares(adminCom([t({ id: 11, descricao: "mercado", valor: 50 })]), "u", rec, { valor: 120, vencimento: "2026-10-26" }, "2026-10-05");
  assert.deepEqual(r, []);
});
