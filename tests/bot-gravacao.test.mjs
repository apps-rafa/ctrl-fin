// Gravação pelo bot contra um banco em memória que aplica os filtros de verdade (tests/helpers/banco-falso.mjs):
// toque duplo no ✅ Confirmar, falha ao gravar, data definida numa ocorrência "?/mês", "Atualizar" do e-mail sem
// nada para atualizar e o valor de referência das recorrências.
import test from "node:test";
import assert from "node:assert/strict";
import { bancoFalso, capturaTelegram } from "./helpers/banco-falso.mjs";
import { tratarRascunhoConfirmarOuCancelar } from "../supabase/functions/telegram-webhook/callbacks.ts";
import { confirmarRascunhoNoBanco } from "../supabase/functions/telegram-webhook/lancamentos.ts";
import { tratarDecisaoEmail } from "../supabase/functions/telegram-webhook/email.ts";
import { gerarOcorrencias } from "../supabase/functions/_shared/ocorrencias.ts";

const rascunho = (o = {}) => ({
  id: 1, chat_id: 10, user_id: "u1", status: "pendente",
  dados: { tipo: "saidas", valor: 50, data: "2026-10-05", categoria: "Casa", descricao: "Luz", metodo: "PIX", metodoKind: "PIX", diaFechamento: null, parcelas: null, competencia: null },
  ...o,
});
const confirmar = (banco) => tratarRascunhoConfirmarOuCancelar({
  supabaseAdmin: banco, token: "T", cq: { id: "cb", message: { message_id: 7, text: "💸 Despesa" } }, chatId: 10, idStr: "1", acao: "nlconfirmar",
});
const respostas = (tg) => tg.filter((c) => c.metodo === "answerCallbackQuery").map((c) => c.corpo.text);

test("rascunho: dois toques no Confirmar ao mesmo tempo gravam UM lançamento", async () => {
  const tg = capturaTelegram();
  const banco = bancoFalso({ telegram_users: [{ chat_id: 10, user_id: "u1" }], telegram_rascunhos: [rascunho()] });
  await Promise.all([confirmar(banco), confirmar(banco)]);
  assert.equal(banco.tabelas.transacoes.length, 1);
  assert.equal(banco.tabelas.telegram_rascunhos.length, 0, "o rascunho lançado some");
  assert.deepEqual(respostas(tg).sort(), ["Esse rascunho já foi lançado", "Lançado ✅"]);
});

test("rascunho: parcelado em 10x com toque duplo grava 10 parcelas, não 20", async () => {
  capturaTelegram();
  const r = rascunho();
  r.dados = { ...r.dados, valor: 1000, metodo: "Crédito Nubank", metodoKind: "Crédito", diaFechamento: 13, parcelas: 10 };
  const banco = bancoFalso({ telegram_users: [{ chat_id: 10, user_id: "u1" }], telegram_rascunhos: [r] });
  await Promise.all([confirmar(banco), confirmar(banco)]);
  assert.equal(banco.tabelas.transacoes.length, 10);
  assert.equal(banco.tabelas.transacoes.reduce((s, t) => s + t.valor, 0), 1000);
});

test("rascunho: se gravar falhar, ele volta a pendente (dá para tentar de novo)", async () => {
  const tg = capturaTelegram();
  const banco = bancoFalso({ telegram_users: [{ chat_id: 10, user_id: "u1" }], telegram_rascunhos: [rascunho()] },
    { falhar: { transacoes: ["insert"] } });
  await confirmar(banco);
  assert.equal(banco.tabelas.transacoes.length, 0);
  assert.equal(banco.tabelas.telegram_rascunhos[0].status, "pendente");
  assert.deepEqual(respostas(tg), ["Erro ao confirmar"]);
});

test("rascunho de outro chat não é confirmado", async () => {
  capturaTelegram();
  const banco = bancoFalso({ telegram_users: [{ chat_id: 10, user_id: "u1" }], telegram_rascunhos: [rascunho({ chat_id: 99, user_id: "u2" })] });
  await confirmar(banco);
  assert.equal((banco.tabelas.transacoes ?? []).length, 0);
});

test("ocorrência '?/mês' confirmada pelo bot com data escolhida deixa de ser sem data; sem escolher, segue '?'", async () => {
  const oc = { id: 5, user_id: "u1", a_confirmar: true, data_indefinida: true, data: "2026-10-31", valor: 90, tipo: "saidas" };
  const d = { tipo: "saidas", valor: 90, data: "2026-10-15", categoria: "Casa", descricao: "Gás", metodo: "PIX", metodoKind: "PIX", diaFechamento: null, parcelas: null, competencia: "2026-10-01", ocorrenciaId: 5 };
  let banco = bancoFalso({ transacoes: [{ ...oc }] });
  assert.equal((await confirmarRascunhoNoBanco(banco, "u1", { ...d, dataIndefinida: false })).erro, null);
  assert.deepEqual([banco.tabelas.transacoes[0].data, banco.tabelas.transacoes[0].data_indefinida, banco.tabelas.transacoes[0].a_confirmar], ["2026-10-15", false, false]);
  banco = bancoFalso({ transacoes: [{ ...oc }] });
  await confirmarRascunhoNoBanco(banco, "u1", { ...d, data: "2026-10-31", dataIndefinida: true });
  assert.equal(banco.tabelas.transacoes[0].data_indefinida, true);
});

