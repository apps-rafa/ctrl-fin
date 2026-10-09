// Lembretes de vencimento pelo Telegram (rodam todo dia pela tarefa agendada "lembretes", ver index.ts).
//
// Regras:
//  - Despesa que NÃO é de cartão: lembra no dia da data do lançamento (o vencimento). Só quem já existia
//    antes de hoje (o que foi lançado hoje já está na tela) e não veio do banco (Open Finance = já aconteceu).
//  - Despesa programada no cartão (ex.: conta de luz que você mesmo paga com o cartão, assinatura): lembra no
//    dia da data, como as outras. Compra comum e parcela não (já aconteceram ou são automáticas).
//  - Fatura do cartão: no dia do vencimento da fatura (dia_vencimento do cartão), com o total da fatura do
//    mês (despesas - estornos), se ela não estiver marcada como paga.
//  - Já marcada como "Pago" (agendado = false) não gera lembrete: o "Pago" pode ser marcado no próprio dia,
//    antes das 09:00. Lançamento sem data definida (vale como fim do mês) lembra no último dia do mês.
//  - Cada despesa avisada tem o botão "Marcar como pago" na própria mensagem (ver tecladoPagoVencimentos): marca
//    o mesmo checkbox do app, que segue marcado até o dia seguinte; o botão vira "Desmarcar como pago" e reverte.
//  - Receitas não geram lembrete.
//  - Cada lançamento/fatura é lembrado uma vez só (a chave fica em alertas_bot).
//  - Todos os vencimentos do dia saem juntos, numa mensagem só.

import type { createClient } from "npm:@supabase/supabase-js@2";
import { tg, formatarMoedaBR, rotuloMetodo } from "./util.ts";
import { hojeBrasiliaISO } from "./parser.ts";
import { mesAbrevAno } from "./lancamentos.ts";

export interface TransacaoLembrete {
  id: number; tipo: string; data: string; valor: number | string; categoria: string | null;
  descricao: string | null; metodo: string | null; competencia: string | null; quitada?: boolean | null;
  origem?: string | null; criado_em?: string | null; a_confirmar?: boolean | null;
  agendado?: boolean | null; data_indefinida?: boolean | null; parcelas_total?: number | null;
}
export interface MetodoLembrete { nome: string; metodo_kind: string | null; banco: string | null; dia_vencimento: number | null }

/** Um vencimento do dia. Todos saem juntos numa mensagem só (ver montarMensagemVencimentos). */
export interface Lembrete { chave: string; titulo: string; detalhe: string; valor: number; transacaoId?: number; nome?: string }

const dataBR = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

/** Início do dia (00:00 de Brasília) em ISO UTC — lançamentos criados a partir daí são "de hoje". */
export function inicioDoDiaBrasiliaISO(hojeISO: string): string {
  return `${hojeISO}T03:00:00.000Z`;
}

/** Dia de vencimento efetivo no mês (cartão com vencimento dia 31 vence no último dia de fevereiro etc.). */
export function diaVencimentoNoMes(dia: number, hojeISO: string): number {
  const [a, m] = hojeISO.split("-").map(Number);
  return Math.min(dia, new Date(Date.UTC(a, m, 0)).getUTCDate());
}

