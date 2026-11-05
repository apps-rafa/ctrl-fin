/**
 * REGRAS DE CATEGORIZAÇÃO AUTOMÁTICA (Configurações > Categorias)
 * Mostra, só para leitura, as palavras que fazem o app e o bot sugerirem cada categoria.
 * As listas valem de verdade nos arquivos citados abaixo; esta cópia existe só para exibir e é
 * conferida contra eles por tests/regras-categoria.test.mjs (se uma lista mudar e esta não, o teste falha).
 *   cartao   = compras do cartão/banco (Open Finance): supabase/functions/pluggy-sync, pluggy-webhook e js/pluggy.js
 *   telegram = texto digitado no bot: supabase/functions/telegram-webhook/parser.ts
 */
const REGRAS_CATEGORIA = [
    // ----- Despesas -----
    { fonte: 'cartao', categoria: 'Saúde', padrao: 'drogaria|farm[aá]cia|droga ?raia|pacheco|pague ?menos' },
    { fonte: 'cartao', categoria: 'Saúde', padrao: 'hospital|cl[ií]nica|laborat[oó]rio|dentista|odont' },
    { fonte: 'cartao', categoria: 'Saúde', padrao: 'academia|smart ?fit|bodytech|bio ?ritmo' },
    { fonte: 'cartao', categoria: 'Mercado', padrao: 'supermercado|hortifruti|atacad[ãa]o|carrefour|extra|p[ãa]o de a[çc][uú]car|assa[íi]' },
    { fonte: 'cartao', categoria: 'Alimentação', padrao: 'restaurante|lanchonete|padaria|pizzaria|churrascaria' },
    { fonte: 'cartao', categoria: 'Alimentação', padrao: 'ifood|rappi|mcdonalds|burger king|habib|subway' },
    { fonte: 'cartao', categoria: 'Transporte app', padrao: 'uber|99app|99pop' },
    { fonte: 'cartao', categoria: 'Transporte', padrao: 't[áa]xi' },
    { fonte: 'cartao', categoria: 'Transporte', padrao: 'posto|ipiranga|shell|petrobras|ale combust' },
    { fonte: 'cartao', categoria: 'Transporte', padrao: 'estacionamento|zona azul' },
    { fonte: 'cartao', categoria: 'Lazer', padrao: 'netflix|spotify|disney|amazon prime|hbo|paramount' },
    { fonte: 'cartao', categoria: 'Lazer', padrao: 'cinema|cinemark|teatro' },
    { fonte: 'cartao', categoria: 'Educação', padrao: 'escola|faculdade|universidade|udemy|alura' },
    { fonte: 'cartao', categoria: 'Casa', padrao: 'condom[ií]nio|imobili[aá]ria|aluguel' },
    { fonte: 'cartao', categoria: 'Casa', padrao: 'cemig|light sa|enel|sabesp|copasa|eletropaulo' },

    { fonte: 'telegram', categoria: 'Saúde', padrao: 'drogaria|farm[aá]cia|droga ?raia|pacheco|pague ?menos|rem[eé]dio' },
    { fonte: 'telegram', categoria: 'Saúde', padrao: 'hospital|cl[ií]nica|laborat[oó]rio|dentista|odont|m[eé]dico|consulta' },
    { fonte: 'telegram', categoria: 'Saúde', padrao: 'academia|smart ?fit|bodytech|bio ?ritmo' },
    { fonte: 'telegram', categoria: 'Mercado', padrao: 'supermercado|hortifruti|atacad[ãa]o|carrefour|extra|p[ãa]o de a[çc][uú]car|assa[íi]|mercado|feira' },
    { fonte: 'telegram', categoria: 'Alimentação', padrao: 'restaurante|lanchonete|padaria|pizzaria|churrascaria|almo[çc]o|janta|comida' },
    { fonte: 'telegram', categoria: 'Alimentação', padrao: 'ifood|rappi|mcdonalds|burger king|habib|subway' },
    { fonte: 'telegram', categoria: 'Transporte app', padrao: 'uber|99app|99pop' },
    { fonte: 'telegram', categoria: 'Transporte', padrao: 't[áa]xi|[oô]nibus|metr[oô]' },
    { fonte: 'telegram', categoria: 'Transporte', padrao: 'posto|ipiranga|shell|petrobras|ale combust|gasolina' },
    { fonte: 'telegram', categoria: 'Transporte', padrao: 'estacionamento|zona azul' },
    { fonte: 'telegram', categoria: 'Assinaturas', padrao: 'netflix|spotify|disney|amazon prime|hbo|paramount|assinatura' },
    { fonte: 'telegram', categoria: 'Lazer', padrao: 'cinema|cinemark|teatro|show|festa|balada' },
    { fonte: 'telegram', categoria: 'Educação', padrao: 'escola|faculdade|universidade|udemy|alura|curso' },
    { fonte: 'telegram', categoria: 'Casa', padrao: 'condom[ií]nio|imobili[aá]ria|aluguel|luz|[aá]gua|g[aá]s\\b|internet\\b' },
    // ----- Receitas (só no bot) -----
    { fonte: 'telegram', categoria: 'Salário', padrao: 'sal[aá]rio|sal[aá]rios' },
    { fonte: 'telegram', categoria: 'Venda', padrao: '\\bvend(i|eu|emos|eram|er|a|as)\\b|revend', mostrar: 'vendi, vendeu, vendemos, venderam, vender, venda, vendas, revenda' },
    { fonte: 'telegram', categoria: 'Bônus', padrao: '\\bb[oô]nus\\b|\\bpremia[çc][aã]o\\b' },
    { fonte: 'telegram', categoria: 'Freelance', padrao: '\\bfreela|\\bfreelance\\b', mostrar: 'freela, freelance' },
    { fonte: 'telegram', categoria: 'Racha', padrao: '\\bracha|\\brachei|\\bracharam|\\bdividi|\\bdividiram', mostrar: 'racha, rachei, racharam, dividi, dividiram' },
    { fonte: 'telegram', categoria: 'Estorno', padrao: 'estorn' },
    { fonte: 'telegram', categoria: 'Reembolso', padrao: 'reembols' },
];

