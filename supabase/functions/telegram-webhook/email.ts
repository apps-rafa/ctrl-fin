// E-mail de conta (luz, gás, condomínio...) -> rascunho no Telegram, ligado à recorrência.
// O Google Apps Script do Gmail (scripts/gmail-contas.gs) manda cada e-mail rotulado para cá (ver index.ts, header
// x-email-secret). Aqui: acha a recorrência pelo remetente, lê valor e vencimento do texto, atualiza a ocorrência
// "a confirmar" do mês (sem valor no e-mail = vale o do mês anterior, que a ocorrência já traz) e manda o rascunho do bot.

import type { createClient } from "npm:@supabase/supabase-js@2";
import { tg, formatarMoedaBR, rotuloMetodo } from "./util.ts";
import { enviarRascunho, carregarListasUsuario } from "./lancamentos.ts";
import { hojeBrasiliaISO, somarDiasISO, normalizarTexto, type RascunhoLancamento } from "./parser.ts";

export interface EmailConta { messageId: string; from: string; subject: string; body: string }
export interface RecorrenciaEmail { id: number; descricao: string; categoria: string; remetentes: string }
export interface OcorrenciaEmail { id: number; data: string; valor: number | string }

const numeroBR = (s: string) => parseFloat(s.replace(/\./g, "").replace(",", "."));
const iso = (a: number, m: number, d: number) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Valor e vencimento de um texto de conta. Valor: o que vem logo depois de "valor total / total a pagar / valor da fatura /
 *  valor do documento..." (ou o único "R$" do texto); sem isso, null (o chamador usa o valor do mês anterior). */
export function extrairDadosConta(textoBruto: string, hoje = hojeBrasiliaISO()): { valor: number | null; vencimento: string | null } {
  const texto = textoBruto.replace(/\s+/g, " ");
  const baixo = normalizarTexto(texto);
  const rotulos = ["total a pagar", "valor a pagar", "valor total", "total da fatura", "valor da fatura", "valor do documento", "valor da conta", "valor"];
  let valor: number | null = null;
  const dinheiro = [...baixo.matchAll(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})(?!\d)/g)];
  for (const r of rotulos) {
    const achado = dinheiro.find((m) => {
      const antes = baixo.slice(Math.max(0, (m.index ?? 0) - 45), m.index ?? 0);
      return antes.includes(r);
    });
    if (achado) { valor = numeroBR(achado[1]); break; }
  }
  if (valor === null) {
    const comRS = [...baixo.matchAll(/r\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/g)].map((m) => numeroBR(m[1]));
    const unicos = [...new Set(comRS)];
    if (unicos.length === 1) valor = unicos[0];
  }
  if (valor !== null && !(valor > 0)) valor = null;

  let vencimento: string | null = null;
  const mv = baixo.match(/venc\w*[^0-9]{0,30}(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (mv) {
    const d = Number(mv[1]), m = Number(mv[2]);
    let a = mv[3] ? Number(mv[3]) : Number(hoje.slice(0, 4));
    if (a < 100) a += 2000;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) vencimento = iso(a, m, d);
  }
  return { valor, vencimento };
}

/** Recorrência cujo "remetente/palavras" aparece no remetente ou no assunto do e-mail. */
export function recorrenciaDoEmail(recs: RecorrenciaEmail[], from: string, subject: string): RecorrenciaEmail | null {
  const alvo = normalizarTexto(`${from} ${subject}`);
  for (const r of recs) {
    const termos = String(r.remetentes || "").split(/[,;\n]/).map((t) => normalizarTexto(t).trim()).filter(Boolean);
    if (termos.some((t) => alvo.includes(t))) return r;
  }
  return null;
}

const PALAVRAS_COMUNS = new Set(["conta", "contas", "fatura", "boleto", "pagamento", "valor", "casa", "mensal", "digital", "servico", "servicos", "cobranca"]);

/** Sem remetente cadastrado: acha a recorrência pelas PALAVRAS da descrição/categoria dela no remetente, no assunto ou no corpo
 *  ("Luz Light" -> "light", "Gás Naturgy" -> "naturgy", "Condomínio" -> "condominio"). Palavra no remetente/assunto vale 2, no corpo 1;
 *  precisa de pelo menos 2 pontos e de um vencedor único. */
