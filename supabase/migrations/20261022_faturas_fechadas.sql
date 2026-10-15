-- Fechamento manual da fatura do cartão (checkbox "Fatura fechada" no subgrupo da fatura, aba Despesas).
-- fechada=true: compras nesse cartão com data a partir de fechada_em vão para a fatura seguinte (app, bot e Pluggy).
-- fechada=false: o usuário desmarcou uma fatura que o dia de fechamento do cartão tinha fechado sozinha.
-- Sem linha: vale o dia de fechamento cadastrado (opcional) no método (menu_itens.dia_fechamento).
create table if not exists public.faturas_fechadas (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid(),
  metodo text not null,
  competencia date not null,
  fechada boolean not null default true,
  fechada_em timestamptz not null default now(),
  automatico boolean not null default false,
  unique (user_id, metodo, competencia)
);
alter table public.faturas_fechadas enable row level security;
create policy "faturas_fechadas_dono" on public.faturas_fechadas
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Contas de teste expiradas: apaga também os fechamentos (sem FK para auth.users)
create or replace function public.apagar_anonimos_expirados(p_dias int default 7)
returns int
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  ids uuid[];
begin
  select coalesce(array_agg(id), '{}') into ids
    from auth.users where is_anonymous and created_at < now() - make_interval(days => p_dias);
  if array_length(ids, 1) is null then return 0; end if;

  delete from public.transacoes       where user_id = any(ids);
  delete from public.menu_itens       where user_id = any(ids);
  delete from public.faturas_pagas    where user_id = any(ids);
  delete from public.faturas_fechadas where user_id = any(ids);
  delete from public.pluggy_faturas   where user_id = any(ids);
  delete from public.telegram_config  where user_id = any(ids);
  delete from public.telegram_ultimas where user_id = any(ids);
  delete from auth.users              where id = any(ids); -- o resto (recorrencias, lixeira, feriados...) vai em cascata
  return array_length(ids, 1);
end;
$$;

revoke all on function public.apagar_anonimos_expirados(int) from public, anon, authenticated;
