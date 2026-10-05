// Formulário de lançamento: rótulos por tipo, campos Mês/Parcelas, novas categorias/formas de pagamento e cálculo da competência.
// Extraído de ui.js (mesmas funções globais; carregado logo depois dele em index.html).

/**
 * Define o texto de um label usando a versão curta quando a completa não
 * couber em uma única linha (labels nunca podem quebrar linha no formulário).
 */
function definirLabelResp(sel, full, short) {
    const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (!el) return;
    el.textContent = full;
    if (!short) return;
    const semEspaco = el.offsetParent !== null && el.scrollWidth > el.clientWidth + 1;
    if (semEspaco) el.textContent = short;
}

/** O chip de método (Crédito Bradesco etc.) abrevia por causa da LARGURA DA
 *  TELA (ver CSS .met-tier-… nos @media) — mas se os chips (.despesa-badges)
 *  já quebraram pra linha própria, longe do dia/valor/ações, sobra espaço
 *  ali e abreviar deixa de fazer sentido. "Quebrou" = o grupo de chips não
 *  está mais na mesma linha do valor. Rodado por um MutationObserver (ver
 *  final do arquivo) depois de qualquer render de lista — mais simples
 *  observar o resultado do que caçar cada função que desenha um
 *  despesa-item pela tela. */
function _ajustarBadgesQuebrados(root) {
    (root || document).querySelectorAll('.despesa-item').forEach(item => {
        const badges = item.querySelector('.despesa-badges');
        const valor = item.querySelector('.despesa-valor');
        if (!badges || !valor) { delete item.dataset.metTier; return; }
        if (item.offsetParent === null) return; // oculto (grupo fechado): mede quando aparecer
        const quebrou = () => badges.offsetTop > valor.offsetTop + 2;
        if (!item.querySelector('.met-tier-full')) return;
        // Prioridade máxima: não quebrar linha. Tenta o nome inteiro, depois "CC Bradesco" e "CC Brad."; só se nem o mais curto
        // couber, os chips quebram e voltam ao nome inteiro (sozinhos na linha, sobra espaço).
        let tier = 'full';
        for (const t of ['full', 'media', 'curto']) {
            item.dataset.metTier = t;
            if (!quebrou()) { tier = t; break; }
            tier = null;
        }
        if (!tier) item.dataset.metTier = 'full';
    });
}

/** Mesma ideia de definirLabelResp, mas pra uma FILEIRA inteira de botões de
 *  filtro (data-full/data-emoji cada um) — usado no filtro principal
 *  (Recorrência/Forma de pgto./Categoria) e no organizador inline dentro de
 *  "Pontual" (Categoria/Forma de pgto.). Se a fileira não couber numa linha
 *  só, TODOS os botões encolhem pro emoji junto (troca uniforme, não um de
 *  cada vez) — mantém alinhado e nunca quebra linha. */
function _ajustarLabelsFiltro(rowEl) {
    if (!rowEl) return;
    const btns = [...rowEl.querySelectorAll('[data-full]')];
    if (!btns.length) return;
    // do mais longo ao mais curto (os níveis médio/curto são opcionais: "Forma de pgto." e "Pgto.")
    const niveis = [b => b.dataset.full, b => b.dataset.med, b => b.dataset.curto, b => b.dataset.emoji];
    const aplica = i => btns.forEach(b => { b.textContent = niveis[i](b) || niveis[i - 1 >= 0 ? i - 1 : 0](b) || b.dataset.full; });
    aplica(0);
    requestAnimationFrame(() => {
        for (let i = 1; i < niveis.length && rowEl.scrollWidth > rowEl.clientWidth + 1; i++) aplica(i);
    });
}

/**
 * Quando, no grid de campos, o último campo visível fica sozinho na linha,
 * faz ele ocupar 100% da largura (ex.: "Descrição").
 */
