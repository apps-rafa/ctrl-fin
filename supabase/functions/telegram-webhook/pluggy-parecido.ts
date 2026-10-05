// Botões do aviso "já existe algo parecido" de um lançamento que chegou da Pluggy (pgig / pgat / pgou) — resposta compartilhada com as
// demais origens (ver decisao-parecido.ts): é o mesmo = concilia e ignora; atualizar = corrige valor/data do existente; outro = aviso normal.

import type { createClient } from "npm:@supabase/supabase-js@2";
import { rotuloMetodo } from "./util.ts";
import { limparLinks } from "./parser.ts";
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
      await tg(token, "sendMessage", { chat_id: chatId, text: texto, parse_mode: "Markdown", reply_markup: { inline_keyboard: botoes } });
    },
  });
}
