-- Já aplicada via MCP. Início da ativação mais recente da recorrência (muda ao voltar de "Encerradas"):
-- o cartão da recorrência encerrada mostra o período dessa ativação (ativa_desde – encerrada_em).
alter table public.recorrencias add column if not exists ativa_desde date;
update public.recorrencias set ativa_desde = inicio where ativa_desde is null;
