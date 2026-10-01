// Edge Function: telegram-webhook
//
// Chamada pelo Telegram (não pelo client) a cada update do bot — mensagens
// e cliques em botão inline. Sem verify_jwt (o Telegram não manda JWT
// nosso); protegida pelo header secreto que o próprio Telegram devolve em
// todo update quando o webhook é registrado com "secret_token" (ver
// setTelegramWebhook.ts / passo de configuração no README da função).
//
// Dois fluxos:
//  1) "/start CODIGO" — vincula o chat_id de quem mandou ao user_id dono
//     do código (gerado por telegram-gerar-codigo, válido 10 min).
//  2) callback_query "confirmar:<id>" / "ignorar:<id>" — mesma ação dos
//     botões da fila de revisão em Importar > Pluggy, só que a partir do
//     toque no botão do Telegram.
//
// Segredos usados: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET.

import { createClient } from "npm:@supabase/supabase-js@2";

import {
  TELEGRAM_API,
  json,
  tg,
  rotuloMetodo,
  escaparHtml,
  formatarMoedaBR,
} from "./util.ts";
import {
  PLUGGY_API_URL,
  type ContaPluggy,
  normalizarBanco,
  linhasContaPluggy,
  BOTAO_TODAS_CONTAS,
  rotuloBotaoConta,
  tituloContaPluggyDetalhado,
  carregarContasPluggy,
  ehRendimentoPluggy,
  executarAtualizacaoPluggy,
  getPluggyApiKey,
  pluggyGet,
} from "./pluggy.ts";
import {
  confirmarRascunhoNoBanco,
  PALETA_CHIPS,
  corPadraoChip,
  criarCategoria,
  criarMetodo,
  MINIAPP_URL,
  type ListasUsuario,
  carregarListasUsuario,
  urlMiniApp,
} from "./lancamentos.ts";
import {
  limparLinks,
  PALAVRAS_CHAVE_CATEGORIA,
  sugerirCategoriaPorPalavraChave,
  sugerirCategoriaTexto,
  escaparRegex,
  normalizarTexto,
  PALAVRAS_FORMA,
  detectarMetodoNoTexto,
  hojeBrasiliaISO,
  MESES_EXTENSO,
  somarDiasISO,
  extrairData,
  VERBOS_RECEITA,
  VERBOS_DESPESA,
  interpretarValorETipo,
  interpretarSmsCartao,
  competenciaDe,
  addMeses,
  type RascunhoLancamento,
  type MetodoMenu,
  type LancamentoDetectado,
} from "./parser.ts";

const CODIGO_VALIDADE_MIN = 10;

/** Mensagem do rascunho + botões INLINE (grudados nesta mensagem, não um
 *  teclado embaixo compartilhado pela conversa) — assim vários SMS seguidos
 *  viram vários rascunhos independentes, cada um com seu próprio Confirmar/
 *  Editar/Cancelar, resolvíveis em qualquer ordem. "Editar" abre o mini app
 *  já preenchido; confirmar/cancelar chegam como callback_query
 *  "nlconfirmar:<id>"/"nlcancelar:<id>" (ver Deno.serve). */
async function enviarRascunho(
  token: string, chatId: number, rascunhoId: number, r: RascunhoLancamento,
  admin?: ReturnType<typeof createClient>, userId?: string, cabecalho?: string,
) {
  const sinal = r.tipo === "entradas" ? "💰 Receita" : "💸 Despesa";
  const dataFmt = new Date(`${r.data}T00:00:00`).toLocaleDateString("pt-BR");
  const ehCreditoSaida = r.tipo === "saidas" && r.metodoKind === "Crédito";
  const compFatura = r.competencia || competenciaDe(r.data, r.diaFechamento);
  const linhas = [
    cabecalho ?? null,
    sinal,
    `Valor: ${formatarMoedaBR(r.valor)}${r.parcelas && r.parcelas > 1 ? " (total)" : ""}`,
    `Data: ${dataFmt}`,
    `Categoria: ${r.categoria}`,
    `Descrição: ${r.descricao || "(em branco)"}`,
    r.tipo === "saidas" ? `Forma de pgto.: ${r.metodo || "nenhuma cadastrada — ajuste no app"}${r.metodoOrigem === "padrao" ? " (padrão)" : ""}` : null,
    ehCreditoSaida ? `Mês da fatura: ${mesAbrevAno(compFatura)}` : `Mês: ${mesAbrevAno(r.competencia || r.data.slice(0, 7) + "-01")}`,
    ehCreditoSaida && r.categoria !== "Estorno" ? (r.parcelas && r.parcelas > 1 ? `Parcelas: ${r.parcelas}x de ${formatarMoedaBR(r.valor / r.parcelas)}` : "Parcelas: à vista") : null,
    "",
    "Confirma?",
  ].filter((l) => l !== null).join("\n");
  // "✏️ Editar" não abre o formulário direto: o Telegram só devolve os dados do mini app (sendData)
  // quando ele é aberto por um botão do TECLADO, não por botão inline. Então o toque vira o callback
  // "nleditar:<id>" e o bot responde com o botão do formulário DAQUELE rascunho (ver Deno.serve).
  await tg(token, "sendMessage", {
    chat_id: chatId,
    text: linhas,
    reply_markup: {
      inline_keyboard: [[
        { text: "✅ Confirmar", callback_data: `nlconfirmar:${rascunhoId}` },
        { text: "✏️ Editar", callback_data: `nleditar:${rascunhoId}` },
        { text: "❌ Cancelar", callback_data: `nlcancelar:${rascunhoId}` },
      ]],
    },
  });
}

// ---------- Comandos de consulta: /resumo /diario /credito /pix ----------
// Mesmas contas do dashboard do app (js/data.js:calcularResumoMes): mês = campo
// "competencia"; receita com método de cartão de crédito é estorno/reembolso e
// abate a despesa desse cartão em vez de contar como receita.

