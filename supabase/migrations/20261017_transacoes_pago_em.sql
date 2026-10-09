-- Dia em que o lançamento programado foi marcado como "Pago"/"Recebido" (no checkbox do app ou no botão do lembrete do Telegram).
-- Enquanto for hoje, o checkbox segue marcado (desmarcar reverte: agendado volta a true e pago_em a null); no dia seguinte some.
alter table public.transacoes add column if not exists pago_em date;
