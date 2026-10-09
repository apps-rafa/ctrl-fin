/**
 * PENDÊNCIAS — o que está esperando uma decisão sua, de todos os meses recentes:
 *  - duplicatas suspeitas (mesma regra do grupo "Duplicatas": ver _detectarDuplicatas em ui.js);
 *  - rascunhos de recorrências: ocorrências "a confirmar" que já venceram (data de hoje ou anterior).
 * A barra no topo da página só aparece quando há pendência; ao abrir, os itens ficam por mês, no mesmo padrão
 * visual e de agrupamento de Próximos (mês sem borda; subgrupos com a sua).
 */

let _pendencias = { total: 0, meses: new Map() };
let _pendenciasTimer = null;

const _compDe = t => String(t.competencia || t.data).slice(0, 7);

/** Todas as transações, só com as colunas que a detecção de duplicatas usa (ver transacoesParaDuplicatasAPI em api.js). */
const _transacoesParaDuplicatas = () => transacoesParaDuplicatasAPI();

/** Busca no banco: TODAS as ocorrências "a confirmar" já vencidas (de qualquer mês anterior) e as duplicatas de TODOS os meses
 *  (mesma regra do grupo Duplicatas: mesmo valor, forma e descrição repetidos dentro do mesmo mês). */
let _pendenciasChave = null; // { versao, hoje, em } da última leitura bem-sucedida
const _PENDENCIAS_TTL_MS = 5 * 60 * 1000; // outro aparelho / o bot podem ter mexido: relê de vez em quando
async function carregarPendencias() {
    const hoje = hojeISO();
    // Nada foi escrito neste aparelho desde a última leitura (e é o mesmo dia): reaproveita, sem refazer a consulta pesada
    if (_pendenciasChave && _pendenciasChave.versao === window._transacoesVersao && _pendenciasChave.hoje === hoje && Date.now() - _pendenciasChave.em < _PENDENCIAS_TTL_MS) return;
    const versaoAoIniciar = window._transacoesVersao;
    try {
        const [rAc, todas] = await Promise.all([
            ocorrenciasVencidasAPI(hoje),
            _transacoesParaDuplicatas(),
        ]);
        if (rAc.error) throw rAc.error;
        const mapa = r => ({ ...mapearTransacao(r), tipo: r.tipo });
        const ac = (rAc.data || []).map(mapa);
        const candidatas = todas.filter(t => !t.aConfirmar && !(t.tipo === 'entradas' && _ehEstornoCartao(t)));
        const porMesTipo = new Map();
        candidatas.forEach(t => { const k = _compDe(t) + '|' + t.tipo; if (!porMesTipo.has(k)) porMesTipo.set(k, []); porMesTipo.get(k).push(t); });
        const idsDup = [];
        porMesTipo.forEach(lista => _detectarDuplicatas(lista).forEach(t => idsDup.push(t.id)));
        // só as duplicatas ganham a linha completa (para desenhar o lançamento)
        const completas = [];
        for (let i = 0; i < idsDup.length; i += 150) {
            const { data, error } = await transacoesPorIdsAPI(idsDup.slice(i, i + 150));
            if (error) throw error;
            completas.push(...(data || []).map(mapa));
        }
        const meses = new Map();
        const slot = c => { if (!meses.has(c)) meses.set(c, { ac: [], dups: [] }); return meses.get(c); };
        ac.forEach(t => slot(_compDe(t)).ac.push(t));
        completas.forEach(t => slot(_compDe(t)).dups.push(t));
        meses.forEach(m => m.dups.sort((x, y) => String(y.data).localeCompare(String(x.data))));
        let total = 0;
        meses.forEach(m => { total += m.ac.length + _numCopiasDuplicatas(m.dups); });
        _pendencias = { total, meses };
        _pendenciasChave = { versao: versaoAoIniciar, hoje, em: Date.now() };
    } catch (e) {
        console.error('Pendências indisponíveis:', e);
    }
}

function atualizarBarraPendencias() {
    const barra = document.getElementById('barraPendencias');
    if (!barra) return;
    const n = _pendencias.total;
    barra.hidden = n <= 0;
    const txt = document.getElementById('barraPendenciasTxt');
    if (txt) txt.textContent = `${n} pendência${n === 1 ? '' : 's'} para resolver`;
}

