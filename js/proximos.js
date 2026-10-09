// Aba "Próximos": lançamentos do mês em exibição em diante, por mês e por Despesas/Receitas, mais o bloco de faturas de cartão.
// Extraído de ui.js (mesmas funções globais; carregado logo depois dele em index.html).

/**
 * Atualiza a aba "Próximas" — hoje só mostra o resumo de faturas de cartão
 * de crédito do mês em exibição (a lista de recorrências futuras não existe
 * mais, só há lançamentos avulsos/parcelados).
 */
/** Aba Próximos: dois grupos — Receita (o que ainda vai entrar) e Despesa (a fatura de cada cartão,
 *  com o botão "paga", e embaixo só os lançamentos que ainda não aconteceram, de cartão ou não). */
function renderProximasAgrupado(abertos = {}, futurasMeses = []) {
    const valorDe = t => (t.valorMes != null ? t.valorMes : t.valor) || 0;
    const soma = l => l.reduce((a, t) => a + valorDe(t), 0);
    const futuras = lista => (lista || []).filter(t => !_transacaoRealizada(t) && !t.aConfirmar) // rascunho de recorrência só aparece no grupo "A confirmar"
        .sort((a, b) => String(a.data).localeCompare(String(b.data)));
    const receitas = futuras(estadoApp.transacoes.entradas);
    const despesas = futuras(estadoApp.transacoes.saidas);
    const faturas = _faturasAPagar().filter(f => !f.paga); // mesma lógica do "A pagar"
    const abertosSub = abertos.__sub || {};
    // Nenhum grupo nasce aberto: só fica aberto o que você abriu
    const aberto = k => !!abertos[k];
    // Compras já feitas no cartão (+ créditos/estornos) que compõem cada fatura em aberto
    const feita = t => _transacaoRealizada(t);
    const estornos = new Set();
    const itensDe = f => {
        const compras = (estadoApp.transacoes.saidas || []).filter(t => t.metodo === f.rot && feita(t));
        (estadoApp.transacoes.entradas || []).filter(t => t.metodo === f.rot && feita(t)).forEach(t => { estornos.add(t); compras.push(t); });
        return compras.sort((a, b) => String(b.data).localeCompare(String(a.data)));
    };
    const totalDespesa = soma(despesas) + faturas.reduce((acc, f) => acc + f.total, 0);
    const grupo = (nome, chave, cor, contagem, total, corpo, unico = false) => `
        <details class="fatura-item" data-pend="${chave}" style="--cor-cartao:${cor}" ${aberto(chave) ? 'open' : ''}>
          <summary>
            <span class="fatura-nome">${nome}</span>
            <span class="fatura-contagem">${contagem}</span>
            <span class="fatura-espaco"></span>
            <span class="fatura-total">${formatarMoeda(total)}</span>
          </summary>
          <div class="fatura-itens">${corpo}</div>
        </details>`;
    // Um mês (competência): subgrupos Receitas/Despesas, só os que têm lançamento
    const mesCom = (comp, recs, desps, comFaturas) => {
        const fats = comFaturas ? faturas : [];
        const temD = desps.length || fats.length;
        const unico = !!recs.length !== !!temD;
        const totD = soma(desps) + fats.reduce((acc, f) => acc + f.total, 0);
        const faturaUnica = fats.length === 1 && desps.length === 0;
        const r = recs.length
            ? grupo('Receitas', `${comp}:receita`, 'var(--receita-text)', recs.length, soma(recs), _htmlListaComSemanal(recs, t => gerarHTMLTransacao(t, 'entrada', { semRelogio: true }), 'var(--receita-text)', 'entrada'), unico)
            : '';
        const d = temD
            ? grupo('Despesas', `${comp}:despesa`, 'var(--despesa-text)', desps.length + fats.length, totD,
                fats.map(f => _htmlSubgrupoFatura(f, itensDe(f), totD, 'saida', abertosSub, estornos, faturaUnica)).join('') + _htmlListaComSemanal(desps, t => gerarHTMLTransacao(t, 'saida', { semRelogio: true }), 'var(--despesa-text)', 'saida'), unico)
            : '';
        return { html: r + d, qtd: recs.length + desps.length + fats.length };
    };
    const mesSel = estadoApp.mesAtual || new Date();
    const compSel = `${mesSel.getFullYear()}-${String(mesSel.getMonth() + 1).padStart(2, '0')}`;
    const rotuloMes = comp => { const [a, m] = comp.split('-').map(Number); const t = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };
    // "Novembro/2026" -> "NOV/26" -> "11/26" conforme a largura (ver .mes-longo/.mes-med/.mes-num no CSS)
    const _rotuloMesCurto = comp => {
        const [a, m] = comp.split('-').map(Number);
        const nome = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
        const tri = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
        return `<span class="mes-longo">${nome.charAt(0).toUpperCase() + nome.slice(1)}/${a}</span><span class="mes-med">${tri}/${String(a).slice(2)}</span><span class="mes-num">${String(m).padStart(2, '0')}/${String(a).slice(2)}</span>`;
    };
    const meses = new Map([[compSel, mesCom(compSel, receitas, despesas, true)]]);
    futurasMeses.forEach(([comp, recs, desps]) => meses.set(comp, mesCom(comp, recs, desps, false)));
    return [...meses.entries()].filter(([, m]) => m.qtd).sort((a, b) => a[0].localeCompare(b[0]))
        .map(([comp, m]) => `
        <details class="fatura-item" data-pend="mes:${comp}" ${abertos['mes:' + comp] ? 'open' : ''}>
          <summary>
            <span class="fatura-nome">${_rotuloMesCurto(comp)}</span>
            <span class="fatura-contagem">${m.qtd}</span>
          </summary>
          <div class="fatura-itens">${m.html}</div>
        </details>`).join('');
}

