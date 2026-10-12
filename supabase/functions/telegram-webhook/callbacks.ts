// Tratamento dos botões inline (callback_query) do bot: editar/confirmar/cancelar rascunho, editar pelo /ultimos, /atualizar e /pgtopadrao.

import type { createClient } from "npm:@supabase/supabase-js@2";
import { tg, formatarMoedaBR, rotuloMetodo } from "./util.ts";
import { type RascunhoLancamento, sugerirCategoriaTexto, limparLinks } from "./parser.ts";
import { carregarListasUsuario, confirmarRascunhoNoBanco, urlMiniApp, enviarRascunho, tecladoRascunho, textoLancado, tecladoCorrigir } from "./lancamentos.ts";
import { carregarContasPluggy, executarAtualizacaoPluggy, tituloContaPluggyDetalhado } from "./pluggy.ts";

// deno-lint-ignore no-explicit-any
export interface ContextoCallback { supabaseAdmin: ReturnType<typeof createClient>; token: string; cq: any; chatId: number; idStr: string; acao: string }

  // Número (1-5) do /ultimos: abre o formulário (mini app) com os dados DAQUELE lançamento já gravado.
export async function tratarUltimoEditar(c: ContextoCallback): Promise<void> {
  const { supabaseAdmin, token, cq, chatId, idStr, acao } = c;
    const { data: tgUser } = await supabaseAdmin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
    const { data: t } = tgUser
      ? await supabaseAdmin.from("transacoes").select("*").eq("id", Number(idStr)).eq("user_id", tgUser.user_id).maybeSingle()
      : { data: null };
    if (!tgUser || !t) {
      await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Esse lançamento já não existe mais" });
      return;
    }
    if (t.parcelas_total && t.parcelas_total > 1) {
      await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Lançamento parcelado: edite pelo app", show_alert: true });
      return;
    }
    const listas = await carregarListasUsuario(supabaseAdmin, tgUser.user_id);
    const met = listas.metodos.find((m) => rotuloMetodo(m) === t.metodo) ?? null;
    // Estorno é gravado como entrada no cartão, mas se edita como Despesa > Estorno
    const ehEstornoGravado = t.tipo === "entradas" && met?.metodo_kind === "Crédito";
    const d: RascunhoLancamento = {
      tipo: ehEstornoGravado ? "saidas" : (t.tipo === "entradas" ? "entradas" : "saidas"),
      valor: Number(t.valor), descricao: t.descricao ?? "", categoria: ehEstornoGravado ? "Estorno" : (t.categoria ?? ""),
      metodo: t.metodo || null, metodoKind: met?.metodo_kind ?? null, diaFechamento: met?.dia_fechamento ?? null,
      data: String(t.data).slice(0, 10), competencia: t.competencia ? String(t.competencia).slice(0, 10) : null,
      dataIndefinida: !!t.data_indefinida,
    };
    await tg(token, "answerCallbackQuery", { callback_query_id: cq.id });
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: `Toque em ✏️ Editar para alterar o lançamento referente à ${d.tipo === "entradas" ? "receita" : "despesa"} de ${formatarMoedaBR(d.valor)} no dia ${new Date(`${d.data}T00:00:00`).toLocaleDateString("pt-BR")}${d.descricao ? ` (${d.descricao})` : ""}.`,
      reply_markup: {
        keyboard: [[{ text: "✏️ Editar", web_app: { url: urlMiniApp(`t${t.id}`, d, listas) } }], [{ text: "❌ Cancelar edição" }]],
        resize_keyboard: true, is_persistent: true, one_time_keyboard: false,
      },
    });
    return;
}

  // "✏️ Editar" na mensagem de um rascunho: responde dizendo QUAL lançamento é e com o botão do
  // formulário dele em cima do teclado (único jeito de o mini app devolver os dados).
