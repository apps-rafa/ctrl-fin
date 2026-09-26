/**
 * CARREGAMENTO DE DADOS
 * Busca dados do API e popula estado
 */

/**
 * Carrega todos os dados do mês atual
 */
async function carregarDados() {
    estadoApp.carregando = true;
    
    try {
        const mes = estadoApp.mesAtual.getMonth() + 1;
        const ano = estadoApp.mesAtual.getFullYear();

        console.log(`📊 Carregando dados de ${mes}/${ano}...`);

        // Carregar entradas
        const entradas = await carregarTransacoes('entradas', mes, ano);
        estadoApp.transacoes.entradas = entradas;
        
        // Carregar saídas
        const saidas = await carregarTransacoes('saidas', mes, ano);
        estadoApp.transacoes.saidas = saidas;
        estadoApp.faturasPagas = await carregarFaturasPagasAPI();
        
        // Calcular resumo
        calcularResumoMes();
        
        console.log('✓ Dados carregados com sucesso');
        estadoApp.carregando = false;
        
        return true;
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        console.log('Usando dados simulados...');
        carregarDadosSimulados();
        estadoApp.carregando = false;
        
        return false;
    }
}

/**
 * Carrega dados de teste para quando API não responde
 */
function carregarDadosSimulados() {
    estadoApp.transacoes = {
        entradas: [
            {
                id: 2,
                data: '2026-09-30',
                valor: 8513.37,
                metodo: 'Transferência',
                categoria: 'Salário',
                descricao: 'Salário mensal',
                formaPagamento: 'À vista',
                tipoRecorrencia: 'Pontual',
                status: 'Ativa'
            }
        ],
        saidas: [
            {
                id: 2,
                data: '2026-09-05',
                valor: 344.00,
                metodo: 'Débito',
                categoria: 'Alimentação',
                descricao: 'Mercado',
                formaPagamento: 'À vista',
                tipoRecorrencia: 'Pontual',
                proximaData: '',
                status: 'Ativa'
            },
            {
                id: 3,
                data: '2026-09-03',
                valor: 229.80,
                metodo: 'PIX',
                categoria: 'Transporte app',
                descricao: 'Uber',
                formaPagamento: 'À vista',
                tipoRecorrencia: 'Pontual',
                proximaData: '',
                status: 'Ativa'
            },
            {
                id: 4,
                data: '2026-09-01',
                valor: 3280.25,
                metodo: 'Débito',
                categoria: 'Casa',
                descricao: 'Condomínio',
                formaPagamento: 'À vista',
                tipoRecorrencia: 'Pontual',
                status: 'Ativa'
            }
        ]
    };
    
    calcularResumoMes();
    console.log('⚠️ Usando dados simulados');
}

/**
 * Carrega e popula menus dinâmicos
 */
async function carregarMenus() {
    try {
        console.log('📑 Carregando menus...');

        if (typeof semearMenusPadraoSeVazio === 'function') {
            await semearMenusPadraoSeVazio();
        }

        const menus = await carregarMenusAPI();
        
        estadoApp.menus.categorias = menus.categorias || [];
        estadoApp.menus.categoriasDespesa = menus.categoriasDespesa || [];
        estadoApp.menus.categoriasReceita = menus.categoriasReceita || [];
        estadoApp.menus.metodos = menus.metodos || [];
        estadoApp.menus.metodosTodos = menus.metodosTodos || menus.metodos || [];
        estadoApp.menus.cores = menus.cores || { categoria: {}, metodo: {} };

        console.log('✓ Menus carregados:', estadoApp.menus);

        // Preencher dropdowns
        preencherDropdownCategorias();
        preencherDropdownMetodos();

        return true;
    } catch (error) {
        console.error('Erro ao carregar menus:', error);
        console.log('Usando categorias padrão...');
        
        // Usar fallback
        estadoApp.menus.categoriasDespesa = CATEGORIAS_PADRAO.saidas || [];
        estadoApp.menus.categoriasReceita = CATEGORIAS_PADRAO.entradas || [];
        estadoApp.menus.categorias = [...estadoApp.menus.categoriasDespesa, ...estadoApp.menus.categoriasReceita];
        preencherDropdownCategorias();
        
        return false;
    }
}

