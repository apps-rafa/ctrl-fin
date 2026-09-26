-- Forma de pagamento padrão do bot (/pgtopadrao)
create table if not exists public.telegram_config (
  user_id uuid primary key,
  metodo_padrao text
);
alter table public.telegram_config enable row level security;
