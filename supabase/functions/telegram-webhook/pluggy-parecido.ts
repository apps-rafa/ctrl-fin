// Resposta aos botões do aviso "já existe algo parecido" de um lançamento que chegou da Pluggy (mesmas opções das demais origens,
// ver _shared/parecidos.ts): pgig (é o mesmo: concilia e ignora), pgat (é o mesmo: atualiza valor/data do existente) e
// pgou (é outro: manda o aviso normal com Confirmar/Ignorar).

import type { createClient } from "npm:@supabase/supabase-js@2";
import { tg, rotuloMetodo } from "./util.ts";
import { limparLinks } from "./parser.ts";
import { analisarParecidos, montarAvisoPluggy } from "../_shared/parecidos.ts";

type Admin = ReturnType<typeof createClient>;

export async function tratarDecisaoPluggy(
  admin: Admin, token: string, cq: { id: string; message: { message_id: number; text?: string } }, chatId: number, acao: string, importadaId: number,
): Promise<void> {
  const { data: tgUser } = await admin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
  const { data: item } = tgUser
    ? await admin.from("transacoes_importadas").select("*").eq("id", importadaId).eq("user_id", tgUser.user_id).eq("status", "pendente").maybeSingle()
    : { data: null };
  if (!tgUser || !item) {
    await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Esse aviso já foi resolvido" });
    return;
  }
  const userId = tgUser.user_id as string;
  const editar = (texto: string) => tg(token, "editMessageText", { chat_id: chatId, message_id: cq.message.message_id, text: `${cq.message.text ?? ""}\n\n${texto}` });

  if (acao === "pgou") {
    await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Ok, outro lançamento" });
    await editar("➕ Ok, tratando como outro lançamento");
    let metodoTxt: string | null = null;
    if (item.metodo_sugerido) {
      const { data: m } = await admin.from("menu_itens").select("nome, metodo_kind, banco").eq("id", item.metodo_sugerido).maybeSingle();
      metodoTxt = m ? rotuloMetodo(m) : null;
    }
    const { texto, botoes } = montarAvisoPluggy(item, metodoTxt, limparLinks);
    await tg(token, "sendMessage", { chat_id: chatId, text: texto, parse_mode: "Markdown", reply_markup: { inline_keyboard: botoes } });
    return;
  }

  const { casada, parecidos } = await analisarParecidos(admin, userId, { tipo: item.tipo, valor: Number(item.valor), data: String(item.data).slice(0, 10), texto: String(item.descricao_banco ?? "") });
  const alvo = casada ?? parecidos[0];
  let erro: unknown = alvo ? null : "sem alvo";
  if (alvo && acao === "pgat") ({ error: erro } = await admin.from("transacoes").update({ valor: Math.abs(Number(item.valor)), data: String(item.data).slice(0, 10) }).eq("id", alvo.id).eq("user_id", userId));
  if (alvo && !erro) await admin.from("transacoes_importadas").update({ status: "confirmada", transacao_id: alvo.id }).eq("id", importadaId);
  await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: erro ? "Não consegui" : acao === "pgat" ? "Atualizado" : "Ignorado" });
  await editar(erro ? "⚠️ Não encontrei o lançamento parecido — trate pelo app" : acao === "pgat" ? "🔄 Lançamento atualizado com o valor/data do banco" : "✅ Ignorado — é o mesmo lançamento");
}
