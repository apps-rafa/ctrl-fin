import test from "node:test";
import assert from "node:assert/strict";
import { datasDaRecorrencia, datasParaGerar, horizonteDeGeracao, recorrenciaConcluida, somarMesesNoDia, fimDaRecorrencia } from "../supabase/functions/_shared/ocorrencias.ts";

const base = { id: 1, user_id: "u", tipo: "saidas", valor: 100, metodo: "PIX", categoria: "Casa", descricao: "X", status: "ativa", gerado_ate: null };

test("mensal: um por mês no dia escolhido, limitado ao último dia do mês", () => {
  const r = { ...base, frequencia: "mensal", dia_semana: null, dia_mes: 31, inicio: "2026-01-31", meses: null };
  assert.deepEqual(datasDaRecorrencia(r, "2026-04-30"), ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
});

test("mensal: dia já passado no mês do início começa no mês seguinte", () => {
  const r = { ...base, frequencia: "mensal", dia_semana: null, dia_mes: 5, inicio: "2026-10-12", meses: null };
  assert.deepEqual(datasDaRecorrencia(r, "2026-12-31"), ["2026-11-05", "2026-12-05"]);
});

test("mensal com duração: para antes de inicio + meses", () => {
  const r = { ...base, frequencia: "mensal", dia_semana: null, dia_mes: 2, inicio: "2026-10-02", meses: 3 };
  assert.deepEqual(datasDaRecorrencia(r, "2027-12-31"), ["2026-10-02", "2026-11-02", "2026-12-02"]);
  assert.equal(fimDaRecorrencia(r), "2027-01-02");
});

test("semanal com dia fixo: a cada 7 dias a partir do primeiro dia da semana escolhido (TER)", () => {
  const r = { ...base, frequencia: "semanal", dia_semana: 2, dia_mes: null, inicio: "2026-10-02", meses: null }; // sexta
  assert.deepEqual(datasDaRecorrencia(r, "2026-10-27"), ["2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27"]);
});

test("semanal variável: de 7 em 7 dias a partir do início", () => {
  const r = { ...base, frequencia: "semanal", dia_semana: null, dia_mes: null, inicio: "2026-10-02", meses: null };
  assert.deepEqual(datasDaRecorrencia(r, "2026-10-23"), ["2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23"]);
});

test("semanal por 3 meses às terças = 13 ocorrências (igual ao total estimado da tela)", () => {
  const r = { ...base, frequencia: "semanal", dia_semana: 2, dia_mes: null, inicio: "2026-10-02", meses: 3 };
  assert.equal(datasDaRecorrencia(r, "2030-01-01").length, 13);
});

test("antecedência: mensal e semanal até o fim do mês seguinte", () => {
  assert.equal(horizonteDeGeracao("mensal", "2026-10-02"), "2026-11-30");
  assert.equal(horizonteDeGeracao("mensal", "2026-11-30"), "2026-12-31");
  assert.equal(horizonteDeGeracao("mensal", "2026-12-15"), "2027-01-31");
  assert.equal(horizonteDeGeracao("semanal", "2026-10-02"), "2026-11-30");
});

test("só gera o que falta (depois de gerado_ate) e nunca recria datas antigas", () => {
  const r = { ...base, frequencia: "mensal", dia_semana: null, dia_mes: 2, inicio: "2026-10-02", meses: null, gerado_ate: "2026-11-02" };
  assert.deepEqual(datasParaGerar(r, "2026-11-20"), ["2026-12-02"]); // horizonte 31/12
  assert.deepEqual(datasParaGerar({ ...r, gerado_ate: "2026-12-02" }, "2026-11-20"), []);
});

test("recorrência com duração conclui quando tudo foi gerado e o prazo passou", () => {
  const r = { ...base, frequencia: "mensal", dia_semana: null, dia_mes: 2, inicio: "2026-10-02", meses: 3, gerado_ate: "2026-12-02" };
  assert.equal(recorrenciaConcluida(r, "2026-12-10"), false); // ainda não chegou o fim (02/01)
  assert.equal(recorrenciaConcluida(r, "2027-01-02"), true);
  assert.equal(recorrenciaConcluida({ ...r, gerado_ate: "2026-11-02" }, "2027-01-05"), false); // faltou gerar
});

test("somarMesesNoDia atravessa o ano", () => assert.equal(somarMesesNoDia("2026-11-15", 3, 15), "2027-02-15"));

// ---- dia útil (mensal cai em fim de semana/feriado -> próximo dia útil) ----
import { criarEhFeriado, proximoDiaUtil, feriadosNacionaisDoAno } from "../supabase/functions/_shared/diautil.ts";

test("feriados nacionais do ano (fixos + Páscoa)", () => {
  const f = feriadosNacionaisDoAno(2026);
  assert.ok(f.includes("2026-11-02") && f.includes("2026-12-25"));
  assert.ok(f.includes("2026-04-03")); // Sexta-feira Santa 2026
  assert.ok(f.includes("2026-02-17")); // Carnaval (terça) 2026
});
test("próximo dia útil: sábado/domingo/feriado avançam", () => {
  const ehF = criarEhFeriado([]);
  assert.equal(proximoDiaUtil("2026-10-03", ehF), "2026-10-05"); // sábado -> segunda
  assert.equal(proximoDiaUtil("2026-11-02", ehF), "2026-11-03"); // Finados (segunda) -> terça
  assert.equal(proximoDiaUtil("2026-10-05", ehF), "2026-10-05"); // já é útil
});
test("feriado desativado pelo usuário não conta; feriado do usuário conta", () => {
  const ehF = criarEhFeriado([{ data: "2026-11-02", origem: "nacional", ativo: false }, { data: "2026-10-06", origem: "municipal", ativo: true }]);
  assert.equal(proximoDiaUtil("2026-11-02", ehF), "2026-11-02");
  assert.equal(proximoDiaUtil("2026-10-06", ehF), "2026-10-07");
});
test("recorrência mensal aplica o dia útil; semanal não", () => {
  const ehF = criarEhFeriado([]);
  const aj = (d) => proximoDiaUtil(d, ehF);
  const m = { frequencia: "mensal", dia_semana: null, dia_mes: 2, inicio: "2026-10-02", meses: null };
  assert.deepEqual(datasDaRecorrencia(m, "2026-12-31", aj), ["2026-10-02", "2026-11-03", "2026-12-02"]);
  assert.deepEqual(datasDaRecorrencia(m, "2026-12-31"), ["2026-10-02", "2026-11-02", "2026-12-02"]);
});

test("dia 5 criada em 03/10: o rascunho de novembro (05/11) já existe; em novembro já nasce o de dezembro", () => {
  const r = { ...base, frequencia: "mensal", dia_semana: null, dia_mes: 5, inicio: "2026-10-03", meses: null, gerado_ate: null };
  assert.deepEqual(datasParaGerar(r, "2026-10-03"), ["2026-10-05", "2026-11-05"]);
  assert.deepEqual(datasParaGerar({ ...r, gerado_ate: "2026-11-05" }, "2026-11-01"), ["2026-12-05"]);
});

test("semanal às segundas: 4 ou 5 por mês conforme o mês, sempre até o fim do mês seguinte", () => {
  const r = { ...base, frequencia: "semanal", dia_semana: 1, dia_mes: null, inicio: "2026-10-01", meses: null, gerado_ate: null };
  const ds = datasParaGerar(r, "2026-10-03"); // até 30/11
  assert.deepEqual(ds, ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"]);
  assert.equal(ds.filter((d) => d.startsWith("2026-10")).length, 4); // outubro/2026 tem 4 segundas
  assert.equal(ds.filter((d) => d.startsWith("2026-11")).length, 5); // novembro/2026 tem 5 segundas
});
