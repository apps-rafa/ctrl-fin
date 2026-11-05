/**
 * PALAVRAS-CHAVE DAS CATEGORIAS (Configurações > Categorias > "Como o app sugere a categoria")
 * Cada categoria tem uma lista de palavras (coluna menu_itens.palavras_chave) que o bot do Telegram e a
 * importação do banco usam para sugerir a categoria. Aqui o usuário vê e edita: grupos Despesas/Receitas,
 * chips coloridos das categorias (como no lançamento) e, ao tocar num chip, as palavras dele (apagar/adicionar).
 * A busca em si é supabase/functions/_shared/palavras-chave.ts (e a cópia em js/pluggy.js).
 */
const _regrasEstado = { aberto: { saidas: false, entradas: false }, sel: { saidas: null, entradas: null } };

function _escRegras(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** Categorias ativas do tipo, na ordem da lista (Estorno só existe a partir do 1º cartão de crédito, como na lista de categorias). */
function _categoriasDasRegras(tipo) {
    const m = (typeof menusAtual !== 'undefined' && menusAtual) || {};
    const temCartao = (m.metodos || []).some(x => x.metodoKind === 'Crédito' && x.status === 'Ativo');
    const lista = tipo === 'entradas' ? m.categoriasReceita : m.categoriasDespesa;
    return (lista || []).filter(c => c.status === 'Ativo' && (c.nome !== CATEGORIA_ESTORNO || tipo === 'entradas' || temCartao));
}

function _htmlGrupoRegras(tipo, titulo) {
    const cats = _categoriasDasRegras(tipo);
    const sel = cats.find(c => c.nome === _regrasEstado.sel[tipo]) || null;
    const chips = cats.map(c => `<button type="button" class="chip regra-chip${sel && sel.nome === c.nome ? ' regra-chip--sel' : ''}" data-regra-cat="${_escRegras(c.nome)}" style="background:${corDoItemMenu(c)}" aria-pressed="${sel && sel.nome === c.nome}">${_escRegras(c.nome)}</button>`).join('');
    return `
        <details class="regra-grupo" data-regra-tipo="${tipo}" ${_regrasEstado.aberto[tipo] ? 'open' : ''}>
            <summary>${titulo} <span class="regra-grupo-n">${cats.length}</span></summary>
            <div class="regra-chips">${chips || '<span class="regra-nada">Nenhuma categoria</span>'}</div>
            <div class="regra-editor-box" data-regra-editor="${tipo}">${sel ? _htmlEditorRegras(tipo, sel) : '<p class="menu-hint">Toque numa categoria para ver e editar as palavras dela.</p>'}</div>
        </details>`;
}

function _htmlEditorRegras(tipo, cat) {
    const palavras = cat.palavrasChave || [];
    const tags = palavras.length
        ? palavras.map((p, i) => `<span class="regra-palavra">${_escRegras(p)}<button type="button" class="regra-x" data-regra-del="${i}" aria-label="Remover ${_escRegras(p)}" title="Remover">×</button></span>`).join('')
        : '<span class="regra-nada">Nenhuma palavra: esta categoria nunca é sugerida sozinha.</span>';
    const temPadrao = typeof PALAVRAS_CHAVE_PADRAO !== 'undefined' && PALAVRAS_CHAVE_PADRAO[cat.nome];
    return `
        <div class="regra-editor">
            <div class="regra-editor-tit">Palavras de <b>${_escRegras(cat.nome)}</b></div>
            <div class="regra-palavras">${tags}</div>
            <div class="regra-add">
                <input type="text" class="regra-input" maxlength="60" placeholder="nova palavra (ou várias, separadas por vírgula)" aria-label="Nova palavra" autocomplete="off">
                <button type="button" class="mini-btn" data-regra-add>+ Adicionar</button>
                ${temPadrao ? '<button type="button" class="mini-btn" data-regra-padrao title="Volta para a lista que vem com o app">↺ Padrão</button>' : ''}
            </div>
        </div>`;
}

function _htmlIntroRegras() {
    return `
        <p class="menu-hint regra-intro">
            O bot do Telegram e a importação do banco usam estas palavras para sugerir a categoria de um lançamento.
            Toque numa categoria para ver e editar as palavras dela.
        </p>
        <details class="regra-lermais">
            <summary>ler mais</summary>
            <div class="menu-hint">
                <p>A palavra precisa aparecer no <b>início</b> de uma palavra do texto, sem diferenciar maiúsculas nem acentos:
                "drogaria" casa com "Drogarias Imperial", mas "posto" não casa com "imposto". Palavras de até 3 letras
                (como "luz" e "gás") só casam inteiras. Se mais de uma categoria casar, vale a palavra mais longa.</p>
                <p><b>💳 Compras do cartão/banco</b>: 1) a categoria que você já usou antes para essa mesma descrição; 2) categoria com o mesmo nome da descrição do banco; 3) estas palavras no nome do estabelecimento; 4) a categoria da própria Pluggy, traduzida. Sem nenhuma, fica em branco para você escolher.</p>
                <p><b>🤖 Texto no bot</b>: 1) o nome de uma categoria sua citado no texto; 2) estas palavras; 3) "Outros" (ou a 1ª categoria do tipo, se não houver "Outros").</p>
                <p>Só são sugeridas categorias que existem no seu cadastro, e você pode trocar antes de confirmar.</p>
            </div>
        </details>`;
}

function _desenharRegras() {
    const corpo = document.getElementById('regrasCatCorpo');
    if (!corpo) return;
    corpo.innerHTML = `${_htmlIntroRegras()}${_htmlGrupoRegras('saidas', 'Despesas')}${_htmlGrupoRegras('entradas', 'Receitas')}`;
}

/** Grava a lista de palavras da categoria (sem aviso na tela, só se der erro) e atualiza os caches do app. */
async function _salvarPalavrasCategoria(cat, tipo, palavras) {
    const antes = cat.palavrasChave;
    cat.palavrasChave = palavras;
    const { error } = await sb.from('menu_itens').update({ palavras_chave: palavras }).eq('id', cat.linha);
    if (error) {
        cat.palavrasChave = antes;
        console.error('Erro ao salvar palavras-chave:', error);
        mostrarNotificacao('Erro ao salvar as palavras', 'erro');
    } else if (typeof estadoApp !== 'undefined' && estadoApp.menus) {
        const mapa = (estadoApp.menus.palavrasChave = estadoApp.menus.palavrasChave || { saidas: {}, entradas: {} });
        (mapa[tipo] = mapa[tipo] || {})[cat.nome] = palavras;
    }
    _desenharEditorRegras(tipo);
}

function _desenharEditorRegras(tipo) {
    const caixa = document.querySelector(`[data-regra-editor="${tipo}"]`);
    const cat = _categoriasDasRegras(tipo).find(c => c.nome === _regrasEstado.sel[tipo]);
    if (!caixa || !cat) return;
    caixa.innerHTML = _htmlEditorRegras(tipo, cat);
    caixa.querySelector('.regra-input')?.focus();
}

function _adicionarPalavras(tipo, cat, texto) {
    const jaTem = new Set((cat.palavrasChave || []).map(p => _normalizarPalavraRegra(p)));
    const novas = [];
    String(texto).split(/[,;\n]/).map(p => p.trim().replace(/\s+/g, ' ')).filter(Boolean).forEach(p => {
        const n = _normalizarPalavraRegra(p);
        if (n && !jaTem.has(n)) { jaTem.add(n); novas.push(p); }
    });
    if (novas.length) _salvarPalavrasCategoria(cat, tipo, [...(cat.palavrasChave || []), ...novas]);
}

/** Mesma normalização da busca (minúsculas, sem acento), só para não aceitar duas vezes a mesma palavra. */
function _normalizarPalavraRegra(s) {
    return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function _cliqueRegras(e) {
    const grupo = e.target.closest('[data-regra-tipo]');
    if (!grupo) return;
    const tipo = grupo.dataset.regraTipo;
    const catDoClique = e.target.closest('[data-regra-cat]');
    if (catDoClique) {
        const nome = catDoClique.dataset.regraCat;
        _regrasEstado.sel[tipo] = _regrasEstado.sel[tipo] === nome ? null : nome; // tocar de novo fecha o editor
        _desenharRegras();
        return;
    }
    const cat = _categoriasDasRegras(tipo).find(c => c.nome === _regrasEstado.sel[tipo]);
    if (!cat) return;
    const del = e.target.closest('[data-regra-del]');
    if (del) {
        const i = Number(del.dataset.regraDel);
        _salvarPalavrasCategoria(cat, tipo, (cat.palavrasChave || []).filter((_p, k) => k !== i));
    } else if (e.target.closest('[data-regra-add]')) {
        const input = grupo.querySelector('.regra-input');
        if (input && input.value.trim()) _adicionarPalavras(tipo, cat, input.value);
    } else if (e.target.closest('[data-regra-padrao]')) {
        _salvarPalavrasCategoria(cat, tipo, [...(PALAVRAS_CHAVE_PADRAO[cat.nome] || [])]);
    }
}

/** Chamado a cada (re)desenho da aba Configurações: desenha tudo e liga os eventos. */
function iniciarRegrasCategoria() {
    const det = document.getElementById('regrasCatDetalhes');
    const corpo = document.getElementById('regrasCatCorpo');
    if (!det || !corpo) return;
    _desenharRegras();
    corpo.addEventListener('click', _cliqueRegras);
    corpo.addEventListener('keydown', e => {
        if (e.key !== 'Enter' || !e.target.classList.contains('regra-input')) return;
        e.preventDefault();
        const grupo = e.target.closest('[data-regra-tipo]');
        const tipo = grupo.dataset.regraTipo;
        const cat = _categoriasDasRegras(tipo).find(c => c.nome === _regrasEstado.sel[tipo]);
        if (cat && e.target.value.trim()) _adicionarPalavras(tipo, cat, e.target.value);
    });
    // lembra quais grupos estavam abertos quando a aba é redesenhada (ex.: ao adicionar uma categoria)
    corpo.addEventListener('toggle', e => {
        const g = e.target.closest && e.target.closest('[data-regra-tipo]');
        if (g && e.target === g) _regrasEstado.aberto[g.dataset.regraTipo] = g.open;
    }, true);
}
