-- O backup passa a ser só por e-mail, na periodicidade escolhida em Configurações > E-mails (cron 'backup-email').
-- Remove o agendamento antigo que mandava o backup pelo Telegram todo domingo. O comando /backup (manual) continua existindo.
select cron.unschedule('backup-semanal');
