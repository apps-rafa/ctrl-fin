// Gravação de lançamentos/menus pelo bot e montagem do endereço do Mini App.

import type { createClient } from "npm:@supabase/supabase-js@2";
import { rotuloMetodo } from "./util.ts";
import { competenciaDe, addMeses, type RascunhoLancamento } from "./parser.ts";

/** Grava de vez um rascunho (ver RascunhoLancamento) como lançamento de
 *  verdade em `transacoes` — chamado tanto pelo botão inline "✅ Confirmar"
 *  (callback "nlconfirmar:<id>") quanto pela submissão do mini app
 *  ("✏️ Editar"). */
export async function confirmarRascunhoNoBanco(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  d: RascunhoLancamento,
): Promise<{ erro: unknown }> {
  const ehCredito = d.metodoKind === "Crédito";
  const competencia = d.competencia || competenciaDe(d.data, ehCredito ? d.diaFechamento : null);
  // Despesa > categoria "Estorno" = crédito na fatura do cartão (gravado como entrada, igual ao app).
  const ehEstorno = d.tipo === "saidas" && d.categoria === "Estorno";
  if (ehEstorno && !ehCredito) return { erro: new Error("Estorno exige um cartão de crédito") };
  const tipoGravar = ehEstorno ? "entradas" : d.tipo;

  // Compra parcelada: uma linha por parcela, igual ao adicionarParceladoAPI do
  // app (grupo_id comum, centavos distribuídos, 1 mês entre parcelas).
  const n = d.parcelas && d.parcelas > 1 && ehCredito && d.tipo === "saidas" && !ehEstorno ? d.parcelas : 0;
  if (n) {
    const grupoId = crypto.randomUUID();
    const totalCent = Math.round(d.valor * 100);
    const base = Math.floor(totalCent / n);
    const resto = totalCent - base * n;
    const registros = Array.from({ length: n }, (_, i) => ({
      tipo: tipoGravar,
      data: addMeses(d.data, i),
      valor: (base + (i < resto ? 1 : 0)) / 100,
      metodo: d.metodo,
      categoria: d.categoria,
      descricao: d.descricao,
      forma_pagamento: "À vista",
      tipo_recorrencia: "Parcelada",
      competencia: i === 0 ? competencia : addMeses(competencia, i),
      status: "Ativa",
      grupo_id: grupoId,
      parcela_num: i + 1,
      parcelas_total: n,
      valor_total: totalCent / 100,
      user_id: userId,
    }));
    const { error: erroParcelas } = await supabaseAdmin.from("transacoes").insert(registros);
    return { erro: erroParcelas };
  }

  const { error } = await supabaseAdmin.from("transacoes").insert({
    tipo: tipoGravar,
    data: d.data,
    valor: d.valor,
    metodo: d.metodo, // receita também guarda a forma (opcional)
    categoria: d.categoria,
    descricao: d.descricao,
    forma_pagamento: "À vista",
    tipo_recorrencia: "Pontual",
    competencia,
    status: "Ativa",
    user_id: userId,
  });
  return { erro: error };
}

export const PALETA_CHIPS = [
  "#EF4444", "#F97316", "#F59E0B", "#EAB308", "#84CC16", "#22C55E",
  "#10B981", "#14B8A6", "#06B6D4", "#0EA5E9", "#3B82F6", "#6366F1",
  "#8B5CF6", "#A855F7", "#D946EF", "#EC4899", "#F43F5E", "#64748B",
];
/** Mesma cor padrão do app (js/config.js:corPadraoChip). */
export function corPadraoChip(nome: string): string {
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0;
  return PALETA_CHIPS[h % PALETA_CHIPS.length];
}

/** Cria a categoria na posição alfabética da lista (mesma regra do app:
 *  js/ui.js:_inserirCategoriaAlfabetica). Ignora se já existir. */
export async function criarCategoria(
  admin: ReturnType<typeof createClient>, userId: string,
  tipo: "entradas" | "saidas", nome: string, descricao: string,
): Promise<boolean> {
  const { data } = await admin.from("menu_itens").select("id, nome, ordem")
    .eq("tipo", "Categoria").eq("categoria_tipo", tipo).eq("user_id", userId);
  const itens = ((data ?? []) as { id: number; nome: string; ordem: number | null }[])
    .sort((a, b) => (a.ordem ?? Infinity) - (b.ordem ?? Infinity) || a.nome.localeCompare(b.nome, "pt-BR"))
    .map((it, i) => ({ ...it, ef: it.ordem ?? i + 1 }));
  if (itens.some((it) => it.nome.toLowerCase() === nome.toLowerCase())) return true;
  const depois = itens.findIndex((it) => it.nome.localeCompare(nome, "pt-BR") > 0);
  const ordem = depois === -1 ? (itens.length ? itens[itens.length - 1].ef + 1 : 1) : itens[depois].ef;
  const { error } = await admin.from("menu_itens").insert({
    tipo: "Categoria", nome, ordem, descricao, categoria_tipo: tipo, cor: corPadraoChip(nome), user_id: userId,
  });
  if (error) { console.error(error); return false; }
  if (depois !== -1) {
    for (const it of itens.slice(depois)) await admin.from("menu_itens").update({ ordem: it.ef + 1 }).eq("id", it.id);
  }
  return true;
}

