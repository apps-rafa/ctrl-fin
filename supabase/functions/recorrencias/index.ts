// Edge Function: recorrencias
//
// Chamada pelo app (usuário logado) logo depois de criar/editar/reativar uma recorrência e ao abrir o app:
// materializa em `transacoes` as ocorrências que faltam (ver _shared/ocorrencias.ts). A mesma geração roda
// todo dia, para todos os usuários, pela tarefa agendada "recorrencias" do telegram-webhook.

import { createClient } from "npm:@supabase/supabase-js@2";
import { gerarOcorrencias } from "../_shared/ocorrencias.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não suportado" }, 405);
  try {
    const cliente = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: { user }, error: authError } = await cliente.auth.getUser();
    if (authError || !user) return json({ error: "Não autenticado" }, 401);
    const hoje = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10); // data em Brasília
    const criadas = await gerarOcorrencias(cliente, hoje, user.id);
    return json({ ok: true, criadas });
  } catch (e) {
    console.error(e);
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
