-- Recorrências: cadastro separado; as ocorrências são lançamentos reais em transacoes (a_confirmar até o usuário decidir).
-- Já aplicada via MCP. Geração: função `recorrencias` (app) e tarefa agendada diária abaixo (10:00 UTC = 07:00 em Brasília).
create table if not exists public.recorrencias (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('entradas','saidas')),
  frequencia text not null check (frequencia in ('mensal','semanal')),
  dia_semana smallint check (dia_semana between 0 and 6),
  dia_mes smallint check (dia_mes between 1 and 31),
  valor numeric(12,2) not null check (valor > 0),
  meses integer check (meses > 1),
  metodo text not null,
  categoria text not null,
  descricao text not null default '',
  inicio date not null default current_date,
  status text not null default 'ativa' check (status in ('ativa','encerrada')),
  encerrada_em date,
  gerado_ate date,
  criado_em timestamptz not null default now()
);
alter table public.recorrencias enable row level security;
create policy "recorrencias_dono" on public.recorrencias for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
alter table public.transacoes
  add column if not exists recorrencia_id bigint references public.recorrencias(id) on delete set null,
  add column if not exists a_confirmar boolean not null default false;
create index if not exists transacoes_recorrencia_idx on public.transacoes (recorrencia_id) where recorrencia_id is not null;
create unique index if not exists transacoes_recorrencia_data_uq on public.transacoes (recorrencia_id, data) where recorrencia_id is not null;

select cron.schedule('recorrencias-gerar', '0 10 * * *', $$
  select net.http_post(url := 'https://hhmuqgkabknquvhxafmf.supabase.co/functions/v1/telegram-webhook',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select valor from public.app_cron_segredo where nome='tarefas')),
    body := '{"tarefa":"recorrencias"}'::jsonb);
$$);
