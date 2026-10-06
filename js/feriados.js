/**
 * FERIADOS
 * - Nacionais: calculados no navegador (fixos + móveis via Páscoa). Oficiais:
 *   não são apagáveis, só desativados.
 * - Estaduais: vêm da sincronização (Nager.Date) com a UF escolhida. Oficiais.
 * - Municipais / avulsos: cadastrados pelo usuário (apagáveis).
 * O usuário escolhe a categoria ao criar.
 *
 * Os cálculos de dia útil (recorrencia.js) consultam ehFeriado().
 */

// Feriados nacionais fixos: [mês 1-12, dia, nome]
const FERIADOS_NACIONAIS_FIXOS = [
  [1, 1, 'Confraternização Universal'],
  [4, 21, 'Tiradentes'],
  [5, 1, 'Dia do Trabalho'],
  [9, 7, 'Independência do Brasil'],
  [10, 12, 'Nossa Senhora Aparecida'],
  [11, 2, 'Finados'],
  [11, 15, 'Proclamação da República'],
  [11, 20, 'Consciência Negra'],   // nacional a partir de 2024 (Lei 14.759/2023)
  [12, 25, 'Natal']
];

// Feriados móveis: offset em dias em relação ao Domingo de Páscoa
const FERIADOS_NACIONAIS_MOVEIS = [
  [-47, 'Carnaval'],
  [-2, 'Sexta-feira Santa'],
  [60, 'Corpus Christi']
];

/** Domingo de Páscoa do ano (algoritmo de Meeus/Butcher). Retorna Date local. */
function domingoDePascoa(ano) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);      // 3=março, 4=abril
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

