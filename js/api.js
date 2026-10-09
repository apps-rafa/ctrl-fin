/**
 * API - SUPABASE
 * Comunicação com o banco de dados Supabase (Postgres).
 * Substitui as antigas chamadas fetch ao Google Apps Script.
 * Mantém as mesmas assinaturas de função usadas pelo resto do app.
 */

/**
 * Converte uma linha do banco (snake_case) para o formato usado na UI (camelCase)
 */
function mapearTransacao(row) {
    let valor = parseFloat(row.valor) || 0;
    // valorMes = valor do mês. Só o Semanal difere (Y = todas as sessões);
    // NÃO usar valor_total aqui — no parcelado ele é o total do parcelamento.
    let valorMes = valor;
    const semanas = Array.isArray(row.semanas) ? row.semanas : null;
    const valorSessao = row.valor_sessao != null ? parseFloat(row.valor_sessao) : null;

    // Semanal: X (realizado até hoje) e Y (total do mês) recalculados na leitura
    if (row.tipo_recorrencia === 'Semanal' && semanas && valorSessao != null) {
        const hoje = hojeISO();
        valor = semanas.filter(d => d <= hoje).length * valorSessao;   // X
        valorMes = semanas.length * valorSessao;                        // Y
    }

    return {
        id: row.id,
        data: row.data,
        valor,
        valorMes,
        valorSessao,
        semanas,
        metodo: row.metodo || '',
        categoria: row.categoria || '',
        descricao: row.descricao || '',
        formaPagamento: row.forma_pagamento || 'À vista',
        tipoRecorrencia: row.tipo_recorrencia || 'Pontual',
        proximaData: row.proxima_data || '',
        status: row.status || 'Ativa',
        cartaoId: row.cartao_id || null,
        grupoId: row.grupo_id || null,
        pendente: !!row.pendente,
        recorrenciaSemanalId: row.recorrencia_semanal_id || null, // ocorrência de recorrência SEMANAL: agrupada com o total, mesmo depois de confirmada
        recorrenciaId: row.recorrencia_id || null,   // ocorrência de uma recorrência (nulo = lançamento normal)
        aConfirmar: !!row.a_confirmar,               // gerada pela recorrência e ainda sem decisão do usuário
        duplicataOk: !!row.duplicata_ok, // "não é duplicata" confirmado (vale em todos os dispositivos)
        agendado: !!row.agendado, // lançamento programado: o "Pago"/"Recebido" aparece quando a data chega, até ser marcado
        pagoEm: row.pago_em ? String(row.pago_em).slice(0, 10) : null, // dia em que foi marcado como Pago/Recebido (fica marcado até o dia seguinte)
        dataIndefinida: !!row.data_indefinida, // recorrência mensal "Variável": só o mês é conhecido (mostra ?/mês)
        parcelaNum: row.parcela_num || null,
        parcelasTotal: row.parcelas_total || null,
        valorTotal: row.valor_total != null ? parseFloat(row.valor_total) : null,
        quitada: !!row.quitada,
        quitadoEm: row.quitado_em || null,
        competencia: row.competencia || '',
        diaRecorrencia: row.dia_recorrencia || '',
        diaSemana: row.dia_semana ?? null,
        origem: row.origem || null,
        pagarNoVencimento: !!row.pagar_no_vencimento
    };
}

/**
 * Primeiro e último dia (exclusivo) de um mês -> ['YYYY-MM-01', 'YYYY-MM-01' do mês seguinte]
 */
function intervaloDoMes(mes, ano) {
    const ini = `${ano}-${String(mes).padStart(2, '0')}-01`;
    const proxMes = mes === 12 ? 1 : mes + 1;
    const proxAno = mes === 12 ? ano + 1 : ano;
    const fim = `${proxAno}-${String(proxMes).padStart(2, '0')}-01`;
    return [ini, fim];
}

/**
 * Carrega transações de um tipo ('entradas' | 'saidas') num mês/ano
 */
