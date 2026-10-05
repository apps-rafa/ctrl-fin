/**
 * Gmail -> Telegram: contas recorrentes (luz, gás, condomínio...) viram rascunho no bot.
 *
 * Como instalar (uma vez só):
 *  1) Gmail: crie o rótulo "Contas" e um filtro por remetente que aplique o rótulo (e, se quiser, pule a caixa de entrada).
 *     Remetentes: gestaoacpl@paulolucio.com.br, fatura@faturapredialnet.com.br, conta.inteligente@naturgy.com,
 *     faturadigital@lightvirtual.com.br  (filtro: De: a OR b OR c OR d -> Aplicar o rótulo "Contas").
 *  2) script.google.com -> Novo projeto -> cole este arquivo.
 *  3) Configurações do projeto -> Propriedades do script -> adicione:
 *       URL     = https://hhmuqgkabknquvhxafmf.supabase.co/functions/v1/telegram-webhook
 *       SEGREDO = (o segredo "email_conta" que o Claude te passou)
 *  4) Execute "processarContas" uma vez (autorize o acesso ao Gmail) e crie um acionador:
 *     Acionadores -> Adicionar -> processarContas -> Baseado em tempo -> a cada 5 minutos.
 *
 * Cada e-mail com o rótulo "Contas" e SEM o rótulo "Contas/enviado" é enviado uma vez ao bot e recebe "Contas/enviado".
 * O bot acha a recorrência pelo remetente (campo "E-mail da conta" da recorrência), lê valor/vencimento do texto (sem valor
 * no texto, vale o valor do mês anterior) e manda o rascunho com Confirmar / Editar / Cancelar.
 */
function processarContas() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('URL');
  var segredo = props.getProperty('SEGREDO');
  if (!url || !segredo) throw new Error('Defina URL e SEGREDO nas propriedades do script.');

  var rotulo = GmailApp.getUserLabelByName('Contas');
  if (!rotulo) return; // rótulo ainda não criado
  var enviado = GmailApp.getUserLabelByName('Contas/enviado') || GmailApp.createLabel('Contas/enviado');

  // só threads com "Contas" que ainda não têm "Contas/enviado"
  var threads = GmailApp.search('label:Contas -label:Contas-enviado newer_than:14d', 0, 30);
  threads.forEach(function (thread) {
    var todosOk = true;
    thread.getMessages().forEach(function (m) {
      if (m.isInTrash()) return;
      var corpo = m.getPlainBody() || '';
      var resp = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-email-secret': segredo },
        muteHttpExceptions: true,
        payload: JSON.stringify({
          messageId: m.getId(),
          from: m.getFrom(),
          subject: m.getSubject(),
          body: corpo.substring(0, 40000)
        })
      });
      if (resp.getResponseCode() >= 300) todosOk = false; // tenta de novo na próxima rodada
    });
    if (todosOk) thread.addLabel(enviado);
  });
}
