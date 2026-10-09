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
const marcadoHoje = ctx.marcadoPagoHoje;

test("checkbox: só programado, a partir do dia; marcado (agendado=false) some", () => {
  const t = { agendado: true, aConfirmar: false, data: "2026-10-20" };
  assert.equal(mostra(t, "2026-10-19"), false, "antes do dia programado não aparece");
  assert.equal(mostra(t, "2026-10-20"), true, "no dia aparece");
  assert.equal(mostra(t, "2026-10-25"), true, "depois do dia segue até marcar");
  assert.equal(mostra({ ...t, agendado: false }, "2026-10-25"), false, "marcado: some");
});

test("checkbox: marcado hoje (pago_em) segue marcado até o dia seguinte; desmarcado volta a ser programado", () => {
  const m = { agendado: false, aConfirmar: false, data: "2026-10-20", pagoEm: "2026-10-20" };
  assert.equal(marcadoHoje(m, "2026-10-20"), true, "no dia em que foi marcado: fica marcado");
  assert.equal(marcadoHoje(m, "2026-10-21"), false, "no dia seguinte: some");
  assert.equal(mostra(m, "2026-10-20"), false, "o checkbox 'marcado' vem de marcadoPagoHoje, não de deveMostrar");
  assert.equal(marcadoHoje({ ...m, pagoEm: null }, "2026-10-20"), false, "sem pago_em não está marcado");
  assert.equal(marcadoHoje({ ...m, agendado: true }, "2026-10-20"), false, "programado não está marcado");
  assert.equal(mostra({ ...m, agendado: true, pagoEm: null }, "2026-10-20"), true, "desmarcado (agendado de novo) volta a aparecer");
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
  assert.deepEqual(tecladoParecidos("pluggy", 5).inline_keyboard.flat().map((b) => b.callback_data), ["pgat:5", "pgou:5"]);
});

