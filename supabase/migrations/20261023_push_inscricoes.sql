-- Notificação no aparelho (Web Push) para quem não usa o Telegram: cada aparelho que liga as notificações em
-- ⚙️ Configurações > Notificações grava aqui a sua inscrição. Quem envia é a função (service role, _shared/webpush.ts).
-- A chave privada VAPID fica em app_cron_segredo (nome 'vapid_jwk'), criada à parte, fora do repositório.
create table if not exists public.push_inscricoes (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  aparelho text not null default '',
  criado_em timestamptz not null default now()
);
create index if not exists push_inscricoes_user_idx on public.push_inscricoes(user_id);
alter table public.push_inscricoes enable row level security;
drop policy if exists "push_inscricoes_dono" on public.push_inscricoes;
create policy "push_inscricoes_dono" on public.push_inscricoes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
