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
        m: 'Tudo fica salvo na sua conta (entrada com o Google ou por um link enviado ao seu e-mail). Você pode lançar pelo app, por mensagem no {ver:telegram} e importando movimentações do banco ({ver:openfinance}). O app funciona no computador e no celular.' },
      { t: 'Modo teste', r: '"Testar sem cadastro", na tela de entrada, abre o app sem criar conta. A conta de teste e todos os dados dela são apagados sozinhos 7 dias depois.',
        m: 'No modo teste aparece a etiqueta 🧪 no topo e o botão "Apagar tudo" (para recomeçar antes disso). Nada que você fizer ali vai para uma conta real. O {ver:openfinance} e o backup por e-mail não funcionam no modo teste.' },
      { t: 'Tema claro/escuro e esconder valores', r: 'A 🌙 troca o tema; o 👁 esconde os valores do dashboard (útil em público). O app sempre abre com os valores escondidos (olho fechado).',
        m: 'O tema escolhido fica lembrado neste aparelho. Com os valores escondidos, o dashboard e a {ver:anual} mostram "••••" no lugar dos números. Enquanto o app carrega, os valores também aparecem como "••••" (nunca um "R$ 0,00" provisório).' },
      { t: 'Cabeçalho', r: 'Título, 📈 Visão anual, 🌙 tema e 🚪 sair. Abaixo, a barra de meses, o 👁 e o ⚙️ Configurações.',
        m: 'O ⚙️ e o 📈 funcionam como interruptores: clicar de novo fecha a tela e volta para onde você estava. Quando há algo para resolver, aparece logo abaixo a barra 📥 de Pendências (veja {ver:proximos}).' },
      { t: 'Abertura do app', r: 'Ao abrir, uma tela com a barra de carregamento (0 a 100%) cobre o app até ele estar montado — você não vê os meses e os valores aparecendo aos poucos.' },
      { t: 'Atualizações e uso sem internet', r: 'O app se atualiza sozinho e abre mesmo sem internet (os dados precisam de conexão).',
        m: 'Quando há uma versão nova, ela é baixada ao abrir e passa a valer na próxima abertura. Se algo parecer antigo, recarregue a página com força (Ctrl+F5).' },
    ],
  },
  {
    id: 'mes', emoji: '📆', titulo: 'Mês e dashboard',
    itens: [
      { t: 'Barra de meses', r: 'Escolha o mês que quer ver; tudo no app (dashboard, listas, próximos) acompanha esse mês.',
        m: 'As setas ◀ ▶ trocam os meses e o 🏠 volta ao mês atual. A bolinha sob o mês indica lançamentos: cheia = já há algo que aconteceu; só o contorno = só coisas futuras ou a confirmar. O mês de um lançamento é a sua <b>competência</b> (no cartão de crédito, o mês da fatura — veja {ver:cartao}).' },
      { t: 'Card de Receita', r: 'Mostra o que já entrou (recebido) e o que ainda vai entrar (a receber), com o total do mês.',
        m: '"Recebido" = receitas com data até hoje (as programadas só depois de marcadas como Recebido); "a receber" = o resto. Clicar no card abre a lista de Receitas. Estornos de cartão <b>não</b> entram aqui (abatem a fatura — veja {ver:cartao}).' },
      { t: 'Card de Despesa', r: 'Mostra o que já foi pago e o que ainda falta pagar no mês, seguindo o caminho do dinheiro.',
        m: '<ul><li><b>pago</b>: PIX/dinheiro com data até hoje + faturas de cartão já vencidas ou marcadas como pagas. Embaixo, a quebra "pix X + crédito Y".</li><li><b>a pagar</b>: lançamentos futuros + faturas de cartão em aberto. Embaixo, "pendentes X + crédito Y".</li></ul>Em tela estreita os rótulos viram emojis: 🟢 pago/recebido, ⏭️ a pagar/a receber, ⚡ pix, 💳 crédito, ⏳ pendentes e ∑ total. Clicar no card abre a lista de Despesas. Detalhes: {ver:cartao} e {ver:regras}.' },
      { t: 'Balanço e gasto diário', r: 'Balanço = receitas − despesas do mês. Gasto diário = quanto ainda pode gastar por dia até o fim do mês.',
        m: 'O gasto diário divide o balanço pelos dias que restam no mês (contando hoje). Num mês futuro ele é estimado (balanço previsto ÷ dias do mês), com a legenda "previsto", quando já há receita e despesa previstas.' },
      { t: 'Mini-resumo ao rolar', r: 'Ao rolar a página, os totais ficam numa faixa compacta no topo, com atalhos para + Lançamento, 🔁 Recorrências, 🕓 Recentes, ⏰ Próximos e a Lixeira.',
        m: 'Assim você não perde os números nem os atalhos enquanto navega nas listas.' },
      { t: 'Saldo em contas', r: 'Com o {ver:openfinance} conectado, mostra o saldo atual das suas contas bancárias, logo abaixo do calendário.',
        m: 'É o saldo de hoje no banco (não depende do mês escolhido). Toque para ver o detalhe por conta. Liga e desliga em {ver:config} > Open Finance > "💰 Saldo em contas" (vale só para este aparelho).' },
    ],
  },
  {
    id: 'lancar', emoji: '➕', titulo: 'Lançar, editar e excluir',
    itens: [
      { t: '+ Lançamento', r: 'Escolha Receita ou Despesa e preencha Data (dd/mm), Mês de referência, Valor, Forma de pagamento, Categoria e, se quiser, a Descrição.',
        m: 'O botão "+" ao lado de categoria e forma de pagamento cria uma nova na hora. Trocar entre Receita e Despesa mantém o que já foi preenchido (data, valor, mês, descrição e a categoria, se ela existir nos dois). Deixar a Data em branco (ou digitar algo que não é data) cria um lançamento <b>sem data definida</b>: aparece como "?/mês" e vale como fim do mês de referência.' },
      { t: 'Receita: sempre PIX', r: 'A receita também tem forma de pagamento, mas só PIX: ela já vem preenchida e os cartões aparecem desabilitados. Reembolso é uma receita comum.',
        m: 'Receitas antigas sem forma de pagamento viraram PIX, e as que chegam pelo bot ou pelo Open Finance também entram como PIX. Nas listas de Receita o chip da forma fica escondido (seria sempre PIX).' },
      { t: 'Mês do lançamento', r: 'Todo lançamento tem o "Mês de referência" (competência): é o mês em que ele conta nas listas, no dashboard e na {ver:anual}.',
        m: 'Fica ao lado da Data (Data | Mês ref. | Valor). Fora do cartão ele começa no mês em exibição; no cartão de crédito é calculado pela data e pelo fechamento (veja abaixo). Você sempre pode trocar. O mesmo campo existe no formulário do bot.' },
      { t: 'Despesa no cartão de crédito', r: 'No crédito aparecem também "Parcelas" e o "Mês" (fatura). Parcelas 1x = compra à vista.',
        m: 'O <b>Mês</b> é calculado pela data da compra e pelo fechamento do cartão (compra no dia do fechamento ou depois cai na fatura seguinte) e você pode ajustar. Com mais de 1 parcela, o app cria uma linha por mês (centavos distribuídos), todas ligadas ao mesmo parcelamento; o valor total aparece ao lado.' },
      { t: 'Estorno', r: 'Estorno é uma categoria de Despesa, só para cartão de crédito: abate o valor da fatura.',
        m: 'Ao escolher a categoria <b>Estorno</b>, só os cartões de crédito ficam disponíveis, aparece o mês da fatura e some o parcelamento. Por dentro ele é gravado como crédito no cartão, então dashboard, fatura e {ver:anual} continuam corretos. A categoria só existe a partir do primeiro cartão cadastrado e é fixa (não dá para renomear, desativar nem remover).' },
      { t: 'Pago / Recebido (lançamento programado)', r: 'Lançamento com data futura ou sem data definida é "programado": a partir do dia dele, aparece ao lado do valor o checkbox Pago (despesa) ou Recebido (receita).',
        m: 'Enquanto não estiver marcado, conta como "a pagar"/"a receber", mesmo com a data já passada. Marcado, conta como pago e fica marcado até o dia seguinte (no mesmo dia dá para desmarcar, e ele volta a ser programado). Sem data definida, o checkbox aparece o tempo todo e marcar define a data como hoje. Não vale para cartão de crédito, parcelas e ocorrências a confirmar. O bot também avisa no dia e tem o botão "Marcar como pago" (veja {ver:telegram}).' },
      { t: 'Editar e excluir', r: 'Toque num lançamento para editar; ao salvar você volta para a tela em que estava.',
        m: 'Se o lançamento veio da busca ou dos Recentes, a busca volta exatamente como estava. Parcelas que não são a primeira abrem o lançamento original (o parcelamento é editado nele). Editar e salvar uma ocorrência "a confirmar" a confirma. Excluir manda para a {ver:lixeira}, com "Desfazer" por 5 segundos.' },
      { t: 'Parcelamento: quitar', r: 'Numa parcela, o marcador "quitar" antecipa o parcelamento a partir daquele mês.',
        m: 'A parcela marcada passa a valer o saldo restante (ela mais as seguintes); as seguintes ficam zeradas e riscadas, com o mês da quitação. Desmarcar devolve todas as parcelas aos valores originais. Cada parcela mostra "k/n" (ex.: 3/12) e o valor da parcela / valor total da compra.' },
      { t: 'Duplicatas', r: 'Quando o app acha lançamentos repetidos no mês, mostra o grupo "📑 Duplicatas" para você revisar.',
        m: 'Contam como duplicata lançamentos do mesmo mês com o mesmo valor, a mesma forma de pagamento e a mesma descrição (sem diferenciar maiúsculas e acentos), mesmo com datas diferentes. Ocorrências de recorrência nunca contam. Serve para achar, por exemplo, algo importado do banco e também digitado à mão.' },
    ],
  },
  {
    id: 'listas', emoji: '🗂️', titulo: 'Listas de Receitas e Despesas',
    itens: [
      { t: 'Leitura da lista', r: 'Cada linha mostra dia/mês e dia da semana, valor, chips e descrição, com colunas alinhadas; as linhas só ficam listradas (zebrado) com 3 ou mais itens.',
        m: 'Selos: ⏰ = ainda não aconteceu (não aparece onde todos são assim, como em "A pagar"); 🏦 = conciliado com uma transação do banco ({ver:openfinance}); 🔁 = lançamento de uma recorrência. O dia sempre tem dois dígitos (01/10); sem data definida aparece "?/10".' },
      { t: 'Grupos da Receita', r: 'Recebido (já entrou) e A receber (ainda não), com barra proporcional no topo.',
        m: 'Cada grupo mostra contagem, total e % do total de receitas. Clique na barra para abrir/fechar o grupo correspondente.' },
      { t: 'Grupos da Despesa', r: 'Pago e A pagar, seguindo o caminho do dinheiro; dentro deles, um subgrupo por forma de pagamento e uma "Fatura" por cartão.',
        m: '<ul><li><b>Pago</b>: PIX/dinheiro até hoje + faturas pagas.</li><li><b>A pagar</b>: faturas em aberto (compras já feitas) + o que ainda não aconteceu; compras de cartão futuras ficam juntas em "Crédito".</li></ul>Cada subgrupo mostra contagem, total e %.' },
      { t: 'Fatura do cartão', r: 'Subgrupo "Fatura &lt;cartão&gt;" com o box de vencimento, o botão "paga" e as compras do cartão.',
        m: 'O botão <b>paga</b> marca/desmarca a fatura como paga. Ela é marcada automaticamente pelo vencimento (vencida = paga, riscada), mas você pode alterar à mão e isso vale mais que a data. O vencimento cai em dia útil. Estornos aparecem dentro da fatura com "+".' },
      { t: 'Filtros: Categoria e Forma de pagamento', r: 'O funil divide um grupo por categoria: em Pago, A pagar, Recebido, A receber, em cada forma de pagamento e em cada fatura (no "A confirmar", também por forma de pagamento).',
        m: 'O filtro só aparece quando há mais de uma opção e pelo menos uma delas tem mais de um lançamento; só as opções com mais de um lançamento viram subgrupo (as outras ficam soltas). O chip igual ao do subgrupo some. O filtro vale enquanto você está na tela; ao reabrir a aba, volta à ordem cronológica.' },
      { t: 'Desfazer', r: 'Excluir, confirmar ocorrências, apagar cópias de duplicatas, marcar "não é duplicata", marcar ou desmarcar Pago/Recebido, quitar parcelamento, apagar feriado, remover categoria/forma e excluir do histórico da Pluggy mostram um aviso "Desfazer" por 5 segundos.',
        m: 'A barra do aviso vai diminuindo; só quando ela acaba a ação é gravada de verdade (o excluído vai para a Lixeira). Desfazer devolve o item como estava. Cada ação tem o seu aviso, o aviso não trava a tela, e fechar a página com um aviso aberto grava a ação na hora.' },
      { t: 'Carregar mais', r: 'Grupos e subgrupos longos mostram 5 itens por vez; "Carregar mais 5" abre mais (no último lote, só o que falta, ex.: "Carregar mais 3").',
        m: 'Fechar um grupo volta aos 5 primeiros.' },
      { t: 'Chips', r: 'Cada lançamento mostra chips coloridos: forma de pagamento (na 1ª linha, ao lado do valor) e categoria (na 2ª, depois da descrição).',
        m: 'Chips redundantes são escondidos (nas Receitas a forma não aparece). Para não quebrar a linha, o nome do cartão encurta: "Crédito Bradesco" → "CC Bradesco" → "CC Brad.". A cor de cada chip é a escolhida em {ver:config}.' },
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
    id: 'proximos', emoji: '⏰', titulo: 'Próximos e Pendências',
    itens: [
      { t: 'O que aparece', r: 'O que ainda vai acontecer, do mês em exibição em diante: um grupo por mês (só os que têm lançamento), com Despesas e Receitas dentro.',
        m: 'Os meses aparecem em zebrado, 5 por vez, e começam fechados; ao trocar o mês no calendário, ele vira o início da lista. A fatura de cada cartão aparece igual a "A pagar" (veja {ver:listas} e {ver:cartao}). Ocorrências "a confirmar" não aparecem aqui (ficam no grupo próprio, veja {ver:recorrencias}).' },
      { t: 'Botões do dashboard', r: 'Abaixo dos cards: + Lançamento, 🔁 Recorrências, ⏰ Próximos e 🕓 Recentes; depois a busca e a 🗑️ Lixeira.',
        m: 'Em telas estreitas os botões encolhem e, no limite, mostram só o emoji.' },
      { t: 'Pendências', r: 'Uma barra fixa logo abaixo da barra de meses avisa quando há algo para resolver ("N pendências para resolver") e abre a lista.',
        m: 'Contam como pendência as duplicatas de todos os meses e as ocorrências "a confirmar" já vencidas, inclusive de meses anteriores. A lista é separada por mês (como em Próximos), cada grupo ("🔁 A confirmar" e "📑 Duplicatas") tem os botões de confirmar/aceitar todas e apagar todas, e cada item tem os mesmos botões de sempre. Na Home de cada mês (nenhuma aba aberta) aparecem esses dois grupos do mês em exibição. Sem pendências, a barra some.' },
    ],
  },
  {
    id: 'recorrencias', emoji: '🔁', titulo: 'Recorrências',
    itens: [
      { t: 'Recorrências', r: 'Cadastre lançamentos fixos (conta mensal, assinatura, salário, sessão semanal) uma vez; o app cria as ocorrências dos próximos meses.',
        m: 'O cadastro é só pelo app (botão 🔁 Recorrências). Cada recorrência é mensal (dia 1–31 ou "Variável") ou semanal (um dia da semana ou "Variável", de 7 em 7 dias), tem valor por ocorrência, forma de pagamento, categoria, descrição, mês de início e duração (Contínua, ou um número de meses — aí aparece o Total).' },
      { t: 'Ocorrências "a confirmar"', r: 'Cada ocorrência nasce como lançamento "a confirmar", até o fim do mês seguinte (em novembro já existe a de dezembro).',
        m: 'Elas já contam em "a pagar"/"a receber", mas ficam num grupo próprio "🔁 A confirmar" (nas abas Receita/Despesa, na Home do mês e na busca), nunca misturadas à lista nem em Próximos. O ✓ confirma; o ✗ pergunta se apaga só aquele mês ou encerra a recorrência; editar e salvar também confirma. As vencidas vão para as Pendências. Lançamentos de recorrência levam o selo 🔁.' },
      { t: 'Dia, dia útil e mês de referência', r: 'No mensal, dia 29, 30 ou 31 em mês mais curto cai no último dia; fim de semana ou feriado vai para o próximo dia útil (no cartão de crédito vale qualquer dia).',
        m: 'O <b>Mês de referência</b> (Mesmo / Anterior / Próximo) diz a que mês a ocorrência pertence em relação à data. Ex.: salário de outubro pago no último dia de setembro = dia 31 + "Próximo" → 30/09 (competência outubro), 31/10 (novembro)... A competência sai da data da regra, não da data ajustada ao dia útil: salário do dia 31/10 pago em 03/11 continua sendo de outubro.' },
      { t: 'Variável e valor de cada mês', r: 'Mensal "Variável" cria ocorrências sem dia definido ("?/mês", valem como fim do mês) até você escolher a data.',
        m: 'A data pode ser escolhida editando no app, no ✏️ Editar do rascunho do bot ou pelo vencimento que vem no e-mail da conta. O valor de cada nova ocorrência é o da última confirmada (conta de luz: o último valor vira a referência do mês seguinte); se você mudar o valor da recorrência à mão, esse passa a valer.' },
      { t: 'Semanais', r: 'As ocorrências de uma recorrência semanal aparecem agrupadas num subgrupo "&lt;nome&gt; · semanal", com a quantidade e o total.',
        m: 'O agrupamento aparece quando há 2 ou mais da mesma recorrência no mesmo grupo, vale em qualquer visão (filtros, Próximos, A confirmar) e continua depois de confirmadas. Ocorrências semanais nunca contam como duplicatas, e o grupo conta como um lançamento só.' },
      { t: 'Editar, encerrar e excluir', r: 'Editar a recorrência muda só as ocorrências futuras ainda "a confirmar"; o que já foi confirmado fica como está.',
        m: 'Mudar o mês de início refaz as ocorrências a confirmar. Ao criar com início no passado, o app pergunta se cria também as ocorrências que já passaram (sempre como "a confirmar"). O botão de stop encerra (vai para "Encerradas", de onde o play a traz de volta) e a 🗑️ exclui; os dois pedem confirmação e nunca apagam lançamentos já confirmados. Cada grupo (Despesa, Receita, Encerradas) mostra 5 por vez.' },
      { t: 'E-mail da conta', r: 'O campo "E-mail(s) da conta" liga a recorrência às contas que chegam por e-mail (veja {ver:telegram}).',
        m: 'Informe o remetente ou uma palavra do assunto; vários separados por ponto e vírgula (;).' },
    ],
  },
  {
    id: 'busca', emoji: '🔎', titulo: 'Busca e Recentes',
    itens: [
      { t: 'Busca universal', r: 'Procura em todo o app, de qualquer tela, no mês em exibição; resultado separado em Receitas e Despesas.',
        m: 'Aceita dicas: <em>&gt;100</em> (maior que), <em>&lt;50</em>, <em>100-200</em> (faixa), um ano (<em>2026</em>), mês (<em>jan</em>) e frases exatas entre aspas. "Buscar em todos os meses" amplia para o histórico inteiro. Também aparecem, em grupos próprios, as ocorrências "a confirmar" e as duplicatas que batem com o termo (com a etiqueta "ref. mês/ano" quando são de outro mês) e os itens da {ver:lixeira}. Estornos de cartão aparecem em Despesas, com "+".' },
      { t: 'Recentes', r: 'Os últimos lançamentos criados, de qualquer mês, 5 por vez.',
        m: 'Útil para conferir o que acabou de entrar (inclusive pelo {ver:telegram} ou pelo {ver:openfinance}) e corrigir rápido.' },
    ],
  },
  {
    id: 'lixeira', emoji: '🗑️', titulo: 'Lixeira',
    itens: [
      { t: 'Excluídos por 30 dias', r: 'Lançamentos excluídos ficam na lixeira por 30 dias; dá para restaurar. Depois somem de vez.',
        m: 'Restaurar devolve o lançamento exatamente como estava. A lista mostra 5 por vez ("Carregar mais"), e os itens da lixeira também aparecem na {ver:busca}.' },
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
      { t: 'Gráfico e tabela', r: 'O gráfico é a primeira linha da tabela: duas barras por mês (receita e despesa), empilhadas por categoria/forma. O Balanço do mês aparece como um trecho sem cor, com contorno pontilhado, completando a barra menor (sobra na despesa, déficit na receita). Ocorrências "a confirmar" não entram na Visão anual.',
        m: 'Ao focar num mês, o gráfico vira horizontal e ocupa a largura toda: uma barra de receita e uma de despesa, empilhadas por categoria/forma (com o % nos trechos largos). Os cartões do topo mostram sempre o ano (ou mês) inteiro, mesmo com um filtro ativo. Os filtros de despesas e de receitas são menus separados (escolher um limpa o outro, e a tabela mostra só o lado filtrado). No extrato, cada mês é um subgrupo com o funil de sempre — forma de pagamento (quando se agrupa por categoria) ou categoria (quando se agrupa por forma) —, que só aparece se houver mais de uma opção. Os lançamentos do extrato podem ser editados e excluídos ali mesmo; ao salvar, cancelar ou excluir, a Visão anual volta como estava (filtro, mês, grupos abertos e posição da página). Ao filtrar por uma categoria (ou forma de pagamento), o extrato com os lançamentos é dividido em subgrupos por mês (fechados, mais recente primeiro); cada mês tem contorno e seta branca, e tanto a lista de meses quanto os itens de cada subgrupo mostram 5 por vez com "Carregar mais 5". Na comparação de dois meses, a lista de meses mostra só os que têm lançamento no ano, e o mês escolhido em um dropdown aparece desativado no outro (não dá para comparar um mês com ele mesmo). Na comparação de dois meses também: quatro barras na mesma escala, agrupadas por tipo (as receitas dos dois meses juntas e, abaixo, as despesas dos dois meses). Meses passados sem lançamentos não aparecem; os futuros aparecem para planejamento. A tabela começa pela linha <b>Balanço</b> (receitas − despesas de cada mês). Depois vêm os blocos DESPESAS e RECEITAS: a linha do título já mostra o total de cada mês e, logo abaixo, a variação com o mês anterior; as linhas por categoria/forma ficam recolhidas — toque no título do bloco para abrir ou fechar (filtrar uma categoria abre o bloco dela). Cada linha mostra o valor por mês e o total do ano, com intensidade de cor proporcional ao valor. <b>Ordem</b>: as linhas seguem o maior total do ano; ao focar num mês, seguem o maior valor daquele mês. Em cada barra do gráfico, o maior valor do mês fica na base.' },
      { t: 'Filtrar uma linha', r: 'Toque no nome de uma categoria/forma para ver só ela; toque de novo para voltar.',
        m: 'O filtro vale para cartões, gráfico e tabela.' },
      { t: 'Focar num mês', r: 'Toque no nome de um mês para destacá-lo nos cartões, no gráfico e na tabela.',
        m: 'Aparece um botão "Mês ✕" para voltar a ver o ano todo.' },
      { t: 'Comparar meses', r: '"⇄ Comparar meses" põe dois meses lado a lado (A e B), com a diferença e a variação em %; o ⇅ inverte A e B.',
        m: 'Mostra receitas e despesas separadas, ordenadas pela maior diferença.' },
      { t: 'Estornos no ano', r: 'Estornos de cartão abatem a despesa (por forma) ou viram a linha "(−) Estornos no cartão" (por categoria).',
        m: 'É a mesma regra do dashboard: o estorno não conta como receita.' },
      { t: 'Esconder valores', r: 'O botão 👁 da página esconde os números (••••).', m: 'Vale só para a visão anual/dashboard e só até fechar o app: ao abrir de novo os valores voltam escondidos.' },
    ],
  },
  {
    id: 'config', emoji: '⚙️', titulo: 'Configurações',
    itens: [
      { t: 'Categorias', r: 'Categorias de Receita e de Despesa: criar, renomear, reordenar (▲▼), ordenar A→Z, ativar/desativar, remover e trocar a cor.',
        m: 'Receita e Despesa são listas separadas (o mesmo nome pode existir nas duas, cada uma com a sua cor). Fixas: <b>Reembolso</b> e <b>Dinheiro</b> (Receita) e <b>Estorno</b> (Despesa, só aparece com cartão de crédito). Renomear uma categoria atualiza todos os lançamentos antigos.' },
      { t: 'Formas de pagamento', r: 'Cadastre PIX, Dinheiro e cartões de crédito (banco, dia de fechamento, dia de vencimento, melhor dia de compra).',
        m: 'O <b>melhor dia de compra</b> é sugerido a partir do fechamento. Desativar uma forma a tira dos formulários, mas ela continua valendo nos lançamentos antigos e mantém a cor. A ordem que você definir é a do dropdown do lançamento.' },
      { t: 'Cores', r: 'Toque na bolinha de cor de uma categoria ou forma para escolher a cor do chip. O botão "🎲 Cor aleatória" sorteia uma cor bem diferente de todas as que já existem.',
        m: 'A cor vale no app inteiro: listas, busca, barras, gráficos e visão anual — e é retroativa para lançamentos antigos.' },
      { t: 'Feriados', r: 'Feriados nacionais, estaduais (por UF) e municipais; servem para ajustar vencimentos ao dia útil.',
        m: 'Nacionais e estaduais oficiais não podem ser apagados, só desativados; "sincronizar" completa pela Nager.Date. Municipais e avulsos você cadastra.' },
      { t: 'Notificações', r: 'Vincule o bot do {ver:telegram} à sua conta e veja os comandos e como lançar por mensagem.' },
      { t: 'Dados', r: 'Baixar backup (JSON), restaurar um backup e apagar dados por seleção. "✉️ Enviar por e-mail" manda o backup completo para o e-mail da sua conta; além disso, todo dia 1 ele é enviado sozinho.',
        m: 'Você escolhe o que entra (categorias, formas, feriados, lançamentos e quais meses); o envio por e-mail leva sempre tudo, num arquivo .json que o "Importar Backup" restaura. Apagar é irreversível — exige confirmação. O envio usa o Resend: sem domínio próprio verificado, o e-mail só chega ao endereço da conta do Resend.' },
    ],
  },
  {
    id: 'openfinance', emoji: '🏦', titulo: 'Open Finance (Pluggy)',
    itens: [
      { t: 'Conectar contas', r: 'Conecte suas contas e cartões pela Pluggy para trazer as movimentações do banco.',
        m: 'Fica em {ver:config} > Open Finance (não funciona no modo teste). Cada conexão vira contas que você pode sincronizar, reconectar, desconectar ou apagar.' },
      { t: 'Forma de pagamento da conta', r: 'Cada conta precisa estar ligada a uma forma de pagamento do app para sincronizar.',
        m: 'Sem essa ligação ("Selecione...") a sincronização é bloqueada, para nunca importar lançamentos sem forma. Escolha quais contas entram na sincronização.' },
      { t: 'Sincronizar e revisar', r: 'A sincronização traz as transações para uma fila de revisão; você confere, ajusta e importa.',
        m: 'Escolha o período (mês/ano) e a conta. Na fila você pode editar categoria e descrição, ignorar itens, marcar prontos e importar. O app aprende as categorias que você usa para sugerir melhor e detecta duplicatas de lançamentos que você já tinha. Algo já confirmado em outro lugar (ex.: pelo Telegram) não é importado de novo. Rendimentos e dividendos podem ser ignorados ou agrupados (um lançamento por conta e por mês, com a soma do mês).' },
      { t: 'Histórico e ignoradas', r: 'O que já foi conciliado e o que foi ignorado ficam guardados, com opção de editar, excluir ou reativar.',
        m: 'Assim nada se perde e você pode voltar atrás numa decisão.' },
    ],
  },
  {
    id: 'telegram', emoji: '🤖', titulo: 'Bot do Telegram',
    itens: [
      { t: 'Vincular', r: 'Em {ver:config} > Notificações, gere o código e toque no link para vincular o bot à sua conta.',
        m: 'Depois de vinculado, o bot avisa quando chega lançamento novo do banco (só do mês vigente; os de meses anteriores ficam só na fila do app), manda um backup semanal (domingo) e avisa vencimentos e erros.' },
      { t: 'Lançar por mensagem', r: 'Escreva como falaria: "gastei 35,90 no mercado", "recebi 200 de salário", "comprei um carro de 80000 em 10x".',
        m: 'O bot entende valor, tipo, categoria (pelo texto), forma de pagamento (ex.: "no pix", "no nubank") e parcelas. Reconhece as categorias que você cadastrou, inclusive de várias palavras (entre "Casa" e "Casa e Manutenção", vale a mais específica), sem diferenciar maiúsculas e acentos. O que sobra do texto vira a descrição. Receita entra sempre como PIX. Escreva "sem data" (ou "data indefinida") para lançar só com o mês. Monta um rascunho e só grava após ✅ Confirmar. Para ajustar, responda (reply) ao rascunho: o bot troca o que o texto citar — categoria, forma de pagamento, tipo ("receita"/"despesa"), valor, data ("25/09", "ontem", "há 3 dias") e parcelas ("5x", "à vista", só no crédito) — e o que sobrar vira a descrição.' },
      { t: 'Datas no texto', r: 'Diga a data: "ontem uber 10 reais", "25/09 uber 10 reais", "25 de setembro", "dia 25". Sem data vale hoje.',
        m: 'Entende hoje, ontem, anteontem, "há N dias", "semana passada", "mês passado", dd/mm, dd/mm/aaaa, "25 de setembro" e "dia 25". Sem o ano, usa o ano atual (ou o anterior se a data ficaria muito no futuro). Também dá para digitar só a data com um rascunho aberto.' },
      { t: 'Botões do rascunho', r: 'Cada rascunho traz na própria mensagem ✅ Confirmar, ✏️ Editar e ❌ Cancelar, então dá para ter vários pendentes e tratar um por um.',
        m: '✅ Confirmar grava uma vez só, mesmo com dois toques seguidos, e a mensagem mostra o gasto diário atualizado. ✏️ Editar abre o formulário (o mesmo do app) já preenchido; ao salvar, só aquele rascunho sai da fila. ❌ Cancelar não apaga: o rascunho fica "descartado" e a mensagem ganha o botão ♻️ Resgatar, que o devolve como estava. Rascunhos não confirmados somem depois de 7 dias.' },
      { t: 'Lançamento parecido', r: 'Antes de montar um rascunho, o bot procura no mês algo parecido (mesmo nome e valor, ou mesmo valor em até 3 dias) e pergunta o que fazer.',
        m: 'Vale para mensagem, SMS encaminhado, e-mail de conta e Pluggy. Os botões, na mesma linha: <b>🔄 Atualizar</b> (é o mesmo: muda o valor/data do que já existe), <b>➕ Criar novo</b> (é outro: mantém o existente e segue com o novo) e <b>❌ Cancelar</b> (é o mesmo: nada é lançado). No aviso de e-mail sem valor nem vencimento, o Atualizar não aparece. Se a mensagem bate com uma recorrência que está "a confirmar", o rascunho atualiza essa ocorrência em vez de criar outro lançamento (o bot avisa "🔁 Isto bate com a recorrência").' },
      { t: 'Sem links nas mensagens', r: 'Descrições vindas do banco não viram link: "apple.com/bill" aparece como "Apple" e o Telegram não mostra pré-visualização de links.',
        m: 'Vale para o aviso de lançamento novo do banco e para a descrição preenchida sozinha na revisão do Open Finance.' },
      { t: 'Estorno pelo bot', r: 'Diga "estorno 50 uber" ou escolha a categoria Estorno: o bot usa um cartão de crédito e abate a fatura.',
        m: 'A categoria Estorno só existe a partir do primeiro cartão. Nesse rascunho a forma de pagamento aceita só cartão de crédito e não há parcelas.' },
      { t: 'E-mail da conta', r: 'Contas que chegam por e-mail (luz, gás, condomínio...) viram rascunho no bot, ligados à recorrência.',
        m: 'Um Google Apps Script no Gmail (scripts/gmail-contas.gs) manda ao bot qualquer e-mail que cair no rótulo "Contas". O bot liga o e-mail a uma recorrência pelo campo "E-mail(s) da conta" (remetente ou palavra do assunto) ou, sem ele, pelas palavras da descrição (ex.: "condomínio", "light"). Lê valor e vencimento do texto e atualiza a ocorrência "a confirmar" do mês (com vencimento, ela deixa de ser "?/mês"); sem valor no e-mail (ex.: só PDF), vale o do mês anterior. Vários e-mails da mesma conta viram um rascunho só, e o bot só avisa de novo se o valor ou o vencimento mudarem. Achando um lançamento parecido, pergunta antes (veja "Lançamento parecido"); se o e-mail não traz valor nem vencimento, "atualizar" responde que não conseguiu (edite pelo app). Valor muito diferente do mês anterior vem com um aviso.' },
      { t: 'Lembrete de recorrência', r: 'No dia de uma ocorrência "a confirmar", o bot avisa (sem botões) que ela está em "A confirmar" no app.',
        m: 'Para resolver pelo bot, use /pendencias: tocar no número da ocorrência monta o rascunho a partir dela (mesmos dados, nenhuma linha nova). ✅ Confirmar o confirma, ✏️ Editar ajusta e ❌ Cancelar só descarta o rascunho — o lançamento segue em "a confirmar" no app. Nada no bot encerra ou apaga a recorrência; se você já resolveu no app, o bot avisa e não duplica nada.' },
      { t: 'Lembrete de vencimento', r: 'Todo dia às 9h o bot avisa as despesas que vencem naquele dia (inclusive as programadas no cartão) e as faturas de cartão que vencem hoje.',
        m: 'Todos os vencimentos do dia saem numa mensagem só, com um botão "Marcar como pago" por despesa (marca o mesmo checkbox do app; vira "Desmarcar como pago"). Não avisa o que foi lançado no próprio dia, o que já está marcado como pago, o que veio do banco nem receitas; sem data definida, avisa no último dia do mês. No cartão, só a despesa programada (ex.: conta de luz paga no cartão) é avisada; compra comum e parcela não. A fatura é avisada no dia do vencimento (em fim de semana ou feriado, no próximo dia útil, igual ao app), com o total (compras menos estornos), se não estiver marcada como paga. Cada lançamento ou fatura é avisado uma vez só.' },
      { t: 'Comandos', r: '/resumo, /diario, /credito, /pix, /ultimos, /pendencias, /atualizar, /pgtopadrao, /lancamento e /backup.',
        m: '<ul><li><b>/resumo</b>: receitas, despesas e balanço do mês.</li><li><b>/pendencias</b>: lista as ocorrências a confirmar e as possíveis duplicatas do mês, numeradas, com um botão por item: a confirmar abre o rascunho; duplicata abre "Não é duplicata" ou "Editar" (para apagar, use o app).</li><li><b>/diario</b>: quanto ainda pode gastar por dia.</li><li><b>/credito</b>: gasto por cartão e total.</li><li><b>/pix</b>: total no PIX, pago e a pagar.</li><li><b>/ultimos</b>: os 5 últimos lançamentos, numerados; toque em 1 a 5 para editar aquele lançamento. Parcelados são editados pelo app.</li><li><b>/atualizar</b>: pede dados novos ao banco e mostra as últimas transações; toque no número para lançar uma delas.</li><li><b>/pgtopadrao</b>: forma de pagamento usada quando a mensagem não diz qual.</li><li><b>/lancamento</b>: explica como lançar por mensagem.</li><li><b>/backup</b>: manda o backup agora.</li></ul>' },
    ],
  },
  {
    id: 'regras', emoji: '🧮', titulo: 'Regras de cálculo',
    itens: [
      { t: 'Realizado x futuro', r: 'Um lançamento é "realizado" quando a data é hoje ou anterior; depois disso é futuro. Lançamento programado só é realizado depois de marcado como Pago/Recebido.',
        m: 'Isso define "recebido" x "a receber" no card de Receita e o que entra em "pago" x "a pagar" na Despesa. Veja {ver:lancar} > Pago / Recebido.' },
      { t: 'Caminho do dinheiro (Despesa)', r: 'Pago = o que já saiu do bolso; a pagar = o que ainda vai sair.',
        m: 'Compra de cartão só sai do bolso quando a fatura é paga (vencida ou marcada). Por isso a compra no crédito aparece na fatura, e não em "pago", até lá.' },
      { t: 'Estorno e reembolso', r: 'Estorno (cartão) abate a fatura e não é receita; Reembolso é receita comum.',
        m: 'Estorno só em cartão de crédito; Reembolso entra como qualquer receita (por PIX).' },
      { t: 'Vencimento em dia útil', r: 'Vencimentos que caem em fim de semana ou feriado são levados para o próximo dia útil.',
        m: 'Usa os feriados de {ver:config}. Vale para a fatura do cartão (no app e no lembrete do bot) e para as recorrências fora do cartão.' },
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
      <li>Reembolso (dinheiro que volta por PIX) é diferente: é uma receita comum.</li>
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
      <li>Exemplo da regra: num grupo com 4 de Casa, 1 de Alimentação, 1 de Transporte e 1 de Bloco, o filtro aparece, mas só "Casa" vira subgrupo; os outros três ficam soltos.</li>
      <li>Na Despesa, o grupo já se divide por forma de pagamento; o funil de Categoria fica dentro de cada forma (e dentro de cada fatura, onde os estornos ficam soltos no topo).</li>
      <li>Na Receita (sempre PIX) o único filtro é o de Categoria.</li>
      <li>No grupo "A confirmar", dá para combinar Categoria e Forma de pagamento sem chips repetidos.</li>
      <li>Uma recorrência semanal agrupada conta como um lançamento só.</li>
      <li>Nenhum grupo ou subgrupo começa aberto (em nenhuma lista): fica aberto só o que você abrir.</li>
    </ul>`,
  'Duplicatas': `
    <ul>
      <li>Cada conjunto de lançamentos repetidos vira um subgrupo (quando há mais de um). Cada lançamento leva um selo: "original" (o mais antigo, que fica) ou "duplicata" (a cópia que o app sugere apagar). O número ao lado de "Duplicatas" conta só as cópias.</li>
      <li>Com um conjunto só, o grupo tem "≠ Não é duplicata" (mantém tudo e não avisa de novo) e "✓ Apagar cópia" (apaga a cópia e preserva o original).</li>
      <li>Com dois ou mais, o grupo tem "Nenhuma é duplicata" e "Apagar todas as cópias", e cada subgrupo tem os seus dois botões.</li>
      <li>Apagar passa pela Lixeira e tem "Desfazer" por 5 segundos. "Não é duplicata" fica gravado e vale em todos os aparelhos.</li>
      <li>O grupo aparece na Home do mês, nas Pendências e na busca.</li>
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
      <li>Abaixo, a tabela: primeiro o Balanço do mês; depois DESPESAS e RECEITAS (total e variação sempre à vista; as linhas por categoria/forma abrem ao tocar no título), com valores mensais e total do ano.</li>
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
      <li><b>Tipo</b>: verbos como "gastei/comprei/paguei" = despesa; "recebi/ganhei/vendi" = receita (sempre por PIX); sem verbo, despesa.</li>
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
    <p>Todos funcionam no chat do bot, depois de vincular. /atualizar e /pgtopadrao abrem menus no teclado (sempre com ❌ Cancelar). Em /atualizar, toque no número de uma transação para transformá-la em rascunho de lançamento (com a forma de pagamento da conta). O vínculo é feito em Configurações > Notificações (veja "Vincular" acima).</p>`,
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
    const texto = it => (it.t + ' ' + it.r + ' ' + (it.m || '').replace(/<[^>]+>/g, ' ')).toLowerCase(); // m é opcional
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
