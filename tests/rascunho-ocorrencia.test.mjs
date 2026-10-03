// Confirmar o rascunho de uma OCORRÊNCIA de recorrência atualiza a linha existente (nunca insere outra).
import test from "node:test";
import assert from "node:assert/strict";
import { confirmarRascunhoNoBanco } from "../supabase/functions/telegram-webhook/lancamentos.ts";

function fakeAdmin(linhasAtualizadas) {
  const chamadas = [];
  const cadeia = (op, payload) => {
    const c = { op, payload, filtros: [] };
    chamadas.push(c);
    const q = { eq(k, v) { c.filtros.push([k, v]); return q; }, select() { return Promise.resolve({ data: linhasAtualizadas, error: null }); }, then(f) { return Promise.resolve({ error: null }).then(f); } };
    return q;
  };
  return { chamadas, from: () => ({ update: (p) => cadeia("update", p), insert: (p) => cadeia("insert", p) }) };
}
const d = { tipo: "saidas", valor: 160, descricao: "Luz", categoria: "Casa", metodo: "PIX", metodoKind: "PIX", diaFechamento: null, data: "2026-11-05", ocorrenciaId: 42 };

test("ocorrência: atualiza só a linha a_confirmar do usuário, sem inserir", async () => {
  const a = fakeAdmin([{ id: 42 }]);
  const { erro } = await confirmarRascunhoNoBanco(a, "u1", d);
  assert.equal(erro, null);
  assert.equal(a.chamadas.length, 1);
  assert.equal(a.chamadas[0].op, "update");
  assert.equal(a.chamadas[0].payload.a_confirmar, false);
  assert.deepEqual(a.chamadas[0].filtros, [["id", 42], ["user_id", "u1"], ["a_confirmar", true]]);
});

test("ocorrência já confirmada/apagada no app: erro, nada é inserido", async () => {
  const a = fakeAdmin([]);
  const { erro } = await confirmarRascunhoNoBanco(a, "u1", d);
  assert.match(String(erro.message), /já foi confirmada ou apagada/);
  assert.ok(a.chamadas.every((c) => c.op !== "insert"));
});
