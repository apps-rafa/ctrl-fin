-- Já aplicada via MCP. O upsert das ocorrências (ON CONFLICT recorrencia_id,data) não aceita índice parcial:
-- com o parcial a geração falhava em silêncio (criadas: 0). Índice completo: NULLs são distintos, então lançamentos comuns não conflitam.
drop index if exists public.transacoes_recorrencia_data_uq;
create unique index transacoes_recorrencia_data_uq on public.transacoes (recorrencia_id, data);
