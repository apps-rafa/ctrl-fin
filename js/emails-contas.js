/**
 * E-MAILS DE CONTAS (Configurações > E-mails)
 *
 * O Gmail monitorado (tabela email_contas_config) e os vínculos "remetente
 * e/ou palavra do assunto -> recorrência" (email_contas_vinculos) que o bot
 * usa para ligar um e-mail de conta (luz, gás, condomínio...) à recorrência
 * certa (supabase/functions/telegram-webhook/email.ts). Sem vínculo, o bot
 * ainda tenta pelas palavras da descrição da recorrência.
 *
 * A seção (#secEmails) é recriada junto com a aba Configurações
 * (carregarAbaMenus), por isso iniciarEmailsContas() roda a cada abertura.
 */

let _emlVinculos = [];
let _emlRecs = [];        // recorrências de despesa (as que recebem conta por e-mail)
let _emlEditandoId = null;

const _emlEsc = s => escaparHtml(String(s ?? ''));

async function iniciarEmailsContas() {
    const sec = document.getElementById('secEmails');
    if (!sec) return;
    const [cfg, vinc, recs] = await Promise.all([
        sb.from('email_contas_config').select('email').maybeSingle(),
        sb.from('email_contas_vinculos').select('id, remetente, palavra, recorrencia_id').order('id'),
        listarRecorrenciasAPI(),
    ]);
    _emlVinculos = vinc.data || [];
    _emlRecs = (recs.data || []).filter(r => r.tipo === 'saidas');
    _emlEditandoId = null;
    sec.innerHTML = _emlHtml(cfg.data?.email || '');
    _emlRenderLista();
    _emlLigar(sec);
}

function _emlNomeRec(r) {
    if (!r) return '(recorrência apagada)';
    const nome = r.descricao || r.categoria;
    return r.status === 'ativa' ? nome : `${nome} (encerrada)`;
}

function _emlHtml(email) {
    const opcoes = _emlRecs.map(r => `<option value="${r.id}">${_emlEsc(_emlNomeRec(r))}</option>`).join('');
    return `
        <h3 class="dados-selecao-titulo">Seu Gmail</h3>
        <p class="menu-hint">O e-mail onde chegam as contas (luz, gás, condomínio...). As contas com o rótulo <b>Contas</b> viram rascunho no bot do Telegram.</p>
        <form id="emlCfgForm" class="eml-linha">
            <div class="form-group"><label for="emlEmail">E-mail monitorado</label>
                <input type="email" id="emlEmail" autocomplete="off" placeholder="voce@gmail.com" value="${_emlEsc(email)}"></div>
            <button type="submit" class="btn-submit eml-btn">Salvar</button>
        </form>

        <h3 class="dados-selecao-titulo">Contas vinculadas</h3>
        <p class="menu-hint">Quando chegar um e-mail desse <b>remetente</b> e/ou com essa <b>palavra no assunto</b>, o bot atualiza a recorrência escolhida. Com os dois preenchidos, precisam casar os dois.</p>
        <form id="emlVincForm" class="eml-form">
            <div class="form-group"><label for="emlRemetente">Remetente <span class="opt">(ou parte dele)</span></label>
                <input type="text" id="emlRemetente" autocomplete="off" placeholder="fatura@empresa.com.br"></div>
            <div class="form-group"><label for="emlPalavra">Palavra do assunto</label>
                <input type="text" id="emlPalavra" autocomplete="off" placeholder="ex.: condomínio"></div>
            <div class="form-group eml-campo-rec"><label for="emlRec">Recorrência</label>
                <select id="emlRec"><option value="">Selecione...</option>${opcoes}</select></div>
            <div class="form-actions eml-acoes">
                <button type="submit" class="btn-submit" id="emlVincSalvar">Adicionar</button>
                <button type="button" class="btn-cancelar" id="emlVincCancelar" hidden>Cancelar</button>
            </div>
        </form>
        ${_emlRecs.length ? '' : '<p class="menu-hint">Cadastre antes uma recorrência de despesa (aba Recorrências).</p>'}
        <div id="emlLista" class="eml-lista"></div>

        <h3 class="dados-selecao-titulo">Instalar no Gmail (uma vez só)</h3>
        <ol class="eml-passos">
            <li>No Gmail, crie o rótulo <b>Contas</b> e um filtro que aplique esse rótulo aos e-mails das suas contas.</li>
            <li>Abra <b>script.google.com</b> &rarr; <b>Novo projeto</b> e cole o arquivo <code>scripts/gmail-contas.gs</code> do app.</li>
            <li>Na linha <code>var SEGREDO</code>, troque o texto entre aspas pelo segredo do bot (peça ao administrador do app).</li>
            <li>Escolha a função <b>instalar</b> e clique em <b>Executar</b>; aceite as permissões do Google (Gmail e conexão externa).</li>
            <li>Pronto: a cada 5 minutos, os e-mails com <b>Contas</b> vão para o bot e ganham o rótulo <b>Contas/enviado</b>.</li>
        </ol>`;
}