test("ocorrência já confirmada no app não é sobrescrita pelo bot", async () => {
  const banco = bancoFalso({ transacoes: [{ id: 5, user_id: "u1", a_confirmar: false, valor: 90 }] });
  const { erro } = await confirmarRascunhoNoBanco(banco, "u1", { tipo: "saidas", valor: 999, data: "2026-10-15", categoria: "Casa", descricao: "", metodo: "PIX", metodoKind: "PIX", diaFechamento: null, parcelas: null, competencia: null, ocorrenciaId: 5 });
  assert.match(String(erro?.message), /já foi confirmada/);
  assert.equal(banco.tabelas.transacoes[0].valor, 90);
});

test("e-mail: 'Atualizar' sem valor nem vencimento responde que não conseguiu e não marca como atualizado", async () => {
  const tg = capturaTelegram();
  const banco = bancoFalso({
    telegram_users: [{ chat_id: 10, user_id: "u1" }],
    emails_processados: [{ seq: 3, user_id: "u1", status: "aguardando", recorrencia_id: 1, pendente: { valor: null, vencimento: null, similares: [8] } }],
    transacoes: [{ id: 8, user_id: "u1", valor: 120, data: "2026-10-10" }],
  });
  await tratarDecisaoEmail(banco, "T", { id: "cb", message: { message_id: 7, text: "📧 Luz" } }, 10, "emat", 3);
  assert.deepEqual(respostas(tg), ["Não consegui atualizar"]);
  assert.equal(banco.tabelas.emails_processados[0].status, "aguardando");
  assert.equal(banco.tabelas.transacoes[0].valor, 120);
});

test("e-mail: 'Atualizar' com valor novo muda o lançamento parecido e marca como atualizado", async () => {
  const tg = capturaTelegram();
  const banco = bancoFalso({
    telegram_users: [{ chat_id: 10, user_id: "u1" }],
    emails_processados: [{ seq: 3, user_id: "u1", status: "aguardando", recorrencia_id: 1, pendente: { valor: 135.5, vencimento: null, similares: [8] } }],
    transacoes: [{ id: 8, user_id: "u1", valor: 120, data: "2026-10-10" }],
  });
  await tratarDecisaoEmail(banco, "T", { id: "cb", message: { message_id: 7, text: "📧 Luz" } }, 10, "emat", 3);
  assert.deepEqual(respostas(tg), ["Atualizado"]);
  assert.equal(banco.tabelas.transacoes[0].valor, 135.5);
  assert.equal(banco.tabelas.emails_processados[0].status, "atualizado");
});

test("recorrência: o último valor confirmado vira a referência do mês seguinte, mesmo depois de solto", async () => {
  const banco = bancoFalso({
    recorrencias: [{ id: 1, user_id: "u1", tipo: "saidas", frequencia: "mensal", dia_semana: null, dia_mes: 10, valor: 100, meses: null,
      metodo: "PIX", categoria: "Casa", descricao: "Luz", inicio: "2026-09-10", status: "ativa", gerado_ate: null, competencia_offset: 0 }],
  });
  await gerarOcorrencias(banco, "2026-09-05"); // gera set e out (até o fim do mês seguinte)
  const set = banco.tabelas.transacoes.find((t) => t.data === "2026-09-10");
  assert.ok(set, "ocorrência de setembro gerada");
  Object.assign(set, { a_confirmar: false, valor: 150 }); // usuário confirma setembro com 150
  await gerarOcorrencias(banco, "2026-09-20"); // setembro já passou: é solto da recorrência
  assert.equal(set.recorrencia_id, null);
  assert.equal(banco.tabelas.recorrencias[0].valor_referencia, 150);
  await gerarOcorrencias(banco, "2026-10-01"); // gera novembro
  const nov = banco.tabelas.transacoes.find((t) => t.data === "2026-11-10");
  assert.equal(nov?.valor, 150, "novembro nasce com o último valor confirmado");
});

