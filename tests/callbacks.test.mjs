// Fluxo de edição pelo bot (/ultimos -> número -> botão Editar), com Supabase e Telegram simulados.
import test from "node:test";
import assert from "node:assert/strict";
import { tratarUltimoEditar, tratarRascunhoEditar } from "../supabase/functions/telegram-webhook/callbacks.ts";

/** Supabase falso: cada tabela devolve as linhas dadas; .eq/.order/.select encadeiam e maybeSingle pega a 1ª. */
function fakeAdmin(tabelas) {
  return {
    from(nome) {
      const rows = tabelas[nome] ?? [];
      const q = {
        select: () => q, update: () => q, insert: () => q, eq: () => q, order: () => q, limit: () => q, in: () => q,
        maybeSingle: async () => ({ data: rows[0] ?? null }),
        then: (ok) => ok({ data: rows, error: null }),
      };
      return q;
    },
  };
}

function capturaTelegram() {
  const chamadas = [];
  globalThis.fetch = async (url, init) => {
    chamadas.push({ metodo: String(url).split("/").pop(), corpo: JSON.parse(init.body) });
    return { ok: true, text: async () => "" };
  };
  return chamadas;
}

const menus = [
  { nome: "Alimentação", categoria_tipo: "saidas" }, { nome: "Estorno", categoria_tipo: "saidas" }, { nome: "Salário", categoria_tipo: "entradas" },
  { nome: "Crédito — Bradesco", metodo_kind: "Crédito", banco: "Bradesco", dia_fechamento: 5 },
];

test("ultedit: abre o Mini App com os dados do lançamento escolhido", async () => {
  const tg = capturaTelegram();
  const admin = fakeAdmin({
    telegram_users: [{ user_id: "u1" }],
    transacoes: [{ id: 77, tipo: "saidas", valor: 9.92, data: "2026-09-21", categoria: "Alimentação", descricao: "Uber ensaio", metodo: "Crédito Bradesco", competencia: "2026-10-01", parcelas_total: null }],
    menu_itens: menus,
  });
  await tratarUltimoEditar({ supabaseAdmin: admin, token: "T", cq: { id: "cb" }, chatId: 1, idStr: "77", acao: "ultedit" });
  const msg = tg.find((c) => c.metodo === "sendMessage");
  assert.match(msg.corpo.text, /despesa de .*9,92 no dia 21\/09\/2026 \(Uber ensaio\)/);
  const botao = msg.corpo.reply_markup.keyboard[0][0];
  assert.equal(botao.text, "✏️ Editar");
  const url = new URL(botao.web_app.url);
  assert.equal(url.searchParams.get("id"), "t77"); // "t<id>": o bot atualiza em vez de criar
  assert.equal(url.searchParams.get("v"), "9.92");
  assert.equal(url.searchParams.get("d"), "2026-09-21");
});

test("ultedit: parcelado manda editar pelo app", async () => {
  const tg = capturaTelegram();
  const admin = fakeAdmin({
    telegram_users: [{ user_id: "u1" }],
    transacoes: [{ id: 5, tipo: "saidas", valor: 10, data: "2026-09-21", parcelas_total: 3 }],
  });
  await tratarUltimoEditar({ supabaseAdmin: admin, token: "T", cq: { id: "cb" }, chatId: 1, idStr: "5", acao: "ultedit" });
  assert.equal(tg.some((c) => c.metodo === "sendMessage"), false);
  assert.match(tg.find((c) => c.metodo === "answerCallbackQuery").corpo.text, /parcelado/);
});

test("nleditar: rascunho inexistente avisa e não abre nada", async () => {
  const tg = capturaTelegram();
  const admin = fakeAdmin({ telegram_users: [{ user_id: "u1" }], telegram_rascunhos: [] });
  await tratarRascunhoEditar({ supabaseAdmin: admin, token: "T", cq: { id: "cb" }, chatId: 1, idStr: "9", acao: "nleditar" });
  assert.equal(tg.some((c) => c.metodo === "sendMessage"), false);
  assert.match(tg[0].corpo.text, /já não existe/);
});
