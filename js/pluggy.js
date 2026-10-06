/**
 * PLUGGY — conexão de contas bancárias (open finance).
 * Vive dentro de Configurações > Importar > Pluggy, com a mesma cara de
 * a antiga importação por arquivo: conectar/gerenciar contas, sincronizar, e revisar os
 * lançamentos importados numa lista com grupo de possíveis duplicatas —
 * confirmar grava um lançamento de verdade, ignorar só marca a linha.
 */

// Versão fixa do SDK (não usar "latest" — evita quebra silenciosa).
const PLUGGY_SDK_URL = 'https://cdn.jsdelivr.net/npm/pluggy-connect-sdk@2.14.2/+esm';
// TODO: desligar quando o app for conectar contas reais (produção) — e
// junto com isso, remover o filtro connectorIds abaixo.
const PLUGGY_INCLUDE_SANDBOX = true;
// Restringe o widget aos conectores de teste conhecidos (ids fixos, via
// GET /connectors?sandbox=true na API da Pluggy):
//   2   = "Pluggy Bank"  — sandbox usuário/senha (user-ok / password-ok)
//   200 = "MeuPluggy"    — demo próprio da Pluggy, fluxo OAuth
const PLUGGY_CONNECTOR_IDS = [2, 200];

let _PluggyConnectCtor = null;
// Estado aberto/fechado dos 2 grupos de contas — sobrevive a re-renders
// (ex.: depois de (des)conectar uma conta). Os dois começam fechados.
const _abertosPluggyContas = { conectadas: false, desconectadas: false };

/** Banco de uma conta Pluggy. O conector "MeuPluggy" agrega vários bancos e
 *  não diz qual é o de cada conta, então a fonte mais confiável é o banco do
 *  "Método do app" ligado à conta; depois o nome de marketing sem o "(...)".
 *  Mesma regra do telegram-webhook (tituloContaPluggyDetalhado). */
function _bancoContaPluggy(c) {
    const metodos = (estadoApp.menus && estadoApp.menus.metodos) || [];
    const metodo = c.metodo_id ? metodos.find(m => m.id === c.metodo_id) : null;
    const marketing = c.marketing_name || '';
    const bruto = (metodo && metodo.banco)
        || (marketing ? marketing.replace(/\s*\([^)]*\)\s*$/, '') : null)
        || (c.nome_instituicao && !/meupluggy/i.test(c.nome_instituicao) ? c.nome_instituicao : null);
    if (!bruto) return null;
    // "Nu Pagamentos S.A. - Instituição de Pagamento" -> "Nubank"
    if (/^nu pagamentos/i.test(bruto.trim())) return 'Nubank';
    return bruto.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/** Nome padrão da conta ("Banco: Tipo") — o mesmo do Telegram:
 *    Mercado Pago: Conta Pré-paga
 *    Bradesco: Cartão de crédito VISA INFINITE (final 1525) */
function tituloContaPluggy(c) {
    const banco = _bancoContaPluggy(c);
    if (c.tipo_conta === 'CREDIT') {
        const marca = (c.marca_cartao || '').toUpperCase();
        const nivel = (c.nome_conta || '').toUpperCase(); // "VISA INFINITE", "PLATINUM" ou o próprio banco
        let detalhe;
        if (nivel && marca && nivel.includes(marca)) detalhe = nivel;
        else if (nivel && banco && nivel === banco.toUpperCase()) detalhe = marca;
        else detalhe = [marca, nivel].filter(Boolean).join(' ');
        const cartao = `Cartão de crédito${detalhe ? ' ' + detalhe : ''}${c.numero_mascarado ? ` (final ${c.numero_mascarado})` : ''}`;
        return banco ? `${banco}: ${cartao}` : cartao;
    }
    const entreParenteses = (c.marketing_name || '').match(/\(([^)]+)\)\s*$/)?.[1];
    const tipo = entreParenteses || c.nome_conta || 'Conta bancária';
    return banco ? `${banco}: ${tipo}` : tipo;
}

/** Nome curto pros botões de escolher contas do sync: "Bradesco: Crédito",
 *  "Mercado Pago: Conta". */
