// Supabase falso em memória (dev/): mesma API que o app usa (from().select().eq()...), sem rede.
// Serve para abrir o app localmente com os dados de dev/seed.js e conferir as telas.
(function () {
  const seed = window.__SEED__;
  const tables = seed.tables;
  const ids = {};
  const proximoId = (n) => { ids[n] = (ids[n] || Math.max(0, ...((tables[n] || []).map(r => r.id || 0)))) + 1; return ids[n]; };
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

  function builder(nome) {
    if (!tables[nome]) tables[nome] = [];
    const st = { op: 'select', filtros: [], ordem: [], lim: null, faixa: null, single: null, payload: null, conflito: null };
    const q = {};
    const add = (f) => (...a) => { st.filtros.push(f(...a)); return q; };
    Object.assign(q, {
      select: () => q,
      eq: add((c, v) => r => r[c] === v), neq: add((c, v) => r => r[c] !== v),
      gt: add((c, v) => r => r[c] > v), gte: add((c, v) => r => r[c] >= v),
      lt: add((c, v) => r => r[c] < v), lte: add((c, v) => r => r[c] <= v),
      in: add((c, vs) => r => vs.includes(r[c])), is: add((c, v) => r => (r[c] ?? null) === v),
      not: () => q, or: () => q,
      ilike: add((c, p) => r => String(r[c] ?? '').toLowerCase().includes(String(p).replace(/%/g, '').toLowerCase())),
      order: (c, o = {}) => { st.ordem.push([c, o.ascending !== false]); return q; },
      limit: (n) => { st.lim = n; return q; },
      range: (a, b) => { st.faixa = [a, b]; return q; },
      single: () => { st.single = 'single'; return q; },
      maybeSingle: () => { st.single = 'maybe'; return q; },
      insert: (v) => { st.op = 'insert'; st.payload = v; return q; },
      update: (v) => { st.op = 'update'; st.payload = v; return q; },
      delete: () => { st.op = 'delete'; return q; },
      upsert: (v, o = {}) => { st.op = 'upsert'; st.payload = v; st.conflito = o.onConflict; return q; },
    });
    function executar() {
      const tab = tables[nome];
      const casa = (r) => st.filtros.every(f => f(r));
      let afetadas = [];
      if (st.op === 'insert' || st.op === 'upsert') {
        const lista = (Array.isArray(st.payload) ? st.payload : [st.payload]).map(r => ({ id: proximoId(nome), user_id: seed.user.id, criado_em: new Date().toISOString(), ...r }));
        if (st.op === 'upsert' && st.conflito) {
          const cols = st.conflito.split(',').map(c => c.trim()).filter(c => c !== 'user_id');
          lista.forEach(n => {
            const ex = tab.find(r => cols.every(c => r[c] === n[c]));
            if (ex) { Object.assign(ex, n, { id: ex.id }); afetadas.push(ex); } else { tab.push(n); afetadas.push(n); }
          });
        } else { lista.forEach(n => tab.push(n)); afetadas = lista; }
      } else if (st.op === 'update') {
        tab.filter(casa).forEach(r => { Object.assign(r, st.payload); afetadas.push(r); });
      } else if (st.op === 'delete') {
        afetadas = tab.filter(casa); afetadas.forEach(r => tab.splice(tab.indexOf(r), 1));
      } else {
        afetadas = tab.filter(casa);
        st.ordem.slice().reverse().forEach(([c, asc]) => afetadas.sort((a, b) => (asc ? 1 : -1) * cmp(a[c], b[c])));
        if (st.faixa) afetadas = afetadas.slice(st.faixa[0], st.faixa[1] + 1);
        if (st.lim != null) afetadas = afetadas.slice(0, st.lim);
      }
      const copia = afetadas.map(r => ({ ...r }));
      if (st.single) {
        if (!copia.length) return st.single === 'single' ? { data: null, error: { message: 'sem linhas' } } : { data: null, error: null };
        return { data: copia[0], error: null };
      }
      return { data: copia, error: null, count: copia.length };
    }
    q.then = (ok, err) => Promise.resolve().then(executar).then(ok, err);
    return q;
  }

  const auth = {
    getSession: async () => ({ data: { session: { user: seed.user } } }),
    getUser: async () => ({ data: { user: seed.user } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => ({}), signInAnonymously: async () => ({ error: null }),
    signInWithOAuth: async () => ({ error: null }), signInWithOtp: async () => ({ error: null }),
  };
  window.supabase = {
    createClient: () => ({
      from: builder, auth,
      functions: { invoke: async () => ({ data: {}, error: null }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
      rpc: async () => ({ data: null, error: null }),
    }),
  };
  console.log('🧪 Supabase simulado (dev/) — dados de exemplo');
})();
