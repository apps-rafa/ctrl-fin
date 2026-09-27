-- Credencial PRÓPRIA da Pluggy por usuário (Configurações > Open Finance >
-- Dados cadastrais) — no plano gratuito da Pluggy só dá pra conectar contas
-- do MESMO titular da conta de desenvolvedor; com uma chave só (a do dono
-- do app), amigos não conseguiam conectar o banco deles de verdade. Cada
-- usuário pode cadastrar a própria client_id/client_secret (gerada na conta
-- Pluggy dele) pra conectar as próprias contas sem esbarrar nisso; sem
-- cadastrar nada, as Edge Functions caem pros secrets globais
-- (PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET) como até agora.
create table if not exists public.pluggy_credenciais (
  user_id        uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  client_id      text not null,
  client_secret  text not null,
  atualizado_em  timestamptz not null default now()
);

alter table public.pluggy_credenciais enable row level security;

create policy "own pluggy_credenciais" on public.pluggy_credenciais for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
