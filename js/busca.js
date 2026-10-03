// Busca universal e Recém-lançados: filtros por texto/valor/ano/mês, busca em todos os meses e resultado agrupado.
// Extraído de ui.js (mesmas funções globais; carregado logo depois dele em index.html).

/** Busca em tempo real por descrição/categoria/forma de pagamento — filtra
 *  ANTES de passar pro modo de visualização escolhido, então funciona
 *  igual em qualquer modo (Cronológica/Recorrência/Forma de pgto./
 *  Categoria) sem precisar mexer em cada um deles. */

const _REGEX_DIACRITICOS = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g');
function _normalizarBusca(s) {
    return String(s || '').normalize('NFD').replace(_REGEX_DIACRITICOS, '').toLowerCase();
}

const _MESES_BUSCA = {
    jan: 0, janeiro: 0, fev: 1, fevereiro: 1, mar: 2, marco: 2, março: 2, abr: 3, abril: 3, mai: 4, maio: 4,
    jun: 5, junho: 5, jul: 6, julho: 6, ago: 7, agosto: 7, set: 8, setembro: 8, out: 9, outubro: 9,
    nov: 10, novembro: 10, dez: 11, dezembro: 11,
};

/** Separa o texto da busca em filtros: ">100", "<50", "100-200" (valor), "2026" (ano),
 *  "jan"/"janeiro" (mês) e o resto, que continua sendo texto livre. */