async function carregarTransacoes(tipo, mes, ano) {
    try {
        const [ini, fim] = intervaloDoMes(mes, ano);

        const { data, error } = await sb
            .from('transacoes')
            .select('*')
            .eq('tipo', tipo)
            .gte('competencia', ini)
            .lt('competencia', fim)
            .order('data', { ascending: false });

        if (error) throw error;
        return (data || []).map(mapearTransacao);
    } catch (error) {
        console.error('Erro ao carregar transações:', error);
        return [];
    }
}

/**
 * Bolinha de cada mês no calendário do topo: 'passado' (já aconteceu, pelo
 * menos 1 lançamento não pendente com data até hoje) ou 'futuro' (só tem
 * lançamento a confirmar ou com data futura). Agrupa por `competencia`
 * (mesmo critério usado no resto do app pra "em que mês uma transação
 * entra"), olhando `data`/`pendente` só pra decidir se já aconteceu.
 * `iniISO`/`fimISO` (YYYY-MM-01) delimitam a janela de meses visível —
 * intervalo semiaberto [ini, fim).
 */
async function carregarIndicadoresMeses(iniISO, fimISO) {
    try {
        const { data, error } = await sb
            .from('transacoes')
            .select('competencia, data, pendente, agendado')
            .gte('competencia', iniISO)
            .lt('competencia', fimISO);
        if (error) throw error;

        const hoje = hojeISO();
        const porMes = {};
        (data || []).forEach(row => {
            const chave = String(row.competencia).slice(0, 7); // 'YYYY-MM'
            const jaAconteceu = aconteceuAteHoje(row, hoje);
            if (!porMes[chave]) porMes[chave] = { passado: false };
            if (jaAconteceu) porMes[chave].passado = true;
        });
        return porMes;
    } catch (error) {
        console.error('Erro ao carregar indicadores do calendário:', error);
        return {};
    }
}

/**
 * Carrega menus ativos (categorias e métodos) para os dropdowns do formulário
 * Mantém o formato { categorias: [...], metodos: [...] }
 */
async function carregarMenusAPI() {
    try {
        const { data, error } = await sb
            .from('menu_itens')
            .select('*')
            .order('ordem', { ascending: true, nullsFirst: false })
            .order('nome', { ascending: true });

        if (error) throw error;
        // Cores vêm de TODOS os itens (inclusive inativos: lançamentos antigos ainda usam o chip deles)
        const todos = (data || []).map(mapearItemMenu);
        const itens = todos.filter(i => i.status === 'Ativo');

        const cats = itens.filter(i => i.tipo === 'Categoria');
        const mapaCor = arr => Object.fromEntries(arr.map(i => [i.nome, corDoItemMenu(i)]));
        const metodos = itens.filter(i => i.tipo === 'Método');
        // Métodos são salvos nas transações pelo rótulo composto (rotuloMetodo:
        // "Crédito Bradesco"), não pelo nome cru do menu_itens ("Crédito -
        // Bradesco") — a cor precisa ser buscada pela mesma chave, senão o
        // gráfico cai no fallback de cor em vez de usar a cor escolhida.
        const mapaCorMetodo = arr => Object.fromEntries(arr.map(i => [rotuloMetodo(i), corDoItemMenu(i)]));
        return {
            categorias: cats.map(i => i.nome),
            categoriasDespesa: cats.filter(c => c.categoriaTipo !== 'entradas').map(i => i.nome),
            categoriasReceita: cats.filter(c => c.categoriaTipo === 'entradas').map(i => i.nome),
            // métodos como objetos (o formulário precisa do tipo/fechamento p/ competência)
            metodos,
            // inclui inativos: cartão que você parou de usar ainda tem fatura nos meses em que foi usado
            metodosTodos: todos.filter(i => i.tipo === 'Método'),
            cores: {
                categoria: mapaCor(todos.filter(i => i.tipo === 'Categoria')),
                categoriaDespesa: mapaCor(todos.filter(i => i.tipo === 'Categoria' && i.categoriaTipo !== 'entradas')),
                categoriaReceita: mapaCor(todos.filter(i => i.tipo === 'Categoria' && i.categoriaTipo === 'entradas')),
                metodo: mapaCorMetodo(todos.filter(i => i.tipo === 'Método'))
            }
        };
    } catch (error) {
        console.error('Erro ao carregar menus:', error);
        return { categorias: [], categoriasDespesa: [], categoriasReceita: [], metodos: [], cores: { categoria: {}, metodo: {} } };
    }
}

