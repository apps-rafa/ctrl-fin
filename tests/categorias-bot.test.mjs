// Categorias cadastradas no texto (inclusive compostas) e descrição = o que sobra.
import test from "node:test";
import assert from "node:assert/strict";
import { sugerirCategoriaTexto, categoriaCadastradaNoTexto, montarDescricao, interpretarValorETipo, detectarMetodoNoTexto } from "../supabase/functions/telegram-webhook/parser.ts";
import { idRascunhoDaResposta } from "../supabase/functions/telegram-webhook/comandos.ts";

const D = (nome) => ({ nome, categoria_tipo: "saidas" });
const R = (nome) => ({ nome, categoria_tipo: "entradas" });
const cats = [D("Saúde"), D("Casa"), D("Casa e Manutenção"), D("Saúde e Bem-estar"), D("Mercado"), D("Outros"), R("Salário"), R("Reembolso")];
const metodos = [{ nome: "PIX", metodo_kind: "PIX", banco: null, dia_fechamento: null }];

function interpretar(texto) {
  const a = interpretarValorETipo(texto);
  const cat = sugerirCategoriaTexto(texto, a.tipo, cats);
  const m = a.tipo === "saidas" ? detectarMetodoNoTexto(texto, metodos) : null;
  return { ...a, cat, descricao: montarDescricao(a.resto, { palavrasCategoria: cat.palavras, metodo: m }), metodo: m };
}

test("190 pix saude -> despesa 190, Pix, Saúde, sem descrição", () => {
  const r = interpretar("190 pix saude");
  assert.equal(r.valor, 190); assert.equal(r.tipo, "saidas");
  assert.equal(r.metodo.metodo_kind, "PIX");
  assert.equal(r.cat.nome, "Saúde");
  assert.equal(r.descricao, "");
});

test("categoria composta com acento e hífen: 'saúde e bem estar' -> Saúde e Bem-estar", () => {
  const r = interpretar("150 pix saúde e bem estar");
  assert.equal(r.cat.nome, "Saúde e Bem-estar");
  assert.equal(r.descricao, ""); // as palavras da categoria não viram descrição
});

test("a mais específica vence: Casa e Manutenção, não Casa", () => {
  const r = interpretar("300 pix casa e manutenção");
  assert.equal(r.cat.nome, "Casa e Manutenção");
  assert.equal(r.descricao, "");
  assert.equal(interpretar("300 pix casa").cat.nome, "Casa");
});

test("o resto vira descrição", () => {
  const r = interpretar("gastei 80 no pix mercado compras do mês");
  assert.equal(r.cat.nome, "Mercado");
  assert.equal(r.descricao, "Compras do mês");
});

test("nunca cai em Outros quando há categoria cadastrada no texto", () => {
  assert.equal(sugerirCategoriaTexto("20 casa e manutenção", "saidas", cats).nome, "Casa e Manutenção");
  assert.equal(sugerirCategoriaTexto("20 qualquer coisa", "saidas", cats).nome, "Outros");
});

test("reembolso: receita na categoria Reembolso; a despesa citada (Saúde) está cadastrada só em Despesas", () => {
  const r = interpretar("370 reembolso saude");
  assert.equal(r.tipo, "entradas"); assert.equal(r.valor, 370);
  assert.equal(r.cat.nome, "Reembolso");
  assert.equal(categoriaCadastradaNoTexto("370 reembolso saude", cats.filter((c) => c.categoria_tipo === "saidas")).nome, "Saúde");
});

test("receita com categoria de receita cadastrada", () => {
  assert.equal(interpretar("recebi 5000 salário").cat.nome, "Salário");
});

test("idRascunhoDaResposta lê o id nos botões da mensagem respondida", () => {
  const msg = { reply_markup: { inline_keyboard: [[{ callback_data: "nlconfirmar:42" }, { callback_data: "nleditar:42" }]] } };
  assert.equal(idRascunhoDaResposta(msg), 42);
  assert.equal(idRascunhoDaResposta({ reply_markup: { inline_keyboard: [[{ callback_data: "cancelar" }]] } }), null);
  assert.equal(idRascunhoDaResposta(undefined), null);
});