export async function tratarRascunhoEditar(c: ContextoCallback): Promise<void> {
  const { supabaseAdmin, token, cq, chatId, idStr, acao } = c;
    const rascunhoId = Number(idStr);
    const { data: tgUser } = await supabaseAdmin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
    const { data: rascunho } = tgUser
      ? await supabaseAdmin.from("telegram_rascunhos").select("dados").eq("id", rascunhoId).eq("chat_id", chatId).eq("user_id", tgUser.user_id).eq("status", "pendente").maybeSingle()
      : { data: null };
    if (!tgUser || !rascunho) {
      await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Esse rascunho já não existe mais (ou foi descartado)" });
      return;
    }
    await supabaseAdmin.from("telegram_rascunhos").update({ editando_em: null }).eq("chat_id", chatId); // um rascunho em edição por vez
    await supabaseAdmin.from("telegram_rascunhos").update({ editando_em: new Date().toISOString() }).eq("id", rascunhoId);
    const d = rascunho.dados as RascunhoLancamento;
    const listas = await carregarListasUsuario(supabaseAdmin, tgUser.user_id);
    await tg(token, "answerCallbackQuery", { callback_query_id: cq.id });
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: `Toque em ✏️ Editar para alterar o lançamento referente à ${d.tipo === "entradas" ? "receita" : "despesa"} de ${formatarMoedaBR(d.valor)} no dia ${new Date(`${d.data}T00:00:00`).toLocaleDateString("pt-BR")}${d.descricao ? ` (${d.descricao})` : ""}.`,
      reply_markup: {
        keyboard: [[{ text: "✏️ Editar", web_app: { url: urlMiniApp(rascunhoId, d, listas) } }], [{ text: "❌ Cancelar edição" }]],
        resize_keyboard: true, is_persistent: true, one_time_keyboard: false,
      },
    });
    return;
}

/** Descarta um rascunho (pendente → descartado): nada é apagado; a mensagem original fica só com o botão ♻️ Resgatar e o teclado do ✏️ Editar some.
 *  textoAtual = texto da mensagem (quando se sabe); sem ele, só os botões são trocados e o texto fica como está. */
export async function descartarRascunho(
  admin: ReturnType<typeof createClient>, token: string, chatId: number, rascunhoId: number, mensagemId: number, textoAtual: string | null, ehOcorrencia: boolean,
): Promise<void> {
  await admin.from("telegram_rascunhos").update({ status: "descartado", editando_em: null, mensagem_id: mensagemId }).eq("id", rascunhoId);
  const resgatar = { inline_keyboard: [[{ text: "♻️ Resgatar", callback_data: `nlresgatar:${rascunhoId}` }, { text: "❌ Cancelar", callback_data: "cancelar" }]] }; // Cancelar: fecha de vez (some o Resgatar)
  if (textoAtual === null) {
    await tg(token, "editMessageReplyMarkup", { chat_id: chatId, message_id: mensagemId, reply_markup: resgatar });
  } else {
    const base = textoAtual.replace(/\n\n❌ Descartado[\s\S]*$/, "");
    await tg(token, "editMessageText", {
      chat_id: chatId, message_id: mensagemId,
      // cancelar o rascunho NUNCA mexe na recorrência nem na ocorrência: ela segue "a confirmar" no app
      text: `${base}\n\n❌ Descartado${ehOcorrencia ? ' — o lançamento segue em "a confirmar" no app' : ""}`,
      reply_markup: resgatar,
    });
  }
  await tirarTecladoDoChat(token, chatId);
}

/** Tira o teclado do ✏️ Editar / ❌ Cancelar edição: o Telegram só remove teclado junto de uma mensagem, então ela é enviada e apagada na hora. */
export async function tirarTecladoDoChat(token: string, chatId: number): Promise<void> {
  const r = await tg(token, "sendMessage", { chat_id: chatId, text: "·", reply_markup: { remove_keyboard: true } });
  if (r?.result?.message_id) await tg(token, "deleteMessage", { chat_id: chatId, message_id: r.result.message_id });
}

  // Rascunho de lançamento por texto livre (ver interpretarValorETipo
  // acima) — "❌ Cancelar" DESCARTA o rascunho (recuperável com "Resgatar");
  // "✅ Confirmar" grava de verdade em transacoes; "♻️ Resgatar" volta ao pendente.