/** Monta os vencimentos do dia (puro: sem acesso a banco/rede, para poder testar). */
export function montarLembretes(p: {
  userId: string;
  hojeISO: string;
  transacoes: TransacaoLembrete[];          // candidatas: despesas da data de hoje + lançamentos da competência do mês (p/ fatura)
  metodos: MetodoLembrete[];
  faturasPagas: { metodo: string; competencia: string }[];
  jaEnviados: Set<string>;
}): Lembrete[] {
  const { userId, hojeISO, transacoes, metodos, faturasPagas, jaEnviados } = p;
  const cartoes = metodos.filter((m) => m.metodo_kind === "Crédito");
  const rotulosCartao = new Set(cartoes.map((m) => rotuloMetodo(m)));
  const inicioHoje = new Date(inicioDoDiaBrasiliaISO(hojeISO)).getTime();
  const saida: Lembrete[] = [];

  // 1) Despesas que vencem hoje
  for (const t of transacoes) {
    if (t.tipo !== "saidas" || String(t.data).slice(0, 10) !== hojeISO) continue;
    // cartão: só a despesa programada (não a compra comum nem a parcela)
    if (t.metodo && rotulosCartao.has(t.metodo) && (t.agendado !== true || t.parcelas_total)) continue;
    if (t.quitada || t.origem === "pluggy") continue;
    if (t.agendado === false) continue; // já marcada como "Pago" (ou nunca esteve "a pagar")
    if (t.a_confirmar) continue; // ocorrência de recorrência: tem o lembrete próprio (montarLembretesRecorrencia)
    if (t.criado_em && new Date(t.criado_em).getTime() >= inicioHoje) continue; // lançado hoje
    const chave = `lembrete:${userId}:tx:${t.id}`;
    if (jaEnviados.has(chave)) continue;
    const valor = Number(t.valor) || 0;
    saida.push({
      chave,
      titulo: `💸 ${t.descricao || t.categoria || "Despesa"} — ${formatarMoedaBR(valor)}`,
      detalhe: `Categoria: ${t.categoria || "—"} · Forma de pgto.: ${t.metodo || "—"}${t.data_indefinida ? " · sem data definida" : ""}`,
      valor,
      transacaoId: t.id,
      nome: t.descricao || t.categoria || "Despesa",
    });
  }

  // 2) Fatura de cada cartão cujo vencimento é hoje
  const compMes = `${hojeISO.slice(0, 7)}-01`;
  for (const c of cartoes) {
    if (!c.dia_vencimento || diaVencimentoNoMes(Number(c.dia_vencimento), hojeISO) !== Number(hojeISO.slice(8, 10))) continue;
    const rot = rotuloMetodo(c);
    const chave = `lembrete:${userId}:fat:${rot}:${compMes}`;
    if (jaEnviados.has(chave)) continue;
    if (faturasPagas.some((f) => f.metodo === rot && String(f.competencia).slice(0, 10) === compMes)) continue;
    const doMes = transacoes.filter((t) => t.metodo === rot && String(t.competencia ?? "").slice(0, 10) === compMes);
    const total = doMes.reduce((s, t) => s + (t.tipo === "entradas" ? -1 : 1) * (Number(t.valor) || 0), 0); // estorno abate
    if (total <= 0.004) continue;
    saida.push({
      chave,
      titulo: `💳 Fatura ${rot} — ${formatarMoedaBR(total)}`,
      detalhe: `Mês da fatura: ${mesAbrevAno(compMes)} · ${doMes.length} lançamento${doMes.length === 1 ? "" : "s"}`,
      valor: total,
    });
  }
  return saida;
}

/** Ocorrência de recorrência "a confirmar" que vence hoje. */
export interface OcorrenciaLembrete { id: number; tipo: string; data: string; valor: number | string; categoria: string | null; descricao: string | null; metodo: string | null }

/** Lembretes de recorrência (um por ocorrência, cada um com seus botões): só as que vencem hoje e ainda não foram lembradas. */
export function montarLembretesRecorrencia(p: { userId: string; hojeISO: string; ocorrencias: OcorrenciaLembrete[]; jaEnviados: Set<string> }): { chave: string; ocorrenciaId: number; texto: string }[] {
  return p.ocorrencias
    .filter((o) => String(o.data).slice(0, 10) === p.hojeISO && !p.jaEnviados.has(`lembrete:${p.userId}:rec:${o.id}`))
    .map((o) => {
      const valor = Number(o.valor) || 0;
      const receita = o.tipo === "entradas";
      return {
        chave: `lembrete:${p.userId}:rec:${o.id}`, ocorrenciaId: o.id,
        texto: [
          `🔁 Recorrência de hoje (${dataBR(p.hojeISO)})`,
          `${receita ? "💰" : "💸"} ${o.descricao || o.categoria || (receita ? "Receita" : "Despesa")} — ${formatarMoedaBR(valor)}`,
          `Categoria: ${o.categoria || "—"}${receita ? "" : ` · Forma de pgto.: ${o.metodo || "—"}`}`,
          "",
          "Está em \"A confirmar\" no app.",
        ].join("\n"),
      };
    });
}

/** Texto único com todos os vencimentos do dia (um só envio por usuário). */
export function montarMensagemVencimentos(hojeISO: string, lembretes: Lembrete[]): string {
  const linhas = [`⏰ Vencimentos de hoje (${dataBR(hojeISO)})`, ""];
  for (const l of lembretes) linhas.push(l.titulo, `   ${l.detalhe}`, "");
  if (lembretes.length > 1) linhas.push(`Total: ${formatarMoedaBR(lembretes.reduce((a, l) => a + l.valor, 0))}`);
  return linhas.join("\n").trimEnd();
}

