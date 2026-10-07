// Utilitários do bot: resposta JSON, chamada à API do Telegram e formatações.

export const TELEGRAM_API = "https://api.telegram.org/bot";

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
export async function tg(token: string, method: string, body: unknown): Promise<any> {
  try {
    // Nunca mostra pré-visualização de link (descrições vindas do banco, ex.: "apple.com/bill", viravam link com thumb)
    const corpo = method === "sendMessage" ? { link_preview_options: { is_disabled: true }, ...(body as object) } : body;
    const resp = await fetch(`${TELEGRAM_API}${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const texto = await resp.text();
    if (!resp.ok) console.error(`Telegram ${method} falhou:`, resp.status, texto);
    try { return JSON.parse(texto); } catch { return null; }
  } catch (e) {
    console.error(`Erro chamando Telegram ${method}:`, e);
    return null;
  }
}

/** Mesmo rótulo mostrado no formulário do app (js/menus-api.js:rotuloMetodo). */
export function rotuloMetodo(m: { nome: string; metodo_kind: string | null; banco: string | null }): string {
  if (!m.metodo_kind || m.metodo_kind === "Dinheiro") return m.nome;
  return m.banco ? `${m.metodo_kind} ${m.banco}` : m.metodo_kind;
}

export function escaparHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatarMoedaBR(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
