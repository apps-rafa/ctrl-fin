// Envio do formulário do Mini App: edição de lançamento existente (id "t<id>") x criação a partir de rascunho.
import test from "node:test";
import assert from "node:assert/strict";
import { tratarFormularioMiniApp } from "../supabase/functions/telegram-webhook/comandos.ts";

function fakeAdmin(tabelas, registro) {
  return {
    from(nome) {
      const rows = tabelas[nome] ?? [];
      const q = {
        select: () => q, eq: () => q, order: () => q, in: () => q,
        update: (v) => { registro.push({ op: "update", nome, v }); return q; },
        insert: (v) => { registro.push({ op: "insert", nome, v }); return q; },
        delete: () => { registro.push({ op: "delete", nome }); return q; },
        maybeSingle: async () => ({ data: rows[0] ?? null }),
        then: (ok) => ok({ data: rows, error: null }),
      };
      return q;
    },
  };
}
const menus = [
  { nome: "Alimentação", categoria_tipo: "saidas" }, { nome: "Estorno", categoria_tipo: "saidas" },
  { nome: "Crédito — Bradesco", metodo_kind: "Crédito", banco: "Bradesco", dia_fechamento: 5 },
];
const upd = (dados) => ({ message: { chat: { id: 1 }, web_app_data: { data: JSON.stringify(dados) } } });
const base = { tipo: "saidas", data: "2026-09-21", valor: 9.92, categoria: "Alimentação", metodo: "Crédito Bradesco", descricao: "Uber", parcelas: 1, comp: "10" };

test("formulário com id t<id> ATUALIZA o lançamento (não cria outro)", async () => {
  globalThis.fetch = async () => ({ ok: true, text: async () => "" });
  const reg = [];
  const admin = fakeAdmin({ telegram_users: [{ user_id: "u1" }], menu_itens: menus }, reg);
  await tratarFormularioMiniApp({ update: upd({ ...base, id: "t77" }), supabaseAdmin: admin, token: "T" });
  const up = reg.find((r) => r.op === "update" && r.nome === "transacoes");
  assert.ok(up, "deveria atualizar transacoes");
  assert.equal(up.v.valor, 9.92);
  assert.equal(up.v.descricao, "Uber");
  assert.equal(up.v.competencia, "2026-10-01");
  assert.equal(reg.some((r) => r.op === "insert" && r.nome === "transacoes"), false);
});

test("formulário com id numérico de rascunho CRIA o lançamento e apaga só aquele rascunho", async () => {
  globalThis.fetch = async () => ({ ok: true, text: async () => "" });
  const reg = [];
  const admin = fakeAdmin({ telegram_users: [{ user_id: "u1" }], menu_itens: menus }, reg);
  await tratarFormularioMiniApp({ update: upd({ ...base, id: "12" }), supabaseAdmin: admin, token: "T" });
  assert.ok(reg.some((r) => r.op === "insert" && r.nome === "transacoes"));
  assert.ok(reg.some((r) => r.op === "delete" && r.nome === "telegram_rascunhos"));
});

test("formulário com categoria inválida não grava nada", async () => {
  globalThis.fetch = async () => ({ ok: true, text: async () => "" });
  const reg = [];
  const admin = fakeAdmin({ telegram_users: [{ user_id: "u1" }], menu_itens: menus }, reg);
  await tratarFormularioMiniApp({ update: upd({ ...base, categoria: "Inexistente", id: "t1" }), supabaseAdmin: admin, token: "T" });
  assert.equal(reg.some((r) => r.nome === "transacoes"), false);
});