/**
 * Resumo de um tipo no mês: total + quebra por categoria
 */
async function carregarResumo(tipo, mes, ano) {
    try {
        const [ini, fim] = intervaloDoMes(mes, ano);

        const { data, error } = await sb
            .from('transacoes')
            .select('valor, categoria')
            .eq('tipo', tipo)
            .gte('competencia', ini)
            .lt('competencia', fim);

        if (error) throw error;

        let total = 0;
        const porCat = {};
        (data || []).forEach(r => {
            const v = parseFloat(r.valor) || 0;
            total += v;
            porCat[r.categoria] = (porCat[r.categoria] || 0) + v;
        });

        const porCategoria = Object.entries(porCat)
            .sort((a, b) => b[1] - a[1])
            .map(([categoria, valor]) => ({
                categoria,
                valor: parseFloat(valor.toFixed(2)),
                percentual: total > 0 ? ((valor / total) * 100).toFixed(1) : 0
            }));

        return { mes, ano, total: parseFloat(total.toFixed(2)), porCategoria };
    } catch (error) {
        console.error('Erro ao carregar resumo:', error);
        return { total: 0, porCategoria: [], mes, ano };
    }
}

/**
 * Monta o registro do banco a partir dos dados do formulário. Só existem 2
 * tipos hoje: Pontual (padrão) e Parcelada (compra de crédito dividida —
 * `dia_recorrencia` aqui é o dia de vencimento de cada parcela).
 */
function montarRegistro(dados) {
    const tipoRecorrencia = dados.tipoRecorrencia === 'Parcelada' ? 'Parcelada' : 'Pontual';
    return {
        tipo: dados.tipo,
        data: dados.data,
        valor: parseFloat(dados.valor) || 0,
        metodo: dados.metodo || null,
        categoria: dados.categoria,
        descricao: dados.descricao || '',
        forma_pagamento: dados.formaPagamento || 'À vista',
        tipo_recorrencia: tipoRecorrencia,
        dia_recorrencia: parseInt(dados.diaRecorrencia, 10) || null,
        competencia: dados.competencia || competenciaDe(dados.data),
        status: dados.status || 'Ativa',
        // De onde veio (pluggy) quando importado — não aparece na UI,
        // null pra lançamento manual. Ver schema.sql:transacoes.origem.
        origem: dados.origem || null,
        // Snapshot "cru" (como veio da fonte, antes do usuário editar
        // categoria/descrição/etc. na revisão) — mesma ideia do origem,
        // invisível na UI. Ver schema.sql:transacoes.dados_originais.
        dados_originais: dados.dadosOriginais || null,
        data_indefinida: !!dados.dataIndefinida,
        agendado: !!dados.dataIndefinida || (!!dados.data && String(dados.data).slice(0, 10) > hojeISO()) // data futura ou sem data = programado
    };
}

/**
 * Adiciona nova transação.
 * - Parcelada: uma linha por parcela.
 * - Pontual: uma linha.
 */
async function adicionarTransacaoAPI(dados) {
    if (dados.tipoRecorrencia === 'Parcelada') return adicionarParceladoAPI(dados);

    const { data, error } = await sb
        .from('transacoes')
        .insert(montarRegistro(dados))
        .select()
        .single();

    if (error) throw error;
    return mapearTransacao(data);
}

/** Número formatado sem símbolo: inteiro sem casas, senão 2 casas com vírgula */
function numParcela(x) {
    return Number.isInteger(x) ? String(x) : x.toFixed(2).replace('.', ',');
}

/** Valor "original" da parcela `num` (1-based) de um total, com n parcelas */
function valorParcelaOriginal(valorTotal, n, num) {
    const cent = Math.round(valorTotal * 100);
    const base = Math.floor(cent / n);
    const resto = cent - base * n;
    return (base + ((num - 1) < resto ? 1 : 0)) / 100;
}

/** Nome base da descrição de uma parcela (remove "k/n · ..." e sufixos) */
function nomeBaseParcela(descricao) {
    return String(descricao || '').replace(/\s+\d+\/\d+\s+·.*$/, '').trim();
}

