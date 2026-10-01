// Backup completo (lançamentos e menus) enviado como arquivo .json no Telegram.

import type { createClient } from "npm:@supabase/supabase-js@2";
import { TELEGRAM_API } from "./util.ts";
import { hojeBrasiliaISO } from "./parser.ts";

/** Backup completo (lançamentos e menus) mandado como arquivo .json no Telegram. */
export async function executarBackup(
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
