import test from "node:test";
import assert from "node:assert/strict";
import { montarLembretes, diaVencimentoNoMes } from "../supabase/functions/telegram-webhook/lembretes.ts";

const HOJE = "2026-10-13";
const antes = "2026-10-01T15:00:00Z";           // criado antes de hoje
const hojeCriado = "2026-10-13T14:00:00Z";      // criado hoje (11h BRT)
const metodos = [
  { nome: "PIX", metodo_kind: "PIX", banco: null, dia_vencimento: null },
  { nome: "Crédito — Bradesco", metodo_kind: "Crédito", banco: "Bradesco", dia_vencimento: 13 },
  { nome: "Crédito — Nubank", metodo_kind: "Crédito", banco: "Nubank", dia_vencimento: 20 },
];
const tx = (o) => ({ id: 1, tipo: "saidas", data: HOJE, valor: 100, categoria: "Casa", descricao: "Condomínio", metodo: "PIX", competencia: "2026-10-01", quitada: false, origem: null, criado_em: antes, ...o });
const base = { userId: "u1", hojeISO: HOJE, metodos, faturasPagas: [], jaEnviados: new Set() };

test("despesa fora do cartão que vence hoje gera lembrete com os dados do lançamento", () => {
  const [l] = montarLembretes({ ...base, transacoes: [tx({})] });
  assert.match(l.texto, /Vence hoje/);
  assert.match(l.texto, /Condomínio/);
  assert.match(l.texto, /100,00/);
  assert.match(l.texto, /Categoria: Casa/);
  assert.match(l.texto, /Forma de pgto\.: PIX/);
  assert.match(l.texto, /Vencimento: 13\/10\/2026/);
  assert.equal(l.chave, "lembrete:u1:tx:1");
});

test("receita não gera lembrete; despesa de outro dia também não", () => {
  assert.equal(montarLembretes({ ...base, transacoes: [tx({ tipo: "entradas" }), tx({ id: 2, data: "2026-10-14" })] }).filter((l) => l.chave.includes(":tx:")).length, 0);
});

test("lançado hoje, quitado ou vindo do banco não geram lembrete", () => {
  const r = montarLembretes({ ...base, transacoes: [tx({ id: 3, criado_em: hojeCriado }), tx({ id: 4, quitada: true }), tx({ id: 5, origem: "pluggy" })] });
  assert.equal(r.filter((l) => l.chave.includes(":tx:")).length, 0);
});

test("compra no cartão NÃO lembra pela data da compra", () => {
  const r = montarLembretes({ ...base, transacoes: [tx({ id: 6, metodo: "Crédito Bradesco", competencia: "2026-11-01" })] });
  assert.equal(r.filter((l) => l.chave.includes(":tx:")).length, 0);
});

test("fatura do cartão lembra no dia do vencimento, com total (despesas - estornos) do mês", () => {
  const compras = [
    tx({ id: 10, data: "2026-09-15", valor: 300, metodo: "Crédito Bradesco" }),
    tx({ id: 11, data: "2026-09-20", valor: 200.5, metodo: "Crédito Bradesco" }),
    tx({ id: 12, tipo: "entradas", data: "2026-09-25", valor: 50.5, metodo: "Crédito Bradesco" }), // estorno
    tx({ id: 13, data: "2026-09-21", valor: 999, metodo: "Crédito Nubank" }), // outro cartão
  ];
  const r = montarLembretes({ ...base, transacoes: compras }).filter((l) => l.chave.includes(":fat:"));
  assert.equal(r.length, 1); // Nubank vence dia 20, hoje é 13
  assert.match(r[0].texto, /Fatura Crédito Bradesco/);
  assert.match(r[0].texto, /450,00/);
  assert.match(r[0].texto, /Out\/2026/);
  assert.match(r[0].texto, /3 lançamentos/);
  assert.equal(r[0].chave, "lembrete:u1:fat:Crédito Bradesco:2026-10-01");
});

test("fatura paga ou já lembrada não gera de novo", () => {
  const compras = [tx({ id: 10, valor: 300, metodo: "Crédito Bradesco" })];
  assert.equal(montarLembretes({ ...base, transacoes: compras, faturasPagas: [{ metodo: "Crédito Bradesco", competencia: "2026-10-01" }] }).length, 0);
  assert.equal(montarLembretes({ ...base, transacoes: compras, jaEnviados: new Set(["lembrete:u1:fat:Crédito Bradesco:2026-10-01"]) }).length, 0);
});

test("não repete lembrete de lançamento já enviado", () => {
  assert.equal(montarLembretes({ ...base, transacoes: [tx({})], jaEnviados: new Set(["lembrete:u1:tx:1"]) }).length, 0);
});

test("vencimento dia 31 em mês curto cai no último dia", () => {
  assert.equal(diaVencimentoNoMes(31, "2026-02-10"), 28);
  assert.equal(diaVencimentoNoMes(15, "2026-02-10"), 15);
});
