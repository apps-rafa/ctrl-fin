// Cards do dashboard (js/data.js:calcularResumoMes): pago x a pagar, fatura do cartão aberta/paga e estorno.
// Roda os scripts do app (globais, sem módulos) num contexto isolado, com "hoje" fixo.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function app(hoje) {
  const ctx = vm.createContext({ console, document: { getElementById: () => null, querySelector: () => null }, window: { supabase: { createClient: () => ({ from: () => ({}) }) } } });
  for (const f of ["config", "state", "recorrencia", "feriados", "menus-api", "data"]) {
    vm.runInContext(fs.readFileSync(new URL(`../js/${f}.js`, import.meta.url), "utf8"), ctx, { filename: `${f}.js` });
  }
  vm.runInContext(`hojeISO = () => ${JSON.stringify(hoje)};`, ctx);
  return ctx;
}

const NUBANK = { nome: "Crédito — Nubank", metodoKind: "Crédito", banco: "Nubank", diaVencimento: 20, diaFechamento: 13 };
const PIX = { nome: "PIX", metodoKind: "PIX", banco: null };
const lanc = (o) => ({ tipo: "saidas", data: "2026-10-05", valor: 100, metodo: "PIX", agendado: false, pendente: false, ...o });

/** Monta o estado do mês (outubro/2026) e devolve o resumo calculado. */
function resumo(hoje, { entradas = [], saidas = [], faturasPagas = [] }) {
  const ctx = app(hoje);
  ctx.__dados = { entradas, saidas, faturasPagas, metodos: [PIX, NUBANK] };
  return JSON.parse(vm.runInContext(`
    estadoApp.mesAtual = new Date(2026, 9, 1);
    estadoApp.menus = { metodos: __dados.metodos, metodosTodos: __dados.metodos };
    estadoApp.transacoes.entradas = __dados.entradas;
    estadoApp.transacoes.saidas = __dados.saidas;
    estadoApp.faturasPagas = new Map(__dados.faturasPagas); // Map criado dentro do contexto (instanceof)
    calcularResumoMes();
    JSON.stringify(estadoApp.resumo);
  `, ctx));
}

test("PIX: até hoje é pago; data futura é a pagar", () => {
  const r = resumo("2026-10-10", { saidas: [lanc({ valor: 300, data: "2026-10-05" }), lanc({ valor: 200, data: "2026-10-30" })] });
  assert.equal(r.saidas, 500);
  assert.equal(r.saidasAtual, 300);
  assert.equal(r.saidasAPagar, 200);
});

test("programado (agendado) só vira pago quando marcado, mesmo com a data passada", () => {
  const r = resumo("2026-10-10", { saidas: [lanc({ valor: 80, data: "2026-10-05", agendado: true })] });
  assert.equal(r.saidasAtual, 0);
  assert.equal(r.saidasAPagar, 80);
});

test("cartão: fatura em aberto antes do vencimento, paga depois dele", () => {
  const compras = [lanc({ valor: 1000, metodo: "Crédito Nubank", data: "2026-10-02" })];
  const antes = resumo("2026-10-10", { saidas: compras });
  assert.equal(antes.saidasFatura, 1000);
  assert.equal(antes.saidasAtual, 0);
  const depois = resumo("2026-10-21", { saidas: compras }); // vence 20/10 (terça)
  assert.equal(depois.saidasFatura, 0);
  assert.equal(depois.saidasPagoCredito, 1000);
});

test("cartão: marcação manual da fatura vale mais que o vencimento", () => {
  const compras = [lanc({ valor: 1000, metodo: "Crédito Nubank", data: "2026-10-02" })];
  const r = resumo("2026-10-10", { saidas: compras, faturasPagas: [["Crédito Nubank|2026-10-01", true]] });
  assert.equal(r.saidasPagoCredito, 1000);
  assert.equal(r.saidasFatura, 0);
});

test("compra de cartão com data futura ainda não entrou na fatura: conta como a pagar avulso", () => {
  const r = resumo("2026-10-10", { saidas: [lanc({ valor: 50, metodo: "Crédito Nubank", data: "2026-10-25" })] });
  assert.equal(r.saidasFatura, 0);
  assert.equal(r.saidasAvulsos, 50);
});

test("estorno no cartão abate a despesa e não entra como receita; balanço fecha", () => {
  const r = resumo("2026-10-10", {
    entradas: [{ tipo: "entradas", data: "2026-10-03", valor: 5000, metodo: "PIX", agendado: false },
      { tipo: "entradas", data: "2026-10-04", valor: 40, metodo: "Crédito Nubank", agendado: false }],
    saidas: [lanc({ valor: 300, metodo: "Crédito Nubank", data: "2026-10-02" }), lanc({ valor: 100 })],
  });
  assert.equal(r.entradas, 5000, "estorno não é receita");
  assert.equal(r.saidas, 360, "400 - 40 de estorno");
  assert.equal(r.balanco, 4640);
  assert.equal(r.saidasFatura, 260, "o estorno abate a fatura do cartão");
});
