// Regras do lançamento "programado" (checkbox Pago/Recebido), da recorrência mensal "Variável" (data indefinida)
// e da busca única de lançamentos parecidos (bot, e-mail e Pluggy).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { datasDaRecorrencia, ocorrenciasDaRecorrencia } from "../supabase/functions/_shared/ocorrencias.ts";
import { analisarParecidos, textoParecidos, tecladoParecidos } from "../supabase/functions/_shared/parecidos.ts";

const ctx = vm.createContext({ console });
vm.runInContext(fs.readFileSync(new URL("../js/recorrencia.js", import.meta.url), "utf8"), ctx);
const mostra = ctx.deveMostrarPagoRecebido;

test("checkbox: só programado, a partir do dia; marcado (agendado=false) some", () => {
  const t = { agendado: true, aConfirmar: false, data: "2026-10-20" };
  assert.equal(mostra(t, "2026-10-19"), false, "antes do dia programado não aparece");
  assert.equal(mostra(t, "2026-10-20"), true, "no dia aparece");
  assert.equal(mostra(t, "2026-10-25"), true, "depois do dia segue até marcar");
  assert.equal(mostra({ ...t, agendado: false }, "2026-10-25"), false, "marcado: some");
});

test("checkbox: data variável aparece sempre; exceções (rascunho, crédito, parcela, estorno)", () => {
  const v = { agendado: true, aConfirmar: false, data: "2026-10-31", dataIndefinida: true };
  assert.equal(mostra(v, "2026-10-01"), true);
  assert.equal(mostra({ ...v, aConfirmar: true }, "2026-10-31"), false);
  assert.equal(mostra(v, "2026-10-31", { credito: true }), false);
  assert.equal(mostra(v, "2026-10-31", { parcela: true }), false);
  assert.equal(mostra(v, "2026-10-31", { estorno: true }), false);
});

const base = { id: 1, user_id: "u", tipo: "saidas", valor: 100, metodo: "PIX", categoria: "Casa", descricao: "X", status: "ativa", gerado_ate: null };

test("recorrência mensal Variável: fim do mês, sem ajuste de dia útil, marcada como indefinida", () => {
  const r = { ...base, frequencia: "mensal", dia_semana: null, dia_mes: null, inicio: "2026-10-05", meses: null };
  const proximoDia = (d) => "9999-12-31"; // se o ajuste fosse aplicado, apareceria aqui
  const oc = ocorrenciasDaRecorrencia(r, "2026-12-31", proximoDia);
  assert.deepEqual(oc.map((o) => o.data), ["2026-10-31", "2026-11-30", "2026-12-31"]);
  assert.ok(oc.every((o) => o.indefinida === true));
});

test("recorrência mensal com dia fixo continua definida e usa o ajuste", () => {
  const r = { ...base, frequencia: "mensal", dia_semana: null, dia_mes: 5, inicio: "2026-10-01", meses: null };
  const oc = ocorrenciasDaRecorrencia(r, "2026-11-30", (d) => d);
  assert.deepEqual(datasDaRecorrencia(r, "2026-11-30"), ["2026-10-05", "2026-11-05"]);
  assert.ok(oc.every((o) => !o.indefinida));
});

// Cliente falso do Supabase: devolve as linhas fornecidas, ignorando filtros (a classificação é feita em memória)
const fake = (linhas) => ({ from: () => { const q = { select: () => q, eq: () => q, gte: () => q, lte: () => q, order: () => Promise.resolve({ data: linhas }) }; return q; } });
const tx = (o) => ({ id: 1, descricao: "", categoria: "Casa", valor: 100, data: "2026-10-10", metodo: "PIX", a_confirmar: false, recorrencia_id: null, ...o });

test("parecidos: ocorrência a confirmar de recorrência casa por nome; senão lista parecidos", async () => {
  const oc = tx({ id: 7, descricao: "Netflix", a_confirmar: true, recorrencia_id: "r1", valor: 55.9, data: "2026-10-12" });
  const r1 = await analisarParecidos(fake([oc]), "u", { tipo: "saidas", valor: 55.9, data: "2026-10-12", texto: "compra NETFLIX.COM" });
  assert.equal(r1.casada?.id, 7);
  const velho = tx({ id: 3, descricao: "Mercado", valor: 80, data: "2026-10-11" });
  const r2 = await analisarParecidos(fake([velho]), "u", { tipo: "saidas", valor: 80, data: "2026-10-12", texto: "mercado" });
  assert.equal(r2.casada, null);
  assert.deepEqual(r2.parecidos.map((p) => p.id), [3]);
  const r3 = await analisarParecidos(fake([velho]), "u", { tipo: "saidas", valor: 999, data: "2026-10-28", texto: "outra coisa" });
  assert.deepEqual(r3.parecidos, []);
});

test("aviso de parecido: mesmo texto e mesmos botões em qualquer origem (só muda a origem)", () => {
  const p = [tx({ id: 3, descricao: "Mercado", valor: 80 })];
  const corpo = (o) => textoParecidos({ origem: o, titulo: "Mercado", valor: 80, data: "2026-10-12", parecidos: p }).split("\n").slice(1).join("\n");
  assert.equal(corpo("sms"), corpo("email"));
  assert.equal(corpo("sms"), corpo("pluggy"));
  const rotulos = (o) => tecladoParecidos(o, 5).inline_keyboard.flat().map((b) => b.text);
  assert.deepEqual(rotulos("sms"), rotulos("pluggy"));
  assert.deepEqual(rotulos("sms"), rotulos("email"));
  assert.deepEqual(tecladoParecidos("pluggy", 5).inline_keyboard.flat().map((b) => b.callback_data), ["pgig:5", "pgat:5", "pgou:5"]);
});