/** Monta a descrição de uma parcela: "Nome k/n · vParc/vTotal" */
function descParcela(nome, num, n, valorParc, valorTotal, sufixo) {
    return `${nome} ${num}/${n} · ${numParcela(valorParc)}/${numParcela(valorTotal)}${sufixo ? ' · ' + sufixo : ''}`;
}

async function adicionarParceladoAPI(dados) {
    const n = Math.max(1, parseInt(dados.parcelas, 10) || 1);
    const grupoId = crypto.randomUUID();
    // dados.valor é o valor de CADA parcela; o total é valor x nº de parcelas
    const valorParcela = parseFloat(dados.valor) || 0;
    const total = Math.round(valorParcela * n * 100) / 100;

    const base = montarRegistro(dados);
    base.grupo_id = grupoId;
    base.parcelas_total = n;
    base.valor_total = total;

    const registros = [];
    for (let i = 0; i < n; i++) {
        const num = i + 1;
        const valor = valorParcelaOriginal(total, n, num);
        const competencia = i === 0 ? base.competencia : addMeses(base.competencia, i);
        // Cada parcela bate SEMPRE no mesmo dia da primeira (1 mês depois da anterior),
        // independente do vencimento do cartão — o vencimento só afeta a competência (fatura).
        const data = i === 0 ? base.data : addMeses(base.data, i);
        registros.push({
            ...base,
            valor,
            parcela_num: num,
            data,
            competencia,
            descricao: dados.descricao || ''   // exatamente o que o usuário digitou
        });
    }

    const { data, error } = await sb.from('transacoes').insert(registros).select();
    if (error) throw error;
    return (data || []).map(mapearTransacao);
}

/**
 * Quita (ou desfaz a quitação de) um parcelamento a partir da parcela `id`.
 * quitar=true: a parcela do mês recebe o saldo restante; as seguintes zeram,
 * ficam marcadas como quitadas e indicam o mês da quitação.
 * quitar=false: restaura os valores originais de todas as parcelas do grupo.
 */
async function quitarParcelamentoAPI(id, quitar) {
    const { data: alvo, error: e1 } = await sb.from('transacoes')
        .select('grupo_id, competencia, parcela_num, parcelas_total, valor_total, tipo_recorrencia')
        .eq('id', id).single();
    if (e1) throw e1;
    if (!alvo.grupo_id || alvo.tipo_recorrencia !== 'Parcelada') throw new Error('Não é um parcelamento');

    const { data: rows, error: e2 } = await sb.from('transacoes')
        .select('id, parcela_num')
        .eq('grupo_id', alvo.grupo_id).order('parcela_num');
    if (e2) throw e2;

    const n = alvo.parcelas_total || rows.length;
    const total = alvo.valor_total;

    let updates;
    if (quitar) {
        const k = alvo.parcela_num;
        const saldo = rows.filter(r => r.parcela_num >= k)
            .reduce((s, r) => s + valorParcelaOriginal(total, n, r.parcela_num), 0);
        const saldoR = Math.round(saldo * 100) / 100;

        updates = rows.filter(r => r.parcela_num >= k).map(r => r.parcela_num === k
            ? { id: r.id, patch: { valor: saldoR, quitada: false, quitado_em: alvo.competencia } }
            : { id: r.id, patch: { valor: 0, quitada: true, quitado_em: alvo.competencia } });
    } else {
        updates = rows.map(r => ({
            id: r.id,
            patch: {
                valor: valorParcelaOriginal(total, n, r.parcela_num),
                quitada: false, quitado_em: null
            }
        }));
    }

    for (const u of updates) {
        const { error } = await sb.from('transacoes').update(u.patch).eq('id', u.id);
        if (error) throw error;
    }
    return { mensagem: quitar ? 'Parcelamento quitado' : 'Quitação desfeita' };
}

/**
 * Edita uma transação (Pontual ou uma parcela individual de uma Parcelada —
 * edita só a parcela em questão, as outras da série não são tocadas).
 */
