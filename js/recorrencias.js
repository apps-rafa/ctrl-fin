/**
 * RECORRÊNCIAS — lançamentos fixos (conta mensal, assinatura, salário...).
 * O cadastro mora na tabela `recorrencias`; as OCORRÊNCIAS são lançamentos reais em `transacoes`
 * (recorrencia_id + a_confirmar), geradas pela função `recorrencias` (ver supabase/functions/_shared/ocorrencias.ts):
 * 1 mês à frente no mensal e 5 semanas no semanal. Aqui ficam a página de cadastro e as ações sobre elas.
 */

const _DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const _DIAS_TRI = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
let _recorrencias = [];
let _recEditandoId = null;

function mapearRecorrencia(r) {
    return {
        id: r.id, tipo: r.tipo, frequencia: r.frequencia, diaSemana: r.dia_semana, diaMes: r.dia_mes, valor: Number(r.valor),
        meses: r.meses, metodo: r.metodo, categoria: r.categoria, descricao: r.descricao || '', inicio: String(r.inicio).slice(0, 10),
        criadoEm: String(r.inicio).slice(0, 7), status: r.status, encerradaEm: r.encerrada_em,
        ativaDesde: String(r.ativa_desde || r.inicio).slice(0, 7), // início da ativação mais recente
    };
}

async function carregarRecorrencias() {
    const { data, error } = await sb.from('recorrencias').select('*').order('id');
    if (error) { console.error('Erro ao carregar recorrências:', error); return; }
    _recorrencias = (data || []).map(mapearRecorrencia);
}

/** Pede à função `recorrencias` para gerar o que falta (1 mês à frente no mensal, 5 semanas no semanal). */
async function gerarOcorrenciasRecorrencias() {
    try {
        const { data, error } = await sb.functions.invoke('recorrencias', { body: {} });
        if (error) throw error;
        return (data && data.criadas) || 0;
    } catch (e) { console.error('Erro ao gerar ocorrências:', e); return 0; }
}

/** Depois de mexer nas recorrências: gera o que falta e atualiza o app (listas, dashboard, Próximos). */
async function _recAtualizarTudo() {
    await gerarOcorrenciasRecorrencias();
    await carregarRecorrencias();
    if (typeof recarregarDados === 'function') await recarregarDados();
    if (typeof atualizarUI === 'function') atualizarUI();
    renderListaRecorrencias();
}

/** Uma vez por dia, ao abrir o app: garante que as ocorrências estejam em dia (a tarefa diária faz o mesmo no servidor). */
async function garantirOcorrenciasDoDia() {
    const hoje = hojeISO();
    try { if (localStorage.getItem('recorrenciasGeradasEm') === hoje) return; } catch (_) {}
    const criadas = await gerarOcorrenciasRecorrencias();
    try { localStorage.setItem('recorrenciasGeradasEm', hoje); } catch (_) {}
    if (criadas > 0 && typeof recarregarDados === 'function') { await recarregarDados(); if (typeof atualizarUI === 'function') atualizarUI(); }
}

/** ✓ no bloco "A confirmar": a ocorrência vira lançamento normal (continua com o selo 🔁 enquanto não passa). */
async function confirmarOcorrenciaRecorrencia(id) {
    const { error } = await sb.from('transacoes').update({ a_confirmar: false }).eq('id', id);
    if (error) { console.error(error); mostrarNotificacao('Não consegui confirmar', 'erro'); return; }
    await recarregarDados();
    atualizarUI();
}

/** "Confirmar todas" do bloco A confirmar. */
async function confirmarOcorrenciasRecorrencia(ids) {
    const { error } = await sb.from('transacoes').update({ a_confirmar: false }).in('id', ids);
    if (error) { console.error(error); mostrarNotificacao('Não consegui confirmar', 'erro'); return; }
    await recarregarDados();
    atualizarUI();
}

/** "Apagar todas" do bloco A confirmar: só estas ocorrências (as recorrências seguem ativas). */
async function apagarOcorrenciasRecorrencia(ids) {
    const { error } = await sb.from('transacoes').delete().in('id', ids);
    if (error) { console.error(error); mostrarNotificacao('Erro ao excluir', 'erro'); return; }
    await recarregarDados();
    atualizarUI();
}

