// Dashboard e calendário do topo: cards de resumo, ajuste de fontes, aviso de duplicatas, dias restantes e navegação de mês (atualizarUI).
// Extraído de ui.js (mesmas funções globais; carregado logo depois dele em index.html).

/** "58,3" em vez de "58" — 1 casa decimal (vírgula, pt-BR) nos percentuais
 *  dos gráficos/listas agrupadas; sem isso um grupo pequeno (ex. 0,4%)
 *  aparecia arredondado pra "0%", sem dar pra saber que ele tinha algo. */
function formatarPct(pct) {
    // Inteiro exato (ex.: 100,0) mostra sem casa decimal: "100"
    if (Math.abs(pct - Math.round(pct)) < 0.05) return String(Math.round(pct));
    return pct.toFixed(1).replace('.', ',');
}

/**
 * Atualiza toda a interface
 */
function atualizarUI() {
    _amplaCache = null;
    _buscaMesCache = null; // dados podem ter mudado: a busca por data refaz a consulta
    atualizarCalendarioNav();

    // Atualizar resumo
    atualizarResumo();

    // Atualizar listas
    atualizarEntradasLista();
    atualizarSaidasLista();
    renderFilaHome();
    agendarPendencias();
    ajustarNomesFatura();
    // Busca em todos os meses aberta: não refaz (voltar pra janela recarrega os dados e apagaria o resultado)
    const boxUI = document.getElementById('resultadoBusca');
    if (boxUI?.dataset.recentes === '1') mostrarRecemLancados(Number(boxUI.dataset.recentesQtd) || 5);
    else if (boxUI?.dataset.modo === 'ampla' && boxUI.dataset.termoAmpla) buscarAmpla(boxUI.dataset.termoAmpla);
    else if (boxUI?.dataset.modo !== 'ampla') atualizarBuscaGlobal();

    // "Próximas" acompanha o mês em exibição
    if (document.getElementById('proximas')?.classList.contains('active')) {
        atualizarProximasTransacoes();
    }
}

// Tamanhos possíveis da janela (sempre ímpar/simétrico: N pra trás, atual, N
// pra frente) x formato do rótulo, do mais largo pro mais estreito. Encolhe
// 7 -> 5 -> 3 (tricode "SET"); se ainda não couber, troca pro número do mês
// ("9") em vez de encolher a janela pra 1 só — no pior caso extremo (3
// números) já é bem mais compacto que 1 tricode, então só cai pra 1 número
// se nem isso couber.
const TAMANHOS_JANELA_MESES = [
    { tamanho: 7, numerico: false },
    { tamanho: 5, numerico: false },
    { tamanho: 3, numerico: false },
    { tamanho: 3, numerico: true },
    { tamanho: 1, numerico: true }
];

/**
 * (Re)desenha a tira de meses + o ano no calendário do topo, tudo numa
 * linha só. Sempre mostra uma janela simétrica (3 antes + atual + 3 depois,
 * no máximo) em volta do mês SELECIONADO, com setas laterais pra navegar os
 * meses escondidos sem mudar a seleção — a janela só encolhe (7 -> 5 -> 3 ->
 * 1) até caber na largura disponível, e pode atravessar a virada do ano
 * (ex.: NOV DEZ JAN FEV). O ano mostrado ao lado é sempre o vigente (fixo,
 * sem setas); mês de um ano diferente do vigente leva o sufixo "/AA" — os
 * meses do ano vigente nunca levam sufixo. Não depende de dados carregados
 * — seguro de chamar em qualquer resize.
 */
