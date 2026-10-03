// Geração das OCORRÊNCIAS de uma recorrência (lançamentos reais em `transacoes`, nascem "a confirmar").
// Código compartilhado entre a função `recorrencias` (chamada pelo app) e a tarefa agendada do telegram-webhook.
//
// Regras:
//  - Mensal: um por mês, no dia `dia_mes` (limitado ao último dia do mês; fim de semana/feriado vai para o próximo dia útil,
//    exceto no cartão de crédito, que vale qualquer dia). Semanal: no dia da semana escolhido
//    ou, em "Variável" (dia_semana nulo), de 7 em 7 dias a partir do início.
//  - Duração em meses (`meses`): vale até `inicio + meses` (exclusive); sem duração = contínua.
//  - Antecedência: sempre até o fim do mês seguinte (mensal e semanal). `gerado_ate` guarda até onde já foi
//    gerado: nunca recria uma data (se você apagou uma ocorrência, ela não volta).
//  - Valor de cada nova ocorrência: o da última ocorrência confirmada (conta de luz: o último valor vira a
//    referência do mês seguinte); sem nenhuma confirmada, o valor cadastrado na recorrência.
//  - Ocorrência confirmada que já passou deixa de ser recorrente (recorrencia_id = nulo): edições da recorrência
//    não a alcançam mais. Ocorrência "a confirmar" vencida continua esperando o usuário decidir.

import type { createClient } from "npm:@supabase/supabase-js@2";
import { criarEhFeriado, proximoDiaUtil } from "./diautil.ts";

export interface RecorrenciaLinha {
  id: number; user_id: string; tipo: "entradas" | "saidas"; frequencia: "mensal" | "semanal";
  dia_semana: number | null; dia_mes: number | null; valor: number | string; meses: number | null;
  metodo: string; categoria: string; descricao: string; inicio: string; status: string; gerado_ate: string | null;
  competencia_offset?: number | null; // -1 = mês anterior, 0 = mesmo mês, 1 = mês seguinte ao da data do lançamento
}

const MS_DIA = 86400000;
const paraData = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const paraISO = (d: Date) => d.toISOString().slice(0, 10);

export function somarDias(iso: string, n: number): string {
  return paraISO(new Date(paraData(iso).getTime() + n * MS_DIA));
}

/** Soma `n` meses a uma data ISO fixando o dia em `dia` (limitado ao último do mês). */
export function somarMesesNoDia(iso: string, n: number, dia: number): string {
  const d = paraData(iso);
  const total = d.getUTCMonth() + n;
  const ano = d.getUTCFullYear() + Math.floor(total / 12);
  const mes = ((total % 12) + 12) % 12;
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
}

/** Fim da recorrência (exclusivo) quando tem duração; nulo = sem prazo. */
export function fimDaRecorrencia(r: Pick<RecorrenciaLinha, "inicio" | "meses" | "dia_mes">): string | null {
  return r.meses && r.meses > 1 ? somarMesesNoDia(r.inicio, r.meses, paraData(r.inicio).getUTCDate()) : null;
}

/** Todas as datas da recorrência de `inicio` até `ate` (inclusive), respeitando a duração. */
export interface OcorrenciaData { data: string; nominal: string }

/** Datas + a data NOMINAL de cada uma (o dia da regra, antes de ir para o próximo dia útil). A competência sai da nominal:
 *  salário do dia 31/10 pago em 03/11 (dia útil) continua sendo de outubro. */
