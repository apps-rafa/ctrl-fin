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
  enviarRascunho,
  limparRascunhosAntigos,
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
import { executarBackup } from "./backup.ts";
import { executarLembretes } from "./lembretes.ts";
import { responderFila, abrirDuplicata, aprovarDuplicata } from "./fila.ts";
import { gerarOcorrencias } from "../_shared/ocorrencias.ts";
import {
  idRascunhoDaResposta, tratarRespostaRascunho,
  tratarFormularioMiniApp, tratarStart, tratarAtualizar, tratarPgtoPadraoComando, tratarBackup,
} from "./comandos.ts";
import {
  tratarUltimoEditar, tratarRascunhoEditar, tratarRascunhoConfirmarOuCancelar, tratarAtualizarConta, tratarPgtoPadrao,
  tratarRecorrenciaRascunho,
} from "./callbacks.ts";
import {
  categoriaCadastradaNoTexto,
  montarDescricao,
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
  let cat = sugerirCategoriaTexto(texto, tipo, catsSugestao);
  let categoria = cat.nome;
  // Receita de "reembolso" de uma categoria que só existe em Despesas (ex.: "370 reembolso saúde"): fica na
  // categoria Reembolso (se não houver categoria de receita com esse nome no texto) e o nome da despesa vira
  // a descrição ("Saúde"), já que o app não tem categoria Saúde em Receitas.
  let descricaoExtra = "";
  if (tipo === "entradas" && /reembols/i.test(texto)) {
    const daDespesa = categoriaCadastradaNoTexto(texto, catsSugestao.filter((c: { categoria_tipo: string | null }) => c.categoria_tipo === "saidas"));
    const reembolso = catsSugestao.find((c: { nome: string; categoria_tipo: string | null }) => c.categoria_tipo === "entradas" && c.nome === "Reembolso");
    if (daDespesa) {
      descricaoExtra = daDespesa.nome;
      cat = { ...cat, palavras: [...cat.palavras, ...daDespesa.palavras] };
    }
    if (reembolso && (!cat.porNome || cat.nome === "Reembolso")) { categoria = reembolso.nome; cat = { ...cat, nome: reembolso.nome }; }
  }

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

  // Descrição: o que sobra do texto depois de tirar valor, tipo, data, forma de pagamento e categoria.
  const descricao = achado.estabelecimento
    ? limparLinks(achado.estabelecimento.charAt(0).toUpperCase() + achado.estabelecimento.slice(1).toLowerCase())
    : (montarDescricao(resto, { palavrasCategoria: cat.palavras, metodo: tipo === "saidas" ? metodoObj : null }) || descricaoExtra);

  const rascunho: RascunhoLancamento = {
    tipo, valor, descricao, categoria,
    metodo: metodoObj ? rotuloMetodo(metodoObj) : null,
    metodoKind: metodoObj?.metodo_kind ?? null,
    diaFechamento: metodoObj?.dia_fechamento ?? null,
    data: achado.data ?? hojeBrasiliaISO(),
    parcelas: parcelasFinal,
    metodoOrigem,
  };

  await limparRascunhosAntigos(supabaseAdmin); // melhor esforço: não deixa a fila crescer sem fim

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
      if (corpo.tarefa === "recorrencias") { const n = await gerarOcorrencias(adminCron, hojeBrasiliaISO()); return json({ ok: true, criadas: n }); }
      if (corpo.tarefa === "lembretes") { const n = await executarLembretes(adminCron, token); return json({ ok: true, enviados: n }); }
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

    if (update.message?.web_app_data) {
      await tratarFormularioMiniApp({ update, supabaseAdmin, token });
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
        await tratarStart({ supabaseAdmin, token, chatId, texto });
        return json({ ok: true });
      }

      if (texto.startsWith("/atualizar")) {
        await tratarAtualizar({ supabaseAdmin, token, chatId, texto });
        return json({ ok: true });
      }

      if (/^\/pgtopadrao(?:@\w+)?(?:\s|$)/i.test(texto)) {
        await tratarPgtoPadraoComando({ supabaseAdmin, token, chatId, texto });
        return json({ ok: true });
      }

      // "/lancamento": só explica como lançar por mensagem (mesma explicação
      // da aba Configurações > Notificações do app).
      if (/^\/lancamento(?:@\w+)?(?:\s|$)/i.test(texto)) {
        await tg(token, "sendMessage", { chat_id: chatId, text: TEXTO_AJUDA_LANCAMENTO });
        return json({ ok: true });
      }

      if (/^\/backup(?:@\w+)?(?:\s|$)/i.test(texto)) {
        await tratarBackup({ supabaseAdmin, token, chatId, texto });
        return json({ ok: true });
      }

      // /fila: duplicatas e recorrências a confirmar, com um botão numerado por item
      if (/^\/fila(?:@\w+)?(?:\s|$)/i.test(texto)) {
        await responderFila(supabaseAdmin, token, chatId);
        return json({ ok: true });
      }

      // Consultas rápidas do mês.
      const cmd = texto.match(/^\/(resumo|diario|credito|pix|ultimos)(?:@\w+)?(?:\s|$)/i);
      if (cmd) {
        await responderComandoConsulta(supabaseAdmin, token, chatId, cmd[1].toLowerCase());
        return json({ ok: true });
      }

      // Resposta (reply) a um rascunho: o texto vira a descrição daquele rascunho.
      const idRespondido = idRascunhoDaResposta(update.message.reply_to_message);
      if (idRespondido) {
        await tratarRespostaRascunho({ supabaseAdmin, token, chatId, texto, rascunhoId: idRespondido, mensagemRespondidaId: update.message.reply_to_message?.message_id });
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

      if (acao === "ultedit" && chatId) {
        await tratarUltimoEditar({ supabaseAdmin, token, cq, chatId, idStr, acao });
        return json({ ok: true });
      }

      if (acao === "filadup" && chatId) {
        await abrirDuplicata(supabaseAdmin, token, cq, chatId, Number(idStr));
        return json({ ok: true });
      }

      if (acao === "dupok" && chatId) {
        await aprovarDuplicata(supabaseAdmin, token, cq, chatId, Number(idStr));
        return json({ ok: true });
      }

      if (acao === "recrasc" && chatId) {
        await tratarRecorrenciaRascunho({ supabaseAdmin, token, cq, chatId, idStr, acao });
        return json({ ok: true });
      }

      // "Agora não" no lembrete de recorrência: só fecha a mensagem — a ocorrência continua "a confirmar" no app
      if (acao === "recdepois" && chatId) {
        await tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "Segue em a confirmar" });
        await tg(token, "editMessageText", { chat_id: chatId, message_id: cq.message.message_id, text: `${cq.message.text}\n\n⏭️ Segue em "a confirmar" no app` });
        return json({ ok: true });
      }

      if (acao === "nleditar" && chatId) {
        await tratarRascunhoEditar({ supabaseAdmin, token, cq, chatId, idStr, acao });
        return json({ ok: true });
      }

      if ((acao === "nlconfirmar" || acao === "nlcancelar") && chatId) {
        await tratarRascunhoConfirmarOuCancelar({ supabaseAdmin, token, cq, chatId, idStr, acao });
        return json({ ok: true });
      }

      if (acao === "atualizarconta" && chatId) {
        await tratarAtualizarConta({ supabaseAdmin, token, cq, chatId, idStr, acao });
        return json({ ok: true });
      }

      if (acao === "pgtopadrao" && chatId) {
        await tratarPgtoPadrao({ supabaseAdmin, token, cq, chatId, idStr, acao });
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
