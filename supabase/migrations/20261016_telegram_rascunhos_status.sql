-- Rascunho do bot descartado ("Cancelar") não é apagado: fica recuperável com o botão "Resgatar" (pendente <-> descartado).
-- mensagem_id = a mensagem do rascunho no Telegram (é nela que o Cancelar vira Resgatar); editando_em = quando o ✏️ Editar foi tocado
-- (o "❌ Cancelar edição" do teclado descarta o rascunho que está em edição).
alter table public.telegram_rascunhos
  add column if not exists status text not null default 'pendente' check (status in ('pendente', 'descartado')),
  add column if not exists mensagem_id bigint,
  add column if not exists editando_em timestamptz;
