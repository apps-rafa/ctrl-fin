// E-mail de conta (luz, gás, condomínio...) -> rascunho no Telegram, ligado à recorrência.
// O Google Apps Script do Gmail (scripts/gmail-contas.gs) manda cada e-mail rotulado para cá (ver index.ts, header
// x-email-secret). Aqui: acha a recorrência pelo remetente, lê valor e vencimento do texto, atualiza a ocorrência
// "a confirmar" do mês (sem valor no e-mail = vale o do mês anterior, que a ocorrência já traz) e manda o rascunho do bot.

import type { createClient } from "npm:@supabase/supabase-js@2";
import { tg, formatarMoedaBR, rotuloMetodo } from "./util.ts";
import { enviarRascunho, carregarListasUsuario } from "./lancamentos.ts";
import { textoParecidos, tecladoParecidos } from "../_shared/parecidos.ts";
import { responderDecisaoParecido, acaoDe } from "./decisao-parecido.ts";
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

type Admin = ReturnType<typeof createClient>;
export interface DadosConta { valor: number | null; vencimento: string | null }
type Marcar = (status: string, extra?: Record<string, unknown>) => unknown;

const CAMPOS = "id, data, valor, tipo, metodo, categoria, descricao, competencia";
const fmtData = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

/** Palavras da descrição da recorrência ("Internet Predial" -> internet, predial), para comparar com a descrição de um lançamento. */
function palavrasDe(s: string): string[] {
  return [...new Set(normalizarTexto(s).split(/[^a-z0-9]+/).filter((p) => p.length >= 4 && !PALAVRAS_COMUNS.has(p)))];
}

/** Lançamentos JÁ existentes (confirmados) que parecem ser esta conta: da própria recorrência, com a mesma descrição, ou com o
 *  mesmo valor na mesma data (±3 dias). Janela: vencimento ±25 dias (sem vencimento: de 10 dias atrás a 45 dias à frente). */