export async function tratarRascunhoConfirmarOuCancelar(c: ContextoCallback): Promise<void> {
  const { supabaseAdmin, token, cq, chatId, idStr, acao } = c;
    const rascunhoId = Number(idStr);
    const { data: tgUser } = await supabaseAdmin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
    if (!tgUser) {
      await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Conta não vinculada" });
      return;
    }
    const { data: rascunho } = await supabaseAdmin
      .from("telegram_rascunhos").select("dados, status")
      .eq("id", rascunhoId).eq("chat_id", chatId).eq("user_id", tgUser.user_id) // nunca confia só no id vindo do botão
      .maybeSingle();
    if (!rascunho) {
      await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Esse rascunho já não existe mais" });
      return;
    }

    const ehOcorrencia = !!(rascunho.dados as RascunhoLancamento).ocorrenciaId;
    if (acao === "nlresgatar") {
      if (rascunho.status !== "descartado") {
        await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Esse rascunho já está pendente" });
        return;
      }
      await supabaseAdmin.from("telegram_rascunhos").update({ status: "pendente" }).eq("id", rascunhoId);
      await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Rascunho resgatado" });
      await tg(token, "editMessageText", {
        chat_id: chatId, message_id: cq.message.message_id,
        text: String(cq.message.text ?? "").replace(/\n\n❌ Descartado[\s\S]*$/, ""), // volta exatamente como era
        reply_markup: tecladoRascunho(rascunhoId),
      });
      return;
    }
    if (rascunho.status === "descartado") {
      await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Rascunho descartado — toque em Resgatar" });
      return;
    }
    if (acao === "nlcancelar") {
      await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Descartado" });
      await descartarRascunho(supabaseAdmin, token, chatId, rascunhoId, cq.message.message_id, String(cq.message.text ?? ""), ehOcorrencia);
      return;
    }

    // Reserva o rascunho ANTES de gravar (update condicional, atômico): com dois toques seguidos no Confirmar
    // (ou o Telegram reenviando o update), só o primeiro grava — o outro não acha mais o rascunho pendente.
    const { data: reservado } = await supabaseAdmin.from("telegram_rascunhos").update({ status: "descartado" })
      .eq("id", rascunhoId).eq("status", "pendente").select("id");
    if (!reservado || !reservado.length) {
      await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Esse rascunho já foi lançado" });
      return;
    }
    const { erro: insertError, id: lancId } = await confirmarRascunhoNoBanco(supabaseAdmin, tgUser.user_id, rascunho.dados as RascunhoLancamento);
    if (!insertError) await supabaseAdmin.from("telegram_rascunhos").delete().eq("id", rascunhoId);
    if (insertError) {
      await supabaseAdmin.from("telegram_rascunhos").update({ status: "pendente" }).eq("id", rascunhoId); // não gravou: segue pendente
      console.error(insertError);
      await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: ehOcorrencia ? String((insertError as Error)?.message || "Erro ao confirmar").slice(0, 190) : "Erro ao confirmar" });
      return;
    }
    await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Lançado ✅" });
    await tg(token, "editMessageText", {
      chat_id: chatId, message_id: cq.message.message_id,
      text: await textoLancado(supabaseAdmin, tgUser.user_id, String(cq.message.text ?? "")),
      ...(lancId ? { reply_markup: tecladoCorrigir(lancId) } : {}),
    });
    return;
}

  // Escolha de conta no teclado do /atualizar — "todas" ou o id de uma
  // pluggy_contas específica.
