-- Já aplicada via MCP. Recorrência mensal "Variável": a ocorrência não tem dia definido (mostra --/mês) até o usuário escolher a data.
alter table public.transacoes add column if not exists data_indefinida boolean not null default false;
