# Ambiente de desenvolvimento (dados falsos)

Abre o app localmente com um Supabase **simulado em memória** e dados de exemplo (`dev/seed.js`), sem login e sem rede.
Nada que você fizer aqui chega ao banco real.

```bash
npm run dev      # http://localhost:8778
```

- `dev/servir.mjs`: servidor estático que troca o script do Supabase (CDN) pelo simulado só na resposta; o `index.html` real não muda.
- `dev/mock-supabase.js`: `from().select().eq()...`, `insert/update/delete/upsert` e `auth` em memória. As Edge Functions (`functions.invoke`) devolvem vazio.
- `dev/seed.js`: categorias, formas de pagamento e lançamentos de set/out/nov de 2026. Edite para testar outros cenários.
- Recarregar a página volta aos dados iniciais.