function atualizarCalendarioNav() {
    const lista = document.getElementById('mesesLista');
    const anoLabel = document.getElementById('anoAtualLabel');
    if (!lista || typeof estadoApp === 'undefined' || !estadoApp.mesAtual) return;

    const hoje = new Date();
    const anoVigente = hoje.getFullYear();
    const absDe = (ano, mes) => ano * 12 + mes;
    const absHoje = absDe(anoVigente, hoje.getMonth());
    const anoSelecionado = estadoApp.mesAtual.getFullYear();
    const mesSelecionado = estadoApp.mesAtual.getMonth();
    const absSelecionado = absDe(anoSelecionado, mesSelecionado);
    const absCentro = absSelecionado;

    if (anoLabel) anoLabel.textContent = String(anoVigente);

    const montarBtn = (abs, numerico) => {
        const ano = Math.floor(abs / 12);
        const mes = ((abs % 12) + 12) % 12;
        const selecionado = abs === absSelecionado;
        const ehHoje = abs === absHoje;
        const classes = ['mes-btn', numerico && 'numerico', selecionado && 'selecionado', ehHoje && 'hoje'].filter(Boolean).join(' ');
        const rotulo = numerico
            ? String(mes + 1)
            : MESES_TRI[mes] + (ano === anoVigente ? '' : '/' + String(ano).slice(-2));
        return `<button type="button" class="${classes}" data-ano="${ano}" data-mes="${mes}" data-abs="${abs}">${rotulo}</button>`;
    };

    const idxsDaJanela = tamanho => {
        const k = (tamanho - 1) / 2;
        const idxs = [];
        for (let a = absCentro - k; a <= absCentro + k; a++) idxs.push(a);
        return idxs;
    };

    const renderJanela = (idxs, numerico) => { lista.innerHTML = idxs.map(a => montarBtn(a, numerico)).join(''); };

    renderJanela(idxsDaJanela(TAMANHOS_JANELA_MESES[0].tamanho), TAMANHOS_JANELA_MESES[0].numerico);

    // Mede depois do layout: se estourou, encolhe a janela (e depois troca
    // pro rótulo numérico) até caber.
    requestAnimationFrame(() => {
        let idxsFinal = idxsDaJanela(TAMANHOS_JANELA_MESES[0].tamanho);
        for (let i = 1; i < TAMANHOS_JANELA_MESES.length && lista.scrollWidth > lista.clientWidth + 1; i++) {
            const passo = TAMANHOS_JANELA_MESES[i];
            idxsFinal = idxsDaJanela(passo.tamanho);
            renderJanela(idxsFinal, passo.numerico);
        }
        _carregarIndicadoresJanela(idxsFinal);
    });
}

/** Busca (assíncrono, não trava o render) se cada mês da janela tem
 *  lançamento já acontecido (bolinha preenchida) ou a confirmar/futuro
 *  (só o contorno), e pinta a bolinha certa em cada botão visível. */
async function _carregarIndicadoresJanela(idxsAbs) {
    if (!idxsAbs || !idxsAbs.length || typeof carregarIndicadoresMeses !== 'function') return;
    const anoDe = abs => Math.floor(abs / 12);
    const mesDe = abs => ((abs % 12) + 12) % 12;
    const iniISO = `${anoDe(idxsAbs[0])}-${String(mesDe(idxsAbs[0]) + 1).padStart(2, '0')}-01`;
    const ultimo = idxsAbs[idxsAbs.length - 1];
    const anoFim = mesDe(ultimo) === 11 ? anoDe(ultimo) + 1 : anoDe(ultimo);
    const mesFim = (mesDe(ultimo) + 1) % 12;
    const fimISO = `${anoFim}-${String(mesFim + 1).padStart(2, '0')}-01`;

    const porMes = await carregarIndicadoresMeses(iniISO, fimISO);
    const lista = document.getElementById('mesesLista');
    if (!lista) return;
    idxsAbs.forEach(abs => {
        const chave = `${anoDe(abs)}-${String(mesDe(abs) + 1).padStart(2, '0')}`;
        const info = porMes[chave];
        if (!info) return;
        const btn = lista.querySelector(`.mes-btn[data-abs="${abs}"]`);
        if (!btn || btn.querySelector('.mes-dot')) return;
        const dot = document.createElement('span');
        dot.className = 'mes-dot' + (info.passado ? '' : ' contorno');
        btn.appendChild(dot);
    });
}

/**
 * Reduz o font-size de `el` (a partir do tamanho definido no CSS) até o
 * conteúdo caber numa linha só, sem cortar — nunca usa "…": regra é sempre
 * diminuir a fonte até caber, em vez de truncar o texto.
 */
function ajustarFonteParaCaber(el, minPx = 10, tamanhoInicial = null) {
    if (!el) return;
    el.style.fontSize = '';
    // Sem layout ainda (card escondido/largura 0, fontes carregando): não dá pra medir. Deixa o tamanho do
    // CSS e NÃO fixa o tamanho-base em px — antes ele ficava preso e o valor estourava o card (o ResizeObserver refaz depois).
    if (!el.clientWidth) return;
    if (tamanhoInicial != null) el.style.fontSize = tamanhoInicial + 'px';
    let tamanho = tamanhoInicial != null ? tamanhoInicial : parseFloat(getComputedStyle(el).fontSize);
    if (!Number.isFinite(tamanho)) return;
    while (el.scrollWidth > el.clientWidth + 1 && tamanho > minPx) {
        tamanho -= 1;
        el.style.fontSize = tamanho + 'px';
    }
}

