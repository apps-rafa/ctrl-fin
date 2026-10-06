// Edição e exclusão de lançamentos: abrir o formulário em modo edição, salvar/cancelar/apagar e voltar à tela de origem.
// Extraído de ui.js (mesmas funções globais; carregado logo depois dele em index.html).

/** @returns {Promise<boolean>} true se realmente apagou */
async function excluirTransacao(id) {
    try {
        await deletarTransacaoAPI(id);
        mostrarNotificacao('Transação excluída', 'sucesso');
        await recarregarDados();
        atualizarUI();
        return true;
    } catch (e) {
        if (e && e.detalhe && e.detalhe.tipo === 'parcela-nao-original') {
            const comp = e.detalhe.competenciaOriginal;
            const label = competenciaParaBR(comp);
            mostrarDialogo({
                titulo: 'Só a 1ª parcela pode ser apagada',
                texto: `A parcela original está em <strong>${label}</strong>. Apagar a original remove todas as parcelas.`,
                acoes: [
                    { label: `Ir para ${label}`, primario: true, onClick: () => irParaMes(comp) },
                    { label: 'Fechar' }
                ]
            });
            return false;
        }
        console.error(e);
        mostrarNotificacao('Erro ao excluir', 'erro');
        return false;
    }
}

async function quitarParcelamento(id, quitar) {
    try {
        await quitarParcelamentoAPI(id, quitar);
        mostrarNotificacao(quitar ? '✓ Parcelamento quitado' : 'Quitação desfeita', 'sucesso');
        await recarregarDados();
        atualizarUI();
    } catch (e) {
        console.error(e);
        mostrarNotificacao('Erro ao quitar', 'erro');
        await recarregarDados();
        atualizarUI();
    }
}

/** Navega a visão mensal para a competência informada (YYYY-MM-01) */
function irParaMes(competencia) {
    if (!competencia) return;
    estadoApp.mesAtual = parseDataLocal(competencia);
    recarregarDados().then(atualizarUI);
}

/** Leva a tela até o formulário de edição, deixando os campos visíveis (abaixo da barra fixa do topo). */
function rolarAteFormulario() {
    const rolar = () => {
        const form = document.getElementById('adicionar');
        if (!form) return;
        const topo = document.querySelector('.topo');
        const barra = topo && getComputedStyle(topo).position === 'fixed' || topo && getComputedStyle(topo).position === 'sticky' ? topo.offsetHeight : 0;
        window.scrollTo({ top: Math.max(0, form.getBoundingClientRect().top + window.scrollY - barra - 8) });
    };
    rolar();
    requestAnimationFrame(rolar); // de novo depois que a lista de origem some e a altura da página encolhe
}

