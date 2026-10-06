// Edge Function: enviar-backup
//
// Manda o backup completo (mesmo formato do "Baixar backup" do app, então o "Importar backup" restaura) por e-mail, via Resend.
//  - Botão "Enviar por e-mail" (Configurações > Dados): chamada com o JWT do usuário logado (verify_jwt desligado no deploy;
//    a função valida o usuário sozinha para também aceitar o agendamento).
//  - Agendamento mensal (pg_cron): cabeçalho x-cron-secret igual ao de public.app_cron_segredo ('tarefas'); manda o de cada usuário do bot.
// Segredos (Supabase > Edge Functions > Secrets): RESEND_API_KEY (obrigatório) e BACKUP_EMAIL_TO (opcional; padrão: e-mail do usuário).
// Sem domínio verificado o Resend só entrega para o e-mail da própria conta dele — por isso o remetente é onboarding@resend.dev.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function todasAsLinhas(admin: ReturnType<typeof createClient>, tabela: string, userId: string): Promise<unknown[]> {
  const linhas: unknown[] = [];
  for (let ini = 0; ; ini += 1000) {
    const { data, error } = await admin.from(tabela).select("*").eq("user_id", userId).order("id").range(ini, ini + 999);
    if (error) throw error;
    linhas.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return linhas;
}

function paraBase64(texto: string): string {
  const bytes = new TextEncoder().encode(texto);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function enviarBackup(admin: ReturnType<typeof createClient>, userId: string, emailPadrao: string | undefined, chave: string) {
  const para = Deno.env.get("BACKUP_EMAIL_TO") || emailPadrao;
  if (!para) throw new Error("Sem e-mail de destino (defina BACKUP_EMAIL_TO ou use um usuário com e-mail)");
  const transacoes = await todasAsLinhas(admin, "transacoes", userId);
  const { data: menuItens, error: e2 } = await admin.from("menu_itens").select("*").eq("user_id", userId);
  if (e2) throw e2;
  const { data: feriados, error: e3 } = await admin.from("feriados").select("*").eq("user_id", userId);
  if (e3) throw e3;
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const backup = {
    versao: 1, app: "Ctrl Financeiro", exportadoEm: new Date().toISOString(), selecaoParcial: false,
    transacoes, menuItens: menuItens ?? [], feriados: feriados ?? [],
  };
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Ctrl Fin <onboarding@resend.dev>",
      to: [para],
      subject: `💾 Backup Ctrl Fin — ${hoje}`,
      text: `Backup completo do Ctrl Fin em anexo (${transacoes.length} lançamentos, ${(menuItens ?? []).length} itens de menu, ${(feriados ?? []).length} feriados).\nPara restaurar: Configurações > Dados > Importar Backup.\nGuarde este e-mail: ele tem todos os seus lançamentos.`,
      attachments: [{ filename: `backup-ctrl-financeiro-${hoje}.json`, content: paraBase64(JSON.stringify(backup, null, 2)) }],
    }),
  });
  if (!resp.ok) throw new Error(`Resend falhou (${resp.status}): ${(await resp.text()).slice(0, 300)}`);
  return { para, lancamentos: transacoes.length };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não suportado" }, 405);
  const chave = Deno.env.get("RESEND_API_KEY");
  if (!chave) return json({ error: "RESEND_API_KEY não configurada nos segredos do Supabase" }, 500);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const segredoCron = req.headers.get("x-cron-secret");
    if (segredoCron) { // agendamento mensal
      const { data: seg } = await admin.from("app_cron_segredo").select("valor").eq("nome", "tarefas").maybeSingle();
      if (!seg || segredoCron !== seg.valor) return json({ error: "Não autorizado" }, 401);
      const { data: usuarios } = await admin.from("telegram_users").select("user_id");
      const enviados = [];
      for (const u of (usuarios ?? []) as { user_id: string }[]) {
        const { data: { user } } = await admin.auth.admin.getUserById(u.user_id);
        enviados.push(await enviarBackup(admin, u.user_id, user?.email ?? undefined, chave));
      }
      return json({ ok: true, enviados });
    }
    const cliente = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user }, error: authError } = await cliente.auth.getUser();
    if (authError || !user) return json({ error: "Não autenticado" }, 401);
    return json({ ok: true, ...(await enviarBackup(admin, user.id, user.email ?? undefined, chave)) });
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
