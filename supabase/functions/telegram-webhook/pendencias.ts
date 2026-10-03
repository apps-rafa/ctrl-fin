// /pendencias: lista o que está esperando decisão — ocorrências de recorrência "a confirmar" e possíveis duplicatas
// do mês — e põe um botão numerado para cada item (como o /ultimos). O toque abre o item:
//  - a confirmar: gera o rascunho da própria ocorrência (callback "recrasc", ver callbacks.ts);
//  - duplicata: mostra o lançamento com "Não é duplicata" / "Editar" (callbacks "penddup", "dupok", "ultedit").

import type { createClient } from "npm:@supabase/supabase-js@2";
import { tg, formatarMoedaBR } from "./util.ts";
import { hojeBrasiliaISO, normalizarTexto } from "./parser.ts";

export interface ItemPendencia {
  id: number; tipo: string; data: string; valor: number | string; categoria: string | null; descricao: string | null;
  metodo: string | null; duplicata_ok?: boolean | null; a_confirmar?: boolean | null;
}

const chaveDescricao = (d: string | null) => normalizarTexto(d ?? "").replace(/[^a-z0-9]+/g, " ").trim();

/** Mesma regra do app (js/ui.js:_detectarDuplicatas): mesmo valor, forma de pagamento e descrição, mais de uma vez
 *  no mês (por tipo), ignorando as que o usuário já marcou como "não é duplicata". Ocorrências a confirmar ficam de fora. */
export function detectarDuplicatas(itens: ItemPendencia[]): ItemPendencia[] {
  const grupos = new Map<string, ItemPendencia[]>();
  for (const t of itens) {
    if (t.a_confirmar) continue;
    const chave = [t.tipo, Number(t.valor), t.metodo ?? "", chaveDescricao(t.descricao)].join("|");
    grupos.set(chave, [...(grupos.get(chave) ?? []), t]);
  }
  return [...grupos.values()].filter((g) => g.length >= 2).flatMap((g) => g.filter((t) => !t.duplicata_ok))
    .sort((a, b) => String(b.data).localeCompare(String(a.data)) || b.id - a.id);
}

const dataCurta = (iso: string) => String(iso).slice(0, 10).split("-").reverse().slice(0, 2).join("/");
const linhaItem = (n: number, t: ItemPendencia) =>
  `${n}. ${dataCurta(t.data)} ${t.tipo === "entradas" ? "+" : "-"}${formatarMoedaBR(Number(t.valor) || 0)} — ${[t.categoria, t.descricao, t.metodo].filter(Boolean).join(" · ")}`;

const MAX_ITENS = 20;

/** Texto + botões das pendências (puro, testável). Sem nada pendente: `vazia`. */
export function montarPendencias(aConfirmar: ItemPendencia[], duplicatas: ItemPendencia[]): { vazia: boolean; texto: string; botoes: { text: string; callback_data: string }[] } {
  if (!aConfirmar.length && !duplicatas.length) return { vazia: true, texto: "✅ Nenhuma pendência — nada a confirmar nem duplicata.", botoes: [] };
  const linhas: string[] = ["📥 Pendências", ""];
  const botoes: { text: string; callback_data: string }[] = [];
  let n = 0;
  let cortou = false;
  const secao = (titulo: string, itens: ItemPendencia[], cb: string) => {
    if (!itens.length) return;
    linhas.push(titulo);
    const cabem = Math.max(0, MAX_ITENS - n);
    if (itens.length > cabem) cortou = true;
    for (const t of itens.slice(0, cabem)) {
      n += 1;
      linhas.push(linhaItem(n, t));
      botoes.push({ text: String(n), callback_data: `${cb}:${t.id}` });
    }
    linhas.push("");
  };
  secao("🔁 A confirmar", aConfirmar, "recrasc");
  secao("📑 Duplicatas", duplicatas, "penddup");
  if (cortou) linhas.push("… e mais no app", "");
  linhas.push("Toque no número para abrir:");
  return { vazia: false, texto: linhas.join("\n"), botoes };
}