/** Elementos de valor que podem precisar encolher — reavaliados também no
 *  resize (a largura do card muda, então o que cabia pode deixar de caber). */
function ajustarFontesDashboard() {
    ['totalEntradas', 'totalSaidas'].forEach(id => {
        const b = document.getElementById(id);
        const rot = b && b.parentElement.querySelector('.rot-total');
        if (!rot) { ajustarFonteParaCaber(b); return; }
        // "total" -> ∑ -> sem rótulo: troca assim que o valor ganha tamanho (>= 8%) com o rótulo mais curto
        const tentar = (texto, oculto) => {
            rot.hidden = oculto; rot.textContent = texto;
            ajustarFonteParaCaber(b);
            return parseFloat(getComputedStyle(b).fontSize);
        };
        if (cardCompacto(b)) {
            // Card estreito: ∑ (mais leve) com o MESMO tamanho do valor total; os dois encolhem juntos até caber
            rot.hidden = false; rot.textContent = '∑';
            rot.style.fontStyle = 'normal'; rot.style.fontWeight = '300';
            b.style.fontSize = '';
            let px = parseFloat(getComputedStyle(b).fontSize);
            for (; px > 10; px -= 1) {
                rot.style.fontSize = px + 'px'; b.style.fontSize = px + 'px';
                if (b.scrollWidth <= b.clientWidth + 1) break;
            }
            return;
        }
        rot.style.fontStyle = ''; rot.style.fontWeight = ''; rot.style.fontSize = '';
        const f1 = tentar('total', false);
        const f2 = tentar('∑', false);
        const f3 = tentar('∑', true);
        if (f3 > f2 * 1.08) return tentar('∑', true);   // sem rótulo
        if (f2 > f1 * 1.08) return tentar('∑', false);  // ∑
        tentar('total', false);                         // cabe com "total"
    });
    // Balanço e Gasto diário (3ª coluna, estreita): o CSS (cqw) já faz caber; aqui só encolhe se ainda estourar.
    const par = ['balanco', 'gastoDiario'].map(id => document.getElementById(id)).filter(Boolean);
    par.forEach(el => ajustarFonteParaCaber(el, 10));
    if (par.some(el => !el.clientWidth)) return;
    // Lado a lado: mesmo tamanho entre os dois (o menor dos dois, caso um precise encolher mais que o outro)
    if (par.length === 2) {
        const menor = Math.min(...par.map(el => parseFloat(getComputedStyle(el).fontSize)));
        par.forEach(el => { el.style.fontSize = menor + 'px'; });
    }
}

/**
 * Atualiza card de resumo
 */
