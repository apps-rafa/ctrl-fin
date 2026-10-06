// Servidor estático do ambiente de desenvolvimento: serve o app com o Supabase SIMULADO no lugar do real.
// Uso: node dev/servir.mjs  (porta 8778). Com SERVIR_DIST=1 serve a pasta dist/ (resultado do `npm run build`) na porta 8779, com o mesmo Supabase simulado.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const repo = path.resolve(import.meta.dirname, "..");
const usarDist = process.env.SERVIR_DIST === "1";
const raiz = usarDist ? path.join(repo, "dist") : repo;
const porta = usarDist ? 8779 : 8778;
const tipos = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };

http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split("?")[0]);
  if (url === "/") url = "/index.html";
  const base = url.startsWith("/dev/") ? repo : raiz; // os arquivos do mock vivem sempre no repositório
  const arq = path.join(base, url);
  if (!arq.startsWith(base) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end("não encontrado"); }
  let corpo = fs.readFileSync(arq);
  if (url === "/index.html") {
    corpo = corpo.toString("utf8").replace(
      /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase[^>]*><\/script>/,
      '<script src="dev/seed.js"></script><script src="dev/mock-supabase.js"></script>');
  }
  res.writeHead(200, { "Content-Type": (tipos[path.extname(arq)] || "application/octet-stream") + "; charset=utf-8", "Cache-Control": "no-store" });
  res.end(corpo);
}).listen(porta, () => console.log(`App de desenvolvimento em http://localhost:${porta}${usarDist ? " (dist/)" : ""}`));
