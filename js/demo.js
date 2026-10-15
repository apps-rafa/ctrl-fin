/**
 * DEMO — conta de demonstração que não grava nada.
 * "👀 Demo", na tela de entrada, liga a marca `ctrlfin_demo` (sessionStorage) e recarrega: o Supabase real é trocado por um
 * simulado em memória (mesma API que o app usa: from().select().eq()..., insert/update/delete/upsert, auth, rpc), já preenchido com
 * ~3 meses de lançamentos de todos os tipos (gerarDadosDemo, com datas a partir de hoje). Recarregar volta aos dados iniciais;
 * "Sair" (ou "Criar minha conta") desliga a Demo. O ambiente de desenvolvimento (dev/) usa o mesmo Supabase simulado.
 * Precisa vir ANTES de js/config.js (que chama window.supabase.createClient).
 */
const DEMO_CHAVE = 'ctrlfin_demo';
const MODO_DEMO = (() => { try { return sessionStorage.getItem(DEMO_CHAVE) === '1'; } catch (e) { return false; } })();

function entrarNaDemo() {
    try { sessionStorage.setItem(DEMO_CHAVE, '1'); } catch (e) {}
    location.reload();
}

function sairDaDemo() {
    try { sessionStorage.removeItem(DEMO_CHAVE); } catch (e) {}
    location.reload();
}

/** Supabase falso em memória sobre `seed` ({ user, tables }). opcoes.invoke(nome) responde às Edge Functions; opcoes.aoSair, ao signOut. */
function criarSupabaseSimulado(seed, opcoes = {}) {
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
        signOut: async () => { if (opcoes.aoSair) opcoes.aoSair(); return {}; },
        signInAnonymously: async () => ({ error: null }),
        signInWithOAuth: async () => ({ error: null }), signInWithOtp: async () => ({ error: null }),
    };
    const invoke = opcoes.invoke || (async (nome) => ({ data: nome === 'recorrencias' ? { ok: true, criadas: 0 } : {}, error: null }));
    return {
        from: builder, auth,
        functions: { invoke },
        channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
        rpc: async (nome, p = {}) => {
            // Mesma regra da função do banco (supabase/migrations/20261018_quitar_parcelamento.sql)
            if (nome !== 'quitar_parcelamento') return { data: null, error: null };
            const tx = tables.transacoes || [];
            const alvo = tx.find(r => r.id === p.p_id);
            if (!alvo || !alvo.grupo_id || alvo.tipo_recorrencia !== 'Parcelada') return { data: null, error: { message: 'Não é um parcelamento' } };
            const grupo = tx.filter(r => r.grupo_id === alvo.grupo_id);
            const n = alvo.parcelas_total || grupo.length, cent = Math.round(alvo.valor_total * 100), base = Math.floor(cent / n), resto = cent - base * n;
            const orig = num => (base + (num - 1 < resto ? 1 : 0)) / 100;
            if (p.p_quitar) {
                const saldo = Math.round(grupo.filter(r => r.parcela_num >= alvo.parcela_num).reduce((s, r) => s + orig(r.parcela_num), 0) * 100) / 100;
                grupo.forEach(r => {
                    if (r.parcela_num === alvo.parcela_num) Object.assign(r, { valor: saldo, quitada: false, quitado_em: alvo.competencia });
                    else if (r.parcela_num > alvo.parcela_num) Object.assign(r, { valor: 0, quitada: true, quitado_em: alvo.competencia });
                });
            } else grupo.forEach(r => Object.assign(r, { valor: orig(r.parcela_num), quitada: false, quitado_em: null }));
            return { data: null, error: null };
        },
    };
}

/**
 * Dados da Demo: 3 meses para trás, o mês atual e 2 para frente, a partir de `hoje`. Usa de tudo: receitas e despesas, PIX, débito,
 * dinheiro e dois cartões (faturas pagas, aberta e futuras), parcelados (um quitado), estorno no crédito, reembolso via PIX,
 * recorrências mensais e semanal (confirmadas, a confirmar e programadas), lançamento sem data, duplicata e itens inativos.
 * Autocontido (roda antes dos demais scripts do app).
 */
