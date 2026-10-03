// Tratamento do envio do Mini App e dos comandos de texto do bot (/start, /atualizar, /pgtopadrao, /backup).

import type { createClient } from "npm:@supabase/supabase-js@2";
import { executarBackup } from "./backup.ts";
import { tg, rotuloMetodo, TELEGRAM_API } from "./util.ts";
import { competenciaDe, hojeBrasiliaISO, aplicarRespostaAoRascunho, type RascunhoLancamento, type MetodoMenu } from "./parser.ts";
import { enviarRascunho, carregarListasUsuario, confirmarRascunhoNoBanco, criarCategoria, criarMetodo } from "./lancamentos.ts";
import { carregarContasPluggy, executarAtualizacaoPluggy, rotuloBotaoConta, BOTAO_TODAS_CONTAS } from "./pluggy.ts";

type Admin = ReturnType<typeof createClient>;
// deno-lint-ignore no-explicit-any
export interface ContextoFormulario { update: any; supabaseAdmin: Admin; token: string }
export interface ContextoComando { supabaseAdmin: Admin; token: string; chatId: number; texto: string }
const CODIGO_VALIDADE_MIN = 10;

  // ---------- Formulário (mini app) enviado: grava o lançamento ----------
  // O Telegram entrega isto dentro do chat do próprio usuário, então o dono é
  // quem está vinculado a este chat (sem login no mini app).
