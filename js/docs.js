/**
 * DOCUMENTAÇÃO — página própria (#docs, link "Documentação" no rodapé).
 *
 * IMPORTANTE: este arquivo é a fonte da documentação do app. Sempre que uma funcionalidade
 * for criada, mudada ou removida, atualize o item correspondente aqui (mesmo PR).
 *
 * Formato: cada seção tem vários itens { t: título, r: resumo (sempre visível), m: complemento (HTML,
 * abre/fecha em "Ler mais") }. Só HTML simples nos textos (b, em, ul/li, br).
 */

const DOCS_SECOES = [
  {
    id: 'inicio', emoji: '🚀', titulo: 'Primeiros passos',
    itens: [
      { t: 'O que é o Ctrl Fin', r: 'Controle financeiro pessoal: você lança receitas e despesas, acompanha o mês, o cartão de crédito e o ano inteiro.',
        m: 'Tudo fica salvo na sua conta (login por e-mail). Você pode lançar pelo app, por mensagem no Telegram e importando movimentações do banco (Open Finance). O app funciona no computador e no celular.' },
      { t: 'Modo teste', r: 'Dá pra experimentar sem criar conta: os dados ficam só de teste e podem ser apagados no botão "Apagar tudo".',
        m: 'No modo teste aparece a etiqueta 🧪 no topo. Nada que você fizer ali vai para uma conta real.' },
      { t: 'Tema claro/escuro e esconder valores', r: 'A 🌙 troca o tema; o 👁 esconde os valores do dashboard (útil em público).',
        m: 'O tema escolhido fica lembrado neste aparelho. Com os valores escondidos, o dashboard e a visão anual mostram "••••" no lugar dos números.' },
      { t: 'Cabeçalho', r: 'Título, 📈 Visão anual, 🌙 tema e 🚪 sair. Abaixo, a barra de meses e o ⚙️ Configurações.',
        m: 'O ⚙️ e o 📈 funcionam como interruptores: clicar de novo fecha a tela e volta para onde você estava.' },
    ],
  },
  {
    id: 'mes', emoji: '📆', titulo: 'Mês e dashboard',
    itens: [
      { t: 'Barra de meses', r: 'Escolha o mês que quer ver; tudo no app (dashboard, listas, próximos) acompanha esse mês.',
        m: 'As setas ▲ rolam os meses; o botão 🏠 volta ao mês atual. O mês de um lançamento é a sua <b>competência</b> (para cartão de crédito, o mês da fatura — veja "Cartão de crédito e faturas"). Pontinhos indicam meses com lançamentos.' },
      { t: 'Card de Receita', r: 'Mostra o que já entrou (atual) e o que ainda vai entrar (a receber), com o total do mês.',
        m: '"Atual" = receitas com data até hoje; "a receber" = receitas com data futura. Clicar no card abre a lista de Receitas. Estornos de cartão <b>não</b> entram aqui (abatem a fatura).' },
      { t: 'Card de Despesa', r: 'Mostra o que já foi pago e o que ainda falta pagar no mês, seguindo o caminho do dinheiro.',
        m: '<ul><li><b>pago</b>: PIX/dinheiro com data até hoje + faturas de cartão já vencidas ou marcadas como pagas. Embaixo, a quebra "pix X + crédito Y".</li><li><b>a pagar</b>: lançamentos futuros + faturas de cartão em aberto. Embaixo, "pendentes X + crédito Y".</li></ul>Se o texto ficar comprido, ele se abrevia sozinho ("pend.", "créd.", "c.c.") e, no extremo, mostra só os valores. Clicar no card abre a lista de Despesas.' },
      { t: 'Balanço e gasto diário', r: 'Balanço = receitas − despesas do mês. Gasto diário = quanto ainda pode gastar por dia até o fim do mês.',
        m: 'O gasto diário divide o balanço pelos dias que restam no mês (contando hoje).' },
      { t: 'Mini-resumo ao rolar', r: 'Ao rolar a página, os totais ficam numa faixa compacta no topo, com atalhos para + Lançamento, Próximos e Lixeira.',
        m: 'Assim você não perde os números nem os atalhos enquanto navega nas listas.' },
      { t: 'Saldo em contas', r: 'Com Open Finance conectado, mostra o saldo atual das suas contas bancárias, logo abaixo do calendário.',
        m: 'É o saldo de hoje no banco (não depende do mês escolhido). Toque para ver o detalhe por conta.' },
    ],
  },
  {
    id: 'lancar', emoji: '➕', titulo: 'Lançar, editar e excluir',
    itens: [
      { t: '+ Lançamento', r: 'Escolha Receita ou Despesa, preencha data (dd/mm), valor, categoria e, na despesa, a forma de pagamento.',
        m: 'A descrição é opcional. O botão "+" ao lado de categoria e forma de pagamento cria uma nova na hora. Trocar entre Receita e Despesa limpa o formulário (fora da edição).' },
      { t: 'Receita: sem forma de pagamento', r: 'Receita não pede forma de pagamento; o "Reembolso" é uma receita comum.',
        m: 'O dinheiro que você recebe cai na conta, então não há o que escolher. Receitas antigas que tinham forma (ex.: PIX) continuam funcionando; o chip da forma fica escondido nas receitas.' },
      { t: 'Despesa no cartão de crédito', r: 'No crédito aparecem "Mês" (fatura) e "Parcelas". Parcelas 1x = compra à vista.',
        m: 'O <b>Mês</b> é calculado pela data da compra e pelo fechamento do cartão (compra no dia do fechamento ou depois cai na fatura seguinte) e você pode ajustar. Com mais de 1 parcela, o app cria uma linha por mês (centavos distribuídos), todas ligadas ao mesmo parcelamento; o valor total aparece ao lado.' },
      { t: 'Estorno', r: 'Estorno é uma categoria de Despesa, só para cartão de crédito: abate o valor da fatura.',
        m: 'Ao escolher a categoria <b>Estorno</b>, só os cartões de crédito ficam disponíveis, aparece o mês da fatura e some o parcelamento. Por dentro ele é gravado como crédito no cartão, então dashboard, fatura e visão anual continuam corretos. A categoria só existe a partir do primeiro cartão cadastrado e é fixa (não dá para renomear, desativar nem remover).' },
      { t: 'Editar e excluir', r: 'Toque num lançamento para editar; ao salvar você volta para a tela em que estava.',
        m: 'Se o lançamento veio da busca ou dos Recém-lançados, a busca volta exatamente como estava. Parcelas que não são a primeira abrem o lançamento original (o parcelamento é editado nele). Excluir manda para a Lixeira.' },
      { t: 'Parcelamento: quitar', r: 'Em uma parcela, o marcador "quitar" encerra o parcelamento a partir daquele mês.',
        m: 'As parcelas dali em diante deixam de contar. Cada parcela mostra "k/n" (ex.: 3/12) e o valor da parcela / valor total da compra.' },
      { t: 'Duplicatas', r: 'Quando o app percebe lançamentos parecidos, mostra um grupo "Duplicatas" acima da lista para você revisar.',
        m: 'Compara valor, data, categoria e descrição normalizados. Serve para achar um lançamento repetido (ex.: importado do banco e digitado à mão).' },
    ],
  },
  {
    id: 'listas', emoji: '🗂️', titulo: 'Listas de Receitas e Despesas',
    itens: [
      { t: 'Grupos da Receita', r: 'Atual (já recebido) e A receber (data futura), com barra proporcional no topo.',
        m: 'Cada grupo mostra contagem, total e % do total de receitas. Clique na barra para abrir/fechar o grupo correspondente.' },
      { t: 'Grupos da Despesa', r: 'Pago e A pagar, seguindo o caminho do dinheiro; cada cartão tem sua própria "Fatura" dentro.',
        m: '<ul><li><b>Pago</b>: PIX/dinheiro até hoje + faturas pagas.</li><li><b>A pagar</b>: faturas em aberto (compras já feitas) + o que ainda não aconteceu, inclusive compra de cartão futura, agrupada em "Crédito".</li></ul>Dentro de cada grupo os lançamentos se dividem em subgrupos por forma de pagamento, cada um com contagem, total e %.' },
      { t: 'Fatura do cartão', r: 'Subgrupo "Fatura <cartão>" com o box de vencimento, o botão "paga" e as compras do cartão.',
        m: 'O botão <b>paga</b> marca/desmarca a fatura como paga. Ela é marcada automaticamente pelo vencimento (vencida = paga, riscada), mas você pode alterar à mão e isso vale mais que a data. O vencimento cai em dia útil. Estornos aparecem dentro da fatura com "+".' },
      { t: 'Filtros: Categoria e Forma de pgto.', r: 'O funil dentro de cada grupo reorganiza os itens por categoria ou por forma de pagamento.',
        m: 'Na Despesa é possível filtrar por categoria; na Receita, também. O chip que já é igual ao do filtro some (sem repetição), inclusive filtro dentro de filtro. Nas Receitas não há filtro por forma de pagamento.' },
      { t: 'Carregar mais', r: 'Grupos longos mostram 5 itens por vez; "Carregar mais 5" abre mais, com o "restam X" ao lado.',
        m: 'O limite vale para cada grupo e subgrupo e é reaplicado quando a lista muda.' },
      { t: 'Chips', r: 'Cada lançamento mostra chips coloridos: categoria e (na despesa) forma de pagamento. O texto tem contorno para ler bem em cores claras.',
        m: 'Chips redundantes são escondidos. No subgrupo genérico "Crédito" (que reúne vários cartões) o chip do cartão é mostrado.' },
    ],
  },
  {
    id: 'cartao', emoji: '💳', titulo: 'Cartão de crédito e faturas',
    itens: [
      { t: 'Competência (mês da fatura)', r: 'Uma compra no crédito pertence ao mês da fatura, não ao mês da data da compra.',
        m: 'Regra: compra no dia do fechamento ou depois cai na fatura do mês seguinte. O fechamento e o vencimento são configurados em Configurações > Formas de pgto.' },
      { t: 'Fatura em aberto x paga', r: 'Fatura em aberto entra em "a pagar"; fatura paga (ou vencida) entra em "pago".',
        m: 'Só contam as compras já feitas (data até hoje); compras futuras do cartão ficam soltas em "A pagar" até chegarem. A marcação automática usa o vencimento; a manual prevalece e é guardada.' },
      { t: 'Cartão desativado', r: 'Cartão inativo não tem fatura nos meses depois de desativado, mas mantém a dos meses em que foi usado.',
        m: 'A cor do cartão é retroativa (vale para todos os lançamentos antigos).' },
      { t: 'Estorno na fatura', r: 'O estorno reduz o total da fatura e aparece dentro dela, com "+".',
        m: 'Também aparece na busca, em Despesas. Nos totais de Receita ele não conta.' },
    ],
  },
  {
    id: 'proximos', emoji: '⏰', titulo: 'Próximos',
    itens: [
      { t: 'O que aparece', r: 'O que ainda vai acontecer no mês: receitas a receber e despesas (faturas em aberto + lançamentos futuros).',
        m: 'A fatura de cada cartão aparece igual a "A pagar": subgrupo com vencimento, botão "paga" e as compras. O total e a contagem da Despesa incluem as faturas em aberto.' },
    ],
  },
  {
    id: 'busca', emoji: '🔎', titulo: 'Busca e Recém-lançados',
    itens: [
      { t: 'Busca universal', r: 'Procura em todo o app, de qualquer tela, no mês em exibição; resultado separado em Receitas e Despesas.',
        m: 'Aceita dicas: <em>&gt;100</em> (maior que), <em>&lt;50</em>, <em>100-200</em> (faixa), um ano (<em>2026</em>), mês (<em>jan</em>) e frases exatas entre aspas. "Buscar em todos os meses" amplia para o histórico inteiro. Estornos de cartão aparecem em Despesas, com "+".' },
      { t: 'Recém-lançados', r: 'Os últimos lançamentos criados, de qualquer mês, 5 por vez.',
        m: 'Útil para conferir o que acabou de entrar (inclusive pelo Telegram ou pelo banco) e corrigir rápido.' },
    ],
  },
  {
    id: 'lixeira', emoji: '🗑️', titulo: 'Lixeira',
    itens: [
      { t: 'Excluídos por 30 dias', r: 'Lançamentos excluídos ficam na lixeira por 30 dias; dá para restaurar. Depois somem de vez.',
        m: 'A lixeira também tem busca e "Carregar mais 5".' },
    ],
  },
  {
    id: 'anual', emoji: '📈', titulo: 'Visão anual',
    itens: [
      { t: 'Abrir a visão anual', r: 'Botão 📈 no cabeçalho: uma página que compara mês a mês o ano inteiro.',
        m: 'Ao abrir, o resto do app se esconde; clicar no 📈 de novo volta. As setas ◂ ▸ trocam o ano.' },
      { t: 'Agrupar por Categoria ou Forma de pgto.', r: 'Escolha como enxergar o ano: por categoria (🏷️) ou por forma de pagamento (💳).',
        m: 'Cada categoria/forma tem a sua cor (a mesma escolhida em Configurações; receita e despesa têm cores próprias).' },
      { t: 'Cartões-resumo', r: 'No topo, quatro cartões: receitas no ano, despesas no ano, saldo do ano e despesa média por mês.',
        m: 'Ao focar num mês, os cartões mostram as receitas, as despesas e o saldo daquele mês e a variação da despesa em relação ao mês anterior. Verde é bom e vermelho é ruim, conforme o tipo (mais receita é bom; mais despesa é ruim).' },
      { t: 'Gráfico e tabela', r: 'O gráfico é a primeira linha da tabela: duas barras por mês (receita e despesa), empilhadas por categoria/forma.',
        m: 'Meses passados sem lançamentos não aparecem; os futuros aparecem para planejamento. Cada linha da tabela mostra o valor por mês e o total do ano, com intensidade de cor proporcional ao valor. <b>Ordem</b>: as linhas seguem o maior total do ano; ao focar num mês, seguem o maior valor daquele mês. Em cada barra do gráfico, o maior valor do mês fica na base.' },
      { t: 'Filtrar uma linha', r: 'Toque no nome de uma categoria/forma para ver só ela; toque de novo para voltar.',
        m: 'O filtro vale para cartões, gráfico e tabela.' },
      { t: 'Focar num mês', r: 'Toque no nome de um mês para destacá-lo nos cartões, no gráfico e na tabela.',
        m: 'Aparece um botão "Mês ✕" para voltar a ver o ano todo.' },
      { t: 'Comparar meses', r: '"⇄ Comparar meses" põe dois meses lado a lado (A e B), com a diferença e a variação em %; o ⇅ inverte A e B.',
        m: 'Mostra receitas e despesas separadas, ordenadas pela maior diferença.' },
      { t: 'Estornos no ano', r: 'Estornos de cartão abatem a despesa (por forma) ou viram a linha "(−) Estornos no cartão" (por categoria).',
        m: 'É a mesma regra do dashboard: o estorno não conta como receita.' },
      { t: 'Esconder valores', r: 'O botão 👁 da página esconde os números (••••).', m: 'Vale só para a visão anual/dashboard neste aparelho.' },
    ],
  },
  {
    id: 'config', emoji: '⚙️', titulo: 'Configurações',
    itens: [
      { t: 'Categorias', r: 'Categorias de Receita e de Despesa: criar, renomear, reordenar (▲▼), ordenar A→Z, ativar/desativar, remover e trocar a cor.',
        m: 'Receita e Despesa são listas separadas (o mesmo nome pode existir nas duas, cada uma com a sua cor). Fixas: <b>Reembolso</b> e <b>Dinheiro</b> (Receita) e <b>Estorno</b> (Despesa, só aparece com cartão de crédito). Renomear uma categoria atualiza todos os lançamentos antigos.' },
      { t: 'Formas de pgto.', r: 'Cadastre PIX, Dinheiro e cartões de crédito (banco, dia de fechamento, dia de vencimento, melhor dia de compra).',
        m: 'O <b>melhor dia de compra</b> é sugerido a partir do fechamento. Desativar uma forma a tira dos formulários, mas ela continua valendo nos lançamentos antigos e mantém a cor. A ordem que você definir é a do dropdown do lançamento.' },
      { t: 'Cores', r: 'Toque na bolinha de cor de uma categoria ou forma para escolher a cor do chip.',
        m: 'A cor vale no app inteiro: listas, busca, barras, gráficos e visão anual — e é retroativa para lançamentos antigos.' },
      { t: 'Feriados', r: 'Feriados nacionais, estaduais (por UF) e municipais; servem para ajustar vencimentos ao dia útil.',
        m: 'Nacionais e estaduais oficiais não podem ser apagados, só desativados; "sincronizar" completa pela Nager.Date. Municipais e avulsos você cadastra.' },
      { t: 'Dados', r: 'Baixar backup (JSON), restaurar um backup e apagar dados por seleção.',
        m: 'Você escolhe o que entra (categorias, formas, feriados, lançamentos e quais meses). Apagar é irreversível — exige confirmação.' },
    ],
  },
  {
    id: 'openfinance', emoji: '🏦', titulo: 'Open Finance (Pluggy)',
    itens: [
      { t: 'Conectar contas', r: 'Conecte suas contas e cartões pela Pluggy para trazer as movimentações do banco.',
        m: 'Cada conexão vira contas que você pode sincronizar, reconectar, desconectar ou apagar.' },
      { t: 'Forma de pagamento da conta', r: 'Cada conta precisa estar ligada a uma forma de pagamento do app para sincronizar.',
        m: 'Sem essa ligação ("Selecione...") a sincronização é bloqueada, para nunca importar lançamentos sem forma. Escolha quais contas entram na sincronização.' },
      { t: 'Sincronizar e revisar', r: 'A sincronização traz as transações para uma fila de revisão; você confere, ajusta e importa.',
        m: 'Escolha o período (mês/ano). Na fila você pode editar categoria e descrição, ignorar itens, marcar prontos e importar. O app aprende as categorias que você usa para sugerir melhor e detecta duplicatas de lançamentos que você já tinha. Rendimentos e dividendos podem ser ignorados.' },
      { t: 'Histórico e ignoradas', r: 'O que já foi conciliado e o que foi ignorado ficam guardados, com opção de editar, excluir ou reativar.',
        m: 'Assim nada se perde e você pode voltar atrás numa decisão.' },
    ],
  },
  {
    id: 'telegram', emoji: '🤖', titulo: 'Bot do Telegram',
    itens: [
      { t: 'Vincular', r: 'Em Configurações > Notificações, gere o código e toque no link para vincular o bot à sua conta.',
        m: 'Depois de vinculado, o bot também avisa quando chega lançamento novo do banco e manda um backup semanal (domingo) e alertas de erro.' },
      { t: 'Lançar por mensagem', r: 'Escreva como falaria: "gastei 35,90 no mercado", "recebi 200 de salário", "comprei um carro de 80000 em 10x".',
        m: 'O bot entende valor, tipo, categoria (pelo texto), forma de pagamento (ex.: "no pix", "no nubank") e parcelas. Monta um rascunho e só grava após ✅ Confirmar. Qualquer outra resposta vira a <b>descrição</b>.' },
      { t: 'Datas no texto', r: 'Diga a data: "ontem uber 10 reais", "25/09 uber 10 reais", "25 de setembro", "dia 25". Sem data vale hoje.',
        m: 'Entende hoje, ontem, anteontem, dd/mm, dd/mm/aaaa, "25 de setembro" e "dia 25". Sem o ano, usa o ano atual (ou o anterior se a data ficaria muito no futuro). Também dá para digitar só a data com um rascunho aberto.' },
      { t: 'Botões do rascunho', r: 'Confirmar, Editar (abre o formulário), Cancelar, 💳 Forma de pgto., 🏷️ Categorias e 📅 Data.',
        m: 'Todo menu do bot fica no teclado, termina com ❌ Cancelar e não deixa item sozinho na última linha. 📅 Data oferece Hoje, Ontem e Anteontem (ou digite).' },
      { t: 'Estorno pelo bot', r: 'Diga "estorno 50 uber" ou escolha a categoria Estorno: o bot usa um cartão de crédito e abate a fatura.',
        m: 'A categoria Estorno só existe a partir do primeiro cartão. Nesse rascunho a forma de pagamento aceita só cartão de crédito e não há parcelas.' },
      { t: 'Comandos', r: '/resumo, /diario, /credito, /pix, /ultimos, /atualizar, /pgtopadrao, /lancamento e /backup.',
        m: '<ul><li><b>/resumo</b>: receitas, despesas e balanço do mês.</li><li><b>/diario</b>: quanto ainda pode gastar por dia.</li><li><b>/credito</b>: gasto por cartão e total.</li><li><b>/pix</b>: total no PIX, pago e a pagar.</li><li><b>/ultimos</b>: os 5 últimos lançamentos.</li><li><b>/atualizar</b>: pede dados novos ao banco e mostra as últimas transações; toque no número para lançar uma delas.</li><li><b>/pgtopadrao</b>: forma de pagamento usada quando a mensagem não diz qual.</li><li><b>/lancamento</b>: explica como lançar por mensagem.</li><li><b>/backup</b>: manda o backup agora.</li></ul>' },
    ],
  },
  {
    id: 'regras', emoji: '🧮', titulo: 'Regras de cálculo',
    itens: [
      { t: 'Realizado x futuro', r: 'Um lançamento é "realizado" quando a data é hoje ou anterior; depois disso é futuro.',
        m: 'Isso define "atual" x "a receber" na Receita e o que entra em "pago" x "a pagar" na Despesa.' },
      { t: 'Caminho do dinheiro (Despesa)', r: 'Pago = o que já saiu do bolso; a pagar = o que ainda vai sair.',
        m: 'Compra de cartão só sai do bolso quando a fatura é paga (vencida ou marcada). Por isso a compra no crédito aparece na fatura, e não em "pago", até lá.' },
      { t: 'Estorno e reembolso', r: 'Estorno (cartão) abate a fatura e não é receita; Reembolso é receita comum.',
        m: 'Estorno só em cartão de crédito; Reembolso não tem forma de pagamento.' },
      { t: 'Vencimento em dia útil', r: 'Vencimentos que caem em fim de semana ou feriado são levados para o dia útil.',
        m: 'Usa os feriados cadastrados em Configurações.' },
    ],
  },
];