/** Lançamentos ainda não realizados dos meses DEPOIS do mês em exibição, agrupados por competência:
 *  [[ 'YYYY-MM', receitas[], despesas[] ], ...] (cronológico). Os do mês em exibição já estão em memória. */
async function _carregarProximosMesesFuturos() {
    const mes = estadoApp.mesAtual || new Date();
    const prox = new Date(mes.getFullYear(), mes.getMonth() + 1, 1);
    const ini = `${prox.getFullYear()}-${String(prox.getMonth() + 1).padStart(2, '0')}-01`;
    try {
        const { data, error } = await transacoesFuturasAPI(ini, hojeISO());
        if (error) throw error;
        const porMes = new Map();
        (data || []).map(r => ({ ...mapearTransacao(r), tipo: r.tipo })).filter(t => !_transacaoRealizada(t) && !t.aConfirmar).forEach(t => {
            const comp = String(t.competencia).slice(0, 7);
            if (!porMes.has(comp)) porMes.set(comp, [[], []]);
            porMes.get(comp)[t.tipo === 'entradas' ? 0 : 1].push(t);
        });
        return [...porMes.entries()].map(([comp, [r, d]]) => [comp, r, d]);
    } catch (e) {
        console.error('Erro ao carregar próximos meses:', e);
        return [];
    }
}

