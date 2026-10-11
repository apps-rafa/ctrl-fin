# Ctrl Fin — controle financeiro pessoal

App web (HTML + JS puro, sem framework) com dados no **Supabase** (Postgres + Auth), bot do **Telegram** e
Open Finance pela **Pluggy**. O manual de uso fica dentro do próprio app (botão Documentação, conteúdo em `js/docs.js`).

## Estrutura

| Pasta | O que tem |
|---|---|
| `index.html`, `js/`, `css/` | O app. Os scripts são globais (sem módulos); `scripts/modulos-lazy.json` lista os carregados sob demanda. |
| `lancamento-tg.html` | Formulário do ✏️ Editar do bot (Mini App do Telegram). |
| `supabase/functions/` | Edge Functions: `telegram-webhook` (bot, lembretes, e-mail de contas, tarefas agendadas), `pluggy-*`, `recorrencias`, `enviar-backup`, `telegram-gerar-codigo`; código comum em `_shared/`. |
| `supabase/migrations/` | Histórico das mudanças no banco (aplicadas no projeto `ctrl-fin`). `schema.sql` é a base inicial. |
| `tests/` | Testes (`node --test`) do bot, das recorrências, dos lembretes e de regras compartilhadas. |
| `scripts/` | Build do site, checagens, `gmail-contas.gs` (Google Apps Script que encaminha e-mails de contas ao bot). |
| `dev/` | App local com Supabase simulado e dados de exemplo (ver `dev/LEIA-ME.md`). |

## Comandos

```bash
npm run dev        # app local com dados falsos: http://localhost:8778
npm test           # testes
npm run check      # sintaxe dos js/ + carregamento do bundle
npm run check:bot  # checagem de tipos do bot
npm run build      # gera dist/ (minificado, com hash)
```

## Publicação

Tudo sai do branch `main` pelo GitHub Actions:

- **Publicar site** — testa, gera `dist/` e publica no GitHub Pages.
- **Deploy das Edge Functions** — testa e faz o deploy das funções no Supabase.
- **CI** — `check`, `check:bot` e testes em todo push/PR.

Mudanças no banco (migrações) são aplicadas à parte, antes do merge que depende delas.

## Configuração única

- Login com Google: `supabase/GOOGLE_LOGIN.md`.
- Segredos das funções (Telegram, Pluggy, Resend) ficam nos secrets do Supabase; o segredo das tarefas agendadas fica na
  tabela `app_cron_segredo`.
