-- Já aplicada via MCP. Aviso "já existe lançamento parecido, é o mesmo?": o e-mail fica 'aguardando' (dados em pendente) até a decisão pelos botões do bot.
alter table public.emails_processados add column if not exists pendente jsonb;
alter table public.emails_processados add column if not exists seq bigserial;
create unique index if not exists emails_processados_seq_uq on public.emails_processados (seq);
