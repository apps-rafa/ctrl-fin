-- Já aplicada via MCP. Lançamento programado (data futura): o "Pago"/"Recebido" aparece a partir do dia programado (data variável: sempre) e some ao marcar.
alter table public.transacoes add column if not exists agendado boolean not null default false;
update public.transacoes set agendado = true
where data > (now() at time zone 'America/Sao_Paulo')::date
   or data_indefinida
   or (recorrencia_id is not null and data >= (now() at time zone 'America/Sao_Paulo')::date);
