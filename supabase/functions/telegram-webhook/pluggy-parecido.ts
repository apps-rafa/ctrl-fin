// Botões do aviso "já existe algo parecido" de um lançamento que chegou da Pluggy (pgig / pgat / pgou) — resposta compartilhada com as
// demais origens (ver decisao-parecido.ts): é o mesmo = concilia e ignora; atualizar = corrige valor/data do existente; outro = aviso normal.

import type { createClient } from "npm:@supabase/supabase-js@2";
import { rotuloMetodo } from "./util.ts";
import { limparLinks, sugerirCategoriaTexto, type RascunhoLancamento } from "./parser.ts";
import { carregarListasUsuario, tecladoRascunho, textoLancamento } from "./lancamentos.ts";
import { tratarRascunhoEditar } from "./callbacks.ts";
import { tg } from "./util.ts";
import { analisarParecidos, montarAvisoPluggy } from "../_shared/parecidos.ts";
import { responderDecisaoParecido, acaoDe } from "./decisao-parecido.ts";

type Admin = ReturnType<typeof createClient>;

export async function tratarDecisaoPluggy(
  admin: Admin, token: string, cq: { id: string; message: { message_id: number; text?: string } }, chatId: number, acao: string, importadaId: number,
): Promise<void> {
  const { data: tgUser } = await admin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
  const userId = tgUser?.user_id as string | undefined;
  // deno-lint-ignore no-explicit-any
  let item: any = null;
  // Acha o lançamento existente que o aviso mostrou (o 1º parecido, ou a ocorrência de recorrência que casou)
  const alvoId = async () => {
    const { casada, parecidos } = await analisarParecidos(admin, userId!, { tipo: item.tipo, valor: Number(item.valor), data: String(item.data).slice(0, 10), texto: String(item.descricao_banco ?? "") });
    return (casada ?? parecidos[0])?.id as number | undefined;
  };
  const conciliar = async (id: number) => { await admin.from("transacoes_importadas").update({ status: "confirmada", transacao_id: id }).eq("id", importadaId); };
  await responderDecisaoParecido(token, cq, chatId, acaoDe(acao), {
    carregar: async () => {
      if (!userId) return false;
      const { data } = await admin.from("transacoes_importadas").select("*").eq("id", importadaId).eq("user_id", userId).eq("status", "pendente").maybeSingle();
      item = data;
      return !!data;
    },
    ignorar: async () => { const id = await alvoId(); if (id) await conciliar(id); },
    atualizar: async () => {
      const id = await alvoId();
      if (!id) return false;
      const { error } = await admin.from("transacoes").update({ valor: Math.abs(Number(item.valor)), data: String(item.data).slice(0, 10) }).eq("id", id).eq("user_id", userId);
      if (error) return false;
      await conciliar(id);
      return true;
    },
    outro: async () => {
      let metodoTxt: string | null = null;
      if (item.metodo_sugerido) {
        const { data: m } = await admin.from("menu_itens").select("nome, metodo_kind, banco").eq("id", item.metodo_sugerido).maybeSingle();
        metodoTxt = m ? rotuloMetodo(m) : null;
      }
      const { texto, botoes } = montarAvisoPluggy(item, metodoTxt, limparLinks);
      await tg(token, "sendMessage", { chat_id: chatId, text: texto, parse_mode: "HTML", reply_markup: { inline_keyboard: botoes } });
    },
  });
}

/** Botões do aviso de lançamento novo da Pluggy:
 *  pgeditar:<id>   → a transação vira rascunho NA PRÓPRIA mensagem (✅ Confirmar · ✏️ Editar · ❌ Cancelar do rascunho);
 *  pgresgatar:<id> → depois do ❌ Cancelar (transação ignorada), volta ao aviso original. */