async function editarTransacaoAPI(dados) {
    if (!dados.id) throw new Error('ID é obrigatório para editar');

    const registro = montarRegistro(dados);
    delete registro.tipo;
    if (!registro.agendado) delete registro.agendado; // data de hoje/passada não desfaz um agendamento existente
    registro.a_confirmar = false; // salvar uma ocorrência (editada à mão) a confirma: vira lançamento normal, com o selo
    // origem/dados_originais são gravados só na criação (import) — editar um
    // lançamento pelo formulário normal nunca passa esses campos em `dados`,
    // então sem isto cada edição apagava o registro de origem/snapshot cru.
    delete registro.origem;
    delete registro.dados_originais;

    const { data, error } = await sb.from('transacoes')
        .update(registro).eq('id', dados.id).select().single();
    if (error) throw error;

    return mapearTransacao(data);
}

/**
 * Deleta uma transação. Parcelada: só a 1ª parcela pode ser apagada, e apaga
 * todas as parcelas da série junto.
 */
async function deletarTransacaoAPI(id) {
    const { data: alvo, error: e1 } = await sb
        .from('transacoes')
        .select('grupo_id, tipo_recorrencia, parcela_num')
        .eq('id', id).single();
    if (e1) throw e1;

    // Parcelamento: só a 1ª parcela pode ser apagada (e apaga todas)
    if (alvo.tipo_recorrencia === 'Parcelada' && alvo.grupo_id) {
        if ((alvo.parcela_num || 1) !== 1) {
            const { data: orig } = await sb.from('transacoes').select('competencia')
                .eq('grupo_id', alvo.grupo_id).eq('parcela_num', 1).single();
            const err = new Error('Só a primeira parcela pode ser apagada.');
            err.detalhe = { tipo: 'parcela-nao-original', competenciaOriginal: orig?.competencia || alvo.competencia };
            throw err;
        }
        const { data: linhas, error: eSel } = await sb.from('transacoes').select('*').eq('grupo_id', alvo.grupo_id);
        if (eSel) throw eSel;
        await moverParaLixeira(linhas);
        const { error } = await sb.from('transacoes').delete().eq('grupo_id', alvo.grupo_id);
        if (error) throw error;
        return { mensagem: 'Parcelamento removido' };
    }

    const { data: linha, error: eSel } = await sb.from('transacoes').select('*').eq('id', id);
    if (eSel) throw eSel;
    await moverParaLixeira(linha);
    const { error } = await sb.from('transacoes').delete().eq('id', id);
    if (error) throw error;
    return { mensagem: 'Transação removida' };
}

// ---------------------------------------------------------------------------
// Escritas em `transacoes` com nome (as telas chamam estas funções em vez de falar direto com a tabela): cada regra
// (o que "confirmar", "marcar pago", "aprovar duplicata" mudam no banco) fica em UM lugar. Todas devolvem { error }.
// ---------------------------------------------------------------------------
const _emIds = (q, ids) => (Array.isArray(ids) ? q.in('id', ids) : q.eq('id', ids));

/** ✓ numa ocorrência de recorrência (ou em várias): o rascunho vira lançamento normal. */
function confirmarOcorrenciasAPI(ids) {
    return _emIds(sb.from('transacoes').update({ a_confirmar: false }), ids);
}

/** "Não é duplicata": o lançamento (ou vários) deixa de ser avisado. */
function aprovarDuplicatasAPI(ids) {
    return _emIds(sb.from('transacoes').update({ duplicata_ok: true }), ids);
}

/** "Pago"/"Recebido": o lançamento deixa de ser "programado"; o checkbox fica marcado até o dia seguinte (pago_em = hoje).
 *  Se a data era variável, passa a ser hoje. */
function marcarPagoAPI(trans) {
    const campos = { agendado: false, pago_em: hojeISO() };
    if (trans.dataIndefinida) { campos.data = hojeISO(); campos.data_indefinida = false; }
    return sb.from('transacoes').update(campos).eq('id', trans.id);
}

/** Desmarca "Pago"/"Recebido" de hoje: volta a ser programado (o checkbox fica desmarcado, a data não muda). */
function desmarcarPagoAPI(trans) {
    return sb.from('transacoes').update({ agendado: true, pago_em: null }).eq('id', trans.id);
}

