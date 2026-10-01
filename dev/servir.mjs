// Servidor estático do ambiente de desenvolvimento: serve o app com o Supabase SIMULADO no lugar do real.
// Uso: node dev/servir.mjs  (porta 8778)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");
const tipos = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };

http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split("?")[0]);
  if (url === "/") url = "/index.html";
  const arq = path.join(raiz, url);
  if (!arq.startsWith(raiz) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end("não encontrado"); }
  let corpo = fs.readFileSync(arq);
  if (url === "/index.html") {
    corpo = corpo.toString("utf8").replace(
      /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase[^>]*><\/script>/,
      '<script src="dev/seed.js"></script><script src="dev/mock-supabase.js"></script>');
  }
  res.writeHead(200, { "Content-Type": (tipos[path.extname(arq)] || "application/octet-stream") + "; charset=utf-8", "Cache-Control": "no-store" });
  res.end(corpo);
}).listen(8778, () => console.log("App de desenvolvimento em http://localhost:8778"));
