// Gera a pasta dist/ publicada no GitHub Pages: junta e minifica os CSS e JS do index.html (em UM arquivo cada, com hash no nome),
// reescreve o index.html e copia o resto (img/, css/ e a página do mini app). Rodado pelo workflow "Publicar site"; local: npm run build.
// Os fontes continuam separados em css/ e js/ (é o que o `npm run dev`, os testes e a revisão usam).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { transformSync } from "esbuild";

const raiz = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const dist = path.join(raiz, "dist");
const ler = (f) => fs.readFileSync(path.join(raiz, f), "utf8");
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 10);

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

let html = ler("index.html");
const reCss = /[ \t]*<link rel="stylesheet" href="(css\/[^"?]+)[^"]*">\r?\n?/g;
const reJs = /[ \t]*<script src="(js\/[^"?]+)[^"]*"><\/script>\r?\n?/g;
const arquivosCss = [...html.matchAll(reCss)].map((m) => m[1]);
const arquivosJs = [...html.matchAll(reJs)].map((m) => m[1]);
if (!arquivosCss.length || !arquivosJs.length) throw new Error("index.html sem css/js locais para empacotar");

// --- CSS: concatena na ordem do HTML (a ordem importa na cascata) e minifica
const css = transformSync(arquivosCss.map((f) => `/* ${f} */\n${ler(f)}`).join("\n"), { loader: "css", minify: true }).code;
const nomeCss = `app.${hash(css)}.css`;
fs.writeFileSync(path.join(dist, nomeCss), css);

// --- JS: são scripts clássicos que compartilham o escopo global; juntar NA MESMA ORDEM mantém exatamente o comportamento.
// (transform, sem "bundle": os nomes globais — usados nos onclick="..." do HTML — não são renomeados)
const js = transformSync(arquivosJs.map((f) => `// ${f}\n${ler(f)}`).join("\n;\n"), { loader: "js", minify: true, target: "es2020", legalComments: "none" }).code;
const nomeJs = `app.${hash(js)}.js`;
fs.writeFileSync(path.join(dist, nomeJs), js);

// --- HTML: uma tag de cada, no lugar da primeira de cada tipo
let primeiraCss = true, primeiraJs = true;
html = html.replace(reCss, () => (primeiraCss ? ((primeiraCss = false), `    <link rel="stylesheet" href="${nomeCss}">\n`) : ""));
html = html.replace(reJs, () => (primeiraJs ? ((primeiraJs = false), `    <script src="${nomeJs}"></script>\n`) : ""));
fs.writeFileSync(path.join(dist, "index.html"), html);

// --- o resto do site
for (const pasta of ["img", "css"]) fs.cpSync(path.join(raiz, pasta), path.join(dist, pasta), { recursive: true }); // css/ fica: o mini app usa os arquivos soltos
fs.copyFileSync(path.join(raiz, "lancamento-tg.html"), path.join(dist, "lancamento-tg.html"));
fs.writeFileSync(path.join(dist, ".nojekyll"), "");

const kb = (n) => (n / 1024).toFixed(0) + " KB";
const bruto = arquivosJs.concat(arquivosCss).reduce((a, f) => a + fs.statSync(path.join(raiz, f)).size, 0);
console.log(`dist/ pronto: ${nomeJs} (${kb(js.length)}) + ${nomeCss} (${kb(css.length)}) — antes ${kb(bruto)} em ${arquivosJs.length + arquivosCss.length} arquivos`);