function _parseConsulta(termo) {
    const num = x => parseFloat(String(x).replace(/\./g, '').replace(',', '.'));
    const q = { texto: '', frases: [], min: null, max: null, ano: null, mes: null };
    const texto = [];
    // "frase exata" (entre aspas): palavra(s) inteira(s), na ordem — sai do texto antes de separar os filtros
    const semAspas = String(termo || '').replace(/["“”]([^"“”]+)["“”]/g, (_, f) => { if (f.trim()) q.frases.push(_normalizarBusca(f.trim())); return ' '; });
    for (const p of semAspas.replace(/["“”]/g, ' ').trim().split(/\s+/).filter(Boolean)) {
        let m;
        if ((m = p.match(/^>=?(\d[\d.,]*)$/))) q.min = num(m[1]);
        else if ((m = p.match(/^<=?(\d[\d.,]*)$/))) q.max = num(m[1]);
        else if ((m = p.match(/^(\d[\d.,]*)-(\d[\d.,]*)$/))) { q.min = num(m[1]); q.max = num(m[2]); }
        else if (/^20\d\d$/.test(p)) q.ano = Number(p);
        else if (Object.prototype.hasOwnProperty.call(_MESES_BUSCA, p.toLowerCase())) q.mes = _MESES_BUSCA[p.toLowerCase()];
        else texto.push(p);
    }
    q.texto = texto.join(' ');
    return q;
}
const _consultaVazia = q => !q.texto && !(q.frases && q.frases.length) && q.min == null && q.max == null && q.ano == null && q.mes == null;

/** O lançamento bate com a consulta (texto + valor + ano + mês)? */
function _bateConsulta(tr, q, t) {
    const valor = (tr.valorMes != null ? tr.valorMes : tr.valor) || 0;
    if (q.min != null && valor < q.min) return false;
    if (q.max != null && valor > q.max) return false;
    const data = String(tr.data || '');
    if (q.ano != null && Number(data.slice(0, 4)) !== q.ano) return false;
    if (q.mes != null && Number(data.slice(5, 7)) - 1 !== q.mes) return false;
    if (q.frases && q.frases.length) {
        const campos = [tr.descricao, tr.categoria, tr.metodo, tr.formaPagamento].map(_normalizarBusca);
        const escapa = f => f.replace(/[^a-z0-9 ]/g, m => '\\' + m);
        const achou = f => campos.some(c => new RegExp('(^|[^a-z0-9])' + escapa(f) + '([^a-z0-9]|$)').test(c));
        if (!q.frases.every(achou)) return false;
    }
    if (!t) return true;
    const bateTexto = [tr.descricao, tr.categoria, tr.metodo, tr.formaPagamento]
        .some(campo => _normalizarBusca(campo).includes(t));
    if (bateTexto) return true;
    // Valor: aceita tanto formatado ("r$ 50,00") quanto número solto
    // ("50" ou "50,5") — sem isso, buscar por valor não achava nada.
    const valorFormatado = _normalizarBusca(formatarMoeda(valor));
    const valorSolto = String(valor).replace('.', ',');
    return valorFormatado.includes(t) || valorSolto.includes(t);
}

function _filtrarPorBusca(transacoes, termo) {
    const q = _parseConsulta(termo);
    if (_consultaVazia(q)) return transacoes;
    const t = _normalizarBusca(q.texto).trim();
    return (transacoes || []).filter(tr => _bateConsulta(tr, q, t));
}

/** "Recém-lançados": os últimos lançamentos CRIADOS (de qualquer mês), 5 por vez com
 *  "Carregar mais". Usa a mesma área dos resultados da busca. */
/** Parcela que não é a 1ª: só o lançamento original edita o parcelamento — avisa e abre o original. */
async function abrirOriginalDaParcela(parcela) {
    const tipoDe = t => (_transacoesExtra.find(x => x.id === t.id)?.tipo) || (estadoApp.transacoes.entradas.some(x => x.id === t.id) ? 'entradas' : 'saidas');
    let original = [...estadoApp.transacoes.entradas, ...estadoApp.transacoes.saidas, ..._transacoesExtra]
        .find(t => t.grupoId && t.grupoId === parcela.grupoId && t.parcelaNum === 1);
    let tipo = original ? tipoDe(original) : tipoDe(parcela);
    if (!original) {
        const { data, error } = await sb.from('transacoes').select('*').eq('grupo_id', parcela.grupoId).eq('parcela_num', 1).limit(1);
        if (error || !data || !data.length) { mostrarNotificacao('Não achei o lançamento original desta parcela', 'erro'); return; }
        original = mapearTransacao(data[0]);
        tipo = data[0].tipo;
    }
    mostrarDialogo({
        titulo: 'Editar parcelado',
        texto: `Um parcelamento é editado pelo lançamento <strong>original</strong> (1/${parcela.parcelasTotal}). Abrir o original?`,
        acoes: [
            { label: 'Cancelar' },
            { label: 'Abrir original', primario: true, onClick: () => { iniciarEdicaoTransacao(original, tipo); } },
        ],
    });
}

let _transacoesExtra = []; // itens mostrados fora do mês em tela (Recém-lançados) — editar/excluir precisam achá-los
async function mostrarRecemLancados(qtd = 5) {
    const box = document.getElementById('resultadoBusca');
    if (!box) return;
    box.hidden = false;
    box.dataset.modo = 'ampla'; // não deixa a atualização da tela/lixeira sobrescrever
    box.dataset.recentes = '1';
    box.dataset.recentesQtd = String(qtd);
    document.body.classList.add('buscando');
    if (typeof sincronizarBotoesTopo === 'function') sincronizarBotoesTopo();
    if (!box.querySelector('.rec-grupo-itens')) box.innerHTML = '<p class="loading">Carregando...</p>';
    const { data, error } = await sb.from('transacoes').select('*')
        .order('criado_em', { ascending: false }).order('id', { ascending: false }).range(0, qtd * 12 - 1);
    if (box.dataset.modo !== 'ampla') return; // o usuário já mudou de tela/busca
    if (error) { console.error(error); box.innerHTML = '<p class="empty-message">Erro ao carregar</p>'; return; }
    // Parcelas da mesma compra (grupo_id) viram UMA linha: a parcela 1
    const todos = (data || []).map(r => ({ ...mapearTransacao(r), tipo: r.tipo })).filter(t => !t.aConfirmar); // rascunho de recorrência só no grupo "A confirmar"
    const porGrupo = new Map();
    todos.forEach(i => { if (i.grupoId && (!porGrupo.has(i.grupoId) || (i.parcelaNum || 0) < (porGrupo.get(i.grupoId).parcelaNum || 0))) porGrupo.set(i.grupoId, i); });
    const vistos = new Set();
    const unicos = [];
    todos.forEach(i => {
        if (i.grupoId) { if (vistos.has(i.grupoId)) return; vistos.add(i.grupoId); unicos.push(porGrupo.get(i.grupoId)); }
        else unicos.push(i);
    });
    const itens = unicos.slice(0, qtd);
    _transacoesExtra = itens;
    const temMais = unicos.length > qtd || (data || []).length === qtd * 12;
    box.innerHTML = `
        <div class="busca-ampla-resumo">
            <b>🕓 Recém-lançados</b>
            <span>${itens.length} últimos</span>
        </div>
        <div class="rec-grupo-itens recentes-lista">${itens.map(i => gerarHTMLTransacao(i, i.tipo === 'entradas' ? 'entrada' : 'saida', { descReservada: true })).join('') || '<p class="empty-message">Nenhum lançamento ainda</p>'}</div>
        ${temMais ? `<button type="button" class="busca-ampla-btn" data-recentes-mais="${qtd + 5}">Carregar mais 5</button>` : ''}`;
    box.onclick = e => {
        const mais = e.target.closest('[data-recentes-mais]');
        if (mais) return mostrarRecemLancados(Number(mais.dataset.recentesMais));
        onListaTransacaoClick(e);
    };
}

// Resultados de busca mostram 5 por grupo, com "Carregar mais 5" (limites zeram quando a busca muda)
let _limitesBusca = { chave: '', mapa: {} };
function _limiteGrupoBusca(chaveBusca, grupo) {
    if (_limitesBusca.chave !== chaveBusca) _limitesBusca = { chave: chaveBusca, mapa: {} };
    return _limitesBusca.mapa[grupo] || 5;
}
function _maisNoGrupoBusca(chaveBusca, grupo) {
    _limiteGrupoBusca(chaveBusca, grupo);
    _limitesBusca.mapa[grupo] = (_limitesBusca.mapa[grupo] || 5) + 5;
}
function _htmlMaisGrupo(grupo, total, lim) {
    return total > lim ? `<button type="button" class="busca-ampla-btn" data-mais-grupo="${String(grupo).replace(/"/g, '&quot;')}">Carregar mais 5 <small>restam ${total - lim}</small></button>` : '';
}
/** Grupos "A confirmar" e "Duplicatas" dos resultados da busca (separados dos de Receitas/Despesas). */
function _htmlGruposFilaBusca(acs, dups, chaveBusca, abertos = {}) {
    const valorDe = t => (t.valorMes != null ? t.valorMes : t.valor) || 0;
    const tipoUI = t => (t.tipo === 'entradas' ? 'entrada' : 'saida');
    const grupo = (nome, titulo, cor, lista, opts) => !lista.length ? '' : `
    <details class="rec-grupo" data-nome="${nome}" style="--cor-rec:${cor}" ${abertos[nome] !== false ? 'open' : ''}>
      <summary>
        <span class="rec-grupo-nome">${titulo}</span>
        <span class="rec-grupo-contagem">${lista.length}</span>
        <span class="rec-grupo-total">${formatarMoeda(lista.reduce((s, x) => s + valorDe(x), 0))}</span>
      </summary>
      <div class="rec-grupo-itens">${lista.slice(0, _limiteGrupoBusca(chaveBusca, nome)).map(x => gerarHTMLTransacao(x, tipoUI(x), opts)).join('')}${_htmlMaisGrupo(nome, lista.length, _limiteGrupoBusca(chaveBusca, nome))}</div>
    </details>`;
    return grupo('__busca_aconfirmar__', '🔁 A confirmar', 'var(--text-muted)', acs, { comConfirmarOcorrencia: true })
        + grupo('__busca_duplicatas__', '📑 Duplicatas', 'var(--despesa-text)', dups, { comAprovarDuplicata: true });
}

/** ids das duplicatas de uma lista (mesma regra do grupo Duplicatas: dentro do mesmo mês e tipo; a confirmar fica de fora). */
function _idsDuplicatasLista(lista, chaveMes) {
    const grupos = new Map();
    lista.filter(t => !t.aConfirmar && !(t.tipo === 'entradas' && _ehEstornoCartao(t))).forEach(t => {
        const k = chaveMes(t) + '|' + t.tipo;
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k).push(t);
    });
    const ids = new Set();
    grupos.forEach(l => _detectarDuplicatas(l).forEach(t => ids.add(t.id)));
    return ids;
}

let _amplaCache = null; // { termo, linhas } — "Carregar mais" não refaz a consulta

/** Busca em TODOS os meses (não só o que está em tela), com os mesmos filtros de
 *  texto/valor/ano/mês, e mostra os achados agrupados por mês com os totais. */
async function buscarAmpla(termo) {
    const box = document.getElementById('resultadoBusca');
    if (!box) return;
    box.dataset.modo = 'ampla'; // impede que a busca da lixeira (assíncrona) sobrescreva o resultado
    const q = _parseConsulta(termo);
    const t = _normalizarBusca(q.texto).trim();
    let linhas = [];
    if (_amplaCache && _amplaCache.termo === termo) linhas = _amplaCache.linhas;
    else try {
        box.innerHTML = '<p class="loading">Buscando em todos os meses...</p>';
        for (let ini = 0; ; ini += 1000) {
            let consulta = sb.from('transacoes').select('*');
            if (q.ano != null) consulta = consulta.gte('data', `${q.ano}-01-01`).lt('data', `${q.ano + 1}-01-01`);
            const { data, error } = await consulta.order('data', { ascending: false }).order('id').range(ini, ini + 999);
            if (error) throw error;
            linhas.push(...(data || []));
            if (!data || data.length < 1000) break;
        }
    } catch (e) {
        console.error(e);
        box.innerHTML = '<p class="empty-message">Erro na busca</p>';
        return;
    }
    _amplaCache = { termo, linhas };
    if ((document.getElementById('buscaGlobal')?.value || '').trim() !== termo) return;
    const todosMapeados = linhas.map(r => ({ ...mapearTransacao(r), tipo: r.tipo }));
    const achadosTodos = todosMapeados.filter(tr => _bateConsulta(tr, q, t));
    const acs = achadosTodos.filter(tr => tr.aConfirmar);
    const itens = achadosTodos.filter(tr => !tr.aConfirmar);
    const idsDup = _idsDuplicatasLista(todosMapeados, x => String(x.competencia || x.data).slice(0, 7));
    const dups = itens.filter(tr => idsDup.has(tr.id));
    const brl = v => formatarMoeda(v);
    const soma = tipo => itens.filter(i => i.tipo === tipo).reduce((a, i) => a + (Number(i.valor) || 0), 0);
    const porMes = new Map();
    itens.forEach(i => { const k = String(i.data).slice(0, 7); porMes.set(k, [...(porMes.get(k) || []), i]); });
    const nomesMes = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const grupos = [...porMes.entries()].map(([k, lista]) => {
        const [a, m] = k.split('-').map(Number);
        const d = lista.filter(i => i.tipo === 'saidas').reduce((x, i) => x + (Number(i.valor) || 0), 0);
        const r = lista.filter(i => i.tipo === 'entradas').reduce((x, i) => x + (Number(i.valor) || 0), 0);
        return `
        <details class="rec-grupo" style="--cor-rec:var(--primary)" open>
          <summary>
            <span class="rec-grupo-nome">${nomesMes[m - 1].slice(0, 3).toUpperCase()}/${a}</span>
            <span class="rec-grupo-contagem">${lista.length}</span>
            <span class="rec-grupo-total">${d ? `-${brl(d)}` : ''}${d && r ? ' · ' : ''}${r ? `+${brl(r)}` : ''}</span>
          </summary>
          <div class="rec-grupo-itens">${lista.slice(0, _limiteGrupoBusca('a:' + termo, k)).map(i => gerarHTMLTransacao(i, i.tipo === 'entradas' ? 'entrada' : 'saida')).join('')}${_htmlMaisGrupo(k, lista.length, _limiteGrupoBusca('a:' + termo, k))}</div>
        </details>`;
    }).join('');
    box.innerHTML = `
        <div class="busca-ampla-resumo">
            <b>Todos os meses</b>
            <span>${itens.length} lançamento${itens.length === 1 ? '' : 's'}${itens.length ? ` · Despesas ${brl(soma('saidas'))} · Receitas ${brl(soma('entradas'))}` : ''}</span>
            ${(q.mes != null || q.ano != null) ? '' : '<button type="button" class="mini-btn" data-busca-mes>← só este mês</button>'}
        </div>
        ${_htmlGruposFilaBusca(acs, dups, 'a:' + termo)}
        ${(grupos || acs.length) ? grupos : `<div class="rec-grupo rec-grupo--vazio"><span class="rec-grupo-nome">🔎 Nada encontrado pra "${termo}"</span></div>`}`;
    _transacoesExtra = [...acs, ...itens]; // editar/excluir precisam achar lançamentos de qualquer mês
    box.dataset.termoAmpla = termo;
    box.onclick = e => {
        if (e.target.closest('[data-busca-mes]')) { atualizarBuscaGlobal(); return; }
        const mais = e.target.closest('[data-mais-grupo]');
        if (mais) { _maisNoGrupoBusca('a:' + termo, mais.dataset.maisGrupo); buscarAmpla(termo); return; }
        onListaTransacaoClick(e);
    };
}

/** Itens que a aba Próximos mostraria (A receber / A pagar sem cartão + tudo
 *  do cartão de crédito no mês) que batem com o termo. */
function _itensProximosBusca(termo) {
    const metodos = (estadoApp.menus && (estadoApp.menus.metodosTodos || estadoApp.menus.metodos)) || [];
    const credito = new Set(metodos.filter(m => m.metodoKind === 'Crédito').map(m => rotuloMetodo(m)));
    const todos = [...(estadoApp.transacoes.entradas || []), ...(estadoApp.transacoes.saidas || [])].filter(t => !t.aConfirmar);
    // Só o que AINDA não aconteceu (vencimento/pagamento não passou) — o que já
    // aconteceu aparece só em Receitas/Despesas, nunca nos dois grupos.
    return _filtrarPorBusca(todos, termo).filter(t => !_transacaoRealizada(t));
}

/** Busca UNIVERSAL: um campo só, de qualquer tela. Com termo, esconde o
 *  conteúdo da aba atual e mostra o resultado agrupado em Receitas / Despesas
 *  / Próximos (o mesmo lançamento pode aparecer em mais de um grupo — cada
 *  grupo espelha a sua aba). Sem termo, volta tudo como estava. */
function atualizarBuscaGlobal() {
    const termo = (document.getElementById('buscaGlobal')?.value || '').trim();
    const box = document.getElementById('resultadoBusca');
    document.body.classList.toggle('buscando', !!termo);
    if (!box) return;
    box.hidden = !termo;
    box.dataset.modo = '';
    box.dataset.recentes = '';
    if (typeof sincronizarBotoesTopo === 'function') sincronizarBotoesTopo();
    if (!termo) { box.innerHTML = ''; box.onclick = null; return; }

    // Mês ou ano na busca ("uber agosto", "2025") pede outros períodos: vai direto pra todos os meses
    const consulta = _parseConsulta(termo);
    if (consulta.mes != null || consulta.ano != null) { buscarAmpla(termo); return; }
    _renderBuscaDoMes(termo, box, _lerAbertosRecGrupo(box));
}

// Lançamentos do mês em exibição buscados PELA DATA (não pela competência): compras de cartão
// feitas neste mês que só vencem no seguinte também aparecem. Cache curto, limpo a cada atualizarUI.
let _buscaMesCache = null;
async function _linhasDoMesPorData() {
    const mes = estadoApp.mesAtual || new Date();
    const chave = `${mes.getFullYear()}-${mes.getMonth()}`;
    if (_buscaMesCache && _buscaMesCache.chave === chave) return _buscaMesCache.itens;
    const ini = `${mes.getFullYear()}-${String(mes.getMonth() + 1).padStart(2, '0')}-01`;
    const prox = new Date(mes.getFullYear(), mes.getMonth() + 1, 1);
    const fim = `${prox.getFullYear()}-${String(prox.getMonth() + 1).padStart(2, '0')}-01`;
    const linhas = [];
    for (let de = 0; ; de += 1000) {
        const { data, error } = await sb.from('transacoes').select('*').gte('data', ini).lt('data', fim).order('id').range(de, de + 999);
        if (error) throw error;
        linhas.push(...(data || []));
        if (!data || data.length < 1000) break;
    }
    const itens = linhas.map(r => ({ ...mapearTransacao(r), tipo: r.tipo }));
    _buscaMesCache = { chave, itens };
    return itens;
}

/** Resultado da busca no mês: só os grupos Receitas e Despesas (por data do lançamento) + lixeira. */
async function _renderBuscaDoMes(termo, box, abertos) {
    const valorDe = t => (t.valorMes != null ? t.valorMes : t.valor) || 0;
    const linkAmpla = `<button type="button" class="busca-ampla-btn" data-busca-ampla>🔎 Buscar em todos os meses <small>dica: &gt;100 &lt;50 100-200 2026 jan &quot;frase exata&quot;</small></button>`;
    const atual = () => (document.getElementById('buscaGlobal')?.value || '').trim() === termo && box.dataset.modo !== 'ampla';
    if (!box.querySelector('.rec-grupo')) box.innerHTML = linkAmpla + '<p class="loading">Buscando...</p>';
    let itens;
    try { itens = await _linhasDoMesPorData(); }
    catch (e) { console.error(e); if (atual()) box.innerHTML = linkAmpla + '<p class="empty-message">Erro na busca</p>'; return; }
    if (!atual()) return;
    const q = _parseConsulta(termo);
    const t = _normalizarBusca(q.texto).trim();
    const achadosTodos = itens.filter(tr => _bateConsulta(tr, q, t)).sort(_porDataDesc);
    const acs = achadosTodos.filter(tr => tr.aConfirmar);          // grupo "A confirmar"
    const achados = achadosTodos.filter(tr => !tr.aConfirmar);
    const idsDup = _idsDuplicatasLista(itens, () => 'mes');         // grupo "Duplicatas" (do mês, e que batem com a busca)
    const dups = achados.filter(tr => idsDup.has(tr.id));
    _transacoesExtra = achadosTodos; // editar/excluir precisam achar itens que não são da competência em tela
    // Estorno de cartão abate a fatura: fica em Despesas (com "+"), não em Receitas
    const receitas = achados.filter(x => x.tipo === 'entradas' && !_ehEstornoCartao(x));
    const despesas = achados.filter(x => x.tipo !== 'entradas' || _ehEstornoCartao(x));

    const grupo = (nome, titulo, cor, lista, tipoUI) => !lista.length ? '' : `
    <details class="rec-grupo" data-nome="${nome}" style="--cor-rec:${cor}" ${abertos[nome] !== false ? 'open' : ''}>
      <summary>
        <span class="rec-grupo-nome">${titulo}</span>
        <span class="rec-grupo-contagem">${lista.length}</span>
        <span class="rec-grupo-total">${formatarMoeda(lista.reduce((s, x) => s + (x.tipo === 'entradas' && tipoUI === 'saida' ? -valorDe(x) : valorDe(x)), 0))}</span>
      </summary>
      <div class="rec-grupo-itens">${lista.slice(0, _limiteGrupoBusca('m:' + termo, nome)).map(x => gerarHTMLTransacao(x, x.tipo === 'entradas' ? 'entrada' : tipoUI)).join('')}${_htmlMaisGrupo(nome, lista.length, _limiteGrupoBusca('m:' + termo, nome))}</div>
    </details>`;
    const html = _htmlGruposFilaBusca(acs, dups, 'm:' + termo, abertos) +
        grupo('__busca_receitas__', '⬇️ Receitas', 'var(--receita-text)', receitas, 'entrada') +
        grupo('__busca_despesas__', '⬆️ Despesas', 'var(--despesa-text)', despesas, 'saida');

    box.innerHTML = linkAmpla + html;
    box.onclick = e => {
        if (e.target.closest('[data-busca-ampla]')) return buscarAmpla(termo);
        const mais = e.target.closest('[data-mais-grupo]');
        if (mais) { _maisNoGrupoBusca('m:' + termo, mais.dataset.maisGrupo); return _renderBuscaDoMes(termo, box, _lerAbertosRecGrupo(box)); }
        return e.target.closest('[data-lixeira-restaurar], [data-lixeira-apagar]') ? onCliqueLixeira(e) : _onCliqueProximas(e);
    };

    // A lixeira (excluídos nos últimos 30 dias) também entra na busca.
    const vazio = () => `${linkAmpla}<div class="rec-grupo rec-grupo--vazio"><span class="rec-grupo-nome">🔎 Nada encontrado neste mês pra "${termo}"</span></div>`;
    if (typeof buscarLixeira !== 'function') { if (!html) box.innerHTML = vazio(); return; }
    buscarLixeira(termo).then(lix => {
        if (!atual()) return;
        if (!lix.length) { if (!html) box.innerHTML = vazio(); return; }
        const total = lix.reduce((s, i) => s + (Number((i.dados || {}).valor) || 0), 0);
        box.innerHTML = linkAmpla + html + `
        <details class="rec-grupo" data-nome="__busca_lixeira__" style="--cor-rec:var(--text-muted)" ${abertos.__busca_lixeira__ !== false ? 'open' : ''}>
          <summary>
            <span class="rec-grupo-nome">${ICONE_LIXEIRA} Lixeira</span>
            <span class="rec-grupo-contagem">${lix.length}</span>
            <span class="rec-grupo-total">${formatarMoeda(total)}</span>
          </summary>
          <div class="rec-grupo-itens">${lix.map(htmlItemLixeira).join('')}</div>
        </details>`;
    });
}
