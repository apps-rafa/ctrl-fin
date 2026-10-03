/**
 * DOCUMENTAÇÃO — página própria (#docs, link "Documentação" no rodapé).
 *
 * IMPORTANTE: este arquivo é a fonte da documentação do app. Sempre que uma funcionalidade
 * for criada, mudada ou removida, atualize o item correspondente aqui (mesmo PR).
 *
 * Formato: cada seção tem vários itens { t: título, r: resumo (sempre visível), m: complemento (HTML,
 * (mostrado logo abaixo do resumo), d?: detalhes extras (botão "+ detalhes"; ou use DOCS_DETALHES pelo título). Use {ver:id} para linkar outro assunto. }. Só HTML simples nos textos (b, em, ul/li, br).
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
        m: 'As setas ▲ rolam os meses; o botão 🏠 volta ao mês atual. O mês de um lançamento é a sua <b>competência</b> (para cartão de crédito, o mês da fatura — veja {ver:cartao}). Pontinhos indicam meses com lançamentos.' },
      { t: 'Card de Receita', r: 'Mostra o que já entrou (atual) e o que ainda vai entrar (a receber), com o total do mês.',
        m: '"Atual" = receitas com data até hoje; "a receber" = receitas com data futura. Clicar no card abre a lista de Receitas. Estornos de cartão <b>não</b> entram aqui (abatem a fatura — veja {ver:cartao}).' },
      { t: 'Card de Despesa', r: 'Mostra o que já foi pago e o que ainda falta pagar no mês, seguindo o caminho do dinheiro.',
        m: '<ul><li><b>pago</b>: PIX/dinheiro com data até hoje + faturas de cartão já vencidas ou marcadas como pagas. Embaixo, a quebra "pix X + crédito Y".</li><li><b>a pagar</b>: lançamentos futuros + faturas de cartão em aberto. Embaixo, "pendentes X + crédito Y".</li></ul>Se o texto ficar comprido, ele se abrevia sozinho ("pend.", "créd.", "c.c.") e, no extremo, mostra só os valores. Clicar no card abre a lista de Despesas. Detalhes de como as faturas entram nas contas: {ver:cartao}; as regras completas estão em {ver:regras}.' },
      { t: 'Balanço e gasto diário', r: 'Balanço = receitas − despesas do mês. Gasto diário = quanto ainda pode gastar por dia até o fim do mês.',
        m: 'O gasto diário divide o balanço pelos dias que restam no mês (contando hoje).' },
      { t: 'Mini-resumo ao rolar', r: 'Ao rolar a página, os totais ficam numa faixa compacta no topo, com atalhos para + Lançamento, Próximos e Lixeira.',
        m: 'Assim você não perde os números nem os atalhos enquanto navega nas listas.' },
      { t: 'Saldo em contas', r: 'Com o {ver:openfinance} conectado, mostra o saldo atual das suas contas bancárias, logo abaixo do calendário.',
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
      { t: 'Mês do lançamento', r: 'Todo lançamento tem o campo "Mês" (competência), que começa no mês que você está vendo e pode ser trocado.',
        m: 'É o mês em que o lançamento conta nas listas, no dashboard e na {ver:anual}. Na despesa ele fica ao lado da forma de pagamento; na receita, ao lado do valor (data, valor, mês). No cartão de crédito o mês muda sozinho conforme a data e o fechamento (veja abaixo). O mesmo campo existe no formulário do bot.' },
      { t: 'Despesa no cartão de crédito', r: 'No crédito aparecem também "Parcelas" e o "Mês" (fatura). Parcelas 1x = compra à vista.',
        m: 'O <b>Mês</b> é calculado pela data da compra e pelo fechamento do cartão (compra no dia do fechamento ou depois cai na fatura seguinte) e você pode ajustar. Com mais de 1 parcela, o app cria uma linha por mês (centavos distribuídos), todas ligadas ao mesmo parcelamento; o valor total aparece ao lado.' },
      { t: 'Estorno', r: 'Estorno é uma categoria de Despesa, só para cartão de crédito: abate o valor da fatura.',
        m: 'Ao escolher a categoria <b>Estorno</b>, só os cartões de crédito ficam disponíveis, aparece o mês da fatura e some o parcelamento. Por dentro ele é gravado como crédito no cartão, então dashboard, fatura e {ver:anual} continuam corretos. A categoria só existe a partir do primeiro cartão cadastrado e é fixa (não dá para renomear, desativar nem remover).' },
      { t: 'Editar e excluir', r: 'Toque num lançamento para editar; ao salvar você volta para a tela em que estava.',
        m: 'Se o lançamento veio da busca ou dos Recém-lançados, a busca volta exatamente como estava. Parcelas que não são a primeira abrem o lançamento original (o parcelamento é editado nele). Excluir manda para a {ver:lixeira}.' },
      { t: 'Parcelamento: quitar', r: 'Em uma parcela, o marcador "quitar" encerra o parcelamento a partir daquele mês.',
        m: 'As parcelas dali em diante deixam de contar. Cada parcela mostra "k/n" (ex.: 3/12) e o valor da parcela / valor total da compra.' },
      { t: 'Duplicatas', r: 'Quando o app percebe lançamentos parecidos, mostra um grupo "Duplicatas" acima da lista para você revisar.',
        m: 'Compara valor, data, categoria e descrição normalizados. Serve para achar um lançamento repetido (ex.: importado do banco e digitado à mão).' },
    ],
  },
  {
    id: 'listas', emoji: '🗂️', titulo: 'Listas de Receitas e Despesas',
    itens: [
      { t: 'Leitura da lista', r: 'Cada linha mostra dia/mês e dia da semana, valor, chips e descrição, com colunas alinhadas; as linhas só ficam listradas (zebrado) com 3 ou mais itens.',
        m: 'O selo ⏰ na margem esquerda marca o lançamento que ainda não aconteceu (data futura ou pendente; não aparece na aba Próximos nem nos grupos "A pagar" e "A receber", onde todos são assim). O selo 🏦 marca o lançamento que foi conciliado com uma transação do banco (Open Finance). O dia sempre aparece com dois dígitos (01/10, 29/09).' },
      { t: 'Grupos da Receita', r: 'Atual (já recebido) e A receber (data futura), com barra proporcional no topo.',
        m: 'Cada grupo mostra contagem, total e % do total de receitas. Clique na barra para abrir/fechar o grupo correspondente.' },
      { t: 'Grupos da Despesa', r: 'Pago e A pagar, seguindo o caminho do dinheiro; cada cartão tem sua própria "Fatura" dentro.',
        m: '<ul><li><b>Pago</b>: PIX/dinheiro até hoje + faturas pagas.</li><li><b>A pagar</b>: faturas em aberto (compras já feitas) + o que ainda não aconteceu, inclusive compra de cartão futura, agrupada em "Crédito".</li></ul>Dentro de cada grupo os lançamentos se dividem em subgrupos por forma de pagamento, cada um com contagem, total e %.' },
      { t: 'Fatura do cartão', r: 'Subgrupo "Fatura &lt;cartão&gt;" com o box de vencimento, o botão "paga" e as compras do cartão.',
        m: 'O botão <b>paga</b> marca/desmarca a fatura como paga. Ela é marcada automaticamente pelo vencimento (vencida = paga, riscada), mas você pode alterar à mão e isso vale mais que a data. O vencimento cai em dia útil. Estornos aparecem dentro da fatura com "+".' },
      { t: 'Filtros: Categoria e Forma de pagamento', r: 'O funil dentro de cada grupo reorganiza os itens por categoria ou por forma de pagamento.',
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
      { t: 'Competência (mês da fatura)', r: 'Uma compra no crédito pertence ao mês da fatura, não ao mês da data da compra (usado em {ver:mes} e {ver:anual}).',
        m: 'Regra: compra no dia do fechamento ou depois cai na fatura do mês seguinte. O fechamento e o vencimento são configurados em {ver:config} > Formas de pagamento. Veja também {ver:lancar} e {ver:regras}.' },
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
      { t: 'O que aparece', r: 'O que ainda vai acontecer, do mês em exibição em diante: um grupo por mês (só os que têm lançamento), com Despesas e Receitas dentro.',
        m: 'O mês em exibição vem aberto e os seguintes fechados; ao trocar o mês no calendário, ele vira o início da lista e os anteriores somem. Subgrupo vazio não aparece e, se só houver um, abre junto do mês. A fatura de cada cartão aparece igual a "A pagar" (veja {ver:listas} e {ver:cartao}): subgrupo com vencimento, botão "paga" e as compras. O total e a contagem da Despesa incluem as faturas em aberto.' },
      { t: 'Botões do dashboard', r: 'O dashboard e os botões usam a mesma grade de 6 colunas: Receita, Despesa e Balanço/Gasto diário ocupam 2 cada; Lançamento ocupa as 6; Recorrências, Recém-lançados e Próximos 2 cada; a busca 5,5 e a lixeira 0,5.',
        m: 'Os botões de Lançamento, Recorrências, Recém-lançados e Próximos usam o mesmo tamanho de texto, sempre com margem lateral: apertando, primeiro o texto diminui (mantendo o emoji), depois some o emoji e, em tela muito estreita, sobra só o emoji. Nos cards de Receita e Despesa, quando aperta, "atual"/"pago" viram 🟢 e "a receber"/"a pagar" viram ⏭️, e "pendentes"/"crédito" viram ⏳ e 💳 (e "pix" vira ⚡) (em vez de abreviar). A lixeira tem metade da largura de antes (a busca ficou maior), sem contorno: é um ícone SVG apagado que acende quando a Lixeira está aberta. Encerrar e excluir uma recorrência pedem confirmação num diálogo do app.' },
      { t: 'Pendências', r: 'Uma barra colada logo abaixo da barra de meses (fixa, acompanha a rolagem) avisa quando há algo para resolver ("N pendências para resolver") e abre a lista.',
        m: 'Contam como pendência as duplicatas e os rascunhos de recorrências (ocorrências "a confirmar" que já venceram). A lista fica separada por mês (todos fechados, menos o mês selecionado no cabeçalho), no mesmo padrão de Próximos (o mês sem borda; Duplicatas e A confirmar com a sua), e cada item tem os mesmos botões de sempre (✓, ✏️, ✗/🗑️). Sem pendências, a barra some. O aviso "⚠️ Duplicatas" dos cards de Receita e Despesa foi substituído por ela.' },
      { t: 'Recorrências', r: 'Cadastre lançamentos fixos (conta mensal, assinatura, salário) uma vez; o app cria as ocorrências dos próximos meses.',
        m: 'O cadastro é só pelo app (não pelo bot) e fica separado dos lançamentos comuns. Cada recorrência é mensal ou semanal (com dia da semana ou "Variável"), tem valor por ocorrência e duração (contínua ou por X meses). As ocorrências nascem como lançamentos "a confirmar" (no mensal, sempre até o fim do mês seguinte: o rascunho do mês que vem já existe, e em novembro já nasce o de dezembro; no semanal, 5 semanas) e já contam em "a pagar"/"a receber". Editar a recorrência muda só as futuras ainda a confirmar; o que já passou vira lançamento normal. Em Recorrências, o botão "+ Criar recorrência" tem o mesmo visual do "+ Lançamento"; o botão de stop (à esquerda, no lugar do selo) encerra (vai para "Encerradas", de onde dá para voltar com o botão de play) e a 🗑️ exclui; os lançamentos já confirmados nunca são apagados. Nos lançamentos, as ocorrências ainda sem decisão aparecem na lista normal, com o selo ⏰/🔁 e um ✓ para confirmar; as vencidas também vão para as Pendências. Os botões "Confirmar/Aceitar todas" e "Apagar todas" têm texto pequeno e, apertando, viram só ✓ e a lixeira, para o título do grupo não quebrar. A página Pendências tem o título "📥 Pendências" e a barra fica com o contorno de "ligada" enquanto você está nela. Nos lançamentos, o ⏰ (ou 🏦) fica alinhado ao texto da data e o 🔁 ao texto da descrição. No cabeçalho dos grupos, a contagem vem antes dos botões "todas". Todas as lixeiras são ícones SVG sem contorno (acendem em vermelho ao passar o mouse); os botões dos alertas dividem a largura da linha e, se quebrarem, o que sobra sozinho ocupa 100%. Recém-lançados só parece selecionado enquanto a página dele está na frente. O grupo "Fatura <cartão>" tem um contorno em volta (começa e termina nele); compras do cartão com data futura ficam fora dela, pois só entram na fatura aberta quando a data chega. "Semanal"/"Mensal" nunca abreviam: o formulário mede os dois campos: o Valor mantém sempre a sua largura, a Recorrência recebe as colunas que o nome pede e o Dia fica com o resto (sem a seta, se for preciso, mas com o texto inteiro). Em Próximos o grupo do mês ("Novembro/2026", que encurta para "NOV/26" e "11/26") não tem borda; só Receitas e Despesas mantêm a sua. Quando "Fatura Crédito Bradesco" não cabe na linha, vira "Fatura CC Brad.". Na recorrência encerrada o cartão mostra o período da última ativação (ex.: Mar/2026 – Ago/2026); o play (verde) e o stop (vermelho) são círculos com ícone (✓ confirma; ✗ pergunta se apaga só aquele mês ou encerra a recorrência), e os lançamentos de recorrência levam o selo 🔁 (embaixo do ⏰ quando os dois aparecem). Editar e salvar uma ocorrência a confirma; no formulário, "🔁 Editar recorrência" abre a recorrência. Apagar um lançamento recorrente também pergunta "só este mês" ou "encerrar". Sem duração, o cartão mostra "Contínuo · Desde Mês/Ano" (sem Total). O formulário tem, na 1ª linha, Recorrência (2) | Dia (2) | Início (1) | Duração (3) | Valor (2) | Total (2) — o Total mostra "-" quando é contínua; na 2ª, Forma de pagamento | Categoria | Descrição. Ao apertar, a linha quebra em pares que nunca se separam: [Recorrência | Dia], [Início | Duração] e [Valor | Total] (o último par desce primeiro). Se o Início apertar, perde a seta e, no limite, mostra o mês em número (10) em vez do tricode. Nos cards, quando os rótulos viram emoji o valor aumenta (🟢 atual, 🔴 pago, ⏭️ a receber/a pagar); as duas linhas de detalhe (pendentes/crédito/pix) usam sempre o mesmo tamanho (vale o menor) e crescem até a largura da linha que a separa do total, trocando palavras por emoji (⏳ 💳 ⚡) quando preciso. Em tela extrema, Início e Duração e também Salvar e Cancelar dividem meio a meio. O campo Início (ao lado do Dia) é só o mês (em tricode), com o mês do cabeçalho como padrão. Ao criar, se já passaram ocorrências desde o início escolhido (ex.: hoje é dia 3 e a recorrência é todo dia 1; segundas-feiras anteriores do mês; início em mês passado), o app pergunta se cria também as anteriores ou só daqui pra frente — as retroativas sempre entram como rascunho ("a confirmar"). No mensal você escolhe o Dia do mês (Hoje, que é o padrão, ou 1–31; dia 29, 30 ou 31 em mês mais curto cai no último dia do mês); se cair em fim de semana ou feriado, a ocorrência vai para o próximo dia útil (feriados nacionais e os cadastrados em Configurações). O formulário usa a grade de 6 colunas: Recorrência (2; no semanal 1 + Dia 1), Valor (2), Duração (1, com setinhas: 1 = Contínua), Total (1), e depois forma de pagamento, categoria e descrição.' },
    ],
  },
  {
    id: 'busca', emoji: '🔎', titulo: 'Busca e Recém-lançados',
    itens: [
      { t: 'Busca universal', r: 'Procura em todo o app, de qualquer tela, no mês em exibição; resultado separado em Receitas e Despesas.',
        m: 'Aceita dicas: <em>&gt;100</em> (maior que), <em>&lt;50</em>, <em>100-200</em> (faixa), um ano (<em>2026</em>), mês (<em>jan</em>) e frases exatas entre aspas. "Buscar em todos os meses" amplia para o histórico inteiro. Estornos de cartão aparecem em Despesas, com "+".' },
      { t: 'Recém-lançados', r: 'Os últimos lançamentos criados, de qualquer mês, 5 por vez.',
        m: 'Útil para conferir o que acabou de entrar (inclusive pelo {ver:telegram} ou pelo {ver:openfinance}) e corrigir rápido.' },
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
      { t: 'Agrupar por Categoria ou Forma de pagamento', r: 'Escolha como enxergar o ano: por categoria (🏷️) ou por forma de pagamento (💳).',
        m: 'Cada categoria/forma tem a sua cor (a mesma escolhida em {ver:config}; receita e despesa têm cores próprias).' },
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
      { t: 'Formas de pagamento', r: 'Cadastre PIX, Dinheiro e cartões de crédito (banco, dia de fechamento, dia de vencimento, melhor dia de compra).',
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
        m: 'Escolha o período (mês/ano) e a conta: os botões das contas são exclusivos (ligar uma desliga a outra). No histórico de um cartão, a lista vem direto, sem subgrupo de despesas nem chip da forma de pagamento. Na fila você pode editar categoria e descrição, ignorar itens, marcar prontos e importar. O app aprende as categorias que você usa para sugerir melhor e detecta duplicatas de lançamentos que você já tinha. Rendimentos e dividendos podem ser ignorados.' },
      { t: 'Histórico e ignoradas', r: 'O que já foi conciliado e o que foi ignorado ficam guardados, com opção de editar, excluir ou reativar.',
        m: 'Assim nada se perde e você pode voltar atrás numa decisão.' },
    ],
  },
  {
    id: 'telegram', emoji: '🤖', titulo: 'Bot do Telegram',
    itens: [
      { t: 'Vincular', r: 'Em {ver:config} > Notificações, gere o código e toque no link para vincular o bot à sua conta.',
        m: 'Depois de vinculado, o bot também avisa quando chega lançamento novo do banco e manda um backup semanal (domingo) e alertas de erro.' },
      { t: 'Lançar por mensagem', r: 'Escreva como falaria: "gastei 35,90 no mercado", "recebi 200 de salário", "comprei um carro de 80000 em 10x".',
        m: 'O bot entende valor, tipo, categoria (pelo texto), forma de pagamento (ex.: "no pix", "no nubank") e parcelas. Reconhece categorias que você já cadastrou, inclusive de várias palavras (ex.: "150 pix saúde e bem estar"; entre "Casa" e "Casa e Manutenção", vale a mais específica), sem diferenciar maiúsculas e acentos. O que sobra do texto (depois de valor, tipo, forma de pagamento, data e categoria) vira a descrição. Monta um rascunho e só grava após ✅ Confirmar. Para ajustar o rascunho, responda (reply) à mensagem dele: o bot troca o que o texto citar, em qualquer combinação: categoria cadastrada ("Saúde"), forma de pagamento ("pix"), tipo ("receita"/"despesa"), valor ("80,50"), data ("25/09", "foi ontem", "semana passada", "mês passado", "há 3 dias") e parcelas ("parcelado em 5", "5x", "à vista" — só no crédito, e o valor por parcela é recalculado); o que sobrar vira a <b>descrição</b> (e sem categoria/forma, o texto todo é a descrição). Depois mostra o rascunho de novo. Os avisos de lançamentos do Pluggy no Telegram só vêm do <b>mês vigente</b>; os de meses anteriores aparecem só na fila do app.' },
      { t: 'Datas no texto', r: 'Diga a data: "ontem uber 10 reais", "25/09 uber 10 reais", "25 de setembro", "dia 25". Sem data vale hoje.',
        m: 'Entende hoje, ontem, anteontem, dd/mm, dd/mm/aaaa, "25 de setembro" e "dia 25". Sem o ano, usa o ano atual (ou o anterior se a data ficaria muito no futuro). Também dá para digitar só a data com um rascunho aberto.' },
      { t: 'Botões do rascunho', r: 'Cada rascunho traz na própria mensagem ✅ Confirmar, ✏️ Editar e ❌ Cancelar, então dá para ter vários pendentes e tratar um por um.',
        m: 'Ao tocar em ✏️ Editar, o bot responde "Toque em Editar para alterar o lançamento referente à despesa de R$ 10,00 no dia 05/10/2026" e põe o botão do formulário em cima do teclado, já preenchido com aquele rascunho (o Telegram só devolve os dados do formulário quando ele é aberto por esse botão). Ao salvar, só aquele rascunho sai da fila; ❌ Cancelar edição fecha o botão. Rascunhos não confirmados somem da fila depois de 7 dias. Os menus de /atualizar e /pgtopadrao ficam no teclado, terminam com ❌ Cancelar e não deixam item sozinho na última linha.' },
      { t: 'Sem links nas mensagens', r: 'Descrições vindas do banco não viram link: "apple.com/bill" aparece como "Apple" e o Telegram não mostra pré-visualização de links.',
        m: 'Vale para o aviso de lançamento novo do banco e para a descrição preenchida sozinha na revisão do Open Finance.' },
      { t: 'Estorno pelo bot', r: 'Diga "estorno 50 uber" ou escolha a categoria Estorno: o bot usa um cartão de crédito e abate a fatura.',
        m: 'A categoria Estorno só existe a partir do primeiro cartão. Nesse rascunho a forma de pagamento aceita só cartão de crédito e não há parcelas.' },
      { t: 'Lembrete de recorrência', r: 'No dia da ocorrência o bot pergunta se você quer gerar o rascunho.',
        m: 'O botão "📝 Gerar rascunho" monta o rascunho a partir do próprio lançamento "a confirmar" (mesmos dados, nenhuma linha nova): ✅ Confirmar o confirma, ✏️ Editar e responder ao rascunho ajustam e ❌ Cancelar só descarta o rascunho — o lançamento segue em "a confirmar" no app. Nada no bot encerra ou apaga a recorrência. Se você já resolveu no app, o bot avisa e não duplica nada.' },
      { t: 'Lembrete de vencimento', r: 'Todo dia às 9h o bot avisa as despesas que vencem naquele dia e as faturas de cartão que vencem hoje.',
        m: 'Despesa fora do cartão: lembra no dia da data do lançamento, todos os vencimentos do dia saem juntos numa mensagem só, com descrição, valor, categoria e forma de pagamento de cada um (não avisa o que foi lançado no próprio dia, o que veio do banco nem receitas). Cartão de crédito: nunca pela data da compra, só no dia do vencimento da fatura (o dia cadastrado no cartão), com o total do mês (compras menos estornos), se a fatura não estiver marcada como paga. Cada lançamento ou fatura é avisado uma única vez.' },
      { t: 'Comandos', r: '/resumo, /diario, /credito, /pix, /ultimos, /pendencias, /atualizar, /pgtopadrao, /lancamento e /backup.',
        m: '<ul><li><b>/resumo</b>: receitas, despesas e balanço do mês.</li><li><b>/pendencias</b>: lista as ocorrências de recorrência a confirmar e as possíveis duplicatas do mês, numeradas, com um botão por item (como o /ultimos): a confirmar abre o rascunho; duplicata abre "Não é duplicata" ou "Editar" (para apagar, use o app).</li><li><b>/diario</b>: quanto ainda pode gastar por dia.</li><li><b>/credito</b>: gasto por cartão e total.</li><li><b>/pix</b>: total no PIX, pago e a pagar.</li><li><b>/ultimos</b>: os 5 últimos lançamentos, numerados; toque em 1 a 5 para editar aquele lançamento (o bot mostra o botão ✏️ Editar no teclado, que abre o formulário com os dados dele). Parcelados são editados pelo app.</li><li><b>/atualizar</b>: pede dados novos ao banco e mostra as últimas transações; toque no número para lançar uma delas.</li><li><b>/pgtopadrao</b>: forma de pagamento usada quando a mensagem não diz qual.</li><li><b>/lancamento</b>: explica como lançar por mensagem.</li><li><b>/backup</b>: manda o backup agora.</li></ul>' },
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
        m: 'Usa os feriados cadastrados em {ver:config}.' },
    ],
  },
];

/** Detalhes extras ("+ detalhes") dos itens mais complexos, indexados pelo título do item. Também aceitam {ver:id}. */
const DOCS_DETALHES = {
  'Card de Despesa': `
    <p><b>Exemplo.</b> Em setembro você tem: R$ 300 de PIX já pago, R$ 200 de PIX marcado para o dia 30 (futuro) e uma fatura do Nubank de R$ 1.000 que vence dia 27.</p>
    <ul>
      <li>Antes do dia 27: <b>pago</b> = 300; <b>a pagar</b> = 200 + 1.000 = 1.200 ("pendentes 200 + crédito 1.000").</li>
      <li>Depois do dia 27 (ou ao marcar a fatura como paga): <b>pago</b> = 300 + 1.000 = 1.300 ("pix 300 + crédito 1.000"); <b>a pagar</b> = 200.</li>
    </ul>
    <p>O número grande embaixo é a soma dos dois. O detalhe só aparece quando existe fatura de cartão no mês. Compras de cartão com data futura ainda não bateram na fatura: contam em "pendentes".</p>`,
  'Grupos da Despesa': `
    <p>A lista de Despesas mostra dois grupos:</p>
    <ul>
      <li><b>Pago</b>: PIX/dinheiro com data até hoje, mais um subgrupo "Fatura &lt;cartão&gt;" para cada fatura já vencida ou marcada como paga.</li>
      <li><b>A pagar</b>: um subgrupo "Fatura &lt;cartão&gt;" por cartão em aberto (com as compras já feitas) e, fora deles, tudo o que ainda não aconteceu, dividido por forma de pagamento. Compras de cartão futuras aparecem juntas em "Crédito", com o chip do cartão.</li>
    </ul>
    <p>Cada subgrupo mostra contagem, total e % em relação ao total do grupo (Pago e A pagar fecham 100%). Veja como a fatura é montada em {ver:cartao}.</p>`,
  'Fatura do cartão': `
    <ul>
      <li>O cabeçalho mostra nome, quantidade de itens, total da fatura e a % dentro do grupo.</li>
      <li>O box abaixo mostra "Vcto. dd/mm" e o botão <b>paga</b>. Fatura paga (marcada ou vencida) fica com o texto riscado, mas o botão continua funcionando.</li>
      <li>A marcação automática segue o vencimento (levado para o dia útil, conforme os feriados de {ver:config}); se você marcar ou desmarcar à mão, sua escolha passa a valer para aquele mês.</li>
      <li>As compras listadas são as já feitas (data até hoje). Estornos entram com "+" e reduzem o total.</li>
    </ul>`,
  'Competência (mês da fatura)': `
    <p><b>Exemplo</b> com fechamento no dia 15:</p>
    <ul>
      <li>Compra em 14/09 → fatura de setembro.</li>
      <li>Compra em 15/09 (ou depois) → fatura de outubro.</li>
    </ul>
    <p>Em compras parceladas, a 1ª parcela usa esse mês e cada parcela seguinte cai um mês depois. No formulário de despesa o campo "Mês" já vem preenchido (o mês que você está vendo; no cartão, calculado pela data e pelo fechamento), mas você pode trocar. É a competência que decide em que mês o lançamento aparece nas listas, no dashboard e na {ver:anual}.</p>`,
  'Fatura em aberto x paga': `
    <p>A fatura de um mês é a soma das compras do cartão já feitas (data até hoje) menos os estornos. Ela só existe enquanto o total for maior que zero.</p>
    <ul>
      <li><b>Em aberto</b>: entra em "a pagar", aparece em "A pagar" e em {ver:proximos}.</li>
      <li><b>Paga</b>: entra em "pago" e aparece no grupo "Pago".</li>
    </ul>
    <p>Quem decide é o vencimento (automático) ou o botão "paga" (manual, que prevalece). Um cartão desativado deixa de gerar faturas depois da data em que foi desativado.</p>`,
  'Despesa no cartão de crédito': `
    <ul>
      <li>O campo <b>Valor</b> é o valor de cada parcela; o valor total da compra aparece ao lado ("R$ 15 / 45").</li>
      <li>Ao criar, o app gera uma linha por parcela, com o mesmo agrupamento, e distribui os centavos que sobram nas primeiras parcelas.</li>
      <li>Cada parcela mostra "k/n". Só a 1ª parcela edita o parcelamento; nas outras, o app abre o lançamento original.</li>
      <li>O marcador "quitar" numa parcela encerra o parcelamento a partir daquele mês.</li>
      <li>Parcelas dependem do cartão de crédito escolhido: em PIX ou dinheiro o campo não aparece.</li>
    </ul>`,
  'Estorno': `
    <ul>
      <li>Escolha Despesa, categoria <b>Estorno</b> e um cartão de crédito; informe o valor devolvido e o mês da fatura.</li>
      <li>Ele reduz o total da fatura daquele cartão e aparece dentro dela, com "+".</li>
      <li>Nos cálculos ele nunca é receita: não entra no card de Receita nem em "Receitas" da {ver:anual} (por categoria, vira a linha "(−) Estornos no cartão").</li>
      <li>Reembolso (dinheiro que volta por PIX etc.) é diferente: é uma receita comum, sem forma de pagamento.</li>
      <li>A categoria só aparece a partir do primeiro cartão de crédito ativo.</li>
    </ul>`,
  'Caminho do dinheiro (Despesa)': `
    <p>A despesa é contada pelo momento em que o dinheiro sai do seu bolso, e não pela data da compra.</p>
    <ul>
      <li>PIX e dinheiro: saem na data do lançamento. Data até hoje = pago; data futura = a pagar.</li>
      <li>Cartão de crédito: a compra vira parte da fatura; o dinheiro sai quando a fatura é paga. Até lá conta como "a pagar" (fatura em aberto).</li>
      <li>Compra de cartão com data futura ainda nem entrou na fatura: conta como pendente.</li>
    </ul>
    <p>Por isso o total do mês não muda quando você paga a fatura: só muda de "a pagar" para "pago".</p>`,
  'Filtros: Categoria e Forma de pagamento': `
    <ul>
      <li>O ícone de funil de cada grupo tira o filtro; os botões ao lado reorganizam os itens. Aprovar "não é duplicata" vale em todos os aparelhos (fica gravado no banco). Um subgrupo único abre junto com o grupo (em qualquer lista, inclusive no Open Finance). Um filtro só aparece quando o grupo tem mais de uma opção (por exemplo, mais de uma forma de pagamento ou categoria).</li>
      <li>Filtro por Categoria e por Forma de pagamento se combinam: dentro de uma forma você pode filtrar por categoria (e vice-versa) sem chips repetidos.</li>
      <li>Em Receitas o filtro por forma de pagamento não existe, porque receita não tem forma.</li>
      <li>O filtro escolhido vale enquanto você está na tela; ao reabrir a aba, volta à ordem cronológica.</li>
    </ul>`,
  'Busca universal': `
    <ul>
      <li><em>&gt;100</em>: valor maior que 100; <em>&lt;50</em>: menor que 50; <em>100-200</em>: entre 100 e 200.</li>
      <li><em>2026</em> ou <em>jan</em>: filtra por ano ou mês; <em>"frase exata"</em> procura o trecho inteiro.</li>
      <li>A busca olha categoria, forma de pagamento, descrição, valor e data.</li>
      <li>"Buscar em todos os meses" amplia o resultado para o histórico inteiro; resultados são agrupados em Receitas e Despesas, cada um com "Carregar mais 5".</li>
      <li>Editar um resultado e salvar devolve você à mesma busca.</li>
    </ul>`,
  'Comparar meses': `
    <ul>
      <li>Escolha o mês A e o mês B; o ⇅ troca os dois de lugar.</li>
      <li>Para cada categoria/forma aparecem os valores de A e B, a diferença e a variação em %.</li>
      <li>As linhas ficam ordenadas pela maior diferença. Receitas e despesas são comparadas separadamente, e a cor da variação depende do tipo (mais despesa = vermelho).</li>
    </ul>`,
  'Gráfico e tabela': `
    <ul>
      <li>Duas barras por mês: receita (esquerda) e despesa (direita), na mesma escala; a barra do mês atual tem contorno.</li>
      <li>Cada barra é empilhada por categoria/forma: o maior valor do mês fica na base e a cor é a escolhida em {ver:config}.</li>
      <li>Abaixo, a tabela: uma linha por categoria/forma, valores mensais, total do ano e uma linha final de saldo.</li>
      <li>Ordem das linhas: maior total do ano; ao focar num mês, maior valor daquele mês.</li>
      <li>Meses passados sem lançamento ficam escondidos; os de hoje em diante aparecem para planejamento.</li>
    </ul>`,
  'Forma de pagamento da conta': `
    <ul>
      <li>Na lista de contas conectadas, escolha para cada uma a forma de pagamento correspondente (ex.: cartão da Nubank → "Crédito Nubank").</li>
      <li>Sem a forma escolhida ("Selecione...") a sincronização é bloqueada, com um aviso dizendo quais contas faltam.</li>
      <li>Uma conta ligada a um cartão de crédito gera lançamentos no cartão (entram nas faturas); uma conta corrente gera lançamentos de PIX/débito.</li>
      <li>Você também escolhe quais contas participam da sincronização.</li>
    </ul>`,
  'Sincronizar e revisar': `
    <ol>
      <li>Escolha o período e toque em sincronizar: as transações novas chegam numa <b>fila de revisão</b> (nada entra nas suas listas ainda).</li>
      <li>Para cada item, confira categoria e descrição (o app sugere pela descrição do banco e aprende com as suas escolhas anteriores).</li>
      <li>Itens iguais a lançamentos que você já fez aparecem marcados como possíveis duplicatas.</li>
      <li>Ignore o que não quer; marque os prontos e toque em importar.</li>
    </ol>
    <p>Depois de importado, o lançamento é igual a qualquer outro (pode ser editado ou excluído). Veja também {ver:lixeira}.</p>`,
  'Lançar por mensagem': `
    <ul>
      <li><b>Valor</b>: o primeiro número do texto ("35,90", "1.200", "80000").</li>
      <li><b>Tipo</b>: verbos como "gastei/comprei/paguei" = despesa; "recebi/ganhei/vendi" = receita; sem verbo, despesa.</li>
      <li><b>Categoria</b>: procurada pelo nome que você cadastrou ou por palavras-chave (uber → Transporte, mercado → Mercado...). Se não achar, usa "Outros".</li>
      <li><b>Forma de pagamento</b>: pelo texto ("no pix", "no nubank", "crédito"); senão a padrão de /pgtopadrao; senão o primeiro cartão.</li>
      <li><b>Parcelas</b>: "em 10x", "10 parcelas" (só no crédito). O valor informado é o total.</li>
      <li><b>Data</b>: veja "Datas no texto".</li>
    </ul>
    <p>Depois toque em ✅ Confirmar. O que não for botão vira a descrição.</p>`,
  'Datas no texto': `
    <ul>
      <li>"hoje", "ontem", "anteontem".</li>
      <li>"25/09", "25/09/2026", "25-09-26".</li>
      <li>"25 de setembro", "15 de março de 2026".</li>
      <li>"dia 25": o dia 25 do mês atual, ou do mês anterior se ainda não chegou.</li>
    </ul>
    <p>A data é retirada da descrição. Datas impossíveis (como 31/02) são ignoradas.</p>`,
  'Comandos': `
    <p>Todos funcionam no chat do bot, depois de vincular. /atualizar e /pgtopadrao abrem menus no teclado (sempre com ❌ Cancelar). Em /atualizar, toque no número de uma transação para transformá-la em rascunho de lançamento (com a forma de pagamento da conta). Veja o vínculo em {ver:openfinance}.</p>`,
  'Formas de pagamento': `
    <ul>
      <li><b>Cartão de crédito</b>: banco, dia de fechamento, dia de vencimento e melhor dia de compra (sugerido: fechamento + 1). Ele alimenta {ver:cartao}.</li>
      <li><b>PIX</b>: forma base, pode ter banco.</li>
      <li><b>Dinheiro</b>: fixa, não se renomeia nem se remove.</li>
      <li>Desativar tira a forma dos formulários e do bot, mas os lançamentos antigos continuam intactos e com a mesma cor.</li>
    </ul>`,
};

