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

// ---- datas da recorrência (porta do servidor) e ocorrências retroativas ----
vm.runInContext(`
  function parseDataLocal(s) { const [a, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(a, m - 1, d); }
  function formatarDataISO(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
`, ctx);
const datas = (r, ate) => [...ctx._recDatas(r, ate)];

test("mensal: hoje dia 3, recorrência no dia 1 -> a do dia 1 é passada, a próxima é no mês seguinte", () => {
  const r = { frequencia: "mensal", diaMes: 1, meses: null, inicio: "2026-10-01" };
  const ds = datas(r, "2026-11-03");
  assert.deepEqual(ds, ["2026-10-01", "2026-11-01"]);
  assert.deepEqual(ds.filter((d) => d < "2026-10-03"), ["2026-10-01"]);
});
test("mensal começando mês passado: gera de lá até hoje", () => {
  const r = { frequencia: "mensal", diaMes: 15, meses: null, inicio: "2026-07-01" };
  assert.deepEqual(datas(r, "2026-10-03"), ["2026-07-15", "2026-08-15", "2026-09-15"]);
});
test("mensal dia 31 em mês curto cai no último dia", () => {
  const r = { frequencia: "mensal", diaMes: 31, meses: null, inicio: "2026-02-01" };
  assert.deepEqual(datas(r, "2026-04-30"), ["2026-02-28", "2026-03-31", "2026-04-30"]);
});
test("semanal às segundas: as anteriores do mês atual", () => {
  const r = { frequencia: "semanal", diaSemana: 1, meses: null, inicio: "2026-10-01" };
  const ds = datas(r, "2026-10-20");
  assert.deepEqual(ds, ["2026-10-05", "2026-10-12", "2026-10-19"]);
});
test("duração limita as datas", () => {
  const r = { frequencia: "mensal", diaMes: 5, meses: 2, inicio: "2026-10-01" };
  assert.deepEqual(datas(r, "2026-12-31"), ["2026-10-05", "2026-11-05"]);
});
