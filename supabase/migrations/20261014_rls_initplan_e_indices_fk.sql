-- Já aplicada via MCP. RLS: auth.uid() virou (select auth.uid()) — avaliado UMA vez por consulta, não por linha (mesma regra: só o dono
-- vê/altera). Mais índices nas chaves estrangeiras consultadas. Ver advisors "auth_rls_initplan" e "unindexed_foreign_keys".
alter policy "faturas_pagas_dono" on public.faturas_pagas using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy "feriados_delete_own" on public.feriados using ((user_id = (select auth.uid())));
alter policy "feriados_insert_own" on public.feriados with check ((user_id = (select auth.uid())));
alter policy "feriados_select_own" on public.feriados using ((user_id = (select auth.uid())));
alter policy "feriados_update_own" on public.feriados using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy "lixeira_delete_own" on public.lixeira using ((user_id = (select auth.uid())));
alter policy "lixeira_insert_own" on public.lixeira with check ((user_id = (select auth.uid())));
alter policy "lixeira_select_own" on public.lixeira using ((user_id = (select auth.uid())));
alter policy "own menu_itens" on public.menu_itens using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy "own orcamentos" on public.orcamentos using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy "own pluggy_contas" on public.pluggy_contas using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy "own pluggy_credenciais" on public.pluggy_credenciais using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy "own pluggy_faturas" on public.pluggy_faturas using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy "recorrencias_dono" on public.recorrencias using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy "own telegram_link_codes" on public.telegram_link_codes using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy "own telegram_users" on public.telegram_users using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy "own transacoes" on public.transacoes using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy "own transacoes_importadas" on public.transacoes_importadas using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
create index if not exists recorrencias_user_id_idx on public.recorrencias (user_id);
create index if not exists transacoes_importadas_conta_id_idx on public.transacoes_importadas (conta_id);
create index if not exists pluggy_faturas_conta_id_idx on public.pluggy_faturas (conta_id);
create index if not exists telegram_rascunhos_user_id_idx on public.telegram_rascunhos (user_id);
