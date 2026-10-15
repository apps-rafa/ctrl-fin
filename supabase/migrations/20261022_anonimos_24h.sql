-- Contas de teste ("Testar sem cadastro", login anônimo) passam a valer 24 horas (antes: 7 dias).
-- Mesma função de 20261020_anonimos_validade.sql, agora por horas; a tarefa diária vira de hora em hora,
-- para ninguém passar muito das 24 h. A Demo não entra aqui: ela não grava nada no banco.
create or replace function public.apagar_anonimos_expirados_horas(p_horas int default 24)
returns int
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  ids uuid[];
begin
  select coalesce(array_agg(id), '{}') into ids
    from auth.users where is_anonymous and created_at < now() - make_interval(hours => p_horas);
  if array_length(ids, 1) is null then return 0; end if;

  delete from public.transacoes       where user_id = any(ids);
  delete from public.menu_itens       where user_id = any(ids);
  delete from public.faturas_pagas    where user_id = any(ids);
  delete from public.pluggy_faturas   where user_id = any(ids);
  delete from public.telegram_config  where user_id = any(ids);
  delete from public.telegram_ultimas where user_id = any(ids);
  delete from auth.users              where id = any(ids); -- o resto (recorrencias, lixeira, feriados...) vai em cascata
  return array_length(ids, 1);
end;
$$;

revoke all on function public.apagar_anonimos_expirados_horas(int) from public, anon, authenticated;

-- Troca a tarefa diária (7 dias) por uma de hora em hora (24 h)
select cron.unschedule('anonimos-expirados');
select cron.schedule('anonimos-expirados', '15 * * * *', $$select public.apagar_anonimos_expirados_horas(24)$$);