const TEXTO_AJUDA_LANCAMENTO = [
  "✍️ Lançar por mensagem",
  "",
  "Escreva como falaria: gastei 35,90 no mercado, recebi 200 de salário, vendi meu casaco por 200 reais, comprei um carro de 80000 parcelado em 10x. Diga a forma de pagamento se quiser: \"gastei 100 no mercado no pix\" (ou no crédito, no nubank...). Sem dizer, uso o padrão que você definir em /pgtopadrao. Diga a data se não for hoje: \"ontem uber 10 reais\", \"25/09 uber 10 reais\". Estorno também: \"estorno 50 uber\" (abate a fatura do cartão).",
  "",
  "Eu monto um rascunho com valor, categoria e forma de pagamento, com botões de ✅ Confirmar, ✏️ Editar (abre o formulário) e ❌ Cancelar grudados na mensagem — só grava quando você confirma. Pode chegar mais de um rascunho ao mesmo tempo (ex.: vários SMS seguidos); cada mensagem tem seus próprios botões, independentes.",
].join("\n");

const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
/** '2026-10-01' -> 'Out/2026' */
function mesAbrevAno(iso: string): string {
  const [a, m] = iso.split("-").map(Number);
  return `${MESES_ABREV[m - 1]}/${a}`;
}

const MESES_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

async function responderComandoConsulta(
  admin: ReturnType<typeof createClient>,
  token: string,
  chatId: number,
  comando: string,
): Promise<void> {
  const { data: tgUser } = await admin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
  if (!tgUser) {
    await tg(token, "sendMessage", { chat_id: chatId, text: "Conta não vinculada — mande /start com o código do app primeiro." });
    return;
  }
  if (comando === "ultimos") {
    const { data: ult, error: erroUlt } = await admin.from("transacoes")
      .select("id, tipo, valor, data, categoria, descricao, metodo")
      .eq("user_id", tgUser.user_id).order("criado_em", { ascending: false }).limit(5);
    if (erroUlt) {
      console.error(erroUlt);
      await tg(token, "sendMessage", { chat_id: chatId, text: "Deu erro ao consultar seus lançamentos — tenta de novo." });
      return;
    }
    const linhasUlt = (ult ?? []).map((t: { id: number; tipo: string; valor: number; data: string; categoria: string | null; descricao: string | null; metodo: string | null }, i: number) => {
      const dataFmt = String(t.data).slice(0, 10).split("-").reverse().slice(0, 2).join("/");
      const sinal = t.tipo === "entradas" ? "+" : "-";
      return `${i + 1}. ${dataFmt} ${sinal}${formatarMoedaBR(Number(t.valor) || 0)} — ${[t.categoria, t.descricao, t.metodo].filter(Boolean).join(" · ")}`;
    });
    // Botões 1-5 na própria mensagem: o toque escolhe qual lançamento editar (ver callback "ultedit")
    const idsUlt = ((ult ?? []) as { id: number }[]).map((t) => t.id);
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: linhasUlt.length ? `🕓 Últimos 5 lançamentos\n\n${linhasUlt.join("\n")}\n\nToque no número para editar:` : "Nenhum lançamento ainda.",
      ...(idsUlt.length ? { reply_markup: { inline_keyboard: [
        idsUlt.map((id, i) => ({ text: String(i + 1), callback_data: `ultedit:${id}` })),
        [{ text: "❌ Cancelar", callback_data: "cancelar" }],
      ] } } : {}),
    });
    return;
  }
  const hoje = hojeBrasiliaISO();
  const [ano, mes, dia] = hoje.split("-").map(Number);
  const ini = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim = addMeses(ini, 1);
  const [{ data: trans, error }, { data: metodos }] = await Promise.all([
    admin.from("transacoes").select("tipo, valor, metodo, data").eq("user_id", tgUser.user_id).gte("competencia", ini).lt("competencia", fim),
    admin.from("menu_itens").select("nome, metodo_kind, banco").eq("tipo", "Método").eq("user_id", tgUser.user_id),
  ]);
  if (error) {
    console.error(error);
    await tg(token, "sendMessage", { chat_id: chatId, text: "Deu erro ao consultar seus lançamentos — tenta de novo." });
    return;
  }
  const lista = (trans ?? []) as { tipo: string; valor: number; metodo: string | null; data: string }[];
  const rotulosCredito = new Map<string, string>();
  const rotulosPix = new Set<string>();
  for (const m of (metodos ?? []) as { nome: string; metodo_kind: string | null; banco: string | null }[]) {
    if (m.metodo_kind === "Crédito") rotulosCredito.set(rotuloMetodo(m), rotuloMetodo(m));
    // Lançamentos de PIX guardam só "PIX" no método (não "PIX <banco>").
    if (m.metodo_kind === "PIX") { rotulosPix.add(rotuloMetodo(m)); rotulosPix.add("PIX"); }
  }
  const soma = (l: { valor: number }[]) => l.reduce((a, t) => a + (Number(t.valor) || 0), 0);
  const saidas = lista.filter((t) => t.tipo === "saidas");
  const entradas = lista.filter((t) => t.tipo === "entradas");
  const estornos = entradas.filter((t) => t.metodo && rotulosCredito.has(t.metodo));
  const receitas = soma(entradas.filter((t) => !(t.metodo && rotulosCredito.has(t.metodo))));
  const despesas = soma(saidas) - soma(estornos);
  const balanco = receitas - despesas;
  const mesTxt = `${MESES_PT[mes - 1]}/${ano}`;

  let texto: string;
  if (comando === "resumo") {
    texto = [
      `📊 Resumo de ${mesTxt}`,
      `Receitas: ${formatarMoedaBR(receitas)}`,
      `Despesas: ${formatarMoedaBR(despesas)}`,
      `Balanço: ${formatarMoedaBR(balanco)}`,
    ].join("\n");
  } else if (comando === "diario") {
    const totalDias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    const dias = Math.max(1, totalDias - dia + 1);
    texto = [
      `📅 Gasto diário de ${mesTxt}`,
      `Balanço: ${formatarMoedaBR(balanco)}`,
      `Dias restantes: ${dias}`,
      `Pode gastar por dia: ${formatarMoedaBR(balanco / dias)}`,
    ].join("\n");
  } else if (comando === "credito") {
    const porCartao = new Map<string, number>();
    for (const r of rotulosCredito.keys()) porCartao.set(r, 0);
    for (const t of saidas) if (t.metodo && porCartao.has(t.metodo)) porCartao.set(t.metodo, porCartao.get(t.metodo)! + (Number(t.valor) || 0));
    for (const t of estornos) porCartao.set(t.metodo!, (porCartao.get(t.metodo!) ?? 0) - (Number(t.valor) || 0));
    const linhas = [...porCartao.entries()].map(([nome, v]) => `• ${nome}: ${formatarMoedaBR(v)}`);
    const total = [...porCartao.values()].reduce((a, v) => a + v, 0);
    texto = linhas.length
      ? [`💳 Gasto no crédito em ${mesTxt}`, ...linhas, "", `Total: ${formatarMoedaBR(total)}`].join("\n")
      : "Nenhum cartão de crédito cadastrado.";
  } else {
    const doPix = saidas.filter((t) => t.metodo && rotulosPix.has(t.metodo));
    const total = soma(doPix);
    // Mesma regra do dashboard: pago = data até hoje (inclusive).
    const pago = soma(doPix.filter((t) => String(t.data).slice(0, 10) <= hoje));
    texto = [
      `⚡️ PIX ${String(mes).padStart(2, "0")}/${ano}`,
      `Do total de ${formatarMoedaBR(total)}, já foram pagos ${formatarMoedaBR(pago)} e ainda restam ${formatarMoedaBR(total - pago)} a pagar.`,
    ].join("\n");
  }
  await tg(token, "sendMessage", { chat_id: chatId, text: texto });
}