/** Assunto aberto (um por vez; null = página em branco). */
let _docsAberta = null;

/** Troca {ver:id} por um link que abre aquele assunto. */
function _docsLinks(html) {
  return String(html || '').replace(/\{ver:(\w+)\}/g, (_, id) => {
    const sec = DOCS_SECOES.find(x => x.id === id);
    return sec ? `<a href="#" class="doc-link" data-doc-ir="${id}">${sec.titulo}</a>` : id;
  });
}

/** HTML de um item: resumo + complemento visíveis; "+ detalhes" (quando existe) abre/fecha o texto extra. */
function _htmlDocItem(it) {
  const det = it.d || DOCS_DETALHES[it.t];
  return `
    <article class="doc-item">
      <h4>${it.t}</h4>
      <p>${_docsLinks(it.r)}</p>
      ${it.m ? `<div class="doc-extra">${_docsLinks(it.m)}</div>` : ''}
      ${det ? `<button type="button" class="doc-detalhes" aria-expanded="false">+ detalhes</button><div class="doc-detalhes-corpo" hidden>${_docsLinks(det)}</div>` : ''}
    </article>`;
}

/** Índice de assuntos: cada linha ocupa 100% da largura e os assuntos se distribuem por igual
 *  (nunca sobra um sozinho na última linha): usa o menor número de linhas em que tudo cabe. */
