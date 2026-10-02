-- Duplicata aprovada passa a valer em todos os dispositivos (antes ficava só no localStorage do navegador)
alter table public.transacoes add column if not exists duplicata_ok boolean not null default false;
