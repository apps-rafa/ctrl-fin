import fs from "node:fs"; import vm from "node:vm";
const noop=()=>{}; const el=new Proxy(function(){}, {get:(t,k)=>k==='style'||k==='dataset'||k==='classList'?new Proxy({}, {get:()=>noop}):(k==='querySelectorAll'?()=>[]:noop), apply:()=>undefined});
const doc={getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener:noop,createElement:()=>el,body:el,head:el,documentElement:el,readyState:'loading',fonts:null};
const novoCtx=()=>{ const c=vm.createContext({console:{log:noop,error:noop,warn:noop,info:noop},document:doc,localStorage:{getItem:()=>null,setItem:noop},sessionStorage:{getItem:()=>null,setItem:noop},navigator:{userAgent:''},location:{search:'',href:'',hostname:'localhost'},setTimeout:noop,setInterval:noop,requestAnimationFrame:noop,getComputedStyle:()=>({}),matchMedia:()=>({matches:false,addEventListener:noop}),MutationObserver:class{observe(){}},ResizeObserver:class{observe(){}},IntersectionObserver:class{observe(){}},supabase:{createClient:()=>({auth:{onAuthStateChange:noop,getSession:async()=>({data:{session:null}})},from:()=>({})})},Intl,Date,Math,JSON,URL,URLSearchParams,fetch:noop});
c.window=c; c.self=c; c.addEventListener=noop; return c; };
const ctx=novoCtx();
const html=fs.readFileSync("index.html","utf8");
const files=[...html.matchAll(/<script src="(js\/[^"?]+)/g)].map(m=>m[1]);
let bad=0;
for(const f of files){ try{ vm.runInContext(fs.readFileSync(f,"utf8"),ctx,{filename:f}); }catch(e){ if(e instanceof ReferenceError||e.name==='ReferenceError'){bad++;console.log("✖",f,e.message);} else console.log("· (ignorado)",f,e.name+": "+e.message); } }
const lazy=JSON.parse(fs.readFileSync("scripts/modulos-lazy.json","utf8"));
for(const n of lazy){ const f=`js/${n}.js`; try{ vm.runInContext(fs.readFileSync(f,"utf8"),ctx,{filename:f}); }catch(e){ if(e.name==='ReferenceError'){bad++;console.log("✖ (lazy)",f,e.message);} else console.log("· (ignorado)",f,e.name+": "+e.message); } }
console.log(bad?`${bad} ReferenceError(s)`:"sem ReferenceError no carregamento");
// Se existe dist/ (npm run build), o bundle minificado também tem que carregar sem ReferenceError e expor as mesmas funções globais
const dist="dist";
if(fs.existsSync(dist)){
  const js=fs.readdirSync(dist).find(f=>/^app.[0-9a-f]+.js$/.test(f));
  if(!js){ console.log("✖ dist/ sem app.*.js"); process.exit(1); }
  const c2=novoCtx(); let ruim=0;
  try{ vm.runInContext(fs.readFileSync(dist+"/"+js,"utf8"),c2,{filename:js}); }catch(e){ if(e.name==='ReferenceError'){ruim++;console.log("✖ bundle",e.message);} else console.log("· (ignorado) bundle",e.name+": "+e.message); }
  const funcoes=["mudarAba","atualizarUI","abrirNovaCategoria","carregarDados","configurarEventListeners"];
  const faltam=funcoes.filter(f=>typeof c2[f]!=='function');
  if(faltam.length){ ruim++; console.log("✖ bundle sem as funções globais:",faltam.join(", ")); }
  console.log(ruim?"bundle com problema":"bundle de dist/ carrega e expõe as funções globais");
  if(ruim||bad) process.exit(1);
} else if(bad) process.exit(1);