function tituloContaPluggyCurto(c) {
    const tipo = c.tipo_conta === 'CREDIT' ? 'Crédito' : 'Conta';
    const banco = _bancoContaPluggy(c);
    return banco ? `${banco}: ${tipo}` : tipo;
}

// Mesma heurística do servidor (supabase/functions/pluggy-sync e
// pluggy-webhook) — duplicada aqui só pra também sugerir categoria nas
// linhas que já estavam na fila antes dessa lógica existir no servidor.
const PALAVRAS_CHAVE_CATEGORIA_PLUGGY = [
    { padrao: /drogaria|farm[aá]cia|droga ?raia|pacheco|pague ?menos/, categoria: 'Saúde' },
    { padrao: /hospital|cl[ií]nica|laborat[oó]rio|dentista|odont/, categoria: 'Saúde' },
    { padrao: /academia|smart ?fit|bodytech|bio ?ritmo/, categoria: 'Saúde' },
    { padrao: /supermercado|hortifruti|atacad[ãa]o|carrefour|extra|p[ãa]o de a[çc][uú]car|assa[íi]/, categoria: 'Mercado' },
    { padrao: /restaurante|lanchonete|padaria|pizzaria|churrascaria/, categoria: 'Alimentação' },
    { padrao: /ifood|rappi|mcdonalds|burger king|habib|subway/, categoria: 'Alimentação' },
    { padrao: /uber|99app|99pop|t[áa]xi/, categoria: 'Transporte' },
    { padrao: /posto|ipiranga|shell|petrobras|ale combust/, categoria: 'Transporte' },
    { padrao: /estacionamento|zona azul/, categoria: 'Transporte' },
    { padrao: /netflix|spotify|disney|amazon prime|hbo|paramount/, categoria: 'Lazer' },
    { padrao: /cinema|cinemark|teatro/, categoria: 'Lazer' },
    { padrao: /escola|faculdade|universidade|udemy|alura/, categoria: 'Educação' },
    { padrao: /condom[ií]nio|imobili[aá]ria|aluguel/, categoria: 'Casa' },
    { padrao: /cemig|light sa|enel|sabesp|copasa|eletropaulo/, categoria: 'Casa' },
];

function sugerirCategoriaPorPalavraChavePluggy(descricaoBanco) {
    if (!descricaoBanco) return null;
    const alvo = descricaoBanco.toLowerCase();
    const achado = PALAVRAS_CHAVE_CATEGORIA_PLUGGY.find(p => p.padrao.test(alvo));
    return achado ? achado.categoria : null;
}

/** Sugestão de categoria calculada no cliente (fallback quando a linha já
 *  tem categoria_sugerida nula, gravada antes dessa heurística existir).
 *  categoriasApp é a lista de nomes (string) do tipo entrada/saída certo —
 *  mesmo formato que estadoApp.menus.categoriasReceita/categoriasDespesa. */
function sugerirCategoriaClientePluggy(item, categoriasApp) {
    const descNorm = (item.descricao_banco || '').trim().toLowerCase();
    if (descNorm) {
        const exata = categoriasApp.find(nome => nome.toLowerCase() === descNorm);
        if (exata) return exata;
    }
    const porPalavraChave = sugerirCategoriaPorPalavraChavePluggy(item.descricao_banco);
    if (porPalavraChave) {
        const achada = categoriasApp.find(nome => nome.toLowerCase() === porPalavraChave.toLowerCase());
        if (achada) return achada;
    }
    if (item.categoria_pluggy) {
        const alvo = item.categoria_pluggy.trim().toLowerCase();
        const exata = categoriasApp.find(nome => nome.toLowerCase() === alvo);
        if (exata) return exata;
        const parcial = categoriasApp.find(nome => alvo.includes(nome.toLowerCase()) || nome.toLowerCase().includes(alvo));
        if (parcial) return parcial;
    }
    return null;
}