function atualizarResumo() {
    const resumo = obterResumoFormatado();
    // "Olho" do cabeçalho (ver configurarOlhoValores em main.js) — esconde só
    // os NÚMEROS do dashboard, nada mais (listas, formulário etc. continuam
    // normais). Mascara depois de formatar, então o "R$" contextual some
    // junto — "••••" sozinho já deixa claro que é um valor escondido.
    const mask = s => (typeof valoresOcultos !== 'undefined' && valoresOcultos) ? '••••' : s;

    const totalEntradasEl = document.querySelector(SELECTORS.totalEntradas);
    const totalSaidasEl = document.querySelector(SELECTORS.totalSaidas);
    const balancoEl = document.querySelector(SELECTORS.balanco);

    if (totalEntradasEl) totalEntradasEl.textContent = mask(resumo.entradas);
    if (totalSaidasEl) totalSaidasEl.textContent = mask(resumo.saidas);

    const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = mask(formatarMoeda(v || 0)); };
    setTxt('entradasAtual', estadoApp.resumo.entradasAtual);
    setTxt('entradasAReceber', estadoApp.resumo.entradasAReceber);
    setTxt('saidasAtual', estadoApp.resumo.saidasAtual);
    setTxt('saidasAPagar', estadoApp.resumo.saidasAPagar);
    // Quebra do "a pagar": lançamentos por vir x fatura em aberto (só aparece quando há fatura)
    // Quebra do "pago" (PIX/dinheiro x faturas já pagas ou vencidas) e do "a pagar" (pendentes x faturas em aberto). Antes só aparecia com fatura
    // (cartão); agora também com só PIX/dinheiro, ou com parcela de cartão ainda sem fatura, que já é "pendente".
    _detalheCard('saidasPagoDetalheLinha', 'saidasPagoDetalhe', estadoApp.resumo.saidasPagoPix || 0, estadoApp.resumo.saidasPagoCredito || 0, ['pix', '⚡'], ['crédito', '💳'], mask);
    _detalheCard('saidasDetalheLinha', 'saidasDetalhe', estadoApp.resumo.saidasAvulsos || 0, estadoApp.resumo.saidasFatura || 0, ['pendentes', '⏳'], ['crédito', '💳'], mask);

    if (balancoEl) {
        balancoEl.textContent = mask(resumo.balanco);
        // Balanço sempre com a cor "balanço" (amarelo) — sem tema por saldo.
        const card = balancoEl.closest('.summary-card');
        if (card) card.style.cssText = '';
    }

    // Saldo real das contas bancárias conectadas (só aparece com conta conectada)
    const scEl = document.getElementById('saldoContas');
    if (scEl) {
        scEl.hidden = estadoApp.saldoContas == null || !saldoContasLigado();
        const scVal = document.getElementById('saldoContasValor');
        if (scVal && estadoApp.saldoContas != null) scVal.textContent = mask(formatarMoeda(estadoApp.saldoContas));
        // A faixa é um toggle que descortina o saldo de cada conta (empurrando o
        // resto pra baixo) — mesmo com uma conta só.
        const lista = estadoApp.saldoContasLista || [];
        const varias = lista.length > 0;
        scEl.classList.toggle('saldo-contas--toggle', varias);
        scEl.setAttribute('role', varias ? 'button' : 'note');
        scEl.tabIndex = varias ? 0 : -1;
        scEl.setAttribute('aria-expanded', String(varias && !!estadoApp.saldoContasAberto));
        const detalhe = document.getElementById('saldoContasLista');
        if (detalhe) {
            const aberto = varias && !!estadoApp.saldoContasAberto && estadoApp.saldoContas != null && saldoContasLigado();
            detalhe.hidden = !aberto;
            detalhe.innerHTML = aberto
                ? lista.map(c => `<div class="sc-linha"><span>${c.nome}</span><b>${mask(formatarMoeda(c.saldo))}</b></div>`).join('')
                : '';
        }
    }

    // Gasto diário = balanço / dias restantes do mês vigente
    const gd = document.getElementById('gastoDiario');
    const gdSub = document.getElementById('gastoDiarioSub');
    let dias = diasRestantesMesVigente();
    // Mês futuro: já dá para estimar o gasto diário se houver ao menos uma receita e uma despesa previstas (usa o mês inteiro)
    const previsto = dias === 0 && _mesFuturo() && (estadoApp.resumo.entradas || 0) > 0 && (estadoApp.resumo.saidas || 0) > 0;
    if (previsto) { const m = estadoApp.mesAtual; dias = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate(); }
    const gastoDiarioValor = dias > 0 ? (estadoApp.resumo.balanco || 0) / dias : 0;
    if (gd) {
        gd.textContent = mask(formatarMoeda(gastoDiarioValor));
        if (gdSub) gdSub.textContent = previsto ? `previsto · ${dias} dias` : dias > 0 ? `${dias} dia${dias === 1 ? '' : 's'} restante${dias === 1 ? '' : 's'}` : (_mesFuturo() ? 'sem receita e despesa previstas' : 'mês encerrado');
    }

    // Espelha os totais no resumo compacto (barra fixa) — com "R$", sem centavos ",00"
    const setMini = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = mask(formatarMoeda(v || 0)); };
    setMini('miniEntradas', estadoApp.resumo.entradas);
    setMini('miniSaidas', estadoApp.resumo.saidas);
    setMini('miniBalanco', estadoApp.resumo.balanco);
    setMini('miniGasto', gastoDiarioValor);

    // Chamada direta (não requestAnimationFrame): getComputedStyle já força o
    // layout synchronously, então não precisa esperar o próximo frame — com
    // rAF, o texto pintava 1 frame com o tamanho errado (ex.: o da atualização
    // anterior) antes de corrigir, um "flicker" visível a cada atualização do
    // dashboard.
    ajustarFontesDashboard();
    ajustarRotulosCards();
}