export async function tratarAtualizarConta(c: ContextoCallback): Promise<void> {
  const { supabaseAdmin, token, cq, chatId, idStr, acao } = c;
    const { data: tgUser } = await supabaseAdmin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
    if (!tgUser) {
      await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Conta não vinculada" });
      return;
    }
    const { contas } = await carregarContasPluggy(supabaseAdmin, tgUser.user_id);
    const contaId = idStr === "todas" ? null : Number(idStr);
    // Nunca confia só no id vindo do botão — filtra pelas contas do
    // PRÓPRIO usuário vinculado, não pelo id cru.
    const alvo = contaId ? contas.filter((c) => c.id === contaId) : contas;
    if (!alvo.length) {
      await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Conta não encontrada" });
      return;
    }
    await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Atualizando..." });
    await tg(token, "editMessageText", {
      chat_id: chatId, message_id: cq.message.message_id,
      text: `🔄 Atualizando ${contaId ? tituloContaPluggyDetalhado(alvo[0]) : `${alvo.length} conta(s)`}...`,
    });
    await executarAtualizacaoPluggy(supabaseAdmin, token, chatId, alvo);
    return;
}

  // Escolha no menu inline do /pgtopadrao — idStr é o índice na mesma
  // lista (ordenada por "ordem") que gerou os botões.
export async function tratarPgtoPadrao(c: ContextoCallback): Promise<void> {
  const { supabaseAdmin, token, cq, chatId, idStr, acao } = c;
    const { data: tgS } = await supabaseAdmin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
    if (!tgS) {
      await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Conta não vinculada" });
      return;
    }
    const listasS = await carregarListasUsuario(supabaseAdmin, tgS.user_id);
    const escolhida = listasS.metodos[Number(idStr)];
    if (!escolhida) {
      await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Essa opção já não existe mais" });
      return;
    }
    await supabaseAdmin.from("telegram_config").upsert({ user_id: tgS.user_id, metodo_padrao: rotuloMetodo(escolhida) }, { onConflict: "user_id" });
    await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Salvo ✅" });
    await tg(token, "editMessageText", {
      chat_id: chatId, message_id: cq.message.message_id,
      text: `✅ Forma de pagamento padrão: ${rotuloMetodo(escolhida)}`,
    });
    return;
}

  // "📝 Gerar rascunho" no lembrete de uma recorrência: monta o rascunho a partir da própria ocorrência
  // ("a confirmar") — mesmos dados, nenhuma linha nova. Se já existe rascunho dela, reenvia o mesmo (sem duplicar).