test("recorrência: confirmar um mês atrasado não passa por cima de uma referência mais nova", async () => {
  const banco = bancoFalso({
    recorrencias: [{ id: 1, user_id: "u1", tipo: "saidas", frequencia: "mensal", dia_mes: 10, valor: 100, inicio: "2026-08-10", status: "ativa",
      gerado_ate: "2026-11-10", metodo: "PIX", categoria: "Casa", descricao: "Luz", valor_referencia: 170, valor_referencia_data: "2026-10-10" }],
    transacoes: [{ id: 9, user_id: "u1", recorrencia_id: 1, a_confirmar: false, data: "2026-08-10", valor: 130 }],
  });
  await gerarOcorrencias(banco, "2026-10-20");
  assert.equal(banco.tabelas.recorrencias[0].valor_referencia, 170);
});

// ---- /atualizar: número da lista (atltx:<n>) ----
import { tratarUltimaPluggy } from "../supabase/functions/telegram-webhook/callbacks.ts";

const itemUlt = { pid: "tx-1", data: "2026-10-09", valor: 190, tipo: "saidas", descricao: "Pix enviado Alejandra", conta_id: 3, metodo_id: 50, conta: "Mercado Pago" };
const baseUlt = (extra = {}) => ({
  telegram_users: [{ chat_id: 10, user_id: "u1" }],
  telegram_ultimas: [{ chat_id: 10, user_id: "u1", itens: [itemUlt] }],
  menu_itens: [
    { id: 50, user_id: "u1", tipo: "Método", nome: "PIX", metodo_kind: "PIX", banco: "Mercado Pago", dia_fechamento: null, status: "Ativo" },
    { id: 60, user_id: "u1", tipo: "Categoria", nome: "Casa", categoria_tipo: "saidas", status: "Ativo" },
  ],
  ...extra,
});
const tocar = (banco, n = "1") => tratarUltimaPluggy({ supabaseAdmin: banco, token: "T", cq: { id: "cb", message: { message_id: 7, text: "lista" } }, chatId: 10, idStr: n, acao: "atltx" });

test("/atualizar: número de transação ainda não lançada vira rascunho com a forma da conta", async () => {
  const tg = capturaTelegram();
  const banco = bancoFalso(baseUlt());
  await tocar(banco);
  const r = banco.tabelas.telegram_rascunhos[0];
  assert.equal(r.dados.valor, 190);
  assert.equal(r.dados.metodo, "PIX Mercado Pago");
  assert.equal(r.dados.pluggyTransactionId, "tx-1");
  const msg = tg.find((c) => c.metodo === "sendMessage");
  assert.match(msg.corpo.text, /🏦 Da conta Mercado Pago/);
  assert.deepEqual(msg.corpo.reply_markup.inline_keyboard[0].map((b) => b.text), ["✅ Confirmar", "✏️ Editar", "❌ Cancelar"]);
});

test("/atualizar: confirmar o rascunho tira a transação da fila de revisão do app (não importa de novo)", async () => {
  capturaTelegram();
  const banco = bancoFalso(baseUlt({ transacoes_importadas: [{ id: 9, user_id: "u1", pluggy_transaction_id: "tx-1", status: "pendente", transacao_id: null }] }));
  await tocar(banco);
  const r = banco.tabelas.telegram_rascunhos[0];
  await tratarRascunhoConfirmarOuCancelar({ supabaseAdmin: banco, token: "T", cq: { id: "cb2", message: { message_id: 8, text: "r" } }, chatId: 10, idStr: String(r.id), acao: "nlconfirmar" });
  const t = banco.tabelas.transacoes[0];
  assert.equal(t.origem, "pluggy");
  assert.deepEqual([banco.tabelas.transacoes_importadas[0].status, banco.tabelas.transacoes_importadas[0].transacao_id], ["confirmada", t.id]);
});

test("/atualizar: número de transação já lançada abre a edição do lançamento existente", async () => {
  const tg = capturaTelegram();
  const banco = bancoFalso(baseUlt({
    transacoes_importadas: [{ id: 9, user_id: "u1", pluggy_transaction_id: "tx-1", status: "confirmada", transacao_id: 77 }],
    transacoes: [{ id: 77, user_id: "u1", tipo: "saidas", valor: 190, data: "2026-10-09", categoria: "Casa", descricao: "Alejandra", metodo: "PIX Mercado Pago", competencia: "2026-10-01" }],
  }));
  await tocar(banco);
  assert.equal((banco.tabelas.telegram_rascunhos ?? []).length, 0, "não cria rascunho");
  const msg = tg.find((c) => c.metodo === "sendMessage");
  assert.equal(msg.corpo.reply_markup.keyboard[0][0].text, "✏️ Editar");
});

test("/atualizar: número que não está mais na lista avisa para mandar /atualizar de novo", async () => {
  const tg = capturaTelegram();
  await tocar(bancoFalso(baseUlt()), "4");
  assert.match(tg.find((c) => c.metodo === "answerCallbackQuery").corpo.text, /mande \/atualizar de novo/);
});