/** Apaga lançamento(s) pelo id, sem a regra de parcelas (use deletarTransacaoAPI para isso). */
/** Apaga por id, passando antes pela Lixeira (recuperável por 30 dias). Devolve { error }. */
async function apagarPorIdAPI(ids) {
    const { data: linhas, error: eSel } = await _emIds(sb.from('transacoes').select('*'), ids);
    if (eSel) return { error: eSel };
    try { await moverParaLixeira(linhas); } catch (error) { return { error }; }
    return _emIds(sb.from('transacoes').delete(), ids);
}

/** Ocorrências ainda "a confirmar" de uma recorrência (de `desde` em diante, ou todas). */
function _ocorrenciasAConfirmar(q, recorrenciaId, desde) {
    q = q.eq('recorrencia_id', recorrenciaId).eq('a_confirmar', true);
    return desde ? q.gte('data', desde) : q;
}
function apagarOcorrenciasDaRecorrenciaAPI(recorrenciaId, desde = null) {
    return _ocorrenciasAConfirmar(sb.from('transacoes').delete(), recorrenciaId, desde);
}
function atualizarOcorrenciasDaRecorrenciaAPI(recorrenciaId, campos, desde = null) {
    return _ocorrenciasAConfirmar(sb.from('transacoes').update(campos), recorrenciaId, desde);
}

/** Devolve ao banco uma linha de `transacoes` exatamente como estava (restaurar da lixeira). */
function restaurarTransacaoAPI(linha) {
    return sb.from('transacoes').insert(linha);
}

/** Uma parcela vinda da Pluggy: insere a linha pronta e devolve a transação já mapeada. */
function inserirLinhaTransacaoAPI(registro) {
    return sb.from('transacoes').insert(registro).select().single();
}

/** Renomeou uma forma de pagamento / categoria no cadastro: os lançamentos antigos acompanham o novo nome. */
function renomearMetodoNasTransacoesAPI(velho, novo) {
    return sb.from('transacoes').update({ metodo: novo }).eq('metodo', velho);
}
function renomearCategoriaNasTransacoesAPI(antiga, nova) {
    return sb.from('transacoes').update({ categoria: nova }).eq('categoria', antiga);
}

/** "Apagar tudo" (Configurações > Dados): remove todos os lançamentos do usuário logado. */
function apagarTodasTransacoesAPI() {
    return sb.from('transacoes').delete().gte('id', 0);
}

// ---------------------------------------------------------------------------
// Leituras de `transacoes` e operações em `recorrencias` com nome (mesma ideia das escritas acima).
// ---------------------------------------------------------------------------

/** A API devolve no máximo 1000 linhas por chamada: lê em páginas até acabar. `montar(de, ate)` devolve a consulta já com .range(). */
async function _lerEmPaginas(montar, tam = 1000) {
    const todas = [];
    for (let ini = 0; ini < 1000000; ini += tam) {
        const { data, error } = await montar(ini, ini + tam - 1);
        if (error) throw error;
        todas.push(...(data || []));
        if (!data || data.length < tam) break;
    }
    return todas;
}

/** Visão anual: as transações do ano (por competência), só com as colunas que a tabela usa. */
function transacoesDoAnoAPI(ano) {
    return _lerEmPaginas((a, b) => sb.from('transacoes')
        .select('id, tipo, valor, categoria, metodo, competencia, data, descricao')
        .gte('competencia', `${ano}-01-01`).lt('competencia', `${ano + 1}-01-01`)
        .order('id').range(a, b));
}

/** Busca em todos os meses: tudo (ou só um ano), da data mais recente para a mais antiga. */
function buscarTransacoesAPI(ano = null) {
    return _lerEmPaginas((a, b) => {
        let q = sb.from('transacoes').select('*');
        if (ano != null) q = q.gte('data', `${ano}-01-01`).lt('data', `${ano + 1}-01-01`);
        return q.order('data', { ascending: false }).order('id').range(a, b);
    });
}

/** As transações com data em [ini, fim). */
function transacoesDoPeriodoAPI(ini, fim) {
    return _lerEmPaginas((a, b) => sb.from('transacoes').select('*').gte('data', ini).lt('data', fim).order('id').range(a, b));
}