/** Carrega o SDK da Pluggy sob demanda (só quando o usuário clica em conectar). */
async function carregarPluggyConnectSdk() {
    if (!_PluggyConnectCtor) {
        const mod = await import(PLUGGY_SDK_URL);
        _PluggyConnectCtor = mod.PluggyConnect;
    }
    return _PluggyConnectCtor;
}

/** Abre o widget Pluggy Connect para conectar uma conta nova. */
async function conectarContaPluggy() {
    try {
        const { data, error } = await sb.functions.invoke('pluggy-connect-token', { body: {} });
        if (error || !data?.accessToken) {
            throw error || new Error('Resposta sem accessToken');
        }

        const PluggyConnect = await carregarPluggyConnectSdk();
        const widget = new PluggyConnect({
            connectToken: data.accessToken,
            includeSandbox: PLUGGY_INCLUDE_SANDBOX,
            connectorIds: PLUGGY_CONNECTOR_IDS,
            onSuccess: async ({ item }) => {
                await finalizarConexaoPluggy(item.id);
            },
            onError: (erro) => {
                console.error(erro);
                mostrarNotificacao('Erro ao conectar: ' + (erro?.message || 'desconhecido'), 'erro');
            },
        });
        await widget.init();
    } catch (e) {
        console.error(e);
        mostrarNotificacao('Erro ao iniciar conexão com a Pluggy', 'erro');
    }
}

/** Grava as contas do item recém-conectado e atualiza a lista na tela. */
async function finalizarConexaoPluggy(itemId) {
    try {
        const { data, error } = await sb.functions.invoke('pluggy-item-conectado', { body: { itemId } });
        if (error) throw error;
        mostrarNotificacao(`${data?.contas?.length || 0} conta(s) conectada(s)`, 'sucesso');
        await carregarContasConectadas();
    } catch (e) {
        console.error(e);
        mostrarNotificacao('Conta conectada na Pluggy, mas houve erro ao salvar aqui — recarregue a página', 'erro');
    }
}

let _ultimaAtualizacaoSaldos = 0;
/** Pede pro servidor buscar na Pluggy o saldo atual das contas e as faturas dos
 *  cartões (sem mexer na fila de revisão) e recarrega o dashboard. Roda ao abrir
 *  o app e ao voltar pra ele (no máximo 1x a cada 3 min fora do primeiro
 *  carregamento). Falha silenciosa — mostra o último valor guardado. */
async function atualizarSaldosPluggy(forcar = false) {
    if (!forcar && Date.now() - _ultimaAtualizacaoSaldos < 3 * 60 * 1000) return;
    _ultimaAtualizacaoSaldos = Date.now();
    try {
        await sb.functions.invoke('pluggy-sync', { body: { soSaldos: true } });
    } catch (e) {
        console.warn('Atualização de saldos indisponível:', e);
    }
    await carregarSaldoContas();
    await carregarFaturasBanco();
}

/** Soma o saldo das contas BANCÁRIAS conectadas (Open Finance) pro cartão
 *  "Saldo em contas" do dashboard; sem nenhuma conta com saldo, esconde. */
async function carregarSaldoContas() {
    const { data, error } = await sb.from('pluggy_contas')
        .select('*').eq('tipo_conta', 'BANK').in('status', ['ativo', 'erro']).order('id');
    if (error) { console.error(error); return; }
    const contas = (data || []).filter(c => typeof c.saldo === 'number');
    estadoApp.saldoContasLista = contas.map(c => ({ nome: tituloContaPluggyCurto(c), saldo: c.saldo }));
    estadoApp.saldoContas = contas.length ? contas.reduce((a, c) => a + c.saldo, 0) : null;
    if (typeof atualizarResumo === 'function') atualizarResumo();
}

/** UUID determinístico do parcelamento: a mesma compra parcelada (mesma conta,
 *  descrição sem o "k/n", nº de parcelas e valor) cai sempre no MESMO grupo,
 *  então as parcelas dos meses seguintes se juntam a ele sozinhas. */
