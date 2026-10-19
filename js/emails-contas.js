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
let _emlTemSegredo = false;   // já existe segredo pessoal do script (no banco só o hash)
let _emlEmailCadastro = ''; // e-mail do login (já confirmado no cadastro); vazio no modo teste

let _emlBackup = 'mensal';    // periodicidade do backup por e-mail
const EML_PERIODOS = [['nunca', 'Nunca'], ['semanal', 'Semanal'], ['mensal', 'Mensal'], ['bimestral', 'Bimestral'], ['trimestral', 'Trimestral'], ['semestral', 'Semestral']];

const _emlEsc =s => escaparHtml(String(s ?? ''));

async function iniciarEmailsContas() {
    const sec = document.getElementById('secEmails');
    if (!sec) return;
    const [cfg, vinc, recs, usuario] = await Promise.all([
        sb.from('email_contas_config').select('email, usar_cadastro, segredo_hash, backup_periodicidade').maybeSingle(),
        sb.from('email_contas_vinculos').select('id, remetente, palavra, recorrencia_id').order('id'),
        listarRecorrenciasAPI(),
        sb.auth.getUser(),
    ]);
    _emlEmailCadastro = String(usuario.data?.user?.email || '').toLowerCase();
    _emlVinculos = vinc.data || [];
    _emlRecs = (recs.data || []).filter(r => r.tipo === 'saidas');
    _emlEditandoId = null;
    _emlTemSegredo = !!cfg.data?.segredo_hash;
    _emlBackup = cfg.data?.backup_periodicidade || 'mensal';
    sec.innerHTML = _emlHtml(cfg.data?.email || '', !!cfg.data?.usar_cadastro && !!_emlEmailCadastro);
    _emlRenderSegredo();
    _emlRenderLista();
    _emlLigar(sec);
}

function _emlNomeRec(r) {
    if (!r) return '(recorrência apagada)';
    const nome = r.descricao || r.categoria;
    return r.status === 'ativa' ? nome : `${nome} (encerrada)`;
}

/** Diz se já há e-mail salvo (o campo sozinho não deixa claro). */
function _emlStatusTxt(email) {
    return email ? `✅ Salvo: <b>${_emlEsc(email)}</b>` : 'Nenhum e-mail salvo ainda: digite o seu Gmail e toque em Salvar.';
}

