-- Segredo do script do Gmail POR USUÁRIO (gerado em ⚙️ Configurações > E-mails): o bot sabe de quem é a conta pelo
-- segredo, e ninguém consegue mandar conta "em nome" do Gmail de outra pessoa. Só o hash (SHA-256, hex) fica no banco;
-- o segredo em si aparece uma vez na tela, para colar no script. O segredo antigo (único, app_cron_segredo
-- 'email_conta') continua aceito só no caminho antigo (Telegram vinculado).
alter table public.email_contas_config add column if not exists segredo_hash text;
create unique index if not exists email_contas_config_segredo_unico on public.email_contas_config (segredo_hash) where segredo_hash is not null;