function _montarIndiceDocs() {
  const nav = document.getElementById('docsIndice');
  if (!nav) return;
  nav.innerHTML = DOCS_SECOES.map(s =>
    `<button type="button" class="docs-chip${_docsAberta === s.id ? ' active' : ''}" data-doc-assunto="${s.id}" aria-pressed="${_docsAberta === s.id}">${s.emoji} ${s.titulo}</button>`).join('');
  // mede o tamanho natural de cada chip (linha única sem esticar)
  nav.style.cssText = 'flex-direction:row;flex-wrap:wrap;align-items:flex-start';
  const chips = [...nav.children];
  const largura = nav.clientWidth;
  if (!largura) return; // página escondida: refaz ao abrir
  const gap = 6;
  const nat = chips.map(c => c.getBoundingClientRect().width);
  const n = chips.length;
  const custo = (i, j) => nat.slice(i, j).reduce((x, y) => x + y, 0) + gap * (j - i - 1); // largura da linha com os chips i..j-1
  // Partição em r linhas (ordem mantida) que minimiza a linha mais larga; usa o menor r em que tudo cabe.
  const particionar = r => {
    const dp = Array.from({ length: r + 1 }, () => Array(n + 1).fill(Infinity));
    const corte = Array.from({ length: r + 1 }, () => Array(n + 1).fill(0));
    dp[0][0] = 0;
    for (let l = 1; l <= r; l++) for (let j = l; j <= n; j++) for (let i = l - 1; i < j; i++) {
      const v = Math.max(dp[l - 1][i], custo(i, j));
      if (v < dp[l][j]) { dp[l][j] = v; corte[l][j] = i; }
    }
    const fins = []; let j = n;
    for (let l = r; l >= 1; l--) { const i = corte[l][j]; fins.unshift([i, j]); j = i; }
    return { pior: dp[r][n], fins };
  };
  let res = null;
  for (let r = 1; r <= n; r++) { const p = particionar(r); if (p.pior <= largura || r === n) { res = p; break; } }
  nav.style.cssText = '';
  nav.innerHTML = '';
  res.fins.forEach(([i, j]) => {
    const linha = document.createElement('div');
    linha.className = 'docs-linha';
    chips.slice(i, j).forEach(c => linha.appendChild(c));
    nav.appendChild(linha);
  });
}