async function _grupoIdParcelamentoPluggy(item) {
    const base = String(item.descricao_banco || '').toLowerCase()
        .replace(/\d{1,2}\s*\/\s*\d{1,2}/g, '').replace(/\s+/g, ' ').trim();
    const semente = `parcelamento|${item.conta_id}|${base}|${item.parcelas_total}|${Number(item.valor).toFixed(2)}`;
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(semente));
    const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Importa UMA parcela (k de n) que o banco trouxe, já dentro do parcelamento
 *  da compra — só essa linha (as outras chegam nos meses seguintes, cada uma
 *  na sua fatura) — com o chip "k/n" e o total da compra. */
async function _adicionarParcelaPluggyAPI(dados, item) {
    const n = item.parcelas_total, k = item.parcela_num;
    const registro = montarRegistro({ ...dados, tipoRecorrencia: 'Parcelada' });
    registro.grupo_id = await _grupoIdParcelamentoPluggy(item);
    registro.parcelas_total = n;
    registro.parcela_num = k;
    registro.valor_total = Math.round(Number(item.valor) * n * 100) / 100;
    const { data, error } = await sb.from('transacoes').insert(registro).select().single();
    if (error) throw error;
    return mapearTransacao(data);
}

/** Ids dos lançamentos (manuais ou do bot) já conciliados com uma transação do
 *  banco — ganham o selo 🏦 nas listas. Os que vieram do próprio Pluggy não
 *  precisam (são do banco por definição). */
async function carregarConciliadas() {
    const { data, error } = await sb.from('transacoes_importadas')
        .select('transacao_id').eq('status', 'confirmada').not('transacao_id', 'is', null);
    if (error) { console.error(error); return; }
    estadoApp.conciliadas = new Set((data || []).map(r => r.transacao_id));
}

/** Faturas do banco (pluggy_faturas) por cartão — o Próximos compara o total
 *  lançado no app com o total da fatura do banco (ver renderFaturasCartao). */
async function carregarFaturasBanco() {
    const [{ data: faturas, error: e1 }, { data: contas, error: e2 }] = await Promise.all([
        sb.from('pluggy_faturas').select('conta_id, vencimento, total'),
        sb.from('pluggy_contas').select('id, metodo_id').eq('tipo_conta', 'CREDIT'),
    ]);
    if (e1 || e2) { console.error(e1 || e2); return; }
    const metodoDaConta = new Map((contas || []).map(c => [c.id, c.metodo_id]));
    estadoApp.faturasBanco = (faturas || [])
        .map(f => ({ metodoId: metodoDaConta.get(f.conta_id) ?? null, vencimento: f.vencimento, total: f.total }))
        .filter(f => f.metodoId != null && f.vencimento && typeof f.total === 'number');
    if (document.getElementById('proximas')?.classList.contains('active') && typeof atualizarProximasTransacoes === 'function') atualizarProximasTransacoes();
}

/** Carrega e renderiza as contas conectadas (Importar > Pluggy). */
async function carregarContasConectadas() {
    const container = document.getElementById('pluggyContasList');
    if (!container) return;

    const { data, error } = await sb
        .from('pluggy_contas')
        .select('*')
        .order('criado_em', { ascending: false });

    if (error) {
        console.error(error);
        container.innerHTML = '<p class="empty-text">Erro ao carregar contas conectadas</p>';
        return;
    }
    if (!data || !data.length) {
        container.innerHTML = '<p class="empty-text">Nenhuma conta conectada ainda</p>';
        container.onclick = null;
        container.onchange = null;
        _renderSeletorContasSyncPluggy([]);
        return;
    }

    const conectadas = data.filter(c => c.status !== 'desconectado');
    const desconectadas = data.filter(c => c.status === 'desconectado');
    _renderSeletorContasSyncPluggy(conectadas);

    const grupo = (id, titulo, lista, aberto) => !lista.length ? '' : `
        <details class="pluggy-contas-grupo" data-grupo-id="${id}" ${aberto ? 'open' : ''}>
            <summary class="pluggy-contas-grupo-titulo">${titulo} (${lista.length})</summary>
            ${lista.map(gerarHTMLContaPluggy).join('')}
        </details>`;

    container.innerHTML =
        grupo('conectadas', 'Conectadas', conectadas, _abertosPluggyContas.conectadas) +
        grupo('desconectadas', 'Desconectadas', desconectadas, _abertosPluggyContas.desconectadas);

    container.querySelectorAll('details.pluggy-contas-grupo').forEach(det => {
        det.addEventListener('toggle', () => {
            _abertosPluggyContas[det.dataset.grupoId] = det.open;
        });
    });

    container.onclick = onContasConectadasClick;
    container.onchange = onContasConectadasChange;
}