export async function tratarAvisoPluggy(
  admin: Admin, token: string, cq: { id: string; message: { message_id: number; text?: string } }, chatId: number, acao: string, importadaId: number,
): Promise<void> {
  const responder = (text?: string) => tg(token, "answerCallbackQuery", { callback_query_id: cq.id, ...(text ? { text } : {}) });
  const { data: tgUser } = await admin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
  if (!tgUser) { await responder("Conta não vinculada"); return; }
  const userId = tgUser.user_id as string;
  const { data: item } = await admin.from("transacoes_importadas").select("*").eq("id", importadaId).eq("user_id", userId).maybeSingle();
  if (!item) { await responder("Esse lançamento já não existe mais"); return; }
  // deno-lint-ignore no-explicit-any
  let met: any = null;
  if (item.metodo_sugerido) {
    const { data: m } = await admin.from("menu_itens").select("nome, metodo_kind, banco, dia_fechamento").eq("id", item.metodo_sugerido).eq("user_id", userId).maybeSingle();
    met = m ?? null;
  }

  if (acao === "pgresgatar") {
    // só volta o que foi ignorado (não reabre o que já foi lançado)
    const { data: volta } = await admin.from("transacoes_importadas").update({ status: "pendente" }).eq("id", importadaId).eq("user_id", userId).eq("status", "ignorada").select("id");
    if (!volta?.length) { await responder("Esse lançamento já foi tratado"); return; }
    const { texto, botoes } = montarAvisoPluggy(item, met ? rotuloMetodo(met) : null, limparLinks);
    await responder("Resgatado ♻️");
    await tg(token, "editMessageText", { chat_id: chatId, message_id: cq.message.message_id, text: texto, parse_mode: "HTML", reply_markup: { inline_keyboard: botoes } });
    return;
  }

  if (item.status !== "pendente") { await responder("Já foi tratado antes"); return; }
  const tipo: "entradas" | "saidas" = item.tipo === "entradas" ? "entradas" : "saidas";
  const listas = await carregarListasUsuario(admin, userId);
  if (!met && tipo === "entradas") met = listas.metodos.find((m) => m.metodo_kind === "PIX" || m.metodo_kind === "PIX/Débito") ?? null;
  const cats = (tipo === "entradas" ? listas.catsR : listas.catsD).map((nome) => ({ nome, categoria_tipo: tipo }));
  const descricao = limparLinks(item.descricao_banco || "");
  const dados: RascunhoLancamento = {
    tipo, valor: Number(item.valor), descricao, categoria: item.categoria_sugerida || sugerirCategoriaTexto(descricao, tipo, cats).nome,
    metodo: met ? rotuloMetodo(met) : null, metodoKind: met?.metodo_kind ?? null, diaFechamento: met?.dia_fechamento ?? null,
    data: String(item.data).slice(0, 10), parcelas: null, competencia: null, metodoOrigem: "texto", pluggyTransactionId: item.pluggy_transaction_id,
  };
  // Mesmo rascunho se tocar de novo (não duplica)
  const { data: existentes } = await admin.from("telegram_rascunhos").select("id").eq("user_id", userId).eq("chat_id", chatId)
    .contains("dados", { pluggyTransactionId: item.pluggy_transaction_id }).limit(1);
  let rascunhoId = existentes?.[0]?.id as number | undefined;
  if (rascunhoId) await admin.from("telegram_rascunhos").update({ dados, status: "pendente" }).eq("id", rascunhoId);
  else {
    const { data: novo, error } = await admin.from("telegram_rascunhos").insert({ user_id: userId, chat_id: chatId, dados }).select("id").single();
    if (error || !novo) { console.error(error); await responder("Erro ao montar o rascunho"); return; }
    rascunhoId = novo.id as number;
  }
  await admin.from("telegram_rascunhos").update({ mensagem_id: cq.message.message_id }).eq("id", rascunhoId);
  await responder();
  await tg(token, "editMessageText", {
    chat_id: chatId, message_id: cq.message.message_id,
    text: `${textoLancamento(dados, "🏦 Lançamento do banco (Pluggy)")}\n\nConfirma?`,
    reply_markup: tecladoRascunho(rascunhoId),
  });
  // Já abre o formulário (mesmo passo do ✏️ Editar de qualquer rascunho)
  await tratarRascunhoEditar({ supabaseAdmin: admin, token, cq: { ...cq, id: "" }, chatId, idStr: String(rascunhoId), acao: "nleditar" });
}