/** Avisa no Telegram (todos os chats vinculados) que algo falhou — no máximo 1 alerta
 *  por hora para a mesma chave, pra uma falha repetida não virar spam. */
async function avisarErroBot(admin: ReturnType<typeof createClient>, token: string, chave: string, texto: string) {
  try {
    const { data } = await admin.from("alertas_bot").select("enviado_em").eq("chave", chave).maybeSingle();
    if (data && Date.now() - new Date(data.enviado_em).getTime() < 60 * 60 * 1000) return;
    await admin.from("alertas_bot").upsert({ chave, enviado_em: new Date().toISOString() });
    const { data: users } = await admin.from("telegram_users").select("chat_id");
    for (const u of (users ?? []) as { chat_id: number }[]) await tg(token, "sendMessage", { chat_id: u.chat_id, text: texto.slice(0, 900) });
  } catch (e) {
    console.error("Falha ao avisar erro:", e);
  }
}

/** Backup completo (lançamentos e menus) mandado como arquivo .json no Telegram. */
async function executarBackup(
  admin: ReturnType<typeof createClient>, token: string, so?: { chat_id: number; user_id: string },
): Promise<void> {
  const { data: users } = so ? { data: [so] } : await admin.from("telegram_users").select("user_id, chat_id");
  const hoje = hojeBrasiliaISO();
  for (const u of (users ?? []) as { user_id: string; chat_id: number }[]) {
    const transacoes: unknown[] = [];
    for (let ini = 0; ; ini += 1000) {
      const { data, error } = await admin.from("transacoes").select("*").eq("user_id", u.user_id).order("id").range(ini, ini + 999);
      if (error) throw error;
      transacoes.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const { data: menus } = await admin.from("menu_itens").select("*").eq("user_id", u.user_id);
    const json = JSON.stringify({ gerado_em: new Date().toISOString(), transacoes, menu_itens: menus ?? [] });
    const form = new FormData();
    form.append("chat_id", String(u.chat_id));
    form.append("caption", `💾 Backup Ctrl Fin — ${transacoes.length} lançamentos (${hoje})`);
    form.append("document", new Blob([json], { type: "application/json" }), `ctrl-fin-backup-${hoje}.json`);
    const resp = await fetch(`${TELEGRAM_API}${token}/sendDocument`, { method: "POST", body: form });
    if (!resp.ok) throw new Error(`Telegram sendDocument falhou (${resp.status}): ${await resp.text()}`);
  }
}

/** Interpreta um texto como lançamento e manda o rascunho de volta pro chat —
 *  mesma lógica usada tanto quando o TEXTO chega via Telegram (usuário digitou
 *  ou o Atalho do SMS chamou este endpoint direto, ver "X-Sms-Forward-Secret"
 *  em Deno.serve). Extraída do handler de mensagem de texto pra ser chamada
 *  dos dois lugares sem duplicar a regra toda de sugestão de categoria/forma.
 *  Cada chamada cria um rascunho NOVO e independente (nunca apaga os
 *  pendentes de antes) — vários SMS seguidos viram vários botões Confirmar/
 *  Editar/Cancelar separados, resolvíveis em qualquer ordem; ajustar
 *  categoria/data/forma é sempre pelo "✏️ Editar" (mini app), não por
 *  responder texto, porque com vários rascunhos ao mesmo tempo não dava pra
 *  saber a qual deles uma resposta digitada se referia. */
async function processarTextoLivre(
  supabaseAdmin: ReturnType<typeof createClient>,
  token: string,
  chatId: number,
  texto: string,
): Promise<void> {
  // Texto livre: tenta entender como um lançamento ("gastei 35,90 no
  // mercado", "recebi 200 de salário"). Sem um valor em dinheiro no
  // texto, não dá pra saber o que é — cai no "não entendi" de sempre.
  const achado = interpretarSmsCartao(texto) ?? interpretarValorETipo(texto);
  if (!achado) {
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: "Não entendi. Pra lançar por aqui, manda algo tipo \"gastei 35,90 no mercado\" ou \"recebi 200 de salário\" — eu monto um rascunho com botões de Confirmar/Editar/Cancelar. Também entendo os botões de Confirmar/Ignorar (quando chegam da Pluggy) e o comando /atualizar.",
    });
    return;
  }

  const { data: tgUser } = await supabaseAdmin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
  if (!tgUser) {
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: "Pra lançar por aqui eu preciso que você vincule sua conta primeiro — gere o código em Configurações > Open Finance no app e toque no link.",
    });
    return;
  }

  const [{ data: categoriasApp }, { data: metodosApp }] = await Promise.all([
    supabaseAdmin.from("menu_itens").select("nome, categoria_tipo").eq("tipo", "Categoria").eq("status", "Ativo").eq("user_id", tgUser.user_id),
    supabaseAdmin.from("menu_itens").select("nome, metodo_kind, banco, dia_fechamento").eq("tipo", "Método").eq("status", "Ativo").eq("user_id", tgUser.user_id).order("ordem"),
  ]);

  const { valor, tipo, resto, parcelas } = achado;
  // "Estorno" (Despesa) sempre existe pro usuário (é criada/reativada em carregarListasUsuario).
  const catsSugestao = [...(categoriasApp ?? [])];
  const temCartaoTxt = ((metodosApp ?? []) as MetodoMenu[]).some((m) => m.metodo_kind === "Crédito");
  if (!temCartaoTxt) { const ix = catsSugestao.findIndex((c: { nome: string; categoria_tipo: string | null }) => c.categoria_tipo === "saidas" && c.nome === "Estorno"); if (ix >= 0) catsSugestao.splice(ix, 1); }
  else if (!catsSugestao.some((c: { nome: string; categoria_tipo: string | null }) => c.categoria_tipo === "saidas" && c.nome === "Estorno")) catsSugestao.push({ nome: "Estorno", categoria_tipo: "saidas" });
  const cat = sugerirCategoriaTexto(texto, tipo, catsSugestao);
  const categoria = cat.nome;

  // Forma de pgto.: só faz sentido perguntar/usar em despesa — receita
  // não pede método no formulário do app (só Estorno/Reembolso, caso
  // raro demais pra tentar adivinhar por texto livre). Tenta achar o
  // nome/banco de um método do usuário mencionado no texto; senão
  // Crédito, depois Pix, depois Dinheiro (o caso comum de "20 no
  // mercado" sem dizer a forma é ter pago no cartão — Dinheiro só
  // entra por último, e só se estiver ativo pro usuário).
  let metodoObj: MetodoMenu | null = null;
  let metodoOrigem: "texto" | "padrao" | null = null;
  if (tipo === "saidas") {
    const lista = (metodosApp ?? []) as MetodoMenu[];
    const detectado = detectarMetodoNoTexto(texto, lista);
    const { data: cfgM } = await supabaseAdmin.from("telegram_config").select("metodo_padrao").eq("user_id", tgUser.user_id).maybeSingle();
    const padrao = !detectado && cfgM?.metodo_padrao ? lista.find((m) => rotuloMetodo(m) === cfgM.metodo_padrao) ?? null : null;
    metodoObj = detectado
      || padrao
      || lista.find((m) => m.metodo_kind === "Crédito")
      || lista.find((m) => m.metodo_kind === "PIX")
      || lista.find((m) => m.metodo_kind === "Dinheiro")
      || lista[0]
      || null;
    metodoOrigem = detectado ? "texto" : padrao ? "padrao" : null;
    // Parcelado só existe no crédito (igual ao formulário do app).
    if (parcelas && metodoObj?.metodo_kind !== "Crédito") {
      metodoObj = lista.find((m) => m.metodo_kind === "Crédito") || metodoObj;
    }
  }
  // Estorno abate a fatura de um cartão: só aceita crédito e nunca é parcelado.
  const ehEstornoTxt = tipo === "saidas" && categoria === "Estorno";
  if (ehEstornoTxt && metodoObj?.metodo_kind !== "Crédito") {
    metodoObj = ((metodosApp ?? []) as MetodoMenu[]).find((m) => m.metodo_kind === "Crédito") || metodoObj;
  }
  const parcelasFinal = tipo === "saidas" && !ehEstornoTxt && parcelas && metodoObj?.metodo_kind === "Crédito" ? parcelas : null;

  // O bot nunca inventa descrição em texto livre: começa em branco, e o
  // que o usuário responder (fora dos botões) vira a descrição. Já um
  // SMS de cartão traz o nome do estabelecimento sem ambiguidade, então
  // usa ele direto.
  const descricao = achado.estabelecimento
    ? limparLinks(achado.estabelecimento.charAt(0).toUpperCase() + achado.estabelecimento.slice(1).toLowerCase())
    : "";

  const rascunho: RascunhoLancamento = {
    tipo, valor, descricao, categoria,
    metodo: metodoObj ? rotuloMetodo(metodoObj) : null,
    metodoKind: metodoObj?.metodo_kind ?? null,
    diaFechamento: metodoObj?.dia_fechamento ?? null,
    data: achado.data ?? hojeBrasiliaISO(),
    parcelas: parcelasFinal,
    metodoOrigem,
  };

  // Cada texto/SMS vira um rascunho independente — vários pendentes ao mesmo
  // tempo é o ponto (SMS chegando em sequência numa noite de compras, por
  // exemplo), cada um com seu próprio botão.
  const { data: novoRascunho, error: erroRascunho } = await supabaseAdmin
    .from("telegram_rascunhos")
    .insert({ user_id: tgUser.user_id, chat_id: chatId, dados: rascunho })
    .select("id").single();
  if (erroRascunho || !novoRascunho) {
    console.error(erroRascunho);
    await tg(token, "sendMessage", { chat_id: chatId, text: "Deu erro ao montar o rascunho — tenta de novo." });
    return;
  }

  await enviarRascunho(token, chatId, novoRascunho.id, rascunho, supabaseAdmin, tgUser.user_id);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Método não suportado" }, 405);
  }

  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if (!token || !webhookSecret) {
    console.error("TELEGRAM_BOT_TOKEN/TELEGRAM_WEBHOOK_SECRET não configurados");
    return json({ ok: true }); // 200 pro Telegram não ficar reenviando
  }
  // Tarefa agendada (pg_cron): backup semanal
  const segredoCron = req.headers.get("x-cron-secret");
  if (segredoCron) {
    const adminCron = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: seg } = await adminCron.from("app_cron_segredo").select("valor").eq("nome", "tarefas").maybeSingle();
    if (!seg || segredoCron !== seg.valor) return json({ error: "Não autorizado" }, 401);
    const corpo = await req.json().catch(() => ({}));
    try {
      if (corpo.tarefa === "backup") { await executarBackup(adminCron, token); return json({ ok: true }); }
      return json({ error: "Tarefa desconhecida" }, 400);
    } catch (e) {
      console.error(e);
      await avisarErroBot(adminCron, token, `cron-${corpo.tarefa}`, `⚠️ A tarefa agendada "${corpo.tarefa}" falhou: ${String(e).slice(0, 300)}`);
      return json({ error: String(e) }, 500);
    }
  }
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Encaminhamento de SMS (Atalho do iPhone) — chama esta função DIRETO, sem
  // passar pelo Telegram: a API de bot não tem como "fingir" que foi o
  // usuário quem mandou a mensagem (sendMessage sempre sai como o BOT
  // falando, nunca populando o webhook), então o próprio Atalho bate aqui
  // com {chat_id, texto} e a gente roda a mesma interpretação de texto livre
  // e manda o rascunho de volta pro chat, como se o usuário tivesse digitado.
  const segredoSms = req.headers.get("x-sms-forward-secret");
  if (segredoSms) {
    const { data: seg } = await supabaseAdmin.from("app_cron_segredo").select("valor").eq("nome", "sms_forward").maybeSingle();
    if (!seg || segredoSms !== seg.valor) return json({ error: "Não autorizado" }, 401);
    const corpo = await req.json().catch(() => ({}));
    const chatIdSms = Number(corpo.chat_id);
    const textoSms = String(corpo.texto ?? "").trim();
    if (!chatIdSms || !textoSms) return json({ error: "chat_id/texto ausente" }, 400);
    try {
      await processarTextoLivre(supabaseAdmin, token, chatIdSms, textoSms);
      return json({ ok: true });
    } catch (e) {
      console.error("Erro no encaminhamento de SMS:", e);
      return json({ error: String(e) }, 500);
    }
  }

  if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== webhookSecret) {
    return json({ error: "Não autorizado" }, 401);
  }

  // deno-lint-ignore no-explicit-any
  let update: any;
  try {
    update = await req.json();

    // ---------- Formulário (mini app) enviado: grava o lançamento ----------
    // O Telegram entrega isto dentro do chat do próprio usuário, então o dono é
    // quem está vinculado a este chat (sem login no mini app).
    if (update.message?.web_app_data) {
      const chatId = update.message.chat.id;
      const remover = { remove_keyboard: true };
      const { data: tgUser } = await supabaseAdmin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
      if (!tgUser) {
        await tg(token, "sendMessage", { chat_id: chatId, text: "Conta não vinculada — mande /start com o código do app primeiro.", reply_markup: remover });
        return json({ ok: true });
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
        return json({ ok: true });
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
          return json({ ok: true });
        }
        const { error: erroU } = await supabaseAdmin.from("transacoes").update({
          tipo: ehEst ? "entradas" : dadosF.tipo, data: dadosF.data, valor: dadosF.valor, metodo: dadosF.metodo, categoria: dadosF.categoria,
          descricao: dadosF.descricao, competencia: dadosF.competencia || competenciaDe(dadosF.data, dadosF.metodoKind === "Crédito" ? dadosF.diaFechamento : null),
        }).eq("id", Number(mT[1])).eq("user_id", tgUser.user_id);
        await tg(token, "sendMessage", { chat_id: chatId, text: erroU ? "Erro ao salvar — tenta de novo." : "✅ Lançamento atualizado!", reply_markup: remover });
        return json({ ok: true });
      }
      const idEditado = Number(p?.id);
      if (idEditado) await supabaseAdmin.from("telegram_rascunhos").delete().eq("id", idEditado).eq("chat_id", chatId);
      const { erro: erroF } = await confirmarRascunhoNoBanco(supabaseAdmin, tgUser.user_id, dadosF);
      if (erroF) {
        console.error(erroF);
        await tg(token, "sendMessage", { chat_id: chatId, text: "Erro ao lançar — tenta de novo.", reply_markup: remover });
        return json({ ok: true });
      }
      await tg(token, "sendMessage", { chat_id: chatId, text: "✅ Lançado!", reply_markup: remover });
      return json({ ok: true });
    }

    // ---------- Mensagem de texto (só tratamos "/start CODIGO" por ora) ----------
    if (update.message?.text) {
      const chatId = update.message.chat.id;
      const texto = String(update.message.text).trim();

      // Botão do teclado mostrado junto do "Editar" de um rascunho: só tira o teclado (o rascunho continua nos botões dele)
      if (texto === "❌ Cancelar edição") {
        await tg(token, "sendMessage", { chat_id: chatId, text: "Edição cancelada — o rascunho continua pendente.", reply_markup: { remove_keyboard: true } });
        return json({ ok: true });
      }

      if (texto.startsWith("/start")) {
        // Já vinculado antes (ex.: clicou o link de novo, ou mandou o mesmo
        // código 2x — o código é apagado assim que usado com sucesso, então
        // a 2ª tentativa achava "código inválido ou expirado" mesmo tendo
        // acabado de funcionar segundos antes, o que é confuso).
        const { data: jaVinculado } = await supabaseAdmin
          .from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
        if (jaVinculado) {
          await tg(token, "sendMessage", { chat_id: chatId, text: "✅ Você já está vinculado — não precisa fazer de novo." });
          return json({ ok: true });
        }

        const codigo = texto.split(/\s+/)[1]?.toUpperCase();
        if (!codigo) {
          await tg(token, "sendMessage", { chat_id: chatId, text: "Gere um código em Configurações > Importar > Pluggy no app e toque no link de novo." });
          return json({ ok: true });
        }

        const { data: linkRow } = await supabaseAdmin
          .from("telegram_link_codes")
          .select("user_id, criado_em")
          .eq("code", codigo)
          .maybeSingle();

        const expirado = !linkRow || (Date.now() - new Date(linkRow.criado_em).getTime()) > CODIGO_VALIDADE_MIN * 60 * 1000;
        if (!linkRow || expirado) {
          await tg(token, "sendMessage", { chat_id: chatId, text: "Código inválido ou expirado — gere um novo no app e toque no link de novo." });
          return json({ ok: true });
        }

        const { error: upsertError } = await supabaseAdmin
          .from("telegram_users")
          .upsert({ user_id: linkRow.user_id, chat_id: chatId }, { onConflict: "user_id" });
        if (upsertError) {
          console.error(upsertError);
          await tg(token, "sendMessage", { chat_id: chatId, text: "Deu erro ao vincular — tenta de novo em instantes." });
          return json({ ok: true });
        }
        await supabaseAdmin.from("telegram_link_codes").delete().eq("code", codigo);

        await tg(token, "sendMessage", {
          chat_id: chatId,
          text: "✅ Conta vinculada! A partir de agora eu aviso por aqui quando um lançamento novo chegar via Pluggy. Mande /atualizar a qualquer hora pra forçar buscar dados novos nas suas contas.",
        });
        return json({ ok: true });
      }

      // "/atualizar" — pergunta qual conexão bancária atualizar (teclado
      // inline) antes de ir na Pluggy; a atualização em si (PATCH /items/
      // {id}, igual ao "Sincronizar agora" do app + log das 3 transações
      // mais recentes) só acontece depois do toque num botão (ver
      // callback_query "atualizarconta:" mais abaixo). Não mexe na fila de
      // revisão do app (isso continua exigindo o "Sincronizar" no app ou o
      // aviso automático do pluggy-webhook).
      if (texto.startsWith("/atualizar")) {
        const { data: tgUser } = await supabaseAdmin
          .from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
        if (!tgUser) {
          await tg(token, "sendMessage", { chat_id: chatId, text: "Conta não vinculada — mande /start com o código do app primeiro." });
          return json({ ok: true });
        }

        const { erro: contasError, contas } = await carregarContasPluggy(supabaseAdmin, tgUser.user_id);
        if (contasError) {
          console.error(contasError);
          await tg(token, "sendMessage", { chat_id: chatId, text: "Deu erro ao buscar suas contas conectadas." });
          return json({ ok: true });
        }
        if (!contas.length) {
          await tg(token, "sendMessage", { chat_id: chatId, text: "Nenhuma conta conectada pra atualizar (Configurações > Open Finance no app)." });
          return json({ ok: true });
        }

        // Só 1 conta conectada: não faz sentido perguntar, vai direto.
        if (contas.length === 1) {
          await tg(token, "sendMessage", { chat_id: chatId, text: "🔄 Atualizando..." });
          await executarAtualizacaoPluggy(supabaseAdmin, token, chatId, contas);
          return json({ ok: true });
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
        return json({ ok: true });
      }

      // "/pgtopadrao": escolhe a forma de pagamento usada quando a mensagem não diz qual.
      if (/^\/pgtopadrao(?:@\w+)?(?:\s|$)/i.test(texto)) {
        const { data: tgP } = await supabaseAdmin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
        if (!tgP) {
          await tg(token, "sendMessage", { chat_id: chatId, text: "Conta não vinculada — mande /start com o código do app primeiro." });
          return json({ ok: true });
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
        return json({ ok: true });
      }

      // "/lancamento": só explica como lançar por mensagem (mesma explicação
      // da aba Configurações > Notificações do app).
      if (/^\/lancamento(?:@\w+)?(?:\s|$)/i.test(texto)) {
        await tg(token, "sendMessage", { chat_id: chatId, text: TEXTO_AJUDA_LANCAMENTO });
        return json({ ok: true });
      }

      // "/backup": manda agora o arquivo de backup (o automático sai todo domingo).
      if (/^\/backup(?:@\w+)?(?:\s|$)/i.test(texto)) {
        const { data: tgB } = await supabaseAdmin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
        if (!tgB) {
          await tg(token, "sendMessage", { chat_id: chatId, text: "Conta não vinculada — mande /start com o código do app primeiro." });
          return json({ ok: true });
        }
        await tg(token, "sendMessage", { chat_id: chatId, text: "💾 Gerando o backup..." });
        try { await executarBackup(supabaseAdmin, token, { chat_id: chatId, user_id: tgB.user_id }); }
        catch (e) { console.error(e); await tg(token, "sendMessage", { chat_id: chatId, text: "Deu erro ao gerar o backup — tenta de novo." }); }
        return json({ ok: true });
      }

      // Consultas rápidas do mês.
      const cmd = texto.match(/^\/(resumo|diario|credito|pix|ultimos)(?:@\w+)?(?:\s|$)/i);
      if (cmd) {
        await responderComandoConsulta(supabaseAdmin, token, chatId, cmd[1].toLowerCase());
        return json({ ok: true });
      }

      // Texto livre: tenta entender como um lançamento ("gastei 35,90 no
      // mercado", "recebi 200 de salário") ou SMS de cartão (ver processarTextoLivre).
      await processarTextoLivre(supabaseAdmin, token, chatId, texto);
      return json({ ok: true });
    }

    // ---------- Clique em botão inline (Confirmar/Ignorar/Atualizar conta) ----------
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message?.chat?.id;
      const [acao, idStr] = String(cq.data || "").split(":");

      // "Cancelar" — presente em todo menu do bot: tira o teclado e marca a
      // mensagem como cancelada (editMessageText sem reply_markup remove os
      // botões).
      if (acao === "cancelar" && chatId) {
        await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Cancelado" });
        await tg(token, "editMessageText", {
          chat_id: chatId, message_id: cq.message.message_id,
          text: `${cq.message.text}\n\n❌ Cancelado`,
        });
        return json({ ok: true });
      }

      // Número (1-5) do /ultimos: abre o formulário (mini app) com os dados DAQUELE lançamento já gravado.
      if (acao === "ultedit" && chatId) {
        const { data: tgUser } = await supabaseAdmin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
        const { data: t } = tgUser
          ? await supabaseAdmin.from("transacoes").select("*").eq("id", Number(idStr)).eq("user_id", tgUser.user_id).maybeSingle()
          : { data: null };
        if (!tgUser || !t) {
          await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Esse lançamento já não existe mais" });
          return json({ ok: true });
        }
        if (t.parcelas_total && t.parcelas_total > 1) {
          await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Lançamento parcelado: edite pelo app", show_alert: true });
          return json({ ok: true });
        }
        const listas = await carregarListasUsuario(supabaseAdmin, tgUser.user_id);
        const met = listas.metodos.find((m) => rotuloMetodo(m) === t.metodo) ?? null;
        // Estorno é gravado como entrada no cartão, mas se edita como Despesa > Estorno
        const ehEstornoGravado = t.tipo === "entradas" && met?.metodo_kind === "Crédito";
        const d: RascunhoLancamento = {
          tipo: ehEstornoGravado ? "saidas" : (t.tipo === "entradas" ? "entradas" : "saidas"),
          valor: Number(t.valor), descricao: t.descricao ?? "", categoria: ehEstornoGravado ? "Estorno" : (t.categoria ?? ""),
          metodo: t.metodo || null, metodoKind: met?.metodo_kind ?? null, diaFechamento: met?.dia_fechamento ?? null,
          data: String(t.data).slice(0, 10), competencia: t.competencia ? String(t.competencia).slice(0, 10) : null,
        };
        await tg(token, "answerCallbackQuery", { callback_query_id: cq.id });
        await tg(token, "sendMessage", {
          chat_id: chatId,
          text: `Toque em ✏️ Editar para alterar o lançamento referente à ${d.tipo === "entradas" ? "receita" : "despesa"} de ${formatarMoedaBR(d.valor)} no dia ${new Date(`${d.data}T00:00:00`).toLocaleDateString("pt-BR")}${d.descricao ? ` (${d.descricao})` : ""}.`,
          reply_markup: {
            keyboard: [[{ text: "✏️ Editar", web_app: { url: urlMiniApp(`t${t.id}`, d, listas) } }], [{ text: "❌ Cancelar edição" }]],
            resize_keyboard: true, is_persistent: true, one_time_keyboard: false,
          },
        });
        return json({ ok: true });
      }

      // "✏️ Editar" na mensagem de um rascunho: responde dizendo QUAL lançamento é e com o botão do
      // formulário dele em cima do teclado (único jeito de o mini app devolver os dados).
      if (acao === "nleditar" && chatId) {
        const rascunhoId = Number(idStr);
        const { data: tgUser } = await supabaseAdmin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
        const { data: rascunho } = tgUser
          ? await supabaseAdmin.from("telegram_rascunhos").select("dados").eq("id", rascunhoId).eq("chat_id", chatId).eq("user_id", tgUser.user_id).maybeSingle()
          : { data: null };
        if (!tgUser || !rascunho) {
          await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Esse rascunho já não existe mais" });
          return json({ ok: true });
        }
        const d = rascunho.dados as RascunhoLancamento;
        const listas = await carregarListasUsuario(supabaseAdmin, tgUser.user_id);
        await tg(token, "answerCallbackQuery", { callback_query_id: cq.id });
        await tg(token, "sendMessage", {
          chat_id: chatId,
          text: `Toque em ✏️ Editar para alterar o lançamento referente à ${d.tipo === "entradas" ? "receita" : "despesa"} de ${formatarMoedaBR(d.valor)} no dia ${new Date(`${d.data}T00:00:00`).toLocaleDateString("pt-BR")}${d.descricao ? ` (${d.descricao})` : ""}.`,
          reply_markup: {
            keyboard: [[{ text: "✏️ Editar", web_app: { url: urlMiniApp(rascunhoId, d, listas) } }], [{ text: "❌ Cancelar edição" }]],
            resize_keyboard: true, is_persistent: true, one_time_keyboard: false,
          },
        });
        return json({ ok: true });
      }

      // Rascunho de lançamento por texto livre (ver interpretarValorETipo
      // acima) — "❌ Cancelar" só apaga o rascunho; "✅ Confirmar" grava de
      // verdade em transacoes.
      if ((acao === "nlconfirmar" || acao === "nlcancelar") && chatId) {
        const rascunhoId = Number(idStr);
        const { data: tgUser } = await supabaseAdmin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
        if (!tgUser) {
          await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Conta não vinculada" });
          return json({ ok: true });
        }
        const { data: rascunho } = await supabaseAdmin
          .from("telegram_rascunhos").select("dados")
          .eq("id", rascunhoId).eq("chat_id", chatId).eq("user_id", tgUser.user_id) // nunca confia só no id vindo do botão
          .maybeSingle();
        if (!rascunho) {
          await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Esse rascunho já não existe mais" });
          return json({ ok: true });
        }

        if (acao === "nlcancelar") {
          await supabaseAdmin.from("telegram_rascunhos").delete().eq("id", rascunhoId);
          await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Cancelado" });
          await tg(token, "editMessageText", {
            chat_id: chatId, message_id: cq.message.message_id,
            text: `${cq.message.text}\n\n❌ Cancelado`,
          });
          return json({ ok: true });
        }

        const { erro: insertError } = await confirmarRascunhoNoBanco(supabaseAdmin, tgUser.user_id, rascunho.dados as RascunhoLancamento);
        await supabaseAdmin.from("telegram_rascunhos").delete().eq("id", rascunhoId);
        if (insertError) {
          console.error(insertError);
          await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Erro ao confirmar" });
          return json({ ok: true });
        }
        await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Lançado ✅" });
        await tg(token, "editMessageText", {
          chat_id: chatId, message_id: cq.message.message_id,
          text: `${cq.message.text}\n\n✅ Lançado`,
        });
        return json({ ok: true });
      }

      // Escolha de conta no teclado do /atualizar — "todas" ou o id de uma
      // pluggy_contas específica.
      if (acao === "atualizarconta" && chatId) {
        const { data: tgUser } = await supabaseAdmin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
        if (!tgUser) {
          await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Conta não vinculada" });
          return json({ ok: true });
        }
        const { contas } = await carregarContasPluggy(supabaseAdmin, tgUser.user_id);
        const contaId = idStr === "todas" ? null : Number(idStr);
        // Nunca confia só no id vindo do botão — filtra pelas contas do
        // PRÓPRIO usuário vinculado, não pelo id cru.
        const alvo = contaId ? contas.filter((c) => c.id === contaId) : contas;
        if (!alvo.length) {
          await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Conta não encontrada" });
          return json({ ok: true });
        }
        await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Atualizando..." });
        await tg(token, "editMessageText", {
          chat_id: chatId, message_id: cq.message.message_id,
          text: `🔄 Atualizando ${contaId ? tituloContaPluggyDetalhado(alvo[0]) : `${alvo.length} conta(s)`}...`,
        });
        await executarAtualizacaoPluggy(supabaseAdmin, token, chatId, alvo);
        return json({ ok: true });
      }

      // Escolha no menu inline do /pgtopadrao — idStr é o índice na mesma
      // lista (ordenada por "ordem") que gerou os botões.
      if (acao === "pgtopadrao" && chatId) {
        const { data: tgS } = await supabaseAdmin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
        if (!tgS) {
          await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Conta não vinculada" });
          return json({ ok: true });
        }
        const listasS = await carregarListasUsuario(supabaseAdmin, tgS.user_id);
        const escolhida = listasS.metodos[Number(idStr)];
        if (!escolhida) {
          await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Essa opção já não existe mais" });
          return json({ ok: true });
        }
        await supabaseAdmin.from("telegram_config").upsert({ user_id: tgS.user_id, metodo_padrao: rotuloMetodo(escolhida) }, { onConflict: "user_id" });
        await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Salvo ✅" });
        await tg(token, "editMessageText", {
          chat_id: chatId, message_id: cq.message.message_id,
          text: `✅ Forma de pagamento padrão: ${rotuloMetodo(escolhida)}`,
        });
        return json({ ok: true });
      }

      const importadaId = Number(idStr);

      if (!chatId || !importadaId || !["confirmar", "ignorar"].includes(acao)) {
        await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Ação inválida" });
        return json({ ok: true });
      }

      const { data: tgUser } = await supabaseAdmin.from("telegram_users").select("user_id").eq("chat_id", chatId).maybeSingle();
      if (!tgUser) {
        await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Conta não vinculada" });
        return json({ ok: true });
      }

      const { data: item } = await supabaseAdmin
        .from("transacoes_importadas")
        .select("*")
        .eq("id", importadaId)
        .eq("user_id", tgUser.user_id) // nunca confia só no id vindo do botão
        .eq("status", "pendente")
        .maybeSingle();
      if (!item) {
        await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Já foi tratado antes" });
        return json({ ok: true });
      }

      if (acao === "ignorar") {
        await supabaseAdmin.from("transacoes_importadas").update({ status: "ignorada" }).eq("id", importadaId);
        await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Ignorado" });
        await tg(token, "editMessageText", {
          chat_id: chatId, message_id: cq.message.message_id,
          text: `${cq.message.text}\n\n❌ Ignorado`,
        });
        return json({ ok: true });
      }

      // Confirmar — precisa de categoria sugerida (sem isso, pede pra ir no app).
      if (!item.categoria_sugerida) {
        await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Sem categoria sugerida — confirme pelo app", show_alert: true });
        return json({ ok: true });
      }

      let metodoObj: { nome: string; metodo_kind: string | null; banco: string | null; dia_fechamento: number | null } | null = null;
      if (item.metodo_sugerido) {
        const { data: m } = await supabaseAdmin.from("menu_itens").select("nome, metodo_kind, banco, dia_fechamento").eq("id", item.metodo_sugerido).maybeSingle();
        metodoObj = m ?? null;
      }
      const competencia = competenciaDe(item.data, metodoObj?.metodo_kind === "Crédito" ? metodoObj.dia_fechamento : null);

      const { data: nova, error: insertError } = await supabaseAdmin
        .from("transacoes")
        .insert({
          tipo: item.tipo,
          data: item.data,
          valor: item.valor,
          metodo: metodoObj ? rotuloMetodo(metodoObj) : null,
          categoria: item.categoria_sugerida,
          descricao: limparLinks(item.descricao_banco || ""),
          forma_pagamento: "À vista",
          tipo_recorrencia: "Pontual",
          competencia,
          status: "Ativa",
          origem: "pluggy",
          dados_originais: {
            pluggy_transaction_id: item.pluggy_transaction_id,
            data: item.data,
            valor: item.valor,
            tipo: item.tipo,
            descricao_banco: item.descricao_banco,
            categoria_pluggy: item.categoria_pluggy,
            categoria_sugerida: item.categoria_sugerida,
          },
          user_id: tgUser.user_id,
        })
        .select("id")
        .single();
      if (insertError) {
        console.error(insertError);
        await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Erro ao confirmar" });
        return json({ ok: true });
      }

      await supabaseAdmin.from("transacoes_importadas").update({ status: "confirmada", transacao_id: nova.id }).eq("id", importadaId);
      await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Confirmado ✅" });
      await tg(token, "editMessageText", {
        chat_id: chatId, message_id: cq.message.message_id,
        text: `${cq.message.text}\n\n✅ Confirmado`,
      });
      return json({ ok: true });
    }

    return json({ ok: true });
  } catch (e) {
    console.error(e);
    // Qualquer erro inesperado aqui em cima retornava 200 pro Telegram sem
    // nunca avisar o usuário — a mensagem simplesmente "não respondia",
    // sem pista de que algo deu errado. Tenta mandar um aviso genérico pro
    // mesmo chat (melhor esforço — se isso também falhar, azar, mas pelo
    // menos tentou).
    try {
      const chatId = update?.message?.chat?.id ?? update?.callback_query?.message?.chat?.id;
      if (chatId) await tg(token, "sendMessage", { chat_id: chatId, text: "Deu um erro aqui do meu lado — tenta de novo em instantes." });
      await avisarErroBot(supabaseAdmin, token, "telegram-webhook", `⚠️ Erro no bot: ${String(e instanceof Error ? e.message : e).slice(0, 300)}`);
    } catch (_) { /* melhor esforço mesmo */ }
    return json({ ok: true }); // sempre 200 pro Telegram não reenviar em loop
  }
});
