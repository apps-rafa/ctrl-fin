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

/** Busca no banco (a tela só guarda o mês em exibição): a confirmar vencidas + os últimos 6 meses para achar duplicatas. */
async function carregarPendencias() {
    const hoje = hojeISO();
    const ref = new Date(); ref.setDate(1); ref.setMonth(ref.getMonth() - 5);
    try {
        const [rAc, rMes] = await Promise.all([
            sb.from('transacoes').select('*').eq('a_confirmar', true).lte('data', hoje).order('data', { ascending: true }).limit(500),
            sb.from('transacoes').select('*').gte('competencia', formatarDataISO(ref)).limit(3000),
        ]);
        if (rAc.error) throw rAc.error;
        if (rMes.error) throw rMes.error;
        const mapa = r => ({ ...mapearTransacao(r), tipo: r.tipo });
        const ac = (rAc.data || []).map(mapa);
        const mes = (rMes.data || []).map(mapa).filter(t => !t.aConfirmar && !(t.tipo === 'entradas' && _ehEstornoCartao(t)));
        const meses = new Map();
        const slot = c => { if (!meses.has(c)) meses.set(c, { ac: [], dups: [] }); return meses.get(c); };
        ac.forEach(t => slot(_compDe(t)).ac.push(t));
        const porMesTipo = new Map();
        mes.forEach(t => { const k = _compDe(t) + '|' + t.tipo; if (!porMesTipo.has(k)) porMesTipo.set(k, []); porMesTipo.get(k).push(t); });
        porMesTipo.forEach((lista, k) => { const d = _detectarDuplicatas(lista); if (d.length) slot(k.split('|')[0]).dups.push(...d); });
        let total = 0;
        meses.forEach(m => { total += m.ac.length + m.dups.length; });
        _pendencias = { total, meses };
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
    barra.classList.toggle('active', !!document.getElementById('pendencias')?.classList.contains('active'));
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
    const grupo = (chave, nome, cor, itens, opts, abrir) => {
        if (!itens.length) return '';
        itens.forEach(t => todos.push(t));
        const total = itens.reduce((acc, t) => acc + valorDe(t), 0);
        return `
        <details class="fatura-item" data-pend="${chave}" style="--cor-cartao:${cor}" ${aberto(chave, !!abrir) ? 'open' : ''}>
          <summary>
            <span class="fatura-nome">${nome}</span>
            <span class="fatura-contagem">${itens.length}</span>
            <span class="fatura-espaco"></span>
            <span class="fatura-total">${formatarMoeda(total)}</span>
          </summary>
          <div class="fatura-itens">${itens.map(t => gerarHTMLTransacao(t, tipoUI(t), { semRelogio: true, ...opts })).join('')}</div>
        </details>`;
    };
    const html = [..._pendencias.meses.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([comp, m]) => {
        const corpo = grupo(`pend:${comp}:ac`, '🔁 A confirmar', 'var(--balanco-text)', m.ac.slice().sort((x, y) => String(x.data).localeCompare(String(y.data))), { comConfirmarOcorrencia: true }, comp === compSel)
            + grupo(`pend:${comp}:dup`, '📑 Duplicatas', 'var(--despesa-text)', m.dups, { comAprovarDuplicata: true }, comp === compSel);
        if (!corpo) return '';
        return `
        <details class="fatura-item" data-pend="mes:${comp}" ${aberto('mes:' + comp, comp === compSel) ? 'open' : ''}>
          <summary>
            <span class="fatura-nome">${_rotuloMesPend(comp)}</span>
            <span class="fatura-contagem">${m.ac.length + m.dups.length}</span>
          </summary>
          <div class="fatura-itens">${corpo}</div>
        </details>`;
    }).join('');
    _transacoesExtra = todos; // editar/confirmar/aprovar precisam achar o lançamento (ele pode ser de outro mês)
    container.innerHTML = html || '<p class="empty-message">Nenhuma pendência 🎉</p>';
    container.onclick = onListaTransacaoClick;
}

function iniciarPendencias() {
    document.getElementById('barraPendencias')?.addEventListener('click', () => mudarAba('pendencias'));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciarPendencias);
else iniciarPendencias();