/** Carrega a transação no formulário da aba Adicionar em modo edição */
function iniciarEdicaoTransacao(trans, tipoTransacao) {
    // Estorno de cartão é gravado como entrada, mas se lança (e edita) como Despesa > categoria Estorno
    if (tipoTransacao === 'entradas' && _ehEstornoCartao(trans)) tipoTransacao = 'saidas';
    estadoApp.editandoId = trans.id;
    // Guarda a tela de busca/Recentes (com o modo e o que estava por cima) pra devolver
    // exatamente igual quando a edição fechar; o formulário precisa da área livre.
    estadoApp.telaAntesEdicao = _capturarTelaBusca();
    if (estadoApp.telaAntesEdicao) {
        const buscaEl = document.getElementById('buscaGlobal');
        if (buscaEl) buscaEl.value = '';
        document.getElementById('buscaLimpar')?.setAttribute('hidden', '');
        document.body.classList.remove('aba-por-cima');
        atualizarBuscaGlobal();
    }
    sincronizarModoEdicao();
    // Guarda a tela de origem para voltar depois de salvar/cancelar
    estadoApp.abaOrigemEdicao = document.querySelector('.tab-content.active')?.id || null;

    mudarAba('adicionar');

    // Tipo (entrada/saída) sem recarregar menus
    // A lista de onde veio (ex.: Recentes) pode ter deixado a página rolada: o formulário
    // é bem menor, então sem isto a tela ficava presa no fim, com o dashboard cortado em cima
    rolarAteFormulario();
    estadoApp.tipoAtual = tipoTransacao;
    const tipoField = document.querySelector(SELECTORS.tipoTransacao);
    if (tipoField) tipoField.value = tipoTransacao;
    document.querySelector(SELECTORS.formTransacao)?.querySelectorAll('.tipo-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.tipo === tipoTransacao));
    atualizarLabelsPorTipo();

    document.querySelector(SELECTORS.data).value = trans.dataIndefinida ? '' : isoParaDiaMes(trans.data); // sem data: o campo fica em branco
    document.querySelector(SELECTORS.data).dataset.vazio = trans.dataIndefinida ? '1' : '';
    document.querySelector(SELECTORS.valor).value = formatarValorParaCampo(trans.valor);
    document.querySelector(SELECTORS.categoria).value = trans.categoria;
    document.querySelector(SELECTORS.descricao).value = trans.descricao || '';
    // Precisa vir depois de setar a categoria: é ela que decide se o campo
    // Método aparece pra receita (categorias "Estorno"/"Reembolso").
    atualizarCampoMetodoReceita();
    document.querySelector(SELECTORS.metodo).value = trans.metodo || (tipoTransacao === 'entradas' ? rotuloPixPadrao() : ''); // receita sem forma: PIX

    const parc = document.getElementById('parcelas');
    if (parc) parc.value = trans.parcelasTotal || 1;
    const comp = document.getElementById('competencia');
    if (comp) {
        comp.value = mesDeCompetencia(trans.competencia) || comp.value;
        comp.dataset.editado = "1";
        comp.dataset.ano = String(trans.competencia || '').slice(0, 4); // o item pode ser de outro ano que o mês em tela
    }

    atualizarCampoParcelas();
    atualizarCampoCredito();

    const btn = document.querySelector('.btn-submit');
    if (btn) btn.textContent = 'Salvar alterações';

    const excluir = document.getElementById('excluirEdicao');
    if (excluir) excluir.hidden = false;
    const editarRec = document.getElementById('editarRecorrenciaEdicao');
    if (editarRec) { editarRec.hidden = !trans.recorrenciaId; editarRec.dataset.recId = trans.recorrenciaId || ''; }
}

/** Sai do modo edição e limpa o formulário (chamado pelo "×" do formulário) */
/** Esconde a busca enquanto um lançamento está sendo editado (só o form aparece). */
function sincronizarModoEdicao() {
    document.body.classList.toggle('editando-lancamento', !!estadoApp.editandoId);
    // Fechou a edição: devolve a busca (e o resultado) de onde ela estava. Nos fluxos "explícitos"
    // (salvar/cancelar/apagar) quem chama devolve a tela inteira depois (voltarTelaAposEdicao).
    if (!estadoApp.editandoId && estadoApp.telaAntesEdicao) {
        const snap = estadoApp.telaAntesEdicao;
        estadoApp.telaAntesEdicao = null;
        if (estadoApp.voltandoDaEdicao) estadoApp.telaPendente = snap;
        else _aplicarTelaBusca(snap, false);
    }
}

/** Foto da tela de busca atual (null se não há busca/Recentes na tela). */
function _capturarTelaBusca() {
    if (!document.body.classList.contains('buscando')) return null;
    const box = document.getElementById('resultadoBusca');
    return {
        termo: document.getElementById('buscaGlobal')?.value || '',
        recentes: box?.dataset.recentes === '1' ? (Number(box.dataset.recentesQtd) || 5) : 0,
        ampla: box?.dataset.modo === 'ampla' && box?.dataset.recentes !== '1',
        porCima: document.body.classList.contains('aba-por-cima'),
    };
}

/** Devolve a busca/Recentes como estavam (mesmo modo; por cima ou por baixo da aba). */
function _aplicarTelaBusca(snap, restaurarPorCima) {
    const buscaEl = document.getElementById('buscaGlobal');
    if (buscaEl) buscaEl.value = snap.termo;
    const limpar = document.getElementById('buscaLimpar');
    if (limpar) limpar.hidden = !snap.termo;
    if (snap.recentes) mostrarRecemLancados(snap.recentes);
    else if (snap.ampla && snap.termo) { atualizarBuscaGlobal(); buscarAmpla(snap.termo); }
    else atualizarBuscaGlobal();
    if (restaurarPorCima && snap.porCima && document.querySelector('.tab-content.active')) document.body.classList.add('aba-por-cima');
}

/** Depois de salvar/cancelar/apagar uma edição: volta EXATAMENTE pra tela de onde veio
 *  (a aba de origem e a busca/Recentes, com o que estava por cima). */
function voltarTelaAposEdicao(origem) {
    const snap = estadoApp.telaPendente;
    estadoApp.telaPendente = null;
    estadoApp.voltandoDaEdicao = false;
    if (origem) mudarAba(origem);
    else fecharAbas();
    if (snap) _aplicarTelaBusca(snap, true);
}

function cancelarEdicaoTransacao(voltarParaOrigem = true) {
    const origem = estadoApp.abaOrigemEdicao;
    if (voltarParaOrigem) estadoApp.voltandoDaEdicao = true;
    estadoApp.editandoId = null;
    sincronizarModoEdicao();
    estadoApp.abaOrigemEdicao = null;
    limparFormulario();
    const btn = document.querySelector('.btn-submit');
    if (btn) btn.textContent = 'Adicionar';
    const excluir = document.getElementById('excluirEdicao');
    if (excluir) excluir.hidden = true;
    const editarRec = document.getElementById('editarRecorrenciaEdicao');
    if (editarRec) editarRec.hidden = true;
    // Cancelar pelo botão: volta para a tela onde o usuário estava
    if (voltarParaOrigem) voltarTelaAposEdicao(origem);
}

/** Sem "×" dedicado no formulário: sair da aba "Adicionar" (fechar ou trocar
 *  de aba) enquanto uma edição está em andamento cancela essa edição sozinho
 *  — sem isto, o estado "editando" ficava travado (form preso em modo
 *  edição na próxima vez que o usuário abrisse "+ Lançamento"). */
function _sairDoModoEdicaoSeAtivo() {
    if (estadoApp.editandoId) cancelarEdicaoTransacao(false);
}

/** Botão "Apagar" dentro do formulário de edição — confirmação nativa (confirm) */
async function excluirEdicaoTransacao() {
    const btn = document.getElementById('excluirEdicao');
    if (!btn || !estadoApp.editandoId) return;
    const id = estadoApp.editandoId;
    const atual = [...estadoApp.transacoes.entradas, ...estadoApp.transacoes.saidas, ...(typeof _transacoesExtra !== 'undefined' ? _transacoesExtra : [])].find(t => t.id === id);
    const voltarPara = estadoApp.abaOrigemEdicao;
    let apagou;
    if (atual && atual.recorrenciaId) apagou = await perguntarExcluirRecorrente(atual); // só este mês ou encerrar a recorrência
    else {
        if (!confirm('Apagar este lançamento? Não dá para desfazer.')) return;
        apagou = await excluirTransacao(id);
    }
    if (!apagou) return; // erro real, ou o diálogo "só a 1ª parcela" — segue em edição

    estadoApp.voltandoDaEdicao = true;
    estadoApp.editandoId = null;
    estadoApp.abaOrigemEdicao = null;
    sincronizarModoEdicao();
    limparFormulario();
    const submitBtn = document.querySelector('.btn-submit');
    if (submitBtn) submitBtn.textContent = 'Adicionar';
    btn.hidden = true;
    const editarRec = document.getElementById('editarRecorrenciaEdicao');
    if (editarRec) editarRec.hidden = true;
    voltarTelaAposEdicao(voltarPara);
}