function ajustarCamposSozinhos() {
    const grid = document.getElementById('linhaCampos');
    if (!grid) return;
    grid.querySelectorAll('.solo').forEach(el => el.classList.remove('solo'));
    const cols = (getComputedStyle(grid).gridTemplateColumns.match(/px|fr|%|rem/g) || []).length
        || getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length || 1;
    const cells = [...grid.children].filter(el => !el.hidden && el.offsetParent !== null);
    if (cols > 1 && cells.length % cols === 1) {
        cells[cells.length - 1].classList.add('solo');
    }
}

/** Texto mostrado DENTRO da caixa de parcelas: "à vista" pra 1x, "Nx" daí
 *  pra cima (o rótulo "Parcelas" em cima é sempre fixo — só o conteúdo
 *  da caixa muda). */
function _parcelasTexto(n) {
    return n > 1 ? `${n}x` : 'à vista';
}

/** Número de parcelas "de verdade" a partir do que estiver na caixa —
 *  funciona tanto com o texto formatado ("à vista", "3x") quanto com
 *  dígitos crus (campo em edição, ver foco/blur em events.js): parseInt
 *  já para no primeiro caractere não-numérico ("3x" -> 3), e "à vista"
 *  (começa com letra) vira NaN -> cai no padrão de 1. */
function _parcelasNumero(input) {
    return Math.max(1, parseInt(input?.value, 10) || 1);
}

/** O "Mês" (competência) fica sempre ao lado da Data, em despesa e em receita (ver #dataValorBloco). */
function posicionarCompetencia() {
    const grp = document.getElementById('competenciaGroup');
    if (grp) grp.hidden = false;
}

/**
 * Mostra/esconde "Mês" e "Parcelas" — só existem pra despesa em Crédito.
 * O campo de parcelas fica sempre visível junto (setinha ▲▼, começando em
 * "à vista") com o rótulo "Parcelas" fixo — só o CONTEÚDO da caixa muda
 * ("à vista" com 1x, "Nx" com 2x ou mais). O dia de vencimento de cada
 * parcela não é mais perguntado aqui — usa direto o dia já cadastrado no
 * cartão (ver metodoSelecionado().diaVencimento).
 */
function atualizarCampoParcelas() {
    const ehReceita = document.querySelector(SELECTORS.tipoTransacao)?.value === 'entradas';
    const metodoAtual = typeof metodoSelecionado === 'function' ? metodoSelecionado() : null;
    const ehCredito = !ehReceita && !_formEhEstorno() && !!metodoAtual && metodoAtual.metodoKind === 'Crédito';

    const set = (id, mostrar) => { const el = document.getElementById(id); if (el) el.hidden = !mostrar; };
    // "Mês" (competência): todo lançamento tem. No Crédito é calculado a partir da data da compra +
    // fechamento do cartão; nos outros casos, começa no mês em exibição (editável).
    // Estorno também tem mês da fatura, mas nunca parcelas.
    posicionarCompetencia(ehReceita);

    const parcelasInput = document.getElementById('parcelas');
    if (!ehCredito && parcelasInput) parcelasInput.value = _parcelasTexto(1);
    const parcelas = _parcelasNumero(parcelasInput);
    // Enquanto o campo está em edição (foco), mostra dígito cru — não
    // reformata a cada tecla (ver focus/input/blur em events.js).
    if (parcelasInput && document.activeElement !== parcelasInput) {
        parcelasInput.value = _parcelasTexto(parcelas);
    }

    set('parceleGroup', ehCredito);
    set('valorTotalGroup', parcelas > 1);
    atualizarValorTotal();

    if (typeof recalcularCompetencia === 'function') recalcularCompetencia();

    ajustarCamposSozinhos();
}

/** Preenche o campo "Total" (readonly) ao lado do Valor quando parcelado —
 *  "Valor" é o valor de CADA parcela (ver adicionarParceladoAPI em api.js),
 *  então o total é ele vezes o nº de parcelas. */
