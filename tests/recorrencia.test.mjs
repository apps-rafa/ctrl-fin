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
