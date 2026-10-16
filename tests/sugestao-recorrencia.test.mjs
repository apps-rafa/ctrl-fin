// Sugestão de vincular um lançamento solto a uma recorrência semanal (js/sugestao-recorrencia.js carregado como o navegador faz).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({ console });
vm.runInContext(fs.readFileSync(new URL("../js/sugestao-recorrencia.js", import.meta.url), "utf8"), ctx);
const sugerir = (t, recs) => ctx.sugerirRecorrenciaSemanal(t, recs);

const terapia = { id: 14, tipo: "saidas", frequencia: "semanal", diaSemana: 5, valor: 190, metodo: "PIX", descricao: "Terapia", inicio: "2026-10-01", encerradaEm: null };
const solta = { id: 1513, tipo: "saidas", valor: 190, metodo: "PIX", descricao: "Terapia", data: "2026-10-02" }; // sexta

test("a Terapia solta de sexta, mesmo valor e PIX, é sugerida para a recorrência", () =>
  assert.equal(sugerir(solta, [terapia])?.id, 14));
test("não sugere quando já está vinculada, é rascunho ou foi recusada", () => {
  assert.equal(sugerir({ ...solta, recorrenciaSemanalId: 14 }, [terapia]), null);
  assert.equal(sugerir({ ...solta, recorrenciaId: 14 }, [terapia]), null);
  assert.equal(sugerir({ ...solta, aConfirmar: true }, [terapia]), null);
  assert.equal(sugerir({ ...solta, sugestaoRecOk: true }, [terapia]), null);
});
test("dia da semana, valor, forma de pagamento, tipo ou nome diferentes: não sugere", () => {
  assert.equal(sugerir({ ...solta, data: "2026-10-03" }, [terapia]), null, "sábado");
  assert.equal(sugerir({ ...solta, valor: 379.2 }, [terapia]), null, "valor");
  assert.equal(sugerir({ ...solta, metodo: "Débito" }, [terapia]), null, "forma");
  assert.equal(sugerir({ ...solta, tipo: "entradas", valor: 190 }, [terapia]), null, "receita (reembolso) não entra");
  assert.equal(sugerir({ ...solta, descricao: "Condomínio" }, [terapia]), null, "nome");
  assert.equal(sugerir({ ...solta, descricao: "" }, [terapia]), null, "sem descrição");
});
test("fora do período da recorrência: não sugere", () => {
  assert.equal(sugerir({ ...solta, data: "2026-09-25" }, [terapia]), null, "antes do início");
  assert.equal(sugerir({ ...solta, data: "2026-10-16" }, [{ ...terapia, encerradaEm: "2026-10-09" }]), null, "depois de encerrada");
});
test("recorrência sem dia fixo aceita qualquer dia; mensal é ignorada; duas candidatas = dúvida, não sugere", () => {
  assert.equal(sugerir({ ...solta, data: "2026-10-03" }, [{ ...terapia, diaSemana: null }])?.id, 14);
  assert.equal(sugerir(solta, [{ ...terapia, frequencia: "mensal" }]), null);
  assert.equal(sugerir(solta, [terapia, { ...terapia, id: 15 }]), null);
});
