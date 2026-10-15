-- E-mails de contas saem do formulário de Recorrências e ganham página própria em ⚙️ Configurações > E-mails:
-- o Gmail monitorado (email_contas_config) e os vínculos "remetente e/ou palavra do assunto -> recorrência"
-- (email_contas_vinculos). Os termos que já estavam em recorrencias.remetentes viram vínculos (com "@" = remetente,
-- sem "@" = palavra do assunto). A coluna antiga fica no banco, sem uso, só como cópia de segurança.
create table if not exists public.email_contas_config (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  email text not null default '',
  atualizado_em timestamptz not null default now()
);
create table if not exists public.email_contas_vinculos (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  remetente text not null default '',
  palavra text not null default '',
  recorrencia_id bigint not null references public.recorrencias(id) on delete cascade,
  criado_em timestamptz not null default now(),
  constraint email_contas_vinculos_algum_termo check (remetente <> '' or palavra <> '')
);
create index if not exists email_contas_vinculos_user_idx on public.email_contas_vinculos(user_id);
create index if not exists email_contas_vinculos_rec_idx on public.email_contas_vinculos(recorrencia_id);

alter table public.email_contas_config enable row level security;
alter table public.email_contas_vinculos enable row level security;
drop policy if exists "email_contas_config_dono" on public.email_contas_config;
create policy "email_contas_config_dono" on public.email_contas_config for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "email_contas_vinculos_dono" on public.email_contas_vinculos;
create policy "email_contas_vinculos_dono" on public.email_contas_vinculos for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid())
    and exists (select 1 from public.recorrencias r where r.id = recorrencia_id and r.user_id = (select auth.uid())));

-- Migra recorrencias.remetentes (só uma vez: pula quem já tem vínculos)
insert into public.email_contas_vinculos (user_id, remetente, palavra, recorrencia_id)
select r.user_id,
       case when t.termo like '%@%' then t.termo else '' end,
       case when t.termo like '%@%' then '' else t.termo end,
       r.id
from public.recorrencias r
cross join lateral (
  select distinct lower(btrim(x)) as termo from regexp_split_to_table(r.remetentes, '[,;\n]') as x
) t
where t.termo <> ''
  and not exists (select 1 from public.email_contas_vinculos v where v.user_id = r.user_id);
