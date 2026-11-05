// E-mail de conta: só é "parecido" o que tem o MESMO valor e a MESMA data.
import test from "node:test";
import assert from "node:assert/strict";
import { buscarSimilares } from "../supabase/functions/telegram-webhook/email.ts";

// admin falso: from().select().eq()...order() devolve as linhas do teste (o filtro de data/valor é refeito em JS)
const adminCom = (linhas) => {
  const q = { select: () => q, eq: () => q, gte: () => q, lte: () => q, order: () => Promise.resolve({ data: linhas }) };
  return { from: () => q };
};
const rec = { id: 4, descricao: "Gás Naturgy", categoria: "Casa" };
const t = (o) => ({ id: 1, data: "2026-10-26", valor: 68.06, descricao: "Gás Naturgy", categoria: "Casa", recorrencia_id: 4, ...o });

test("mesmo valor e mesma data (vencimento do e-mail) é parecido", async () => {
  const r = await buscarSimilares(adminCom([t({ id: 7 })]), "u", rec, { valor: 68.06, vencimento: "2026-10-26" }, "2026-10-05");
  assert.deepEqual(r.map((x) => x.id), [7]);
});
test("mesmo nome e mesma recorrência, mas valor diferente: não é parecido", async () => {
  const r = await buscarSimilares(adminCom([t({ id: 8, valor: 67.87 })]), "u", rec, { valor: 68.06, vencimento: "2026-10-26" }, "2026-10-05");
  assert.deepEqual(r, []);
});
test("mesmo valor em outra data (até 1 dia): não é parecido", async () => {
  const r = await buscarSimilares(adminCom([t({ id: 9, data: "2026-10-27" })]), "u", rec, { valor: 68.06, vencimento: "2026-10-26" }, "2026-10-05");
  assert.deepEqual(r, []);
});
test("sem vencimento no e-mail: usa a data cadastrada no app; sem ela, a de chegada", async () => {
  const dados = { valor: 68.06, vencimento: null };
  const app = await buscarSimilares(adminCom([t({ id: 10 })]), "u", rec, dados, "2026-10-05", "2026-10-26");
  assert.deepEqual(app.map((x) => x.id), [10]);
  const chegada = await buscarSimilares(adminCom([t({ id: 11, data: "2026-10-05" })]), "u", rec, dados, "2026-10-05");
  assert.deepEqual(chegada.map((x) => x.id), [11]);
  const outra = await buscarSimilares(adminCom([t({ id: 12 })]), "u", rec, dados, "2026-10-05");
  assert.deepEqual(outra, []);
});
test("e-mail sem valor: nada é parecido", async () => {
  const r = await buscarSimilares(adminCom([t({ id: 13 })]), "u", rec, { valor: null, vencimento: "2026-10-26" }, "2026-10-05");
  assert.deepEqual(r, []);
});
