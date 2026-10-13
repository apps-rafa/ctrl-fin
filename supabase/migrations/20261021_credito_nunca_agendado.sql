-- Compra no cartão de crédito cai na fatura sozinha: nunca é "programada" (agendado), que espera um "Pago" manual —
-- e o checkbox "Pago" nem aparece no cartão, então ela ficava presa em "A pagar" depois da data. Com agendado=false,
-- a data decide: até hoje vai para a fatura; futura segue em "A pagar" até o dia chegar.
create or replace function public.transacoes_credito_sem_agendado()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.agendado and new.metodo is not null and exists (
    select 1 from public.menu_itens m
    where m.user_id = new.user_id and m.tipo = 'Método' and m.metodo_kind = 'Crédito' and 'Crédito ' || m.banco = new.metodo
  ) then
    new.agendado := false;
  end if;
  return new;
end $$;

drop trigger if exists trg_credito_sem_agendado on public.transacoes;
create trigger trg_credito_sem_agendado before insert or update of agendado, metodo on public.transacoes
  for each row execute function public.transacoes_credito_sem_agendado();

update public.transacoes t set agendado = false
where t.agendado and exists (
  select 1 from public.menu_itens m
  where m.user_id = t.user_id and m.tipo = 'Método' and m.metodo_kind = 'Crédito' and 'Crédito ' || m.banco = t.metodo
);