/** Card estreito (celular): rótulos, "total" e detalhes já viram emoji, em vez de esperar o texto ficar minúsculo. */
const LARGURA_CARD_COMPACTO = 240;
const cardCompacto = el => { const c = el && el.closest && el.closest('.summary-card'); return !!c && c.clientWidth > 0 && c.clientWidth < LARGURA_CARD_COMPACTO; };

/** Emojis dentro do texto de detalhe (ficam fora do itálico do resto). */
const _htmlDetalhe = texto => String(texto).replace(/(⚡|💳|⏳)/g, '<span class="emo">$1</span>');

/** Rótulos dos cards (atual/pago, a receber/a pagar): viram 🟢 e ⏭️ quando não cabem ao lado do valor (os dois do card juntos). */
function ajustarRotulosCards() {
    document.querySelectorAll('.summary-card .card-linhas-topo').forEach(topo => {
        const rot = [...topo.querySelectorAll('.linha:not(.linha-detalhe) > i[data-rot]')];
        if (!rot.length) return;
        const poe = emoji => rot.forEach(i => { i.textContent = emoji ? i.dataset.emo : i.dataset.rot; });
        poe(false);
        // aperta = não cabe ao lado do valor, ou o texto (que escala com o card) já ficou pequeno demais pra ler
        const aperta = cardCompacto(topo) || rot.some(i => { const l = i.parentElement; return i.scrollWidth + (l.querySelector('b')?.scrollWidth || 0) + 10 > l.clientWidth || parseFloat(getComputedStyle(i).fontSize) < 9; });
        if (aperta) poe(true);
        topo.classList.toggle('rot-emoji', aperta);
        // Com emoji no lugar das palavras sobra largura: os valores crescem (até 82% do tamanho do total), sempre cabendo na linha
        const valores = [...topo.querySelectorAll('.linha:not(.linha-detalhe) > b')];
        valores.forEach(v => { v.style.fontSize = ''; });
        const totalB = topo.closest('.summary-card')?.querySelector('.linha.total b');
        if (aperta && cardCompacto(topo) && totalB) {
            let px = parseFloat(getComputedStyle(totalB).fontSize) * 0.82;
            const cabe = () => valores.every(v => { const l = v.parentElement; const i = l.querySelector('i'); return (i ? i.getBoundingClientRect().width : 0) + v.scrollWidth + 8 <= l.clientWidth; });
            for (; px > 10; px -= 0.5) { valores.forEach(v => { v.style.fontSize = px + 'px'; }); if (cabe()) break; }
        }
    });
}
window.addEventListener('resize', () => ajustarRotulosCards());

// Força o grupo de duplicatas a abrir no próximo render dessa lista — único
// jeito de abrir sozinho (todo o resto começa fechado). Usado só pelo clique
// no aviso do dashboard; reseta sozinho depois de 1 render.
const _forcarAbrirDuplicatas = { entrada: false, saida: false };

/** Dias restantes do mês EXIBIDO (estadoApp.mesAtual), incluindo hoje.
 *  Mês atual de verdade: contagem regressiva normal (mínimo 1).
 *  Mês passado: 0 (acabou, sem gasto diário nem contagem).
 *  Mês futuro: travado no total de dias do mês, até chegar nele. */
function diasRestantesMesVigente() {
    const hoje = new Date();
    const mesRef = estadoApp.mesAtual || hoje;
    const totalDias = new Date(mesRef.getFullYear(), mesRef.getMonth() + 1, 0).getDate();

    if (mesRef.getFullYear() === hoje.getFullYear() && mesRef.getMonth() === hoje.getMonth()) {
        return Math.max(1, totalDias - hoje.getDate() + 1);
    }
    // Mês passado ou futuro: sem gasto diário (o do futuro só passa a ser calculado quando o mês chegar)
    // Mês futuro: o gasto diário só passa a ser calculado quando o mês chegar
    return 0;
}