/** Botões (uma por conta conectada) que escolhem quais contas entram no
 *  "Sincronizar" — fica entre a linha de mês/Total/Rendimentos e a de
 *  Sincronizar/Limpar. Liga/desliga a mesma coluna `sincronizar` que o
 *  pluggy-sync já respeita. */
let _syncZeradoPluggy = false;
function _renderSeletorContasSyncPluggy(conectadas) {
    const box = document.getElementById('pluggyContasSync');
    if (!box) return;
    box.hidden = !conectadas.length;
    // Por padrão nenhuma conta vem escolhida: na 1ª vez em cada carga da
    // página zera a coluna (o pluggy-sync lê dela) e mostra tudo desmarcado.
    if (!_syncZeradoPluggy && conectadas.length) {
        _syncZeradoPluggy = true;
        conectadas.filter(c => c.sincronizar).forEach(c => {
            c.sincronizar = false;
            associarSincronizarConta(c.id, false);
        });
    }
    // Dois cartões do mesmo banco dariam o mesmo nome curto — desempata
    // com o final do cartão.
    const nomes = conectadas.map(tituloContaPluggyCurto);
    box.innerHTML = conectadas.map((c, i) => {
        const repetido = nomes.filter(n => n === nomes[i]).length > 1;
        const nome = repetido && c.numero_mascarado ? `${nomes[i]} (${String(c.numero_mascarado).slice(-4)})` : nomes[i];
        // Classe própria (não .pluggy-toggle-opt): o toggle de Rendimentos
        // consulta/limpa TODOS os .pluggy-toggle-opt do documento.
        return `<button type="button" class="pluggy-conta-sync ${c.sincronizar ? 'active' : ''}"
            data-id="${c.id}" data-sincronizar="${c.sincronizar ? '1' : '0'}"
            title="${c.sincronizar ? 'Incluída' : 'Fora'} no Sincronizar — clique pra ${c.sincronizar ? 'tirar' : 'incluir'}">${nome}</button>`;
    }).join('');
    box.onclick = e => {
        const btn = e.target.closest('button[data-id]');
        if (!btn) return;
        const ligar = btn.dataset.sincronizar !== '1';
        // Uma conta por vez: ligar uma desliga as outras (ex.: Mercado Pago x cartão de crédito)
        const desligadas = ligar ? [...box.querySelectorAll('button[data-id].active')].filter(b => b !== btn) : [];
        desligadas.forEach(b => { b.classList.remove('active'); b.dataset.sincronizar = '0'; });
        btn.classList.toggle('active', ligar);
        btn.dataset.sincronizar = ligar ? '1' : '0';
        Promise.all([
            ...desligadas.map(b => associarSincronizarConta(Number(b.dataset.id), false)),
            associarSincronizarConta(Number(btn.dataset.id), ligar),
        ]).then(() => carregarRevisaoPluggy());
        _atualizarBotaoSincronizarPluggy();
    };
    _atualizarBotaoSincronizarPluggy();
}

/** "Sincronizar" só habilita com pelo menos uma conta escolhida acima. */
function _atualizarBotaoSincronizarPluggy() {
    const btn = document.getElementById('btnSincronizarPluggy');
    if (!btn || btn.dataset.ocupado) return; // sincronizando: quem termina reavalia
    const algumaEscolhida = !!document.querySelector('#pluggyContasSync .pluggy-conta-sync.active');
    btn.disabled = !algumaEscolhida;
    btn.title = algumaEscolhida ? '' : 'Escolha pelo menos uma conta pra sincronizar';
}