/** Rótulo do botão de um vencimento: "Marcar como pago" ou, já marcado hoje, "Desmarcar como pago". Com vários, ganha o nome. */
export function rotuloBotaoPago(marcado: boolean, nome: string, varios: boolean): string {
  const base = marcado ? "Desmarcar como pago" : "Marcar como pago";
  return varios ? `${base}: ${nome.length > 22 ? nome.slice(0, 21) + "…" : nome}` : base;
}

/** Um botão "Marcar como pago" por despesa avisada (nulo se o aviso não tem despesa, só fatura). */
export function tecladoPagoVencimentos(lembretes: Lembrete[]) {
  const comId = lembretes.filter((l) => l.transacaoId != null);
  if (!comId.length) return null;
  return {
    inline_keyboard: comId.map((l) => [{ text: rotuloBotaoPago(false, l.nome ?? "", comId.length > 1), callback_data: `pgmarcar:${l.transacaoId}` }]),
  };
}

/** Corpo do aviso de vencimentos. Com despesas: o botão "Marcar como pago" vai na própria mensagem (inline, sem teclado
 *  persistente). Só fatura: sem botões, e remove o teclado de edição ("✏️ Editar" / "❌ Cancelar edição") deixado na conversa. */
export function corpoAvisoVencimentos(chatId: number, hojeISO: string, lembretes: Lembrete[]) {
  const reply_markup = tecladoPagoVencimentos(lembretes) ?? { remove_keyboard: true };
  return { chat_id: chatId, text: montarMensagemVencimentos(hojeISO, lembretes), reply_markup };
}

/** Botão "Marcar como pago" / "Desmarcar como pago" de um vencimento (callback "pgmarcar:<id>"). Mesma regra do checkbox do app:
 *  marcar põe agendado = false e pago_em = hoje; desmarcar volta agendado = true e pago_em = null. Só o botão tocado muda. */
export async function tratarPagoVencimento(
  admin: ReturnType<typeof createClient>, token: string, cq: any, chatId: number, idStr: string,
): Promise<void> {
  const id = Number(idStr);
  const responder = (text: string) => tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text });
  const { data: tgUser } = await admin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
  if (!tgUser) { await responder("Conta não vinculada"); return; }
  const userId = (tgUser as { user_id: string }).user_id;
  const hoje = hojeBrasiliaISO();
  const { data: t } = await admin.from("transacoes").select("id, descricao, categoria, agendado, pago_em")
    .eq("id", id).eq("user_id", userId).maybeSingle(); // nunca confia só no id vindo do botão
  const linha = t as { id: number; descricao: string | null; categoria: string | null; agendado: boolean | null; pago_em: string | null } | null;
  if (!linha) { await responder("Esse lançamento já não existe mais"); return; }
  const marcadoHoje = linha.agendado === false && String(linha.pago_em ?? "").slice(0, 10) === hoje;
  if (linha.agendado === false && !marcadoHoje) { await responder("Já estava marcado como pago"); return; }
  const marcar = !marcadoHoje;
  const { error } = await admin.from("transacoes")
    .update(marcar ? { agendado: false, pago_em: hoje } : { agendado: true, pago_em: null })
    .eq("id", id).eq("user_id", userId);
  if (error) { await responder("Não consegui atualizar"); return; }
  await responder(marcar ? "Marcado como pago ✅" : "Desmarcado");
  const linhas = (cq.message?.reply_markup?.inline_keyboard ?? []) as { text: string; callback_data: string }[][];
  const varios = linhas.filter((r) => String(r[0]?.callback_data ?? "").startsWith("pgmarcar:")).length > 1;
  const novas = linhas.map((r) => (r[0]?.callback_data === `pgmarcar:${id}`
    ? [{ text: rotuloBotaoPago(marcar, linha.descricao || linha.categoria || "Despesa", varios), callback_data: r[0].callback_data }]
    : r));
  await tg(token, "editMessageReplyMarkup", { chat_id: chatId, message_id: cq.message.message_id, reply_markup: { inline_keyboard: novas } });
}

/** Corpo do aviso de recorrência: também só aviso, sem botões (o rascunho sai pelo app, em "A confirmar"). */
export function corpoAvisoRecorrencia(chatId: number, texto: string) {
  return { chat_id: chatId, text: texto, reply_markup: { remove_keyboard: true } };
}