/** Todas as transações, só com as colunas da detecção de duplicatas, JÁ no formato da tela (duplicataOk, aConfirmar, recorrenciaId...):
 *  sem essa conversão o "não é duplicata" e as ocorrências de recorrência deixavam de ser reconhecidos. */
async function transacoesParaDuplicatasAPI() {
    const linhas = await _lerEmPaginas((a, b) => sb.from('transacoes')
        .select('id, tipo, valor, metodo, descricao, data, competencia, duplicata_ok, a_confirmar, recorrencia_id, recorrencia_semanal_id')
        .order('id', { ascending: true }).range(a, b));
    return linhas.map(r => ({
        id: r.id, tipo: r.tipo, valor: Number(r.valor), metodo: r.metodo, descricao: r.descricao || '',
        data: r.data, competencia: r.competencia, duplicataOk: !!r.duplicata_ok, aConfirmar: !!r.a_confirmar,
        recorrenciaId: r.recorrencia_id || null, recorrenciaSemanalId: r.recorrencia_semanal_id || null,
    }));
}

/** Linhas completas de alguns ids (quem chama divide em lotes). */
function transacoesPorIdsAPI(ids) {
    return sb.from('transacoes').select('*').in('id', ids);
}

/** Ocorrências "a confirmar" que já venceram. */
function ocorrenciasVencidasAPI(hoje) {
    return sb.from('transacoes').select('*').eq('a_confirmar', true).lte('data', hoje).order('data', { ascending: true }).limit(2000);
}

/** A parcela 1 de um parcelamento. */
function parcelaOriginalAPI(grupoId) {
    return sb.from('transacoes').select('*').eq('grupo_id', grupoId).eq('parcela_num', 1).limit(1);
}

/** Os últimos lançamentos CRIADOS (de qualquer mês). */
function ultimasTransacoesAPI(limite) {
    return sb.from('transacoes').select('*').order('criado_em', { ascending: false }).order('id', { ascending: false }).range(0, limite - 1);
}

/** Próximos: o que tem competência de `ini` em diante e ainda não aconteceu (data futura ou pendente). */
function transacoesFuturasAPI(ini, hoje) {
    return sb.from('transacoes').select('*').gte('competencia', ini).or(`data.gt.${hoje},pendente.eq.true`).order('data', { ascending: true }).limit(2000);
}

/** Pluggy: lançamentos que não vieram do banco, com data perto das do banco (para conciliar). */
function transacoesNaJanelaAPI(de, ate) {
    return sb.from('transacoes').select('id, tipo, valor, data, metodo, origem').gte('data', de).lte('data', ate);
}

/** Pluggy: o que já foi importado (para aprender a categoria de cada descrição). */
function transacoesImportadasPluggyAPI() {
    return sb.from('transacoes').select('categoria, dados_originais, data').eq('origem', 'pluggy').order('data', { ascending: false }).limit(3000);
}

// ---- recorrencias ----
function listarRecorrenciasAPI() { return sb.from('recorrencias').select('*').order('id'); }
function criarRecorrenciaAPI(campos, inicio) { return sb.from('recorrencias').insert({ ...campos, inicio, ativa_desde: inicio }); }
function atualizarRecorrenciaAPI(id, campos) { return sb.from('recorrencias').update(campos).eq('id', id); }
/** Muda o início: a geração recomeça do zero. */
function reiniciarRecorrenciaAPI(id, campos, inicio) { return atualizarRecorrenciaAPI(id, { ...campos, inicio, ativa_desde: inicio, gerado_ate: null }); }
function definirGeradoAteAPI(id, dataISO) { return atualizarRecorrenciaAPI(id, { gerado_ate: dataISO }); }
function encerrarRecorrenciaAPI(id, hoje) { return atualizarRecorrenciaAPI(id, { status: 'encerrada', encerrada_em: hoje }); }
function reativarRecorrenciaAPI(id, hoje, ontem) { return atualizarRecorrenciaAPI(id, { status: 'ativa', encerrada_em: null, ativa_desde: hoje, gerado_ate: ontem }); }
function excluirRecorrenciaAPI(id) { return sb.from('recorrencias').delete().eq('id', id); }