/** Card de uma conta conectada (grupo "Conectadas"/"Desconectadas"). */
function gerarHTMLContaPluggy(c) {
    const metodos = (estadoApp.menus && estadoApp.menus.metodos) || [];
    const desconectada = c.status === 'desconectado';
    const statusTag = c.status === 'erro' ? '<span class="pendente-badge">erro na conexão</span>' : '';
    const opcoesMetodo = metodos.map(m =>
        `<option value="${m.id}" ${c.metodo_id === m.id ? 'selected' : ''}>${rotuloMetodo(m)}</option>`
    ).join('');
    const ultimoSync = c.ultimo_sync
        ? `último sync: ${new Date(c.ultimo_sync).toLocaleString('pt-BR')}`
        : 'ainda não sincronizada';

    const saldoTxt = c.tipo_conta === 'BANK' && typeof c.saldo === 'number'
        ? `saldo: ${formatarMoeda(c.saldo)}` : '';

    // O nome padrão já leva banco, bandeira/nível e final do cartão — não
    // precisa de linha de detalhe nem de chip com o banco.
    return `
    <div class="menu-item ativo" data-conta-id="${c.id}">
        <div class="item-info">
            <div class="item-nome">${tituloContaPluggy(c)}
                ${statusTag}
            </div>
            <div class="item-descricao">${ultimoSync}</div>
            ${saldoTxt ? `<div class="item-descricao">${saldoTxt}</div>` : ''}
            <div class="item-descricao campo-metodo-conta">
                <label for="metodo-conta-${c.id}">Forma de pagamento:</label>
                <div class="campo-com-add campo-com-add--mini">
                    <select id="metodo-conta-${c.id}" data-act="metodo-conta" data-id="${c.id}">
                        <option value="">Selecione...</option>
                        ${opcoesMetodo}
                    </select>
                    <button type="button" class="btn-mini-add" data-act="add-metodo" title="Novo método">+</button>
                </div>
            </div>
        </div>
        <div class="item-actions">
            ${desconectada
                ? `<button class="btn-icon" data-act="reconectar-conta" data-id="${c.id}" title="Reconectar">🔌</button>`
                : `<button class="btn-icon btn-danger" data-act="desconectar-conta" data-id="${c.id}" title="Desconectar">🔌</button>`}
            <button class="btn-icon btn-danger" data-act="apagar-conta" data-id="${c.id}" title="Apagar" aria-label="Apagar">${ICONE_LIXEIRA}</button>
        </div>
    </div>`;
}

function onContasConectadasClick(e) {
    const btnAddMetodo = e.target.closest('[data-act="add-metodo"]');
    if (btnAddMetodo) {
        abrirNovoMetodo();
        return;
    }
    const btnDesconectar = e.target.closest('[data-act="desconectar-conta"]');
    if (btnDesconectar) {
        desconectarConta(Number(btnDesconectar.dataset.id));
        return;
    }
    const btnReconectar = e.target.closest('[data-act="reconectar-conta"]');
    if (btnReconectar) {
        reconectarConta(Number(btnReconectar.dataset.id));
        return;
    }
    const btnApagar = e.target.closest('[data-act="apagar-conta"]');
    if (btnApagar) {
        apagarConta(Number(btnApagar.dataset.id));
    }
}

function onContasConectadasChange(e) {
    const sel = e.target.closest('select[data-act="metodo-conta"]');
    if (sel) {
        associarMetodoConta(Number(sel.dataset.id), sel.value ? Number(sel.value) : null);
    }
}

async function associarSincronizarConta(contaId, sincronizar) {
    const { error } = await sb.from('pluggy_contas').update({ sincronizar }).eq('id', contaId);
    if (error) {
        console.error(error);
        mostrarNotificacao('Erro ao atualizar', 'erro');
    }
}

async function associarMetodoConta(contaId, metodoId) {
    const { error } = await sb.from('pluggy_contas').update({ metodo_id: metodoId }).eq('id', contaId);
    if (error) {
        console.error(error);
        mostrarNotificacao('Erro ao associar método', 'erro');
        return;
    }
    mostrarNotificacao('Método associado', 'sucesso');
}

