-- Já aplicada via MCP. Mês de competência da recorrência em relação ao mês da data do lançamento: -1 anterior, 0 mesmo mês, 1 seguinte.
alter table public.recorrencias add column if not exists competencia_offset smallint not null default 0 check (competencia_offset between -1 and 1);
