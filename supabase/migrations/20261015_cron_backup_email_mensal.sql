-- Backup por e-mail (Resend) todo dia 1 às 11:00 UTC (08:00 em Brasília). Função: supabase/functions/enviar-backup.
select cron.schedule('backup-email-mensal', '0 11 1 * *', $$
  select net.http_post(url := 'https://hhmuqgkabknquvhxafmf.supabase.co/functions/v1/enviar-backup',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select valor from public.app_cron_segredo where nome='tarefas')),
    body := '{}'::jsonb);
$$);