export function ocorrenciasDaRecorrencia(
  r: Pick<RecorrenciaLinha, "frequencia" | "dia_semana" | "dia_mes" | "inicio" | "meses">, ate: string,
  ajustar: (d: string) => string = (d) => d,
): OcorrenciaData[] {
  const fim = fimDaRecorrencia(r);
  const dentro = (d: string) => d <= ate && (!fim || d < fim);
  const saida: OcorrenciaData[] = [];
  if (r.frequencia === "mensal") {
    const dia = r.dia_mes ?? paraData(r.inicio).getUTCDate();
    for (let k = 0; k < 600; k++) {
      const d = somarMesesNoDia(r.inicio, k, dia);
      if (d < r.inicio.slice(0, 10)) continue; // no mês do início o dia escolhido já tinha passado: começa no mês seguinte
      if (d > ate || (fim && d >= fim)) break;
      saida.push({ data: ajustar(d), nominal: d }); // mensal: fim de semana/feriado vai para o próximo dia útil
    }
    return saida;
  }
  let d = r.inicio.slice(0, 10);
  if (r.dia_semana != null) {
    while (paraData(d).getUTCDay() !== r.dia_semana) d = somarDias(d, 1);
  }
  for (let k = 0; k < 3000 && dentro(d); k++) { saida.push({ data: d, nominal: d }); d = somarDias(d, 7); }
  return saida;
}

export function datasDaRecorrencia(
  r: Pick<RecorrenciaLinha, "frequencia" | "dia_semana" | "dia_mes" | "inicio" | "meses">, ate: string,
  ajustar: (d: string) => string = (d) => d,
): string[] {
  return ocorrenciasDaRecorrencia(r, ate, ajustar).map((o) => o.data);
}

/** Até onde gerar hoje (mensal e semanal): até o FIM DO MÊS SEGUINTE — o rascunho do mês seguinte sempre já existe (em
 *  novembro já nasce o de dezembro). No semanal isso dá 4 ou 5 ocorrências por mês, conforme o mês e o dia da semana. */
export function horizonteDeGeracao(_frequencia: "mensal" | "semanal", hoje: string): string {
  return somarDias(somarMesesNoDia(`${hoje.slice(0, 7)}-01`, 2, 1), -1);
}

/** Ocorrências (data + nominal) que ainda faltam materializar. */
export function ocorrenciasParaGerar(r: RecorrenciaLinha, hoje: string, ajustar?: (d: string) => string): OcorrenciaData[] {
  const todas = ocorrenciasDaRecorrencia(r, horizonteDeGeracao(r.frequencia, hoje), ajustar);
  return r.gerado_ate ? todas.filter((o) => o.data > r.gerado_ate!) : todas;
}

/** Datas que ainda faltam materializar (depois de `gerado_ate`, até o horizonte). */
export function datasParaGerar(r: RecorrenciaLinha, hoje: string, ajustar?: (d: string) => string): string[] {
  const todas = datasDaRecorrencia(r, horizonteDeGeracao(r.frequencia, hoje), ajustar);
  return r.gerado_ate ? todas.filter((d) => d > r.gerado_ate!) : todas;
}

/** A recorrência com duração terminou (todas as datas passaram)? Então vira "encerrada". */
export function recorrenciaConcluida(r: RecorrenciaLinha, hoje: string, ajustar?: (d: string) => string): boolean {
  const fim = fimDaRecorrencia(r);
  return !!fim && hoje >= fim && !!r.gerado_ate && datasDaRecorrencia(r, fim, ajustar).every((d) => d <= r.gerado_ate!);
}

export function rotuloMetodoShared(m: { nome: string; metodo_kind: string | null; banco: string | null }): string {
  if (!m.metodo_kind || m.metodo_kind === "Dinheiro") return m.nome;
  return m.banco ? `${m.metodo_kind} ${m.banco}` : m.metodo_kind;
}

/** Mesma regra do app (js/recorrencia.js:competenciaDe): compra no/depois do fechamento cai na fatura seguinte. */
export function competenciaDoLancamento(dataISO: string, diaFechamento: number | null): string {
  const [a0, m0, d0] = dataISO.split("-").map(Number);
  let ano = a0, mes = m0 - 1;
  if (diaFechamento && d0 >= diaFechamento) { mes += 1; if (mes > 11) { mes = 0; ano += 1; } }
  return `${ano}-${String(mes + 1).padStart(2, "0")}-01`;
}

/** Competência da ocorrência: a do lançamento (mês da data; no crédito, a da fatura) deslocada em `deslocamento` meses.
 *  Ex.: salário de outubro pago em 30/09 (dia 31, competência "mês seguinte") -> competência 2026-10-01. */
