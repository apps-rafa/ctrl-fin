-- Já aplicada via MCP. Ocorrências de recorrência SEMANAL (mesmo valor/forma/descrição várias vezes no mês) nunca são duplicatas:
-- a geração passa a gravar duplicata_ok=true nelas; esta migração marca as que já existiam.
update public.transacoes set duplicata_ok = true
where recorrencia_id in (select id from public.recorrencias where frequencia = 'semanal');