/** Cria a forma de pagamento (PIX ou Crédito) como o "+" do formulário do app. */
export async function criarMetodo(
  admin: ReturnType<typeof createClient>, userId: string,
  n: { kind: string; banco: string; venc: number | null; fech: number | null; melhor: number | null },
): Promise<boolean> {
  const kind = n.kind === "Crédito" ? "Crédito" : n.kind === "PIX" ? "PIX" : null;
  if (!kind) return false;
  const banco = String(n.banco ?? "").trim();
  if (kind === "Crédito" && (!banco || !(n.venc && n.venc >= 1 && n.venc <= 31))) return false;
  const nome = banco ? `${kind} — ${banco}` : kind;
  const rotulo = banco ? `${kind} ${banco}` : kind;
  const { data } = await admin.from("menu_itens").select("nome, banco, metodo_kind, ordem").eq("tipo", "Método").eq("user_id", userId);
  const existentes = (data ?? []) as { nome: string; banco: string | null; metodo_kind: string | null; ordem: number | null }[];
  if (existentes.some((m) => rotuloMetodo(m) === rotulo)) return true;
  const ordem = existentes.reduce((mx, m) => Math.max(mx, m.ordem ?? 0), 0) + 1;
  const fech = n.fech && n.fech >= 1 && n.fech <= 31 ? n.fech : null;
  const extra: Record<string, unknown> = { metodo_kind: kind, banco, cor: corPadraoChip(nome) };
  if (kind === "Crédito") {
    extra.dia_vencimento = n.venc;
    if (fech) extra.dia_fechamento = fech;
    const melhor = n.melhor && n.melhor >= 1 && n.melhor <= 31 ? n.melhor : (fech ? Math.min(31, fech + 1) : null);
    if (melhor) extra.melhor_dia_compra = melhor;
  }
  const { error } = await admin.from("menu_itens").insert({ tipo: "Método", nome, ordem, user_id: userId, ...extra });
  if (error) { console.error(error); return false; }
  return true;
}

export const MINIAPP_URL = "https://apps-rafa.github.io/ctrl-fin/lancamento-tg.html";

export interface ListasUsuario {
  catsR: string[];
  catsD: string[];
  metodos: { nome: string; metodo_kind: string | null; banco: string | null; dia_fechamento: number | null }[];
}

export async function carregarListasUsuario(admin: ReturnType<typeof createClient>, userId: string): Promise<ListasUsuario> {
  const [{ data: cats }, { data: mets }] = await Promise.all([
    admin.from("menu_itens").select("nome, categoria_tipo").eq("tipo", "Categoria").eq("status", "Ativo").eq("user_id", userId).order("ordem"),
    admin.from("menu_itens").select("nome, metodo_kind, banco, dia_fechamento").eq("tipo", "Método").eq("status", "Ativo").eq("user_id", userId).order("ordem"),
  ]);
  const lista = (cats ?? []) as { nome: string; categoria_tipo: string | null }[];
  // "Estorno" (Despesa) é fixa e sempre ativa, mas só existe a partir do 1º cartão de crédito.
  const temCartao = ((mets ?? []) as { metodo_kind: string | null }[]).some((m) => m.metodo_kind === "Crédito");
  if (temCartao && !lista.some((c) => c.categoria_tipo === "saidas" && c.nome === "Estorno")) {
    const { data: ex } = await admin.from("menu_itens").select("id").eq("tipo", "Categoria").eq("categoria_tipo", "saidas").eq("nome", "Estorno").eq("user_id", userId).maybeSingle();
    if (ex) await admin.from("menu_itens").update({ status: "Ativo" }).eq("id", ex.id);
    else await admin.from("menu_itens").insert({ tipo: "Categoria", nome: "Estorno", categoria_tipo: "saidas", cor: corPadraoChip("Estorno"), user_id: userId });
    lista.push({ nome: "Estorno", categoria_tipo: "saidas" });
  }
  return {
    catsR: lista.filter((c) => c.categoria_tipo === "entradas" && c.nome !== "Estorno").map((c) => c.nome),
    catsD: lista.filter((c) => c.categoria_tipo === "saidas" && (temCartao || c.nome !== "Estorno")).map((c) => c.nome),
    metodos: (mets ?? []) as ListasUsuario["metodos"],
  };
}

/** Endereço do mini app (formulário de lançamento) já preenchido com o rascunho.
 *  Leva o id do rascunho (`id`) pra o mini app devolver junto no envio — assim o
 *  bot sabe qual dos vários rascunhos pendentes foi editado (ver web_app_data
 *  em Deno.serve). */
export function urlMiniApp(id: number | string, r: RascunhoLancamento, l: ListasUsuario): string {
  const q = new URLSearchParams();
  q.set("id", String(id));
  q.set("tipo", r.tipo);
  q.set("v", String(r.valor));
  q.set("d", r.data);
  q.set("c", r.categoria);
  if (r.metodo) q.set("m", r.metodo);
  if (r.descricao) q.set("desc", r.descricao);
  if (r.parcelas && r.parcelas > 1) q.set("p", String(r.parcelas));
  q.set("cr", JSON.stringify(l.catsR));
  q.set("cd", JSON.stringify(l.catsD));
  q.set("mt", JSON.stringify(l.metodos.map((m) => [rotuloMetodo(m), m.metodo_kind, m.dia_fechamento])));
  // Toda despesa tem "Mês" no formulário (no crédito, o da fatura; nos outros, o da data)
  q.set("comp", (r.competencia || competenciaDe(r.data, r.tipo === "saidas" && r.metodoKind === "Crédito" ? r.diaFechamento : null)).slice(5, 7));
  return `${MINIAPP_URL}?${q.toString()}`;
}
