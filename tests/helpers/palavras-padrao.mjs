// Palavras-chave padrão das categorias (PALAVRAS_CHAVE_PADRAO em js/menus-api.js), para os testes montarem categorias "como no banco".
import fs from "node:fs";
import vm from "node:vm";

const src = fs.readFileSync(new URL("../../js/menus-api.js", import.meta.url), "utf8");
const ini = src.indexOf("const PALAVRAS_CHAVE_PADRAO");
const ctx = vm.createContext({});
vm.runInContext(src.slice(ini, src.indexOf("};", ini) + 2) + "\nthis.P = JSON.stringify(PALAVRAS_CHAVE_PADRAO);", ctx);
export const PADRAO = JSON.parse(ctx.P);
export const comPalavras = (nome, categoria_tipo) => ({ nome, categoria_tipo, palavras_chave: PADRAO[nome] ?? null });
