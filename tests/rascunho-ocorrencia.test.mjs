// Confirmar o rascunho de uma OCORRÊNCIA de recorrência atualiza a linha existente (nunca insere outra).
import test from "node:test";
import assert from "node:assert/strict";
import { confirmarRascunhoNoBanco } from "../supabase/functions/telegram-webhook/lancamentos.ts";
import { bancoFalso } from "./helpers/banco-falso.mjs";

const d = { tipo: "saidas", valor: 160, descricao: "Luz", categoria: "Casa", metodo: "PIX", metodoKind: "PIX", diaFechamento: null, data: "2026-11-05", ocorrenciaId: 42 };
const oc = (extra = {}) => ({ id: 42, user_id: "u1", recorrencia_id: 7, data: "2026-11-01", valor: 150, a_confirmar: true, ...extra });

test("ocorrência: atualiza só a linha a_confirmar do usuário, sem inserir", async () => {
  const banco = bancoFalso({ transacoes: [oc()] });
  const { erro, id } = await confirmarRascunhoNoBanco(banco, "u1", d);
  assert.equal(erro, null);
  assert.equal(id, 42);
  assert.equal(banco.tabelas.transacoes.length, 1);
  assert.equal(banco.tabelas.transacoes[0].a_confirmar, false);
  assert.equal(banco.tabelas.transacoes[0].data, "2026-11-05");
});

test("ocorrência já confirmada/apagada no app: erro, nada é inserido", async () => {
  const banco = bancoFalso({ transacoes: [oc({ a_confirmar: false })] });
  const { erro } = await confirmarRascunhoNoBanco(banco, "u1", d);
  assert.match(String(erro.message), /já foi confirmada ou apagada/);
  assert.equal(banco.tabelas.transacoes.length, 1);
});

test("a recorrência já tem lançamento nessa data: atualiza esse e descarta a ocorrência (sem erro de chave única)", async () => {
  const banco = bancoFalso({ transacoes: [oc(), { id: 50, user_id: "u1", recorrencia_id: 7, data: "2026-11-05", valor: 150, a_confirmar: false }] });
  const { erro, id } = await confirmarRascunhoNoBanco(banco, "u1", d);
  assert.equal(erro, null);
  assert.equal(id, 50);
  assert.deepEqual(banco.tabelas.transacoes.map((t) => [t.id, t.valor]), [[50, 160]]);
});
