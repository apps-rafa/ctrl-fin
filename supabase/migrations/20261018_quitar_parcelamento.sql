-- Quitar / desfazer a quitação de um parcelamento numa transação só (tudo ou nada). Antes o app mandava um UPDATE por
-- parcela: uma falha no meio deixava parte das parcelas zerada e parte com o valor antigo.
-- Mesmas regras de js/api.js (valorParcelaOriginal / quitarParcelamentoAPI):
--  quitar:   a parcela escolhida recebe o saldo (soma dos valores originais dela em diante); as seguintes zeram,
--            ficam quitadas e guardam o mês da quitação.
--  desfazer: todas as parcelas do grupo voltam ao valor original (centavos distribuídos nas primeiras).
-- security invoker: roda com as permissões de quem chama (o RLS de transacoes continua valendo).
create or replace function public.quitar_parcelamento(p_id bigint, p_quitar boolean)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  alvo record;
  n int;
  cent bigint;
  base bigint;
  resto bigint;
  saldo numeric(12,2);
begin
  select grupo_id, competencia, parcela_num, parcelas_total, valor_total, tipo_recorrencia
    into alvo from transacoes where id = p_id;
  if not found then raise exception 'Lançamento não encontrado'; end if;
  if alvo.grupo_id is null or alvo.tipo_recorrencia <> 'Parcelada' then raise exception 'Não é um parcelamento'; end if;

  n := coalesce(alvo.parcelas_total, (select count(*) from transacoes where grupo_id = alvo.grupo_id));
  cent := round(alvo.valor_total * 100);
  base := floor(cent / n);
  resto := cent - base * n;

  if p_quitar then
    select coalesce(sum((base + case when parcela_num - 1 < resto then 1 else 0 end) / 100.0), 0) into saldo
      from transacoes where grupo_id = alvo.grupo_id and parcela_num >= alvo.parcela_num;
    update transacoes set valor = saldo, quitada = false, quitado_em = alvo.competencia
      where grupo_id = alvo.grupo_id and parcela_num = alvo.parcela_num;
    update transacoes set valor = 0, quitada = true, quitado_em = alvo.competencia
      where grupo_id = alvo.grupo_id and parcela_num > alvo.parcela_num;
  else
    update transacoes
      set valor = (base + case when parcela_num - 1 < resto then 1 else 0 end) / 100.0, quitada = false, quitado_em = null
      where grupo_id = alvo.grupo_id;
  end if;
end;
$$;

grant execute on function public.quitar_parcelamento(bigint, boolean) to authenticated;
