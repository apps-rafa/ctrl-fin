// Cálculo do total estimado das recorrências (js/recorrencias.js carregado como o navegador faz).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({ console, window: {} });
vm.runInContext(fs.readFileSync(new URL("../js/recorrencias.js", import.meta.url), "utf8"), ctx);
const calc = (o) => ctx.calcularOcorrenciasRecorrencia(o);
const inicio = new Date(2026, 9, 2); // 02/10/2026 (sexta)

test("mensal: 1 por mês", () => assert.equal(calc({ frequencia: "mensal", meses: 12, inicio }), 12));
test("sem prazo: null", () => assert.equal(calc({ frequencia: "mensal", meses: 0, inicio }), null));
test("semanal com dia fixo conta esse dia no período (3 meses a partir de 02/10: terças = 13)", () =>
  assert.equal(calc({ frequencia: "semanal", diaSemana: 2, meses: 3, inicio }), 13));
test("semanal sem dia fixo: semanas inteiras do período (3 meses = 91 dias = 13)", () =>
  assert.equal(calc({ frequencia: "semanal", diaSemana: "", meses: 3, inicio }), 13));
test("R$ 190 por semana em 6 meses (terças) = ocorrências × 190", () => {
  const n = calc({ frequencia: "semanal", diaSemana: 2, meses: 6, inicio });
  assert.equal(n, 26);
  assert.equal(n * 190, 4940);
});
