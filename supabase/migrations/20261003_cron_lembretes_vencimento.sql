-- Lembrete diário (09:00 de Brasília = 12:00 UTC) de despesas e faturas que vencem no dia. Já aplicada via MCP.
select cron.schedule('lembretes-vencimento', '0 12 * * *', $$
  select net.http_post(url := 'https://hhmuqgkabknquvhxafmf.supabase.co/functions/v1/telegram-webhook',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select valor from public.app_cron_segredo where nome='tarefas')),
    body := '{"tarefa":"lembretes"}'::jsonb);
$$);
