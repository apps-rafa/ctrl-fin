// Dados de exemplo do ambiente de desenvolvimento (dev/). "Hoje" simulado: 01/10/2026.
(function () {
  const U = 'dev-user';
  let id = 1;
  const menu = (o) => ({ id: id++, user_id: U, status: 'Ativo', ordem: null, descricao: '', cor: null, ...o });
  const cats = (tipo, nomes) => nomes.map((nome, i) => menu({ tipo: 'Categoria', nome, categoria_tipo: tipo, ordem: i + 1 }));
  const menu_itens = [
    ...cats('saidas', ['Alimentação', 'Alimentação app', 'Assinaturas', 'Casa', 'Estorno', 'Mercado', 'Saúde', 'Transporte']),
    ...cats('entradas', ['Salário', 'Freelance', 'Reembolso', 'Dinheiro']),
    menu({ tipo: 'Método', nome: 'PIX', metodo_kind: 'PIX', banco: '', ordem: 1 }),
    menu({ tipo: 'Método', nome: 'Crédito — Bradesco', metodo_kind: 'Crédito', banco: 'Bradesco', dia_fechamento: 5, dia_vencimento: 15, melhor_dia_compra: 6, ordem: 2 }),
    menu({ tipo: 'Método', nome: 'Dinheiro', metodo_kind: 'Dinheiro', banco: '', ordem: 3 }),
  ];
  let tid = 1;
  const t = (tipo, data, valor, categoria, metodo, descricao, extra = {}) => ({
    id: tid++, user_id: U, tipo, data, valor, categoria, metodo, descricao: descricao || '',
    forma_pagamento: 'À vista', tipo_recorrencia: 'Pontual', status: 'Ativa', pendente: false,
    competencia: data.slice(0, 7) + '-01', criado_em: data + 'T12:00:00Z', ...extra,
  });
  const transacoes = [
    t('entradas', '2026-10-01', 8003.10, 'Salário', '', 'Salário outubro'),
    t('entradas', '2026-10-20', 1916.66, 'Freelance', '', 'Projeto X'),
    t('saidas', '2026-10-01', 19.90, 'Assinaturas', 'Crédito Bradesco', 'Apple.com/bill'),
    t('saidas', '2026-10-26', 67.87, 'Casa', 'PIX', 'Gás'),
    t('saidas', '2026-10-13', 1115.70, 'Casa', 'PIX', 'Condomínio'),
    t('saidas', '2026-10-08', 120.00, 'Mercado', 'Crédito Bradesco', 'Supermercado'),
    t('saidas', '2026-10-12', 45.50, 'Transporte', 'Crédito Bradesco', 'Uber'),
    t('saidas', '2026-10-15', 300.00, 'Saúde', 'Crédito Bradesco', 'Consulta'),
    t('saidas', '2026-09-23', 40.60, 'Transporte', 'Crédito Bradesco', 'volta do projac', { competencia: '2026-10-01' }),
    t('saidas', '2026-09-21', 9.92, 'Transporte', 'Crédito Bradesco', 'Uber ensaio', { competencia: '2026-10-01' }),
    t('saidas', '2026-09-21', 25.00, 'Alimentação', 'Crédito Bradesco', 'Caipirinha ensaio', { competencia: '2026-10-01' }),
    t('saidas', '2026-09-15', 55.00, 'Alimentação app', 'Crédito Bradesco', '99 - volta do projac', { competencia: '2026-09-01' }),
    t('saidas', '2026-09-20', 113.66, 'Alimentação app', 'Crédito Bradesco', '99 food - almoço', { competencia: '2026-09-01' }),
    t('saidas', '2026-09-19', 8.50, 'Mercado', 'Crédito Bradesco', 'Hortifruti', { competencia: '2026-09-01' }),
    t('saidas', '2026-11-03', 89.90, 'Assinaturas', 'Crédito Bradesco', 'Streaming', { competencia: '2026-11-01' }),
    t('saidas', '2026-11-10', 500.00, 'Casa', 'PIX', 'Reforma', { competencia: '2026-11-01' }),
    t('entradas', '2026-11-05', 2000.00, 'Freelance', '', 'Projeto Y', { competencia: '2026-11-01' }),
  ];
  const recorrencias = [
    { id: 1, tipo: 'saidas', frequencia: 'mensal', diaSemana: null, valor: 190, meses: null, metodo: 'PIX', categoria: 'Saúde', descricao: 'Terapia', criadoEm: '2026-08' },
    { id: 2, tipo: 'saidas', frequencia: 'semanal', diaSemana: 2, valor: 190, meses: 6, metodo: 'PIX', categoria: 'Saúde', descricao: 'Personal', criadoEm: '2026-09' },
    { id: 3, tipo: 'saidas', frequencia: 'mensal', diaSemana: null, valor: 1115.7, meses: 36, metodo: 'PIX', categoria: 'Casa', descricao: 'Financiamento', criadoEm: '2026-10' },
    { id: 4, tipo: 'saidas', frequencia: 'mensal', diaSemana: null, valor: 39.9, meses: null, metodo: 'Crédito Bradesco', categoria: 'Assinaturas', descricao: 'Streaming', criadoEm: '2026-10' },
    { id: 5, tipo: 'entradas', frequencia: 'mensal', diaSemana: null, valor: 8003.1, meses: null, metodo: 'PIX', categoria: 'Salário', descricao: 'Salário', criadoEm: '2026-07' },
    { id: 6, tipo: 'entradas', frequencia: 'semanal', diaSemana: null, valor: 300, meses: 3, metodo: 'PIX', categoria: 'Freelance', descricao: 'Aulas particulares', criadoEm: '2026-09' },
  ];
  window.__SEED__ = {
    recorrencias,
    user: { id: U, email: 'dev@local', is_anonymous: false },
    tables: { menu_itens, transacoes, transacoes_importadas: [], feriados: [], pluggy_contas: [], lixeira: [], pluggy_credenciais: [], faturas_pagas: [], telegram_users: [], pluggy_faturas: [] },
  };
})();

// No dev os valores já aparecem (no app real começam ocultos até tocar no olho).
window.addEventListener('load', () => setTimeout(() => {
  if (typeof valoresOcultos !== 'undefined') { valoresOcultos = false; if (typeof atualizarUI === 'function') atualizarUI(); }
}, 300));