export function competenciaDaOcorrencia(dataISO: string, diaFechamento: number | null, deslocamento: number | null | undefined): string {
  const base = competenciaDoLancamento(dataISO, diaFechamento);
  return deslocamento ? somarMesesNoDia(base, deslocamento, 1) : base;
}

/** Gera as ocorrências que faltam (de um usuário ou de todos), solta as passadas confirmadas e encerra as que terminaram.
 *  Devolve quantas ocorrências novas foram criadas. */
export async function gerarOcorrencias(
  admin: ReturnType<typeof createClient>, hoje: string, userId?: string,
): Promise<number> {
  let q = admin.from("recorrencias").select("*").eq("status", "ativa");
  if (userId) q = q.eq("user_id", userId);
  const { data: recs } = await q;
  let criadas = 0;
  for (const r of (recs ?? []) as RecorrenciaLinha[]) {
    const [{ data: metodos }, { data: ultimas }, { data: feriados }] = await Promise.all([
      admin.from("menu_itens").select("nome, metodo_kind, banco, dia_fechamento").eq("tipo", "Método").eq("user_id", r.user_id),
      admin.from("transacoes").select("valor, data").eq("recorrencia_id", r.id).eq("a_confirmar", false).order("data", { ascending: false }).limit(1),
      admin.from("feriados").select("data, origem, ativo").eq("user_id", r.user_id),
    ]);
    const ehFeriado = criarEhFeriado((feriados ?? []) as { data: string; origem: string; ativo: boolean }[]);
    const met = ((metodos ?? []) as { nome: string; metodo_kind: string | null; banco: string | null; dia_fechamento: number | null }[])
      .find((m) => rotuloMetodoShared(m) === r.metodo);
    const fech = met?.metodo_kind === "Crédito" ? met.dia_fechamento : null;
    // Cartão de crédito vale qualquer dia (fim de semana/feriado incluídos); as demais formas vão para o próximo dia útil
    const ajustar = met?.metodo_kind === "Crédito" ? (d: string) => d : (d: string) => proximoDiaUtil(d, ehFeriado);
    const valorRef = (ultimas && ultimas[0]) ? Number(ultimas[0].valor) : Number(r.valor); // último confirmado vira a referência
    const novas = ocorrenciasParaGerar(r, hoje, ajustar);
    const datas = novas.map((o) => o.data);
    if (datas.length) {
      const linhas = novas.map((o) => ({
        user_id: r.user_id, tipo: r.tipo, data: o.data, valor: valorRef, metodo: r.metodo, categoria: r.categoria,
        descricao: r.descricao, forma_pagamento: "À vista", tipo_recorrencia: "Pontual", competencia: competenciaDaOcorrencia(o.nominal, fech, r.competencia_offset),
        status: "Ativa", recorrencia_id: r.id, a_confirmar: true,
        // semanal: o mesmo valor/forma/descrição várias vezes no mês é o normal, nunca duplicata
        duplicata_ok: r.frequencia === "semanal",
      }));
      const { error } = await admin.from("transacoes").upsert(linhas, { onConflict: "recorrencia_id,data", ignoreDuplicates: true });
      if (error) { console.error("Ocorrências não geradas:", error); continue; }
      criadas += linhas.length;
      r.gerado_ate = datas[datas.length - 1];
      await admin.from("recorrencias").update({ gerado_ate: r.gerado_ate }).eq("id", r.id);
    }
    if (recorrenciaConcluida(r, hoje, ajustar)) await admin.from("recorrencias").update({ status: "encerrada", encerrada_em: hoje }).eq("id", r.id);
  }
  // O que já passou e foi confirmado deixa de ser recorrente (não é mais afetado por edições da recorrência)
  let d = admin.from("transacoes").update({ recorrencia_id: null }).not("recorrencia_id", "is", null).eq("a_confirmar", false).lt("data", hoje);
  if (userId) d = d.eq("user_id", userId);
  await d;
  return criadas;
}