/** Lista de feriados nacionais de um ano: [{ data:'YYYY-MM-DD', nome }] */
function feriadosNacionaisDoAno(ano) {
  const out = FERIADOS_NACIONAIS_FIXOS.map(([mes, dia, nome]) => ({
    data: `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
    nome
  }));
  const pascoa = domingoDePascoa(ano);
  FERIADOS_NACIONAIS_MOVEIS.forEach(([offset, nome]) => {
    const dt = new Date(pascoa.getFullYear(), pascoa.getMonth(), pascoa.getDate() + offset);
    out.push({ data: formatarDataISO(dt), nome });
  });
  return out.sort((x, y) => x.data.localeCompare(y.data));
}

/* ================= Estado ================= */

const CATEGORIAS_FERIADO = ['nacional', 'estadual', 'municipal'];
const CATEGORIA_FERIADO_ROTULO = { nacional: 'Nacionais', estadual: 'Estaduais', municipal: 'Municipais' };

/**
 * Feriados estaduais por UF: [mês 1-12, dia, nome]. Lista curada — a
 * Nager.Date (usada no "sincronizar") só cobre alguns estados. O usuário
 * pode desativar os que não valerem e adicionar outros em "+".
 */
const FERIADOS_ESTADUAIS = {
  AC: [[1, 23, 'Dia do Evangélico'], [6, 15, 'Aniversário do Acre'], [9, 5, 'Dia da Amazônia'], [11, 17, 'Assinatura do Tratado de Petrópolis']],
  AL: [[6, 24, 'São João'], [6, 29, 'São Pedro'], [9, 16, 'Emancipação Política de Alagoas']],
  AM: [[9, 5, 'Elevação do Amazonas à Província'], [12, 8, 'Nossa Senhora da Conceição']],
  AP: [[3, 19, 'São José'], [9, 13, 'Criação do Território Federal do Amapá']],
  BA: [[7, 2, 'Independência da Bahia']],
  CE: [[3, 19, 'São José'], [3, 25, 'Data Magna do Ceará']],
  DF: [[4, 21, 'Fundação de Brasília'], [11, 30, 'Dia do Evangélico']],
  ES: [],
  GO: [],
  MA: [[7, 28, 'Adesão do Maranhão à Independência']],
  MG: [],
  MS: [[10, 11, 'Criação do Estado de Mato Grosso do Sul']],
  MT: [],
  PA: [[8, 15, 'Adesão do Pará à Independência']],
  PB: [[8, 5, 'Fundação do Estado da Paraíba']],
  PE: [[3, 6, 'Revolução Pernambucana de 1817'], [6, 24, 'São João']],
  PI: [[10, 19, 'Dia do Piauí']],
  PR: [[12, 19, 'Emancipação do Paraná']],
  RJ: [[4, 23, 'São Jorge']],
  RN: [[10, 3, 'Mártires de Cunhaú e Uruaçu']],
  RO: [[1, 4, 'Criação do Estado de Rondônia']],
  RR: [[10, 5, 'Criação do Estado de Roraima']],
  RS: [[9, 20, 'Revolução Farroupilha']],
  SC: [[8, 11, 'Dia de Santa Catarina'], [11, 25, 'Santa Catarina de Alexandria']],
  SE: [[7, 8, 'Emancipação Política de Sergipe']],
  SP: [[7, 9, 'Revolução Constitucionalista de 1932']],
  TO: [[10, 5, 'Criação do Estado do Tocantins']]
};

const feriadosState = {
  nacionalCalc: new Map(), // iso -> nome (nacionais calculados; sem linha no banco)
  estadualCalc: new Map(), // iso -> nome (estaduais da UF selecionada; sem linha)
  estadualUF: null,        // UF cujos estaduais estão em estadualCalc
  rows: [],                // linhas do banco: {id, data, nome, origem, oficial, ativo}
  anos: []                 // anos já calculados
};

/** Garante os feriados nacionais calculados de um intervalo de anos */
function calcularFeriadosNacionais(anoIni, anoFim) {
  for (let ano = anoIni; ano <= anoFim; ano++) {
    if (feriadosState.anos.includes(ano)) continue;
    feriadosState.anos.push(ano);
    feriadosNacionaisDoAno(ano).forEach(f => {
      if (!feriadosState.nacionalCalc.has(f.data)) feriadosState.nacionalCalc.set(f.data, f.nome);
    });
  }
}

/** Estaduais calculados da UF em `feriadosUF()` para uma janela de anos */
function calcularFeriadosEstaduais(anoIni, anoFim) {
  const uf = feriadosUF();
  if (feriadosState.estadualUF !== uf) {
    feriadosState.estadualCalc.clear();
    feriadosState.estadualUF = uf;
  }
  const lista = FERIADOS_ESTADUAIS[uf] || [];
  for (let ano = anoIni; ano <= anoFim; ano++) {
    lista.forEach(([mes, dia, nome]) => {
      const iso = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
      if (!feriadosState.estadualCalc.has(iso)) feriadosState.estadualCalc.set(iso, nome);
    });
  }
}

function _rowsData(iso) {
  const s = String(iso).slice(0, 10);
  return feriadosState.rows.filter(r => String(r.data).slice(0, 10) === s);
}

/** true se a data (ISO) é um feriado ATIVO (calculado ou cadastrado) */
function ehFeriado(iso) {
  const s = String(iso).slice(0, 10);
  const rs = _rowsData(s);
  if (rs.some(r => r.ativo)) return true;
  if (feriadosState.nacionalCalc.has(s) && !rs.some(r => r.origem === 'nacional' && !r.ativo)) return true;
  if (feriadosState.estadualCalc.has(s) && !rs.some(r => r.origem === 'estadual' && !r.ativo)) return true;
  return false;
}

/** Nome do feriado da data, ou '' */
function nomeFeriado(iso) {
  const s = String(iso).slice(0, 10);
  const ativo = _rowsData(s).find(r => r.ativo);
  if (ativo) return ativo.nome;
  return feriadosState.nacionalCalc.get(s) || feriadosState.estadualCalc.get(s) || '';
}

/* ================= Supabase ================= */

async function _recarregarRows() {
  try {
    const { data, error } = await sb.from('feriados').select('*');
    if (error) throw error;
    feriadosState.rows = data || [];
  } catch (e) {
    console.warn('Feriados: falha ao carregar do banco', e?.message || e);
    feriadosState.rows = [];
  }
}

/** Carga inicial: calcula nacionais/estaduais do intervalo e lê as linhas do banco */
async function carregarFeriados() {
  const anoBase = (typeof estadoApp !== 'undefined' && estadoApp.mesAtual)
    ? estadoApp.mesAtual.getFullYear() : new Date().getFullYear();
  calcularFeriadosNacionais(anoBase - 1, anoBase + 3);
  calcularFeriadosEstaduais(anoBase - 1, anoBase + 3);
  await _recarregarRows();
}

/**
 * Ativa/desativa um feriado.
 * - Calculado (sem id): grava um override oficial.
 * - Com id: atualiza o campo ativo.
 */
async function definirFeriadoAtivo({ id, iso, nome, origem = 'nacional', ativo }) {
  if (id) {
    const { error } = await sb.from('feriados').update({ ativo }).eq('id', id);
    if (error) { console.error(error); throw error; }
  } else {
    const nm = nome || nomeFeriado(iso) || 'Feriado';
    const { error } = await sb.from('feriados')
      .upsert({ data: iso, nome: nm, origem, oficial: true, ativo },
              { onConflict: 'user_id,data,origem' });
    if (error) { console.error(error); throw error; }
  }
  await _recarregarRows();
}

/** Cria um feriado do usuário na categoria escolhida (apagável) */
async function criarFeriado(iso, nome, categoria) {
  const cat = CATEGORIAS_FERIADO.includes(categoria) ? categoria : 'municipal';
  const { error } = await sb.from('feriados')
    .upsert({ data: iso, nome, origem: cat, oficial: false, ativo: true },
            { onConflict: 'user_id,data,origem' });
  if (error) { console.error(error); throw error; }
  await _recarregarRows();
}

/** Apaga um feriado — só os NÃO oficiais (criados pelo usuário) */
async function apagarFeriado(id) {
  const row = feriadosState.rows.find(r => r.id === id);
  if (!row || row.oficial) throw new Error('Feriado oficial não pode ser apagado (só desativado)');
  const { error } = await sb.from('feriados').delete().eq('id', id);
  if (error) { console.error(error); throw error; }
  await _recarregarRows();
}

// UF selecionada para os feriados estaduais (persistida no navegador)
const UFS_BR = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

function feriadosUF() {
  try { return localStorage.getItem('feriadosUF') || 'RJ'; } catch (_) { return 'RJ'; }
}
function definirFeriadosUF(uf) {
  try { localStorage.setItem('feriadosUF', uf || ''); } catch (_) {}
  // recalcula os estaduais da nova UF para a janela de anos já conhecida
  feriadosState.estadualCalc.clear();
  feriadosState.estadualUF = null;
  const anos = feriadosState.anos.length ? feriadosState.anos : [new Date().getFullYear()];
  calcularFeriadosEstaduais(Math.min(...anos), Math.max(...anos));
}

/**
 * Sincroniza com a Nager.Date (date.nager.at): adiciona os feriados NACIONAIS
 * (global) e — se houver UF selecionada — os ESTADUAIS dessa UF (counties
 * contém "BR-<UF>"), como oficiais (não apagáveis). Não remove nada.
 * Retorna quantos entraram.
 */
async function sincronizarFeriados(anos) {
  const uf = feriadosUF();
  const alvoUF = uf ? `BR-${uf}` : null;
  let adicionados = 0;
  for (const ano of anos) {
    let lista;
    try {
      const resp = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${ano}/BR`);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      lista = await resp.json();
    } catch (e) {
      throw new Error(`Falha ao consultar a Nager.Date (${ano}): ${e.message || e}`);
    }
    calcularFeriadosNacionais(ano, ano);
    calcularFeriadosEstaduais(ano, ano);
    for (const f of lista) {
      const ehNacional = f.global === true || !f.counties;
      const ehEstadual = !ehNacional && alvoUF && Array.isArray(f.counties) && f.counties.includes(alvoUF);
      if (!ehNacional && !ehEstadual) continue;
      const iso = String(f.date).slice(0, 10);
      const origem = ehNacional ? 'nacional' : 'estadual';
      const nome = f.localName || f.name;
      const jaTem = ehNacional
        ? (feriadosState.nacionalCalc.has(iso) || _rowsData(iso).some(r => r.origem === 'nacional'))
        : (feriadosState.estadualCalc.has(iso) || _rowsData(iso).some(r => r.origem === 'estadual'));
      if (jaTem) continue;
      const { error } = await sb.from('feriados')
        .upsert({ data: iso, nome, origem, oficial: true, ativo: true },
                { onConflict: 'user_id,data,origem' });
      if (!error) adicionados++;
    }
  }
  await _recarregarRows();
  return adicionados;
}

