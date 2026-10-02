// Lembretes de vencimento pelo Telegram (rodam todo dia pela tarefa agendada "lembretes", ver index.ts).
//
// Regras:
//  - Despesa que NÃO é de cartão: lembra no dia da data do lançamento (o vencimento). Só quem já existia
//    antes de hoje (o que foi lançado hoje já está na tela) e não veio do banco (Open Finance = já aconteceu).
//  - Cartão de crédito: nunca pela data da compra; só no dia do vencimento da fatura (dia_vencimento do
//    cartão), com o total da fatura do mês (despesas - estornos), se ela não estiver marcada como paga.
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
  origem?: string | null; criado_em?: string | null;
}
export interface MetodoLembrete { nome: string; metodo_kind: string | null; banco: string | null; dia_vencimento: number | null }

/** Um vencimento do dia. Todos saem juntos numa mensagem só (ver montarMensagemVencimentos). */
export interface Lembrete { chave: string; titulo: string; detalhe: string; valor: number }

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

  // 1) Despesas fora do cartão que vencem hoje
  for (const t of transacoes) {
    if (t.tipo !== "saidas" || String(t.data).slice(0, 10) !== hojeISO) continue;
    if (t.metodo && rotulosCartao.has(t.metodo)) continue; // cartão: só pelo vencimento da fatura
    if (t.quitada || t.origem === "pluggy") continue;
    if (t.criado_em && new Date(t.criado_em).getTime() >= inicioHoje) continue; // lançado hoje
    const chave = `lembrete:${userId}:tx:${t.id}`;
    if (jaEnviados.has(chave)) continue;
    const valor = Number(t.valor) || 0;
    saida.push({
      chave,
      titulo: `💸 ${t.descricao || t.categoria || "Despesa"} — ${formatarMoedaBR(valor)}`,
      detalhe: `Categoria: ${t.categoria || "—"} · Forma de pgto.: ${t.metodo || "—"}`,
      valor,
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

/** Texto único com todos os vencimentos do dia (um só envio por usuário). */
export function montarMensagemVencimentos(hojeISO: string, lembretes: Lembrete[]): string {
  const linhas = [`⏰ Vencimentos de hoje (${dataBR(hojeISO)})`, ""];
  for (const l of lembretes) linhas.push(l.titulo, `   ${l.detalhe}`, "");
  if (lembretes.length > 1) linhas.push(`Total: ${formatarMoedaBR(lembretes.reduce((a, l) => a + l.valor, 0))}`);
  return linhas.join("\n").trimEnd();
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
      admin.from("transacoes").select("id, tipo, data, valor, categoria, descricao, metodo, competencia, quitada, origem, criado_em")
        .eq("user_id", u.user_id).eq("tipo", "saidas").eq("data", hojeISO),
      admin.from("transacoes").select("id, tipo, data, valor, categoria, descricao, metodo, competencia, quitada, origem, criado_em")
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
    if (!novos.length) continue;
    await tg(token, "sendMessage", { chat_id: u.chat_id, text: montarMensagemVencimentos(hojeISO, novos) });
    enviados += novos.length;
  }
  return enviados;
}
