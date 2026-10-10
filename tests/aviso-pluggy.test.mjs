import test from "node:test";
import assert from "node:assert/strict";
import { montarAvisoPluggy } from "../supabase/functions/_shared/parecidos.ts";

test("aviso da Pluggy em HTML: descrição com _ * < & não quebra o envio", () => {
  const { texto } = montarAvisoPluggy(
    { id: 1, tipo: "saidas", valor: 10, data: "2026-10-10", descricao_banco: "MERCADO_LIVRE*PAG <x> & cia", categoria_sugerida: "Compras_online" },
    "Crédito Nubank", (t) => t,
  );
  assert.match(texto, /<b>Novo lançamento via Pluggy<\/b>/);
  assert.match(texto, /<i>MERCADO_LIVRE\*PAG &lt;x&gt; &amp; cia<\/i>/);
  assert.match(texto, /Categoria sugerida: Compras_online/);
  assert.doesNotMatch(texto, /<x>/);
});
