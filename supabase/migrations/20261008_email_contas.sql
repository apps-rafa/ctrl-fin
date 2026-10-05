-- Já aplicada via MCP. E-mail de conta (Gmail -> Apps Script -> telegram-webhook): remetente(s) da recorrência, e-mails já processados.
alter table public.recorrencias add column if not exists remetentes text not null default '';
create table if not exists public.emails_processados (
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id text not null,
  remetente text,
  assunto text,
  status text not null default 'recebido',
  recorrencia_id bigint,
  transacao_id bigint,
  criado_em timestamptz not null default now(),
  primary key (user_id, message_id)
);
alter table public.emails_processados enable row level security; -- sem policies: só a função (service role) lê/grava
-- segredo do endpoint (app_cron_segredo, nome 'email_conta') criado à parte, fora do repositório