/** Mostra o assunto aberto (ou os resultados da busca); sem nenhum dos dois, a página fica em branco. */
function renderDocs() {
  const alvo = document.getElementById('docsConteudo');
  if (!alvo) return;
  const q = String(document.getElementById('docsBusca')?.value || '').trim().toLowerCase();
  if (q) {
    const texto = it => (it.t + ' ' + it.r + ' ' + it.m.replace(/<[^>]+>/g, ' ')).toLowerCase();
    const achados = DOCS_SECOES.map(s => ({ ...s, itens: s.itens.filter(it => texto(it).includes(q)) })).filter(s => s.itens.length);
    alvo.innerHTML = achados.length
      ? achados.map(s => `<section class="docs-secao"><h3>${s.emoji} ${s.titulo}</h3>${s.itens.map(_htmlDocItem).join('')}</section>`).join('')
      : '<p class="empty-message">Nada encontrado.</p>';
  } else {
    const s = DOCS_SECOES.find(x => x.id === _docsAberta);
    alvo.innerHTML = s ? `<section class="docs-secao"><h3>${s.emoji} ${s.titulo}</h3>${s.itens.map(_htmlDocItem).join('')}</section>` : '';
  }
  _montarIndiceDocs();
}

function iniciarDocs() {
  document.getElementById('linkDocs')?.addEventListener('click', e => {
    e.preventDefault();
    if (typeof mudarAba === 'function') mudarAba('docs');
    _docsAberta = null; // sempre abre em branco
    const busca = document.getElementById('docsBusca'); if (busca) busca.value = '';
    renderDocs();
  });
  document.getElementById('docsFechar')?.addEventListener('click', () => { if (typeof mudarAba === 'function') mudarAba('docs'); });
  document.getElementById('docsBusca')?.addEventListener('input', renderDocs);
  document.getElementById('docsConteudo')?.addEventListener('click', e => {
    const ir = e.target.closest('[data-doc-ir]');
    if (ir) {
      e.preventDefault();
      _docsAberta = ir.dataset.docIr;
      const busca = document.getElementById('docsBusca'); if (busca) busca.value = '';
      renderDocs();
      document.getElementById('docsIndice')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const btn = e.target.closest('.doc-detalhes');
    if (!btn) return;
    const corpo = btn.nextElementSibling;
    const abrir = corpo.hidden;
    corpo.hidden = !abrir;
    btn.setAttribute('aria-expanded', String(abrir));
    btn.textContent = abrir ? '− detalhes' : '+ detalhes';
  });
  document.getElementById('docsIndice')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-doc-assunto]');
    if (!btn) return;
    _docsAberta = _docsAberta === btn.dataset.docAssunto ? null : btn.dataset.docAssunto; // interruptor: não acumula
    const busca = document.getElementById('docsBusca'); if (busca) busca.value = '';
    renderDocs();
  });
  window.addEventListener('resize', () => { if (document.getElementById('docs')?.classList.contains('active')) _montarIndiceDocs(); });
  renderDocs();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciarDocs); else iniciarDocs();