function atualizarValorTotal() {
    const tot = document.getElementById('valorTotal');
    if (!tot) return;
    const v = valorCampoParaNumero(document.querySelector(SELECTORS.valor));
    const mult = typeof _parcelasNumero === 'function' ? _parcelasNumero(document.getElementById('parcelas')) : 1;
    tot.value = formatarMoeda(v * mult);
}

/**
 * Ajusta rótulos e campos conforme o tipo (receita = entradas | despesa = saidas):
 * - receita não tem método (campo escondido, não obrigatório)
 * - "Dia de vencimento" vira "Dia do pagamento"; checkbox muda de texto
 */
function atualizarLabelsPorTipo() {
    const ehReceita = document.querySelector(SELECTORS.tipoTransacao)?.value === 'entradas';

    const metodoSel = document.querySelector(SELECTORS.metodo);
    if (ehReceita) {
        // Receita não tem forma de pagamento
        atualizarCampoMetodoReceita();
        posicionarCompetencia(true);
    } else {
        const blocoMetodo = document.getElementById('metodoBloco');
        if (blocoMetodo) blocoMetodo.hidden = false;
        if (metodoSel) metodoSel.required = true;
        // A lista pode ter ficado restrita a Crédito/PIX-Débito (Estorno/
        // Reembolso na receita) — repõe a lista completa pra despesa.
        if (typeof preencherDropdownMetodos === 'function') preencherDropdownMetodos();
        if (typeof atualizarCampoCredito === 'function') atualizarCampoCredito();
        if (metodoSel) delete metodoSel.dataset.restrito;
    }

    // Categorias são específicas de receita x despesa
    if (typeof preencherDropdownCategorias === 'function') preencherDropdownCategorias();

    ajustarCamposSozinhos();
}

/**
 * Insere uma categoria nova na posição ALFABÉTICA dentro da lista atual, em
 * vez de jogar pro fim. "ordem" é inteira no banco, então não dá pra
 * encaixar num ponto fracionário: o item novo assume a "ordem" de quem
 * viria depois dele alfabeticamente, e só os itens A PARTIR DAQUELE PONTO
 * (não a lista toda) são empurrados +1 — quem já vinha antes não muda.
 */
async function _inserirCategoriaAlfabetica(lista, nome, dadosExtra) {
    const itens = [...(lista || [])]
        .sort((a, b) => {
            const oa = a.ordem ?? Infinity, ob = b.ordem ?? Infinity;
            return oa - ob || String(a.nome).localeCompare(String(b.nome), 'pt-BR');
        })
        .map((item, i) => ({ ...item, _ordemEfetiva: item.ordem ?? (i + 1) }));

    const depois = itens.findIndex(it => String(it.nome).localeCompare(nome, 'pt-BR') > 0);
    const novaOrdem = depois === -1
        ? (itens.length ? itens[itens.length - 1]._ordemEfetiva + 1 : 1)
        : itens[depois]._ordemEfetiva;

    const ok = await adicionarItemMenuAPI('Categoria', nome, { ...dadosExtra, ordem: novaOrdem });
    if (!ok) return false;

    if (depois !== -1) {
        const deslocamentos = itens.slice(depois).map(it => ({ id: it.linha, ordem: it._ordemEfetiva + 1 }));
        if (deslocamentos.length) await salvarOrdemMenuAPI(deslocamentos);
    }
    return true;
}

/**
 * Diálogo rápido para criar uma categoria.
 * @param {'saidas'|'entradas'} [catTipo] tipo da categoria; se omitido usa o tipo atual do formulário
 */