/** Recalcula depois que a tela atualiza (junta várias atualizações seguidas numa consulta só). */
function agendarPendencias() {
    clearTimeout(_pendenciasTimer);
    _pendenciasTimer = setTimeout(async () => {
        await carregarPendencias();
        atualizarBarraPendencias();
        if (document.getElementById('pendencias')?.classList.contains('active')) renderPendencias();
    }, 450);
}

function _rotuloMesPend(comp) {
    const [a, m] = comp.split('-').map(Number);
    const nome = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
    const tri = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
    const aa = String(a).slice(2);
    // "Novembro/2026" -> "NOV/26" -> "11/26" conforme a largura (mesmas classes de Próximos)
    return `<span class="mes-longo">${nome.charAt(0).toUpperCase() + nome.slice(1)}/${a}</span><span class="mes-med">${tri}/${aa}</span><span class="mes-num">${String(m).padStart(2, '0')}/${aa}</span>`;
}

function renderPendencias() {
    const container = document.getElementById('pendenciasLista');
    if (!container) return;
    const abertos = {};
    container.querySelectorAll('details[data-pend]').forEach(d => { abertos[d.dataset.pend] = d.open; });
    // tudo nasce fechado, exceto o mês selecionado no cabeçalho (e os grupos dele)
    const mA = estadoApp.mesAtual || new Date();
    const compSel = `${mA.getFullYear()}-${String(mA.getMonth() + 1).padStart(2, '0')}`;
    const aberto = (k, padrao) => (abertos[k] !== undefined ? abertos[k] : padrao);
    const valorDe = t => (t.valorMes != null ? t.valorMes : t.valor) || 0;
    const tipoUI = t => (t.tipo === 'entradas' ? 'entrada' : 'saida');
    const todos = [];
    const grupo = (chave, nome, cor, itens, opts, abrir, botoes = '') => {
        if (!itens.length) return '';
        itens.forEach(t => todos.push(t));
        // Duplicatas: o número e o total contam só as cópias (o que seria apagado); o original aparece, mas não conta
        const contados = opts && opts.comAprovarDuplicata ? _listaCopiasDuplicatas(itens) : itens;
        const total = contados.reduce((acc, t) => acc + valorDe(t), 0);
        return `
        <details class="fatura-item" data-pend="${chave}" style="--cor-cartao:${cor}" ${aberto(chave, false) ? 'open' : ''}>
          <summary>
            <span class="fatura-nome">${nome}</span>
            <span class="fatura-contagem">${contados.length}</span>
            ${botoes}
            <span class="fatura-espaco"></span>
            <span class="fatura-total">${formatarMoeda(total)}</span>
          </summary>
          <div class="fatura-itens">${opts && opts.comAprovarDuplicata ? _htmlConteudoDuplicatas(itens, (t, x) => gerarHTMLTransacao(t, tipoUI(t), { semRelogio: true, ...opts, ...x })) : itens.map(t => gerarHTMLTransacao(t, tipoUI(t), { semRelogio: true, ...opts })).join('')}</div>
        </details>`;
    };
    const html = [..._pendencias.meses.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([comp, m]) => {
        const corpo = grupo(`pend:${comp}:ac`, '🔁 A confirmar', 'var(--balanco-text)', m.ac.slice().sort((x, y) => String(x.data).localeCompare(String(y.data))), { comConfirmarOcorrencia: true }, comp === compSel, _botoesTodasAConfirmar())
            + grupo(`pend:${comp}:dup`, '📑 Duplicatas', 'var(--despesa-text)', m.dups, { comAprovarDuplicata: true }, comp === compSel, _botoesTodasDuplicatas(m.dups));
        if (!corpo) return '';
        return `
        <details class="fatura-item" data-pend="mes:${comp}" ${aberto('mes:' + comp, false) ? 'open' : ''}>
          <summary>
            <span class="fatura-nome">${_rotuloMesPend(comp)}</span>
            <span class="fatura-contagem">${m.ac.length + _numCopiasDuplicatas(m.dups)}</span>
          </summary>
          <div class="fatura-itens">${corpo}</div>
        </details>`;
    }).join('');
    _transacoesExtra = todos; // editar/confirmar/aprovar precisam achar o lançamento (ele pode ser de outro mês)
    container.innerHTML = html || '<p class="empty-message">Nenhuma pendência 🎉</p>';
    container.onclick = onListaTransacaoClick;
    ajustarBotoesTodas();
}

function iniciarPendencias() {
    document.getElementById('barraPendencias')?.addEventListener('click', () => mudarAba('pendencias'));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciarPendencias);
else iniciarPendencias();
