-- Valor da última ocorrência confirmada de cada recorrência (e a data dela). A geração diária solta da recorrência as
-- ocorrências confirmadas que já passaram (recorrencia_id = nulo); sem isto, o "último valor confirmado vira a referência
-- do mês seguinte" nunca era encontrado. Gravado por _shared/ocorrencias.ts no momento em que a ocorrência é solta.
alter table public.recorrencias
  add column if not exists valor_referencia numeric(12,2),
  add column if not exists valor_referencia_data date;

-- Preenche com a última ocorrência confirmada que ainda aponta para a recorrência (as já soltas não têm mais vínculo).
update public.recorrencias r
set valor_referencia = t.valor, valor_referencia_data = t.data
from (
  select distinct on (recorrencia_id) recorrencia_id, valor, data
  from public.transacoes
  where recorrencia_id is not null and not a_confirmar
  order by recorrencia_id, data desc
) t
where t.recorrencia_id = r.id and r.valor_referencia is null;