async function atualizarProximasTransacoes() {
    const container = document.querySelector(SELECTORS.proximasLista);
    if (!container) return;

    try {
        // Lê o aberto/fechado ANTES de reescrever (a fatura também usa essa chave).
        const abertosPend = {};
        container.querySelectorAll('details.fatura-item[data-pend]').forEach(d => { abertosPend[d.dataset.pend] = d.open; });
        abertosPend.__sub = _lerAbertosSubgrupo(container);
        // Mudou o mês no calendário: o novo mês de início volta aberto (mesmo que já tenha aparecido fechado)
        const mA = estadoApp.mesAtual || new Date();
        const compA = `${mA.getFullYear()}-${String(mA.getMonth() + 1).padStart(2, '0')}`;
        if (window._proximasCompInicio !== compA) { delete abertosPend['mes:' + compA]; window._proximasCompInicio = compA; }
        const futuras = await _carregarProximosMesesFuturos();
        const html = renderProximasAgrupado(abertosPend, futuras);
        container.innerHTML = html || `<p class="empty-message">Nada a receber, a pagar nem fatura daqui em diante</p>`;
        container.onclick = html ? _onCliqueProximas : null;
        container.querySelectorAll('.subgrupo-organizador').forEach(_ajustarLabelsFiltro);
    } catch (error) {
        console.error('Erro ao atualizar próximas transações:', error);
        container.innerHTML = '<p class="empty-message">Erro ao carregar próximas transações</p>';
    }
}

/** Grupos "A receber" e "A pagar" da aba Próximos: lançamentos do mês em
 *  exibição que ainda não aconteceram (mesma regra do card de resumo —
 *  _transacaoRealizada), fora os de cartão de crédito, que aparecem em
 *  "Faturas". Abertos por padrão. */
function renderPendentesProximas(abertos = {}, termo = '') {
    const metodos = (estadoApp.menus && (estadoApp.menus.metodosTodos || estadoApp.menus.metodos)) || [];
    const rotulosCredito = new Set(metodos.filter(m => m.metodoKind === 'Crédito').map(m => rotuloMetodo(m)));
    const valorDe = t => (t.valorMes != null ? t.valorMes : t.valor) || 0;
    const pend = lista => _filtrarPorBusca(lista || [], termo)
        .filter(t => !rotulosCredito.has(t.metodo) && !_transacaoRealizada(t) && !t.aConfirmar)
        .sort((a, b) => String(a.data).localeCompare(String(b.data)));
    const grupo = (nome, chave, lista, tipoUI) => {
        if (!lista.length) return '';
        const total = lista.reduce((acc, t) => acc + valorDe(t), 0);
        return `
        <details class="fatura-item" data-pend="${chave}" ${abertos[chave] ? 'open' : ''}>
          <summary>
            <span class="fatura-nome">${nome}</span>
            <span class="fatura-contagem">${_contarVisuais(lista)}</span>
            <span class="fatura-espaco"></span>
            <span class="fatura-total">${formatarMoeda(total)}</span>
          </summary>
          <div class="fatura-itens">${lista.map(t => gerarHTMLTransacao(t, tipoUI, { semRelogio: true })).join('')}</div>
        </details>`;
    };
    // Despesas a pagar: um grupo por forma de pagamento ("PIX", "Dinheiro"...; todo "PIX <banco>" é PIX)
    const nomeForma = t => (/^pix(\s|$)/i.test(String(t.metodo || '').trim()) ? 'PIX' : (t.metodo || 'Sem forma de pagamento'));
    const porForma = new Map();
    pend(estadoApp.transacoes.saidas).forEach(t => { const k = nomeForma(t); porForma.set(k, [...(porForma.get(k) || []), t]); });
    const gruposPagar = [...porForma.entries()]
        .sort((a, b) => b[1].reduce((x, t) => x + valorDe(t), 0) - a[1].reduce((x, t) => x + valorDe(t), 0))
        .map(([nome, lista]) => grupo(nome, 'pagar:' + nome, lista, 'saida')).join('');
    return grupo('A receber', 'receber', pend(estadoApp.transacoes.entradas), 'entrada') + gruposPagar;
}

/** Bloco "Faturas de cartão de crédito": cada cartão com o total lançado no
 *  mês e o dia de vencimento — colapsável, com os lançamentos daquele
 *  cartão dentro (despesas + estornos/reembolsos que abatem a fatura),
 *  fechado por padrão. */