/** Categorias de receita: o resto é despesa. */
const REGRAS_CATEGORIAS_RECEITA = ['Salário', 'Venda', 'Bônus', 'Freelance', 'Racha', 'Estorno', 'Reembolso'];

/** "p[ãa]o de a[çc][uú]car" -> "pão de açúcar": de cada [xy] fica a letra acentuada; "droga ?raia" -> "droga raia". */
function _palavrasDaRegra(regra) {
    if (regra.mostrar) return regra.mostrar.split(', ');
    return regra.padrao.split('|').map(alt => alt
        .replace(/\\b/g, '')
        .replace(/\[([^\]]+)\]/g, (_m, letras) => [...letras].find(c => c.normalize('NFD') !== c) || letras[0])
        .replace(/ \?/g, ' ')
        .replace(/\?/g, ''));
}

function _escRegras(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** Monta o HTML da tabela: uma linha por categoria, com as palavras do cartão e as do bot lado a lado. */
function htmlTabelaRegrasCategoria() {
    const porCategoria = new Map();
    REGRAS_CATEGORIA.forEach(r => {
        if (!porCategoria.has(r.categoria)) porCategoria.set(r.categoria, { cartao: [], telegram: [] });
        porCategoria.get(r.categoria)[r.fonte].push(..._palavrasDaRegra(r));
    });
    const linha = ([categoria, p]) => {
        const lista = palavras => palavras.length
            ? palavras.map(w => `<span class="regra-palavra">${_escRegras(w)}</span>`).join(' ')
            : '<span class="regra-nada">—</span>';
        return `<div class="regra-linha">
            <div class="regra-cat">${_escRegras(categoria)}</div>
            <div class="regra-col"><span class="regra-col-tit">💳 Cartão / banco</span>${lista(p.cartao)}</div>
            <div class="regra-col"><span class="regra-col-tit">🤖 Bot (texto)</span>${lista(p.telegram)}</div>
        </div>`;
    };
    const todas = [...porCategoria.entries()];
    const bloco = (titulo, itens) => itens.length ? `<h4 class="regra-grupo">${titulo}</h4>${itens.map(linha).join('')}` : '';
    return `
        <p class="menu-hint">
            O app só sugere uma categoria que <b>exista no seu cadastro</b>; se não existir, a sugestão é ignorada.
            Em todos os casos você pode trocar antes de confirmar.
        </p>
        <ol class="regra-passos">
            <li><b>💳 Compras do cartão/banco</b> (Open Finance): 1) a categoria que você já usou antes para essa mesma descrição; 2) categoria com o mesmo nome da descrição do banco; 3) as palavras abaixo, no nome do estabelecimento; 4) a categoria da própria Pluggy, traduzida. Sem nenhuma, fica em branco para você escolher.</li>
            <li><b>🤖 Texto no bot</b>: 1) o nome de uma categoria sua citado no texto (a mais específica); 2) as palavras abaixo; 3) "Outros" (ou a 1ª categoria do tipo, se não houver "Outros").</li>
        </ol>
        ${bloco('Despesas', todas.filter(([c]) => !REGRAS_CATEGORIAS_RECEITA.includes(c)))}
        ${bloco('Receitas (só no bot)', todas.filter(([c]) => REGRAS_CATEGORIAS_RECEITA.includes(c)))}`;
}

/** Desenha a tabela dentro do <details> na primeira vez que ele é aberto. */
function iniciarRegrasCategoria() {
    const det = document.getElementById('regrasCatDetalhes');
    const corpo = document.getElementById('regrasCatCorpo');
    if (!det || !corpo) return;
    const desenhar = () => { if (!corpo.dataset.pronto) { corpo.innerHTML = htmlTabelaRegrasCategoria(); corpo.dataset.pronto = '1'; } };
    if (det.open) desenhar();
    det.addEventListener('toggle', () => { if (det.open) desenhar(); });
}