export async function tratarRecorrenciaRascunho(c: ContextoCallback): Promise<void> {
  const { supabaseAdmin, token, cq, chatId, idStr } = c;
  const txId = Number(idStr);
  const { data: tgUser } = await supabaseAdmin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
  if (!tgUser) {
    await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Conta não vinculada" });
    return;
  }
  const { data: t } = await supabaseAdmin.from("transacoes").select("id, tipo, data, valor, metodo, categoria, descricao, competencia, data_indefinida")
    .eq("id", txId).eq("user_id", tgUser.user_id).eq("a_confirmar", true).not("recorrencia_id", "is", null).maybeSingle();
  if (!t) {
    await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Esse lançamento já foi confirmado ou apagado" });
    await tg(token, "editMessageText", { chat_id: chatId, message_id: cq.message.message_id, text: `${cq.message.text}\n\n✔️ Já resolvido no app` });
    return;
  }
  const { data: existentes } = await supabaseAdmin.from("telegram_rascunhos").select("id, dados")
    .eq("user_id", tgUser.user_id).eq("chat_id", chatId).contains("dados", { ocorrenciaId: txId }).limit(1);
  let rascunhoId: number; let dados: RascunhoLancamento;
  if (existentes && existentes.length) {
    rascunhoId = existentes[0].id; dados = existentes[0].dados as RascunhoLancamento;
    await supabaseAdmin.from("telegram_rascunhos").update({ status: "pendente" }).eq("id", rascunhoId);
  } else {
    const listas = await carregarListasUsuario(supabaseAdmin, tgUser.user_id);
    const met = t.metodo ? listas.metodos.find((m) => rotuloMetodo(m) === t.metodo) ?? null : null;
    dados = {
      tipo: t.tipo === "entradas" ? "entradas" : "saidas", valor: Number(t.valor), descricao: t.descricao || "", categoria: t.categoria,
      metodo: t.metodo, metodoKind: met?.metodo_kind ?? null, diaFechamento: met?.dia_fechamento ?? null,
      data: String(t.data).slice(0, 10), parcelas: null, competencia: t.competencia ? String(t.competencia).slice(0, 10) : null,
      metodoOrigem: "texto", ocorrenciaId: txId, dataIndefinida: !!t.data_indefinida,
    };
    const { data: novo, error } = await supabaseAdmin.from("telegram_rascunhos").insert({ user_id: tgUser.user_id, chat_id: chatId, dados }).select("id").single();
    if (error || !novo) {
      console.error(error);
      await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Erro ao montar o rascunho" });
      return;
    }
    rascunhoId = novo.id;
  }
  await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Rascunho gerado" });
  await tg(token, "editMessageText", { chat_id: chatId, message_id: cq.message.message_id, text: `${cq.message.text}\n\n📝 Rascunho enviado abaixo` });
  await enviarRascunho(token, chatId, rascunhoId, dados, supabaseAdmin, tgUser.user_id, "🔁 Recorrência");
}

  // Número (1-5) da lista do /atualizar: a transação do banco vira rascunho (com a forma de pagamento da conta e a
  // categoria sugerida) — ou, se ela já foi lançada (importada e confirmada), abre a edição do lançamento existente.
