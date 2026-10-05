// E-mail de conta -> recorrência: valor/vencimento do texto, vínculo pelo remetente e escolha da ocorrência.
import test from "node:test";
import assert from "node:assert/strict";
import { extrairDadosConta, recorrenciaDoEmail, recorrenciaPorPalavras, escolherOcorrencia } from "../supabase/functions/telegram-webhook/email.ts";

const HOJE = "2026-10-04";

test("valor logo depois de 'valor total' / 'total a pagar' e vencimento", () => {
  const d = extrairDadosConta("Sua fatura de outubro. Valor total: R$ 1.234,56  Vencimento: 15/10/2026. Juros após o vencimento R$ 12,00", HOJE);
  assert.equal(d.valor, 1234.56);
  assert.equal(d.vencimento, "2026-10-15");
});
test("rótulo mais específico vence ('total a pagar' antes de 'valor')", () => {
  const d = extrairDadosConta("Valor do consumo R$ 100,00 Taxa R$ 5,00 Total a pagar R$ 105,00 vence em 20/10", HOJE);
  assert.equal(d.valor, 105);
  assert.equal(d.vencimento, "2026-10-20"); // sem ano: ano de hoje
});
test("um único R$ no texto vale como o valor", () => {
  assert.equal(extrairDadosConta("Olá! Sua conta chegou: R$ 99,90. Pague até 10/11/26.", HOJE).valor, 99.9);
  assert.equal(extrairDadosConta("Olá! Sua conta chegou: R$ 99,90. Pague até 10/11/26.", HOJE).vencimento, null); // sem a palavra "vencimento"
});
test("sem valor no texto (só PDF): null — o chamador mantém o valor do mês anterior", () => {
  const d = extrairDadosConta("Sua fatura está disponível em anexo. Vencimento 05/11/2026", HOJE);
  assert.equal(d.valor, null);
  assert.equal(d.vencimento, "2026-11-05");
});
test("vários valores sem rótulo: não chuta", () => {
  assert.equal(extrairDadosConta("Item A R$ 10,00 e item B R$ 20,00", HOJE).valor, null);
});

const recs = [
  { id: 3, descricao: "Condomínio", categoria: "Casa", remetentes: "gestaoacpl@paulolucio.com.br" },
  { id: 4, descricao: "Internet Predial", categoria: "Casa", remetentes: "fatura@faturapredialnet.com.br" },
  { id: 6, descricao: "Gás Naturgy", categoria: "Casa", remetentes: "conta.inteligente@naturgy.com, naturgy" },
  { id: 12, descricao: "Luz Light", categoria: "Casa", remetentes: "faturadigital@lightvirtual.com.br" },
];
test("vínculo pelo remetente (com nome na frente, caixa e acento ignorados)", () => {
  assert.equal(recorrenciaDoEmail(recs, "ACPL <GestaoACPL@paulolucio.com.br> via sendgrid.net", "Boleto").id, 3);
  assert.equal(recorrenciaDoEmail(recs, "Light <faturadigital@lightvirtual.com.br>", "Sua fatura Light").id, 12);
  assert.equal(recorrenciaDoEmail(recs, "x@y.com", "Sua conta NATURGY chegou").id, 6); // palavra no assunto
  assert.equal(recorrenciaDoEmail(recs, "promo@loja.com", "Oferta"), null);
});

const oc = (id, data) => ({ id, data, valor: 100 });
test("escolhe a ocorrência mais próxima do vencimento (até 25 dias)", () => {
  const ocs = [oc(1, "2026-10-05"), oc(2, "2026-11-05"), oc(3, "2026-12-05")];
  assert.equal(escolherOcorrencia(ocs, "2026-11-08", HOJE).id, 2);
  assert.equal(escolherOcorrencia(ocs, "2027-03-01", HOJE), null);
});
test("sem vencimento: a primeira de hoje (ou até 10 dias atrás) em diante", () => {
  const ocs = [oc(1, "2026-09-01"), oc(2, "2026-09-28"), oc(3, "2026-10-05"), oc(4, "2026-11-05")];
  assert.equal(escolherOcorrencia(ocs, null, HOJE).id, 2); // 28/09 está dentro dos 10 dias
  assert.equal(escolherOcorrencia([oc(1, "2026-08-01")], null, HOJE), null);
});

test("sem remetente cadastrado: acha a recorrência pelas palavras da descrição", () => {
  const semRem = recs.map((r) => ({ ...r, remetentes: "" }));
  assert.equal(recorrenciaPorPalavras(semRem, "Condomínio Central <avisos@x.com>", "Lembrete: vencimento do condomínio", "").id, 3);
  assert.equal(recorrenciaPorPalavras(semRem, "faturadigital@lightvirtual.com.br", "Sua fatura", "Light Serviços de Eletricidade").id, 12);
  assert.equal(recorrenciaPorPalavras(semRem, "promo@loja.com", "Oferta imperdível", ""), null);
  // palavra só no corpo (1 ponto) não basta
  assert.equal(recorrenciaPorPalavras(semRem, "x@y.com", "Aviso", "condominio"), null);
});