/** Apagar/✗ de um lançamento de recorrência: pergunta se é só este mês ou se encerra a recorrência.
 *  Resolve true se algo foi apagado. */
function perguntarExcluirRecorrente(trans) {
    return new Promise(resolve => {
        const feito = async (fn, erro) => {
            try { await fn(); await _recAtualizarTudo(); resolve(true); }
            catch (e) { console.error(e); mostrarNotificacao(erro, 'erro'); resolve(false); }
        };
        mostrarDialogo({
            titulo: 'Apagar lançamento recorrente',
            texto: `<strong>${trans.descricao || trans.categoria || 'Este lançamento'}</strong> faz parte de uma recorrência. Apagar só este mês ou encerrar a recorrência?`,
            acoes: [
                { label: 'Cancelar', onClick: () => resolve(false) },
                { label: 'Só este mês', primario: true, onClick: () => feito(async () => { const { error } = await sb.from('transacoes').delete().eq('id', trans.id); if (error) throw error; }, 'Erro ao excluir') },
                { label: 'Encerrar recorrência', perigo: true, onClick: () => feito(async () => {
                    const { error } = await sb.from('transacoes').delete().eq('id', trans.id); if (error) throw error;
                    await encerrarRecorrencia(trans.recorrenciaId);
                }, 'Erro ao encerrar a recorrência') },
            ],
        });
    });
}

/** "Editar recorrência" no formulário do lançamento: abre a página Recorrências já com a edição. */
async function abrirRecorrenciaDoLancamento(recId) {
    if (!recId) return;
    if (typeof cancelarEdicaoTransacao === 'function') cancelarEdicaoTransacao(false);
    mudarAba('recorrencias');
    await carregarRecorrencias();
    const rec = _recorrencias.find(r => r.id === recId);
    if (rec) abrirFormRecorrencia(rec);
}

/** Soma `n` meses a uma data (dia limitado ao último do mês). */
function _recSomarMeses(data, n) {
    const d = new Date(data.getFullYear(), data.getMonth() + n, 1);
    const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(data.getDate(), ultimo));
    return d;
}

/**
 * Quantas ocorrências a recorrência tem em `meses` meses a partir de `inicio`.
 *  - Mensal: 1 por mês.
 *  - Semanal com dia fixo (0=dom..6=sáb): conta esse dia da semana no período.
 *  - Semanal "Variável" (sem dia fixo): 1 por semana (semanas inteiras do período).
 * Sem prazo (meses vazio/0): null.
 */
function calcularOcorrenciasRecorrencia({ frequencia, diaSemana, meses, inicio }) {
    if (!meses || meses < 1) return null;
    if (frequencia === 'mensal') return meses;
    const base = inicio || new Date();
    const ini = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    const fim = _recSomarMeses(ini, meses); // exclusivo
    if (diaSemana !== '' && diaSemana != null && !Number.isNaN(Number(diaSemana))) {
        let n = 0;
        for (let d = new Date(ini); d < fim; d.setDate(d.getDate() + 1)) if (d.getDay() === Number(diaSemana)) n++;
        return n;
    }
    return Math.floor(Math.round((fim - ini) / 86400000) / 7);
}

/** O texto cabe na largura do campo (descontando o espaço das setas/padding)? Mede com canvas, na fonte do próprio campo. */
function _recCabe(el, texto, folga) {
    const cs = getComputedStyle(el);
    const ctx = (_recCabe.c || (_recCabe.c = document.createElement('canvas'))).getContext('2d');
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const util = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - (folga || 0);
    return ctx.measureText(texto).width <= util;
}

/** Duração na caixa com setinhas: 1 = "Contínua" (sem prazo); 2 ou mais = quantidade de meses. */
function _recDuracaoTexto(n, el) {
    if (n > 1) return `${n} meses`;
    return !el || !el.clientWidth || _recCabe(el, 'Contínua', 2) ? 'Contínua' : 'Cont.';
}

/** "Variável" vira "Var." quando o menu de dias não comporta o nome inteiro. */
function _recAjustarDia() {
    const e = _recElementos();
    if (!e.dia || e.freq.value !== 'semanal' || !e.dia.options.length || !e.dia.clientWidth) return;
    e.dia.options[0].textContent = _recCabe(e.dia, 'Variável', 18) ? 'Variável' : 'Var.';
}
function _recMesesDe(n) { return n > 1 ? n : 0; }

