import test from "node:test";
import assert from "node:assert/strict";
import { montarLembretes, montarMensagemVencimentos, corpoAvisoVencimentos, diaVencimentoNoMes, tecladoPagoVencimentos, rotuloBotaoPago, tratarPagoVencimento } from "../supabase/functions/telegram-webhook/lembretes.ts";
import { hojeBrasiliaISO } from "../supabase/functions/telegram-webhook/parser.ts";

/** Captura as chamadas ao Telegram (fetch) para conferir o que o bot envia. */
function capturaTelegram() {
  const chamadas = [];
  globalThis.fetch = async (url, init) => {
    chamadas.push({ metodo: String(url).split("/").pop(), corpo: JSON.parse(init.body) });
    return { ok: true, text: async () => "" };
  };
  return chamadas;
}

const HOJE = "2026-10-13";
const antes = "2026-10-01T15:00:00Z";           // criado antes de hoje
const hojeCriado = "2026-10-13T14:00:00Z";      // criado hoje (11h BRT)
const metodos = [
  { nome: "PIX", metodo_kind: "PIX", banco: null, dia_vencimento: null },
  { nome: "Crédito — Bradesco", metodo_kind: "Crédito", banco: "Bradesco", dia_vencimento: 13 },
  { nome: "Crédito — Nubank", metodo_kind: "Crédito", banco: "Nubank", dia_vencimento: 20 },
];
const tx = (o) => ({ id: 1, tipo: "saidas", data: HOJE, valor: 100, categoria: "Casa", descricao: "Condomínio", metodo: "PIX", competencia: "2026-10-01", quitada: false, origem: null, criado_em: antes, ...o });
const base = { userId: "u1", hojeISO: HOJE, metodos, faturasPagas: [], jaEnviados: new Set() };
const soTx = (l) => l.filter((x) => x.chave.includes(":tx:"));
const soFat = (l) => l.filter((x) => x.chave.includes(":fat:"));

test("despesa fora do cartão que vence hoje gera um vencimento com os dados do lançamento", () => {
  const [l] = montarLembretes({ ...base, transacoes: [tx({})] });
  const msg = montarMensagemVencimentos(HOJE, [l]);
  assert.match(msg, /Vencimentos de hoje \(13\/10\/2026\)/);
  assert.match(msg, /Condomínio — .*100,00/);
  assert.match(msg, /Categoria: Casa/);
  assert.match(msg, /Forma de pgto\.: PIX/);
  assert.equal(l.chave, "lembrete:u1:tx:1");
});

test("receita não gera lembrete; despesa de outro dia também não", () => {
  assert.equal(soTx(montarLembretes({ ...base, transacoes: [tx({ tipo: "entradas" }), tx({ id: 2, data: "2026-10-14" })] })).length, 0);
});

test("lançado hoje, quitado ou vindo do banco não geram lembrete", () => {
  const r = montarLembretes({ ...base, transacoes: [tx({ id: 3, criado_em: hojeCriado }), tx({ id: 4, quitada: true }), tx({ id: 5, origem: "pluggy" })] });
  assert.equal(soTx(r).length, 0);
});

test("já marcada como Pago (agendado = false) não gera lembrete; programada ainda não paga gera", () => {
  const r = soTx(montarLembretes({ ...base, transacoes: [tx({ id: 7, agendado: false }), tx({ id: 8, agendado: true })] }));
  assert.deepEqual(r.map((x) => x.chave), ["lembrete:u1:tx:8"]);
});

test("sem data definida lembra no último dia do mês e avisa no detalhe", () => {
  const [l] = soTx(montarLembretes({ ...base, hojeISO: "2026-10-31", transacoes: [tx({ id: 9, data: "2026-10-31", agendado: true, data_indefinida: true })] }));
  assert.match(l.detalhe, /sem data definida/);
});

test("compra comum no cartão NÃO lembra pela data da compra", () => {
  const r = montarLembretes({ ...base, transacoes: [tx({ id: 6, metodo: "Crédito Bradesco", competencia: "2026-11-01" })] });
  assert.equal(soTx(r).length, 0);
});

test("despesa programada no cartão lembra no dia; parcela não", () => {
  const r = soTx(montarLembretes({ ...base, transacoes: [
    tx({ id: 14, metodo: "Crédito Bradesco", competencia: "2026-11-01", agendado: true, descricao: "Luz Light" }),
    tx({ id: 15, metodo: "Crédito Bradesco", competencia: "2026-11-01", agendado: true, parcelas_total: 12 }),
  ] }));
  assert.deepEqual(r.map((x) => x.chave), ["lembrete:u1:tx:14"]);
  assert.match(montarMensagemVencimentos(HOJE, r), /Luz Light[\s\S]*Forma de pgto\.: Crédito Bradesco/);
});