/** Roda os lembretes de TODOS os usuários vinculados ao Telegram. Devolve quantos vencimentos foram avisados. */
export async function executarLembretes(
  admin: ReturnType<typeof createClient>, token: string, agora: Date = new Date(),
): Promise<number> {
  const hojeISO = hojeBrasiliaISO(agora);
  const compMes = `${hojeISO.slice(0, 7)}-01`;
  const { data: users } = await admin.from("telegram_users").select("user_id, chat_id");
  let enviados = 0;
  for (const u of (users ?? []) as { user_id: string; chat_id: number }[]) {
    const [{ data: metodos }, { data: doDia }, { data: doMes }, { data: pagas }] = await Promise.all([
      admin.from("menu_itens").select("nome, metodo_kind, banco, dia_vencimento").eq("tipo", "Método").eq("user_id", u.user_id),
      admin.from("transacoes").select("id, tipo, data, valor, categoria, descricao, metodo, competencia, quitada, origem, criado_em, a_confirmar, agendado, data_indefinida, parcelas_total")
        .eq("user_id", u.user_id).eq("tipo", "saidas").eq("data", hojeISO),
      admin.from("transacoes").select("id, tipo, data, valor, categoria, descricao, metodo, competencia, quitada, origem, criado_em, a_confirmar, agendado, data_indefinida, parcelas_total")
        .eq("user_id", u.user_id).eq("competencia", compMes),
      admin.from("faturas_pagas").select("metodo, competencia").eq("user_id", u.user_id).eq("competencia", compMes),
    ]);
    const candidatas = [...((doDia ?? []) as TransacaoLembrete[]), ...((doMes ?? []) as TransacaoLembrete[])];
    const unicas = [...new Map(candidatas.map((t) => [t.id, t])).values()];
    const chavesPossiveis = [
      ...unicas.map((t) => `lembrete:${u.user_id}:tx:${t.id}`),
      ...((metodos ?? []) as MetodoLembrete[]).map((m) => `lembrete:${u.user_id}:fat:${rotuloMetodo(m)}:${compMes}`),
    ];
    const { data: ja } = chavesPossiveis.length
      ? await admin.from("alertas_bot").select("chave").in("chave", chavesPossiveis)
      : { data: [] as { chave: string }[] };
    const lembretes = montarLembretes({
      userId: u.user_id, hojeISO, transacoes: unicas, metodos: (metodos ?? []) as MetodoLembrete[],
      faturasPagas: (pagas ?? []) as { metodo: string; competencia: string }[],
      jaEnviados: new Set(((ja ?? []) as { chave: string }[]).map((x) => x.chave)),
    });
    // marca ANTES de enviar: numa falha de rede perde-se um lembrete, mas nunca se manda em dobro
    const novos: Lembrete[] = [];
    for (const l of lembretes) {
      const { error } = await admin.from("alertas_bot").insert({ chave: l.chave, enviado_em: new Date().toISOString() });
      if (!error) novos.push(l); // erro = já existia (execução concorrente)
    }
    if (novos.length) {
      await tg(token, "sendMessage", corpoAvisoVencimentos(u.chat_id, hojeISO, novos));
      enviados += novos.length;
    }

    // Recorrências que vencem hoje (a confirmar): aviso sem botões. Cada uma é lembrada uma vez só.
    const { data: ocs } = await admin.from("transacoes").select("id, tipo, data, valor, categoria, descricao, metodo")
      .eq("user_id", u.user_id).eq("a_confirmar", true).not("recorrencia_id", "is", null).eq("data", hojeISO);
    const ocorrencias = (ocs ?? []) as OcorrenciaLembrete[];
    if (!ocorrencias.length) continue;
    const { data: jaRec } = await admin.from("alertas_bot").select("chave").in("chave", ocorrencias.map((o) => `lembrete:${u.user_id}:rec:${o.id}`));
    const lembRec = montarLembretesRecorrencia({ userId: u.user_id, hojeISO, ocorrencias, jaEnviados: new Set(((jaRec ?? []) as { chave: string }[]).map((x) => x.chave)) });
    for (const l of lembRec) {
      const { error } = await admin.from("alertas_bot").insert({ chave: l.chave, enviado_em: new Date().toISOString() });
      if (error) continue; // já lembrada (execução concorrente)
      await tg(token, "sendMessage", corpoAvisoRecorrencia(u.chat_id, l.texto));
      enviados += 1;
    }
  }
  return enviados;
}