/** Monta o HTML da página de documentação. */
function renderDocs(filtro = '') {
  const alvo = document.getElementById('docsConteudo');
  if (!alvo) return;
  const q = String(filtro || '').trim().toLowerCase();
  const texto = it => (it.t + ' ' + it.r + ' ' + it.m.replace(/<[^>]+>/g, ' ')).toLowerCase();
  const secoes = DOCS_SECOES
    .map(s => ({ ...s, itens: q ? s.itens.filter(it => texto(it).includes(q)) : s.itens }))
    .filter(s => s.itens.length);
  if (!secoes.length) { alvo.innerHTML = '<p class="empty-message">Nada encontrado.</p>'; return; }
  const indice = secoes.map(s => `<a href="#doc-${s.id}" data-doc-ancora="${s.id}">${s.emoji} ${s.titulo}</a>`).join('');
  alvo.innerHTML = `
    <nav class="docs-indice" aria-label="Seções">${indice}</nav>
    ${secoes.map(s => `
      <section class="docs-secao" id="doc-${s.id}">
        <h3>${s.emoji} ${s.titulo}</h3>
        ${s.itens.map(it => `
          <article class="doc-item">
            <h4>${it.t}</h4>
            <p>${it.r}</p>
            ${it.m ? `<button type="button" class="doc-mais" aria-expanded="false">Ler mais</button><div class="doc-extra" hidden>${it.m}</div>` : ''}
          </article>`).join('')}
      </section>`).join('')}`;
}

function iniciarDocs() {
  const linkRodape = document.getElementById('linkDocs');
  linkRodape?.addEventListener('click', e => { e.preventDefault(); if (typeof mudarAba === 'function') mudarAba('docs'); });
  document.getElementById('docsFechar')?.addEventListener('click', () => { if (typeof mudarAba === 'function') mudarAba('docs'); });
  const busca = document.getElementById('docsBusca');
  busca?.addEventListener('input', () => renderDocs(busca.value));
  document.getElementById('docsConteudo')?.addEventListener('click', e => {
    const ancora = e.target.closest('[data-doc-ancora]');
    if (ancora) { e.preventDefault(); document.getElementById('doc-' + ancora.dataset.docAncora)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const btn = e.target.closest('.doc-mais');
    if (!btn) return;
    const extra = btn.nextElementSibling;
    const abrir = extra.hidden;
    extra.hidden = !abrir;
    btn.setAttribute('aria-expanded', String(abrir));
    btn.textContent = abrir ? 'Ler menos' : 'Ler mais';
  });
  renderDocs();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciarDocs); else iniciarDocs();
