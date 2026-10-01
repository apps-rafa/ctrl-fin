// /atualizar do bot: contas do Open Finance (Pluggy) do usuário e leitura das últimas transações.

import type { createClient } from "npm:@supabase/supabase-js@2";
import { tg, escaparHtml, formatarMoedaBR } from "./util.ts";

export const PLUGGY_API_URL = "https://api.pluggy.ai";

export interface ContaPluggy {
  id: number;
  item_id: string;
  account_id: string;
  marketing_name: string | null;
  tipo_conta: string | null;
  nome_conta: string | null;
  nome_instituicao: string | null;
  numero_mascarado: string | null;
  marca_cartao: string | null;
  metodo_id: number | null;
  /** Banco do "Método do app" ligado à conta (ex. "Bradesco") — é a fonte
   *  mais confiável: o conector "MeuPluggy" agrega vários bancos e não diz
   *  qual é o de cada conta. */
  banco_metodo?: string | null;
}

/** "Nu Pagamentos S.A. - Instituição de Pagamento" -> "Nubank"; tira
 *  qualquer "(...)" final. */
export function normalizarBanco(nome: string): string {
  if (/^nu pagamentos/i.test(nome.trim())) return "Nubank";
  return nome.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/** Nome da conta no formato "Banco: Tipo", ex.:
 *    Mercado Pago: Conta Pré-paga
 *    Bradesco: Cartão de crédito VISA INFINITE (final 1525)
 *    Nubank: Cartão de crédito MASTERCARD PLATINUM (final 8381)
 *  Cartão quebra em 2 linhas ("Nubank: Cartão de crédito" / "MASTERCARD
 *  PLATINUM (final 8381)") — é o que o menu do /atualizar mostra. O título
 *  curto do app vira "Cartão de crédito" genérico pra qualquer cartão. */
export function linhasContaPluggy(c: ContaPluggy): string[] {
  const marketing = c.marketing_name ?? "";
  const tipoEntreParenteses = marketing.match(/\(([^)]+)\)\s*$/)?.[1] ?? null; // "Conta Pré-paga"
  const bancoBruto = c.banco_metodo
    || (marketing ? marketing.replace(/\s*\([^)]*\)\s*$/, "") : null)
    || (c.nome_instituicao && !/meupluggy/i.test(c.nome_instituicao) ? c.nome_instituicao : null);
  const banco = bancoBruto ? normalizarBanco(bancoBruto) : null;

  if (c.tipo_conta === "CREDIT") {
    const marca = (c.marca_cartao ?? "").toUpperCase();
    const nivel = (c.nome_conta ?? "").toUpperCase(); // "VISA INFINITE", "PLATINUM" ou o próprio banco
    let detalhe: string;
    if (nivel && marca && nivel.includes(marca)) detalhe = nivel;
    else if (nivel && banco && nivel === banco.toUpperCase()) detalhe = marca;
    else detalhe = [marca, nivel].filter(Boolean).join(" ");
    const linha1 = banco ? `${banco}: Cartão de crédito` : "Cartão de crédito";
    const linha2 = `${detalhe}${c.numero_mascarado ? `${detalhe ? " " : ""}(final ${c.numero_mascarado})` : ""}`;
    return linha2 ? [linha1, linha2] : [linha1];
  }

  const tipo = tipoEntreParenteses || c.nome_conta || "Conta bancária";
  return [banco ? `${banco}: ${tipo}` : tipo];
}

export const BOTAO_TODAS_CONTAS = "🔄 Todas as contas";

/** Texto do botão de uma conta no teclado do /atualizar. */
export function rotuloBotaoConta(c: ContaPluggy, i: number): string {
  return `${i + 1}. ${tituloContaPluggyDetalhado(c)}`;
}

/** Mesmo nome numa linha só (log das transações, aviso de "Atualizando..."). */
export function tituloContaPluggyDetalhado(c: ContaPluggy): string {
  return linhasContaPluggy(c).join(" ");
}

/** Contas Pluggy ativas do usuário, com o banco do "Método do app" junto
 *  (ver ContaPluggy.banco_metodo). Sem filtro de "sincronizar" de
 *  propósito — /atualizar é uma ação explícita do usuário no Telegram,
 *  independente do toggle "Incluir na sincronização" do botão automático
 *  do app. */
export async function carregarContasPluggy(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ erro: unknown; contas: ContaPluggy[] }> {
  const { data, error } = await admin
    .from("pluggy_contas").select("*").eq("user_id", userId).in("status", ["ativo", "erro"]).order("id");
  if (error) return { erro: error, contas: [] };
  const contas = (data ?? []) as ContaPluggy[];
  const metodoIds = [...new Set(contas.map((c) => c.metodo_id).filter((id): id is number => !!id))];
  const bancos = new Map<number, string>();
  if (metodoIds.length) {
    const { data: metodos } = await admin.from("menu_itens").select("id, banco").in("id", metodoIds);
    for (const m of (metodos ?? []) as { id: number; banco: string | null }[]) if (m.banco) bancos.set(m.id, m.banco);
  }
  return {
    erro: null,
    contas: contas.map((c) => ({ ...c, banco_metodo: c.metodo_id ? bancos.get(c.metodo_id) ?? null : null })),
  };
}