/** Texto curto da recorrência para a lista ("Mensal", "Semanal · SEG", "Semanal · Variável"). */
function _recRotuloFrequencia(r) {
    if (r.frequencia === 'mensal') return r.diaMes ? `Mensal · dia ${r.diaMes}` : 'Mensal';
    return `Semanal · ${r.diaSemana !== '' && r.diaSemana != null ? _DIAS_TRI[Number(r.diaSemana)] : 'Variável'}`;
}

function _recElementos() {
    const $ = id => document.getElementById(id);
    return {
        painel: $('recForm'), lista: $('recLista'), btnCriar: $('recBtnCriar'), aviso: $('recAviso'), tipo: $('recTipo'),
        freq: $('recFrequencia'), diaGrupo: $('recDiaSemanaGrupo'), dia: $('recDiaSemana'), valor: $('recValor'),
        duracao: $('recDuracao'), total: $('recTotal'), metodo: $('recMetodo'), categoria: $('recCategoria'),
        descricao: $('recDescricao'), erro: $('recErro'),
    };
}

function _recDuracaoAtual() {
    const e = _recElementos();
    return Math.max(1, parseInt(e.duracao.value, 10) || 1);
}

/** Menu "Dia": mensal = dia do mês (1–31; cai em fim de semana/feriado, vai para o próximo dia útil); semanal = dia da semana ou Variável. */
function _recMontarMenuDia(freq, valor) {
    const e = _recElementos();
    if (e.dia.dataset.freq === freq) return;
    e.dia.dataset.freq = freq;
    if (freq === 'mensal') {
        e.dia.innerHTML = Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('');
        e.dia.value = valor != null && valor !== '' ? String(valor) : String(Number(hojeISO().slice(8, 10)));
    } else {
        e.dia.innerHTML = '<option value="">Variável</option><option value="1">SEG</option><option value="2">TER</option><option value="3">QUA</option><option value="4">QUI</option><option value="5">SEX</option><option value="6">SÁB</option><option value="0">DOM</option>';
        e.dia.value = valor != null ? String(valor) : '';
    }
}

/** Atualiza o que depende das escolhas: menu de dias, texto da duração e o Total. */
function atualizarFormRecorrencia() {
    const e = _recElementos();
    if (!e.painel) return;
    const semanal = e.freq.value === 'semanal';
    _recMontarMenuDia(e.freq.value);
    e.diaGrupo.hidden = false;
    e.painel.querySelector('.rec-linha--1').classList.add('is-semanal'); // o Dia aparece nos dois ritmos
    const n = _recDuracaoAtual();
    if (document.activeElement !== e.duracao) e.duracao.value = _recDuracaoTexto(n, e.duracao); // em digitação fica o número cru
    _recAjustarDia();
    const valor = valorCampoParaNumero(e.valor);
    const meses = _recMesesDe(n);
    if (!meses) {
        const porMes = semanal ? valor * 52 / 12 : valor;
        e.total.value = 'Contínuo';
        e.total.title = valor ? `≈ ${formatarMoeda(porMes)} por mês, enquanto durar` : 'Informe o valor para estimar o gasto mensal';
        return;
    }
    const ocorr = calcularOcorrenciasRecorrencia({ frequencia: e.freq.value, diaSemana: semanal ? e.dia.value : '', meses });
    e.total.value = formatarMoeda(valor * ocorr);
    e.total.title = `${ocorr} ocorrência${ocorr === 1 ? '' : 's'} × ${formatarMoeda(valor)} em ${meses} meses`;
}

function _recPreencherListas() {
    const e = _recElementos();
    if (!e.painel) return;
    const despesa = e.tipo.value === 'saidas';
    const cats = (despesa ? estadoApp.menus.categoriasDespesa : estadoApp.menus.categoriasReceita) || [];
    const atualCat = e.categoria.value;
    e.categoria.innerHTML = '<option value="">Selecione...</option>' + cats.map(c => `<option>${c}</option>`).join('');
    if (cats.includes(atualCat)) e.categoria.value = atualCat;
    const atualMet = e.metodo.value;
    const mets = (estadoApp.menus.metodos || []).map(m => rotuloMetodo(m));
    e.metodo.innerHTML = '<option value="">Selecione...</option>' + mets.map(m => `<option>${m}</option>`).join('');
    if (mets.includes(atualMet)) e.metodo.value = atualMet;
}

