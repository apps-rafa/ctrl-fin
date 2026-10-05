/**
 * Gmail -> Telegram: qualquer e-mail com o rótulo "Contas" (luz, gás, condomínio...) vira rascunho no bot.
 *
 * Instalar (uma vez só, ~2 minutos):
 *  1) script.google.com -> Novo projeto -> cole este arquivo.
 *  2) Logo abaixo, troque COLE_O_SEGREDO_AQUI pelo segredo "email_conta" que o Claude te passou (a URL já está certa).
 *  3) Selecione a função "instalar" e clique em Executar. O Google pede autorização (Gmail e conexão externa): aceite.
 *     Isso guarda a configuração e cria sozinho o acionador que roda "processarContas" a cada 5 minutos.
 *  4) (opcional) Apague o segredo do código depois de rodar "instalar": ele já fica guardado nas propriedades do script.
 *
 * Não precisa de filtro por remetente além do que você já usa para aplicar o rótulo "Contas".
 * Cada e-mail com "Contas" e sem "Contas/enviado" é enviado uma vez ao bot e recebe "Contas/enviado". O bot liga o e-mail a uma
 * recorrência (pelo campo "E-mail da conta" dela ou pelas palavras da descrição, ex.: "condomínio", "light", "naturgy"), lê valor e
 * vencimento do texto (sem valor, vale o do mês anterior) e manda o rascunho. Vários e-mails da mesma conta (lembretes de
 * vencimento) viram um rascunho só; só avisa de novo se o valor ou o vencimento mudarem.
 */
var URL_BOT = 'https://hhmuqgkabknquvhxafmf.supabase.co/functions/v1/telegram-webhook';
var SEGREDO = 'COLE_O_SEGREDO_AQUI';

/** Roda uma vez: guarda URL/segredo e cria o acionador de 5 em 5 minutos. */
function instalar() {
  var props = PropertiesService.getScriptProperties();
  if (SEGREDO && SEGREDO !== 'COLE_O_SEGREDO_AQUI') props.setProperty('SEGREDO', SEGREDO);
  props.setProperty('URL', URL_BOT);
  if (!props.getProperty('SEGREDO')) throw new Error('Cole o segredo na variável SEGREDO e rode "instalar" de novo.');
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processarContas') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processarContas').timeBased().everyMinutes(5).create();
  processarContas(); // já processa o que estiver esperando
}

function processarContas() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('URL');
  var segredo = props.getProperty('SEGREDO');
  if (!url || !segredo) throw new Error('Rode "instalar" primeiro.');

  if (!GmailApp.getUserLabelByName('Contas')) return; // rótulo ainda não existe
  var enviado = GmailApp.getUserLabelByName('Contas/enviado') || GmailApp.createLabel('Contas/enviado');

  // threads com "Contas" que ainda não têm "Contas/enviado" (no Gmail, o filho "Contas/enviado" vira "Contas-enviado" na busca)
  var threads = GmailApp.search('label:Contas -label:Contas-enviado newer_than:30d', 0, 30);
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
