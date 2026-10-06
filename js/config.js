/**
 * CONFIGURAÇÕES E CONSTANTES
 * Valores imutáveis do sistema
 */

// ===== Supabase =====
// Banco de dados (substitui o Google Apps Script + Google Sheets).
// A chave abaixo é a "publishable key" (role anon) — pode ficar no front-end.
// O acesso é controlado por RLS no Supabase (ver supabase/schema.sql).
const SUPABASE_URL = 'https://hhmuqgkabknquvhxafmf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_TBLXpqgQRkHgaRFGDL17uA_KOkc_Q_F';

// Cliente global (supabase-js carregado via <script> no index.html)
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Contador de escritas em `transacoes`: cada insert/update/delete/upsert (de qualquer tela) soma 1. Quem guarda cache do que leu
// (ex.: Pendências) compara esse número para saber se precisa reler do banco.
window._transacoesVersao = 0;
(() => {
    const original = sb.from.bind(sb);
    sb.from = tabela => {
        const consulta = original(tabela);
        if (tabela === 'transacoes') {
            ['insert', 'update', 'delete', 'upsert'].forEach(metodo => {
                const f = consulta[metodo].bind(consulta);
                consulta[metodo] = (...args) => { window._transacoesVersao++; return f(...args); };
            });
        }
        return consulta;
    };
})();

// Categorias de receita fixas (não podem ser removidas) — "Estorno" é um
// valor que volta na fatura do cartão de crédito (daí só aceitar Método de
// Crédito), "Reembolso" é um valor que volta via Pix/transferência (daí só
// aceitar Método PIX/Débito), "Dinheiro" é uma categoria fixa simples (sem
// restrição de método).
const CATEGORIA_ESTORNO = 'Estorno';
const CATEGORIA_REEMBOLSO = 'Reembolso';
const CATEGORIA_DINHEIRO_RECEITA = 'Dinheiro';

// Categorias padrão (fallback)
const CATEGORIAS_PADRAO = {
  entradas: [
    'Salário',
    'Bônus',
    '13º',
    'PL',
    'Freelance',
    CATEGORIA_ESTORNO,
    CATEGORIA_REEMBOLSO,
    CATEGORIA_DINHEIRO_RECEITA
  ],
  saidas: [
    'Alimentação',
    'Alimentação app',
    'Assinaturas',
    'Contas',
    'Compras',
    'Compras online',
    'Lazer',
    'Mercado',
    'Saúde',
    'Serviços',
    'Transporte app',
    'Transporte'
  ]
};

// Cores para o gráfico

// Paleta dos "chips" (métodos / categorias / recorrências).
// Se o item não tiver cor escolhida, sugere-se uma da paleta de forma estável pelo nome.
const PALETA_CHIPS = [
    '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16', '#22C55E',
    '#10B981', '#14B8A6', '#06B6D4', '#0EA5E9', '#3B82F6', '#6366F1',
    '#8B5CF6', '#A855F7', '#D946EF', '#EC4899', '#F43F5E', '#64748B'
];

/** Cor sugerida (estável) para um nome, quando o usuário não escolheu uma */
function corPadraoChip(nome) {
    let h = 0;
    const s = String(nome || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return PALETA_CHIPS[h % PALETA_CHIPS.length];
}

/** Cor efetiva de um item de menu (escolhida ou sugerida) */
function corDoItemMenu(item) {
    return (item && item.cor) || corPadraoChip(item && item.nome);
}

/** Cor do chip de uma categoria. Receita e despesa têm cada uma a sua (o mesmo nome pode existir nos dois). */
function corDaCategoria(nome, tipo) {
    const c = (typeof estadoApp !== 'undefined' && estadoApp.menus && estadoApp.menus.cores) || {};
    const ehReceita = tipo === 'entradas' || tipo === 'entrada';
    const mapa = (ehReceita ? c.categoriaReceita : c.categoriaDespesa) || {};
    return mapa[nome] || (c.categoria || {})[nome] || corPadraoChip(nome);
}

// Temas de cores para balanço
const TEMAS_BALANCO = {
  negativo: {
    bg: 'var(--despesa-bg)',
    border: 'var(--despesa-border)',
    color: 'var(--despesa-text)'
  },
  positivo: {
    bg: 'var(--receita-bg)',
    border: 'var(--receita-border)',
    color: 'var(--receita-text)'
  },
  neutro: {
    bg: 'var(--balanco-bg)',
    border: 'var(--balanco-border)',
    color: 'var(--balanco-text)'
  }
};

// Seletores do DOM (centralizados)
const SELECTORS = {
  // Resumo
  totalEntradas: '#totalEntradas',
  totalSaidas: '#totalSaidas',
  balanco: '#balanco',
  
  // Abas
  tabButtons: '.tab-btn',
  tabContents: '.tab-content',
  
  // Tipo
  tipoButtons: '.tipo-btn',
  tipoTransacao: '#tipoTransacao',
  
  // Listas
  entradasLista: '#entradasLista',
  saidasLista: '#saidasLista',
  proximasLista: '#proximasLista',
  menusContainer: '#menusContainer',
  
  // Formulário
  formTransacao: '#formTransacao',
  data: '#data',
  valor: '#valor',
  metodo: '#metodo',
  categoria: '#categoria',
  formaPagamento: '#formaPagamento',
  parceleGroup: '#parceleGroup',
  descricao: '#descricao',
  categoriaSugestoes: '#categoriaSugestoes'
};

// Configurações de UI
const CONFIG = {
  NOTIFICACAO_DURACAO: 3000,
  ANIMACAO_DURACAO: 300,
  DIAS_PROXIMOS: 30
};

/** Módulos que só são baixados quando alguém usa a tela (Documentação, Visão anual, Dados, Open Finance): o carregamento inicial fica menor.
 *  No site publicado, window.__modulos (gerado pelo build) diz o arquivo de cada um; no desenvolvimento, é js/<nome>.js. */
const _modulosCarregados = {};
/** Telas que também têm CSS próprio (css/<nome>.css), baixado junto com o módulo: o texto fica pronto antes de a tela ser desenhada. */
const _MODULOS_COM_CSS = ['anual', 'docs'];

function carregarModulo(nome) {
    if (!_modulosCarregados[nome]) {
        const css = !_MODULOS_COM_CSS.includes(nome) ? Promise.resolve() : new Promise(ok => {
            const l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = (window.__modulos && window.__modulos['css:' + nome]) || `css/${nome}.css`;
            l.onload = l.onerror = () => ok(); // sem o CSS a tela ainda funciona (só fica sem o visual)
            document.head.appendChild(l);
        });
        _modulosCarregados[nome] = new Promise((ok, falhou) => {
            const s = document.createElement('script');
            s.src = (window.__modulos && window.__modulos[nome]) || `js/${nome}.js`;
            s.onload = () => css.then(ok);
            s.onerror = () => { delete _modulosCarregados[nome]; falhou(new Error(`Não consegui carregar o módulo "${nome}"`)); };
            document.head.appendChild(s);
        });
    }
    return _modulosCarregados[nome];
}