function _recDefinirTipo(tipo) {
    const e = _recElementos();
    e.tipo.value = tipo;
    e.painel.querySelectorAll('.tipo-btn').forEach(b => b.classList.toggle('active', b.dataset.tipo === tipo));
    _recPreencherListas();
}

/** Abre o cadastro: ele ocupa o lugar do "+ Criar" e da lista (nada acumula na tela). */
function abrirFormRecorrencia(rec) {
    const e = _recElementos();
    if (!e.painel) return;
    _recEditandoId = rec ? rec.id : null;
    e.painel.hidden = false;
    e.btnCriar.hidden = true;
    e.lista.hidden = true;
    if (e.aviso) e.aviso.hidden = true;
    e.erro.textContent = '';
    _recDefinirTipo(rec ? rec.tipo : 'saidas');
    e.freq.value = rec ? rec.frequencia : 'mensal';
    delete e.dia.dataset.freq; // remonta o menu de dias do ritmo escolhido
    _recMontarMenuDia(e.freq.value, rec ? (rec.frequencia === 'mensal' ? rec.diaMes : rec.diaSemana) : null);
    e.valor.value = rec ? formatarValorParaCampo(rec.valor) : '';
    e.duracao.value = rec && rec.meses ? String(rec.meses) : '1';
    e.metodo.value = rec ? rec.metodo : '';
    e.categoria.value = rec ? rec.categoria : '';
    e.descricao.value = rec ? rec.descricao : '';
    atualizarFormRecorrencia();
    requestAnimationFrame(atualizarFormRecorrencia); // depois do layout, p/ medir as larguras reais
}

/** Fecha o cadastro e mostra de novo "+ Criar" e a lista. */
function fecharFormRecorrencia() {
    const e = _recElementos();
    if (!e.painel) return;
    e.painel.hidden = true;
    e.btnCriar.hidden = false;
    e.lista.hidden = false;
    if (e.aviso) e.aviso.hidden = false;
    _recEditandoId = null;
}

async function salvarRecorrencia(ev) {
    ev.preventDefault();
    const e = _recElementos();
    const valor = valorCampoParaNumero(e.valor);
    if (!(valor > 0)) { e.erro.textContent = 'Informe o valor por ocorrência.'; return; }
    if (!e.metodo.value) { e.erro.textContent = 'Escolha a forma de pagamento.'; return; }
    if (!e.categoria.value) { e.erro.textContent = 'Escolha a categoria.'; return; }
    const freq = e.freq.value;
    const campos = {
        tipo: e.tipo.value, frequencia: freq,
        dia_semana: freq === 'semanal' && e.dia.value !== '' ? Number(e.dia.value) : null,
        dia_mes: freq === 'mensal' ? Number(e.dia.value) || Number(hojeISO().slice(8, 10)) : null,
        valor, meses: _recMesesDe(_recDuracaoAtual()) || null, metodo: e.metodo.value, categoria: e.categoria.value,
        descricao: e.descricao.value.trim(),
    };
    const btn = e.painel.querySelector('.rec-btn-salvar');
    btn.disabled = true;
    try {
        if (_recEditandoId) await _recSalvarEdicao(_recEditandoId, campos);
        else {
            const hoje = hojeISO();
            const { error } = await sb.from('recorrencias').insert({ ...campos, inicio: hoje });
            if (error) throw error;
        }
        fecharFormRecorrencia();
        await _recAtualizarTudo();
    } catch (err) {
        console.error(err);
        e.erro.textContent = 'Não consegui salvar. Tente de novo.';
    } finally { btn.disabled = false; }
}

