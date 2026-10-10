-- Contas de teste ("Testar sem cadastro", login anônimo) valem 7 dias: depois disso a conta e TODOS os dados dela são
-- apagados por uma tarefa diária. As tabelas sem chave estrangeira para auth.users (transacoes, menu_itens...) são
-- limpas explicitamente; as demais caem junto por "on delete cascade" ao apagar o usuário.
-- security definer: só o banco (pg_cron) chama; ninguém de fora tem permissão de executar.
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
  delete from public.pluggy_faturas   where user_id = any(ids);
  delete from public.telegram_config  where user_id = any(ids);
  delete from public.telegram_ultimas where user_id = any(ids);
  delete from auth.users              where id = any(ids); -- o resto (recorrencias, lixeira, feriados...) vai em cascata
  return array_length(ids, 1);
end;
$$;

revoke all on function public.apagar_anonimos_expirados(int) from public, anon, authenticated;

-- Todo dia às 03:00 de Brasília (06:00 UTC)
select cron.schedule('anonimos-expirados', '0 6 * * *', $$select public.apagar_anonimos_expirados(7)$$);