/** "Rendimentos e dividendos" da Pluggy (juros de conta remunerada etc.) —
 *  sempre fora do /atualizar: são muitos, minúsculos, e não é isso que o
 *  usuário quer ver ao pedir as últimas transações. Mesma categoria que o
 *  toggle "Ignorar" do app usa (ver TRADUCAO_CATEGORIA_PLUGGY em
 *  pluggy-sync), só que aqui é sempre — sem toggle. */
export function ehRendimentoPluggy(categoriaBruta: string | null | undefined): boolean {
  return (categoriaBruta || "").trim().toLowerCase() === "proceeds interests and dividends";
}

/** Força a Pluggy buscar dados novos AGORA nas contas passadas (PATCH
 *  /items/{id}, mesma chamada do "Sincronizar agora" no app) e manda de
 *  volta um log com as 3 transações mais recentes de cada uma. Usado pelo
 *  /atualizar tanto pra "Todas as contas" quanto pra uma conta escolhida
 *  no teclado. */
export async function executarAtualizacaoPluggy(
  admin: ReturnType<typeof createClient>,
  token: string,
  chatId: number,
  contas: ContaPluggy[],
): Promise<void> {
  try {
    const apiKey = await getPluggyApiKey();

    // Assíncrono do lado da Pluggy, por isso a pequena espera antes de
    // buscar as transações; itemIds repetidos (várias contas da mesma
    // conexão) só disparam uma vez.
    const itemIds = [...new Set(contas.map((c) => c.item_id))];
    await Promise.all(itemIds.map((itemId) =>
      fetch(`${PLUGGY_API_URL}/items/${itemId}`, {
        method: "PATCH",
        headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).catch((e) => console.error(`Falha ao forçar atualização do item ${itemId}:`, e))
    ));
    await new Promise((resolve) => setTimeout(resolve, 6000));

    // /v2/transactions não aceita "pageSize" (só filtros — accountId,
    // dateFrom/dateTo — e pagina por cursor via "next" na resposta, igual
    // ao pluggy-sync); busca uma janela recente e pega as 3 mais novas no
    // client.
    const dateFrom = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const blocos: string[] = [];
    for (const conta of contas) {
      const titulo = escaparHtml(tituloContaPluggyDetalhado(conta));
      try {
        const resp = await pluggyGet(`/v2/transactions?accountId=${conta.account_id}&dateFrom=${dateFrom}`, apiKey);
        const ultimas = [...(resp.results ?? [])]
          .filter((t: { category?: string }) => !ehRendimentoPluggy(t.category))
          .sort((a: { date: string }, b: { date: string }) => (a.date < b.date ? 1 : -1))
          .slice(0, 3);
        if (!ultimas.length) {
          blocos.push(`🏦 <b>${titulo}</b>\nSem transações no período.`);
          continue;
        }
        const linhas = ultimas.map((t: { date: string; amount: number; type: string; description?: string; descriptionRaw?: string }) => {
          const data = String(t.date).slice(0, 10).split("-").reverse().join("/");
          const sinal = t.type === "CREDIT" ? "+" : "-";
          const desc = t.description || t.descriptionRaw || "(sem descrição)";
          const valor = Math.abs(Number(t.amount) || 0);
          return `• ${data} ${sinal}${formatarMoedaBR(valor)} — ${escaparHtml(desc)}`;
        });
        blocos.push(`🏦 <b>${titulo}</b>\n${linhas.join("\n")}`);
      } catch (e) {
        console.error(`Erro buscando transações da conta ${conta.id}:`, e);
        blocos.push(`🏦 <b>${titulo}</b>\n⚠️ Erro ao buscar transações.`);
      }
    }

    await tg(token, "sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      text: `✅ Atualizado. Últimas transações por conta:\n\n${blocos.join("\n\n")}`,
    });
  } catch (e) {
    console.error("Erro no /atualizar:", e);
    await tg(token, "sendMessage", { chat_id: chatId, text: "Deu erro ao atualizar com a Pluggy — tenta de novo em instantes." });
  }
}

/** Mesmo par client_id/client_secret do pluggy-sync — gera uma API key
 *  válida por ~2h da Pluggy. */
export async function getPluggyApiKey(): Promise<string> {
  const clientId = Deno.env.get("PLUGGY_CLIENT_ID");
  const clientSecret = Deno.env.get("PLUGGY_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET não configurados");
  }
  const resp = await fetch(`${PLUGGY_API_URL}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  if (!resp.ok) throw new Error(`Pluggy /auth falhou (${resp.status}): ${await resp.text()}`);
  const data = await resp.json();
  return data.apiKey as string;
}

export async function pluggyGet(path: string, apiKey: string) {
  const resp = await fetch(`${PLUGGY_API_URL}${path}`, { headers: { "X-API-KEY": apiKey } });
  if (!resp.ok) throw new Error(`Pluggy ${path} falhou (${resp.status}): ${await resp.text()}`);
  return resp.json();
}