/** Edita a recorrência: só as ocorrências FUTURAS ainda "a confirmar" acompanham; confirmadas/editadas à mão e passadas ficam. */
async function _recSalvarEdicao(id, campos) {
    const atual = _recorrencias.find(r => r.id === id);
    const hoje = hojeISO();
    const mudouAgenda = atual.frequencia !== campos.frequencia || (atual.diaSemana ?? null) !== campos.dia_semana || (atual.diaMes ?? null) !== campos.dia_mes || (atual.meses || null) !== campos.meses;
    const { error } = await sb.from('recorrencias').update(campos).eq('id', id);
    if (error) throw error;
    const comuns = { valor: campos.valor, metodo: campos.metodo, categoria: campos.categoria, descricao: campos.descricao };
    await sb.from('transacoes').update(comuns).eq('recorrencia_id', id).eq('a_confirmar', true).gte('data', hoje);
    if (mudouAgenda) { // novo ritmo/duração: apaga as futuras a confirmar e recomeça a geração de hoje em diante
        await sb.from('transacoes').delete().eq('recorrencia_id', id).eq('a_confirmar', true).gte('data', hoje);
        const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
        await sb.from('recorrencias').update({ gerado_ate: formatarDataISO(ontem) }).eq('id', id);
    }
}

/** Encerra: some das ativas (vai para "Encerradas") e as ocorrências futuras a confirmar são apagadas. */
async function encerrarRecorrencia(id) {
    const hoje = hojeISO();
    await sb.from('transacoes').delete().eq('recorrencia_id', id).eq('a_confirmar', true).gte('data', hoje);
    const { error } = await sb.from('recorrencias').update({ status: 'encerrada', encerrada_em: hoje }).eq('id', id);
    if (error) throw error;
}

/** Volta uma recorrência encerrada: reativa e gera de hoje em diante. */
async function reativarRecorrencia(id) {
    const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
    const { error } = await sb.from('recorrencias').update({ status: 'ativa', encerrada_em: null, ativa_desde: hojeISO(), gerado_ate: formatarDataISO(ontem) }).eq('id', id);
    if (error) throw error;
}

/** Exclui a recorrência de vez: as futuras a confirmar somem; o que já foi confirmado continua como lançamento normal. */
async function excluirRecorrencia(id) {
    await sb.from('transacoes').delete().eq('recorrencia_id', id).eq('a_confirmar', true).gte('data', hojeISO());
    const { error } = await sb.from('recorrencias').delete().eq('id', id);
    if (error) throw error;
}

function _recTotalTexto(r) {
    if (!r.meses) return 'Contínuo';
    const n = calcularOcorrenciasRecorrencia({ frequencia: r.frequencia, diaSemana: r.diaSemana, meses: r.meses });
    return `${formatarMoeda(r.valor * n)} em ${r.meses} meses`;
}

const _MESES_ABREV_REC = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
/** 'YYYY-MM' -> 'Out/2026' (mês em que a recorrência foi criada). */
function _recMesCriacaoTexto(ym) {
    const m = /^(\d{4})-(\d{2})/.exec(String(ym || ''));
    return m ? `${_MESES_ABREV_REC[Number(m[2]) - 1]}/${m[1]}` : '—';
}

// Filtro de exibição de cada grupo (como nas listas do app): 'cronologica' (padrão), 'categoria' ou 'metodo'
const _recFiltro = { saidas: 'cronologica', entradas: 'cronologica' };
const _recAbertos = {}; // chave do grupo/subgrupo -> aberto (sem chave = padrão)

