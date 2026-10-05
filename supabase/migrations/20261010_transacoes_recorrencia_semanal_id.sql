-- Já aplicada via MCP. Ocorrências de recorrência SEMANAL ficam agrupadas (com o total) na lista, mesmo depois de confirmadas e soltas da recorrência.
alter table public.transacoes add column if not exists recorrencia_semanal_id bigint;
update public.transacoes set recorrencia_semanal_id = recorrencia_id
where recorrencia_semanal_id is null and recorrencia_id in (select id from public.recorrencias where frequencia = 'semanal');
