// Supabase falso em memória (dev/): o mesmo da Demo (criarSupabaseSimulado, em js/demo.js), com os dados de dev/seed.js.
// Serve para abrir o app localmente e conferir as telas. js/demo.js é carregado depois, mas antes de js/config.js chamar createClient.
window.supabase = { createClient: () => criarSupabaseSimulado(window.__SEED__) };
console.log('🧪 Supabase simulado (dev/) — dados de exemplo');