/** "Desconectar": só para de sincronizar por aqui; não remove o item na Pluggy (v1). */
async function desconectarConta(contaId) {
    const { error } = await sb.from('pluggy_contas').update({ status: 'desconectado' }).eq('id', contaId);
    if (error) {
        console.error(error);
        mostrarNotificacao('Erro ao desconectar', 'erro');
        return;
    }
    mostrarNotificacao('Conta desconectada', 'sucesso');
    await carregarContasConectadas();
}

/** "Reconectar": volta a conta pro grupo "Conectadas" — mesmo botão de
 *  "Desconectar", que agora funciona como toggle em vez de sumir. */
async function reconectarConta(contaId) {
    const { error } = await sb.from('pluggy_contas').update({ status: 'ativo' }).eq('id', contaId);
    if (error) {
        console.error(error);
        mostrarNotificacao('Erro ao reconectar', 'erro');
        return;
    }
    mostrarNotificacao('Conta reconectada', 'sucesso');
    await carregarContasConectadas();
}

/** "Apagar": remove a conta de vez (diferente de desconectar). Bloqueado
 *  pelo backend se já houver transação confirmada vinda dela. */
function apagarConta(contaId) {
    mostrarDialogo({
        titulo: 'Apagar essa conta?',
        texto: 'Isso não pode ser desfeito.',
        acoes: [
            { label: 'Cancelar' },
            { label: 'Apagar', primario: true, perigo: true, onClick: async () => {
                try {
                    const { data, error } = await sb.functions.invoke('pluggy-excluir-conta', { body: { contaId } });
                    if (error) {
                        const detalhe = await error.context?.json?.().catch(() => null);
                        throw new Error(detalhe?.error || error.message);
                    }
                    if (data?.error) throw new Error(data.error);
                    mostrarNotificacao('Conta apagada', 'sucesso');
                    await carregarContasConectadas();
                } catch (e) {
                    console.error(e);
                    mostrarNotificacao(e.message || 'Erro ao apagar conta', 'erro');
                }
            } }
        ]
    });
}

/**
 * TELEGRAM — vínculo de conta pra receber avisos de lançamentos novos
 * (Importar > Pluggy > "Notificações"). O vínculo em si acontece do lado
 * do bot (usuário manda "/start CODIGO" no Telegram — ver
 * supabase/functions/telegram-webhook); aqui só geramos o código/link e
 * mostramos o status atual.
 */

async function carregarTelegramStatus() {
    const box = document.getElementById('pluggyTelegramBox');
    if (!box) return;

    const { data, error } = await sb.from('telegram_users').select('criado_em, chat_id').maybeSingle();
    if (error) {
        console.error(error);
        box.innerHTML = '<p class="empty-text">Erro ao verificar o Telegram</p>';
        return;
    }

    if (data) {
        // Telegram não dá o número de celular sem um passo extra (pedir pra
        // compartilhar contato) — usa o chat_id (o único identificador que
        // já temos) mascarado no mesmo estilo de "final do número", só pra
        // ajudar a reconhecer QUAL conta foi vinculada quando há dúvida.
        const idStr = String(data.chat_id);
        const mascara = '•'.repeat(Math.max(idStr.length - 3, 3)) + idStr.slice(-3);
        box.innerHTML = `
            <div class="pluggy-telegram-status">
                <p class="item-descricao">✅ Vinculado ao Telegram desde ${new Date(data.criado_em).toLocaleDateString('pt-BR')} (ID ${mascara})</p>
                <button type="button" class="mini-btn" id="btnDesvincularTelegram">Desvincular</button>
            </div>`;
    } else {
        box.innerHTML = `
            <p class="menu-hint">Receba avisos de lançamentos novos no Telegram, com botões pra confirmar ou ignorar na hora.</p>
            <button type="button" class="btn-submit" id="btnConectarTelegram">Conectar Telegram</button>`;
    }
}

