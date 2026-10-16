-- "Não é desta recorrência": o usuário recusou a sugestão de vincular o lançamento a uma recorrência semanal (vale em todos os aparelhos).
alter table public.transacoes add column if not exists sugestao_rec_ok boolean not null default false;
