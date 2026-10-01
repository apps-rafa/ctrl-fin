import fs from "node:fs"; import vm from "node:vm";
const noop=()=>{}; const el=new Proxy(function(){}, {get:(t,k)=>k==='style'||k==='dataset'||k==='classList'?new Proxy({}, {get:()=>noop}):(k==='querySelectorAll'?()=>[]:noop), apply:()=>undefined});
const doc={getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener:noop,createElement:()=>el,body:el,head:el,documentElement:el,readyState:'loading',fonts:null};
const ctx=vm.createContext({console:{log:noop,error:noop,warn:noop,info:noop},document:doc,localStorage:{getItem:()=>null,setItem:noop},sessionStorage:{getItem:()=>null,setItem:noop},navigator:{userAgent:''},location:{search:'',href:'',hostname:'localhost'},setTimeout:noop,setInterval:noop,requestAnimationFrame:noop,getComputedStyle:()=>({}),matchMedia:()=>({matches:false,addEventListener:noop}),MutationObserver:class{observe(){}},ResizeObserver:class{observe(){}},IntersectionObserver:class{observe(){}},supabase:{createClient:()=>({auth:{onAuthStateChange:noop,getSession:async()=>({data:{session:null}})},from:()=>({})})},Intl,Date,Math,JSON,URL,URLSearchParams,fetch:noop});
ctx.window=ctx; ctx.self=ctx; ctx.addEventListener=noop;
const html=fs.readFileSync("index.html","utf8");
const files=[...html.matchAll(/<script src="(js\/[^"?]+)/g)].map(m=>m[1]);
let bad=0;
for(const f of files){ try{ vm.runInContext(fs.readFileSync(f,"utf8"),ctx,{filename:f}); }catch(e){ if(e instanceof ReferenceError||e.name==='ReferenceError'){bad++;console.log("✖",f,e.message);} else console.log("· (ignorado)",f,e.name+": "+e.message); } }
console.log(bad?`${bad} ReferenceError(s)`:"sem ReferenceError no carregamento");
