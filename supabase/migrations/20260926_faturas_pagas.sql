-- Faturas de cartão marcadas como pagas (linha virtual em "A pagar")
create table if not exists public.faturas_pagas (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid(),
  metodo text not null,
  competencia date not null,
  pago_em timestamptz not null default now(),
  unique (user_id, metodo, competencia)
);
alter table public.faturas_pagas enable row level security;
create policy "faturas_pagas_dono" on public.faturas_pagas
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
