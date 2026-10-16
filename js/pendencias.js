/**
 * PENDÊNCIAS — o que está esperando uma decisão sua, de todos os meses recentes:
 *  - duplicatas suspeitas (mesma regra do grupo "Duplicatas": ver _detectarDuplicatas em ui.js);
 *  - rascunhos de recorrências: ocorrências "a confirmar" que já venceram (data de hoje ou anterior);
 *  - lançamentos soltos que parecem sessões de uma recorrência semanal (ver sugestao-recorrencia.js): Vincular / Não é.
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
        const [rAc, todas, rRec] = await Promise.all([
            ocorrenciasVencidasAPI(hoje),
            _transacoesParaDuplicatas(),
            listarRecorrenciasAPI(),
        ]);
        if (rAc.error) throw rAc.error;
        const recs = rRec.error ? [] : (rRec.data || []).map(mapearRecorrencia);
        const mapa = r => ({ ...mapearTransacao(r), tipo: r.tipo });
        const ac = (rAc.data || []).map(mapa);
        const candidatas = todas.filter(t => !t.aConfirmar && !(t.tipo === 'entradas' && _ehEstornoCartao(t)));
        const porMesTipo = new Map();
        candidatas.forEach(t => { const k = _compDe(t) + '|' + t.tipo; if (!porMesTipo.has(k)) porMesTipo.set(k, []); porMesTipo.get(k).push(t); });
        const recDeSugestao = new Map(); // id do lançamento -> recorrência semanal sugerida
        candidatas.forEach(t => { const r = sugerirRecorrenciaSemanal(t, recs); if (r) recDeSugestao.set(t.id, r); });
        const idsDup = [];
        porMesTipo.forEach(lista => _detectarDuplicatas(lista).forEach(t => idsDup.push(t.id)));
        // só as duplicatas ganham a linha completa (para desenhar o lançamento)
        const completas = [];
        const idsBusca = [...new Set([...idsDup, ...recDeSugestao.keys()])];
        for (let i = 0; i < idsBusca.length; i += 150) {
            const { data, error } = await transacoesPorIdsAPI(idsBusca.slice(i, i + 150));
            if (error) throw error;
            completas.push(...(data || []).map(mapa));
        }
        const setDup = new Set(idsDup);
        const meses = new Map();
        const slot = c => { if (!meses.has(c)) meses.set(c, { ac: [], dups: [], sug: [] }); return meses.get(c); };
        ac.forEach(t => slot(_compDe(t)).ac.push(t));
        completas.forEach(t => {
            if (setDup.has(t.id)) slot(_compDe(t)).dups.push(t);
            if (recDeSugestao.has(t.id)) slot(_compDe(t)).sug.push({ t, rec: recDeSugestao.get(t.id) });
        });
        meses.forEach(m => { m.dups.sort((x, y) => String(y.data).localeCompare(String(x.data))); m.sug.sort((x, y) => String(y.t.data).localeCompare(String(x.t.data))); });
        let total = 0;
        meses.forEach(m => { total += m.ac.length + _numCopiasDuplicatas(m.dups) + m.sug.length; });
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
    const grupoSug = (comp, sug) => {
        if (!sug.length) return '';
        const chave = `pend:${comp}:sug`;
        sug.forEach(x => todos.push(x.t));
        const itens = sug.map(({ t, rec }) => `
            ${gerarHTMLTransacao(t, tipoUI(t), { semRelogio: true })}
            <div class="sugestao-rec" data-sug-id="${t.id}" data-sug-rec="${rec.id}">
              <span class="sugestao-rec-txt">É da recorrência <b>${escaparHtml(rec.descricao || rec.categoria || 'Recorrência')}</b> <small>· semanal</small>?</span>
              <button type="button" class="mini-btn armed" data-sug-acao="vincular"><span class="mb-ico">🔗</span><span class="mb-txt"> Vincular</span></button>
              <button type="button" class="mini-btn" data-sug-acao="recusar"><span class="mb-ico">≠</span><span class="mb-txt"> Não é</span></button>
            </div>`).join('');
        return `
        <details class="fatura-item" data-pend="${chave}" style="--cor-cartao:var(--balanco-text)" ${aberto(chave, comp === compSel) ? 'open' : ''}>
          <summary>
            <span class="fatura-nome">🔗 Parece de uma recorrência</span>
            <span class="fatura-contagem">${sug.length}</span>
            <span class="fatura-espaco"></span>
            <span class="fatura-total">${formatarMoeda(sug.reduce((acc, x) => acc + valorDe(x.t), 0))}</span>
          </summary>
          <div class="fatura-itens">${itens}</div>
        </details>`;
    };
    const html = [..._pendencias.meses.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([comp, m]) => {
        const corpo = grupo(`pend:${comp}:ac`, '🔁 A confirmar', 'var(--balanco-text)', m.ac.slice().sort((x, y) => String(x.data).localeCompare(String(y.data))), { comConfirmarOcorrencia: true }, comp === compSel, _botoesTodasAConfirmar())
            + grupo(`pend:${comp}:dup`, '📑 Duplicatas', 'var(--despesa-text)', m.dups, { comAprovarDuplicata: true }, comp === compSel, _botoesTodasDuplicatas(m.dups))
            + grupoSug(comp, m.sug);
        if (!corpo) return '';
        return `
        <details class="fatura-item" data-pend="mes:${comp}" ${aberto('mes:' + comp, false) ? 'open' : ''}>
          <summary>
            <span class="fatura-nome">${_rotuloMesPend(comp)}</span>
            <span class="fatura-contagem">${m.ac.length + _numCopiasDuplicatas(m.dups) + m.sug.length}</span>
          </summary>
          <div class="fatura-itens">${corpo}</div>
        </details>`;
    }).join('');
    _transacoesExtra = todos; // editar/confirmar/aprovar precisam achar o lançamento (ele pode ser de outro mês)
    container.innerHTML = html || '<p class="empty-message">Nenhuma pendência 🎉</p>';
    container.onclick = e => (_cliqueSugestaoRec(e) ? null : onListaTransacaoClick(e));
    ajustarBotoesTodas();
}

/** Vincular / Não é, da sugestão de recorrência. true se o clique era dela. */
function _cliqueSugestaoRec(e) {
    const btn = e.target.closest('[data-sug-acao]');
    if (!btn) return false;
    const linha = btn.closest('.sugestao-rec');
    const id = Number(linha.dataset.sugId), recId = Number(linha.dataset.sugRec);
    const vincular = btn.dataset.sugAcao === 'vincular';
    const nome = linha.querySelector('b')?.textContent || 'recorrência';
    executarComDesfazer({
        texto: vincular ? `Vinculado à recorrência ${nome}` : 'Ok, não é desta recorrência', ids: [id],
        confirmar: async () => {
            const { error } = await (vincular ? vincularSemanalAPI(id, recId) : recusarSugestaoRecAPI(id));
            if (error) { console.error(error); mostrarNotificacao('Não consegui salvar', 'erro'); return; }
            _pendenciasChave = null;
            await recarregarDados();
            atualizarUI();
        },
    });
    return true;
}

function iniciarPendencias() {
    document.getElementById('barraPendencias')?.addEventListener('click', () => mudarAba('pendencias'));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciarPendencias);
else iniciarPendencias();
