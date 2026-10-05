-- Já aplicada via MCP. Receita agora tem forma de pagamento (só PIX): as que estavam sem forma passam a PIX (o primeiro PIX ativo de cada usuário).
update public.transacoes t
set metodo = (
  select case when coalesce(m.banco, '') = '' then 'PIX' else 'PIX ' || m.banco end
  from public.menu_itens m
  where m.user_id = t.user_id and m.tipo = 'Método' and m.metodo_kind in ('PIX', 'PIX/Débito') and m.status = 'Ativo'
  order by m.ordem nulls last, m.id limit 1
)
where t.tipo = 'entradas' and coalesce(t.metodo, '') = ''
  and exists (select 1 from public.menu_itens m where m.user_id = t.user_id and m.tipo = 'Método' and m.metodo_kind in ('PIX', 'PIX/Débito') and m.status = 'Ativo');
