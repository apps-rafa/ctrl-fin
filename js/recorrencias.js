/**
 * RECORRÊNCIAS — lançamentos fixos (conta mensal, assinatura, salário...).
 * Cadastro separado dos lançamentos comuns; por enquanto SÓ O LAYOUT (prévia): os dados ficam em memória
 * e somem ao recarregar. Banco, geração dos lançamentos e integração com o resto vêm depois.
 */

const _DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
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
 *  - Semanal sem dia fixo: 1 por semana (semanas inteiras do período).
 * Sem prazo (meses vazio/0): null.
 */
function calcularOcorrenciasRecorrencia({ frequencia, diaSemana, meses, inicio }) {
    if (!meses || meses < 1) return null;
    if (frequencia === 'mensal') return meses;
    const ini = new Date((inicio || new Date()).getFullYear(), (inicio || new Date()).getMonth(), (inicio || new Date()).getDate());
    const fim = _recSomarMeses(ini, meses); // exclusivo
    if (diaSemana !== '' && diaSemana != null && !Number.isNaN(Number(diaSemana))) {
        let n = 0;
        for (let d = new Date(ini); d < fim; d.setDate(d.getDate() + 1)) if (d.getDay() === Number(diaSemana)) n++;
        return n;
    }
    return Math.floor(Math.round((fim - ini) / 86400000) / 7);
}

/** Texto curto da recorrência para a lista ("Mensal", "Semanal · Seg", "Semanal"). */
function _recRotuloFrequencia(r) {
    if (r.frequencia === 'mensal') return 'Mensal';
    const dia = r.diaSemana !== '' && r.diaSemana != null ? ` · ${_DIAS_SEMANA[Number(r.diaSemana)].slice(0, 3)}` : '';
    return `Semanal${dia}`;
}

function _recElementos() {
    const $ = id => document.getElementById(id);
    return {
        painel: $('recForm'), lista: $('recLista'), btnCriar: $('recBtnCriar'), tipo: $('recTipo'),
        freq: $('recFrequencia'), diaGrupo: $('recDiaSemanaGrupo'), dia: $('recDiaSemana'), valor: $('recValor'),
        continua: $('recDuracaoContinua'), porMeses: $('recDuracaoMeses'), mesesInput: $('recMeses'), mesesGrupo: $('recMesesGrupo'),
        total: $('recTotal'), nota: $('recTotalNota'), metodo: $('recMetodo'), categoria: $('recCategoria'), descricao: $('recDescricao'),
        erro: $('recErro'),
    };
}

/** Atualiza o que depende das escolhas: dia da semana (só semanal), meses (só "por X meses") e o total estimado. */
function atualizarFormRecorrencia() {
    const e = _recElementos();
    if (!e.painel) return;
    const semanal = e.freq.value === 'semanal';
    e.diaGrupo.hidden = !semanal;
    const porMeses = e.porMeses.checked;
    e.mesesGrupo.hidden = !porMeses;
    const valor = valorCampoParaNumero(e.valor);
    const meses = porMeses ? parseInt(e.mesesInput.value, 10) || 0 : 0;
    if (!porMeses) {
        const porMes = semanal ? valor * 52 / 12 : valor;
        e.total.value = 'Sem prazo';
        e.nota.textContent = valor ? `≈ ${formatarMoeda(porMes)} por mês, enquanto durar` : 'Informe o valor para estimar o gasto mensal';
        return;
    }
    const n = calcularOcorrenciasRecorrencia({ frequencia: e.freq.value, diaSemana: e.dia.value, meses });
    if (!meses || n == null) { e.total.value = '—'; e.nota.textContent = 'Informe a duração em meses'; return; }
    e.total.value = formatarMoeda(valor * n);
    e.nota.textContent = `${n} ocorrência${n === 1 ? '' : 's'} × ${formatarMoeda(valor)} em ${meses} ${meses === 1 ? 'mês' : 'meses'}`;
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

function abrirFormRecorrencia(rec) {
    const e = _recElementos();
    if (!e.painel) return;
    _recEditandoId = rec ? rec.id : null;
    e.painel.hidden = false;
    e.btnCriar.hidden = true;
    e.erro.textContent = '';
    _recDefinirTipo(rec ? rec.tipo : 'saidas');
    e.freq.value = rec ? rec.frequencia : 'mensal';
    e.dia.value = rec && rec.diaSemana != null ? String(rec.diaSemana) : '';
    e.valor.value = rec ? formatarValorParaCampo(rec.valor) : '';
    e.continua.checked = !rec || !rec.meses;
    e.porMeses.checked = !!(rec && rec.meses);
    e.mesesInput.value = rec && rec.meses ? rec.meses : '12';
    e.metodo.value = rec ? rec.metodo : '';
    e.categoria.value = rec ? rec.categoria : '';
    e.descricao.value = rec ? rec.descricao : '';
    atualizarFormRecorrencia();
    e.painel.scrollIntoView({ block: 'nearest' });
}

function fecharFormRecorrencia() {
    const e = _recElementos();
    if (!e.painel) return;
    e.painel.hidden = true;
    e.btnCriar.hidden = false;
    _recEditandoId = null;
}

function salvarRecorrencia(ev) {
    ev.preventDefault();
    const e = _recElementos();
    const valor = valorCampoParaNumero(e.valor);
    if (!(valor > 0)) { e.erro.textContent = 'Informe o valor por ocorrência.'; return; }
    if (!e.categoria.value) { e.erro.textContent = 'Escolha a categoria.'; return; }
    if (!e.metodo.value) { e.erro.textContent = 'Escolha a forma de pagamento.'; return; }
    const meses = e.porMeses.checked ? parseInt(e.mesesInput.value, 10) || 0 : 0;
    if (e.porMeses.checked && meses < 1) { e.erro.textContent = 'Informe a duração em meses.'; return; }
    const rec = {
        id: _recEditandoId || _recProximoId++, tipo: e.tipo.value, frequencia: e.freq.value,
        diaSemana: e.freq.value === 'semanal' && e.dia.value !== '' ? Number(e.dia.value) : null,
        valor, meses: meses || null, metodo: e.metodo.value, categoria: e.categoria.value, descricao: e.descricao.value.trim(),
    };
    const i = _recorrencias.findIndex(r => r.id === rec.id);
    if (i >= 0) _recorrencias[i] = rec; else _recorrencias.push(rec);
    fecharFormRecorrencia();
    renderListaRecorrencias();
}

function _recTotalTexto(r) {
    if (!r.meses) return 'Sem prazo';
    const n = calcularOcorrenciasRecorrencia({ frequencia: r.frequencia, diaSemana: r.diaSemana, meses: r.meses });
    return `${formatarMoeda(r.valor * n)} em ${r.meses} ${r.meses === 1 ? 'mês' : 'meses'}`;
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
        e.painel.querySelectorAll('.tipo-btn').forEach(b => b.addEventListener('click', () => { _recDefinirTipo(b.dataset.tipo); }));
        [e.freq, e.dia, e.continua, e.porMeses, e.mesesInput].forEach(el => el.addEventListener('input', atualizarFormRecorrencia));
        [e.freq, e.dia, e.continua, e.porMeses].forEach(el => el.addEventListener('change', atualizarFormRecorrencia));
        e.valor.addEventListener('input', () => { mascaraValorMoeda(e.valor); atualizarFormRecorrencia(); });
        e.mesesInput.addEventListener('input', () => { e.mesesInput.value = e.mesesInput.value.replace(/\D/g, '').slice(0, 3); atualizarFormRecorrencia(); });
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
    _recPreencherListas();
    renderListaRecorrencias();
}