/**
 * Preenche dropdown de categorias
 */
function preencherDropdownCategorias() {
    const selectCategoria = document.querySelector(SELECTORS.categoria);
    
    if (!selectCategoria || selectCategoria.tagName !== 'SELECT') {
        return;
    }
    
    selectCategoria.innerHTML = '<option value="">Selecione...</option>';

    // Lista específica conforme o tipo do lançamento (receita x despesa)
    const lista = estadoApp.tipoAtual === 'entradas'
        ? estadoApp.menus.categoriasReceita
        : estadoApp.menus.categoriasDespesa;

    (lista && lista.length ? lista : estadoApp.menus.categorias).forEach(categoria => {
        const option = document.createElement('option');
        option.value = categoria;
        option.textContent = categoria;
        selectCategoria.appendChild(option);
    });
}

/**
 * Preenche dropdown de métodos de pagamento
 */
function preencherDropdownMetodos() {
    const sel = document.querySelector(SELECTORS.metodo);
    if (!sel) return;
    const atual = sel.value;
    sel.innerHTML = '<option value="">Selecione...</option>';
    (estadoApp.menus.metodos || []).forEach(m => {
        const label = rotuloMetodo(m);
        const o = document.createElement('option');
        o.value = label;
        o.textContent = label;
        sel.appendChild(o);
    });
    sel.value = atual;
    if (typeof atualizarCampoCredito === 'function') atualizarCampoCredito();
}

/** Método selecionado no formulário (objeto do menu) ou null */
function metodoSelecionado() {
    const label = document.querySelector(SELECTORS.metodo)?.value;
    return (estadoApp.menus.metodos || []).find(m => rotuloMetodo(m) === label) || null;
}

/**
 * Calcula resumo do mês
 */