/** Linha de uma recorrência — mesmo visual das linhas de lançamento (chips, descrição em itálico, ações). */
function _recCardHTML(r) {
    const despesa = r.tipo === 'saidas';
    const coresMet = (estadoApp.menus && estadoApp.menus.cores && estadoApp.menus.cores.metodo) || {};
    const corCat = corDaCategoria(r.categoria, despesa ? 'saida' : 'entrada');
    const corMet = coresMet[r.metodo] || corPadraoChip(r.metodo);
    return `
        <div class="despesa-item rec-item ${despesa ? 'saida' : 'entrada'}" data-id="${r.id}">
            ${r.status === 'encerrada'
                ? '<button type="button" class="rec-toggle rec-toggle--play" data-rec-act="voltar" title="Voltar (reativar a recorrência)" aria-label="Reativar"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.8"/><path fill="currentColor" d="M10 7.8v8.4l6.6-4.2z"/></svg></button>'
                : '<button type="button" class="rec-toggle rec-toggle--stop" data-rec-act="encerrar" title="Encerrar a recorrência" aria-label="Encerrar"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="8.5" y="8.5" width="7" height="7" rx="1.2" fill="currentColor"/></svg></button>'}
            <div class="despesa-conteudo">
                <span class="rec-nome">${r.descricao || r.categoria}</span>
                <span class="despesa-valor">${despesa ? '-' : '+'} ${formatarMoeda(r.valor)}</span>
                <span class="rec-chips">
                    <span class="chip chip--neutro">🔁 ${_recRotuloFrequencia(r)}</span>
                    <span class="rec-chips-par"><span class="chip" style="background:${corCat}">${r.categoria}</span><span class="chip" style="background:${corMet}">${r.metodo}</span></span>
                </span>
                <span class="despesa-desc">${r.meses ? `Total: ${_recTotalTexto(r)}` : 'Contínuo'} · ${r.status === 'encerrada' && r.encerradaEm ? `${_recMesCriacaoTexto(r.ativaDesde)} – ${_recMesCriacaoTexto(String(r.encerradaEm).slice(0, 7))}` : `Desde ${_recMesCriacaoTexto(r.criadoEm)}`}</span>
            </div>
            <div class="despesa-actions">
                ${r.status === 'encerrada' ? '' : '<button type="button" class="btn-icon" data-rec-act="editar" title="Editar">✏️</button>'}
                <button type="button" class="btn-icon btn-danger" data-rec-act="excluir" title="Excluir">🗑️</button>
            </div>
        </div>`;
}

/** Cartões de um grupo/subgrupo num container só deles (o zebrado conta só as linhas, não a barra de filtros). */
function _recItensHTML(lista) { return `<div class="rec-itens">${lista.map(_recCardHTML).join('')}</div>`; }

/** Filtros do grupo: só aparecem os que têm mais de uma opção entre as recorrências do grupo. */
function _recOrganizadorHTML(chave, itens) {
    const opcoes = [
        ['categoria', '🏷️ Categoria', new Set(itens.map(r => r.categoria)).size > 1],
        ['metodo', '💳 Forma de pagamento', new Set(itens.map(r => r.metodo)).size > 1],
    ].filter(([dim, , tem]) => tem || _recFiltro[chave] === dim);
    if (!opcoes.length) return '';
    const atual = _recFiltro[chave];
    const botoes = opcoes.map(([dim, rotulo]) => `<span role="button" tabindex="0" class="subgrupo-modo-btn${atual === dim ? ' active' : ''}" data-submodo="${dim}" data-full="${rotulo}"${dim === 'metodo' ? ' data-med="💳 Forma de pgto." data-curto="💳 Pgto."' : ''} data-emoji="${rotulo.split(' ')[0]}">${rotulo}</span>`).join('');
    return `<div class="grupo-barra"><span class="subgrupo-organizador" data-grupo-chave="${chave}">
        <span role="button" tabindex="0" class="subgrupo-modo-icone${atual !== 'cronologica' ? ' ativo' : ''}" data-submodo-icone="1" title="Tirar filtro"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M3 4h18v2.5l-7 8V19l-4 2v-6.5l-7-8V4z"/></svg></span>
        ${botoes}</span></div>`;
}

function _recGrupoHTML(chave, nome, cor, itens, aberto) {
    let corpo;
    const modo = _recFiltro[chave];
    if (modo === 'cronologica') {
        corpo = _recItensHTML(itens);
    } else {
        const campo = modo === 'categoria' ? 'categoria' : 'metodo';
        const mapa = new Map();
        itens.forEach(r => { if (!mapa.has(r[campo])) mapa.set(r[campo], []); mapa.get(r[campo]).push(r); });
        const subs = [...mapa.entries()].sort((x, y) => y[1].length - x[1].length);
        corpo = subs.map(([sub, lista]) => {
            const k = `${chave}:${modo}:${sub}`;
            const corSub = modo === 'categoria' ? corDaCategoria(sub, chave === 'saidas' ? 'saida' : 'entrada') : corPadraoChip(sub);
            const abertoSub = _recAbertos[k] !== undefined ? _recAbertos[k] : subs.length === 1; // subgrupo único abre junto do pai
            return `
            <details class="subgrupo" data-rec-chave="${k}" style="--cor-rec:${corSub}" ${abertoSub ? 'open' : ''}>
                <summary class="subgrupo-cab">
                    <span class="subgrupo-nome">${sub}</span><span class="subgrupo-espaco"></span>
                    <span class="subgrupo-contagem">${lista.length}</span>
                </summary>
                ${_recItensHTML(lista)}
            </details>`;
        }).join('');
    }
    return `
    <details class="rec-grupo" data-rec-chave="${chave}" style="--cor-rec:${cor}" ${aberto ? 'open' : ''}>
        <summary>
            <span class="rec-grupo-nome">${nome}</span><span class="rec-grupo-espaco"></span>
            <span class="rec-grupo-contagem">${itens.length}</span>
        </summary>
        <div class="rec-grupo-itens">
            ${_recOrganizadorHTML(chave, itens)}
            ${corpo}
        </div>
    </details>`;
}

