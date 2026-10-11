// Supabase falso em memória para os testes do bot/Edge Functions. Diferente dos fakes simples, APLICA os filtros
// (eq, in, is, not, lt, or, contains...) em select/update/delete — dá para testar "update condicional" (reserva de
// linha), corridas entre dois callbacks e o que foi gravado de verdade.
//
//   const banco = bancoFalso({ telegram_users: [{ chat_id: 1, user_id: "u1" }] });
//   banco.tabelas.transacoes  -> linhas atuais
//   bancoFalso(dados, { falhar: { transacoes: ["insert"] } })  -> insert em transacoes devolve erro

const compara = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const norm = (v) => (v === undefined ? null : v);

/** Filtro de uma condição "col.op.valor" do .or() do PostgREST. */
function condicaoOr(txt) {
  const [col, op, ...resto] = txt.split(".");
  const v = resto.join(".");
  const val = v === "null" ? null : v;
  return (r) => {
    const x = norm(r[col]);
    if (op === "is") return x === val;
    if (op === "eq") return String(x) === v;
    if (op === "lte") return x !== null && String(x) <= v;
    if (op === "gte") return x !== null && String(x) >= v;
    if (op === "lt") return x !== null && String(x) < v;
    if (op === "gt") return x !== null && String(x) > v;
    throw new Error(`or(): operador não suportado no banco falso: ${op}`);
  };
}

/** jsonb @> (só o nível de cima, que é o que o código usa). */
const contem = (obj, sub) => obj && Object.entries(sub).every(([k, v]) => JSON.stringify(obj[k]) === JSON.stringify(v));

export function bancoFalso(dados = {}, { falhar = {} } = {}) {
  const tabelas = {};
  const proximoId = {};
  for (const [nome, linhas] of Object.entries(dados)) tabelas[nome] = linhas.map((l) => ({ ...l }));
  const novoId = (nome) => {
    proximoId[nome] ??= Math.max(0, ...(tabelas[nome] ?? []).map((r) => Number(r.id) || 0));
    return ++proximoId[nome];
  };

  function from(nome) {
    tabelas[nome] ??= [];
    const st = { op: "select", filtros: [], ordem: [], lim: null, faixa: null, unico: null, payload: null, opts: {} };
    const q = {};
    const filtro = (f) => (...a) => { st.filtros.push(f(...a)); return q; };
    Object.assign(q, {
      select: () => q,
      eq: filtro((c, v) => (r) => norm(r[c]) === v),
      neq: filtro((c, v) => (r) => norm(r[c]) !== v),
      gt: filtro((c, v) => (r) => r[c] != null && r[c] > v),
      gte: filtro((c, v) => (r) => r[c] != null && r[c] >= v),
      lt: filtro((c, v) => (r) => r[c] != null && r[c] < v),
      lte: filtro((c, v) => (r) => r[c] != null && r[c] <= v),
      in: filtro((c, vs) => (r) => vs.includes(r[c])),
      is: filtro((c, v) => (r) => norm(r[c]) === v),
      not: filtro((c, op, v) => {
        if (op !== "is") throw new Error(`not(): operador não suportado no banco falso: ${op}`);
        return (r) => norm(r[c]) !== v;
      }),
      contains: filtro((c, sub) => (r) => contem(r[c], sub)),
      ilike: filtro((c, p) => (r) => String(r[c] ?? "").toLowerCase().includes(String(p).replace(/%/g, "").toLowerCase())),
      or: filtro((txt) => { const conds = txt.split(",").map(condicaoOr); return (r) => conds.some((f) => f(r)); }),
      order: (c, o = {}) => { st.ordem.push([c, o.ascending !== false]); return q; },
      limit: (n) => { st.lim = n; return q; },
      range: (a, b) => { st.faixa = [a, b]; return q; },
      single: () => { st.unico = "single"; return q; },
      maybeSingle: () => { st.unico = "maybe"; return q; },
      insert: (v) => { st.op = "insert"; st.payload = v; return q; },
      update: (v) => { st.op = "update"; st.payload = v; return q; },
      delete: () => { st.op = "delete"; return q; },
      upsert: (v, o = {}) => { st.op = "upsert"; st.payload = v; st.opts = o; return q; },
    });

    function executar() {
      if ((falhar[nome] ?? []).includes(st.op)) return { data: null, error: { message: `falha simulada: ${st.op} em ${nome}` } };
      const tab = tabelas[nome];
      const casa = (r) => st.filtros.every((f) => f(r));
      let afetadas = [];
      if (st.op === "insert" || st.op === "upsert") {
        const lista = (Array.isArray(st.payload) ? st.payload : [st.payload]).map((r) => ({ id: novoId(nome), ...r }));
        const cols = st.op === "upsert" && st.opts.onConflict ? st.opts.onConflict.split(",").map((c) => c.trim()) : null;
        for (const n of lista) {
          const ex = cols && tab.find((r) => cols.every((c) => r[c] === n[c]));
          if (ex) { if (!st.opts.ignoreDuplicates) { Object.assign(ex, n, { id: ex.id }); afetadas.push(ex); } }
          else { tab.push(n); afetadas.push(n); }
        }
      } else if (st.op === "update") {
        for (const r of tab.filter(casa)) { Object.assign(r, st.payload); afetadas.push(r); }
      } else if (st.op === "delete") {
        afetadas = tab.filter(casa);
        for (const r of afetadas) tab.splice(tab.indexOf(r), 1);
      } else {
        afetadas = tab.filter(casa);
        for (const [c, asc] of [...st.ordem].reverse()) afetadas.sort((a, b) => (asc ? 1 : -1) * compara(a[c], b[c]));
        if (st.faixa) afetadas = afetadas.slice(st.faixa[0], st.faixa[1] + 1);
        if (st.lim != null) afetadas = afetadas.slice(0, st.lim);
      }
      const copia = afetadas.map((r) => ({ ...r }));
      if (st.unico) {
        if (!copia.length) return st.unico === "single" ? { data: null, error: { message: "nenhuma linha" } } : { data: null, error: null };
        return { data: copia[0], error: null };
      }
      return { data: copia, error: null };
    }
    // Executa só no await (como o supabase-js): cada operação é atômica, mas duas chamadas podem se intercalar.
    q.then = (ok, err) => Promise.resolve().then(executar).then(ok, err);
    return q;
  }

  return { from, tabelas };
}

/** Captura as chamadas ao Telegram (fetch) para conferir o que o bot respondeu. */
export function capturaTelegram() {
  const chamadas = [];
  globalThis.fetch = async (url, init) => {
    chamadas.push({ metodo: String(url).split("/").pop(), corpo: init?.body ? JSON.parse(init.body) : null });
    return { ok: true, text: async () => JSON.stringify({ ok: true, result: { message_id: 1 } }) };
  };
  return chamadas;
}
