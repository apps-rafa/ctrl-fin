// Carimba o "?v=" de todos os CSS/JS do index.html com a data/hora atual (UTC), para o navegador nunca usar arquivo velho em cache
// depois de um deploy. Rodado pelo GitHub Action "Carimbar versão" a cada push no main; também dá para rodar à mão: npm run versao
import fs from "node:fs";

const caminho = new URL("../index.html", import.meta.url);
const html = fs.readFileSync(caminho, "utf8");
const agora = new Date().toISOString().replace(/\D/g, "").slice(0, 12); // AAAAMMDDHHMM
const novo = html.replace(/(\.(?:css|js))\?v=\d+/g, `$1?v=${agora}`);
if (novo === html) {
  console.log("Nada a carimbar.");
} else {
  fs.writeFileSync(caminho, novo);
  console.log(`index.html carimbado com ?v=${agora}`);
}