/** Grupo "Encerradas": subgrupos Despesa e Receita (sem filtros), cada linha com o botão "Voltar". */
function _recEncerradasHTML(encerradas, aberto) {
    const sub = (chave, nome, cor, lista) => !lista.length ? '' : `
        <details class="subgrupo" data-rec-chave="${chave}" style="--cor-rec:${cor}" ${(_recAbertos[chave] !== undefined ? _recAbertos[chave] : (!!encerradas.filter(r => r.tipo === 'saidas').length !== !!encerradas.filter(r => r.tipo === 'entradas').length)) ? 'open' : ''}>
            <summary class="subgrupo-cab"><span class="subgrupo-nome">${nome}</span><span class="subgrupo-espaco"></span><span class="subgrupo-contagem">${lista.length}</span></summary>
            ${_recItensHTML(lista)}
        </details>`;
    return `
    <details class="rec-grupo" data-rec-chave="encerradas" style="--cor-rec:var(--text-muted)" ${aberto ? 'open' : ''}>
        <summary><span class="rec-grupo-nome">Encerradas</span><span class="rec-grupo-espaco"></span><span class="rec-grupo-contagem">${encerradas.length}</span></summary>
        <div class="rec-grupo-itens">
            ${sub('encerradas:saidas', 'Despesa', 'var(--despesa-text)', encerradas.filter(r => r.tipo === 'saidas'))}
            ${sub('encerradas:entradas', 'Receita', 'var(--receita-text)', encerradas.filter(r => r.tipo === 'entradas'))}
        </div>
    </details>`;
}

function renderListaRecorrencias() {
    const lista = document.getElementById('recLista');
    if (!lista) return;
    const ativas = _recorrencias.filter(r => r.status !== 'encerrada');
    const encerradas = _recorrencias.filter(r => r.status === 'encerrada');
    if (!ativas.length && !encerradas.length) {
        lista.innerHTML = '<p class="empty-message">Nenhuma recorrência cadastrada. Toque em "+ Criar" para começar.</p>';
        return;
    }
    const despesas = ativas.filter(r => r.tipo === 'saidas');
    const receitas = ativas.filter(r => r.tipo === 'entradas');
    const grupos = [despesas.length, receitas.length, encerradas.length].filter(Boolean).length;
    const aberto = chave => (_recAbertos[chave] !== undefined ? _recAbertos[chave] : grupos === 1); // um grupo só: abre sozinho
    lista.innerHTML = [
        despesas.length ? _recGrupoHTML('saidas', 'Despesa', 'var(--despesa-text)', despesas, aberto('saidas')) : '',
        receitas.length ? _recGrupoHTML('entradas', 'Receita', 'var(--receita-text)', receitas, aberto('entradas')) : '',
        encerradas.length ? _recEncerradasHTML(encerradas, aberto('encerradas')) : '',
    ].join('');
    lista.querySelectorAll('.subgrupo-organizador').forEach(_ajustarLabelsFiltro);
}