function abrirNovaCategoria(catTipo) {
    const tipo = (catTipo === 'entradas' || catTipo === 'saidas')
        ? catTipo
        : (estadoApp.tipoAtual === 'entradas' ? 'entradas' : 'saidas');
    const rotulo = tipo === 'entradas' ? 'receita' : 'despesa';
    mostrarDialogo({
        titulo: `Nova categoria de ${rotulo}`,
        corpoHTML: `
            <div class="campo"><label for="dlgCatNome">Nome</label>
                <input type="text" id="dlgCatNome" placeholder="Ex: Mercado" autocomplete="off"></div>
            <div class="campo"><label for="dlgCatDesc">Descrição <span class="opt">(opcional)</span></label>
                <input type="text" id="dlgCatDesc" autocomplete="off"></div>`,
        acoes: [
            { label: 'Cancelar' },
            { label: 'Adicionar', primario: true, onClick: async (ov) => {
                const nome = ov.querySelector('#dlgCatNome').value.trim();
                if (!nome) { mostrarNotificacao('Informe o nome', 'info'); return true; }
                // estadoApp.menus.categoriasReceita/Despesa são só listas de NOMES
                // (o que o dropdown do formulário precisa) — a ordenação alfabética
                // exige os itens completos (ordem/linha), então busca fresco aqui.
                const todasCategorias = typeof obterItensPorTipo === 'function' ? await obterItensPorTipo('Categoria') : [];
                const listaAtual = (todasCategorias || []).filter(c => (c.categoriaTipo || 'saidas') === tipo);
                const ok = await _inserirCategoriaAlfabetica(listaAtual, nome, {
                    descricao: ov.querySelector('#dlgCatDesc').value.trim(),
                    categoria_tipo: tipo,
                    cor: corPadraoChip(nome)
                });
                if (!ok) return true;
                await carregarMenus();
                if (typeof carregarAbaMenus === "function") await carregarAbaMenus();
                const sel = document.querySelector(SELECTORS.categoria);
                if (sel && tipo === (estadoApp.tipoAtual === 'entradas' ? 'entradas' : 'saidas')) sel.value = nome;
            } }
        ]
    });
}

