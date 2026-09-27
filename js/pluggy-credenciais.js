/**
 * DADOS CADASTRAIS DA PLUGGY (Configurações > Open Finance > Dados cadastrais)
 *
 * No plano gratuito da Pluggy só dá pra conectar contas do MESMO titular da
 * conta de desenvolvedor — com uma credencial só (a do dono do app), um
 * amigo usando o app não consegue conectar o banco DELE de verdade. Esta
 * tela deixa cada usuário cadastrar a própria client_id/client_secret
 * (gerada de graça na conta Pluggy dele, com o CPF dele) — as Edge
 * Functions passam a usar essa credencial pra esse usuário; sem cadastrar
 * nada, continuam caindo pros secrets globais do app, como sempre foi.
 *
 * Página própria (mesma ideia de "visão anual"/"documentação" — ver
 * mudarAba/fecharAbas em events.js), aberta pelo botão no topo da sub-aba
 * Open Finance (ver iniciarPluggy em pluggy.js).
 */

/** Linha salva (se houver) — carregada toda vez que a página abre. */
let _pluggyCredAtual = null;

/** Texto curto pro status na sub-aba Open Finance e no topo desta página. */
function _pluggyCredStatusTexto() {
    return _pluggyCredAtual
        ? '✅ Usando sua própria credencial da Pluggy'
        : 'Usando a credencial padrão do app (só conecta contas do dono do app)';
}

function _atualizarPluggyCredStatusUI() {
    const statusOf = document.getElementById('pluggyCredStatusOf');
    if (statusOf) statusOf.textContent = _pluggyCredStatusTexto();
    const statusPagina = document.getElementById('pluggyCredStatusPagina');
    if (statusPagina) statusPagina.textContent = _pluggyCredStatusTexto();
    const btnRemover = document.getElementById('pluggyCredRemover');
    if (btnRemover) btnRemover.hidden = !_pluggyCredAtual;
}

/** Busca a credencial do usuário — chamada ao abrir a sub-aba Open Finance
 *  (só o status) e ao abrir esta página (status + preenche o formulário). */
async function carregarPluggyCredStatus() {
    const { data } = await sb.from('pluggy_credenciais').select('client_id, client_secret').maybeSingle();
    _pluggyCredAtual = data || null;
    _atualizarPluggyCredStatusUI();
}

function carregarPluggyCredenciais() {
    const msg = document.getElementById('pluggyCredMsg');
    if (msg) { msg.textContent = ''; msg.className = 'pluggy-cred-msg'; }
    carregarPluggyCredStatus().then(() => {
        const idEl = document.getElementById('pluggyCredClientId');
        const secEl = document.getElementById('pluggyCredClientSecret');
        if (idEl) idEl.value = _pluggyCredAtual?.client_id || '';
        if (secEl) { secEl.value = _pluggyCredAtual?.client_secret || ''; secEl.type = 'password'; }
        const olho = document.getElementById('pluggyCredVerSecret');
        if (olho) olho.textContent = '👁';
    });
}

async function _salvarPluggyCredenciais() {
    const idEl = document.getElementById('pluggyCredClientId');
    const secEl = document.getElementById('pluggyCredClientSecret');
    const msg = document.getElementById('pluggyCredMsg');
    const clientId = idEl?.value.trim();
    const clientSecret = secEl?.value.trim();
    if (!clientId || !clientSecret) {
        if (msg) { msg.textContent = 'Preencha os dois campos.'; msg.className = 'pluggy-cred-msg erro'; }
        return;
    }
    const btn = document.getElementById('pluggyCredSalvar');
    if (btn) btn.disabled = true;
    if (msg) { msg.textContent = 'Salvando...'; msg.className = 'pluggy-cred-msg'; }
    const { error } = await sb.from('pluggy_credenciais')
        .upsert({ client_id: clientId, client_secret: clientSecret, atualizado_em: new Date().toISOString() }, { onConflict: 'user_id' });
    if (btn) btn.disabled = false;
    if (error) {
        console.error(error);
        if (msg) { msg.textContent = 'Erro ao salvar — tenta de novo.'; msg.className = 'pluggy-cred-msg erro'; }
        return;
    }
    if (msg) { msg.textContent = '✅ Credencial salva! Já vale pra próxima conta que você conectar.'; msg.className = 'pluggy-cred-msg ok'; }
    await carregarPluggyCredStatus();
}

async function _removerPluggyCredenciais() {
    mostrarDialogo({
        titulo: 'Remover credencial própria?',
        texto: 'Volta a usar a credencial padrão do app — que só funciona pra conectar contas do dono do app, não a sua. Contas já conectadas com a sua credencial continuam funcionando normalmente (ela é lida na hora, não fica presa a elas).',
        acoes: [
            { label: 'Cancelar' },
            {
                label: 'Remover', perigo: true, onClick: async () => {
                    const { data: { user } } = await sb.auth.getUser();
                    const { error } = await sb.from('pluggy_credenciais').delete().eq('user_id', user.id);
                    if (error) { console.error(error); mostrarNotificacao('Erro ao remover', 'erro'); return; }
                    const idEl = document.getElementById('pluggyCredClientId');
                    const secEl = document.getElementById('pluggyCredClientSecret');
                    if (idEl) idEl.value = '';
                    if (secEl) secEl.value = '';
                    mostrarNotificacao('Credencial removida', 'sucesso');
                    await carregarPluggyCredStatus();
                },
            },
        ],
    });
}

function _alternarVerSecretPluggyCred() {
    const secEl = document.getElementById('pluggyCredClientSecret');
    const olho = document.getElementById('pluggyCredVerSecret');
    if (!secEl || !olho) return;
    const vendo = secEl.type === 'text';
    secEl.type = vendo ? 'password' : 'text';
    olho.textContent = vendo ? '👁' : '🙈';
}

function iniciarPluggyCredenciais() {
    document.getElementById('pluggyCredFechar')?.addEventListener('click', () => { if (typeof mudarAba === 'function') mudarAba('pluggyCred'); });
    document.getElementById('pluggyCredSalvar')?.addEventListener('click', _salvarPluggyCredenciais);
    document.getElementById('pluggyCredRemover')?.addEventListener('click', _removerPluggyCredenciais);
    document.getElementById('pluggyCredVerSecret')?.addEventListener('click', _alternarVerSecretPluggyCred);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciarPluggyCredenciais); else iniciarPluggyCredenciais();