test("fatura do cartão lembra no dia do vencimento, com total (despesas - estornos) do mês", () => {
  const compras = [
    tx({ id: 10, data: "2026-09-15", valor: 300, metodo: "Crédito Bradesco" }),
    tx({ id: 11, data: "2026-09-20", valor: 200.5, metodo: "Crédito Bradesco" }),
    tx({ id: 12, tipo: "entradas", data: "2026-09-25", valor: 50.5, metodo: "Crédito Bradesco" }), // estorno
    tx({ id: 13, data: "2026-09-21", valor: 999, metodo: "Crédito Nubank" }), // outro cartão
  ];
  const r = soFat(montarLembretes({ ...base, transacoes: compras }));
  assert.equal(r.length, 1); // Nubank vence dia 20, hoje é 13
  const msg = montarMensagemVencimentos(HOJE, r);
  assert.match(msg, /Fatura Crédito Bradesco — .*450,00/);
  assert.match(msg, /Mês da fatura: Out\/2026/);
  assert.match(msg, /3 lançamentos/);
  assert.equal(r[0].chave, "lembrete:u1:fat:Crédito Bradesco:2026-10-01");
});

test("fatura paga ou já lembrada não gera de novo", () => {
  const compras = [tx({ id: 10, valor: 300, metodo: "Crédito Bradesco" })];
  assert.equal(montarLembretes({ ...base, transacoes: compras, faturasPagas: [{ metodo: "Crédito Bradesco", competencia: "2026-10-01" }] }).length, 0);
  assert.equal(montarLembretes({ ...base, transacoes: compras, jaEnviados: new Set(["lembrete:u1:fat:Crédito Bradesco:2026-10-01"]) }).length, 0);
});

test("não repete lembrete de lançamento já enviado", () => {
  assert.equal(montarLembretes({ ...base, transacoes: [tx({})], jaEnviados: new Set(["lembrete:u1:tx:1"]) }).length, 0);
});

test("vencimento dia 31 em mês curto cai no último dia", () => {
  assert.equal(diaVencimentoNoMes(31, "2026-02-10"), 28);
  assert.equal(diaVencimentoNoMes(15, "2026-02-10"), 15);
});

test("vários vencimentos do dia saem numa mensagem só, com total", () => {
  const compras = [tx({ id: 10, valor: 300, metodo: "Crédito Bradesco" })];
  const l = montarLembretes({ ...base, transacoes: [tx({ id: 1, valor: 100 }), tx({ id: 2, valor: 50.5, descricao: "Gás" }), ...compras] });
  assert.equal(l.length, 3);
  const msg = montarMensagemVencimentos(HOJE, l);
  assert.equal((msg.match(/Vencimentos de hoje/g) || []).length, 1);
  assert.match(msg, /Condomínio/); assert.match(msg, /Gás/); assert.match(msg, /Fatura/);
  assert.match(msg, /Total: .*450,50/);
});

// ---- recorrências a confirmar ----
import { montarLembretesRecorrencia, corpoAvisoRecorrencia } from "../supabase/functions/telegram-webhook/lembretes.ts";

test("ocorrência a confirmar não gera o lembrete comum de vencimento", () => {
  const l = montarLembretes({
    userId: "u", hojeISO: "2026-10-05",
    transacoes: [{ id: 1, tipo: "saidas", data: "2026-10-05", valor: 150, categoria: "Casa", descricao: "Luz", metodo: "PIX", competencia: "2026-10-01", a_confirmar: true, criado_em: "2026-10-01T10:00:00Z" }],
    metodos: [], faturasPagas: [], jaEnviados: new Set(),
  });
  assert.equal(l.length, 0);
});

test("lembrete de recorrência: só as que vencem hoje e uma vez só", () => {
  const oc = [
    { id: 7, tipo: "saidas", data: "2026-10-05", valor: 150, categoria: "Casa", descricao: "Luz", metodo: "PIX" },
    { id: 8, tipo: "saidas", data: "2026-11-05", valor: 150, categoria: "Casa", descricao: "Luz", metodo: "PIX" },
  ];
  const l = montarLembretesRecorrencia({ userId: "u", hojeISO: "2026-10-05", ocorrencias: oc, jaEnviados: new Set() });
  assert.equal(l.length, 1);
  assert.equal(l[0].ocorrenciaId, 7);
  assert.match(l[0].texto, /A confirmar/);
  const de_novo = montarLembretesRecorrencia({ userId: "u", hojeISO: "2026-10-05", ocorrencias: oc, jaEnviados: new Set([l[0].chave]) });
  assert.equal(de_novo.length, 0);
});