/** As linhas de detalhe dos cards (pago/pendentes) usam o MESMO tamanho: vale o menor entre elas (nenhuma fica maior que a outra). */
function _unificarDetalhes() {
    const els = [...document.querySelectorAll('.linha-detalhe i')].filter(x => x._f);
    if (!els.length) return;
    let menor = Math.min(...els.map(x => x._f));
    // sempre um pouco menores que os rótulos (recebido, pago, a receber, a pagar) e que o "total"
    const ref = document.querySelector('.card-linhas-topo .linha:not(.linha-detalhe) > b');
    const refPx = ref ? parseFloat(getComputedStyle(ref).fontSize) : 0;
    if (refPx > 0) menor = Math.min(menor, refPx * 0.7);
    // As linhas de detalhe VAZIAS (ex.: Receita) levam o mesmo tamanho, para os dois cards terem exatamente a mesma altura de linha
    // (valores e divisória do total alinhados entre Receita e Despesa).
    document.querySelectorAll('.linha-detalhe i').forEach(x => { x.style.fontSize = menor + 'px'; });
    // Conferência final com o texto já na tela (fontes do aparelho, itálico...): se ainda passar da linha, encolhe todos juntos até caber
    for (let i = 0; i < 25; i++) {
        const estoura = els.some(x => { const l = x.closest('.linha') || x.parentElement; return l.clientWidth && x.getBoundingClientRect().width > l.clientWidth - 2; });
        if (!estoura || menor <= 6) break;
        menor *= 0.96;
        document.querySelectorAll('.linha-detalhe i').forEach(x => { x.style.fontSize = menor + 'px'; });
    }
}

/** Linha de detalhe de um card ("pix 190 + crédito 0"): vazia (mas ocupando a altura, para alinhar com Receita) quando não há nada a mostrar;
 *  senão 3 versões do texto — completo, com emojis e só números — das quais _ajustarDetalhe escolhe a que cabe. */
function _detalheCard(linhaId, detId, a, b, [rotA, emoA], [rotB, emoB], mask) {
    const linha = document.getElementById(linhaId);
    if (!linha) return;
    const tem = a > 0.004 || b > 0.004;
    linha.classList.toggle('vazio', !tem);
    const det = document.getElementById(detId);
    if (!det) return;
    const fmt = v => formatarMoeda(v || 0).replace(/^R\$\s?/, '');
    const fa = fmt(a), fb = fmt(b);
    _ajustarDetalhe(det, tem ? [`${rotA} ${fa} + ${rotB} ${fb}`, `${emoA} ${fa} + ${emoB} ${fb}`, `${fa} + ${fb}`].map(mask) : null);
}

/** Texto de detalhe do dashboard (ex.: "pendentes 10 + crédito 20"): usa a 1ª versão que cabe com respiro; senão a mais curta. */
function _ajustarDetalhe(el, variantes) {
    el._variantes = variantes;
    const aplicar = () => {
        const v = el._variantes;
        if (!v) { el.innerHTML = '\u00a0'; el.style.fontSize = ''; el._f = null; _unificarDetalhes(); return; }
        el.style.whiteSpace = 'nowrap';
        el.style.fontSize = '';
        const caixa = (el.closest('.linha') || el.parentElement).clientWidth;
        if (!caixa) { el.innerHTML = _htmlDetalhe(v[0]); el._f = null; return; }
        const util = caixa - 4; // até a largura da linha que separa do total (respiro mínimo)
        // Cada variante, esticada até a largura da linha, dá um tamanho de fonte; vale a mais completa (completo -> emojis ->
        // só números) cujo tamanho continua legível (>= 9px). Sobrou espaço = a fonte cresce (até 13px).
        const f0 = parseFloat(getComputedStyle(el).fontSize);
        let melhor = null;
        const opcoes = cardCompacto(el) ? v.slice(1) : v; // celular: já em emoji (ou só números), nunca o texto por extenso
        for (const texto of opcoes) {
            el.innerHTML = _htmlDetalhe(texto);
            const w = el.getBoundingClientRect().width;
            if (!(w > 0) || !(f0 > 0)) continue;
            const f = f0 * util / w;
            if (!melhor || f > melhor.f && melhor.f < 9) melhor = { texto, f };
            if (f >= 9) { melhor = { texto, f }; break; }
        }
        if (!melhor) { el.innerHTML = _htmlDetalhe(v[0]); el._f = null; return; }
        el.innerHTML = _htmlDetalhe(melhor.texto);
        el._f = Math.max(7, Math.min(melhor.f, 13));
        _unificarDetalhes();
    };
    el._reajustar = aplicar;
    aplicar();
    requestAnimationFrame(aplicar);
}

/** Preferência (neste aparelho) de mostrar o "Saldo em contas" no dashboard; ligado por padrão. */
function saldoContasLigado() {
    try { return localStorage.getItem('ctrlfin_saldo_contas') !== '0'; } catch (_) { return true; }
}