function gerarDadosDemo(hoje = new Date()) {
    const U = 'demo';
    const pad = n => String(n).padStart(2, '0');
    const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const HOJE = iso(hoje);
    const A = hoje.getFullYear(), M = hoje.getMonth();
    const ultimoDia = (a, m) => new Date(a, m + 1, 0).getDate();
    /** Data do dia `dia` no mês deslocado `k` meses de hoje (dia limitado ao fim do mês) */
    const dia = (k, d) => { const a = A + Math.floor((M + k) / 12), m = ((M + k) % 12 + 12) % 12; return iso(new Date(a, m, Math.min(d, ultimoDia(a, m)))); };
    /** Próximo dia útil (sem fim de semana) */
    const util = s => { const d = new Date(s + 'T12:00:00'); while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1); return iso(d); };
    const mais = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
    const somaMes = (s, n) => { const [a, m, d] = s.split('-').map(Number); const t = a * 12 + (m - 1) + n; const aa = Math.floor(t / 12), mm = t % 12; return iso(new Date(aa, mm, Math.min(d, ultimoDia(aa, mm)))); };
    const comp = (s, fech) => { const [a, m, d] = s.split('-').map(Number); return iso(new Date(a, m - 1 + (fech && d >= fech ? 1 : 0), 1)); };
    let semente = 20261015;
    const rnd = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
    const varia = (v, pct) => Math.round(v * (1 + (rnd() * 2 - 1) * pct) * 100) / 100;

    // ---- Menus: categorias, formas de pagamento (com cartões) e itens inativos
    let mid = 1;
    const menu = o => ({ id: mid++, user_id: U, status: 'Ativo', ordem: null, descricao: '', cor: null, desativado_em: null, ...o });
    const cats = (tipo, nomes) => nomes.map((nome, i) => menu({ tipo: 'Categoria', nome, categoria_tipo: tipo, ordem: i + 1 }));
    const CARTAO = {
        'Crédito Nubank': { fech: 3, venc: 10 },
        'Crédito Itaú': { fech: 26, venc: 5 },
    };
    const menu_itens = [
        ...cats('saidas', ['Moradia', 'Contas', 'Mercado', 'Alimentação', 'Alimentação app', 'Transporte', 'Transporte app', 'Saúde',
            'Educação', 'Lazer', 'Assinaturas', 'Compras', 'Compras online', 'Pets', 'Viagem', 'Estorno']),
        ...cats('entradas', ['Salário', 'Freelance', 'Bônus', 'Rendimentos', 'Reembolso', 'Dinheiro']),
        menu({ tipo: 'Categoria', nome: 'Cursinho', categoria_tipo: 'saidas', status: 'Inativo', desativado_em: dia(-2, 1) + 'T12:00:00Z' }),
        menu({ tipo: 'Método', nome: 'PIX', metodo_kind: 'PIX', banco: '', ordem: 1 }),
        menu({ tipo: 'Método', nome: 'PIX — Itaú', metodo_kind: 'PIX/Débito', banco: 'Itaú', ordem: 2 }),
        menu({ tipo: 'Método', nome: 'Crédito — Nubank', metodo_kind: 'Crédito', banco: 'Nubank', dia_fechamento: 3, dia_vencimento: 10, melhor_dia_compra: 3, ordem: 3, cor: '#8B5CF6' }),
        menu({ tipo: 'Método', nome: 'Crédito — Itaú', metodo_kind: 'Crédito', banco: 'Itaú', dia_fechamento: 26, dia_vencimento: 5, melhor_dia_compra: 26, ordem: 4, cor: '#F97316' }),
        menu({ tipo: 'Método', nome: 'Dinheiro', metodo_kind: 'Dinheiro', banco: '', ordem: 5 }),
        menu({ tipo: 'Método', nome: 'Crédito — Santander', metodo_kind: 'Crédito', banco: 'Santander', dia_fechamento: 15, dia_vencimento: 22, ordem: 6, status: 'Inativo', desativado_em: dia(-3, 1) + 'T12:00:00Z' }),
    ];

    // ---- Lançamentos
    let tid = 1;
    const transacoes = [];
    const t = (tipo, data, valor, categoria, metodo, descricao, extra = {}) => {
        const fech = CARTAO[metodo] && CARTAO[metodo].fech;
        const linha = {
            id: tid++, user_id: U, tipo, data, valor, categoria, metodo, descricao: descricao || '',
            forma_pagamento: 'À vista', tipo_recorrencia: 'Pontual', status: 'Ativa', pendente: false,
            competencia: data ? comp(data, fech) : null, criado_em: (data || HOJE) + 'T12:00:00Z',
            // cartão de crédito nunca fica programado (a compra entra na fatura); o resto, com data futura, é programado
            agendado: !fech && !!data && data > HOJE, pago_em: null, a_confirmar: false, recorrencia_id: null,
            recorrencia_semanal_id: null, duplicata_ok: false, data_indefinida: false, quitada: false, quitado_em: null, ...extra,
        };
        transacoes.push(linha);
        return linha;
    };
    const parcelado = (data, total, n, categoria, metodo, descricao) => {
        const fech = CARTAO[metodo].fech, grupo = 'demo-' + tid, cent = Math.round(total * 100), base = Math.floor(cent / n), resto = cent - base * n;
        const comp0 = comp(data, fech);
        return Array.from({ length: n }, (_, i) => t('saidas', somaMes(data, i), (base + (i < resto ? 1 : 0)) / 100, categoria, metodo, descricao, {
            tipo_recorrencia: 'Parcelada', forma_pagamento: 'Parcelada', grupo_id: grupo, parcela_num: i + 1, parcelas_total: n,
            valor_total: total, dia_recorrencia: CARTAO[metodo].venc, competencia: somaMes(comp0, i),
        }));
    };

    // Recorrências (cadastro). As ocorrências passadas já confirmadas ficam soltas (como o servidor faz);
    // as do mês atual em diante ficam ligadas a elas: "a confirmar" (rascunho) e programadas.
    const recorrencias = [];
    let rid = 1;
    const rec = o => { const r = { id: rid++, user_id: U, dia_semana: null, dia_mes: null, meses: null, status: 'ativa', encerrada_em: null, gerado_ate: null,
        competencia_offset: 0, valor_referencia: null, valor_referencia_data: null, remetentes: '', criado_em: dia(-4, 1) + 'T12:00:00Z', ...o }; r.ativa_desde = r.inicio; recorrencias.push(r); return r; };
    const ocorrencia = (r, data, valor) => {
        const ligada = data >= dia(0, 1); // do mês atual em diante: ainda ligada à recorrência
        const rascunho = ligada && data >= HOJE; // o que ainda não chegou fica "a confirmar"
        const extra = r.frequencia === 'semanal' ? { recorrencia_semanal_id: r.id, duplicata_ok: true } : {};
        const linha = t(r.tipo, data, valor, r.categoria, r.metodo, r.descricao, { ...extra, recorrencia_id: ligada ? r.id : null, a_confirmar: rascunho });
        if (!r.gerado_ate || data > r.gerado_ate) r.gerado_ate = data;
        return linha;
    };

    const salario = rec({ tipo: 'entradas', frequencia: 'mensal', dia_mes: 5, valor: 7850, metodo: 'PIX Itaú', categoria: 'Salário', descricao: 'Salário', inicio: dia(-6, 5) });
    const aluguel = rec({ tipo: 'saidas', frequencia: 'mensal', dia_mes: 10, valor: 2300, metodo: 'PIX Itaú', categoria: 'Moradia', descricao: 'Aluguel', inicio: dia(-6, 10) });
    const condominio = rec({ tipo: 'saidas', frequencia: 'mensal', dia_mes: 8, valor: 640, metodo: 'PIX Itaú', categoria: 'Moradia', descricao: 'Condomínio', inicio: dia(-6, 8) });
    const internet = rec({ tipo: 'saidas', frequencia: 'mensal', dia_mes: 15, valor: 119.9, metodo: 'Crédito Nubank', categoria: 'Contas', descricao: 'Internet fibra', inicio: dia(-6, 15) });
    const streaming = rec({ tipo: 'saidas', frequencia: 'mensal', dia_mes: 12, valor: 55.9, metodo: 'Crédito Itaú', categoria: 'Assinaturas', descricao: 'Streaming', inicio: dia(-6, 12) });
    const academia = rec({ tipo: 'saidas', frequencia: 'mensal', dia_mes: 2, valor: 109.9, metodo: 'Crédito Nubank', categoria: 'Saúde', descricao: 'Academia', inicio: dia(-6, 2), meses: 12 });
    const curso = rec({ tipo: 'saidas', frequencia: 'mensal', dia_mes: 20, valor: 289, metodo: 'PIX', categoria: 'Educação', descricao: 'Curso de inglês', inicio: dia(-3, 20), meses: 6 });
    const personal = rec({ tipo: 'saidas', frequencia: 'semanal', dia_semana: 2, valor: 90, metodo: 'PIX', categoria: 'Saúde', descricao: 'Personal trainer', inicio: dia(-3, 1) });
    const aulas = rec({ tipo: 'entradas', frequencia: 'semanal', dia_semana: 6, valor: 150, metodo: 'PIX', categoria: 'Freelance', descricao: 'Aulas particulares', inicio: dia(-1, 1), meses: 4 });
    rec({ tipo: 'saidas', frequencia: 'mensal', dia_mes: 18, valor: 79.9, metodo: 'Crédito Itaú', categoria: 'Assinaturas', descricao: 'App de música (cancelado)', inicio: dia(-8, 18), status: 'encerrada', encerrada_em: dia(-2, 20) });

    for (let k = -3; k <= 2; k++) {
        const atual = k === 0, futuro = k > 0;
        // Recorrências mensais (luz e água variam todo mês)
        ocorrencia(salario, util(dia(k, 5)), 7850);
        ocorrencia(aluguel, util(dia(k, 10)), 2300);
        ocorrencia(condominio, util(dia(k, 8)), 640);
        ocorrencia(internet, dia(k, 15), 119.9);
        ocorrencia(streaming, dia(k, 12), 55.9);
        ocorrencia(academia, dia(k, 2), 109.9);
        if (dia(k, 20) >= curso.inicio) ocorrencia(curso, util(dia(k, 20)), 289);
        // Semanais: toda terça (personal) e sábado (aulas, a partir do mês passado)
        for (let d = 1; d <= ultimoDia(A + Math.floor((M + k) / 12), ((M + k) % 12 + 12) % 12); d++) {
            const s = dia(k, d), ds = new Date(s + 'T12:00:00').getDay();
            if (ds === 2) ocorrencia(personal, s, 90);
            if (ds === 6 && s >= aulas.inicio) ocorrencia(aulas, s, 150);
        }
        if (futuro && k === 2) continue; // daqui a 2 meses: só o que é recorrente/parcelado
        // Contas de consumo (programadas no futuro)
        t('saidas', util(dia(k, 22)), varia(185, 0.25), 'Contas', 'PIX Itaú', 'Conta de luz');
        t('saidas', util(dia(k, 24)), varia(78, 0.2), 'Contas', 'PIX Itaú', 'Conta de água');
        t('saidas', util(dia(k, 18)), 64.9, 'Contas', 'PIX Itaú', 'Celular');
        if (futuro) continue;
        // Dia a dia (mês atual: só até hoje)
        const ate = atual ? hoje.getDate() : 31;
        const dd = (d, tipo, ...resto) => { if (d <= ate) t(tipo, dia(k, d), ...resto); };
        dd(3, 'saidas', varia(612, 0.15), 'Mercado', 'Crédito Itaú', 'Supermercado (compra do mês)');
        dd(11, 'saidas', varia(148, 0.3), 'Mercado', 'Crédito Nubank', 'Hortifruti');
        dd(19, 'saidas', varia(236, 0.3), 'Mercado', 'Crédito Itaú', 'Supermercado');
        dd(27, 'saidas', varia(92, 0.3), 'Mercado', 'PIX', 'Padaria e açougue');
        [4, 9, 14, 21, 26].forEach(d => dd(d, 'saidas', varia(58, 0.4), 'Alimentação app', 'Crédito Nubank', 'iFood'));
        [6, 13, 23].forEach(d => dd(d, 'saidas', varia(42, 0.35), 'Alimentação', 'Crédito Nubank', 'Almoço'));
        [7, 16, 25].forEach(d => dd(d, 'saidas', varia(27, 0.5), 'Transporte app', 'Crédito Nubank', 'Uber'));
        dd(17, 'saidas', varia(230, 0.15), 'Transporte', 'Crédito Itaú', 'Combustível');
        dd(20, 'saidas', varia(45, 0.3), 'Alimentação', 'Dinheiro', 'Feira');
        dd(14, 'saidas', varia(160, 0.4), 'Lazer', 'Crédito Itaú', ['Cinema e jantar', 'Show', 'Bar com amigos', 'Teatro'][(k + 4) % 4]);
        dd(21, 'saidas', varia(118, 0.3), 'Pets', 'Crédito Nubank', 'Ração e petshop');
        dd(28, 'saidas', varia(74, 0.4), 'Saúde', 'PIX Itaú', 'Farmácia');
        dd(9, 'entradas', varia(38, 0.2), 'Rendimentos', 'PIX Itaú', 'Rendimento da reserva');
    }

    // Pontuais que contam uma história
    t('entradas', util(dia(-3, 25)), 2400, 'Freelance', 'PIX', 'Projeto de site — cliente A');
    t('entradas', util(dia(-1, 12)), 1800, 'Freelance', 'PIX', 'Consultoria — cliente B');
    t('entradas', util(dia(-3, 20)), 3500, 'Bônus', 'PIX Itaú', 'Bônus semestral');
    t('entradas', dia(-2, 6), 200, 'Dinheiro', 'Dinheiro', 'Venda da bicicleta antiga');
    t('saidas', dia(-2, 14), 380, 'Saúde', 'PIX', 'Consulta médica');
    t('entradas', util(dia(-1, 3)), 280, 'Reembolso', 'PIX', 'Reembolso do plano (consulta)');
    t('saidas', dia(-1, 8), 310, 'Compras online', 'Crédito Nubank', 'Tênis de corrida');
    t('saidas', dia(-1, 22), 310, 'Estorno', 'Crédito Nubank', 'Estorno: tênis devolvido');
    t('saidas', dia(-2, 16), 2140, 'Viagem', 'Crédito Itaú', 'Passagens — feriado'); // mês no vermelho
    t('saidas', dia(-2, 24), 1680, 'Viagem', 'Crédito Itaú', 'Hotel — feriado');
    t('saidas', dia(-3, 9), 450, 'Educação', 'PIX', 'Material do curso');
    // Parcelados: notebook (10x, em andamento), geladeira (6x, quitada antes do fim) e celular (12x, começou este mês)
    parcelado(dia(-3, 14), 4790, 10, 'Compras', 'Crédito Itaú', 'Notebook');
    const geladeira = parcelado(dia(-3, 22), 3180, 6, 'Compras', 'Crédito Nubank', 'Geladeira');
    {   // quitada na 4ª parcela: ela recebe o saldo, as seguintes zeram
        const n = 6, cent = 318000, base = Math.floor(cent / n), resto = cent - base * n, orig = num => (base + (num - 1 < resto ? 1 : 0)) / 100;
        const q = geladeira[3];
        q.valor = Math.round(geladeira.slice(3).reduce((s, r) => s + orig(r.parcela_num), 0) * 100) / 100; q.quitado_em = q.competencia;
        geladeira.slice(4).forEach(r => Object.assign(r, { valor: 0, quitada: true, quitado_em: q.competencia }));
    }
    parcelado(dia(0, Math.min(hoje.getDate(), 2)), 2388, 12, 'Compras', 'Crédito Nubank', 'Celular novo');
    parcelado(dia(-1, 19), 900, 3, 'Lazer', 'Crédito Itaú', 'Ingressos do festival');
    // Programados e sem data
    t('saidas', util(dia(1, 12)), 520, 'Saúde', 'PIX Itaú', 'Dentista (manutenção)');
    t('saidas', null, 350, 'Moradia', 'PIX', 'Conserto do chuveiro (sem data)', { competencia: dia(0, 1), data_indefinida: true, agendado: true });
    t('entradas', util(dia(1, 28)), 1500, 'Freelance', 'PIX', 'Projeto — cliente C (a receber)');
    // Pendências: um rascunho atrasado de recorrência e uma duplicata
    const atrasado = dia(0, 1) < HOJE ? dia(0, 1) : dia(-1, 28);
    const terapia = rec({ tipo: 'saidas', frequencia: 'mensal', dia_mes: Number(atrasado.slice(8)), valor: 200, metodo: 'PIX', categoria: 'Saúde', descricao: 'Terapia', inicio: atrasado });
    t('saidas', atrasado, 200, 'Saúde', 'PIX', 'Terapia', { recorrencia_id: terapia.id, a_confirmar: true });
    terapia.gerado_ate = atrasado;
    const dup = dia(-1, 15);
    t('saidas', dup, 89.9, 'Compras online', 'PIX', 'Capinha e película');
    t('saidas', dup, 89.9, 'Compras online', 'PIX', 'Capinha e película');
    // Um gasto no cartão inativo, para ele ainda aparecer nas faturas antigas
    t('saidas', dia(-4, 10), 210, 'Compras', 'Crédito Santander', 'Última compra no cartão antigo');

    // Faturas já pagas: as que venceram até hoje
    const faturas_pagas = [];
    Object.entries(CARTAO).forEach(([metodo, c]) => {
        for (let k = -4; k <= 0; k++) {
            const competencia = dia(k, 1), venc = dia(k, c.venc);
            if (venc < HOJE) faturas_pagas.push({ id: faturas_pagas.length + 1, user_id: U, metodo, competencia, pago: true, pago_em: venc + 'T12:00:00Z' });
        }
    });

    return {
        user: { id: U, email: '', is_anonymous: false, demo: true },
        tables: {
            menu_itens, transacoes, recorrencias, faturas_pagas,
            transacoes_importadas: [], feriados: [], pluggy_contas: [], lixeira: [], pluggy_credenciais: [], telegram_users: [], pluggy_faturas: [],
        },
    };
}

// Na Demo, o app conversa com o Supabase simulado. Edge Functions (Open Finance, backup, Telegram) não existem aqui.
if (MODO_DEMO) {
    window.supabase = {
        createClient: () => criarSupabaseSimulado(gerarDadosDemo(), {
            aoSair: sairDaDemo,
            invoke: async (nome) => nome === 'recorrencias'
                ? { data: { ok: true, criadas: 0 }, error: null }
                : { data: null, error: { message: 'Indisponível na Demo: crie sua conta para usar' } },
        }),
    };
}
