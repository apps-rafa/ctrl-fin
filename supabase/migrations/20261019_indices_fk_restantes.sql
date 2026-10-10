-- Índices das chaves estrangeiras que o advisor de performance do Supabase apontou sem índice (apagar/atualizar a linha
-- referenciada fazia varredura completa da tabela filha).
create index if not exists pluggy_contas_metodo_id_idx on public.pluggy_contas (metodo_id);
create index if not exists telegram_link_codes_user_id_idx on public.telegram_link_codes (user_id);
create index if not exists transacoes_importadas_metodo_sugerido_idx on public.transacoes_importadas (metodo_sugerido);
create index if not exists transacoes_importadas_transacao_id_idx on public.transacoes_importadas (transacao_id);
