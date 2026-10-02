/**
 * RECORRÊNCIAS — lançamentos fixos (conta mensal, assinatura, salário...).
 * Cadastro separado dos lançamentos comuns; por enquanto SÓ O LAYOUT (prévia): os dados ficam em memória
 * e somem ao recarregar. Banco, geração dos lançamentos e integração com o resto vêm depois.
 */

const _DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const _DIAS_TRI = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
let _recorrencias = (typeof window !== 'undefined' && window.__SEED__ && window.__SEED__.recorrencias) ? [...window.__SEED__.recorrencias] : [];
let _recEditandoId = null;
let _recProximoId = 1;

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

/** Duração na caixa com setinhas: 1 = "Contínua" (sem prazo); 2 ou mais = quantidade de meses. */
function _recDuracaoTexto(n) { return n > 1 ? `${n} meses` : 'Contínua'; }
function _recMesesDe(n) { return n > 1 ? n : 0; }

/** Texto curto da recorrência para a lista ("Mensal", "Semanal · SEG", "Semanal · Variável"). */
function _recRotuloFrequencia(r) {
    if (r.frequencia === 'mensal') return 'Mensal';
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

/** Atualiza o que depende das escolhas: menu de dias (só semanal), texto da duração e o Total. */
function atualizarFormRecorrencia() {
    const e = _recElementos();
    if (!e.painel) return;
    const semanal = e.freq.value === 'semanal';
    e.diaGrupo.hidden = !semanal;
    const n = _recDuracaoAtual();
    if (document.activeElement !== e.duracao) e.duracao.value = _recDuracaoTexto(n); // em digitação fica o número cru
    const valor = valorCampoParaNumero(e.valor);
    const meses = _recMesesDe(n);
    if (!meses) {
        const porMes = semanal ? valor * 52 / 12 : valor;
        e.total.value = 'Sem prazo';
        e.total.title = valor ? `≈ ${formatarMoeda(porMes)} por mês, enquanto durar` : 'Informe o valor para estimar o gasto mensal';
        return;
    }
    const ocorr = calcularOcorrenciasRecorrencia({ frequencia: e.freq.value, diaSemana: e.dia.value, meses });
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
    e.aviso.hidden = true;
    e.erro.textContent = '';
    _recDefinirTipo(rec ? rec.tipo : 'saidas');
    e.freq.value = rec ? rec.frequencia : 'mensal';
    e.dia.value = rec && rec.diaSemana != null ? String(rec.diaSemana) : '';
    e.valor.value = rec ? formatarValorParaCampo(rec.valor) : '';
    e.duracao.value = rec && rec.meses ? String(rec.meses) : '1';
    e.metodo.value = rec ? rec.metodo : '';
    e.categoria.value = rec ? rec.categoria : '';
    e.descricao.value = rec ? rec.descricao : '';
    atualizarFormRecorrencia();
}

/** Fecha o cadastro e mostra de novo "+ Criar" e a lista. */
function fecharFormRecorrencia() {
    const e = _recElementos();
    if (!e.painel) return;
    e.painel.hidden = true;
    e.btnCriar.hidden = false;
    e.lista.hidden = false;
    e.aviso.hidden = false;
    _recEditandoId = null;
}

function salvarRecorrencia(ev) {
    ev.preventDefault();
    const e = _recElementos();
    const valor = valorCampoParaNumero(e.valor);
    if (!(valor > 0)) { e.erro.textContent = 'Informe o valor por ocorrência.'; return; }
    if (!e.metodo.value) { e.erro.textContent = 'Escolha a forma de pagamento.'; return; }
    if (!e.categoria.value) { e.erro.textContent = 'Escolha a categoria.'; return; }
    const rec = {
        id: _recEditandoId || _recProximoId++, tipo: e.tipo.value, frequencia: e.freq.value,
        diaSemana: e.freq.value === 'semanal' && e.dia.value !== '' ? Number(e.dia.value) : null,
        valor, meses: _recMesesDe(_recDuracaoAtual()) || null, metodo: e.metodo.value, categoria: e.categoria.value,
        descricao: e.descricao.value.trim(),
    };
    const i = _recorrencias.findIndex(r => r.id === rec.id);
    if (i >= 0) _recorrencias[i] = rec; else _recorrencias.push(rec);
    fecharFormRecorrencia();
    renderListaRecorrencias();
}

function _recTotalTexto(r) {
    if (!r.meses) return 'Sem prazo';
    const n = calcularOcorrenciasRecorrencia({ frequencia: r.frequencia, diaSemana: r.diaSemana, meses: r.meses });
    return `${formatarMoeda(r.valor * n)} em ${r.meses} meses`;
}

function renderListaRecorrencias() {
    const lista = document.getElementById('recLista');
    if (!lista) return;
    if (!_recorrencias.length) {
        lista.innerHTML = '<p class="empty-message">Nenhuma recorrência cadastrada. Toque em "+ Criar" para começar.</p>';
        return;
    }
    lista.innerHTML = _recorrencias.map(r => {
        const despesa = r.tipo === 'saidas';
        return `
        <div class="rec-card ${despesa ? 'saida' : 'entrada'}" data-id="${r.id}">
            <div class="rec-card-topo">
                <span class="rec-card-tipo">${despesa ? '⬆' : '⬇'}</span>
                <span class="rec-card-desc">${r.descricao || r.categoria}</span>
                <span class="rec-card-valor">${despesa ? '-' : '+'} ${formatarMoeda(r.valor)}</span>
                <span class="rec-card-acoes">
                    <button type="button" class="btn-icon" data-rec-act="editar" title="Editar">✏️</button>
                    <button type="button" class="btn-icon btn-danger" data-rec-act="excluir" title="Excluir">🗑️</button>
                </span>
            </div>
            <div class="rec-card-meta">
                <span class="rec-chip rec-chip--freq">🔁 ${_recRotuloFrequencia(r)}</span>
                <span class="rec-chip">${r.categoria}</span>
                <span class="rec-chip">${r.metodo}</span>
                <span class="rec-card-total">Total: ${_recTotalTexto(r)}</span>
            </div>
        </div>`;
    }).join('');
}

/** Liga os eventos da página (uma vez) e desenha a lista. Chamada ao abrir a aba "Recorrências". */
function iniciarRecorrencias() {
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
        e.lista.addEventListener('click', ev => {
            const btn = ev.target.closest('[data-rec-act]');
            if (!btn) return;
            const id = Number(btn.closest('.rec-card').dataset.id);
            if (btn.dataset.recAct === 'excluir') {
                if (!confirm('Excluir esta recorrência?')) return;
                _recorrencias = _recorrencias.filter(r => r.id !== id);
                renderListaRecorrencias();
            } else abrirFormRecorrencia(_recorrencias.find(r => r.id === id));
        });
    }
    fecharFormRecorrencia(); // ao entrar na aba: lista + "+ Criar"
    _recPreencherListas();
    renderListaRecorrencias();
}
