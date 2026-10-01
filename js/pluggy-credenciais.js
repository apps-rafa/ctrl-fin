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
 * Painel inline (#pluggyCredPainel, dentro do template de menus-ui.js) que
 * troca de lugar com o conteúdo normal do Open Finance (#pluggyConteudoNormal)
 * quando o botão "Dados cadastrais" (embaixo do título "Pluggy") é clicado —
 * mesmo botão fecha de novo, como qualquer outra sub-aba de Configurações.
 * Quem já tem credencial cadastrada vê os campos travados (só leitura) até
 * clicar em "Editar" — trocar esses dados pode quebrar a sincronização, daí
 * o aviso e a confirmação extra antes de salvar uma mudança de verdade.
 *
 * O template de menus-ui.js é recriado do zero toda vez que a aba
 * Configurações abre (carregarAbaMenus) — por isso os listeners são
 * re-anexados a cada vez via iniciarPluggyCredenciais(), chamada de dentro
 * de iniciarPluggy() (pluggy.js), e não uma vez só no carregamento da página.
 */

/** Linha salva (se houver) — carregada toda vez que o painel abre. */
let _pluggyCredAtual = null;
/** Só importa quando _pluggyCredAtual existe: false = campos travados
 *  (modo padrão de quem já cadastrou), true = campos liberados pra edição. */
let _pluggyCredEditando = false;

/** Texto curto pro status na sub-aba Open Finance e no topo do painel. */
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
    _pluggyCredAplicarModoUI();
}

/** Busca a credencial do usuário — chamada ao abrir a sub-aba Open Finance
 *  (só o status) e ao abrir o painel (status + preenche o formulário). */
async function carregarPluggyCredStatus() {
    const { data, error } = await sb.from('pluggy_credenciais').select('client_id, client_secret').maybeSingle();
    if (error) console.error('Falha ao carregar credencial da Pluggy:', error);
    _pluggyCredAtual = data || null;
    _atualizarPluggyCredStatusUI();
}

/** Volta os campos pro valor salvo (ou vazio, se não houver credencial). */
function _pluggyCredPreencherCampos() {
    const idEl = document.getElementById('pluggyCredClientId');
    const secEl = document.getElementById('pluggyCredClientSecret');
    if (idEl) idEl.value = _pluggyCredAtual?.client_id || '';
    if (secEl) { secEl.value = _pluggyCredAtual?.client_secret || ''; secEl.type = 'password'; }
    const olho = document.getElementById('pluggyCredVerSecret');
    if (olho) olho.textContent = '👁';
}

/** Trava/libera os campos e ajusta rótulos/visibilidade dos botões conforme
 *  o estado atual (sem credencial / travado / editando). */
function _pluggyCredAplicarModoUI() {
    const idEl = document.getElementById('pluggyCredClientId');
    const secEl = document.getElementById('pluggyCredClientSecret');
    const btnPrincipal = document.getElementById('pluggyCredSalvar');
    const btnCancelar = document.getElementById('pluggyCredCancelarEdicao');
    const btnRemover = document.getElementById('pluggyCredRemover');
    const aviso = document.getElementById('pluggyCredAvisoEdicao');
    const temCredencial = !!_pluggyCredAtual;
    // Sem credencial cadastrada ainda: é um cadastro novo, sempre editável.
    const liberado = !temCredencial || _pluggyCredEditando;

    if (idEl) idEl.readOnly = !liberado;
    if (secEl) secEl.readOnly = !liberado;
    if (aviso) aviso.hidden = !(temCredencial && _pluggyCredEditando);
    if (btnCancelar) btnCancelar.hidden = !(temCredencial && _pluggyCredEditando);
    // Ao lado de "Editar" (travado), nunca junto de "Salvar"/"Fechar sem
    // alterações" (editando) — a linha de ações mostra sempre só 2 botões.
    if (btnRemover) btnRemover.hidden = !(temCredencial && !_pluggyCredEditando);
    if (btnPrincipal) btnPrincipal.textContent = !temCredencial ? 'Salvar' : (_pluggyCredEditando ? 'Salvar' : 'Editar');
}

/** Chamada toda vez que o painel abre. */
function carregarPluggyCredenciais() {
    const msg = document.getElementById('pluggyCredMsg');
    if (msg) { msg.textContent = ''; msg.className = 'pluggy-cred-msg'; }
    _pluggyCredEditando = false;
    return carregarPluggyCredStatus().then(_pluggyCredPreencherCampos);
}

/** Grava de fato no banco (novo cadastro ou edição já confirmada). */
async function _pluggyCredSalvarDeFato(clientId, clientSecret) {
    const msg = document.getElementById('pluggyCredMsg');
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
    _pluggyCredEditando = false;
    await carregarPluggyCredStatus();
    _pluggyCredPreencherCampos();
}

/** Clique no botão principal — o que ele faz depende do estado atual:
 *  sem credencial → salva direto; travado (já cadastrado) → só entra em
 *  modo de edição; editando → valida e confirma antes de salvar por cima
 *  de uma credencial que já existia. */
async function _pluggyCredBotaoPrincipalClick() {
    const temCredencial = !!_pluggyCredAtual;
    if (temCredencial && !_pluggyCredEditando) {
        _pluggyCredEditando = true;
        _pluggyCredAplicarModoUI();
        document.getElementById('pluggyCredClientId')?.focus();
        return;
    }

    const idEl = document.getElementById('pluggyCredClientId');
    const secEl = document.getElementById('pluggyCredClientSecret');
    const msg = document.getElementById('pluggyCredMsg');
    const clientId = idEl?.value.trim();
    const clientSecret = secEl?.value.trim();
    if (!clientId || !clientSecret) {
        if (msg) { msg.textContent = 'Preencha os dois campos.'; msg.className = 'pluggy-cred-msg erro'; }
        return;
    }

    const mudou = temCredencial && (clientId !== _pluggyCredAtual.client_id || clientSecret !== _pluggyCredAtual.client_secret);
    if (temCredencial && !mudou) {
        // Editou e voltou pros mesmos valores — não precisa confirmar nada.
        _pluggyCredEditando = false;
        _pluggyCredAplicarModoUI();
        return;
    }
    if (temCredencial && mudou) {
        mostrarDialogo({
            titulo: 'Trocar a credencial da Pluggy?',
            texto: 'Isso muda qual conta da Pluggy o app vai usar pras suas conexões daqui pra frente. Se os novos dados estiverem errados, você pode parar de conseguir sincronizar até corrigir.',
            acoes: [
                { label: 'Cancelar' },
                { label: 'Trocar mesmo assim', perigo: true, onClick: () => _pluggyCredSalvarDeFato(clientId, clientSecret) },
            ],
        });
        return;
    }
    await _pluggyCredSalvarDeFato(clientId, clientSecret);
}

/** "Fechar sem alterações" durante a edição — descarta o que foi digitado e
 *  volta pros campos travados com o valor salvo. */
function _pluggyCredSairEdicaoSemSalvar() {
    _pluggyCredEditando = false;
    _pluggyCredPreencherCampos();
    _pluggyCredAplicarModoUI();
    const msg = document.getElementById('pluggyCredMsg');
    if (msg) { msg.textContent = ''; msg.className = 'pluggy-cred-msg'; }
}

async function _removerPluggyCredenciais() {
    mostrarDialogo({
        titulo: 'Remover credencial própria?',
        texto: 'Volta a usar a credencial padrão do app — que só conecta contas do dono do app, não a sua. Se você já tem contas conectadas com a SUA credencial, elas vão parar de sincronizar (a credencial padrão não tem acesso a elas) e você vai precisar reconectá-las do zero depois. O histórico já confirmado não é afetado, só a sincronização automática.',
        acoes: [
            { label: 'Cancelar' },
            {
                label: 'Remover', perigo: true, onClick: async () => {
                    const { data: { user } } = await sb.auth.getUser();
                    const { error } = await sb.from('pluggy_credenciais').delete().eq('user_id', user.id);
                    if (error) { console.error(error); mostrarNotificacao('Erro ao remover', 'erro'); return; }
                    mostrarNotificacao('Credencial removida', 'sucesso');
                    _pluggyCredEditando = false;
                    await carregarPluggyCredStatus();
                    _pluggyCredPreencherCampos();
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

/** Abre o painel "Dados cadastrais" no lugar do conteúdo normal do Open
 *  Finance — igual a qualquer outra sub-aba de Configurações (título
 *  "Pluggy" continua visível, só o que vem abaixo dele troca). */
function abrirPluggyCredPainel() {
    const painel = document.getElementById('pluggyCredPainel');
    const normal = document.getElementById('pluggyConteudoNormal');
    if (!painel || !normal) return;
    painel.hidden = false;
    normal.hidden = true;
    const btn = document.getElementById('btnPluggyCred');
    btn?.classList.add('active');
    btn?.setAttribute('aria-expanded', 'true');
    carregarPluggyCredenciais();
}

function fecharPluggyCredPainel() {
    const painel = document.getElementById('pluggyCredPainel');
    const normal = document.getElementById('pluggyConteudoNormal');
    if (!painel || !normal) return;
    painel.hidden = true;
    normal.hidden = false;
    const btn = document.getElementById('btnPluggyCred');
    btn?.classList.remove('active');
    btn?.setAttribute('aria-expanded', 'false');
}

function alternarPluggyCredPainel() {
    const painel = document.getElementById('pluggyCredPainel');
    if (!painel) return;
    if (painel.hidden) abrirPluggyCredPainel(); else fecharPluggyCredPainel();
}

/** Chamada de dentro de iniciarPluggy() (pluggy.js) toda vez que a aba
 *  Configurações é (re)renderizada — ver nota no topo do arquivo. */
function iniciarPluggyCredenciais() {
    document.getElementById('pluggyCredSalvar')?.addEventListener('click', _pluggyCredBotaoPrincipalClick);
    document.getElementById('pluggyCredCancelarEdicao')?.addEventListener('click', _pluggyCredSairEdicaoSemSalvar);
    document.getElementById('pluggyCredRemover')?.addEventListener('click', _removerPluggyCredenciais);
    document.getElementById('pluggyCredVerSecret')?.addEventListener('click', _alternarVerSecretPluggyCred);
}