/** Liga os eventos da página (uma vez) e desenha a lista. Chamada ao abrir a aba "Recorrências". */
async function iniciarRecorrencias() {
    const e = _recElementos();
    if (!e.painel) return;
    if (!e.painel.dataset.ligado) {
        e.painel.dataset.ligado = '1';
        e.btnCriar.addEventListener('click', () => abrirFormRecorrencia(null));
        document.getElementById('recFechar').addEventListener('click', fecharFormRecorrencia);
        document.getElementById('recCancelar').addEventListener('click', fecharFormRecorrencia);
        e.painel.addEventListener('submit', salvarRecorrencia);
        e.painel.querySelectorAll('.tipo-btn').forEach(b => b.addEventListener('click', () => _recDefinirTipo(b.dataset.tipo)));
        [e.freq, e.dia].forEach(el => el.addEventListener('change', atualizarFormRecorrencia));
        e.valor.addEventListener('input', () => { mascaraValorMoeda(e.valor); atualizarFormRecorrencia(); });
        // Duração (como as parcelas): ao focar vira número cru p/ digitar; as setinhas ▲▼ (events.js) e o blur formatam
        e.duracao.addEventListener('focus', () => { const n = _recDuracaoAtual(); e.duracao.value = n > 1 ? String(n) : ''; });
        e.duracao.addEventListener('input', () => { e.duracao.value = e.duracao.value.replace(/\D/g, '').slice(0, 3); atualizarFormRecorrencia(); });
        e.duracao.addEventListener('blur', atualizarFormRecorrencia);
        window.addEventListener('resize', () => { if (!e.painel.hidden) atualizarFormRecorrencia(); });
        e.freq.addEventListener('change', () => requestAnimationFrame(atualizarFormRecorrencia));
        e.lista.addEventListener('click', ev => {
            const modoBtn = ev.target.closest('[data-submodo]');
            const icone = ev.target.closest('[data-submodo-icone]');
            if (modoBtn || icone) {
                ev.preventDefault();
                const chave = (modoBtn || icone).closest('[data-grupo-chave]').dataset.grupoChave;
                _recFiltro[chave] = icone ? 'cronologica' : (_recFiltro[chave] === modoBtn.dataset.submodo ? 'cronologica' : modoBtn.dataset.submodo);
                renderListaRecorrencias();
                return;
            }
            const btn = ev.target.closest('[data-rec-act]');
            if (!btn) return;
            const id = Number(btn.closest('.rec-item').dataset.id);
            const acao = btn.dataset.recAct;
            const executar = async (fn, erroMsg) => { try { await fn(); await _recAtualizarTudo(); } catch (err) { console.error(err); mostrarNotificacao(erroMsg, 'erro'); } };
            if (acao === 'editar') abrirFormRecorrencia(_recorrencias.find(r => r.id === id));
            else if (acao === 'voltar') executar(() => reativarRecorrencia(id), 'Não consegui reativar a recorrência');
            else if (acao === 'encerrar') {
                mostrarDialogo({ titulo: 'Encerrar a recorrência?', texto: 'Os próximos lançamentos "a confirmar" são apagados; os já confirmados continuam. Ela vai para "Encerradas" e dá para voltar depois.',
                    acoes: [{ label: 'Cancelar' }, { label: 'Encerrar', primario: true, perigo: true, onClick: () => executar(() => encerrarRecorrencia(id), 'Não consegui encerrar a recorrência') }] });
            } else if (acao === 'excluir') {
                mostrarDialogo({ titulo: 'Excluir a recorrência?', texto: 'Os próximos lançamentos "a confirmar" são apagados; os já confirmados continuam como lançamentos normais.',
                    acoes: [{ label: 'Cancelar' }, { label: 'Excluir', primario: true, perigo: true, onClick: () => executar(() => excluirRecorrencia(id), 'Não consegui excluir a recorrência') }] });
            }
        });
    }
    if (!e.lista.dataset.toggleLigado) { // (uma vez só: antes era registrado a cada abertura da aba)
        e.lista.dataset.toggleLigado = '1';
        e.lista.addEventListener('toggle', ev => { const k = ev.target.dataset && ev.target.dataset.recChave; if (k) _recAbertos[k] = ev.target.open; }, true);
    }
    fecharFormRecorrencia(); // ao entrar na aba: lista + "+ Criar"
    _recPreencherListas();
    renderListaRecorrencias(); // (primeiro o que já está em memória, sem esperar a rede)
    await carregarRecorrencias();
    renderListaRecorrencias();
}
