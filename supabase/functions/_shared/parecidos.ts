// Aviso único de "já existe algo parecido": TODO lançamento que chega sozinho (mensagem/SMS, e-mail de conta, Pluggy)
// passa pela mesma busca e pergunta do mesmo jeito, com as mesmas opções; só muda a origem. Usado pelo telegram-webhook
// e pelo pluggy-webhook.

// deno-lint-ignore no-explicit-any
type Admin = any;

export type OrigemAviso = "sms" | "email" | "pluggy";

export interface ParecidoTx {
  id: number; descricao: string | null; categoria: string; valor: number; data: string;
  metodo: string | null; a_confirmar: boolean; recorrencia_id: string | null;
}

const ROTULO: Record<OrigemAviso, string> = { sms: "💬 Mensagem", email: "📧 E-mail", pluggy: "🏦 Pluggy" };
const PREFIXO: Record<OrigemAviso, string> = { sms: "sm", email: "em", pluggy: "pg" };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const moeda = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const somarDias = (iso: string, d: number) => new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + d * 86400000).toISOString().slice(0, 10);
const fmtDia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Varre as despesas/receitas do mês da data (a confirmar, a pagar, pagas...) e as ocorrências de recorrência próximas.
 *  `casada` = ocorrência "a confirmar" de recorrência que bate com o lançamento (nome e/ou valor); `parecidos` = o resto
 *  que se parece (nome+valor, valor em até 3 dias, ou nome em até 3 dias). */
export async function analisarParecidos(
  admin: Admin, userId: string,
  q: { tipo: "entradas" | "saidas"; valor: number; data: string; texto: string },
): Promise<{ casada: ParecidoTx | null; parecidos: ParecidoTx[] }> {
  const mes = q.data.slice(0, 7);
  const ini = [`${mes}-01`, somarDias(q.data, -12)].sort()[0];
  const fim = [`${mes}-31`, somarDias(q.data, 40)].sort().reverse()[0];
  const { data: todas } = await admin.from("transacoes")
    .select("id, descricao, categoria, valor, data, metodo, a_confirmar, recorrencia_id")
    .eq("user_id", userId).eq("tipo", q.tipo).gte("data", ini).lte("data", fim).order("data", { ascending: true });
  const lista = (todas ?? []) as ParecidoTx[];
  const alvo = norm(q.texto);
  const dias = (d: string) => Math.abs(Date.parse(`${d.slice(0, 10)}T00:00:00Z`) - Date.parse(`${q.data}T00:00:00Z`)) / 86400000;
  const nomeBate = (t: ParecidoTx) => {
    const palavras = norm(String(t.descricao ?? "")).split(/[^a-z0-9]+/).filter((p) => p.length >= 4);
    return palavras.length === 0 ? 0 : palavras.every((p) => alvo.includes(p)) ? 2 : palavras.some((p) => alvo.includes(p)) ? 1 : 0;
  };
  const mesmoValor = (t: ParecidoTx) => Math.abs(Math.abs(Number(t.valor)) - Math.abs(q.valor)) < 0.5;
  const casadas = lista.filter((t) => t.a_confirmar && t.recorrencia_id)
    .map((t) => ({ t, p: nomeBate(t) >= 2 || (nomeBate(t) >= 1 && mesmoValor(t)) ? nomeBate(t) + (mesmoValor(t) ? 1 : 0) : 0 }))
    .filter((x) => x.p > 0).sort((x, y) => y.p - x.p || dias(x.t.data) - dias(y.t.data));
  if (casadas.length) return { casada: casadas[0].t, parecidos: [] };
  const parecidos = lista.filter((t) => t.data.slice(0, 7) === mes &&
    ((nomeBate(t) > 0 && mesmoValor(t)) || (mesmoValor(t) && dias(t.data) <= 3) || (nomeBate(t) > 0 && dias(t.data) <= 3))).slice(0, 3);
  return { casada: null, parecidos };
}

/** Texto do aviso (igual para toda origem; só a primeira linha muda). */
export function textoParecidos(p: { origem: OrigemAviso; titulo: string; valor: number | null; data?: string | null; detalhe?: string; parecidos: ParecidoTx[] | Record<string, unknown>[] }): string {
  const lista = (p.parecidos as ParecidoTx[]).slice(0, 3).map((t) =>
    `• ${t.descricao || t.categoria} — ${moeda(Number(t.valor))} em ${fmtDia(String(t.data))}${t.a_confirmar ? " (a confirmar)" : ""}${t.metodo ? ` · ${t.metodo}` : ""}`).join("\n");
  const cab = `${ROTULO[p.origem]}: ${p.titulo}${p.valor !== null ? ` — ${moeda(p.valor)}` : ""}${p.data ? ` · ${fmtDia(p.data)}` : ""}${p.detalhe ? ` · ${p.detalhe}` : ""}`;
  return `${cab}\n⚠️ Já existe algo parecido:\n${lista}\n\nÉ o mesmo?`;
}

/** Botões do aviso (iguais para toda origem). `id` = o que identifica o lançamento recebido naquela origem. */
export function tecladoParecidos(origem: OrigemAviso, id: number | string, podeAtualizar = true) {
  const p = PREFIXO[origem];
  return { inline_keyboard: [
    [{ text: "✅ É o mesmo (ignorar)", callback_data: `${p}ig:${id}` }],
    ...(podeAtualizar ? [[{ text: "🔄 É o mesmo, atualizar valor/data", callback_data: `${p}at:${id}` }]] : []),
    [{ text: "➕ Não, é outro lançamento", callback_data: `${p}ou:${id}` }],
  ] };
}

/** Aviso padrão de lançamento novo vindo do banco (Pluggy), com Confirmar/Ignorar. */
export function montarAvisoPluggy(
  item: { id: number; tipo: string; valor: number; data: string; descricao_banco: string | null; categoria_sugerida: string | null },
  metodoTxt: string | null, limpar: (t: string) => string,
): { texto: string; botoes: unknown[][] } {
  const sinal = item.tipo === "entradas" ? "+" : "-";
  const emoji = item.tipo === "entradas" ? "💰" : "💸";
  const dataFmt = new Date(`${item.data}T00:00:00`).toLocaleDateString("pt-BR");
  const texto = [
    `${emoji} *Novo lançamento via Pluggy*`,
    `${sinal} ${moeda(item.valor)} — ${dataFmt}`,
    item.descricao_banco ? `_${limpar(item.descricao_banco)}_` : null,
    item.categoria_sugerida ? `Categoria sugerida: ${item.categoria_sugerida}` : "Sem sugestão de categoria — confirme pelo app",
    metodoTxt ? `Método: ${metodoTxt}` : null,
  ].filter(Boolean).join("\n");
  const botoes = item.categoria_sugerida
    ? [[{ text: "✅ Confirmar", callback_data: `confirmar:${item.id}` }, { text: "❌ Ignorar", callback_data: `ignorar:${item.id}` }]]
    : [[{ text: "❌ Ignorar", callback_data: `ignorar:${item.id}` }]];
  return { texto, botoes };
}
