// /pendencias: duplicatas do mês + ocorrências a confirmar, numeradas, com um botão por item.
import test from "node:test";
import assert from "node:assert/strict";
import { detectarDuplicatas, montarPendencias } from "../supabase/functions/telegram-webhook/pendencias.ts";

const t = (o) => ({ id: 1, tipo: "saidas", data: "2026-10-05", valor: 50, categoria: "Casa", descricao: "Luz", metodo: "PIX", duplicata_ok: false, a_confirmar: false, ...o });

test("duplicata: mesmo valor, forma e descrição (sem acento/caixa) mais de uma vez", () => {
  const d = detectarDuplicatas([t({ id: 1 }), t({ id: 2, descricao: "LUZ " }), t({ id: 3, valor: 51 })]);
  assert.deepEqual(d.map((x) => x.id).sort(), [1, 2]);
});
test("aprovadas e a confirmar ficam de fora; aprovar 1 não esconde o outro do par", () => {
  assert.equal(detectarDuplicatas([t({ id: 1 }), t({ id: 2, a_confirmar: true })]).length, 0);
  assert.deepEqual(detectarDuplicatas([t({ id: 1, duplicata_ok: true }), t({ id: 2 })]).map((x) => x.id), [2]);
});
test("sem pendências", () => {
  const f = montarPendencias([], []);
  assert.equal(f.vazia, true); assert.deepEqual(f.botoes, []);
});
test("pendências numeradas tudo em sequência e dá um botão por item (a confirmar -> recrasc, duplicata -> penddup)", () => {
  const f = montarPendencias([t({ id: 10, a_confirmar: true })], [t({ id: 20 }), t({ id: 21 })]);
  assert.match(f.texto, /A confirmar\n1\. /);
  assert.match(f.texto, /Duplicatas\n2\. [\s\S]*\n3\. /);
  assert.deepEqual(f.botoes.map((b) => b.callback_data), ["recrasc:10", "penddup:20", "penddup:21"]);
  assert.deepEqual(f.botoes.map((b) => b.text), ["1", "2", "3"]);
});