test("aviso de despesa tem o botão Marcar como pago na própria mensagem (sem teclado persistente)", () => {
  const [l] = montarLembretes({ ...base, transacoes: [tx({})] });
  const corpo = corpoAvisoVencimentos(123, HOJE, [l]);
  assert.deepEqual(corpo.reply_markup, { inline_keyboard: [[{ text: "Marcar como pago", callback_data: "pgmarcar:1" }]] });
  assert.equal(corpo.chat_id, 123);
  assert.match(corpo.text, /Vencimentos de hoje/);
});

test("aviso só de fatura não tem botões e limpa o teclado de edição deixado na conversa", () => {
  const fatura = { chave: "lembrete:u1:fat:Crédito Bradesco:2026-10-01", titulo: "💳 Fatura Crédito Bradesco — R$ 10,00", detalhe: "Mês da fatura", valor: 10 };
  const corpo = corpoAvisoVencimentos(123, HOJE, [fatura]);
  assert.deepEqual(corpo.reply_markup, { remove_keyboard: true });
});

test("com vários vencimentos, cada botão leva o nome do lançamento; já marcado vira Desmarcar", () => {
  const ls = montarLembretes({ ...base, transacoes: [tx({ id: 1, descricao: "Condomínio" }), tx({ id: 2, descricao: "Internet" })] });
  assert.deepEqual(tecladoPagoVencimentos(ls).inline_keyboard.map((r) => r[0].text), ["Marcar como pago: Condomínio", "Marcar como pago: Internet"]);
  assert.equal(rotuloBotaoPago(true, "Internet", false), "Desmarcar como pago");
});

test("tratarPagoVencimento: marca (agendado=false, pago_em=hoje), depois desmarca pelo mesmo botão", async () => {
  const chamadas = capturaTelegram();
  const gravacoes = [];
  let linha = { id: 1, descricao: "Condomínio", categoria: "Casa", agendado: true, pago_em: null };
  const admin = {
    from(nome) {
      const q = {
        select: () => q, eq: () => q, in: () => q,
        maybeSingle: async () => ({ data: nome === "telegram_users" ? { user_id: "u1" } : linha }),
        update: (campos) => { gravacoes.push(campos); linha = { ...linha, ...campos }; return { eq: () => ({ eq: async () => ({ error: null }) }) }; },
      };
      return q;
    },
  };
  const cq = { id: "cb1", message: { message_id: 55, reply_markup: { inline_keyboard: [[{ text: "Marcar como pago", callback_data: "pgmarcar:1" }]] } } };
  await tratarPagoVencimento(admin, "TOKEN", cq, 123, "1");
  assert.deepEqual(gravacoes[0], { agendado: false, pago_em: hojeBrasiliaISO() });
  const edicao = chamadas.find((c) => c.metodo === "editMessageReplyMarkup");
  assert.deepEqual(edicao.corpo.reply_markup.inline_keyboard, [[{ text: "Desmarcar como pago", callback_data: "pgmarcar:1" }]]);

  const cq2 = { ...cq, message: { message_id: 55, reply_markup: edicao.corpo.reply_markup } };
  await tratarPagoVencimento(admin, "TOKEN", cq2, 123, "1");
  assert.deepEqual(gravacoes[1], { agendado: true, pago_em: null });
  const edicao2 = chamadas.filter((c) => c.metodo === "editMessageReplyMarkup").at(-1);
  assert.equal(edicao2.corpo.reply_markup.inline_keyboard[0][0].text, "Marcar como pago");
});

test("aviso de recorrência não tem botões e não pergunta pelo rascunho", () => {
  const oc = [{ id: 7, tipo: "saidas", data: "2026-10-05", valor: 35, categoria: "Assinaturas", descricao: "Canva", metodo: "Crédito Bradesco" }];
  const [l] = montarLembretesRecorrencia({ userId: "u", hojeISO: "2026-10-05", ocorrencias: oc, jaEnviados: new Set() });
  const corpo = corpoAvisoRecorrencia(9, l.texto);
  assert.deepEqual(corpo.reply_markup, { remove_keyboard: true });
  assert.doesNotMatch(corpo.text, /Quer que eu gere/);
  assert.match(corpo.text, /A confirmar/);
});