function _emlRenderLista() {
    const el = document.getElementById('emlLista');
    if (!el) return;
    if (!_emlVinculos.length) { el.innerHTML = '<p class="empty-text">Nenhuma conta vinculada</p>'; return; }
    el.innerHTML = _emlVinculos.map(v => {
        const rec = _emlRecs.find(r => r.id === v.recorrencia_id);
        const termos = [v.remetente && `<span class="eml-rem">${_emlEsc(v.remetente)}</span>`,
            v.palavra && `<span class="eml-pal">assunto: “${_emlEsc(v.palavra)}”</span>`].filter(Boolean).join('<span class="eml-e"> + </span>');
        return `<div class="eml-item${v.id === _emlEditandoId ? ' eml-item--editando' : ''}" data-id="${v.id}">
            <div class="eml-item-txt"><div class="eml-termos">${termos}</div><div class="eml-rec">&rarr; ${_emlEsc(_emlNomeRec(rec))}</div></div>
            <button type="button" class="btn-icon eml-editar" title="Editar" aria-label="Editar">✏️</button>
            <button type="button" class="btn-icon eml-remover" title="Remover" aria-label="Remover">🗑️</button>
        </div>`;
    }).join('');
}

function _emlLimparForm() {
    _emlEditandoId = null;
    ['emlRemetente', 'emlPalavra', 'emlRec'].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('emlVincSalvar').textContent = 'Adicionar';
    document.getElementById('emlVincCancelar').hidden = true;
    _emlRenderLista();
}

function _emlLigar(sec) {
    sec.querySelector('#emlCfgForm').addEventListener('submit', async ev => {
        ev.preventDefault();
        const email = document.getElementById('emlEmail').value.trim().toLowerCase();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return mostrarNotificacao('E-mail inválido', 'info');
        const { error } = await sb.from('email_contas_config').upsert({ email, atualizado_em: new Date().toISOString() }, { onConflict: 'user_id' });
        if (error) { console.error(error); return mostrarNotificacao('Erro ao salvar o e-mail', 'erro'); }
        mostrarNotificacao('E-mail salvo');
    });

    sec.querySelector('#emlVincForm').addEventListener('submit', async ev => {
        ev.preventDefault();
        const remetente = document.getElementById('emlRemetente').value.trim().toLowerCase();
        const palavra = document.getElementById('emlPalavra').value.trim().toLowerCase();
        const recorrencia_id = Number(document.getElementById('emlRec').value) || null;
        if (!remetente && !palavra) return mostrarNotificacao('Informe o remetente ou uma palavra do assunto', 'info');
        if (!recorrencia_id) return mostrarNotificacao('Escolha a recorrência', 'info');
        const repetido = _emlVinculos.some(v => v.id !== _emlEditandoId && v.remetente === remetente && v.palavra === palavra);
        if (repetido) return mostrarNotificacao('Esse remetente/palavra já está vinculado', 'info');
        const campos = { remetente, palavra, recorrencia_id };
        const btn = document.getElementById('emlVincSalvar');
        btn.disabled = true;
        const { error } = _emlEditandoId
            ? await sb.from('email_contas_vinculos').update(campos).eq('id', _emlEditandoId)
            : await sb.from('email_contas_vinculos').insert(campos);
        btn.disabled = false;
        if (error) { console.error(error); return mostrarNotificacao('Erro ao salvar o vínculo', 'erro'); }
        const { data } = await sb.from('email_contas_vinculos').select('id, remetente, palavra, recorrencia_id').order('id');
        _emlVinculos = data || [];
        mostrarNotificacao(_emlEditandoId ? 'Vínculo atualizado' : 'Vínculo adicionado');
        _emlLimparForm();
    });

    sec.querySelector('#emlVincCancelar').addEventListener('click', _emlLimparForm);

    sec.querySelector('#emlLista').addEventListener('click', e => {
        const item = e.target.closest('.eml-item');
        if (!item) return;
        const id = Number(item.dataset.id);
        const v = _emlVinculos.find(x => x.id === id);
        if (!v) return;
        if (e.target.closest('.eml-editar')) {
            _emlEditandoId = id;
            document.getElementById('emlRemetente').value = v.remetente;
            document.getElementById('emlPalavra').value = v.palavra;
            document.getElementById('emlRec').value = String(v.recorrencia_id);
            document.getElementById('emlVincSalvar').textContent = 'Salvar';
            document.getElementById('emlVincCancelar').hidden = false;
            _emlRenderLista();
            document.getElementById('emlRemetente').focus();
        } else if (e.target.closest('.eml-remover')) {
            executarComDesfazerNaLinha(item, {
                texto: `Removido: ${v.remetente || v.palavra}`,
                confirmar: async () => {
                    const { error } = await sb.from('email_contas_vinculos').delete().eq('id', id);
                    if (error) { console.error(error); return mostrarNotificacao('Erro ao remover', 'erro'); }
                    _emlVinculos = _emlVinculos.filter(x => x.id !== id);
                    if (_emlEditandoId === id) _emlLimparForm(); else _emlRenderLista();
                },
            });
        }
    });
}
