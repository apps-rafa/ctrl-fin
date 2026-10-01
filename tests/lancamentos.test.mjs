import test from "node:test";
import assert from "node:assert/strict";
import { limparRascunhosAntigos } from "../supabase/functions/telegram-webhook/lancamentos.ts";

test("limparRascunhosAntigos apaga só rascunhos com mais de 7 dias", async () => {
  const chamadas = [];
  const admin = { from: (nome) => ({ delete: () => ({ lt: async (col, val) => { chamadas.push({ nome, col, val }); return { error: null }; } }) }) };
  const antes = Date.now();
  await limparRascunhosAntigos(admin);
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].nome, "telegram_rascunhos");
  assert.equal(chamadas[0].col, "criado_em");
  const idade = antes - new Date(chamadas[0].val).getTime();
  assert.ok(Math.abs(idade - 7 * 24 * 3600 * 1000) < 5000, "limite deve ser ~7 dias atrás");
});