function _emlHtml(email, usarCadastro) {
    const opcoes = _emlRecs.map(r => `<option value="${r.id}">${_emlEsc(_emlNomeRec(r))}</option>`).join('');
    const valor = usarCadastro ? _emlEmailCadastro : email;
    return `
        <h3 class="dados-selecao-titulo">Seu Gmail</h3>
        <p class="menu-hint">O e-mail onde chegam as contas (luz, gás, condomínio...). As contas com o rótulo <b>Contas</b> viram rascunho no bot do Telegram (ou notificação no aparelho).</p>
        <form id="emlCfgForm" class="eml-linha">
            <div class="form-group"><label for="emlEmail">E-mail monitorado</label>
                <input type="email" id="emlEmail" autocomplete="off" placeholder="voce@gmail.com" value="${_emlEsc(valor)}"${usarCadastro ? ' readonly' : ''}></div>
            <button type="submit" class="btn-submit eml-btn">Salvar</button>
        </form>
        ${_emlEmailCadastro ? `<label class="eml-cadastro"><input type="checkbox" id="emlUsarCadastro"${usarCadastro ? ' checked' : ''}> Usar o mesmo e-mail do cadastro (<b>${_emlEsc(_emlEmailCadastro)}</b>)</label>` : ''}
        <p class="eml-status" id="emlStatus">${_emlStatusTxt(email)}</p>

        <h3 class="dados-selecao-titulo">Backup por e-mail</h3>
        <p class="menu-hint">Com que frequência o backup completo é enviado sozinho para o e-mail da sua conta.</p>
        <div class="form-group"><label for="emlBackup">Periodicidade</label>
            <select id="emlBackup">${EML_PERIODOS.map(([v, t]) => `<option value="${v}"${v === _emlBackup ? ' selected' : ''}>${t}</option>`).join('')}</select></div>

        <h3 class="dados-selecao-titulo">Contas vinculadas</h3>
        <p class="menu-hint">Quando chegar um e-mail desse <b>remetente</b> e/ou com essa <b>palavra no assunto</b>, o bot atualiza a recorrência escolhida. Com os dois preenchidos, precisam casar os dois.</p>
        <form id="emlVincForm" class="eml-form">
            <div class="form-group"><label for="emlRemetente">Remetente <span class="opt">(ou parte dele)</span></label>
                <input type="text" id="emlRemetente" autocomplete="off" placeholder="fatura@empresa.com.br"></div>
            <div class="form-group"><label for="emlPalavra">Palavra do assunto</label>
                <input type="text" id="emlPalavra" autocomplete="off" placeholder="ex.: condomínio"></div>
            <div class="form-group eml-campo-rec"><label for="emlRec">Recorrência</label>
                <div class="eml-rec-linha"><select id="emlRec"><option value="">Selecione...</option>${opcoes}</select>
                <button type="button" class="eml-rec-nova" id="emlRecNova" title="Criar recorrência" aria-label="Criar recorrência">+</button></div></div>
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
            <li><a href="scripts/gmail-contas.gs" download="gmail-contas.gs">⬇️ Baixe o script <b>gmail-contas.gs</b></a>, abra o arquivo (no Bloco de Notas, por exemplo) e copie todo o texto.</li>
            <li>Abra <a href="https://script.google.com" target="_blank" rel="noopener"><b>script.google.com</b></a> &rarr; <b>Novo projeto</b>, apague o que estiver no editor e cole o texto copiado.</li>
            <li>Na linha <code>var SEGREDO</code>, troque o texto entre aspas pelo <b>seu segredo</b>:<div id="emlSegredo" class="eml-segredo"></div></li>
            <li>Escolha a função <b>instalar</b> e clique em <b>Executar</b>; aceite as permissões do Google (Gmail e conexão externa).</li>
            <li>Já instalou com o segredo antigo (o que o administrador passava)? Troque pelo seu segredo e rode <b>instalar</b> de novo: é ele que diz ao app que a conta é sua.</li>
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
            <div class="item-actions">
                <button type="button" class="btn-icon eml-editar" title="Editar" aria-label="Editar">${ICONE_LAPIS}</button>
                <button type="button" class="btn-icon btn-danger eml-remover" title="Remover" aria-label="Remover">${ICONE_LIXEIRA}</button>
            </div>
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
    const salvarEmail = async () => {
        const usarCadastro = !!document.getElementById('emlUsarCadastro')?.checked;
        const email = usarCadastro ? _emlEmailCadastro : document.getElementById('emlEmail').value.trim().toLowerCase();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return mostrarNotificacao('E-mail inválido', 'info');
        const { error } = await sb.from('email_contas_config').upsert({ email, usar_cadastro: usarCadastro, atualizado_em: new Date().toISOString() }, { onConflict: 'user_id' });
        // índice único no banco: cada Gmail monitorado pertence a uma conta só
        if (error && String(error.code) === '23505') return mostrarNotificacao('Esse e-mail já está em uso por outra conta do app', 'erro');
        if (error) { console.error(error); return mostrarNotificacao('Erro ao salvar o e-mail', 'erro'); }
        document.getElementById('emlStatus').innerHTML = _emlStatusTxt(email);
        mostrarNotificacao(email ? 'E-mail salvo' : 'E-mail removido');
    };
    sec.querySelector('#emlCfgForm').addEventListener('submit', ev => { ev.preventDefault(); salvarEmail(); });
    // Marcar já salva (o e-mail do cadastro dispensa digitar); desmarcar libera o campo para outro e-mail
    sec.querySelector('#emlUsarCadastro')?.addEventListener('change', ev => {
        const campo = document.getElementById('emlEmail');
        campo.readOnly = ev.target.checked;
        if (ev.target.checked) { campo.value = _emlEmailCadastro; salvarEmail(); } else campo.focus();
    });

    sec.querySelector('#emlBackup').addEventListener('change', async ev => {
        const { error } = await sb.from('email_contas_config').upsert({ backup_periodicidade: ev.target.value, atualizado_em: new Date().toISOString() }, { onConflict: 'user_id' });
        if (error) { console.error(error); return mostrarNotificacao('Erro ao salvar a periodicidade', 'erro'); }
        _emlBackup = ev.target.value;
        mostrarNotificacao('Periodicidade do backup salva');
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

    // Atalho: abre a página Recorrências já no cadastro de uma nova
    sec.querySelector('#emlRecNova').addEventListener('click', async () => {
        mudarAba('recorrencias');
        await carregarRecorrencias();
        abrirFormRecorrencia(null);
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

/* ---------- Segredo pessoal do script do Gmail ----------
 * Diz ao bot de quem é a conta (ninguém manda conta "em nome" de outra pessoa). Gerado aqui no aparelho; no banco
 * fica só o hash SHA-256 (email_contas_config.segredo_hash), então ele aparece uma vez só — gerar outro invalida
 * o anterior (o script com o antigo para de ser aceito). */

function _emlRenderSegredo(segredoNovo) {
    const el = document.getElementById('emlSegredo');
    if (!el) return;
    if (segredoNovo) {
        el.innerHTML = `
            <div class="eml-segredo-linha">
                <input type="text" id="emlSegredoValor" readonly value="${_emlEsc(segredoNovo)}" aria-label="Seu segredo">
                <button type="button" class="btn-submit eml-btn" id="emlSegredoCopiar">Copiar</button>
            </div>
            <p class="eml-status">Copie agora: por segurança ele não aparece de novo (no app fica guardada só uma versão cifrada).</p>`;
        document.getElementById('emlSegredoCopiar').onclick = async () => {
            const campo = document.getElementById('emlSegredoValor');
            try { await navigator.clipboard.writeText(campo.value); } catch (_) { campo.select(); document.execCommand('copy'); }
            mostrarNotificacao('Segredo copiado');
        };
        return;
    }
    el.innerHTML = _emlTemSegredo
        ? `<p class="eml-status">✅ Você já gerou o seu segredo (ele não aparece de novo). Perdeu? <button type="button" class="eml-link" id="emlSegredoGerar">Gerar outro</button> — o anterior para de funcionar.</p>`
        : `<button type="button" class="btn-submit eml-btn eml-segredo-gerar" id="emlSegredoGerar">🔑 Gerar meu segredo</button>`;
    document.getElementById('emlSegredoGerar').onclick = _emlGerarSegredo;
}

function _emlGerarSegredo() {
    if (!_emlTemSegredo) return _emlGerarSegredoDeFato();
    mostrarDialogo({
        titulo: 'Gerar outro segredo?',
        texto: 'O script que usa o segredo atual para de funcionar até você colar o novo nele.',
        acoes: [{ label: 'Cancelar' }, { label: 'Gerar outro', primario: true, perigo: true, onClick: _emlGerarSegredoDeFato }],
    });
}

async function _emlGerarSegredoDeFato() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const segredo = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(segredo)))]
        .map(b => b.toString(16).padStart(2, '0')).join('');
    const { error } = await sb.from('email_contas_config').upsert({ segredo_hash: hash, atualizado_em: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) { console.error(error); return mostrarNotificacao('Erro ao gerar o segredo', 'erro'); }
    _emlTemSegredo = true;
    _emlRenderSegredo(segredo);
}