function renderFaturasCartao(container, termo = '', soNaoRealizadas = false) {
    const mes = estadoApp.mesAtual || new Date();
    const compMes = `${mes.getFullYear()}-${String(mes.getMonth() + 1).padStart(2, '0')}-01`;
    // cartão desativado não tem fatura nos meses depois de ter sido desativado
    const cartoes = ((estadoApp.menus && (estadoApp.menus.metodosTodos || estadoApp.menus.metodos)) || [])
        .filter(m => m.metodoKind === 'Crédito' && itemAtivoEm(m, compMes));
    if (!cartoes.length) return '';
    const ultimoDia = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
    const coresMet = (estadoApp.menus && estadoApp.menus.cores && estadoApp.menus.cores.metodo) || {};
    const valorDe = t => (t.valorMes != null ? t.valorMes : t.valor) || 0;

    const abertos = {};
    container?.querySelectorAll('details.fatura-item[data-nome]').forEach(d => { abertos[d.dataset.nome] = d.open; });
    const abertosSub = _lerAbertosSubgrupo(container);
    // Pseudo-tipoUI fixo pro estado do sub-filtro: a fatura mistura despesas
    // (a maioria) com estornos/reembolsos (poucos), então não há um único
    // tipoUI "certo" — usa 'saida' (é uma tela de cartão de crédito).
    const TIPO_UI_FATURA = 'saida';

    const linhas = cartoes.map(m => {
        const rot = rotuloMetodo(m);
        const naoFiltra = t => !t.aConfirmar && (!soNaoRealizadas || !_transacaoRealizada(t));
        const despesas = _filtrarPorBusca(estadoApp.transacoes.saidas.filter(t => t.metodo === rot), termo).filter(naoFiltra);
        // Receita com esse método = estorno/reembolso lançado na fatura —
        // abate do total, não é receita separada (ver calcularResumoMes).
        const estornos = _filtrarPorBusca(estadoApp.transacoes.entradas.filter(t => t.metodo === rot), termo).filter(naoFiltra);
        const totalDespesas = despesas.reduce((s, t) => s + valorDe(t), 0);
        const totalEstornos = estornos.reduce((s, t) => s + valorDe(t), 0);
        const total = totalDespesas - totalEstornos;
        if (!total) return '';
        const diaV = Math.min(parseInt(m.diaVencimento, 10) || 1, ultimoDia);
        const venc = `${String(diaV).padStart(2, '0')}/${String(mes.getMonth() + 1).padStart(2, '0')}`;
        const cor = coresMet[rot] || (corPadraoChip(rot));
        const chaveFatura = `proximas:fatura:${rot}`;
        const todos = _ordenarPorGrupo([...despesas, ...estornos], chaveFatura);
        const tipoUiDe = t => t.tipo === 'entradas' ? 'entrada' : 'saida';

        // Mesmo organizador inline dos outros grupos (Categoria/Recorrência —
        // "Forma de pgto." fica de fora porque a fatura JÁ é agrupada por
        // cartão/método). Cada item pode ser despesa ou receita (estorno),
        // então o corpo é montado na mão aqui (não dá pra usar
        // _corpoGrupoComSubmodo/gerarHTMLTransacao com 1 tipoUI só pra tudo).
        const subAtual = _subModoGrupoDe(TIPO_UI_FATURA, 'metodo', rot);
        let itensHTML;
        if (subAtual === 'cronologica') {
            itensHTML = _htmlListaComSemanal(todos, t => gerarHTMLTransacao(t, tipoUiDe(t), { semMetodoChip: true }), 'var(--despesa-text)', 'saida');
        } else {
            const cfg = _dimensaoSubmodo(subAtual, true);
            const mapa = new Map();
            todos.forEach(t => {
                const k = cfg.chaveDe(t) || cfg.semChave;
                if (!mapa.has(k)) mapa.set(k, []);
                mapa.get(k).push(t);
            });
            const gruposSub = [...mapa.entries()]
                .map(([nome, its]) => [nome, _ordenarPorGrupo(its, `${chaveFatura}:sub:${nome}`), its.reduce((s, t) => s + valorDe(t), 0)])
                .sort((a, b) => b[2] - a[2]);
            itensHTML = gruposSub.map(([nome, its, totalSub]) => {
                const pctSub = total ? (totalSub / total) * 100 : 0;
                const corSub = (cfg.corDe ? cfg.corDe(nome) : null) || corPadraoChip(nome);
                const abertoSub = !!abertosSub[nome];
                return `
                <details class="subgrupo" data-nome="${String(nome).replace(/"/g, '&quot;')}" style="--cor-rec:${corSub}" ${abertoSub ? 'open' : ''}>
                  <summary class="subgrupo-cab">
                    <span class="subgrupo-nome">${nome}</span>
                    <span class="subgrupo-espaco"></span>
                    <span class="subgrupo-contagem">${_contarVisuais(its)}</span>
                    <span class="subgrupo-total"><span class="tot-valor">${formatarMoeda(totalSub)}</span>${total ? `<span class="tot-pct"><i class="tot-sep"> · </i>${formatarPct(pctSub)}%</span>` : ''}</span>
                  </summary>
                  ${_htmlListaComSemanal(its, t => gerarHTMLTransacao(t, tipoUiDe(t), { semMetodoChip: true }), corSub, 'saida')}
                </details>`;
            }).join('');
        }
        const organizadorHTML = _renderOrganizadorInline(TIPO_UI_FATURA, 'metodo', rot, true, todos);

        // Conferência com a fatura do banco (Open Finance): só fora da busca (lá o
        // total é parcial) e quando a Pluggy já trouxe a fatura desse mês.
        let confereBadge = '', confereLinha = '';
        if (!termo) {
            const mesISO = `${mes.getFullYear()}-${String(mes.getMonth() + 1).padStart(2, '0')}`;
            const banco = (estadoApp.faturasBanco || []).find(f => f.metodoId === m.id && String(f.vencimento).slice(0, 7) === mesISO);
            if (banco) {
                const dif = Math.round((total - banco.total) * 100) / 100;
                const vB = String(banco.vencimento).slice(0, 10).split('-').reverse().slice(0, 2).join('/');
                const bate = Math.abs(dif) < 0.005;
                confereBadge = bate
                    ? '<span class="fatura-confere ok" title="Confere com a fatura do banco">✓</span>'
                    : `<span class="fatura-confere dif" title="Diferença de ${formatarMoeda(Math.abs(dif))} em relação à fatura do banco">⚠</span>`;
                confereLinha = `<div class="fatura-banco ${bate ? 'ok' : 'dif'}">🏦 Fatura do banco: <b>${formatarMoeda(banco.total)}</b> (vcto. ${vB})<br>${bate
                    ? '✓ confere com o lançado'
                    : `⚠ ${dif > 0 ? 'lançado a mais' : 'falta lançar'}: <b>${formatarMoeda(Math.abs(dif))}</b>`}</div>`;
            }
        }

        return `
        <details class="fatura-item" data-nome="${rot.replace(/"/g, '&quot;')}" style="--cor-cartao:${cor}" ${abertos[rot] ? 'open' : ''}>
          <summary>
            <span class="fatura-nome">${rot}</span>
            <span class="fatura-contagem">${despesas.length + estornos.length}</span>
            <span class="fatura-espaco"></span>
            <span class="fatura-venc">vcto. ${venc}</span>
            ${confereBadge}
            <span class="fatura-total">${formatarMoeda(total)}</span>
          </summary>
          <div class="fatura-itens">${confereLinha}${_barraGrupo(organizadorHTML)}${itensHTML}</div>
        </details>`;
    }).filter(Boolean).join('');

    return linhas
        ? `<div class="faturas-cartao">${linhas}</div>`
        : '';
}
