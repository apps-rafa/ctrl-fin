// Testes das funções puras do bot (supabase/functions/telegram-webhook/parser.ts).
// Rodar: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import {
  extrairData, interpretarValorETipo, interpretarSmsCartao, competenciaDe, addMeses,
  limparLinks, sugerirCategoriaTexto, detectarMetodoNoTexto,
} from "../supabase/functions/telegram-webhook/parser.ts";

const HOJE = "2026-10-01";

test("extrairData: palavras relativas", () => {
  assert.equal(extrairData("uber ontem", HOJE).data, "2026-09-30");
  assert.equal(extrairData("anteontem uber", HOJE).data, "2026-09-29");
  assert.equal(extrairData("hoje uber", HOJE).data, HOJE);
});

test("extrairData: dd/mm, dd/mm/aaaa e 'dia N'", () => {
  assert.equal(extrairData("25/09 uber", HOJE).data, "2026-09-25");
  assert.equal(extrairData("25/09/2025 uber", HOJE).data, "2025-09-25");
  assert.equal(extrairData("25 de setembro uber", HOJE).data, "2026-09-25");
  assert.equal(extrairData("dia 25 uber", HOJE).data, "2026-09-25"); // 25 > hoje(1): mês anterior
  assert.equal(extrairData("31/02 uber", HOJE).data, null); // data impossível
  assert.equal(extrairData("sem data", HOJE).data, null);
});

test("extrairData: remove a data do texto", () => {
  assert.equal(extrairData("ontem uber 10 reais", HOJE).resto, "uber 10 reais");
});

test("interpretarValorETipo: despesa e receita", () => {
  const d = interpretarValorETipo("gastei 35,90 no mercado");
  assert.equal(d.valor, 35.9);
  assert.equal(d.tipo, "saidas");
  const r = interpretarValorETipo("recebi 200 de salário");
  assert.equal(r.valor, 200);
  assert.equal(r.tipo, "entradas");
});

test("interpretarValorETipo: milhar e parcelas", () => {
  const p = interpretarValorETipo("comprei um carro de 80.000 parcelado em 10x");
  assert.equal(p.valor, 80000);
  assert.equal(p.parcelas, 10);
  assert.equal(interpretarValorETipo("sem valor nenhum"), null);
});

test("interpretarSmsCartao: loja física e compra online", () => {
  const fisica = interpretarSmsCartao(
    "BRADESCO CARTOES: COMPRA APROVADA NO CARTAO FINAL 1525 EM 26/09/2026 15:30. VALOR DE R$ 175,05 ASSAI ATACADISTA         RIO DE JANEI.");
  assert.equal(fisica.valor, 175.05);
  assert.equal(fisica.data, "2026-09-26");
  assert.equal(fisica.estabelecimento, "ASSAI ATACADISTA");
  const online = interpretarSmsCartao(
    "BRADESCO CARTOES: COMPRA APROVADA NO CARTAO FINAL 1525 EM 26/09/2026 15:30. VALOR DE R$ 20,00 DL          *UBER RIDES   SAO PAULO.");
  assert.equal(online.estabelecimento, "UBER RIDES");
  assert.equal(interpretarSmsCartao("texto qualquer"), null);
});

test("competenciaDe: fechamento do cartão empurra pro mês seguinte", () => {
  assert.equal(competenciaDe("2026-10-01", null), "2026-10-01");
  assert.equal(competenciaDe("2026-10-04", 5), "2026-10-01");
  assert.equal(competenciaDe("2026-10-05", 5), "2026-11-01");
  assert.equal(competenciaDe("2026-12-20", 15), "2027-01-01"); // vira o ano
});

test("addMeses: limita ao último dia do mês", () => {
  assert.equal(addMeses("2026-01-31", 1), "2026-02-28");
  assert.equal(addMeses("2026-11-15", 3), "2027-02-15");
});

test("limparLinks: endereço de site vira só o nome", () => {
  assert.equal(limparLinks("Apple.com/bill"), "Apple");
  assert.equal(limparLinks("mercadolivre.com.br pedido"), "Mercadolivre pedido");
  assert.equal(limparLinks("R$ 1.234,56 Uber"), "R$ 1.234,56 Uber");
});

test("sugerirCategoriaTexto: palavra-chave e fallback", () => {
  const cats = [
    { nome: "Mercado", categoria_tipo: "saidas" },
    { nome: "Outros", categoria_tipo: "saidas" },
    { nome: "Salário", categoria_tipo: "entradas" },
  ];
  assert.equal(sugerirCategoriaTexto("gastei 10 no supermercado", "saidas", cats).nome, "Mercado");
  assert.equal(sugerirCategoriaTexto("coisa estranha", "saidas", cats).nome, "Outros");
  assert.equal(sugerirCategoriaTexto("recebi salário", "entradas", cats).nome, "Salário");
});

test("detectarMetodoNoTexto: tipo e banco", () => {
  const lista = [
    { nome: "PIX", metodo_kind: "PIX", banco: null, dia_fechamento: null },
    { nome: "Crédito — Nubank", metodo_kind: "Crédito", banco: "Nubank", dia_fechamento: 5 },
  ];
  assert.equal(detectarMetodoNoTexto("uber 10 no pix", lista).metodo_kind, "PIX");
  assert.equal(detectarMetodoNoTexto("uber 10 no nubank", lista).banco, "Nubank");
  assert.equal(detectarMetodoNoTexto("uber 10", lista), null);
});
