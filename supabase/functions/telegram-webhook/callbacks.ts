// Tratamento dos botões inline (callback_query) do bot: editar/confirmar/cancelar rascunho, editar pelo /ultimos, /atualizar e /pgtopadrao.

import type { createClient } from "npm:@supabase/supabase-js@2";
import { tg, formatarMoedaBR, rotuloMetodo } from "./util.ts";
import { type RascunhoLancamento } from "./parser.ts";
import { carregarListasUsuario, confirmarRascunhoNoBanco, urlMiniApp, enviarRascunho, tecladoRascunho, textoGastoDiario } from "./lancamentos.ts";
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
  const resgatar = { inline_keyboard: [[{ text: "♻️ Resgatar", callback_data: `nlresgatar:${rascunhoId}` }]] };
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

    const { erro: insertError } = await confirmarRascunhoNoBanco(supabaseAdmin, tgUser.user_id, rascunho.dados as RascunhoLancamento);
    if (!insertError) await supabaseAdmin.from("telegram_rascunhos").delete().eq("id", rascunhoId);
    if (insertError) {
      console.error(insertError);
      await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: ehOcorrencia ? String((insertError as Error)?.message || "Erro ao confirmar").slice(0, 190) : "Erro ao confirmar" });
      return;
    }
    await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Lançado ✅" });
    await tg(token, "editMessageText", {
      chat_id: chatId, message_id: cq.message.message_id,
      text: `${cq.message.text}\n\n✅ Lançado${await textoGastoDiario(supabaseAdmin, tgUser.user_id)}`,
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
  const { data: t } = await supabaseAdmin.from("transacoes").select("id, tipo, data, valor, metodo, categoria, descricao, competencia")
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
      metodoOrigem: "texto", ocorrenciaId: txId,
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