// ---- Cliente: gravação de lançamento (api.js) e forma de pagamento padrão da receita (menus-api.js) ----
const cliente = vm.createContext({ console, Date, parseFloat, parseInt, String, Math, CATEGORIA_REEMBOLSO: "Reembolso", CATEGORIA_DINHEIRO_RECEITA: "Dinheiro", CATEGORIA_ESTORNO: "Estorno", estadoApp: { menus: { metodos: [] } } });
for (const arq of ["recorrencia.js", "menus-api.js", "api.js"]) vm.runInContext(fs.readFileSync(new URL(`../js/${arq}`, import.meta.url), "utf8"), cliente);
const iso = (dias) => { const d = new Date(); d.setDate(d.getDate() + dias); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

test("montarRegistro: data futura = agendado; data de hoje/passada não; sem data (indefinida) = agendado + data_indefinida", () => {
  const dados = { tipo: "saidas", valor: 10, categoria: "Casa", metodo: "PIX" };
  const futuro = cliente.montarRegistro({ ...dados, data: iso(3) });
  assert.equal(futuro.agendado, true);
  assert.equal(futuro.data_indefinida, false);
  assert.equal(cliente.montarRegistro({ ...dados, data: iso(0) }).agendado, false);
  assert.equal(cliente.montarRegistro({ ...dados, data: iso(-5) }).agendado, false);
  const sem = cliente.montarRegistro({ ...dados, data: iso(-1), dataIndefinida: true });
  assert.equal(sem.agendado, true);
  assert.equal(sem.data_indefinida, true);
});

test("rotuloPixPadrao: primeiro PIX do cadastro (com ou sem banco); vazio se não houver", () => {
  cliente.estadoApp.menus.metodos = [{ nome: "Dinheiro", metodoKind: "Dinheiro" }, { nome: "Crédito — X", metodoKind: "Crédito", banco: "X" }];
  assert.equal(cliente.rotuloPixPadrao(), "");
  cliente.estadoApp.menus.metodos.push({ nome: "PIX", metodoKind: "PIX", banco: "" });
  assert.equal(cliente.rotuloPixPadrao(), "PIX");
  cliente.estadoApp.menus.metodos.unshift({ nome: "PIX Itaú", metodoKind: "PIX/Débito", banco: "Itaú" });
  assert.equal(cliente.rotuloPixPadrao(), "PIX Itaú");
});

// ---- Camada de dados: as telas não escrevem direto em `transacoes` ----
test("leituras e escritas de transacoes/recorrencias ficam em api.js/dados.js (as telas chamam funções nomeadas)", () => {
  const diretos = [];
  for (const arq of fs.readdirSync(new URL("../js/", import.meta.url))) {
    if (!arq.endsWith(".js") || ["api.js", "dados.js"].includes(arq)) continue;
    const linhas = fs.readFileSync(new URL(`../js/${arq}`, import.meta.url), "utf8").split("\n");
    linhas.forEach((l, i) => { if (/sb\s*\.from\(['"](transacoes|recorrencias)['"]\)/.test(l)) diretos.push(`${arq}:${i + 1}`); });
  }
  assert.deepEqual(diretos, [], "use as funções de api.js (confirmarOcorrenciasAPI, marcarPagoAPI, transacoesDoAnoAPI, ...) em vez de sb.from(...) direto");
});

test("api.js: operações nomeadas montam as consultas certas", async () => {
  const chamadas = [];
  const igual = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b)); // (objetos do vm têm outro protótipo)
  const q = (op, tabela) => { const reg = { tabela, op, filtros: [] }; chamadas.push(reg); const obj = { eq: (c, v) => { reg.filtros.push(["eq", c, v]); return obj; }, in: (c, v) => { reg.filtros.push(["in", c, v]); return obj; }, gte: (c, v) => { reg.filtros.push(["gte", c, v]); return obj; } }; return obj; };
  const ctxApi = vm.createContext({ console, Date, parseFloat, parseInt, String, Math, hojeISO: () => "2026-10-05",
    sb: { from: (t) => ({ update: (c) => { const o = q("update", t); o.campos = c; chamadas[chamadas.length - 1].campos = c; return o; }, delete: () => q("delete", t), insert: () => q("insert", t) }) } });
  vm.runInContext(fs.readFileSync(new URL("../js/api.js", import.meta.url), "utf8"), ctxApi);
  ctxApi.confirmarOcorrenciasAPI([1, 2]);
  igual(chamadas.at(-1), { tabela: "transacoes", op: "update", filtros: [["in", "id", [1, 2]]], campos: { a_confirmar: false } });
  ctxApi.aprovarDuplicatasAPI(7);
  igual(chamadas.at(-1).filtros, [["eq", "id", 7]]);
  igual(chamadas.at(-1).campos, { duplicata_ok: true });
  ctxApi.marcarPagoAPI({ id: 9, dataIndefinida: true });
  igual(chamadas.at(-1).campos, { agendado: false, pago_em: "2026-10-05", data: "2026-10-05", data_indefinida: false });
  ctxApi.marcarPagoAPI({ id: 9, dataIndefinida: false });
  igual(chamadas.at(-1).campos, { agendado: false, pago_em: "2026-10-05" });
  ctxApi.desmarcarPagoAPI({ id: 9 });
  igual(chamadas.at(-1).campos, { agendado: true, pago_em: null });
  igual(chamadas.at(-1).filtros, [["eq", "id", 9]]);
  ctxApi.apagarOcorrenciasDaRecorrenciaAPI(3, "2026-10-05");
  igual(chamadas.at(-1).filtros, [["eq", "recorrencia_id", 3], ["eq", "a_confirmar", true], ["gte", "data", "2026-10-05"]]);
  ctxApi.apagarOcorrenciasDaRecorrenciaAPI(3);
  assert.equal(chamadas.at(-1).filtros.length, 2);
});

test("transacoesParaDuplicatasAPI devolve as linhas no formato da tela (aprovadas e de recorrência são reconhecidas)", async () => {
  const bruto = [
    { id: 1, tipo: "saidas", valor: "190.00", metodo: "PIX", descricao: null, data: "2026-10-02", competencia: "2026-10-01", duplicata_ok: true, a_confirmar: false, recorrencia_id: null, recorrencia_semanal_id: null },
    { id: 2, tipo: "saidas", valor: "190.00", metodo: "PIX", descricao: "Terapia", data: "2026-10-09", competencia: "2026-10-01", duplicata_ok: false, a_confirmar: false, recorrencia_id: 14, recorrencia_semanal_id: 14 },
  ];
  const q = { select: () => q, order: () => q, range: () => Promise.resolve({ data: bruto, error: null }) };
  const c = vm.createContext({ console, Number, String, Math, sb: { from: () => q } });
  vm.runInContext(fs.readFileSync(new URL("../js/api.js", import.meta.url), "utf8"), c);
  const r = await c.transacoesParaDuplicatasAPI();
  assert.equal(r[0].duplicataOk, true, "duplicata_ok vira duplicataOk");
  assert.equal(r[0].valor, 190, "valor vira número");
  assert.equal(r[1].recorrenciaId, 14, "recorrencia_id vira recorrenciaId");
  assert.equal(r[1].aConfirmar, false);
});

test("o app sempre abre com os valores escondidos (olho fechado), mesmo que o aparelho tenha guardado outra coisa", () => {
  const c = vm.createContext({ console, Date, localStorage: { getItem: () => "0", setItem: () => {} } });
  vm.runInContext(fs.readFileSync(new URL("../js/state.js", import.meta.url), "utf8") + "\nglobalThis.__oculto = valoresOcultos;", c);
  assert.equal(c.__oculto, true);
});
