// O app (js/recorrencia.js) e o bot (parser.ts) têm a MESMA regra de competência/addMeses:
// este teste garante que as duas versões continuam dando o mesmo resultado.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { competenciaDe as compBot, addMeses as addBot } from "../supabase/functions/telegram-webhook/parser.ts";

const ctx = vm.createContext({ console });
vm.runInContext(fs.readFileSync(new URL("../js/recorrencia.js", import.meta.url), "utf8"), ctx);

test("competenciaDe: app == bot", () => {
  for (const [d, f] of [["2026-10-01", null], ["2026-10-04", 5], ["2026-10-05", 5], ["2026-12-20", 15], ["2026-01-31", 31]]) {
    assert.equal(ctx.competenciaDe(d, f), compBot(d, f), `${d} fech ${f}`);
  }
});

test("addMeses: app == bot", () => {
  for (const [d, n] of [["2026-01-31", 1], ["2026-11-15", 3], ["2026-12-31", 2], ["2026-03-31", 12]]) {
    assert.equal(ctx.addMeses(d, n), addBot(d, n), `${d} +${n}`);
  }
});

test("competenciaComFechamento: fechamento manual da fatura (app == bot)", async () => {
  const { competenciaComFechamento: compFechBot } = await import("../supabase/functions/telegram-webhook/parser.ts");
  const casos = [
    // sem fechamento: igual ao competenciaDe
    ["2026-10-10", null, [], "2026-10-01"],
    // outubro fechada à mão em 12/10: compra de 12/10 em diante vai para novembro; antes disso fica em outubro
    ["2026-10-12", null, [{ competencia: "2026-10-01", fechada: true, fechada_em: "2026-10-12T12:00:00-03:00" }], "2026-11-01"],
    ["2026-10-11", null, [{ competencia: "2026-10-01", fechada: true, fechada_em: "2026-10-12T12:00:00-03:00" }], "2026-10-01"],
    // novembro também fechada: pula para dezembro
    ["2026-10-20", null, [{ competencia: "2026-10-01", fechada: true, fechada_em: "2026-10-12" }, { competencia: "2026-11-01", fechada: true, fechada_em: "2026-10-12" }], "2026-12-01"],
    // dia de fechamento 5 (fecha sozinha) e desmarcada pelo usuário: volta para o mês da data
    ["2026-10-08", 5, [{ competencia: "2026-10-01", fechada: false, fechada_em: "2026-10-09" }], "2026-10-01"],
    ["2026-10-08", 5, [], "2026-11-01"],
    // fechada=false de outro mês não interfere
    ["2026-10-08", 5, [{ competencia: "2026-09-01", fechada: false, fechada_em: "2026-09-09" }], "2026-11-01"],
  ];
  for (const [d, f, linhas, esperado] of casos) {
    assert.equal(compFechBot(d, f, linhas), esperado, `bot ${d} ${JSON.stringify(linhas)}`);
    assert.equal(ctx.competenciaComFechamento(d, f, linhas), esperado, `app ${d} ${JSON.stringify(linhas)}`);
  }
});
