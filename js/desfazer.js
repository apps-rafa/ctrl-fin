// "Desfazer" padrão do app: uma ação reversível (excluir, aprovar duplicata, confirmar ocorrência...) some da tela na hora e um aviso
// "Desfazer" fica 5 s (com a barra de progresso diminuindo). A ação de verdade só vai ao banco quando o tempo acaba — assim, até lá,
// nada foi perdido e desfazer é só devolver o item à tela. Cada ação tem seu próprio aviso, relógio e itens: desfazer uma nunca mexe em outra.
// Não bloqueia nada (navegar e agir em outras coisas continua normal); se a página for fechada/escondida durante a contagem,
// as ações pendentes são confirmadas na hora, para não se perderem.

const DESFAZER_MS = 5000;
const _idsEmDesfazer = new Set();   // lançamentos escondidos enquanto o aviso está aberto
const _desfazerPendentes = new Set(); // ações com a contagem rodando: { confirmar, encerrar }

/** Esconde (ou devolve) na tela os lançamentos desses ids, em qualquer lista onde apareçam. */
function _aplicarOcultosDesfazer() {
    document.querySelectorAll('.despesa-item.desfazendo').forEach(el => { if (!_idsEmDesfazer.has(Number(el.dataset.id))) el.classList.remove('desfazendo'); });
    _idsEmDesfazer.forEach(id => document.querySelectorAll(`.despesa-item[data-id="${id}"]`).forEach(el => el.classList.add('desfazendo')));
}

// Listas redesenhadas durante a contagem (outra ação, recarga de dados) não trazem de volta o que está "excluído" no aviso
new MutationObserver(() => { if (_idsEmDesfazer.size) _aplicarOcultosDesfazer(); }).observe(document.body, { childList: true, subtree: true });

function _pilhaDesfazer() {
    let pilha = document.getElementById('desfazerPilha');
    if (!pilha) {
        pilha = document.createElement('div');
        pilha.id = 'desfazerPilha';
        pilha.setAttribute('role', 'status');
        document.body.appendChild(pilha);
    }
    return pilha;
}

/** Executa visualmente já, oferece Desfazer por 5 s e confirma depois.
 *  texto: mensagem do aviso; ids: lançamentos que somem da tela até o fim; confirmar(): a ação real (async);
 *  antes(): opcional, roda ao aplicar; aoDesfazer(): opcional, devolve à tela o que antes() mudou (ex.: desmarcar uma caixa). */
function executarComDesfazer({ texto, ids = [], confirmar, antes, aoDesfazer }) {
    ids.forEach(id => _idsEmDesfazer.add(Number(id)));
    _aplicarOcultosDesfazer();
    if (antes) antes();

    const aviso = document.createElement('div');
    aviso.className = 'desfazer-aviso';
    aviso.innerHTML = `<span class="desfazer-texto"></span><button type="button" class="desfazer-btn">Desfazer</button><i class="desfazer-barra"></i>`;
    aviso.querySelector('.desfazer-texto').textContent = texto;
    _pilhaDesfazer().appendChild(aviso);

    let encerrada = false;
    // barra de tempo (wipe): diminui da esquerda para a direita até acabar os 5 s
    const barra = aviso.querySelector('.desfazer-barra');
    const inicio = performance.now();
    const passo = () => {
        if (encerrada) { clearInterval(relogio); return; }
        barra.style.transform = `scaleX(${Math.max(0, 1 - (performance.now() - inicio) / DESFAZER_MS)})`;
    };
    const relogio = setInterval(passo, 50); // (setInterval, não requestAnimationFrame: segue rodando com a aba em segundo plano)
    passo();

    const soltarIds = () => { ids.forEach(id => _idsEmDesfazer.delete(Number(id))); _aplicarOcultosDesfazer(); };
    const acao = {
        confirmar: async () => {
            if (encerrada) return;
            encerrada = true;
            clearTimeout(timer);
            _desfazerPendentes.delete(acao);
            aviso.remove();
            try { await confirmar(); } catch (e) { console.error(e); mostrarNotificacao('Não consegui concluir a ação', 'erro'); }
            soltarIds(); // se deu certo o item já saiu da lista recarregada; se falhou, ele volta
        },
    };
    const timer = setTimeout(() => acao.confirmar(), DESFAZER_MS);
    _desfazerPendentes.add(acao);

    aviso.querySelector('.desfazer-btn').addEventListener('click', () => {
        if (encerrada) return;
        encerrada = true;
        clearTimeout(timer);
        _desfazerPendentes.delete(acao);
        aviso.remove();
        soltarIds(); // volta ao estado anterior, sem ter tocado no banco
        if (aoDesfazer) aoDesfazer();
    });
    return acao;
}

/** Fechar/esconder a página com avisos abertos: confirma as ações pendentes agora (melhor esforço). */
function _confirmarDesfazerPendentes() { [..._desfazerPendentes].forEach(a => a.confirmar()); }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') _confirmarDesfazerPendentes(); });
window.addEventListener('pagehide', _confirmarDesfazerPendentes);

/** Desfazer para uma linha que não é um lançamento (item de menu, histórico...): ela some na hora e volta se desfizer. */
function executarComDesfazerNaLinha(linha, { texto, confirmar }) {
    return executarComDesfazer({
        texto,
        antes: () => linha && linha.classList.add('desfazendo-linha'),
        aoDesfazer: () => linha && linha.classList.remove('desfazendo-linha'),
        confirmar,
    });
}