/** Diálogo rápido para criar um método a partir do formulário */
function abrirNovoMetodo() {
    const ov = mostrarDialogo({
        titulo: 'Nova forma de pagamento',
        corpoHTML: `
            <div class="campo"><label for="dlgMetKind">Tipo</label>
                <select id="dlgMetKind">
                    <option value="">Selecione...</option>
                    <option value="PIX">PIX</option>
                    <option value="Crédito">Crédito</option>
                </select></div>
            <div class="campo"><label for="dlgMetBanco">Banco <span class="opt" id="dlgMetBancoOpt">(opcional)</span></label>
                <input type="text" id="dlgMetBanco" placeholder="Ex: Nubank" autocomplete="off"></div>
            <div class="campo" id="dlgMetVencWrap" hidden><label for="dlgMetVenc">Vencimento (dia)</label>
                <input type="text" id="dlgMetVenc" inputmode="numeric" maxlength="2"></div>
            <div id="dlgMetCartao" hidden>
                <div class="campo"><label for="dlgMetFech">Fechamento (dia) <span class="opt">(opcional)</span></label>
                    <input type="text" id="dlgMetFech" inputmode="numeric" maxlength="2"></div>
                <div class="campo"><label for="dlgMetMelhor">Melhor dia <span class="opt">(opcional)</span></label>
                    <input type="text" id="dlgMetMelhor" inputmode="numeric" maxlength="2"></div>
            </div>`,
        acoes: [
            { label: 'Cancelar' },
            { label: 'Adicionar', primario: true, onClick: async (o) => {
                const kind = o.querySelector('#dlgMetKind').value;
                const banco = o.querySelector('#dlgMetBanco').value.trim();
                if (!kind) { mostrarNotificacao('Escolha o tipo', 'info'); return true; }
                if (kind === 'Crédito' && !banco) { mostrarNotificacao('Informe o banco', 'info'); return true; }
                const nome = banco ? `${kind} — ${banco}` : kind;
                const extra = { metodo_kind: kind, banco, cor: corPadraoChip(nome) };
                if (kind === 'Crédito') {
                    const fech = parseInt(o.querySelector('#dlgMetFech').value, 10);
                    const venc = parseInt(o.querySelector('#dlgMetVenc').value, 10);
                    if (!(venc >= 1 && venc <= 31)) { mostrarNotificacao('Vencimento inválido', 'erro'); return true; }
                    const temFech = fech >= 1 && fech <= 31;
                    if (o.querySelector('#dlgMetFech').value.trim() && !temFech) {
                        mostrarNotificacao('Fechamento inválido', 'erro'); return true;
                    }
                    const melhor = parseInt(o.querySelector('#dlgMetMelhor').value, 10)
                        || (temFech ? sugerirMelhorDiaCompra(fech) : null) || null;
                    extra.dia_vencimento = venc;
                    if (temFech) extra.dia_fechamento = fech;
                    if (melhor) extra.melhor_dia_compra = melhor;
                }
                const ok = await adicionarItemMenuAPI('Método', nome, extra);
                if (!ok) return true;
                await carregarMenus();
                if (typeof carregarAbaMenus === "function") await carregarAbaMenus();
                const sel = document.querySelector(SELECTORS.metodo);
                // O valor das <option> do dropdown é rotuloMetodo() (kind + banco
                // sem travessão), não o "nome" salvo no banco (que usa "—") —
                // setar sel.value = nome não batia com nenhuma option e a seleção
                // ficava muda (voltava pra "Selecione...", parecendo que o botão
                // "Adicionar" não tinha feito nada).
                if (sel) sel.value = banco ? `${kind} ${banco}` : kind;
                if (typeof atualizarCampoCredito === 'function') atualizarCampoCredito();
            } }
        ]
    });
    const kindSel = ov.querySelector('#dlgMetKind');
    kindSel.addEventListener('change', () => {
        const ehCredito = kindSel.value === 'Crédito';
        ov.querySelector('#dlgMetVencWrap').hidden = !ehCredito;
        ov.querySelector('#dlgMetCartao').hidden = !ehCredito;
        ov.querySelector('#dlgMetBancoOpt').hidden = ehCredito;
    });
    ov.querySelectorAll('input[inputmode="numeric"]').forEach(inp =>
        inp.addEventListener('input', () => soNumeros(inp, 2)));

    // "Melhor dia" sugerido automaticamente a partir do Fechamento
    const fechInp = ov.querySelector('#dlgMetFech');
    const melhorInp = ov.querySelector('#dlgMetMelhor');
    if (fechInp && melhorInp && typeof sugerirMelhorDiaCompra === 'function') {
        fechInp.addEventListener('input', () => {
            const f = parseInt(fechInp.value, 10);
            if (f >= 1 && f <= 31 && (!melhorInp.value || melhorInp.dataset.auto)) {
                melhorInp.value = sugerirMelhorDiaCompra(f);
                melhorInp.dataset.auto = '1';
            } else if (!(f >= 1 && f <= 31) && melhorInp.dataset.auto) {
                melhorInp.value = '';
            }
        });
        melhorInp.addEventListener('input', () => { delete melhorInp.dataset.auto; });
    }
}

/**
 * Chamado quando o Método muda — o campo Parcelas (só existe em Crédito) e a
 * Competência dependem do método escolhido.
 */
function atualizarCampoCredito() {
    if (typeof atualizarCampoParcelas === 'function') atualizarCampoParcelas();
}

/**
 * Receita normalmente não tem campo Método (bloco inteiro escondido). As
 * exceções são as categorias fixas "Estorno" (volta na fatura do cartão —
 * só aceita Método de Crédito) e "Reembolso" (volta via Pix/transferência —
 * só aceita Método PIX/Débito): mostram o campo (opcional), já restrito ao
 * tipo de método que faz sentido pra cada uma.
 */
