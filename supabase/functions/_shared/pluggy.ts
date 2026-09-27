// Credencial da Pluggy a usar pra um usuário: a PRÓPRIA (Configurações >
// Open Finance > Dados cadastrais, tabela pluggy_credenciais) se ele tiver
// cadastrado uma; senão os secrets globais da função (PLUGGY_CLIENT_ID/
// PLUGGY_CLIENT_SECRET) — o dono original do app continua funcionando sem
// precisar cadastrar nada. Ver pluggy_credenciais na migration
// 20260927_pluggy_credenciais.sql pro porquê disso existir (plano gratuito
// da Pluggy só conecta contas do mesmo titular da credencial).

// deno-lint-ignore no-explicit-any
type ClienteSupabase = any;

const PLUGGY_API_URL = "https://api.pluggy.ai";

async function credenciaisPluggy(
  cliente: ClienteSupabase,
  userId: string,
): Promise<{ clientId: string; clientSecret: string }> {
  const { data } = await cliente
    .from("pluggy_credenciais")
    .select("client_id, client_secret")
    .eq("user_id", userId)
    .maybeSingle();
  if (data?.client_id && data?.client_secret) {
    return { clientId: data.client_id, clientSecret: data.client_secret };
  }
  const clientId = Deno.env.get("PLUGGY_CLIENT_ID");
  const clientSecret = Deno.env.get("PLUGGY_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error(
      "Nenhuma credencial da Pluggy disponível (nem própria em Configurações > Open Finance > Dados cadastrais, nem os secrets globais da função)",
    );
  }
  return { clientId, clientSecret };
}

/** Troca client_id/client_secret (própria do usuário ou o secret global) por
 *  uma API Key da Pluggy — expira em ~2h, então nunca cacheada entre
 *  invocações da função. `cliente` pode ser o client do usuário (JWT, sujeito
 *  a RLS — basta pra ler a própria linha) ou o admin/service-role (webhook,
 *  sem sessão de usuário; passa o user_id resolvido por outra via, ex. o
 *  item_id em pluggy_contas). */
export async function getPluggyApiKey(cliente: ClienteSupabase, userId: string): Promise<string> {
  const { clientId, clientSecret } = await credenciaisPluggy(cliente, userId);
  const resp = await fetch(`${PLUGGY_API_URL}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  if (!resp.ok) {
    throw new Error(`Pluggy /auth falhou (${resp.status}): ${await resp.text()}`);
  }
  const data = await resp.json();
  return data.apiKey as string;
}
