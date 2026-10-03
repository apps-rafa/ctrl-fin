/**
 * INTERFACE DO USUÁRIO
 * Renderização e atualização do DOM
 */

/** Lê de localStorage o modo salvo pra essa lista, validando contra as opções atuais. */
function _modoListaSalvo(chave, validos) {
    try {
        const salvo = localStorage.getItem(chave);
        return validos.includes(salvo) ? salvo : 'cronologica';
    } catch (_) { return 'cronologica'; }
}

// Filtro de grupo da barra proporcional, um por combinação modo+tipo (um
// filtro escolhido em "Por método" não deve valer se o usuário for pra
// "Por categoria"). null = mostra tudo. Só usado pelos modos QUE NÃO SÃO
// Cronológica (essa já mostra os 2 grupos lado a lado, com o clique
// abrindo/fechando em vez de filtrar).
const _filtrosGrupoBarra = {};
const _filtroGrupoDe = (tipoUI, modo) => _filtrosGrupoBarra[`${tipoUI}:${modo}`] || null;
const _setFiltroGrupoBarra = (tipoUI, modo, valor) => { _filtrosGrupoBarra[`${tipoUI}:${modo}`] = valor; };

/** Agrupa `transacoes` pela MESMA dimensão que o modo de visualização usa
 *  (método/categoria) — usado só pra montar a barra proporcional com as
 *  cores/nomes certos; a lista embaixo continua sendo agrupada pelas
 *  funções renderListaPorMetodo/PorCategoria como sempre. */
function _agruparParaBarra(modo, transacoes, tipoUI) {
    const cores = (estadoApp.menus && estadoApp.menus.cores) || {};
    const valorDe = t => (t.valorMes != null ? t.valorMes : t.valor) || 0;
    let chaveDe, semChave, corMapa, rotuloDe = k => k;
    if (modo === 'metodo') {
        chaveDe = t => t.metodo; semChave = 'Sem método'; corMapa = cores.metodo || {};
    } else {
        chaveDe = t => t.categoria; semChave = 'Sem categoria'; corMapa = cores.categoria || {};
    }
    const mapa = new Map();
    transacoes.forEach(t => {
        const k = chaveDe(t) || semChave;
        if (!mapa.has(k)) mapa.set(k, []);
        mapa.get(k).push(t);
    });
    const grupos = [...mapa.entries()]
        .map(([chave, itens]) => ({
            chave,
            nome: rotuloDe(chave),
            cor: modo === 'metodo' ? (corMapa[chave] || corPadraoChip(chave)) : corDaCategoria(chave, tipoUI),
            total: itens.reduce((s, t) => s + valorDe(t), 0)
        }))
        .sort((a, b) => b.total - a.total);
    return { grupos, chaveDe, semChave };
}

/** Barra proporcional com 1 segmento por grupo da dimensão do modo atual
 *  (Por recorrência/método/categoria — Cronológica tem a sua própria,
 *  embutida em renderListaCronologica). Clique num segmento filtra a lista
 *  pra só aquele grupo; clicar de novo no mesmo volta a mostrar tudo. */