export async function tratarFormularioMiniApp(c: ContextoFormulario): Promise<void> {
  const { update, supabaseAdmin, token } = c;
  const chatId = update.message.chat.id;
  const remover = { remove_keyboard: true };
  const { data: tgUser } = await supabaseAdmin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
  if (!tgUser) {
    await tg(token, "sendMessage", { chat_id: chatId, text: "Conta não vinculada — mande /start com o código do app primeiro.", reply_markup: remover });
    return;
  }
  // deno-lint-ignore no-explicit-any
  let p: any = null;
  try { p = JSON.parse(String(update.message.web_app_data.data)); } catch (_) { /* inválido */ }
  const tipoF: "entradas" | "saidas" = p?.tipo === "entradas" ? "entradas" : "saidas";
  const valorF = Number(p?.valor);
  const dataF = String(p?.data ?? "");
  // "+" do formulário: cria antes o que foi cadastrado na hora (categoria / forma de pgto.)
  if (p?.novaCategoria?.nome) {
    await criarCategoria(supabaseAdmin, tgUser.user_id, tipoF, String(p.novaCategoria.nome).trim().slice(0, 60), String(p.novaCategoria.descricao ?? "").trim().slice(0, 200));
  }
  if (p?.novoMetodo?.kind) {
    const nm = p.novoMetodo;
    await criarMetodo(supabaseAdmin, tgUser.user_id, {
      kind: String(nm.kind), banco: String(nm.banco ?? ""), venc: Number(nm.venc) || null,
      fech: Number(nm.fech) || null, melhor: Number(nm.melhor) || null,
    });
  }
  const listas = await carregarListasUsuario(supabaseAdmin, tgUser.user_id);
  const categoriaF = String(p?.categoria ?? "");
  const categoriaOk = (tipoF === "entradas" ? listas.catsR : listas.catsD).includes(categoriaF);
  if (!p || !(valorF > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(dataF) || !categoriaOk) {
    await tg(token, "sendMessage", { chat_id: chatId, text: "Não consegui ler os dados do formulário — tenta de novo.", reply_markup: remover });
    return;
  }
  const metodoF = p.metodo ? listas.metodos.find((m) => rotuloMetodo(m) === p.metodo) ?? null : null;
  const nParc = Math.min(48, Math.max(1, parseInt(String(p.parcelas ?? 1), 10) || 1));
  const dadosF: RascunhoLancamento = {
    tipo: tipoF, valor: valorF, data: dataF, categoria: categoriaF,
    descricao: String(p.descricao ?? "").trim().slice(0, 200),
    metodo: metodoF ? rotuloMetodo(metodoF) : null,
    metodoKind: metodoF?.metodo_kind ?? null,
    diaFechamento: metodoF?.dia_fechamento ?? null,
    parcelas: tipoF === "saidas" && metodoF?.metodo_kind === "Crédito" && nParc > 1 ? nParc : null,
    competencia: null,
  };
  // Mês escolhido no formulário (toda despesa; no crédito é o da fatura): o ano acompanha o
  // mês sugerido pela data (+ fechamento, no crédito), ajustando a virada de ano.
  if (/^(0[1-9]|1[0-2])$/.test(String(p.comp ?? ""))) {
    const padrao = competenciaDe(dataF, tipoF === "saidas" && metodoF?.metodo_kind === "Crédito" ? metodoF.dia_fechamento : null);
    const [ap, mp] = padrao.split("-").map(Number);
    const mEsc = Number(p.comp);
    const ano = mEsc - mp > 6 ? ap - 1 : mp - mEsc > 6 ? ap + 1 : ap;
    dadosF.competencia = `${ano}-${String(mEsc).padStart(2, "0")}-01`;
  }
  // Só apaga o rascunho que foi editado (pode haver outros pendentes no
  // mesmo chat — SMS seguidos numa noite de compras, por exemplo).
  // Edição de um lançamento JÁ gravado (vindo do /ultimos: id "t<id>"): atualiza em vez de criar
  const mT = /^t(\d+)$/.exec(String(p?.id ?? ""));
  if (mT) {
    const ehEst = dadosF.tipo === "saidas" && dadosF.categoria === "Estorno";
    if (ehEst && dadosF.metodoKind !== "Crédito") {
      await tg(token, "sendMessage", { chat_id: chatId, text: "Estorno exige um cartão de crédito — tenta de novo.", reply_markup: remover });
      return;
    }
    const { error: erroU } = await supabaseAdmin.from("transacoes").update({
      tipo: ehEst ? "entradas" : dadosF.tipo, data: dadosF.data, valor: dadosF.valor, metodo: dadosF.metodo, categoria: dadosF.categoria,
      descricao: dadosF.descricao, competencia: dadosF.competencia || competenciaDe(dadosF.data, dadosF.metodoKind === "Crédito" ? dadosF.diaFechamento : null),
    }).eq("id", Number(mT[1])).eq("user_id", tgUser.user_id);
    await tg(token, "sendMessage", { chat_id: chatId, text: erroU ? "Erro ao salvar — tenta de novo." : "✅ Lançamento atualizado!", reply_markup: remover });
    return;
  }
  const idEditado = Number(p?.id);
  if (idEditado) {
    // rascunho de ocorrência de recorrência: a confirmação atualiza a linha existente (ver confirmarRascunhoNoBanco)
    const { data: rascEd } = await supabaseAdmin.from("telegram_rascunhos").select("dados").eq("id", idEditado).eq("chat_id", chatId).maybeSingle();
    const ocId = Number((rascEd?.dados as RascunhoLancamento | undefined)?.ocorrenciaId);
    if (ocId) dadosF.ocorrenciaId = ocId;
    await supabaseAdmin.from("telegram_rascunhos").delete().eq("id", idEditado).eq("chat_id", chatId);
  }
  const { erro: erroF } = await confirmarRascunhoNoBanco(supabaseAdmin, tgUser.user_id, dadosF);
  if (erroF) {
    console.error(erroF);
    await tg(token, "sendMessage", { chat_id: chatId, text: dadosF.ocorrenciaId ? `${(erroF as Error)?.message || "Erro ao confirmar"}` : "Erro ao lançar — tenta de novo.", reply_markup: remover });
    return;
  }
  await tg(token, "sendMessage", { chat_id: chatId, text: dadosF.ocorrenciaId ? "✅ Recorrência confirmada!" : "✅ Lançado!", reply_markup: remover });
  return;
}

export async function tratarStart(c: ContextoComando): Promise<void> {
  const { supabaseAdmin, token, chatId, texto } = c;
  // Já vinculado antes (ex.: clicou o link de novo, ou mandou o mesmo
  // código 2x — o código é apagado assim que usado com sucesso, então
  // a 2ª tentativa achava "código inválido ou expirado" mesmo tendo
  // acabado de funcionar segundos antes, o que é confuso).
  const { data: jaVinculado } = await supabaseAdmin
    .from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
  if (jaVinculado) {
    await tg(token, "sendMessage", { chat_id: chatId, text: "✅ Você já está vinculado — não precisa fazer de novo." });
    return;
  }

  const codigo = texto.split(/\s+/)[1]?.toUpperCase();
  if (!codigo) {
    await tg(token, "sendMessage", { chat_id: chatId, text: "Gere um código em Configurações > Importar > Pluggy no app e toque no link de novo." });
    return;
  }

  const { data: linkRow } = await supabaseAdmin
    .from("telegram_link_codes")
    .select("user_id, criado_em")
    .eq("code", codigo)
    .maybeSingle();

  const expirado = !linkRow || (Date.now() - new Date(linkRow.criado_em).getTime()) > CODIGO_VALIDADE_MIN * 60 * 1000;
  if (!linkRow || expirado) {
    await tg(token, "sendMessage", { chat_id: chatId, text: "Código inválido ou expirado — gere um novo no app e toque no link de novo." });
    return;
  }

  const { error: upsertError } = await supabaseAdmin
    .from("telegram_users")
    .upsert({ user_id: linkRow.user_id, chat_id: chatId }, { onConflict: "user_id" });
  if (upsertError) {
    console.error(upsertError);
    await tg(token, "sendMessage", { chat_id: chatId, text: "Deu erro ao vincular — tenta de novo em instantes." });
    return;
  }
  await supabaseAdmin.from("telegram_link_codes").delete().eq("code", codigo);

  await tg(token, "sendMessage", {
    chat_id: chatId,
    text: "✅ Conta vinculada! A partir de agora eu aviso por aqui quando um lançamento novo chegar via Pluggy. Mande /atualizar a qualquer hora pra forçar buscar dados novos nas suas contas.",
  });
  return;
}

  // "/atualizar" — pergunta qual conexão bancária atualizar (teclado
  // inline) antes de ir na Pluggy; a atualização em si (PATCH /items/
  // {id}, igual ao "Sincronizar agora" do app + log das 3 transações
  // mais recentes) só acontece depois do toque num botão (ver
  // callback_query "atualizarconta:" mais abaixo). Não mexe na fila de
  // revisão do app (isso continua exigindo o "Sincronizar" no app ou o
  // aviso automático do pluggy-webhook).
export async function tratarAtualizar(c: ContextoComando): Promise<void> {
  const { supabaseAdmin, token, chatId, texto } = c;
  const { data: tgUser } = await supabaseAdmin
    .from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
  if (!tgUser) {
    await tg(token, "sendMessage", { chat_id: chatId, text: "Conta não vinculada — mande /start com o código do app primeiro." });
    return;
  }

  const { erro: contasError, contas } = await carregarContasPluggy(supabaseAdmin, tgUser.user_id);
  if (contasError) {
    console.error(contasError);
    await tg(token, "sendMessage", { chat_id: chatId, text: "Deu erro ao buscar suas contas conectadas." });
    return;
  }
  if (!contas.length) {
    await tg(token, "sendMessage", { chat_id: chatId, text: "Nenhuma conta conectada pra atualizar (Configurações > Open Finance no app)." });
    return;
  }

  // Só 1 conta conectada: não faz sentido perguntar, vai direto.
  if (contas.length === 1) {
    await tg(token, "sendMessage", { chat_id: chatId, text: "🔄 Atualizando..." });
    await executarAtualizacaoPluggy(supabaseAdmin, token, chatId, contas);
    return;
  }

  // Botões INLINE (grudados na mensagem) — cada conta com o nome
  // completo ("1. Bradesco: Cartão de crédito VISA ..."); o toque
  // chega como callback_query "atualizarconta:<id>"/"atualizarconta:todas"
  // (ver Deno.serve), sem precisar guardar estado.
  const botoes = contas.map((c, i) => [{ text: rotuloBotaoConta(c, i), callback_data: `atualizarconta:${c.id}` }]);
  botoes.push([{ text: BOTAO_TODAS_CONTAS, callback_data: "atualizarconta:todas" }]);
  botoes.push([{ text: "❌ Cancelar", callback_data: "cancelar" }]);
  await tg(token, "sendMessage", {
    chat_id: chatId,
    text: "Qual conta você quer atualizar?",
    reply_markup: { inline_keyboard: botoes },
  });
  return;
}

  // "/pgtopadrao": escolhe a forma de pagamento usada quando a mensagem não diz qual.
export async function tratarPgtoPadraoComando(c: ContextoComando): Promise<void> {
  const { supabaseAdmin, token, chatId, texto } = c;
  const { data: tgP } = await supabaseAdmin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
  if (!tgP) {
    await tg(token, "sendMessage", { chat_id: chatId, text: "Conta não vinculada — mande /start com o código do app primeiro." });
    return;
  }
  const listasP = await carregarListasUsuario(supabaseAdmin, tgP.user_id);
  const { data: cfg } = await supabaseAdmin.from("telegram_config").select("metodo_padrao").eq("user_id", tgP.user_id).maybeSingle();
  // Botões INLINE — callback_data leva o índice (mesma ordem da consulta,
  // "order(ordem)") pra reidentificar a forma escolhida sem guardar estado.
  const linhasP = listasP.metodos.map((m, i) => [{ text: `⭐ ${rotuloMetodo(m)}`, callback_data: `pgtopadrao:${i}` }]);
  linhasP.push([{ text: "❌ Cancelar", callback_data: "cancelar" }]);
  await tg(token, "sendMessage", {
    chat_id: chatId,
    text: `Qual forma de pagamento usar quando eu não souber?\nAtual: ${cfg?.metodo_padrao || "Crédito (primeiro cartão)"}`,
    reply_markup: { inline_keyboard: linhasP },
  });
  return;
}

  // "/backup": manda agora o arquivo de backup (o automático sai todo domingo).
export async function tratarBackup(c: ContextoComando): Promise<void> {
  const { supabaseAdmin, token, chatId, texto } = c;
  const { data: tgB } = await supabaseAdmin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
  if (!tgB) {
    await tg(token, "sendMessage", { chat_id: chatId, text: "Conta não vinculada — mande /start com o código do app primeiro." });
    return;
  }
  await tg(token, "sendMessage", { chat_id: chatId, text: "💾 Gerando o backup..." });
  try { await executarBackup(supabaseAdmin, token, { chat_id: chatId, user_id: tgB.user_id }); }
  catch (e) { console.error(e); await tg(token, "sendMessage", { chat_id: chatId, text: "Deu erro ao gerar o backup — tenta de novo." }); }
  return;
}

/** Id do rascunho a que uma resposta (reply) do Telegram se refere: sai do callback_data dos botões da mensagem respondida. */
// deno-lint-ignore no-explicit-any
export function idRascunhoDaResposta(respondida: any): number | null {
  const botoes = (respondida?.reply_markup?.inline_keyboard ?? []).flat();
  // deno-lint-ignore no-explicit-any
  const b = botoes.find((x: any) => typeof x?.callback_data === "string" && x.callback_data.startsWith("nlconfirmar:"));
  const id = b ? Number(String(b.callback_data).split(":")[1]) : 0;
  return id > 0 ? id : null;
}

/** Texto livre enviado COMO RESPOSTA à mensagem de um rascunho: vira a descrição daquele rascunho, que é
 *  mostrado de novo (com os botões) mantendo valor, categoria, forma de pagamento e data. */
export async function tratarRespostaRascunho(
  c: ContextoComando & { rascunhoId: number; mensagemRespondidaId?: number },
): Promise<void> {
  const { supabaseAdmin, token, chatId, texto, rascunhoId, mensagemRespondidaId } = c;
  const { data: tgUser } = await supabaseAdmin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
  const { data: rasc } = tgUser
    ? await supabaseAdmin.from("telegram_rascunhos").select("dados").eq("id", rascunhoId).eq("chat_id", chatId).eq("user_id", tgUser.user_id).maybeSingle()
    : { data: null };
  if (!tgUser || !rasc) {
    await tg(token, "sendMessage", { chat_id: chatId, text: "Esse rascunho já não existe mais." });
    return;
  }
  // O texto pode citar uma categoria ou forma de pagamento cadastrada: troca o campo em vez de virar descrição
  const [{ data: cats }, { data: mets }] = await Promise.all([
    supabaseAdmin.from("menu_itens").select("nome, categoria_tipo").eq("tipo", "Categoria").eq("status", "Ativo").eq("user_id", tgUser.user_id),
    supabaseAdmin.from("menu_itens").select("nome, metodo_kind, banco, dia_fechamento").eq("tipo", "Método").eq("status", "Ativo").eq("user_id", tgUser.user_id),
  ]);
  const novo = aplicarRespostaAoRascunho(rasc.dados as RascunhoLancamento, texto, (cats ?? []) as { nome: string; categoria_tipo: string | null }[], (mets ?? []) as MetodoMenu[]);
  await supabaseAdmin.from("telegram_rascunhos").update({ dados: novo }).eq("id", rascunhoId);
  if (mensagemRespondidaId) await tg(token, "editMessageReplyMarkup", { chat_id: chatId, message_id: mensagemRespondidaId, reply_markup: { inline_keyboard: [] } });
  await enviarRascunho(token, chatId, rascunhoId, novo, supabaseAdmin, tgUser.user_id);
}