export async function tratarUltimaPluggy(c: ContextoCallback): Promise<void> {
  const { supabaseAdmin, token, cq, chatId, idStr } = c;
  const { data: tgUser } = await supabaseAdmin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
  if (!tgUser) { await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Conta não vinculada" }); return; }
  const userId = tgUser.user_id as string;
  const { data: lista } = await supabaseAdmin.from("telegram_ultimas").select("itens").eq("chat_id", chatId).eq("user_id", userId).maybeSingle();
  type ItemUltima = { pid: string; data: string; valor: number; tipo: "entradas" | "saidas"; descricao: string; metodo_id: number | null; conta: string };
  const item = ((lista?.itens ?? []) as ItemUltima[])[Number(idStr) - 1];
  if (!item) { await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Essa lista mudou — mande /atualizar de novo" }); return; }

  // Já lançada? (importada e ligada a um lançamento que ainda existe): edita esse lançamento
  const { data: imp } = await supabaseAdmin.from("transacoes_importadas").select("transacao_id, categoria_sugerida")
    .eq("user_id", userId).eq("pluggy_transaction_id", item.pid).maybeSingle();
  if (imp?.transacao_id) {
    const { data: existe } = await supabaseAdmin.from("transacoes").select("id").eq("id", imp.transacao_id).eq("user_id", userId).maybeSingle();
    if (existe) { await tratarUltimoEditar({ ...c, idStr: String(imp.transacao_id), acao: "ultedit" }); return; }
  }

  // Ainda não lançada: monta o rascunho (receita sempre PIX; despesa na forma de pagamento ligada à conta)
  const listas = await carregarListasUsuario(supabaseAdmin, userId);
  let met: { nome: string; metodo_kind: string | null; banco: string | null; dia_fechamento: number | null } | null = null;
  if (item.tipo === "entradas") met = listas.metodos.find((m) => m.metodo_kind === "PIX" || m.metodo_kind === "PIX/Débito") ?? null;
  else if (item.metodo_id) {
    const { data: m } = await supabaseAdmin.from("menu_itens").select("nome, metodo_kind, banco, dia_fechamento").eq("id", item.metodo_id).eq("user_id", userId).maybeSingle();
    met = m ?? null;
  }
  const cats = (item.tipo === "entradas" ? listas.catsR : listas.catsD).map((nome) => ({ nome, categoria_tipo: item.tipo }));
  const categoria = imp?.categoria_sugerida || sugerirCategoriaTexto(item.descricao, item.tipo, cats).nome;
  const dados: RascunhoLancamento = {
    tipo: item.tipo, valor: Number(item.valor), descricao: limparLinks(item.descricao), categoria,
    metodo: met ? rotuloMetodo(met) : null, metodoKind: met?.metodo_kind ?? null, diaFechamento: met?.dia_fechamento ?? null,
    data: item.data, parcelas: null, competencia: null, metodoOrigem: "texto", pluggyTransactionId: item.pid,
  };
  const { data: novo, error } = await supabaseAdmin.from("telegram_rascunhos").insert({ user_id: userId, chat_id: chatId, dados }).select("id").single();
  if (error || !novo) { console.error(error); await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Erro ao montar o rascunho" }); return; }
  await tg(token, "answerCallbackQuery", { callback_query_id: cq.id });
  await enviarRascunho(token, chatId, novo.id, dados, supabaseAdmin, userId, `🏦 Da conta ${item.conta}`);
}

// ---------- ✏️ Corrigir (fica em todo lançamento feito pelo bot) ----------
// corrigir:<id>        → troca o botão pelo menu ✏️ Editar · 🗑️ Apagar · ❌ Cancelar (na própria mensagem)
// corrigirvoltar:<id>  → ❌ Cancelar do menu: volta ao botão ✏️ Corrigir
// apagartx:<id>        → apaga (o parcelado inteiro, como no app), passando pela Lixeira do app; oferece ♻️ Restaurar
// restaurartx:<lixId>  → devolve da Lixeira (o parcelado inteiro) e volta ao ✏️ Corrigir

const APAGADO_SUFIXO = "\n\n🗑️ Apagado — está na Lixeira do app por 30 dias";

/** Lançamento do usuário vinculado a este chat (nunca confia só no id vindo do botão). */
async function lancamentoDoChat(c: ContextoCallback, id: number) {
  const { data: tgUser } = await c.supabaseAdmin.from("telegram_users").select("user_id").eq("chat_id", c.chatId).maybeSingle();
  if (!tgUser) return { userId: null, t: null };
  const { data: t } = await c.supabaseAdmin.from("transacoes").select("*").eq("id", id).eq("user_id", tgUser.user_id).maybeSingle();
  return { userId: tgUser.user_id as string, t: t as Record<string, unknown> | null };
}

export async function tratarCorrigir(c: ContextoCallback): Promise<void> {
  const { token, cq, chatId, idStr, acao } = c;
  const id = Number(idStr);
  if (acao === "corrigirvoltar") {
    await tg(token, "answerCallbackQuery", { callback_query_id: cq.id });
    await tg(token, "editMessageReplyMarkup", { chat_id: chatId, message_id: cq.message.message_id, reply_markup: tecladoCorrigir(id) });
    return;
  }
  const { t } = await lancamentoDoChat(c, id);
  if (!t) {
    await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Esse lançamento já não existe mais" });
    await tg(token, "editMessageReplyMarkup", { chat_id: chatId, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } });
    return;
  }
  await tg(token, "answerCallbackQuery", { callback_query_id: cq.id });
  await tg(token, "editMessageReplyMarkup", {
    chat_id: chatId, message_id: cq.message.message_id,
    reply_markup: { inline_keyboard: [[
      { text: "✏️ Editar", callback_data: `ultedit:${id}` },
      { text: "🗑️ Apagar", callback_data: `apagartx:${id}` },
      { text: "❌ Cancelar", callback_data: `corrigirvoltar:${id}` },
    ]] },
  });
}

export async function tratarApagarLancamento(c: ContextoCallback): Promise<void> {
  const { supabaseAdmin, token, cq, chatId, idStr } = c;
  const { userId, t } = await lancamentoDoChat(c, Number(idStr));
  if (!t || !userId) { await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Esse lançamento já não existe mais" }); return; }
  // Parcelado: apaga a série inteira (igual ao app)
  const { data: linhas } = t.grupo_id && t.tipo_recorrencia === "Parcelada"
    ? await supabaseAdmin.from("transacoes").select("*").eq("grupo_id", t.grupo_id).eq("user_id", userId)
    : { data: [t] };
  const todas = (linhas ?? [t]) as Record<string, unknown>[];
  const { data: naLixeira, error: erroL } = await supabaseAdmin.from("lixeira").insert(todas.map((dados) => ({ user_id: userId, dados }))).select("id");
  if (erroL || !naLixeira?.length) { console.error(erroL); await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Não consegui apagar" }); return; }
  const idsLixeira = (naLixeira as { id: number }[]).map((x) => x.id);
  const { error: erroD } = await supabaseAdmin.from("transacoes").delete().in("id", todas.map((x) => x.id as number)).eq("user_id", userId);
  if (erroD) {
    console.error(erroD);
    await supabaseAdmin.from("lixeira").delete().in("id", idsLixeira); // não apagou: desfaz a cópia
    await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Não consegui apagar" });
    return;
  }
  await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: todas.length > 1 ? `Apagado (${todas.length} parcelas)` : "Apagado" });
  await tg(token, "editMessageText", {
    chat_id: chatId, message_id: cq.message.message_id,
    text: `${String(cq.message.text ?? "")}${APAGADO_SUFIXO}`,
    reply_markup: { inline_keyboard: [[
      { text: "♻️ Restaurar", callback_data: `restaurartx:${Math.min(...idsLixeira)}` },
      { text: "❌ Cancelar", callback_data: "cancelar" },
    ]] },
  });
}

export async function tratarRestaurarLancamento(c: ContextoCallback): Promise<void> {
  const { supabaseAdmin, token, cq, chatId, idStr } = c;
  const { data: tgUser } = await supabaseAdmin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
  if (!tgUser) { await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Conta não vinculada" }); return; }
  const { data: item } = await supabaseAdmin.from("lixeira").select("id, dados").eq("id", Number(idStr)).eq("user_id", tgUser.user_id).maybeSingle();
  if (!item) { await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Já não está mais na Lixeira" }); return; }
  const dados = item.dados as Record<string, unknown>;
  // Parcelado: volta a série inteira
  const { data: itens } = dados.grupo_id
    ? await supabaseAdmin.from("lixeira").select("id, dados").eq("user_id", tgUser.user_id).contains("dados", { grupo_id: dados.grupo_id })
    : { data: [item] };
  const todos = (itens ?? [item]) as { id: number; dados: Record<string, unknown> }[];
  // Volta exatamente como estava, menos o id (o banco gera outro) e a data de criação
  const linhas = todos.map(({ dados: d }) => {
    const resto = { ...d };
    delete resto.id; delete resto.criado_em;
    return { ...resto, user_id: tgUser.user_id };
  });
  const { data: voltaram, error } = await supabaseAdmin.from("transacoes").insert(linhas).select("id, parcela_num");
  if (error) { console.error(error); await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Não consegui restaurar" }); return; }
  await supabaseAdmin.from("lixeira").delete().in("id", todos.map((x) => x.id)).eq("user_id", tgUser.user_id);
  const novos = (voltaram ?? []) as { id: number; parcela_num: number | null }[];
  const principal = novos.find((x) => (x.parcela_num ?? 1) === 1) ?? novos[0];
  await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Restaurado ♻️" });
  await tg(token, "editMessageText", {
    chat_id: chatId, message_id: cq.message.message_id,
    text: String(cq.message.text ?? "").replace(APAGADO_SUFIXO, ""),
    ...(principal ? { reply_markup: tecladoCorrigir(principal.id) } : {}),
  });
}