function atualizarCampoMetodoReceita() {
    const ehReceita = document.querySelector(SELECTORS.tipoTransacao)?.value === 'entradas';
    const blocoMetodo = document.getElementById('metodoBloco');
    const metodoSel = document.querySelector(SELECTORS.metodo);
    if (ehReceita) {
        // Receita tem a mesma forma de pagamento da despesa, mas só PIX (cartões de crédito aparecem desabilitados)
        if (blocoMetodo) blocoMetodo.hidden = false;
        if (metodoSel) {
            metodoSel.required = false;
            if (typeof preencherDropdownMetodos === 'function') preencherDropdownMetodos();
            const op = [...metodoSel.options].find(o => o.value === metodoSel.value);
            if (op && op.disabled) metodoSel.value = '';
            // novo lançamento: já vem com o primeiro PIX (não mexe em quem está editando)
            if (!metodoSel.value && document.getElementById('excluirEdicao')?.hidden !== false) {
                const pix = (estadoApp.menus.metodos || []).find(m => m.metodoKind === 'PIX/Débito' || m.metodoKind === 'PIX');
                if (pix) { metodoSel.value = rotuloMetodo(pix); estadoApp.metodoAutoReceita = metodoSel.value; }
            }
        }
        posicionarCompetencia(true);
        const parceleGrp = document.getElementById('parceleGroup');
        if (parceleGrp) parceleGrp.hidden = true;
        ajustarCamposSozinhos();
        return;
    }
    // Despesa: categoria "Estorno" só aceita cartão de crédito (as outras formas ficam cinzas)
    if (blocoMetodo) blocoMetodo.hidden = false;
    if (metodoSel) {
        metodoSel.required = true;
        const ehEstorno = _formEhEstorno();
        if (ehEstorno || metodoSel.dataset.restrito) {
            const atual = metodoSel.value;
            metodoSel.innerHTML = '<option value="">Selecione...</option>';
            (estadoApp.menus.metodos || []).forEach(m => {
                const label = rotuloMetodo(m);
                const o = document.createElement('option');
                o.value = label; o.textContent = label;
                o.disabled = ehEstorno && m.metodoKind !== 'Crédito';
                metodoSel.appendChild(o);
            });
            const opAtual = [...metodoSel.options].find(o => o.value === atual);
            metodoSel.value = opAtual && !opAtual.disabled ? atual : '';
            if (ehEstorno) metodoSel.dataset.restrito = '1'; else delete metodoSel.dataset.restrito;
        }
    }
    if (typeof atualizarCampoParcelas === 'function') atualizarCampoParcelas();
    ajustarCamposSozinhos();
}

/** Despesa com a categoria "Estorno": abate a fatura de um cartão (gravada como lançamento de entrada nesse cartão). */
function _formEhEstorno() {
    return document.querySelector(SELECTORS.tipoTransacao)?.value === 'saidas'
        && document.querySelector(SELECTORS.categoria)?.value === CATEGORIA_ESTORNO;
}

/**
 * Recalcula a competência a partir do fechamento do método + data da compra.
 * Não sobrescreve se o usuário já editou o campo manualmente.
 */
function recalcularCompetencia() {
    const campo = document.getElementById('competencia');
    if (!campo || campo.dataset.editado) return;

    const iso = dataCampoParaISO(document.querySelector(SELECTORS.data).value);
    if (!iso) {
        // Sem data ainda: assume o mês vigente (usuário pode editar)
        if (typeof estadoApp !== 'undefined' && estadoApp.mesAtual) {
            campo.value = mesDeCompetencia(formatarDataISO(estadoApp.mesAtual));
        }
        return;
    }

    const metodo = typeof metodoSelecionado === 'function' ? metodoSelecionado() : null;
    if (!metodo || metodo.metodoKind !== 'Crédito') { // fora do Crédito: o mês em exibição, não o da data digitada
        if (estadoApp.mesAtual) campo.value = mesDeCompetencia(formatarDataISO(estadoApp.mesAtual));
        return;
    }
    campo.value = mesDeCompetencia(competenciaDe(iso, metodo.diaFechamento));
}
