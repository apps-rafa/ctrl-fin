// Confere a sintaxe de todos os js/*.js (o app não tem build: um erro de sintaxe derruba a página inteira).
import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
let falhou = false;
for (const f of readdirSync("js").filter((n) => n.endsWith(".js"))) {
  try { execFileSync(process.execPath, ["--check", `js/${f}`], { stdio: "pipe" }); }
  catch (e) { falhou = true; console.error(`✖ js/${f}\n${e.stderr}`); }
}
if (falhou) process.exit(1);
console.log("✓ sintaxe de js/*.js ok");