function calcularResumoMes() {
    const hoje = hojeISO(); // data local; <= hoje já é realizado
    const r2 = n => parseFloat(n.toFixed(2));

    // Métodos de crédito: o gasto só "realiza" (sai da fatura em aberto) depois
    // que o vencimento da fatura daquela competência já passou.
    const metodosCredito = new Map(
        ((estadoApp.menus && (estadoApp.menus.metodosTodos || estadoApp.menus.metodos)) || [])
            .filter(m => m.metodoKind === 'Crédito')
            .map(m => [(typeof rotuloMetodo === 'function' ? rotuloMetodo(m) : m.nome), m])
    );

    // Para cada transação: total (Semanal usa valorMes/Y) e "atual" (já realizado)
    const somar = lista => {
        let total = 0, atual = 0;
        lista.forEach(t => {
            const tot = (t.valorMes != null ? t.valorMes : t.valor) || 0;
            let realizado;
            // "A pagar" = só o que tem data DEPOIS de hoje (inclusive no cartão de crédito)
            if (t.tipoRecorrencia === 'Semanal' && t.valorMes != null) {
                realizado = t.valor || 0;                 // X (sessões já ocorridas)
            } else {
                realizado = (!t.pendente && String(t.data).slice(0, 10) <= hoje) ? tot : 0;
            }
            total += tot;
            atual += realizado;
        });
        return { total: r2(total), atual: r2(atual), pendente: r2(total - atual) };
    };

    // Receita com método de cartão de crédito é estorno/reembolso lançado
    // na própria fatura (categoria fixa "Reembolso/Estorno" — ver
    // atualizarCampoMetodoReceita em js/ui.js), não dinheiro entrando de
    // verdade: abate da fatura desse cartão (Despesa) em vez de inflar a
    // Receita. Continua listada normalmente na aba Receita — só o resumo
    // do dashboard é que trata diferente.
    const entradasNormais = [], estornosCartao = [];
    estadoApp.transacoes.entradas.forEach(t =>
        (metodosCredito.has(t.metodo) ? estornosCartao : entradasNormais).push(t));

    const e = somar(entradasNormais);
    const s = somar(estadoApp.transacoes.saidas);
    const estorno = estornosCartao.length ? somar(estornosCartao) : { total: 0, atual: 0, pendente: 0 };

    // Despesa por CAMINHO DO DINHEIRO (não por quando comprou):
    //   pago      = o que já saiu (PIX/dinheiro até hoje + faturas vencidas ou marcadas como pagas)
    //   fatura    = compras do cartão JÁ feitas (data <= hoje) de faturas ainda em aberto
    //   avulsos   = o que ainda não aconteceu (PIX/dinheiro futuros e compras de cartão futuras,
    //               que ainda não bateram no cartão)
    const valorDe = t => (t.valorMes != null ? t.valorMes : t.valor) || 0;
    const mesVista = estadoApp.mesAtual || new Date();
    const compVista = `${mesVista.getFullYear()}-${String(mesVista.getMonth() + 1).padStart(2, '0')}-01`;
    const escolhasFatura = estadoApp.faturasPagas instanceof Map ? estadoApp.faturasPagas : new Map();
    let pago = 0, avulsos = 0;
    const porCartao = new Map();
    estadoApp.transacoes.saidas.forEach(t => {
        const tot = valorDe(t);
        const jaAconteceu = !t.pendente && String(t.data).slice(0, 10) <= hoje;
        if (metodosCredito.has(t.metodo)) {
            if (jaAconteceu) porCartao.set(t.metodo, (porCartao.get(t.metodo) || 0) + tot);
            else avulsos += tot;
        } else if (t.tipoRecorrencia === 'Semanal' && t.valorMes != null) {
            pago += t.valor || 0; avulsos += tot - (t.valor || 0);
        } else if (jaAconteceu) pago += tot;
        else avulsos += tot;
    });
    estornosCartao.forEach(t => {
        const tot = valorDe(t);
        if (!t.pendente && String(t.data).slice(0, 10) <= hoje) porCartao.set(t.metodo, (porCartao.get(t.metodo) || 0) - tot);
        else avulsos -= tot;
    });
    let faturaAberta = 0;
    porCartao.forEach((soma, rot) => {
        const cartao = metodosCredito.get(rot);
        const venc = cartao && cartao.diaVencimento ? dataVencimento(compVista, cartao.diaVencimento) : null;
        const escolha = escolhasFatura.get(rot + '|' + compVista);
        const paga = escolha !== undefined ? escolha : !!(venc && venc <= hoje);
        if (paga) pago += soma; else faturaAberta += soma;
    });

    estadoApp.resumo = {
        entradas: e.total,
        saidas: r2(s.total - estorno.total),
        balanco: r2(e.total - s.total + estorno.total),
        entradasAtual: e.atual,
        entradasAReceber: e.pendente,
        saidasAtual: r2(pago),
        saidasAPagar: r2(avulsos + faturaAberta),
        saidasAvulsos: r2(avulsos),
        saidasFatura: r2(faturaAberta)
    };

    console.log('📈 Resumo calculado:', estadoApp.resumo);
}

/**
 * Recarrega dados e atualiza UI
 */
async function recarregarDados() {
    console.log('🔄 Recarregando dados...');
    await carregarDados();
    atualizarUI();
    // Navegou de mês: o campo Data acompanha o mês em exibição (se intocado)
    if (typeof aplicarDataPadrao === 'function') aplicarDataPadrao(false);
}

/** Escolhas do usuário sobre faturas de cartão ("metodo|YYYY-MM-01" -> pago true/false); sem escolha vale a data de vencimento. */
async function carregarFaturasPagasAPI() {
    try {
        const { data, error } = await sb.from('faturas_pagas').select('metodo, competencia, pago');
        if (error) throw error;
        return new Map((data || []).map(r => [r.metodo + '|' + String(r.competencia).slice(0, 10), r.pago !== false]));
    } catch (e) {
        console.warn('Faturas pagas indisponíveis:', e.message || e);
        return new Map();
    }
}