export function recorrenciaPorPalavras(recs: RecorrenciaEmail[], from: string, subject: string, body: string): RecorrenciaEmail | null {
  const cab = normalizarTexto(`${from} ${subject}`);
  const corpo = normalizarTexto(body.slice(0, 5000));
  const placar = recs.map((r) => {
    const palavras = [...new Set(normalizarTexto(`${r.descricao} ${r.categoria}`).split(/[^a-z0-9]+/).filter((p) => p.length >= 4 && !PALAVRAS_COMUNS.has(p)))];
    let pontos = 0;
    for (const p of palavras) pontos += cab.includes(p) ? 2 : corpo.includes(p) ? 1 : 0;
    return { r, pontos };
  }).filter((x) => x.pontos >= 2).sort((a, b) => b.pontos - a.pontos);
  if (!placar.length) return null;
  return placar.length === 1 || placar[0].pontos > placar[1].pontos ? placar[0].r : null;
}

/** Ocorrência "a confirmar" que essa conta representa: a de data mais próxima do vencimento (até 25 dias); sem vencimento,
 *  a primeira de hoje (ou até 10 dias atrás) em diante. */
export function escolherOcorrencia(ocs: OcorrenciaEmail[], vencimento: string | null, hoje: string): OcorrenciaEmail | null {
  const ordenadas = [...ocs].sort((a, b) => a.data.localeCompare(b.data));
  if (vencimento) {
    const dias = (a: string, b: string) => Math.abs((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
    const melhor = ordenadas.map((o) => ({ o, d: dias(o.data.slice(0, 10), vencimento) })).sort((x, y) => x.d - y.d)[0];
    return melhor && melhor.d <= 25 ? melhor.o : null;
  }
  const piso = somarDiasISO(hoje, -10);
  return ordenadas.find((o) => o.data.slice(0, 10) >= piso) ?? null;
}

const nomeCurto = (from: string) => (from.match(/<([^>]+)>/)?.[1] ?? from).replace(/^.*@/, "@").slice(0, 40);

export async function processarEmailConta(
  admin: ReturnType<typeof createClient>, token: string, userId: string, chatId: number, e: EmailConta,
): Promise<{ ok: boolean; status: string }> {
  const { error: jaTem } = await admin.from("emails_processados").insert({ user_id: userId, message_id: e.messageId, remetente: e.from.slice(0, 200), assunto: e.subject.slice(0, 200), status: "recebido" });
  if (jaTem) return { ok: true, status: "duplicado" }; // mesmo e-mail nunca é processado duas vezes
  const marcar = (status: string, extra: Record<string, unknown> = {}) =>
    admin.from("emails_processados").update({ status, ...extra }).eq("user_id", userId).eq("message_id", e.messageId);

  const { data: recs } = await admin.from("recorrencias").select("id, descricao, categoria, remetentes, tipo")
    .eq("user_id", userId).eq("status", "ativa");
  const despesas = ((recs ?? []) as (RecorrenciaEmail & { tipo: string })[]).filter((r) => r.tipo === "saidas");
  const rec = recorrenciaDoEmail(despesas, e.from, e.subject) ?? recorrenciaPorPalavras(despesas, e.from, e.subject, e.body);
  if (!rec) {
    await marcar("sem_recorrencia");
    await tg(token, "sendMessage", { chat_id: chatId, text: `📧 E-mail de ${nomeCurto(e.from)} — "${e.subject.slice(0, 80)}"\nNão consegui ligar a nenhuma recorrência. Cadastre o e-mail da conta na recorrência (campo "E-mail da conta") para eu vincular da próxima vez.` });
    return { ok: true, status: "sem_recorrencia" };
  }

  const hoje = hojeBrasiliaISO();
  const dados = extrairDadosConta(`${e.subject}\n${e.body}`, hoje);
  const { data: ocs } = await admin.from("transacoes").select("id, data, valor, tipo, metodo, categoria, descricao, competencia")
    .eq("user_id", userId).eq("recorrencia_id", rec.id).eq("a_confirmar", true).order("data", { ascending: true });
  const ocorrencia = escolherOcorrencia((ocs ?? []) as OcorrenciaEmail[], dados.vencimento, hoje);
  const nome = rec.descricao || rec.categoria;
  // Já tratei essa conta (mesma recorrência) nos últimos 60 dias? Então é lembrete repetido: não avisa de novo
  const desde = new Date(Date.now() - 60 * 86400000).toISOString();
  const { data: anteriores } = await admin.from("emails_processados").select("transacao_id, status")
    .eq("user_id", userId).eq("recorrencia_id", rec.id).in("status", ["rascunho", "atualizado", "repetido"]).gte("criado_em", desde);
  const jaTratada = (anteriores ?? []) as { transacao_id: number | null; status: string }[];
  if (!ocorrencia) {
    if (jaTratada.length) { await marcar("repetido", { recorrencia_id: rec.id }); return { ok: true, status: "repetido" }; } // ex.: já confirmada
    await marcar("sem_ocorrencia", { recorrencia_id: rec.id });
    await tg(token, "sendMessage", { chat_id: chatId, text: `📧 ${nome}: chegou o e-mail${dados.valor ? ` (${formatarMoedaBR(dados.valor)})` : ""}, mas não achei uma ocorrência "a confirmar" dessa recorrência para atualizar.` });
    return { ok: true, status: "sem_ocorrencia" };
  }

  const linha = (ocs ?? []).find((o: { id: number }) => o.id === ocorrencia.id) as Record<string, unknown>;
  const valorAnterior = Number(linha.valor);
  const mudancas: Record<string, unknown> = {};
  if (dados.valor !== null) mudancas.valor = dados.valor;
  const dataAtual = String(linha.data).slice(0, 10);
  if (dados.vencimento && dados.vencimento !== dataAtual) mudancas.data = dados.vencimento;
  if (Object.keys(mudancas).length) {
    let { error } = await admin.from("transacoes").update(mudancas).eq("id", ocorrencia.id).eq("user_id", userId).eq("a_confirmar", true);
    if (error && mudancas.data) { // data já ocupada por outra ocorrência (índice único): atualiza só o valor
      delete mudancas.data;
      if (Object.keys(mudancas).length) ({ error } = await admin.from("transacoes").update(mudancas).eq("id", ocorrencia.id).eq("user_id", userId).eq("a_confirmar", true));
    }
    if (error) console.error("Ocorrência não atualizada pelo e-mail:", error);
  }
  const valorFinal = Number(mudancas.valor ?? valorAnterior);
  const dataFinal = String(mudancas.data ?? dataAtual);
  // lembrete repetido da mesma ocorrência sem nada de novo (mesmo valor e data): só registra, sem novo aviso
  const jaAvisada = jaTratada.some((x) => x.transacao_id === ocorrencia.id);
  const semNovidade = !(("valor" in mudancas && Number(mudancas.valor) !== valorAnterior) || ("data" in mudancas && String(mudancas.data) !== dataAtual));
  if (jaAvisada && semNovidade) { await marcar("repetido", { recorrencia_id: rec.id, transacao_id: ocorrencia.id }); return { ok: true, status: "repetido" }; }

  // rascunho da própria ocorrência (o mesmo do lembrete: confirmar atualiza a linha, nunca insere outra)
  const listas = await carregarListasUsuario(admin, userId);
  const met = linha.metodo ? listas.metodos.find((m) => rotuloMetodo(m) === linha.metodo) ?? null : null;
  const rascunho: RascunhoLancamento = {
    tipo: linha.tipo === "entradas" ? "entradas" : "saidas", valor: valorFinal, descricao: String(linha.descricao ?? ""), categoria: String(linha.categoria ?? ""),
    metodo: (linha.metodo as string) ?? null, metodoKind: met?.metodo_kind ?? null, diaFechamento: met?.dia_fechamento ?? null,
    data: dataFinal, parcelas: null, competencia: linha.competencia ? String(linha.competencia).slice(0, 10) : null,
    metodoOrigem: "texto", ocorrenciaId: ocorrencia.id,
  };
  const { data: existentes } = await admin.from("telegram_rascunhos").select("id").eq("user_id", userId).eq("chat_id", chatId).contains("dados", { ocorrenciaId: ocorrencia.id }).limit(1);
  let rascunhoId: number;
  if (existentes && existentes.length) {
    rascunhoId = existentes[0].id;
    await admin.from("telegram_rascunhos").update({ dados: rascunho }).eq("id", rascunhoId);
  } else {
    const { data: novo, error } = await admin.from("telegram_rascunhos").insert({ user_id: userId, chat_id: chatId, dados: rascunho }).select("id").single();
    if (error || !novo) { console.error(error); await marcar("erro", { recorrencia_id: rec.id, transacao_id: ocorrencia.id }); return { ok: false, status: "erro" }; }
    rascunhoId = novo.id;
  }
  const origemValor = dados.valor !== null ? "valor do e-mail" : "e-mail sem valor: mesmo valor do mês anterior";
  const alerta = dados.valor !== null && valorAnterior > 0 && Math.abs(dados.valor - valorAnterior) / valorAnterior > 0.4
    ? `\n⚠️ Bem diferente do mês anterior (${formatarMoedaBR(valorAnterior)})` : "";
  await marcar(jaAvisada ? "atualizado" : "rascunho", { recorrencia_id: rec.id, transacao_id: ocorrencia.id });
  await enviarRascunho(token, chatId, rascunhoId, rascunho, admin, userId, `📧 ${nome}${jaAvisada ? " (atualizado por novo e-mail)" : ""} — ${origemValor}${dados.vencimento ? ` · vence ${dados.vencimento.split("-").reverse().join("/")}` : ""}${alerta}`);
  return { ok: true, status: "rascunho" };
}
