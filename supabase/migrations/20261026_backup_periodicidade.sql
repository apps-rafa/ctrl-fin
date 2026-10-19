-- Periodicidade do backup por e-mail (Configurações > E-mails). O agendamento passa a rodar todo dia 11:00 UTC (08:00 em Brasília)
-- e a função enviar-backup só manda para quem está "no prazo": nunca | semanal | mensal | bimestral | trimestral | semestral.
-- Padrão 'mensal' mantém o comportamento anterior (antes: todo dia 1).
alter table public.email_contas_config add column if not exists backup_periodicidade text not null default 'mensal'
  check (backup_periodicidade in ('nunca','semanal','mensal','bimestral','trimestral','semestral'));
alter table public.email_contas_config add column if not exists backup_enviado_em date;

select cron.unschedule('backup-email-mensal');
select cron.schedule('backup-email', '0 11 * * *', $$
  select net.http_post(url := 'https://hhmuqgkabknquvhxafmf.supabase.co/functions/v1/enviar-backup',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select valor from public.app_cron_segredo where nome='tarefas')),
    body := '{}'::jsonb);
$$);