function _renderBarraGrupos(grupos, tipoUI, modo) {
    const totalGeral = grupos.reduce((s, g) => s + g.total, 0);
    if (!totalGeral) return '';
    const filtro = _filtroGrupoDe(tipoUI, modo);
    const segs = grupos.map(g => {
        const pct = (g.total / totalGeral) * 100;
        const apagado = filtro && filtro !== g.chave ? ' cron-barra-seg--apagado' : '';
        const chaveAttr = String(g.chave).replace(/"/g, '&quot;');
        return `<button type="button" class="cron-barra-seg${apagado}" data-grupo-toggle="${chaveAttr}"
                  style="--cor-rec:${g.cor}; flex-grow:${Math.max(pct, g.total ? 2 : 0)}"
                  title="${g.nome}: ${formatarPct(pct)}% · ${formatarMoeda(g.total)}" ${g.total ? '' : 'hidden'}></button>`;
    }).join('');
    return `<div class="cron-barra" role="img">${segs}</div>`;
}

/** IDs de transação que o usuário já confirmou "não é duplicata". O que vale é a coluna
 *  transacoes.duplicata_ok (banco: igual em todos os dispositivos); o localStorage ficou só como
 *  reserva do que ainda não subiu (ver sincronizarDuplicatasAprovadasLocais). */
function _duplicatasAprovadasSet() {
    try { return new Set(JSON.parse(localStorage.getItem('duplicatasAprovadas') || '[]')); }
    catch (_) { return new Set(); }
}
function _aprovarDuplicata(id) {
    // na memória (a tela já some com o aviso) e no banco
    [...(estadoApp.transacoes?.entradas || []), ...(estadoApp.transacoes?.saidas || []), ...(typeof _transacoesExtra !== 'undefined' ? _transacoesExtra : [])]
        .forEach(t => { if (t.id === id) t.duplicataOk = true; });
    Promise.resolve(sb.from('transacoes').update({ duplicata_ok: true }).eq('id', id)).then(({ error }) => {
        if (error) { // sem rede/erro: guarda no aparelho e tenta de novo na próxima abertura
            console.error('Erro ao salvar "não é duplicata":', error);
            const s = _duplicatasAprovadasSet(); s.add(id);
            try { localStorage.setItem('duplicatasAprovadas', JSON.stringify([...s])); } catch (_) {}
        }
    });
}
/** Sobe pro banco as aprovações antigas guardadas só neste aparelho (uma vez por aparelho). */
async function sincronizarDuplicatasAprovadasLocais() {
    const ids = [..._duplicatasAprovadasSet()].filter(Number.isFinite);
    if (!ids.length) return;
    const { error } = await sb.from('transacoes').update({ duplicata_ok: true }).in('id', ids);
    if (error) { console.error('Erro ao subir duplicatas aprovadas:', error); return; }
    try { localStorage.removeItem('duplicatasAprovadas'); } catch (_) {}
    await recarregarDados();
    atualizarUI();
}

/** Duplicata suspeita: mesmo valor, método e descrição (normalizada)
 *  aparecendo mais de uma vez no mês exibido — mesmo se a data for
 *  diferente (foi assim que os bugs de importação/reimportação desta
 *  sessão geraram duplicata real: a competência batia — por isso as duas
 *  apareciam juntas no mesmo mês — só a data é que ficava errada). Ignora
 *  transações já aprovadas ("não é duplicata mesmo"). */
function _detectarDuplicatas(transacoes) {
    const aprovadas = _duplicatasAprovadasSet();
    const mapa = new Map();
    (transacoes || []).forEach(t => {
        if (t.recorrenciaId) return; // ocorrência de recorrência (ex.: semanal): repetir valor/forma/descrição é o normal
        const chave = [t.valor, t.metodo || '', _normalizarChave(t.descricao || '')].join('|');
        if (!mapa.has(chave)) mapa.set(chave, []);
        mapa.get(chave).push(t);
    });
    // O par precisa ter >=2 membros ANTES de tirar os aprovados — aprovar 1
    // dos 2 não pode fazer o outro (ainda não aprovado) sumir também.
    return [...mapa.values()].filter(g => g.length >= 2)
        .flatMap(g => g.filter(t => !t.duplicataOk && !aprovadas.has(t.id))).sort(_porDataDesc);
}

/** Grupo "Verificação de duplicatas" fixo no topo da lista, em qualquer
 *  modo de visualização (não é uma dimensão de análise como método/
 *  categoria — é sobre consistência dos dados, então não faz sentido
 *  esconder num modo só). Cada item tem um botão "✓" — se for mesmo outro
 *  lançamento (ex.: sessões de terapia em dias diferentes, 2 compras
 *  parecidas em dias seguidos), aprovar tira ele da lista pra sempre. Some
 *  sozinho conforme o usuário for resolvendo (editando, apagando ou
 *  aprovando) — não precisa "arquivar". Grupo vazio nunca abre (nem é
 *  clicável: não é um <details>, é uma linha estática). */
function _renderGrupoDuplicatas(transacoes, tipoUI, aberto, duplicatasPre, onde = 'home') {
    const duplicatas = duplicatasPre || _detectarDuplicatas(transacoes);
    const tipoDe = typeof tipoUI === 'function' ? tipoUI : () => tipoUI;
    // Sem duplicata nenhuma: nada pra mostrar — some o grupo inteiro em vez
    // de deixar uma caixa vazia "🎉 Sem duplicatas" ocupando espaço à toa.
    if (!duplicatas.length) return '';
    const valorDe = t => (t.valorMes != null ? t.valorMes : t.valor) || 0;
    const total = duplicatas.reduce((s, t) => s + valorDe(t), 0);
    return `
    <details class="rec-grupo" data-nome="__duplicatas__" style="--cor-rec:var(--despesa-text)" ${aberto ? 'open' : ''}>
      <summary>
        <span class="rec-grupo-nome">📑 Duplicatas</span>
        <span role="button" tabindex="0" class="mini-btn" data-dup-aceitar-todas title="Aceitar todas: marca todas como &quot;não é duplicata&quot; — não avisa de novo sobre elas"><span class="mb-ico">✓</span><span class="mb-txt"> Aceitar todas</span></span>
        <span role="button" tabindex="0" class="mini-btn armed" data-dup-apagar-todas title="Apagar todas: apaga todos os lançamentos listados aqui"><span class="mb-ico">${ICONE_LIXEIRA}</span><span class="mb-txt"> Apagar todas</span></span>
        <span class="rec-grupo-espaco"></span>
        <span class="rec-grupo-contagem">${duplicatas.length}</span>
        <span class="rec-grupo-total">${formatarMoeda(total)}</span>
      </summary>
      <div class="rec-grupo-itens">
        ${_subgruposDespesaReceita(duplicatas, tipoDe, t => gerarHTMLTransacao(t, tipoDe(t), { comAprovarDuplicata: true }), '__duplicatas__', onde)}
      </div>
    </details>`;
}

/** Itens de um grupo (Duplicatas / A confirmar) divididos em subgrupos Despesa e Receita. Com um subgrupo só, ele abre junto
 *  com o grupo pai; com os dois, nascem fechados (vale o que o usuário abrir/fechar). */
function _subgruposDespesaReceita(itens, tipoDe, htmlItem, pai, onde) {
    const por = { saidas: [], entradas: [] };
    itens.forEach(t => (tipoDe(t) === 'entrada' ? por.entradas : por.saidas).push(t));
    const defs = [['saidas', 'Despesa', 'var(--despesa-text)'], ['entradas', 'Receita', 'var(--receita-text)']].filter(([k]) => por[k].length);
    const unico = defs.length === 1;
    return defs.map(([k, nome, cor]) => {
        const lista = por[k];
        const chave = `${pai}:${k}`;
        const aberto = _filaManual[onde + ':' + chave] ?? unico;
        const total = lista.reduce((acc, t) => acc + ((t.valorMes != null ? t.valorMes : t.valor) || 0), 0);
        return `
        <details class="subgrupo" data-nome="${chave}" style="--cor-rec:${cor}" ${aberto ? 'open' : ''}>
          <summary class="subgrupo-cab">
            <span class="subgrupo-nome">${nome}</span><span class="subgrupo-espaco"></span>
            <span class="subgrupo-contagem">${lista.length}</span>
            <span class="subgrupo-total">${formatarMoeda(total)}</span>
          </summary>
          ${lista.map(htmlItem).join('')}
        </details>`;
    }).join('');
}

/** Grupo "A confirmar": ocorrências de recorrência que aguardam decisão (✓ confirma, ✗ pergunta se pula o mês ou encerra). */
function _renderGrupoAConfirmar(itens, tipoUI, aberto, onde = 'home') {
    if (!itens.length) return '';
    const tipoDe = typeof tipoUI === 'function' ? tipoUI : () => tipoUI;
    const total = itens.reduce((s, t) => s + ((t.valorMes != null ? t.valorMes : t.valor) || 0), 0);
    return `
    <details class="rec-grupo" data-nome="__aconfirmar__" style="--cor-rec:var(--text-muted)" ${aberto ? 'open' : ''}>
      <summary>
        <span class="rec-grupo-nome">🔁 A confirmar</span>
        <span role="button" tabindex="0" class="mini-btn" data-ac-confirmar-todas title="Confirmar todas as ocorrências listadas aqui"><span class="mb-ico">✓</span><span class="mb-txt"> Confirmar todas</span></span>
        <span role="button" tabindex="0" class="mini-btn armed" data-ac-apagar-todas title="Apagar todas: apaga só estas ocorrências (as recorrências continuam ativas)"><span class="mb-ico">${ICONE_LIXEIRA}</span><span class="mb-txt"> Apagar todas</span></span>
        <span class="rec-grupo-espaco"></span>
        <span class="rec-grupo-contagem">${itens.length}</span>
        <span class="rec-grupo-total">${formatarMoeda(total)}</span>
      </summary>
      <div class="rec-grupo-itens">
        ${_subgruposDespesaReceita(itens.slice().sort(_porDataDesc), tipoDe, t => gerarHTMLTransacao(t, tipoDe(t), { comConfirmarOcorrencia: true }), '__aconfirmar__', onde)}
      </div>
    </details>`;
}

/** Abre/fecha dos grupos da Fila feito pelo usuário (chave "<onde>:<grupo>"); sem escolha o grupo segue o padrão. */
const _filaManual = {};
function _ligarFilaManual(box, onde) {
    if (box.dataset.filaManual) return;
    box.dataset.filaManual = '1';
    box.addEventListener('click', e => {
        const sm = e.target.closest('summary');
        if (!sm || e.target.closest('.mini-btn') || !sm.parentElement.dataset.nome) return;
        _filaManual[onde + ':' + sm.parentElement.dataset.nome] = !sm.parentElement.open; // o clique ainda vai inverter
    }, true);
}

/** Botões "Confirmar/Aceitar todas" e "Apagar todas" (Duplicatas e A confirmar): se o cabeçalho do grupo não comporta o texto (o título nunca quebra
 *  em 2 linhas), ficam só o ✓ e a lixeira. */
function ajustarBotoesTodas() {
    document.querySelectorAll('.rec-grupo[data-nome="__duplicatas__"] > summary, .rec-grupo[data-nome="__aconfirmar__"] > summary').forEach(sm => {
        const btns = sm.querySelectorAll('.mini-btn');
        btns.forEach(b => b.classList.remove('so-ico'));
        if (!sm.clientWidth) return; // grupo oculto: mede quando aparecer
        if (sm.scrollWidth > sm.clientWidth + 1) btns.forEach(b => b.classList.add('so-ico'));
    });
}
window.addEventListener('resize', () => ajustarBotoesTodas());
document.addEventListener('toggle', e => { if (e.target && e.target.matches && e.target.matches('details')) ajustarBotoesTodas(); }, true);

/** Home de cada mês (nenhuma aba aberta): as duplicatas e as ocorrências "a confirmar" do mês em exibição, Receitas e Despesas
 *  juntas. Sem título e sem texto quando não há nada; os grupos nascem fechados, exceto se for o único. (Para tudo o que está
 *  pendente em todos os meses, ver Pendências.) */
function renderFilaHome() {
    const box = document.getElementById('filaHome');
    if (!box) return;
    const ent = (estadoApp.transacoes.entradas || []).filter(t => !_ehEstornoCartao(t));
    const sai = estadoApp.transacoes.saidas || [];
    const aConf = [...ent, ...sai].filter(t => t.aConfirmar);
    const dups = [..._detectarDuplicatas(ent.filter(t => !t.aConfirmar)), ..._detectarDuplicatas(sai.filter(t => !t.aConfirmar))];
    _ligarFilaManual(box, 'home');
    const aberto = nome => _filaManual['home:' + nome]; // só o que VOCÊ abriu/fechou; sem escolha, vale o padrão
    const tipoDe = t => (ent.includes(t) ? 'entrada' : 'saida');
    const soAC = aConf.length > 0 && !dups.length, soDup = dups.length > 0 && !aConf.length; // nasce aberto só se for o único grupo
    const htmlAC = _renderGrupoAConfirmar(aConf, tipoDe, aberto('__aconfirmar__') ?? soAC, 'home');
    const htmlDup = dups.length ? _renderGrupoDuplicatas(null, tipoDe, aberto('__duplicatas__') ?? soDup, dups, 'home') : '';
    box.innerHTML = htmlAC + htmlDup;
    box.onclick = onListaTransacaoClick;
    ajustarBotoesTodas();
}

/** Escolhe a renderização certa pro modo de visualização selecionado — usado
 *  tanto por Receitas quanto por Despesas. Nos modos que não são
 *  Cronológica, prepend uma barra com 1 segmento por grupo (recorrência/
 *  método/categoria, conforme o modo) cujo clique filtra a lista pra só
 *  aquele grupo (Cronológica já tem sua própria barra + grupos abrindo/
 *  fechando, em vez de filtrar). O grupo "Duplicatas" vem sempre no topo
 *  de VERDADE — num container fixo próprio, ACIMA dos filtros (modo-lista),
 *  não dentro da lista — ver #duplicatasEntradas/#duplicatasSaidas. */
/** Estorno/reembolso lançado num cartão de crédito (Receita com forma de pgto. Crédito): pertence à fatura, não à Receita. */
function _ehEstornoCartao(t) {
    const m = (estadoApp.menus && (estadoApp.menus.metodosTodos || estadoApp.menus.metodos)) || [];
    return m.some(x => x.metodoKind === 'Crédito' && rotuloMetodo(x) === t.metodo);
}

function renderListaPorModo(container, transacoes, tipoUI, modo, msgVazia) {
    if (!container) return;
    if (tipoUI === 'entrada' && transacoes) transacoes = transacoes.filter(t => !_ehEstornoCartao(t));
    const aConfirmar = (transacoes || []).filter(t => t.aConfirmar); // ficam no grupo "A confirmar", fora da lista
    if (transacoes) transacoes = transacoes.filter(t => !t.aConfirmar);
    const dupContainer = document.getElementById(tipoUI === 'entrada' ? 'duplicatasEntradas' : 'duplicatasSaidas');
    if (dupContainer) _ligarFilaManual(dupContainer, tipoUI);
    let abertoDuplicatas = _filaManual[tipoUI + ':__duplicatas__'];
    const abertoAConfirmar = _filaManual[tipoUI + ':__aconfirmar__'];
    if (_forcarAbrirDuplicatas[tipoUI]) {
        abertoDuplicatas = true;
        _forcarAbrirDuplicatas[tipoUI] = false;
    }

    if (modo === 'cronologica') {
        renderListaCronologica(container, transacoes, tipoUI, msgVazia);
    } else if (!transacoes || !transacoes.length) {
        container.innerHTML = `<p class="empty-message">${msgVazia}</p>`;
        container.onclick = null;
    } else {
        const { grupos, chaveDe, semChave } = _agruparParaBarra(modo, transacoes, tipoUI);
        const barraHTML = _renderBarraGrupos(grupos, tipoUI, modo);
        const filtro = _filtroGrupoDe(tipoUI, modo);
        const filtrados = filtro ? transacoes.filter(t => (chaveDe(t) || semChave) === filtro) : transacoes;
        const grupoAtivo = grupos.find(g => g.chave === filtro);
        const msgFiltrado = grupoAtivo ? `Nada em "${grupoAtivo.nome}"` : msgVazia;

        if (modo === 'metodo') {
            renderListaPorMetodo(container, filtrados, tipoUI, msgFiltrado);
        } else {
            renderListaPorCategoria(container, filtrados, tipoUI, msgFiltrado);
        }

        container.insertAdjacentHTML('afterbegin', barraHTML);
        const onClickConteudo = container.onclick;
        container.onclick = e => {
            const seg = e.target.closest('[data-grupo-toggle]');
            if (seg) {
                const valor = seg.dataset.grupoToggle;
                _setFiltroGrupoBarra(tipoUI, modo, filtro === valor ? null : valor);
                renderListaPorModo(container, transacoes, tipoUI, modo, msgVazia);
                return;
            }
            const subBtn = e.target.closest('[data-submodo]');
            if (subBtn) {
                e.preventDefault(); // está dentro do <summary> — sem isso, o clique também abre/fecha o <details>
                const grupoChave = subBtn.closest('[data-grupo-chave]').dataset.grupoChave;
                const atual = _subModoGrupoDe(tipoUI, modo, grupoChave);
                const novo = subBtn.dataset.submodo === atual ? 'cronologica' : subBtn.dataset.submodo;
                _setSubModoGrupo(tipoUI, modo, grupoChave, novo);
                // Clicar no filtro já abre o grupo — não faz sentido escolher
                // "por categoria" e continuar vendo o grupo fechado.
                const det = subBtn.closest('details.rec-grupo');
                if (det) det.open = true;
                renderListaPorModo(container, transacoes, tipoUI, modo, msgVazia);
                return;
            }
            const subIcone = e.target.closest('[data-submodo-icone]');
            if (subIcone) {
                e.preventDefault();
                const grupoChave = subIcone.closest('[data-grupo-chave]').dataset.grupoChave;
                _setSubModoGrupo(tipoUI, modo, grupoChave, 'cronologica');
                renderListaPorModo(container, transacoes, tipoUI, modo, msgVazia);
                return;
            }
            if (onClickConteudo) onClickConteudo(e);
        };
    }

    if (dupContainer) {
        const nDup = (transacoes && transacoes.length) ? _detectarDuplicatas(transacoes).length : 0;
        const htmlAC = _renderGrupoAConfirmar(aConfirmar, tipoUI, abertoAConfirmar ?? (aConfirmar.length > 0 && !nDup), tipoUI);
        const htmlDup = nDup ? _renderGrupoDuplicatas(transacoes, tipoUI, abertoDuplicatas ?? !aConfirmar.length, null, tipoUI) : '';
        dupContainer.innerHTML = htmlAC + htmlDup;
        ajustarBotoesTodas();
        dupContainer.onclick = onListaTransacaoClick;
    }
}

// 'categoria' | 'cronologica' (padrão) — visão da aba Receitas
const MODOS_LISTA_ENTRADAS = ['cronologica', 'categoria'];
let modoListaEntradas = _modoListaSalvo('modoListaEntradas', MODOS_LISTA_ENTRADAS);

function definirModoListaEntradas(modo) {
    // Toggle: clicar de novo no filtro já ativo desliga (volta pra
    // cronológica) — não tem botão "Cronológica" próprio, é só o "nenhum
    // filtro ligado".
    const novo = modo === modoListaEntradas ? 'cronologica' : modo;
    modoListaEntradas = MODOS_LISTA_ENTRADAS.includes(novo) ? novo : 'cronologica';
    try { localStorage.setItem('modoListaEntradas', modoListaEntradas); } catch (_) {}
    atualizarEntradasLista();
}

/** Sempre que Receita/Despesa/Próximas fecham ou abrem, o filtro volta pro
 *  padrão (Cronológica) em vez de manter o modo da última vez que a aba
 *  esteve aberta. */
function resetarModosListaParaCronologica() {
    modoListaEntradas = 'cronologica';
    modoListaSaidas = 'cronologica';
    modoListaProximas = 'cronologica';
    try {
        localStorage.setItem('modoListaEntradas', 'cronologica');
        localStorage.setItem('modoListaSaidas', 'cronologica');
        localStorage.setItem('modoListaProximas', 'cronologica');
    } catch (_) {}
}

function atualizarEntradasLista() {
    document.querySelectorAll('#modoEntradas .modo-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.modo === modoListaEntradas));
    document.getElementById('modoEntradas')?.classList.toggle('vazio', !estadoApp.transacoes.entradas.length);
    document.getElementById('modoEntradasIcone')?.classList.toggle('ativo', modoListaEntradas !== 'cronologica');
    _ajustarLabelsFiltro(document.getElementById('modoEntradas'));
    const container = document.querySelector(SELECTORS.entradasLista);
    renderListaPorModo(container, estadoApp.transacoes.entradas, 'entrada', modoListaEntradas, 'Nenhuma receita neste mês');
}

// 'metodo' | 'categoria' | 'cronologica' (padrão) — visão da aba Despesas
const MODOS_LISTA_SAIDAS = ['cronologica', 'metodo', 'categoria'];
let modoListaSaidas = _modoListaSalvo('modoListaSaidas', MODOS_LISTA_SAIDAS);

function definirModoListaSaidas(modo) {
    // Toggle: clicar de novo no filtro já ativo desliga (volta pra cronológica).
    const novo = modo === modoListaSaidas ? 'cronologica' : modo;
    modoListaSaidas = MODOS_LISTA_SAIDAS.includes(novo) ? novo : 'cronologica';
    try { localStorage.setItem('modoListaSaidas', modoListaSaidas); } catch (_) {}
    atualizarSaidasLista();
}

function atualizarSaidasLista() {
    document.querySelectorAll('#modoSaidas .modo-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.modo === modoListaSaidas));
    document.getElementById('modoSaidas')?.classList.toggle('vazio', !estadoApp.transacoes.saidas.length);
    document.getElementById('modoSaidasIcone')?.classList.toggle('ativo', modoListaSaidas !== 'cronologica');
    _ajustarLabelsFiltro(document.getElementById('modoSaidas'));
    const container = document.querySelector(SELECTORS.saidasLista);
    renderListaPorModo(container, estadoApp.transacoes.saidas, 'saida', modoListaSaidas, 'Nenhuma despesa neste mês');
}

/** Agrupa e renderiza `transacoes` por `chaveDe(t)`, ordenado por total (maior primeiro).
 *  Usado por "Por método" e "Por categoria" — mesmo formato de card recolhível,
 *  com o mesmo organizador inline (outras 2 dimensões) que "Por recorrência" tem. */
function _renderListaAgrupadaPorTotal(container, transacoes, tipoUI, msgVazia, { chaveDe, semChave, cores, gerarOpts, modo }) {
    if (!container) return;
    if (!transacoes || !transacoes.length) {
        container.innerHTML = `<p class="empty-message">${msgVazia}</p>`;
        container.onclick = null;
        return;
    }
    const ehDespesa = tipoUI === 'saida';
    const valorDe = t => (t.valorMes != null ? t.valorMes : t.valor) || 0;

    const mapa = new Map();
    transacoes.forEach(t => {
        const k = chaveDe(t) || semChave;
        if (!mapa.has(k)) mapa.set(k, []);
        mapa.get(k).push(t);
    });
    const grupos = [...mapa.entries()]
        .map(([nome, itens]) => [nome, _ordenarPorGrupo(itens, `${tipoUI}:${modo}:${nome}`), itens.reduce((s, t) => s + valorDe(t), 0)])
        .sort((a, b) => b[2] - a[2]);

    const totalGeral = grupos.reduce((s, g) => s + g[2], 0);
    const abertos = _lerAbertosRecGrupo(container);
    const abertosSub = _lerAbertosSubgrupo(container);

    container.innerHTML = grupos.map(([nome, itens, total]) => {
        const c = (modo === 'categoria' ? corDaCategoria(nome, tipoUI) : cores[nome]) || corPadraoChip(nome);
        const pct = totalGeral ? (total / totalGeral) * 100 : 0;
        const corpoItens = _corpoGrupoComSubmodo(itens, tipoUI, modo, nome, ehDespesa, abertosSub, gerarOpts);
        const submenuHTML = _renderOrganizadorInline(tipoUI, modo, nome, ehDespesa, itens);
        return `
        <details class="rec-grupo" data-nome="${String(nome).replace(/"/g, '&quot;')}" style="--cor-rec:${c}" ${abertos[nome] ? 'open' : ''}>
          <summary>
            <span class="rec-grupo-nome">${nome}</span>
            <span class="rec-grupo-espaco"></span>
            <span class="rec-grupo-contagem">${itens.length}</span>
            <span class="rec-grupo-total"><span class="tot-valor">${formatarMoeda(total)}</span>${totalGeral ? `<span class="tot-pct"><i class="tot-sep"> · </i>${formatarPct(pct)}%</span>` : ''}</span>
          </summary>
          <div class="rec-grupo-itens">
            ${_barraGrupo(submenuHTML)}
            ${corpoItens}
          </div>
        </details>`;
    }).join('');

    container.querySelectorAll('.subgrupo-organizador').forEach(_ajustarLabelsFiltro);
    container.onclick = onListaTransacaoClick;
}

/** Transações agrupadas por método de pagamento, ordenadas por total (maior primeiro) */
function renderListaPorMetodo(container, transacoes, tipoUI, msgVazia) {
    const cores = (estadoApp.menus && estadoApp.menus.cores && estadoApp.menus.cores.metodo) || {};
    _renderListaAgrupadaPorTotal(container, transacoes, tipoUI, msgVazia, {
        chaveDe: t => t.metodo,
        semChave: 'Sem forma de pagamento',
        cores,
        gerarOpts: { semMetodoChip: true },
        modo: 'metodo'
    });
}

/** Transações agrupadas por categoria, ordenadas por total (maior primeiro) */
function renderListaPorCategoria(container, transacoes, tipoUI, msgVazia) {
    const cores = (estadoApp.menus && estadoApp.menus.cores && estadoApp.menus.cores.categoria) || {};
    _renderListaAgrupadaPorTotal(container, transacoes, tipoUI, msgVazia, {
        chaveDe: t => t.categoria,
        semChave: 'Sem categoria',
        cores,
        gerarOpts: { semCategoriaChip: true },
        modo: 'categoria'
    });
}

/** Mesma regra usada no card de resumo (calcularResumoMes, data.js) pra
 *  decidir se uma transação já "aconteceu" (Atual) ou ainda está pendente
 *  (A receber / A pagar) — cartão de crédito só "realiza" depois que o
 *  vencimento da fatura daquela competência já passou. */
function _transacaoRealizada(t) {
    // Hoje (data local) já conta como realizado: o que tem data <= hoje sai de
    // "Próximos" e fica só em Despesas/Receitas — vale também pro cartão de crédito
    // (o vencimento da fatura não muda isso).
    if (t.aConfirmar) return false; // recorrência aguardando decisão: segue em "a pagar"/"a receber", mesmo vencida
    const hoje = hojeISO();
    return !t.pendente && String(t.data).slice(0, 10) <= hoje;
}

/** "Cronológica": divide em 2 grupos (Atual / A receber ou A pagar), com
 *  uma barra horizontal única mostrando a proporção de cada um em cima —
 *  hover mostra %+valor, clique abre/fecha o grupo correspondente. */
/** Faturas de cartão do mês em exibição que ainda vencem DEPOIS de hoje: linhas "virtuais" do grupo
 *  "A pagar" (não são lançamentos e não entram nos totais — as compras já estão nas despesas).
 *  Some sozinha no dia do vencimento; antes disso dá pra marcar como paga (e desfazer). */
function _faturasAPagar() {
    const mes = estadoApp.mesAtual || new Date();
    const comp = `${mes.getFullYear()}-${String(mes.getMonth() + 1).padStart(2, '0')}-01`;
    const hoje = hojeISO();
    const valorDe = t => (t.valorMes != null ? t.valorMes : t.valor) || 0;
    const pagas = estadoApp.faturasPagas instanceof Map ? estadoApp.faturasPagas : new Map();
    return ((estadoApp.menus && (estadoApp.menus.metodosTodos || estadoApp.menus.metodos)) || [])
        .filter(m => m.metodoKind === 'Crédito' && m.diaVencimento && itemAtivoEm(m, comp))
        .map(m => {
            const rot = rotuloMetodo(m);
            // Só compras JÁ feitas (data <= hoje): as futuras ainda não bateram no cartão e aparecem soltas
            const feita = t => !t.pendente && String(t.data).slice(0, 10) <= hoje;
            const total = (estadoApp.transacoes.saidas || []).filter(t => t.metodo === rot && feita(t)).reduce((a, t) => a + valorDe(t), 0)
                - (estadoApp.transacoes.entradas || []).filter(t => t.metodo === rot && feita(t)).reduce((a, t) => a + valorDe(t), 0);
            if (!(total > 0.004)) return null;
            const venc = dataVencimento(comp, m.diaVencimento);
            if (!venc) return null;
            const auto = venc <= hoje;               // venceu: conta como paga automaticamente (fica riscada)
            const escolha = pagas.get(rot + '|' + comp); // marcar/desmarcar à mão vale mais que a data
            return { rot, banco: m.banco || '', comp, venc, total, auto, paga: escolha !== undefined ? escolha : auto };
        })
        .filter(Boolean);
}

/** Marca/desmarca a fatura como paga (botão "paga"). true se gravou. */
async function _alternarFaturaPagaBtn(fatBtn) {
    const metodo = fatBtn.dataset.metodo, comp = fatBtn.dataset.comp, chave = metodo + '|' + comp;
    const novo = fatBtn.dataset.paga !== '1';            // inverte o estado atual (marcado x desmarcado)
    const igualAoAutomatico = novo === (fatBtn.dataset.auto === '1'); // voltou ao que a data já diz: some a escolha
    fatBtn.disabled = true;
    const { error } = igualAoAutomatico
        ? await sb.from('faturas_pagas').delete().eq('metodo', metodo).eq('competencia', comp)
        : await sb.from('faturas_pagas').upsert({ metodo, competencia: comp, pago: novo }, { onConflict: 'user_id,metodo,competencia' });
    if (error) { console.error(error); mostrarNotificacao('Erro ao atualizar a fatura', 'erro'); fatBtn.disabled = false; return false; }
    if (!(estadoApp.faturasPagas instanceof Map)) estadoApp.faturasPagas = new Map();
    if (igualAoAutomatico) estadoApp.faturasPagas.delete(chave); else estadoApp.faturasPagas.set(chave, novo);
    if (typeof calcularResumoMes === 'function') { calcularResumoMes(); atualizarResumo(); } // pago x a pagar mudam
    return true;
}

/** "Fatura CC Brad." — usado quando "Fatura Crédito Bradesco" não cabe na linha. */
function _nomeCurtoFatura(f) {
    const banco = f.banco || String(f.rot).replace(/^Crédito\s+/i, '');
    return `Fatura CC ${banco.length > 5 ? banco.slice(0, 4) + '.' : banco}`;
}

/** Ajusta os nomes "Fatura <cartão>" dos cabeçalhos: nome inteiro; se estourar a linha, a versão curta. */
function ajustarNomesFatura() {
    document.querySelectorAll('.subgrupo-nome[data-fatura-longo]').forEach(el => {
        const cab = el.closest('summary');
        if (!cab || !cab.clientWidth) return; // grupo fechado/oculto: mede quando abrir
        el.textContent = el.dataset.faturaLongo;
        if (cab.scrollWidth > cab.clientWidth + 1) el.textContent = el.dataset.faturaCurto;
    });
}
window.addEventListener('resize', () => ajustarNomesFatura());
document.addEventListener('toggle', e => { if (e.target && e.target.matches && e.target.matches('details')) ajustarNomesFatura(); }, true);

function _htmlFaturaVirtual(f, compacta = false) {
    const esc = x => String(x).replace(/"/g, '&quot;');
    const dd = f.venc.slice(8, 10) + '/' + f.venc.slice(5, 7);
    const banco = f.banco || String(f.rot).replace(/^Crédito\s+/i, '');
    const nomeLongo = `Fatura ${f.rot}`; // desktop: nome inteiro; o abreviado é só do celular
    const nomeCurto = `Fatura CC ${banco.length > 5 ? banco.slice(0, 4) + '.' : banco}`;
    const detalhe = `vcto. ${dd}`;
    // Dentro do subgrupo do cartão: só "Fatura · vcto." + botão (o nome e o valor já estão no cabeçalho do subgrupo)
    const nomeExibido = compacta ? `<span class="fv-longo">Vcto. ${dd}</span><span class="fv-curto">Vcto. ${dd}</span>` : `<span class="fv-longo">${nomeLongo}</span><span class="fv-curto">${nomeCurto}</span>`;
    return `
        <div class="fatura-virtual${f.paga ? ' paga' : ''}${compacta ? ' fatura-virtual--compacta' : ''}">
          <div class="fv-info"><b>${nomeExibido}</b>${compacta ? '' : `<span>${detalhe}</span>`}</div>
          <div class="fv-lado">
            ${compacta ? '' : `<b class="fv-valor">${formatarMoeda(f.total)}</b>`}
            <button type="button" class="fv-btn${f.paga ? ' on' : ''}" data-fatura-pagar data-metodo="${esc(f.rot)}" data-comp="${f.comp}" data-paga="${f.paga ? 1 : 0}" data-auto="${f.auto ? 1 : 0}" title="${f.auto ? 'Marcada automaticamente pelo vencimento — clique para alterar' : 'Marcar/desmarcar como paga'}">${f.paga ? '✓ ' : ''}paga</button>
          </div>
        </div>`;
}

/** Subgrupo colapsável "Fatura <cartão>" (nome, contagem, total, %), com o box de vencimento/"paga" e as compras dentro.
 *  Usado em "A pagar" (Despesas) e em Próximos. `estornos`: lançamentos de crédito na fatura (mostrados com "+"). */
function _htmlSubgrupoFatura(f, its, totalRef, tipoUI, abertosSub, estornos, forcarAberto = false) {
    const nome = `Fatura ${f.rot}`;
    const cor = ((estadoApp.menus && estadoApp.menus.cores && estadoApp.menus.cores.metodo) || {})[f.rot] || corPadraoChip(f.rot);
    return `
        <details class="subgrupo" data-nome="${String(nome).replace(/"/g, '&quot;')}"${forcarAberto ? ' data-auto="1"' : ''} style="--cor-rec:${cor}" ${forcarAberto || abertosSub[nome] ? 'open' : ''}>
          <summary class="subgrupo-cab">
            <span class="subgrupo-nome" data-fatura-longo="${nome}" data-fatura-curto="${_nomeCurtoFatura(f)}">${nome}</span>
            <span class="subgrupo-espaco"></span>
            <span class="subgrupo-contagem">${its.length}</span>
            <span class="subgrupo-total"><span class="tot-valor">${formatarMoeda(f.total)}</span>${totalRef ? `<span class="tot-pct"><i class="tot-sep"> · </i>${formatarPct((f.total / totalRef) * 100)}%</span>` : ''}</span>
          </summary>
          ${_htmlFaturaVirtual(f, true)}
          ${its.map(t => gerarHTMLTransacao(t, estornos && estornos.has(t) ? 'entrada' : tipoUI, { semMetodoChip: true })).join('')}
        </details>`;
}

function renderListaCronologica(container, transacoes, tipoUI, msgVazia) {
    if (!container) return;
    if (!transacoes || !transacoes.length) {
        container.innerHTML = `<p class="empty-message">${msgVazia}</p>`;
        container.onclick = null;
        return;
    }

    const rotuloPendente = tipoUI === 'entrada' ? 'A receber' : 'A pagar';
    const corAtual = tipoUI === 'entrada' ? 'var(--receita-text)' : 'var(--despesa-text)';
    const corPendente = 'var(--balanco-text)';
    const valorDe = t => (t.valorMes != null ? t.valorMes : t.valor) || 0;

    // Receitas: Atual | A receber.  Despesas (por caminho do dinheiro): Pago | Fatura de cada cartão em
    // aberto (compras já feitas) | A pagar (o que ainda não aconteceu, inclusive compra de cartão futura).
    const faturas = tipoUI === 'saida' ? _faturasAPagar() : [];
    const faturaDe = new Map(faturas.map(f => [f.rot, f]));
    const atuais = [], pendentes = [], itensFatura = new Map();
    const estornos = new Set(); // créditos na fatura: aparecem dentro do subgrupo do cartão, com sinal de entrada
    if (tipoUI === 'saida') (estadoApp.transacoes.entradas || []).forEach(t => {
        const f = faturaDe.get(t.metodo);
        if (f && _transacaoRealizada(t)) { estornos.add(t); itensFatura.set(f.rot, [...(itensFatura.get(f.rot) || []), t]); }
    });
    transacoes.forEach(t => {
        const f = tipoUI === 'saida' ? faturaDe.get(t.metodo) : null;
        if (!_transacaoRealizada(t)) pendentes.push(t);
        else if (f) itensFatura.set(f.rot, [...(itensFatura.get(f.rot) || []), t]);
        else atuais.push(t);
    });
    const soma = l => l.reduce((acc, t) => acc + valorDe(t), 0);
    const nomeAtual = tipoUI === 'saida' ? 'Pago' : 'Atual';
    const grupos = [];
    // A pagar = subgrupo da fatura de cada cartão em aberto + (fora dele) o que ainda não aconteceu
    const pagasFat = faturas.filter(f => f.paga);
    const abertasFat = faturas.filter(f => !f.paga);
    const abertosSubFat = _lerAbertosSubgrupo(container);
    const subFaturaHTML = (f, totalRef, forcarAberto) => _htmlSubgrupoFatura(f, _ordenarPorGrupo(itensFatura.get(f.rot) || []), totalRef, tipoUI, abertosSubFat, estornos, forcarAberto);
    const totalPagoGrupo = soma(atuais) + pagasFat.reduce((acc, f) => acc + f.total, 0);
    const totalAPagarGrupo = soma(pendentes) + abertasFat.reduce((acc, f) => acc + f.total, 0);
    const nItens = f => (itensFatura.get(f.rot) || []).length;
    // Quantos subgrupos por forma de pagamento os itens soltos (fora das faturas) de um
    // grupo formariam — usado junto com o nº de faturas pra saber se a fatura é o ÚNICO
    // subgrupo do grupo (aí ela já abre sozinha, mesma regra do _renderItensSubagrupados).
    const contarFormas = (itens, nomeGrupo) => new Set(itens.map(t =>
        (nomeGrupo === rotuloPendente && faturaDe.has(t.metodo)) ? 'Crédito' : (t.metodo || 'Sem forma de pagamento')
    )).size;
    grupos.push({
        nome: nomeAtual, cor: corAtual, itens: atuais,
        total: totalPagoGrupo,
        extraHTML: pagasFat.map(f => subFaturaHTML(f, totalPagoGrupo, pagasFat.length === 1 && contarFormas(atuais, nomeAtual) === 0)).join(''),
        extraContagem: pagasFat.length, // cada fatura conta como 1 item
    });
    grupos.push({
        nome: rotuloPendente, cor: corPendente, itens: pendentes,
        total: totalAPagarGrupo,
        extraHTML: abertasFat.map(f => subFaturaHTML(f, totalAPagarGrupo, abertasFat.length === 1 && contarFormas(pendentes, rotuloPendente) === 0)).join(''),
        extraContagem: abertasFat.length,
    });
    grupos.forEach(g => _ordenarPorGrupo(g.itens, `${tipoUI}:cronologica:${g.nome}`));

    const totalGeral = grupos.reduce((acc, g) => acc + g.total, 0);
    const pctDe = g => (totalGeral ? (g.total / totalGeral) * 100 : 0);

    const abertos = _lerAbertosRecGrupo(container);
    const abertosSub = _lerAbertosSubgrupo(container);
    const ehDespesaCron = true; // Despesas e Receitas
    const esc = x => String(x).replace(/"/g, '&quot;');
    // Grupo vazio nunca abre — nem é clicável: sem <details>, é uma linha
    // estática (não tem nada pra mostrar, então não faz sentido nem deixar
    // "abrir" e ver "Nada aqui").
    // Despesas: o que está solto se divide em subgrupos por forma de pagamento (cada PIX, cada cartão);
    // compra de cartão que ainda não bateu na fatura fica em "<cartão> (por vir)".
    const coresMetodo = (estadoApp.menus && estadoApp.menus.cores && estadoApp.menus.cores.metodo) || {};
    const corpoPorForma = (itens, nomeGrupo) => _renderItensSubagrupados(itens, tipoUI, {
        chaveDe: t => (nomeGrupo === rotuloPendente && faturaDe.has(t.metodo) ? 'Crédito' : t.metodo),
        semChave: 'Sem forma de pagamento',
        campoChip: 'metodo',
        corDe: nome => coresMetodo[nome] || corPadraoChip(nome),
    }, abertosSub, `${tipoUI}:cronologica:${nomeGrupo}`, nomeGrupo === nomeAtual ? totalPagoGrupo : totalAPagarGrupo, { semRelogio: nomeGrupo === rotuloPendente }, // em "A pagar" tudo é futuro: o ⏰ seria redundante
        nomeGrupo === nomeAtual ? pagasFat.length : (nomeGrupo === rotuloPendente ? abertasFat.length : 0));
    const grupoHTML = (nome, cor, itens, total, pct, extraHTML = '', extraContagem = 0) => {
        if (!itens.length && !extraHTML) return `
        <div class="rec-grupo rec-grupo--vazio" style="--cor-rec:${cor}">
          <span class="rec-grupo-nome">${nome}</span>
          <span class="rec-grupo-espaco"></span>
          <span class="rec-grupo-contagem">0</span>
        </div>`;
        return `
        <details class="rec-grupo" data-nome="${esc(nome)}" style="--cor-rec:${cor}" ${abertos[nome] ? 'open' : ''}>
          <summary>
            <span class="rec-grupo-nome">${nome}</span>
            <span class="rec-grupo-espaco"></span>
            <span class="rec-grupo-contagem">${itens.length + extraContagem}</span>
            <span class="rec-grupo-total"><span class="tot-valor">${formatarMoeda(total)}</span>${totalGeral ? `<span class="tot-pct"><i class="tot-sep"> · </i>${formatarPct(pct)}%</span>` : ''}</span>
          </summary>
          <div class="rec-grupo-itens">
            ${extraHTML}
            ${tipoUI === 'saida' ? corpoPorForma(itens, nome) : itens.map(t => gerarHTMLTransacao(t, tipoUI, { semMetodoChip: true, semRelogio: nome === rotuloPendente })).join('')}
          </div>
        </details>`;
    };

    container.innerHTML = `
        <div class="cron-barra" role="img" aria-label="${esc(grupos.map(g => `${formatarPct(pctDe(g))}% ${g.nome}`).join(', '))}">
          ${grupos.map(g => `<button type="button" class="cron-barra-seg" data-cron-toggle="${esc(g.nome)}"
                  style="--cor-rec:${g.cor}; flex-grow:${Math.max(pctDe(g), g.total > 0.004 ? 2 : 0)}"
                  title="${esc(g.nome)}: ${formatarPct(pctDe(g))}% · ${formatarMoeda(g.total)}" ${g.total > 0.004 ? '' : 'hidden'}></button>`).join('')}
        </div>
        ${grupos.map(g => grupoHTML(g.nome, g.cor, g.itens, g.total, pctDe(g), g.extraHTML, g.extraContagem || 0)).join('')}
    `;
    container.querySelectorAll('.subgrupo-organizador').forEach(_ajustarLabelsFiltro);
    container.onclick = async e => {
        const fatBtn = e.target.closest('[data-fatura-pagar]');
        if (fatBtn) {
            e.preventDefault();
            if (!(await _alternarFaturaPagaBtn(fatBtn))) return;
            renderListaCronologica(container, transacoes, tipoUI, msgVazia);
            return;
        }
        const subBtn = e.target.closest('[data-submodo]');
        if (subBtn) {
            e.preventDefault();
            const grupoChave = subBtn.closest('[data-grupo-chave]').dataset.grupoChave;
            const atual = _subModoGrupoDe(tipoUI, 'cronologica', grupoChave);
            _setSubModoGrupo(tipoUI, 'cronologica', grupoChave, subBtn.dataset.submodo === atual ? 'cronologica' : subBtn.dataset.submodo);
            const det = subBtn.closest('details.rec-grupo');
            if (det) det.open = true;
            renderListaCronologica(container, transacoes, tipoUI, msgVazia);
            return;
        }
        const subIcone = e.target.closest('[data-submodo-icone]');
        if (subIcone) {
            e.preventDefault();
            _setSubModoGrupo(tipoUI, 'cronologica', subIcone.closest('[data-grupo-chave]').dataset.grupoChave, 'cronologica');
            renderListaCronologica(container, transacoes, tipoUI, msgVazia);
            return;
        }
        const seg = e.target.closest('[data-cron-toggle]');
        if (seg) {
            const det = container.querySelector(`details.rec-grupo[data-nome="${CSS.escape(seg.dataset.cronToggle)}"]`);
            if (det) det.open = !det.open;
            return;
        }
        onListaTransacaoClick(e);
    };
}

const _porDataDesc = (a, b) => new Date(b.data) - new Date(a.data);

/** Estado aberto/fechado de cada <details class="rec-grupo"> do container,
 *  por nome do grupo — usado pra não fechar tudo sozinho toda vez que a
 *  lista é re-renderizada (ex.: depois de "quitar" uma parcela). Fechado
 *  por padrão (grupo novo == não visto antes). */
function _lerAbertosRecGrupo(container) {
    const abertos = {};
    container?.querySelectorAll('details.rec-grupo[data-nome]').forEach(d => {
        abertos[d.dataset.nome] = d.open;
    });
    return abertos;
}

/** Mesma ideia de _lerAbertosRecGrupo, mas pros subgrupos (Categoria/Forma
 *  de pgto. dentro de "Pontual") — fechados por padrão, mas preservando o
 *  que o usuário já abriu manualmente ao trocar de submodo ou re-renderizar.
 *  Ignora os marcados `data-auto` (abertos sozinhos por serem o único
 *  subgrupo do grupo, ver unicoSubgrupo/forcarAberto): sem isso, esse "aberto"
 *  automático era lido como se o usuário tivesse escolhido abrir, e "vazava"
 *  pro mesmo nome de subgrupo em outro grupo/mês onde ele NÃO é o único
 *  (ex.: abrir Despesa de setembro, onde só há 1 forma, abria à toa a mesma
 *  forma dentro de um grupo de agosto com várias). */
function _lerAbertosSubgrupo(container) {
    const abertos = {};
    container?.querySelectorAll('details.subgrupo[data-nome]').forEach(d => {
        if (d.dataset.auto === '1') return;
        abertos[d.dataset.nome] = d.open;
    });
    return abertos;
}

// Dentro de QUALQUER grupo (de Forma de pgto. ou Categoria — não existe em
// Cronológica: lá os grupos são "Atual"/"A pagar"/"A receber", não fazem
// sentido reorganizar), o usuário pode escolher ver os itens organizados
// pela OUTRA dimensão em vez de cronológico (padrão). Estado por
// "tipoUI:modo:chaveDoGrupo" -> 'cronologica' (nenhum filtro ligado) |
// 'categoria' | 'metodo'.
const _subModoGrupo = {};
function _subModoGrupoDe(tipoUI, modo, grupoChave) {
    return _subModoGrupo[`${tipoUI}:${modo}:${grupoChave}`] || 'cronologica';
}
function _setSubModoGrupo(tipoUI, modo, grupoChave, valor) {
    _subModoGrupo[`${tipoUI}:${modo}:${grupoChave}`] = valor;
}

/** Ordem dos lançamentos dentro de um grupo/subgrupo: sempre cronológica (mais recente primeiro). */
function _ordenarPorGrupo(itens) {
    return itens.sort(_porDataDesc);
}

// Quais dimensões aparecem como opção de submodo, conforme o modo (top)
// escolhido — sempre as OUTRAS 2, nunca a mesma dimensão que já agrupa a
// tela toda. Ordem = ordem dos botões.
const _SUBMODOS_POR_MODO = {
    cronologica: ['metodo'],   // grupos Atual / A pagar: filtro por forma de pagamento
    metodo: ['categoria'],
    categoria: ['metodo']
};

/** Config (chave/rótulo/emoji) de cada dimensão usável como submodo. */
function _dimensaoSubmodo(dim, ehDespesa) {
    switch (dim) {
        case 'categoria':
            return { chaveDe: t => t.categoria, semChave: 'Sem categoria', emoji: '🏷️', label: 'Categoria', campoChip: 'categoria', corDe: nome => corDaCategoria(nome, ehDespesa ? 'saida' : 'entrada') };
        case 'metodo':
            return { chaveDe: t => t.metodo, semChave: 'Sem forma de pagamento', emoji: '💳', label: 'Forma de pagamento', campoChip: 'metodo', corDe: nome => ((estadoApp.menus && estadoApp.menus.cores && estadoApp.menus.cores.metodo) || {})[nome] || corPadraoChip(nome) };
        default:
            return null;
    }
}

/** Reorganiza os itens de UM grupo pela dimensão escolhida (maior total
 *  primeiro) em vez de cronológico — cartõezinhos colapsáveis, fechados por
 *  padrão, com contagem e % (igual ao grupo de fora). */
function _renderItensSubagrupados(itens, tipoUI, dimCfg, abertos, chavePrefixo, totalRef, baseOpts = {}, extraIrmaos = 0) {
    const valorDe = t => (t.valorMes != null ? t.valorMes : t.valor) || 0;
    const mapa = new Map();
    itens.forEach(t => {
        const k = dimCfg.chaveDe(t) || dimCfg.semChave;
        if (!mapa.has(k)) mapa.set(k, []);
        mapa.get(k).push(t);
    });
    const totalGeral = totalRef != null ? totalRef : itens.reduce((s, t) => s + valorDe(t), 0);
    const grupos = [...mapa.entries()]
        .map(([nome, its]) => [nome, _ordenarPorGrupo(its, `${chavePrefixo}:sub:${nome}`), its.reduce((s, t) => s + valorDe(t), 0)])
        .sort((a, b) => b[2] - a[2]);
    // Um único subgrupo dentro do grupo = não há escolha real a fazer: já vem aberto,
    // mesmo que o usuário não tenha aberto manualmente antes (não sobrescreve um "fechado" lembrado, já que aqui nunca houve estado lembrado pra ele ser diferente de aberto).
    // extraIrmaos conta subgrupos irmãos gerados FORA daqui (ex.: as faturas de cartão em
    // renderListaCronologica, que ficam soltas ao lado destes) — com algum deles, mesmo só 1
    // grupo aqui não é mais "o único subgrupo do grupo todo".
    const unicoSubgrupo = grupos.length === 1 && extraIrmaos === 0;
    return grupos.map(([nome, its, total]) => {
        const pct = totalGeral ? (total / totalGeral) * 100 : 0;
        const aberto = unicoSubgrupo || (abertos && abertos[nome]);
        const cor = (dimCfg.corDe ? dimCfg.corDe(nome) : null) || corPadraoChip(nome);
        return `
        <details class="subgrupo" data-nome="${String(nome).replace(/"/g, '&quot;')}"${unicoSubgrupo ? ' data-auto="1"' : ''} style="--cor-rec:${cor}" ${aberto ? 'open' : ''}>
          <summary class="subgrupo-cab">
            <span class="subgrupo-nome">${nome}</span>
            <span class="subgrupo-espaco"></span>
            <span class="subgrupo-contagem">${its.length}</span>
            <span class="subgrupo-total"><span class="tot-valor">${formatarMoeda(total)}</span>${totalGeral ? `<span class="tot-pct"><i class="tot-sep"> · </i>${formatarPct(pct)}%</span>` : ''}</span>
          </summary>
          ${its.map(t => gerarHTMLTransacao(t, tipoUI, { ...baseOpts, ..._optsSemChipRedundante(its, dimCfg.campoChip, nome) })).join('')}
        </details>`;
    }).join('');
}

window.addEventListener('resize', () => document.querySelectorAll('.linha-detalhe i').forEach(e => e._reajustar && e._reajustar()));

/** Chip repetido em TODO o grupo (ex.: "Crédito Bradesco" dentro do grupo do Crédito Bradesco) é ruído: esconde. */
function _optsSemChipRedundante(itens, campo, nomeGrupo) {
    if (!campo || !itens.length) return {};
    // Subgrupo genérico (ex.: "Crédito" reúne vários cartões): o chip do cartão específico continua
    if (nomeGrupo !== undefined && itens[0][campo] !== nomeGrupo) return {};
    const uniforme = itens.every(t => t[campo] && t[campo] === itens[0][campo]);
    if (!uniforme) return {};
    return campo === 'metodo' ? { semMetodoChip: true } : campo === 'categoria' ? { semCategoriaChip: true } : {};
}

/** Primeira linha DENTRO do grupo aberto: "Ordem de criação" (à esquerda,
 *  alinhado com o título) e, ao lado, os botões de filtro. */
function _barraGrupo(html) {
    return String(html || '').trim() ? `<div class="grupo-barra">${html}</div>` : '';
}

/** HTML do organizador inline (ícone de funil + botões das outras 2
 *  dimensões) pra colocar ao lado do nome de um grupo, dentro do próprio
 *  <summary> — reutilizado pelos 3 modos que agrupam (Recorrência, Forma de
 *  pgto., Categoria). Cronológica não chama isso (não tem grupos "de
 *  dimensão", tem "Atual"/"A pagar"/"A receber"). */
function _renderOrganizadorInline(tipoUI, modo, grupoChave, ehDespesa, itens) {
    // Receitas agrupadas por categoria: sem filtro de forma de pagamento dentro das categorias
    if (tipoUI === 'entrada' && modo === 'categoria') return '';
    const opcoes = _SUBMODOS_POR_MODO[modo];
    if (!opcoes) return '';
    const subAtual = _subModoGrupoDe(tipoUI, modo, grupoChave);
    // Só oferece o filtro quando há mais de uma opção nos dados do grupo (ex.: todos na mesma forma de
    // pagamento = filtro sem sentido). Um filtro já ativo continua visível pra poder ser desfeito.
    const temEscolha = dim => {
        if (!itens) return true;
        const c = _dimensaoSubmodo(dim, ehDespesa);
        return new Set(itens.map(t => c.chaveDe(t) || c.semChave)).size > 1;
    };
    const visiveis = opcoes.filter(dim => subAtual === dim || temEscolha(dim));
    if (!visiveis.length) return '';
    const botoes = visiveis.map(dim => {
        const cfg = _dimensaoSubmodo(dim, ehDespesa);
        const full = `${cfg.emoji} ${cfg.label}`;
        return `<span role="button" tabindex="0" class="subgrupo-modo-btn${subAtual === dim ? ' active' : ''}" data-submodo="${dim}" data-full="${full}"${dim === 'metodo' ? ` data-med="${cfg.emoji} Forma de pgto." data-curto="${cfg.emoji} Pgto."` : ''} data-emoji="${cfg.emoji}">${full}</span>`;
    }).join('');
    return `
        <span class="subgrupo-organizador" data-grupo-chave="${String(grupoChave).replace(/"/g, '&quot;')}">
          <span role="button" tabindex="0" class="subgrupo-modo-icone${subAtual !== 'cronologica' ? ' ativo' : ''}" data-submodo-icone="1" title="Tirar filtro"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M3 4h18v2.5l-7 8V19l-4 2v-6.5l-7-8V4z"/></svg></span>
          ${botoes}
        </span>`;
}

/** Corpo (itens) de UM grupo, já considerando se ele tem um submodo
 *  escolhido (reorganiza por outra dimensão) ou não (cronológico, padrão). */
function _corpoGrupoComSubmodo(itens, tipoUI, modo, grupoChave, ehDespesa, abertosSub, gerarOpts) {
    const subAtual = _subModoGrupoDe(tipoUI, modo, grupoChave);
    if (subAtual === 'cronologica' || !_SUBMODOS_POR_MODO[modo]) {
        return itens.map(t => gerarHTMLTransacao(t, tipoUI, gerarOpts)).join('');
    }
    // gerarOpts leva junto os chips já escondidos pelo filtro de fora (filtro dentro de filtro: nenhum chip repetido)
    return _renderItensSubagrupados(itens, tipoUI, _dimensaoSubmodo(subAtual, ehDespesa), abertosSub, `${tipoUI}:${modo}:${grupoChave}`, undefined, gerarOpts || {});
}

// Cache das "próximas" (usado ao renderizar a aba Próximas)
let _proximasCtx = [];

/**
 * Gera HTML para uma transação — card único (sem versão compacta/expandida).
 * Layout: DIA DOW — VALOR MÉTODO CATEGORIA DESCRIÇÃO (linha que quebra).
 * opts.semMetodoChip: não mostra o chip de método (ex.: visão "Por método").
 * opts.semCategoriaChip: não mostra o chip de categoria (visão "Por categoria").
 * opts.semRelogio: não mostra o ⏰ de "ainda não aconteceu" (a aba Próximos só tem esses).
 */
function gerarHTMLTransacao(trans, tipo, opts = {}) {
    const ehParcela = !!trans.parcelasTotal;
    const ehOriginal = ehParcela && trans.parcelaNum === 1;
    // Parcelada: valor da parcela / valor total da compra (ex.: "R$ 15 / 45").
    const valorFormatado = ehParcela
        ? `${formatarMoeda(trans.valor)} <span class="valor-meta">/ ${formatarMoeda(trans.valorTotal || 0)}</span>`
        : formatarMoeda(trans.valor);
    const sinal = tipo === 'entrada' ? '+' : '-';

    // Cores dos "chips" (tarjinhas) de método / categoria / recorrência
    const cores = (estadoApp.menus && estadoApp.menus.cores) || {};
    const cor = (mapa, nome) => (mapa && mapa[nome]) || corPadraoChip(nome);
    const chip = (c, txt) => `<span class="chip" style="background:${c}" title="${String(txt).replace(/"/g, '&quot;')}">${txt}</span>`;

    // Dia/mês (com zero à esquerda — ex.: 01/10, 29/09) +
    // tricode do dia da semana (ex.: 26/9 SÁB).
    const _dowTri = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    const _dt = trans.data ? parseDataLocal(trans.data) : null;
    const diaFormatado = _dt ? `${String(_dt.getDate()).padStart(2, '0')}/${String(_dt.getMonth() + 1).padStart(2, '0')}` : '--';
    const dowFormatado = _dt ? _dowTri[_dt.getDay()] : '';

    const quandoTag = opts.quando ? `<span class="quando-tag">${opts.quando}</span>` : '';

    // Info da parcela (nunca vai para a descrição — vem dos campos da linha)
    const parcelaTag = ehParcela
        ? `<span class="parcela-tag" title="Parcelamento de ${formatarMoeda(trans.valorTotal || 0)}">${trans.parcelaNum}/${trans.parcelasTotal}</span>`
        : '';
    // Fica ao lado do "1/3", antes dos chips de método/categoria — não mais
    // junto dos ícones de editar/excluir no fim da linha.
    const quitarCheckbox = (ehParcela && !trans.quitada && !opts.semAcoes)
        ? `<label class="quitar-check" title="Quitar a partir deste mês"><input type="checkbox" name="quitar-parcela" data-act="quitar-parc" data-id="${trans.id}" ${trans.quitadoEm ? 'checked' : ''}> quitar</label>`
        : '';
    const quitadoTag = ehParcela && trans.quitadoEm
        ? `<span class="quitado-badge">quitado ${typeof mesTri === 'function' ? mesTri(String(trans.quitadoEm).slice(5, 7)) + '/' + String(trans.quitadoEm).slice(2, 4) : ''}</span>`
        : '';

    // Selos na margem esquerda, cada um alinhado ao texto da SUA linha: ⏰ (ainda não aconteceu) ou 🏦 (conciliado com o
    // banco) na linha da data; 🔁 (recorrência) na linha da descrição. Sem descrição, o 🔁 vai para a linha da data
    // (embaixo do ⏰/🏦, se houver).
    let seloNaData = '';
    if (!opts.semRelogio && !_transacaoRealizada(trans)) {
        seloNaData = '<span class="conc-selo conc-selo--in" title="Ainda não aconteceu (data futura)">⏰</span>';
    } else if (estadoApp.conciliadas && estadoApp.conciliadas.has(trans.id) && trans.origem !== 'pluggy') {
        seloNaData = '<span class="conc-selo conc-selo--in" title="Conciliado com uma transação do banco (Open Finance)">🏦</span>';
    }
    const seloRec = trans.recorrenciaId ? '<span class="conc-selo conc-selo--in" title="Lançamento de uma recorrência">🔁</span>' : '';
    // Só 1 selo por linha: o 🔁 fica na linha da descrição (que existe, mesmo vazia, quando há outro selo na linha da data)
    const recNaDesc = !!(seloRec && (trans.descricao || seloNaData));
    let seloLinha = '';
    if (seloRec && !recNaDesc) seloNaData = seloRec; // sem descrição e sem outro selo: o 🔁 vai para a linha da data

    const lado = `<span class="despesa-data">`
        + seloNaData
        + `<span class="despesa-dia">${diaFormatado}</span>`
        + (dowFormatado ? `<span class="despesa-dow">${dowFormatado}</span>` : '')
        + `</span>`;

    // Chip de método (visão "Por método" não mostra — já é a dimensão que agrupa)
    let metaChip = '';
    // Receita não tem forma de pagamento: o chip (ex.: PIX) fica escondido; só estorno de cartão mostra o cartão
    if (!opts.semMetodoChip && !(tipo === 'entrada' && !_ehEstornoCartao(trans))) {
        if (trans.metodo) {
            // Encolhe em telas estreitas (CSS troca qual span aparece) —
            // "Crédito Bradesco" -> "CC Bradesco" -> "CC Brad.".
            const itemMetodo = ((estadoApp.menus && estadoApp.menus.metodos) || []).find(m => rotuloMetodo(m) === trans.metodo);
            const niveis = itemMetodo && typeof rotuloMetodoNiveis === 'function' ? rotuloMetodoNiveis(itemMetodo) : null;
            const txtChip = (niveis && niveis.curto !== niveis.full)
                ? `<span class="met-tier-full">${niveis.full}</span><span class="met-tier-media">${niveis.media}</span><span class="met-tier-curto">${niveis.curto}</span>`
                : trans.metodo;
            metaChip = `<span class="chip" style="background:${cor(cores.metodo, trans.metodo)}" title="${String(trans.metodo).replace(/"/g, '&quot;')}">${txtChip}</span>`;
        } else if (trans.formaPagamento && trans.formaPagamento !== 'À vista') {
            metaChip = `<span class="chip chip--neutro">${trans.formaPagamento}</span>`;
        }
    }
    // Nome longo de categoria: no celular mostra a versão abreviada (o nome
    // completo continua no title) pra o chip não empurrar a linha pra baixo.
    const catChip = (!opts.semCategoriaChip && trans.categoria)
        ? chip(corDaCategoria(trans.categoria, (tipo === 'entrada' && !_ehEstornoCartao(trans)) ? 'entradas' : 'saidas'), _htmlNomeCategoriaChip(trans.categoria)) : '';
    const descTxt = (trans.descricao || recNaDesc)
        ? `<span class="despesa-desc">${recNaDesc ? seloRec : ''}${trans.descricao || '&nbsp;'}</span>` : '';

    // Ações
    let acoes = '';
    if (!opts.semAcoes) {
        if (opts.comConfirmarOcorrencia || trans.aConfirmar) {
            acoes += `<button class="btn-icon btn-success" data-act="confirmar-ocorrencia" data-id="${trans.id}" title="Confirmar: este lançamento veio de uma recorrência e ainda é só um rascunho" aria-label="Confirmar">✓</button>`;
        }
        if (opts.comAprovarDuplicata) {
            acoes += `<button class="btn-icon btn-success" data-act="aprovar-duplicata" data-id="${trans.id}" title="Não é duplicata — não avisar de novo sobre este lançamento">✓</button>`;
        }
        acoes += `<button class="btn-icon" data-act="editar-trans" data-id="${trans.id}" title="${ehParcela && !ehOriginal ? 'Editar (abre o lançamento original)' : 'Editar'}">✏️</button>`;
        if (opts.comConfirmarOcorrencia) {
            acoes += `<button class="btn-icon btn-danger" data-act="recusar-ocorrencia" data-id="${trans.id}" title="Não vai acontecer">✗</button>`;
        } else if (!trans.quitada) {
            acoes += `<button class="btn-icon btn-danger" data-act="excluir-trans" data-id="${trans.id}" title="Excluir" aria-label="Excluir">${ICONE_LIXEIRA}</button>`;
        }
    }

    const classes = `despesa-item ${tipo}` + (trans.quitada ? ' quitada' : '') + '';

    // .despesa-conteudo (dia/valor/tags/descrição) e .despesa-actions são
    // colunas separadas de um flex externo — o conteúdo nunca invade a
    // largura reservada pros ícones (que ficam empilhados, lápis em cima
    // da lixeira, e não junto do resto que quebra linha).
    return `
        <div class="${classes}" data-id="${trans.id}" data-tipo-transacao="${tipo === 'entrada' ? 'entradas' : 'saidas'}">
            <div class="despesa-conteudo">
                ${seloLinha}
                ${lado}
                <span class="despesa-valor">${sinal} ${valorFormatado}</span>
                ${parcelaTag}
                ${quitarCheckbox}
                ${(metaChip || catChip || quandoTag || quitadoTag) ? `<span class="despesa-badges">${metaChip}${catChip}${quandoTag}${quitadoTag}</span>` : ''}
                ${descTxt}
            </div>
            <div class="despesa-actions">${acoes}</div>
        </div>`;
}

/** Delegação de clique nas listas de transações */
function onListaTransacaoClick(e) {
    const aceitarTodas = e.target.closest('[data-dup-aceitar-todas]');
    if (aceitarTodas) {
        e.preventDefault(); // dentro do <summary> — sem isso também abre/fecha o <details>
        const det = aceitarTodas.closest('details.rec-grupo[data-nome="__duplicatas__"]');
        const ids = [...det.querySelectorAll('[data-act="aprovar-duplicata"]')].map(b => Number(b.dataset.id)).filter(Number.isFinite);
        ids.forEach(id => _aprovarDuplicata(id));
        atualizarUI();
        return;
    }
    const acConfirmar = e.target.closest('[data-ac-confirmar-todas]');
    const acApagar = e.target.closest('[data-ac-apagar-todas]');
    if (acConfirmar || acApagar) {
        e.preventDefault();
        const det = (acConfirmar || acApagar).closest('details.rec-grupo[data-nome="__aconfirmar__"]');
        const ids = [...det.querySelectorAll('[data-act="confirmar-ocorrencia"]')].map(b => Number(b.dataset.id)).filter(Number.isFinite);
        if (!ids.length) return;
        if (acConfirmar) { confirmarOcorrenciasRecorrencia(ids); return; }
        mostrarDialogo({
            titulo: 'Apagar todas as ocorrências?',
            texto: `Remove <strong>${ids.length}</strong> ocorrência${ids.length === 1 ? '' : 's'} listada${ids.length === 1 ? '' : 's'} aqui. As recorrências continuam ativas.`,
            acoes: [{ label: 'Cancelar' }, { label: 'Apagar todas', primario: true, perigo: true, onClick: async () => { await apagarOcorrenciasRecorrencia(ids); } }]
        });
        return;
    }
    const apagarTodas = e.target.closest('[data-dup-apagar-todas]');
    if (apagarTodas) {
        e.preventDefault();
        const det = apagarTodas.closest('details.rec-grupo[data-nome="__duplicatas__"]');
        const ids = [...det.querySelectorAll('[data-act="aprovar-duplicata"]')].map(b => Number(b.dataset.id)).filter(Number.isFinite);
        if (!ids.length) return;
        mostrarDialogo({
            titulo: 'Apagar todas as duplicatas?',
            texto: `Remove <strong>${ids.length}</strong> lançamento${ids.length === 1 ? '' : 's'} listado${ids.length === 1 ? '' : 's'} neste grupo. Não dá para desfazer.`,
            acoes: [
                { label: 'Cancelar' },
                { label: 'Apagar todas', primario: true, perigo: true, onClick: async () => {
                    for (const id of ids) await excluirTransacao(id);
                } }
            ]
        });
        return;
    }
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const id = Number(el.dataset.id);

    // estadoApp.transacoes só carrega a COMPETÊNCIA do mês em exibição; a
    // lista de "Próximos" filtra por DATA, não por competência — um tipo
    // como "Último dia útil do mês anterior" sempre tem data num mês e
    // competência no seguinte, então um item dela pode não estar em
    // estadoApp.transacoes. Sem isso, confirmar/editar/excluir a partir de
    // "Próximos" não achava a transação e o clique não fazia nada.
    const ctxProximas = (typeof _proximasCtx !== 'undefined' && _proximasCtx) ? _proximasCtx : [];
    const trans = [...estadoApp.transacoes.entradas, ...estadoApp.transacoes.saidas, ...ctxProximas.map(c => c.trans), ..._transacoesExtra]
        .find(t => t.id === id);
    if (!trans) return;

    switch (el.dataset.act) {
        case 'quitar-parc':
            quitarParcelamento(id, el.checked);
            break;
        case 'editar-trans': {
            if (trans.parcelasTotal && trans.parcelaNum !== 1) { abrirOriginalDaParcela(trans); break; }
            const viaProximasEntrada = ctxProximas.some(c => c.trans.id === id && c.tipoUI === 'entrada');
            const extraTrans = _transacoesExtra.find(t => t.id === id);
            const tipo = extraTrans ? extraTrans.tipo : (estadoApp.transacoes.entradas.some(t => t.id === id) || viaProximasEntrada
                ? 'entradas' : 'saidas');
            iniciarEdicaoTransacao(trans, tipo);
            break;
        }
        case 'confirmar-ocorrencia':
            confirmarOcorrenciaRecorrencia(id);
            break;
        case 'recusar-ocorrencia':
        case 'excluir-trans':
            if (trans.recorrenciaId) { perguntarExcluirRecorrente(trans); break; }
            // Parcela que não é a original: aviso, sem confirmação prévia
            if (trans.parcelasTotal && trans.parcelaNum !== 1) {
                excluirTransacao(id); // deixa a API lançar o detalhe e o catch mostra o diálogo
            } else {
                mostrarDialogo({
                    titulo: 'Excluir lançamento?',
                    texto: `Remove <strong>${trans.descricao || trans.categoria || 'este lançamento'}</strong>. Não dá para desfazer.`,
                    acoes: [
                        { label: 'Cancelar' },
                        { label: 'Excluir', primario: true, perigo: true, onClick: async () => { await excluirTransacao(id); } }
                    ]
                });
            }
            break;
        case 'aprovar-duplicata':
            _aprovarDuplicata(id);
            atualizarUI();
            break;
    }
}

/**
 * Atualiza gráfico de categorias
 */
async function atualizarGrafico() {
    const container = document.querySelector(SELECTORS.categoriesList);
    if (!container) return;
    
    const transacoes = estadoApp.transacoes.saidas;
    
    // Agrupar por categoria
    const porCategoria = {};
    transacoes.forEach(trans => {
        if (!porCategoria[trans.categoria]) {
            porCategoria[trans.categoria] = 0;
        }
        porCategoria[trans.categoria] += trans.valor;
    });
    
    // Ordenar por valor decrescente
    const categoriasOrdenadas = Object.entries(porCategoria)
        .sort((a, b) => b[1] - a[1]);
    
    if (categoriasOrdenadas.length === 0) {
        container.innerHTML = '<p class="empty-message">Nenhuma despesa neste mês</p>';
        return;
    }
    
    // Total para percentual
    const total = Object.values(porCategoria).reduce((a, b) => a + b, 0);
    
    // Gerar HTML
    let html = '';
    categoriasOrdenadas.forEach((entrada, index) => {
        const [categoria, valor] = entrada;
        const percentual = total > 0 ? (valor / total) * 100 : 0;
        const cor = CORES_CATEGORIAS[index % CORES_CATEGORIAS.length];
        
        html += `
            <div class="category-item">
                <div class="category-color" style="background-color: ${cor};"></div>
                <div class="category-info">
                    <div class="category-name">${categoria}</div>
                    <div class="category-bar">
                        <div class="category-fill" style="width: ${percentual}%; background-color: ${cor};"></div>
                    </div>
                </div>
                <div class="category-value">
                    ${formatarMoeda(valor)} (${percentual.toFixed(1)}%)
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

/** Clique dentro da lista de "Próximas" — cobre o organizador inline das
 *  faturas de cartão (data-submodo/data-submodo-icone) antes de cair no
 *  handler padrão (editar/excluir). */
async function _onCliqueProximas(e) {
    const fatPagar = e.target.closest('[data-fatura-pagar]');
    if (fatPagar) {
        e.preventDefault();
        if (await _alternarFaturaPagaBtn(fatPagar)) atualizarProximasTransacoes();
        return;
    }
    // Dentro da busca, refaz a busca (e não a aba Próximos)
    const refazer = () => (e.target.closest('#resultadoBusca') ? atualizarBuscaGlobal() : atualizarProximasTransacoes());
    const subBtn = e.target.closest('[data-submodo]');
    if (subBtn) {
        e.preventDefault();
        const grupoChave = subBtn.closest('[data-grupo-chave]').dataset.grupoChave;
        const atual = _subModoGrupoDe('saida', 'metodo', grupoChave);
        const novo = subBtn.dataset.submodo === atual ? 'cronologica' : subBtn.dataset.submodo;
        _setSubModoGrupo('saida', 'metodo', grupoChave, novo);
        const det = subBtn.closest('details.fatura-item');
        if (det) det.open = true;
        refazer();
        return;
    }
    const subIcone = e.target.closest('[data-submodo-icone]');
    if (subIcone) {
        e.preventDefault();
        const grupoChave = subIcone.closest('[data-grupo-chave]').dataset.grupoChave;
        _setSubModoGrupo('saida', 'metodo', grupoChave, 'cronologica');
        refazer();
        return;
    }
    onListaTransacaoClick(e);
}

// Abreviações de palavras comuns em nomes de categoria; qualquer outra palavra
// com mais de 8 letras vira as 5 primeiras + ".".
const _ABREV_CATEGORIA = {
    transporte: 'Transp.', alimentação: 'Aliment.', serviços: 'Serv.', educação: 'Educ.',
    manutenção: 'Manut.', assinaturas: 'Assin.', restaurante: 'Rest.', farmácia: 'Farm.',
    eletrônicos: 'Eletr.', alcoólica: 'alc.', alcoólicas: 'alc.', supermercado: 'Superm.',
    entretenimento: 'Entret.', vestuário: 'Vest.', investimentos: 'Invest.', combustível: 'Comb.',
    telecomunicações: 'Telecom.', comunicação: 'Comun.', estacionamento: 'Estac.',
};
function abreviarCategoria(nome) {
    return String(nome).split(' ').map(p => {
        const ab = _ABREV_CATEGORIA[p.toLowerCase()];
        if (ab) return p[0] === p[0].toUpperCase() ? ab[0].toUpperCase() + ab.slice(1) : ab;
        return p.length > 8 ? p.slice(0, 5) + '.' : p;
    }).join(' ');
}
/** Chip de categoria: nome inteiro + versão abreviada (só nomes > 13 letras);
 *  o CSS mostra a abreviada em telas estreitas (ver .cat-curto em theme.css). */
function _htmlNomeCategoriaChip(nome) {
    const curto = abreviarCategoria(nome);
    if (String(nome).length <= 13 || curto === nome) return nome;
    return `<span class="cat-full">${nome}</span><span class="cat-curto">${curto}</span>`;
}

/** O mês em exibição ainda não chegou? */
function _mesFuturo() {
    const hoje = new Date();
    const mesRef = estadoApp.mesAtual || hoje;
    return mesRef.getFullYear() > hoje.getFullYear()
        || (mesRef.getFullYear() === hoje.getFullYear() && mesRef.getMonth() > hoje.getMonth());
}

// ---------------------------------------------------------------------------
// Grupos mostram só 5 itens por vez ("Carregar mais 5"), em qualquer lista de grupos das abas
// Receitas/Despesas/Próximos. Aplicado no DOM depois de cada renderização (MutationObserver);
// a quantidade aberta de cada grupo é lembrada entre atualizações.
const _limitesLista = {};
let _aplicandoLimite = false;
let _observadorLimite = null;

function _chaveLista(pai) {
    const partes = [];
    for (let el = pai; el && !el.classList.contains('tab-content'); el = el.parentElement) {
        if (el.tagName === 'DETAILS') {
            partes.push(el.dataset.nome || el.dataset.pend || el.querySelector(':scope > summary')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) || 'g');
        }
    }
    return (pai.closest('.tab-content')?.id || '') + '>' + partes.reverse().join('>');
}

function _aplicarLimiteListas(raiz) {
    _aplicandoLimite = true;
    const pais = new Set();
    raiz.querySelectorAll('.despesa-item').forEach(i => { if (i.parentElement) pais.add(i.parentElement); });
    pais.forEach(pai => {
        pai.querySelectorAll(':scope > .lista-mais-btn').forEach(b => b.remove());
        const itens = [...pai.children].filter(c => c.classList.contains('despesa-item'));
        const chave = _chaveLista(pai);
        const lim = _limitesLista[chave] || 5;
        itens.forEach((it, i) => { it.hidden = i >= lim; });
        if (itens.length > lim) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'busca-ampla-btn lista-mais-btn';
            btn.dataset.listaChave = chave;
            btn.innerHTML = `Carregar mais 5 <small>restam ${itens.length - lim}</small>`;
            itens[itens.length - 1].after(btn);
        }
    });
    if (_observadorLimite) _observadorLimite.takeRecords(); // ignora as mudanças feitas aqui
    _aplicandoLimite = false;
}

function iniciarLimiteListas() {
    const raizes = ['entradas', 'saidas', 'proximas'].map(id => document.getElementById(id)).filter(Boolean);
    if (!raizes.length) return;
    _observadorLimite = new MutationObserver(() => {
        if (_aplicandoLimite) return;
        raizes.forEach(r => _aplicarLimiteListas(r));
    });
    raizes.forEach(r => _observadorLimite.observe(r, { childList: true, subtree: true }));
    document.addEventListener('click', e => {
        const btn = e.target.closest('.lista-mais-btn');
        if (!btn) return;
        e.preventDefault();
        _limitesLista[btn.dataset.listaChave] = (_limitesLista[btn.dataset.listaChave] || 5) + 5;
        _aplicarLimiteListas(btn.closest('.tab-content') || document);
    });
}
window.addEventListener('load', iniciarLimiteListas);

// Fechar um grupo zera o "Carregar mais 5" dele (e dos subgrupos de dentro): ao abrir de novo, voltam os 5 primeiros.
document.addEventListener('toggle', e => {
    const d = e.target;
    if (!d || d.tagName !== 'DETAILS' || d.open) return;
    const aba = d.closest('.tab-content');
    if (!aba || !['entradas', 'saidas', 'proximas'].includes(aba.id)) return;
    const base = _chaveLista(d);
    let mudou = false;
    Object.keys(_limitesLista).forEach(k => { if (k === base || k.startsWith(base + '>')) { delete _limitesLista[k]; mudou = true; } });
    if (mudou) _aplicarLimiteListas(aba);
}, true);

/** Reavalia _ajustarBadgesQuebrados depois de qualquer render de lista —
 *  despesa-item aparece em várias telas/abas (mês corrente, busca,
 *  Próximos, visão anual...), então observar o documento inteiro é mais
 *  simples do que caçar cada função que desenha um. Via microtask (roda
 *  antes da próxima pintura), não requestAnimationFrame, pra não piscar
 *  "abreviado" e depois "completo" por 1 frame a cada render. */
function iniciarAjusteBadgesQuebrados() {
    let agendado = false;
    const obs = new MutationObserver(() => {
        if (agendado) return;
        agendado = true;
        queueMicrotask(() => { agendado = false; _ajustarBadgesQuebrados(); });
    });
    obs.observe(document.body, { childList: true, subtree: true });
}
window.addEventListener('load', iniciarAjusteBadgesQuebrados);
