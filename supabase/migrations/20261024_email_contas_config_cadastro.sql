-- ⚙️ Configurações > E-mails: "Usar o mesmo e-mail do cadastro" (o e-mail do login, já confirmado pelo Google/link) e
-- cada Gmail monitorado pertence a uma conta só — senão o e-mail de conta poderia ir parar no app de outra pessoa.
alter table public.email_contas_config add column if not exists usar_cadastro boolean not null default false;
create unique index if not exists email_contas_config_email_unico on public.email_contas_config (lower(email)) where email <> '';