/** "/pendencias": consulta e envia. */
export async function responderPendencias(admin: ReturnType<typeof createClient>, token: string, chatId: number): Promise<void> {
  const { data: tgUser } = await admin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
  if (!tgUser) {
    await tg(token, "sendMessage", { chat_id: chatId, text: "Conta não vinculada — mande /start com o código do app primeiro." });
    return;
  }
  const hoje = hojeBrasiliaISO();
  const ini = `${hoje.slice(0, 7)}-01`;
  const [a, m] = hoje.split("-").map(Number);
  const fimMes = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  const campos = "id, tipo, data, valor, categoria, descricao, metodo, duplicata_ok, a_confirmar";
  const [{ data: ac }, { data: mes }] = await Promise.all([
    admin.from("transacoes").select(campos).eq("user_id", tgUser.user_id).eq("a_confirmar", true).lte("data", fimMes).order("data", { ascending: true }),
    admin.from("transacoes").select(campos).eq("user_id", tgUser.user_id).gte("competencia", ini).lte("competencia", fimMes),
  ]);
  const f = montarPendencias((ac ?? []) as ItemPendencia[], detectarDuplicatas((mes ?? []) as ItemPendencia[]));
  if (f.vazia) {
    await tg(token, "sendMessage", { chat_id: chatId, text: f.texto });
    return;
  }
  // botões numerados, 5 por linha, e "❌ Cancelar" no fim (todo menu do bot tem saída)
  const linhasBotoes: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < f.botoes.length; i += 5) linhasBotoes.push(f.botoes.slice(i, i + 5));
  linhasBotoes.push([{ text: "❌ Cancelar", callback_data: "cancelar" }]);
  await tg(token, "sendMessage", { chat_id: chatId, text: f.texto, reply_markup: { inline_keyboard: linhasBotoes } });
}

/** Toque numa possível duplicata da /pendencias: mostra o lançamento com as opções. */
export async function abrirDuplicata(admin: ReturnType<typeof createClient>, token: string, cq: { id: string }, chatId: number, id: number): Promise<void> {
  const { data: tgUser } = await admin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
  const { data: t } = tgUser
    ? await admin.from("transacoes").select("id, tipo, data, valor, categoria, descricao, metodo").eq("id", id).eq("user_id", tgUser.user_id).maybeSingle()
    : { data: null };
  if (!t) {
    await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Esse lançamento já não existe mais" });
    return;
  }
  await tg(token, "answerCallbackQuery", { callback_query_id: cq.id });
  await tg(token, "sendMessage", {
    chat_id: chatId,
    text: `📑 Possível duplicata\n\n${linhaItem(1, t as ItemPendencia).replace(/^1\. /, "")}\n\nSe for mesmo outro lançamento, toque em "Não é duplicata". Para apagar, use o app.`,
    reply_markup: { inline_keyboard: [
      [{ text: "✅ Não é duplicata", callback_data: `dupok:${t.id}` }, { text: "✏️ Editar", callback_data: `ultedit:${t.id}` }],
      [{ text: "❌ Cancelar", callback_data: "cancelar" }],
    ] },
  });
}

/** "✅ Não é duplicata": marca o lançamento (mesma coluna do app, duplicata_ok) — sai das pendências nos dois lados. */
export async function aprovarDuplicata(admin: ReturnType<typeof createClient>, token: string, cq: { id: string; message: { message_id: number; text?: string } }, chatId: number, id: number): Promise<void> {
  const { data: tgUser } = await admin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
  const { error } = tgUser ? await admin.from("transacoes").update({ duplicata_ok: true }).eq("id", id).eq("user_id", tgUser.user_id) : { error: new Error("sem conta") };
  if (error) {
    await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Erro — tenta de novo" });
    return;
  }
  await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Ok, não avisa mais" });
  await tg(token, "editMessageText", { chat_id: chatId, message_id: cq.message.message_id, text: `${cq.message.text ?? ""}\n\n✅ Marcado como "não é duplicata"` });
}
