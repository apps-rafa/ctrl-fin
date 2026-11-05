// A tabela "Como o app sugere a categoria" (js/regras-categoria.js) é uma cópia só para exibir: tem de bater
// com as listas que valem de verdade (Open Finance e bot do Telegram), senão a tela mente.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const ler = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const ctx = vm.createContext({});
vm.runInContext(ler("js/regras-categoria.js") + "\nthis.REGRAS = REGRAS_CATEGORIA; this.html = htmlTabelaRegrasCategoria; this.palavras = _palavrasDaRegra;", ctx, { filename: "regras-categoria.js" });
const REGRAS = JSON.parse(JSON.stringify(ctx.REGRAS));

/** Pares [categoria, padrão] de uma lista `{ padrao: /.../, categoria: "X" }` num arquivo-fonte. */
function listaDoArquivo(arquivo) {
  const texto = ler(arquivo);
  const ini = texto.search(/PALAVRAS_CHAVE_CATEGORIA\w*\s*(?::[^=]+)?=\s*\[/);
  assert.ok(ini >= 0, `lista não encontrada em ${arquivo}`);
  const fim = texto.indexOf("\n]", ini);
  return [...texto.slice(ini, fim).matchAll(/padrao:\s*\/(.+)\/[a-z]*,\s*categoria:\s*["']([^"']+)["']/g)].map((m) => `${m[2]} :: ${m[1]}`);
}
const daTabela = (fonte) => REGRAS.filter((r) => r.fonte === fonte).map((r) => `${r.categoria} :: ${r.padrao}`);

test("cartão: a tabela bate com pluggy-sync, pluggy-webhook e js/pluggy.js", () => {
  const esperado = daTabela("cartao");
  for (const f of ["supabase/functions/pluggy-sync/index.ts", "supabase/functions/pluggy-webhook/index.ts", "js/pluggy.js"]) {
    assert.deepEqual(listaDoArquivo(f), esperado, f);
  }
});

test("bot: a tabela bate com o parser do Telegram", () => {
  assert.deepEqual(listaDoArquivo("supabase/functions/telegram-webhook/parser.ts"), daTabela("telegram"));
});

test("Uber vai para Transporte app (cartão e bot); táxi continua em Transporte", () => {
  for (const fonte of ["cartao", "telegram"]) {
    const regra = (nome) => REGRAS.find((r) => r.fonte === fonte && r.categoria === nome && new RegExp(r.padrao).test(nome === "Transporte app" ? "uber" : "taxi"));
    assert.ok(regra("Transporte app"), `uber/${fonte}`);
    assert.ok(regra("Transporte"), `taxi/${fonte}`);
    assert.ok(!REGRAS.some((r) => r.fonte === fonte && r.categoria === "Transporte" && /uber/.test(r.padrao)));
  }
});

test("palavras legíveis e HTML sem sobras de regex", () => {
  assert.deepEqual(Array.from(ctx.palavras({ padrao: "p[ãa]o de a[çc][uú]car|droga ?raia" })), ["pão de açúcar", "droga raia"]);
  const html = ctx.html();
  assert.match(html, /Transporte app/);
  assert.doesNotMatch(html, /regra-palavra">[^<]*[\[\\?(]/);
});