async function onClickConectarTelegram() {
    const box = document.getElementById('pluggyTelegramBox');
    if (!box) return;
    box.innerHTML = '<p class="empty-text">Gerando link...</p>';
    try {
        const { data, error } = await sb.functions.invoke('telegram-gerar-codigo', { body: {} });
        if (error || !data?.link) throw error || new Error('Resposta sem link');
        box.innerHTML = `
            <p class="menu-hint">Abra esse link no Telegram (ou mande <b>/start ${data.codigo}</b> pro
                <a href="https://t.me/${data.botUsername}" target="_blank" rel="noopener">@${data.botUsername}</a>) —
                o código vale por 10 minutos.</p>
            <div class="pluggy-telegram-acoes">
                <a class="btn-submit pluggy-telegram-link" href="${data.link}" target="_blank" rel="noopener">Abrir no Telegram</a>
                <div class="pluggy-telegram-acoes-par">
                    <button type="button" class="mini-btn" id="btnJaVincleiTelegram">Já vinculei, atualizar</button>
                    <button type="button" class="mini-btn" id="btnConectarTelegram">🔁 Gerar outro código</button>
                </div>
            </div>`;
    } catch (e) {
        console.error(e);
        box.innerHTML = '<p class="empty-text">Erro ao gerar o link — tenta de novo</p>';
    }
}

async function onClickDesvincularTelegram() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const { error } = await sb.from('telegram_users').delete().eq('user_id', user.id);
    if (error) {
        console.error(error);
        mostrarNotificacao('Erro ao desvincular', 'erro');
        return;
    }
    mostrarNotificacao('Telegram desvinculado', 'sucesso');
    carregarTelegramStatus();
}

function onClickTelegramBox(e) {
    if (e.target.closest('#btnConectarTelegram')) { onClickConectarTelegram(); return; }
    if (e.target.closest('#btnDesvincularTelegram')) { onClickDesvincularTelegram(); return; }
    if (e.target.closest('#btnJaVincleiTelegram')) { carregarTelegramStatus(); }
}

/** Chamado ao entrar na sub-aba "Pluggy" de Importar (ver menus-ui.js). */
function iniciarPluggy() {
    document.getElementById('btnPluggyCred')?.addEventListener('click', () => { if (typeof alternarPluggyCredPainel === 'function') alternarPluggyCredPainel(); });
    if (typeof iniciarPluggyCredenciais === 'function') iniciarPluggyCredenciais();
    if (typeof carregarPluggyCredStatus === 'function') carregarPluggyCredStatus();
    document.getElementById('btnConectarPluggy')?.addEventListener('click', conectarContaPluggy);
    const btnSaldo = document.getElementById('btnSaldoContas');
    if (btnSaldo) {
        const pintar = () => {
            const on = saldoContasLigado();
            btnSaldo.classList.toggle('ligado', on);
            btnSaldo.setAttribute('aria-checked', String(on));
            btnSaldo.textContent = '💰 Saldo em contas: ' + (on ? 'ligado' : 'desligado');
        };
        pintar();
        btnSaldo.addEventListener('click', () => {
            try { localStorage.setItem('ctrlfin_saldo_contas', saldoContasLigado() ? '0' : '1'); } catch (_) {}
            pintar();
            if (typeof atualizarResumo === 'function') atualizarResumo();
        });
    }
    document.getElementById('btnSincronizarPluggy')?.addEventListener('click', sincronizarPluggyAgora);
    const btnLimpar = document.getElementById('btnLimparRevisaoPluggy');
    if (btnLimpar) btnLimpar.addEventListener('click', onClickLimparRevisaoPluggy);
    document.querySelector('.pluggy-rendimentos')?.addEventListener('click', onClickRendimentosPluggy);
    _preencherSeletorSyncPluggy();
    document.getElementById('syncMesPluggy')?.addEventListener('change', onChangeSyncMesPluggy);
    document.getElementById('syncAnoMenos')?.addEventListener('click', () => onClickSyncAnoPluggy(-1));
    document.getElementById('syncAnoMais')?.addEventListener('click', () => onClickSyncAnoPluggy(1));
    document.getElementById('pluggyTelegramBox')?.addEventListener('click', onClickTelegramBox);
    carregarContasConectadas();
    carregarTelegramStatus();
    carregarRevisaoPluggy();
}