export async function buscarSimilares(admin: Admin, userId: string, rec: RecorrenciaEmail, dados: DadosConta, hoje: string): Promise<Record<string, unknown>[]> {
  const base = dados.vencimento ?? hoje;
  const ini = somarDiasISO(base, dados.vencimento ? -25 : -10), fim = somarDiasISO(base, dados.vencimento ? 25 : 45);
  const { data } = await admin.from("transacoes").select(`${CAMPOS}, recorrencia_id`)
    .eq("user_id", userId).eq("tipo", "saidas").eq("a_confirmar", false).gte("data", ini).lte("data", fim).order("data", { ascending: true });
  const palavras = palavrasDe(`${rec.descricao}`);
  const dias = (a: string, b: string) => Math.abs((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
  return ((data ?? []) as Record<string, unknown>[]).filter((t) => {
    const mesmaRec = t.recorrencia_id === rec.id;
    const desc = normalizarTexto(String(t.descricao ?? ""));
    const mesmaDesc = palavras.length > 0 && palavras.some((p) => desc.includes(p));
    const mesmoValorEData = dados.valor !== null && Math.abs(Number(t.valor) - dados.valor) < 0.5 && dias(String(t.data).slice(0, 10), base) <= 3;
    return mesmaRec || mesmaDesc || mesmoValorEData;
  });
}

export async function processarEmailConta(
  admin: Admin, token: string, userId: string, chatId: number, e: EmailConta,
): Promise<{ ok: boolean; status: string }> {
  const { error: jaTem } = await admin.from("emails_processados").insert({ user_id: userId, message_id: e.messageId, remetente: e.from.slice(0, 200), assunto: e.subject.slice(0, 200), status: "recebido" });
  if (jaTem) return { ok: true, status: "duplicado" }; // mesmo e-mail nunca é processado duas vezes
  const marcar: Marcar = (status, extra = {}) =>
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
  const nome = rec.descricao || rec.categoria;

  // O que já aconteceu com essa conta (mesma recorrência) nos últimos 60 dias: lembrete repetido não avisa de novo, e uma
  // decisão sua ("é o mesmo" / "é outro") vale para os e-mails seguintes.
  const desde = new Date(Date.now() - 60 * 86400000).toISOString();
  const { data: anteriores } = await admin.from("emails_processados").select("transacao_id, status")
    .eq("user_id", userId).eq("recorrencia_id", rec.id).in("status", ["rascunho", "atualizado", "repetido", "sem_ocorrencia", "aguardando", "ignorado", "outro"]).gte("criado_em", desde);
  const jaTratada = (anteriores ?? []) as { transacao_id: number | null; status: string }[];
  if (jaTratada.some((x) => x.status === "ignorado" || x.status === "aguardando")) { // já perguntei / você já disse que é o mesmo
    await marcar("repetido", { recorrencia_id: rec.id });
    return { ok: true, status: "repetido" };
  }

  // Já existe um lançamento parecido? Pergunta se é o mesmo (não decidiu "é outro" antes).
  if (!jaTratada.some((x) => x.status === "outro")) {
    const similares = await buscarSimilares(admin, userId, rec, dados, hoje);
    if (similares.length) {
      const { data: linhaEmail } = await admin.from("emails_processados")
        .update({ status: "aguardando", recorrencia_id: rec.id, pendente: { valor: dados.valor, vencimento: dados.vencimento, similares: similares.map((s) => s.id) } })
        .eq("user_id", userId).eq("message_id", e.messageId).select("seq").single();
      const seq = (linhaEmail as { seq: number } | null)?.seq;
      if (seq) {
        await tg(token, "sendMessage", {
          chat_id: chatId,
          text: textoParecidos({ origem: "email", titulo: nome, valor: dados.valor, data: dados.vencimento, detalhe: dados.vencimento ? "vencimento" : undefined, parecidos: similares }),
          reply_markup: tecladoParecidos("email", seq, dados.valor !== null || !!dados.vencimento),
        });
        return { ok: true, status: "aguardando" };
      }
    }
  }
  return await executarConta(admin, token, userId, chatId, rec, dados, marcar, jaTratada);
}

/** Atualiza a ocorrência/lançamento da conta e manda o rascunho (ou o aviso de "a pagar" atualizado). */
export async function executarConta(
  admin: Admin, token: string, userId: string, chatId: number, rec: RecorrenciaEmail, dados: DadosConta, marcar: Marcar,
  jaTratada: { transacao_id: number | null; status: string }[],
): Promise<{ ok: boolean; status: string }> {
  const hoje = hojeBrasiliaISO();
  const nome = rec.descricao || rec.categoria;
  const { data: ocs } = await admin.from("transacoes").select(CAMPOS)
    .eq("user_id", userId).eq("recorrencia_id", rec.id).eq("a_confirmar", true).order("data", { ascending: true });
  const campos = CAMPOS;
  // Candidatas da MESMA recorrência: as "a confirmar" (viram rascunho) e as já confirmadas ainda "a pagar". A escolha vale para o
  // conjunto todo — a conta que acabou de chegar é a mais próxima de vencer, esteja ela confirmada ou não (a de outubro já
  // confirmada vence antes da de novembro a confirmar).
  const piso = somarDiasISO(hoje, -10);
  const { data: apagar } = await admin.from("transacoes").select(campos)
    .eq("user_id", userId).eq("recorrencia_id", rec.id).eq("a_confirmar", false).gte("data", piso).order("data", { ascending: true });
  const doRascunho = ((ocs ?? []) as Record<string, unknown>[]).map((o) => ({ ...o, _rascunho: true }));
  const jaConfirmadas = ((apagar ?? []) as Record<string, unknown>[]).map((o) => ({ ...o, _rascunho: false }));
  let candidatas = [...doRascunho, ...jaConfirmadas] as Record<string, unknown>[];
  let ocorrencia = escolherOcorrencia(candidatas as unknown as OcorrenciaEmail[], dados.vencimento, hoje);
  let rascunhoDeOcorrencia = !!ocorrencia && (candidatas.find((o) => o.id === ocorrencia!.id) as Record<string, unknown>)._rascunho === true;
  if (!ocorrencia && (rec.descricao || "").trim().length >= 4) {
    // 3) lançamento avulso "a pagar" com a mesma descrição (não veio da recorrência)
    const { data: avulsos } = await admin.from("transacoes").select(campos)
      .eq("user_id", userId).eq("tipo", "saidas").eq("a_confirmar", false).ilike("descricao", `%${rec.descricao.trim()}%`).gte("data", piso).order("data", { ascending: true });
    candidatas = (avulsos ?? []) as Record<string, unknown>[];
    ocorrencia = escolherOcorrencia(candidatas as unknown as OcorrenciaEmail[], dados.vencimento, hoje);
    rascunhoDeOcorrencia = false;
  }
  if (!ocorrencia) {
    if (jaTratada.length) { await marcar("repetido", { recorrencia_id: rec.id }); return { ok: true, status: "repetido" }; } // ex.: já confirmada
    await marcar("sem_ocorrencia", { recorrencia_id: rec.id });
    await tg(token, "sendMessage", { chat_id: chatId, text: `📧 ${nome}: chegou o e-mail${dados.valor ? ` (${formatarMoedaBR(dados.valor)})` : ""}, mas não achei nenhum lançamento "a confirmar" nem "a pagar" dessa conta para atualizar.` });
    return { ok: true, status: "sem_ocorrencia" };
  }

  const linha = candidatas.find((o) => o.id === ocorrencia!.id) as Record<string, unknown>;
  const valorAnterior = Number(linha.valor);
  const mudancas: Record<string, unknown> = {};
  if (dados.valor !== null) mudancas.valor = dados.valor;
  const dataAtual = String(linha.data).slice(0, 10);
  if (dados.vencimento && dados.vencimento !== dataAtual) mudancas.data = dados.vencimento;
  if (Object.keys(mudancas).length) {
    const atualizar = (m: Record<string, unknown>) => {
      const q = admin.from("transacoes").update(m).eq("id", ocorrencia!.id).eq("user_id", userId);
      return rascunhoDeOcorrencia ? q.eq("a_confirmar", true) : q;
    };
    let { error } = await atualizar(mudancas);
    if (error && mudancas.data) { // data já ocupada por outra ocorrência (índice único): atualiza só o valor
      delete mudancas.data;
      if (Object.keys(mudancas).length) ({ error } = await atualizar(mudancas));
    }
    if (error) console.error("Ocorrência não atualizada pelo e-mail:", error);
  }
  const valorFinal = Number(mudancas.valor ?? valorAnterior);
  const dataFinal = String(mudancas.data ?? dataAtual);
  // lembrete repetido da mesma ocorrência sem nada de novo (mesmo valor e data): só registra, sem novo aviso
  const jaAvisada = jaTratada.some((x) => x.transacao_id === ocorrencia.id);
  const semNovidade = !(("valor" in mudancas && Number(mudancas.valor) !== valorAnterior) || ("data" in mudancas && String(mudancas.data) !== dataAtual));
  if (jaAvisada && semNovidade) { await marcar("repetido", { recorrencia_id: rec.id, transacao_id: ocorrencia.id }); return { ok: true, status: "repetido" }; }

  if (!rascunhoDeOcorrencia) {
    const origem = dados.valor !== null ? "valor do e-mail" : "e-mail sem valor: mantive o valor do mês anterior";
    await marcar("atualizado", { recorrencia_id: rec.id, transacao_id: ocorrencia.id });
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: `📧 ${nome} — atualizei o lançamento em "a pagar"\n${formatarMoedaBR(valorFinal)} · vence ${dataFinal.split("-").reverse().join("/")} (${origem})${dados.valor !== null && valorAnterior > 0 && Math.abs(dados.valor - valorAnterior) / valorAnterior > 0.4 ? `\n⚠️ Bem diferente do mês anterior (${formatarMoedaBR(valorAnterior)})` : ""}`,
      reply_markup: { inline_keyboard: [[{ text: "✏️ Editar", callback_data: `ultedit:${ocorrencia.id}` }]] },
    });
    return { ok: true, status: "atualizado" };
  }

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
    await admin.from("telegram_rascunhos").update({ dados: rascunho, status: "pendente" }).eq("id", rascunhoId);
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

/** Botões do aviso "já existe lançamento parecido" de um e-mail (emig / emat / emou) — resposta compartilhada com as demais origens. */
export async function tratarDecisaoEmail(
  admin: Admin, token: string, cq: { id: string; message: { message_id: number; text?: string } }, chatId: number, acao: string, seq: number,
): Promise<void> {
  const { data: tgUser } = await admin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
  const userId = tgUser?.user_id as string | undefined;
  let linha: { recorrencia_id: number; pendente: unknown } | null = null;
  const marcar: Marcar = (status, extra = {}) => admin.from("emails_processados").update({ status, ...extra }).eq("seq", seq);
  const pend = () => ((linha?.pendente ?? {}) as { valor: number | null; vencimento: string | null; similares: number[] });
  await responderDecisaoParecido(token, cq, chatId, acaoDe(acao), {
    carregar: async () => {
      if (!userId) return false;
      const { data } = await admin.from("emails_processados").select("recorrencia_id, status, pendente").eq("seq", seq).eq("user_id", userId).maybeSingle();
      if (!data || data.status !== "aguardando") return false;
      linha = data;
      return true;
    },
    ignorar: async () => { await marcar("ignorado"); },
    atualizar: async () => {
      const alvoId = (pend().similares ?? [])[0];
      const mudancas: Record<string, unknown> = {};
      if (pend().valor !== null && pend().valor !== undefined) mudancas.valor = pend().valor;
      if (pend().vencimento) mudancas.data = pend().vencimento;
      let erro: unknown = null;
      if (alvoId && Object.keys(mudancas).length) {
        ({ error: erro } = await admin.from("transacoes").update(mudancas).eq("id", alvoId).eq("user_id", userId));
        if (erro && mudancas.data) { delete mudancas.data; if (Object.keys(mudancas).length) ({ error: erro } = await admin.from("transacoes").update(mudancas).eq("id", alvoId).eq("user_id", userId)); }
      }
      await marcar("atualizado", { transacao_id: alvoId ?? null });
      return !erro;
    },
    outro: async () => {
      await marcar("outro");
      const { data: rec } = await admin.from("recorrencias").select("id, descricao, categoria, remetentes").eq("id", linha!.recorrencia_id).maybeSingle();
      if (rec) await executarConta(admin, token, userId!, chatId, rec as RecorrenciaEmail, { valor: pend().valor ?? null, vencimento: pend().vencimento ?? null }, marcar, []);
    },
  });
}

/** Botões do aviso "já existe lançamento parecido" de uma mensagem/SMS (smig / smat / smou). */
export async function tratarDecisaoSms(
  admin: Admin, token: string, cq: { id: string; message: { message_id: number; text?: string } }, chatId: number, acao: string, rascunhoId: number,
): Promise<void> {
  const { data: tgUser } = await admin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
  const userId = tgUser?.user_id as string | undefined;
  let d: RascunhoLancamento | null = null;
  await responderDecisaoParecido(token, cq, chatId, acaoDe(acao), {
    carregar: async () => {
      if (!userId) return false;
      const { data } = await admin.from("telegram_rascunhos").select("dados").eq("id", rascunhoId).eq("chat_id", chatId).eq("user_id", userId).maybeSingle();
      if (!data) return false;
      d = data.dados as RascunhoLancamento;
      return true;
    },
    ignorar: async () => { await admin.from("telegram_rascunhos").delete().eq("id", rascunhoId); },
    atualizar: async () => {
      const alvoId = (d!.similares ?? [])[0];
      let erro: unknown = alvoId ? null : "sem alvo";
      if (alvoId) ({ error: erro } = await admin.from("transacoes").update({ valor: d!.valor, data: d!.data }).eq("id", alvoId).eq("user_id", userId));
      await admin.from("telegram_rascunhos").delete().eq("id", rascunhoId);
      return !erro;
    },
    outro: async () => { await enviarRascunho(token, chatId, rascunhoId, { ...d!, similares: undefined }, admin, userId!); },
  });
}