/** Feriados de uma categoria/ano para exibição: [{ id?, data, nome, ativo, oficial }] */
function feriadosView(categoria, ano) {
  const pref = String(ano) + '-';
  const out = [];
  const calc = categoria === 'nacional' ? feriadosState.nacionalCalc
    : categoria === 'estadual' ? feriadosState.estadualCalc : null;

  if (calc) {
    if (categoria === 'nacional') calcularFeriadosNacionais(ano, ano);
    else calcularFeriadosEstaduais(ano, ano);
    for (const [iso, nome] of calc) {
      if (!iso.startsWith(pref)) continue;
      const row = _rowsData(iso).find(r => r.origem === categoria);
      out.push(row
        ? { id: row.id, data: iso, nome: row.nome, ativo: row.ativo, oficial: row.oficial }
        : { id: null, data: iso, nome, ativo: true, oficial: true });
    }
    for (const r of feriadosState.rows) {
      const iso = String(r.data).slice(0, 10);
      if (r.origem === categoria && iso.startsWith(pref) && !calc.has(iso)) {
        out.push({ id: r.id, data: iso, nome: r.nome, ativo: r.ativo, oficial: r.oficial });
      }
    }
  } else {
    for (const r of feriadosState.rows) {
      const iso = String(r.data).slice(0, 10);
      if (r.origem === categoria && iso.startsWith(pref)) {
        out.push({ id: r.id, data: iso, nome: r.nome, ativo: r.ativo, oficial: r.oficial });
      }
    }
  }
  return out.sort((a, b) => a.data.localeCompare(b.data));
}

/** Quantidade de feriados ATIVOS numa categoria/ano (para o resumo dos menus) */
function feriadosContagem(categoria, ano) {
  return feriadosView(categoria, ano).filter(f => f.ativo).length;
}
