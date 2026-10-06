// Funções puras do bot do Telegram (interpretação de texto/SMS, datas, categorias).
// Ficam separadas do index.ts para poderem ser testadas em Node (ver tests/).

/** Texto preenchido sozinho (banco/SMS) sem endereço de site ("apple.com/bill" -> "Apple"): campos automáticos não levam link. */
export function limparLinks(t: string): string {
  return String(t ?? "").replace(/(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+)\.(?:com|net|org|io|app|co|me|tv|gov|edu|br)(?:\.[a-z]{2})?(?:\/\S*)?/gi, (_m, nome: string) => nome.charAt(0).toUpperCase() + nome.slice(1));
}

// ---------- Linguagem natural: "gastei 35,90 no mercado" vira um rascunho de
// lançamento (mesma ideia da fila de revisão — nada é gravado sem um toque
// em "✅ Confirmar"). Fase 2 prometida no comentário antigo aqui embaixo. ----------

// Mesma heurística por palavra-chave do pluggy-sync/pluggy-webhook, duplicada
// aqui só pra também sugerir categoria a partir do texto digitado no bot.
export const PALAVRAS_CHAVE_CATEGORIA: { padrao: RegExp; categoria: string }[] = [
  { padrao: /drogaria|farm[aá]cia|droga ?raia|pacheco|pague ?menos|rem[eé]dio/, categoria: "Saúde" },
  { padrao: /hospital|cl[ií]nica|laborat[oó]rio|dentista|odont|m[eé]dico|consulta/, categoria: "Saúde" },
  { padrao: /academia|smart ?fit|bodytech|bio ?ritmo/, categoria: "Saúde" },
  { padrao: /supermercado|hortifruti|atacad[ãa]o|carrefour|extra|p[ãa]o de a[çc][uú]car|assa[íi]|mercado|feira/, categoria: "Mercado" },
  { padrao: /restaurante|lanchonete|padaria|pizzaria|churrascaria|almo[çc]o|janta|comida/, categoria: "Alimentação" },
  { padrao: /ifood|rappi|mcdonalds|burger king|habib|subway/, categoria: "Alimentação" },
  { padrao: /uber|99app|99pop|t[áa]xi|[oô]nibus|metr[oô]/, categoria: "Transporte" },
  { padrao: /posto|ipiranga|shell|petrobras|ale combust|gasolina/, categoria: "Transporte" },
  { padrao: /estacionamento|zona azul/, categoria: "Transporte" },
  { padrao: /netflix|spotify|disney|amazon prime|hbo|paramount|assinatura/, categoria: "Assinaturas" },
  { padrao: /cinema|cinemark|teatro|show|festa|balada/, categoria: "Lazer" },
  { padrao: /escola|faculdade|universidade|udemy|alura|curso/, categoria: "Educação" },
  { padrao: /condom[ií]nio|imobili[aá]ria|aluguel|luz|[aá]gua|g[aá]s\b|internet\b/, categoria: "Casa" },
  { padrao: /sal[aá]rio|sal[aá]rios/, categoria: "Salário" },
  { padrao: /\bvend(i|eu|emos|eram|er|a|as)\b|revend/, categoria: "Venda" },
  { padrao: /\bb[oô]nus\b|\bpremia[çc][aã]o\b/, categoria: "Bônus" },
  { padrao: /\bfreela|\bfreelance\b/, categoria: "Freelance" },
  { padrao: /\bracha|\brachei|\bracharam|\bdividi|\bdividiram/, categoria: "Racha" },
  { padrao: /estorn/, categoria: "Estorno" },
  { padrao: /reembols/, categoria: "Reembolso" },
];

export function sugerirCategoriaPorPalavraChave(texto: string): string | null {
  const alvo = texto.toLowerCase();
  const achado = PALAVRAS_CHAVE_CATEGORIA.find((p) => p.padrao.test(alvo));
  return achado ? achado.categoria : null;
}

/** Palavras do texto sem acento/pontuação, em minúsculas ("Saúde e Bem-estar" -> ["saude","e","bem","estar"]). */
export function palavrasNormalizadas(s: string): string[] {
  return normalizarTexto(s).split(/[^a-z0-9]+/).filter(Boolean);
}

/** Categoria CADASTRADA citada no texto: compara o nome COMPLETO (inclusive composto, como "Saúde e
 *  Bem-estar"), sem maiúsculas/acentos/pontuação, e escolhe sempre a mais específica (a de mais palavras;
 *  empate: a de nome mais longo). Devolve também as palavras do nome, pra não virarem descrição. */
export function categoriaCadastradaNoTexto(
  texto: string,
  categorias: { nome: string }[],
): { nome: string; palavras: string[] } | null {
  const txt = palavrasNormalizadas(texto);
  const ordenadas = categorias
    .map((c) => ({ nome: c.nome, palavras: palavrasNormalizadas(c.nome) }))
    .filter((c) => c.palavras.length)
    .sort((x, y) => y.palavras.length - x.palavras.length || y.nome.length - x.nome.length);
  for (const c of ordenadas) {
    for (let i = 0; i + c.palavras.length <= txt.length; i++) {
      if (c.palavras.every((p, k) => txt[i + k] === p)) return c;
    }
  }
  return null;
}

/** Categoria pro rascunho: (1) nome de categoria do próprio usuário que apareça no texto (a mais
 *  específica, composta ou não); (2) palavra-chave; (3) "Outros"/1ª categoria do tipo, só pra nunca deixar
 *  o campo (obrigatório) vazio. `palavras` = palavras do texto que formam o NOME da categoria (saem da
 *  descrição); com palavra-chave ou fallback fica vazio (a palavra continua na descrição). */
export function sugerirCategoriaTexto(
  texto: string,
  tipo: "entradas" | "saidas",
  categoriasApp: { nome: string; categoria_tipo: string | null }[],
): { nome: string; termo: string | null; palavras: string[]; porNome: boolean } {
  const candidatas = categoriasApp.filter((c) => c.categoria_tipo === tipo);
  const porNome = categoriaCadastradaNoTexto(texto, candidatas);
  if (porNome) return { nome: porNome.nome, termo: porNome.nome, palavras: porNome.palavras, porNome: true };

  const alvo = texto.toLowerCase();
  const porPalavraChave = sugerirCategoriaPorPalavraChave(texto);
  if (porPalavraChave) {
    const achada = candidatas.find((c) => normalizarTexto(c.nome) === normalizarTexto(porPalavraChave));
    if (achada) {
      const padrao = PALAVRAS_CHAVE_CATEGORIA.find((p) => p.padrao.test(alvo))!.padrao;
      return { nome: achada.nome, termo: alvo.match(padrao)?.[0] ?? null, palavras: [], porNome: false };
    }
  }

  const outros = candidatas.find((c) => normalizarTexto(c.nome) === "outros");
  return { nome: outros?.nome || candidatas[0]?.nome || "Outros", termo: null, palavras: [], porNome: false };
}

const CONECTIVOS_DESCRICAO = new Set(["foi", "era", "no", "na", "nos", "nas", "de", "do", "da", "dos", "das", "em", "pra", "para", "por", "com", "e", "a", "o", "um", "uma", "pelo", "pela"]);
const PALAVRAS_FORMA_DESCRICAO = new Set(["pix", "credito", "cartao", "debito", "dinheiro"]);

/** Descrição = o que sobra do texto (já sem valor/tipo/data/parcelas) depois de tirar a forma de pagamento
 *  e as palavras da categoria reconhecida; conectivos soltos nas pontas ("no", "de"...) também saem. */
export function montarDescricao(
  resto: string,
  opcoes: { palavrasCategoria?: string[]; metodo?: { nome: string; banco: string | null } | null } = {},
): string {
  const fora = new Set([...(opcoes.palavrasCategoria ?? [])]);
  const forma = new Set(PALAVRAS_FORMA_DESCRICAO);
  if (opcoes.metodo) [...palavrasNormalizadas(opcoes.metodo.banco ?? ""), ...palavrasNormalizadas(opcoes.metodo.nome)].forEach((p) => forma.add(p));
  const toks = resto.split(/\s+/).filter(Boolean).filter((t) => {
    const ps = palavrasNormalizadas(t);
    return !(ps.length && ps.every((p) => fora.has(p) || forma.has(p)));
  });
  const solto = (t: string) => { const ps = palavrasNormalizadas(t); return !ps.length || ps.every((p) => CONECTIVOS_DESCRICAO.has(p)); };
  while (toks.length && solto(toks[0])) toks.shift();
  while (toks.length && solto(toks[toks.length - 1])) toks.pop();
  const d = toks.join(" ").trim();
  return d ? d.charAt(0).toUpperCase() + d.slice(1) : "";
}

export function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface RascunhoLancamento {
  tipo: "entradas" | "saidas";
  valor: number;
  descricao: string;
  categoria: string;
  metodo: string | null;
  metodoKind: string | null;
  diaFechamento: number | null;
  data: string;
  /** Compra parcelada no crédito: nº de parcelas (valor = total da compra). */
  parcelas?: number | null;
  /** Mês da fatura ('YYYY-MM-01') escolhido no mini app; sem ele vale data + fechamento. */
  competencia?: string | null;
  /** De onde veio a forma de pagamento: dita no texto, ou o padrão do /pgtopadrao. */
  metodoOrigem?: "texto" | "padrao" | null;
  /** Rascunho de uma OCORRÊNCIA de recorrência (transacoes.id, a_confirmar): confirmar ATUALIZA essa linha em vez de inserir outra. */
  ocorrenciaId?: number | null;
  /** Lançamentos parecidos achados antes de montar o rascunho (ids): o aviso pergunta se é o mesmo. */
  similares?: number[];
  /** "sem data": só o mês é conhecido (a data fica no fim do mês, marcada como indefinida, e o checkbox Pago/Recebido fica sempre visível). */
  dataIndefinida?: boolean;
}

export type MetodoMenu = { nome: string; metodo_kind: string | null; banco: string | null; dia_fechamento: number | null };

export function normalizarTexto(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Palavras que indicam o TIPO da forma de pagamento (texto já sem acento)
export const PALAVRAS_FORMA: { padrao: RegExp; kinds: string[] }[] = [
  { padrao: /\bpix\b/, kinds: ["PIX", "PIX/Débito"] },
  { padrao: /\b(credito|cartao)\b/, kinds: ["Crédito"] },
  { padrao: /\bdebito\b/, kinds: ["PIX/Débito", "PIX"] },
  { padrao: /\bdinheiro\b/, kinds: ["Dinheiro"] },
];

/** Forma de pagamento citada no texto ("no pix", "no crédito", "no nubank", "crédito nubank").
 *  Considera só as formas ATIVAS passadas em `lista`; null se o texto não cita nenhuma. */
export function detectarMetodoNoTexto(texto: string, lista: MetodoMenu[]): MetodoMenu | null {
  const t = normalizarTexto(texto);
  const kinds = new Set<string>();
  for (const p of PALAVRAS_FORMA) if (p.padrao.test(t)) p.kinds.forEach((k) => kinds.add(k));
  const citado = (x: string | null) => !!x && new RegExp("(^|[^a-z0-9])" + escaparRegex(normalizarTexto(x)) + "([^a-z0-9]|$)").test(t);
  const candidatos = kinds.size ? lista.filter((m) => m.metodo_kind && kinds.has(m.metodo_kind)) : lista;
  const comBanco = candidatos.filter((m) => citado(m.banco));
  if (comBanco.length) return comBanco[0];
  if (kinds.size) return candidatos[0] ?? null; // só o tipo: primeira forma desse tipo
  return lista.find((m) => citado(m.nome)) ?? null;
}

/** 'YYYY-MM-DD' de hoje em horário de Brasília (sem lib de timezone —
 *  Brasil não observa horário de verão desde 2019, então UTC-3 fixo). */
export function hojeBrasiliaISO(agora: Date = new Date()): string {
  return new Date(agora.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export const MESES_EXTENSO = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function somarDiasISO(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Acha uma data escrita no texto — "hoje", "ontem", "anteontem", "25/09", "25/09/2026", "25 de setembro",
 *  "dia 25" — e devolve o texto sem ela. Sem ano, vale o ano corrente (ou o anterior se ficaria muito no futuro). */
export function extrairData(texto: string, hoje = hojeBrasiliaISO()): { data: string | null; resto: string } {
  const limpar = (trecho: string) => texto.replace(trecho, " ").replace(/\s+/g, " ").trim();
  const montar = (dia: number, mes: number, ano: number | null): string | null => {
    if (mes < 1 || mes > 12 || dia < 1) return null;
    let a = ano ?? Number(hoje.slice(0, 4));
    if (ano !== null && ano < 100) a = 2000 + ano;
    if (dia > new Date(Date.UTC(a, mes, 0)).getUTCDate()) return null;
    let iso = `${a}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    if (ano === null && iso > somarDiasISO(hoje, 45)) iso = `${a - 1}${iso.slice(4)}`;
    return iso;
  };
  let m: RegExpMatchArray | null;
  if ((m = texto.match(/(?<![\p{L}])semana\s+passada(?![\p{L}])/iu)) || (m = texto.match(/(?<![\p{L}])h[aá]\s+(?:uma|1)\s+semana(?![\p{L}])/iu))) return { data: somarDiasISO(hoje, -7), resto: limpar(m[0]) };
  if ((m = texto.match(/(?<![\p{L}])semana\s+retrasada(?![\p{L}])/iu))) return { data: somarDiasISO(hoje, -14), resto: limpar(m[0]) };
  if ((m = texto.match(/(?<![\p{L}])m[eê]s\s+passado(?![\p{L}])/iu))) {
    const [ay, am, ad] = hoje.split("-").map(Number);
    const mes = am === 1 ? 12 : am - 1, ano = am === 1 ? ay - 1 : ay;
    const dia = Math.min(ad, new Date(Date.UTC(ano, mes, 0)).getUTCDate());
    return { data: `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`, resto: limpar(m[0]) };
  }
  if ((m = texto.match(/(?<![\p{L}])h[aá]\s+(\d{1,2})\s+dias?(?![\p{L}])/iu))) return { data: somarDiasISO(hoje, -Number(m[1])), resto: limpar(m[0]) };
  if ((m = texto.match(/(?<![\p{L}])anteontem(?![\p{L}])/iu))) return { data: somarDiasISO(hoje, -2), resto: limpar(m[0]) };
  if ((m = texto.match(/(?<![\p{L}])ontem(?![\p{L}])/iu))) return { data: somarDiasISO(hoje, -1), resto: limpar(m[0]) };
  if ((m = texto.match(/(?<![\p{L}])hoje(?![\p{L}])/iu))) return { data: hoje, resto: limpar(m[0]) };
  if ((m = texto.match(/(?<![\d\/.,-])(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{4}|\d{2}))?(?![\d\/.,-])/))) {
    const iso = montar(Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : null);
    if (iso) return { data: iso, resto: limpar(m[0]) };
  }
  const mesesRx = MESES_EXTENSO.map((x) => (x === "marco" ? "mar[cç]o" : x)).join("|");
  if ((m = texto.match(new RegExp("(?<![\\d\\p{L}])(\\d{1,2})\\s+de\\s+(" + mesesRx + ")(?:\\s+de\\s+(\\d{4}))?(?![\\p{L}])", "iu")))) {
    const mes = MESES_EXTENSO.indexOf(m[2].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()) + 1;
    const iso = montar(Number(m[1]), mes, m[3] ? Number(m[3]) : null);
    if (iso) return { data: iso, resto: limpar(m[0]) };
  }
  if ((m = texto.match(/(?<![\p{L}])dia\s+(\d{1,2})(?![\d\/,.-])/iu))) {
    const dia = Number(m[1]);
    const [ay, am, ad] = hoje.split("-").map(Number);
    const iso = dia <= ad ? montar(dia, am, ay) : montar(dia, am === 1 ? 12 : am - 1, am === 1 ? ay - 1 : ay);
    if (iso) return { data: iso, resto: limpar(m[0]) };
  }
  return { data: null, resto: texto };
}

// Verbos (qualquer tempo: "vender", "vendi", "vendeu"...) que indicam ENTRADA de
// dinheiro — só o radical, o resto da palavra é aceito. Os com lookahead só
// valem em formas que não colidem com outras palavras (ex.: "entrada" de um
// carro é despesa, "entrou" é receita).
export const VERBOS_RECEITA = /(?<![\p{L}])(?:receb|ganh|vend|rach|divid|reembols|devolv|devolu|deposit|lucr|fatur|resgat|arrecad|sal[aá]rio|freela|b[oô]nus|comiss[aã]o|cobr(?=ei|ou|ar|amos)|rend(?=er|eu|i(?![\p{L}])|endo)|entr(?=ou|ar|aram)|cai(?=u|r|ram)|sobr(?=ou|ar)|me pag(?=ou|aram))[\p{L}]*/giu;
export const VERBOS_DESPESA = /(?<![\p{L}])(?:gast|compre|compra(?:r|mos|ram|ndo|do|va)|pagu|pagar|pagamento)[\p{L}]*/giu;

/** Interpreta uma mensagem de texto livre como um lançamento — "gastei
 *  35,90 no mercado", "recebi 200 de salário", "comprei um carro de 80000
 *  parcelado em 10x". Precisa achar um valor em dinheiro no texto; sem isso,
 *  não é um lançamento (retorna null e o bot cai no "não entendi"). O valor
 *  é sempre o TOTAL da compra; "parcelas" só vem preenchido em "10x"/"em 10
 *  vezes"/"10 parcelas". */
export type LancamentoDetectado = {
  valor: number;
  tipo: "entradas" | "saidas";
  resto: string;
  parcelas: number | null;
  data: string | null;
  /** Só preenchido pelo parser de SMS de cartão — nome do estabelecimento,
   *  sem a ambiguidade do texto livre digitado pelo usuário. */
  estabelecimento?: string | null;
};

export function interpretarValorETipo(texto: string): LancamentoDetectado | null {
  const dt = extrairData(texto);
  let corpo = dt.resto;
  let parcelas: number | null = null;
  const mp = corpo.match(/(?:parcelad[oa]s?\s+)?(?:em\s+)?(\d{1,2})\s*(?:x|vezes|parcelas?)(?![\p{L}])/iu);
  if (mp) {
    const n = parseInt(mp[1], 10);
    if (n >= 2 && n <= 48) { parcelas = n; corpo = corpo.replace(mp[0], " "); }
  }
  corpo = corpo.replace(/(?<![\p{L}])parcelad[oa]s?(?![\p{L}])|(?<![\p{L}])parcelei(?![\p{L}])/giu, " ");

  const m = corpo.match(/\d+(?:\.\d{3})*(?:[.,]\d{1,2})?/);
  if (!m) return null;
  const bruto = m[0];
  const normal = bruto.includes(",") ? bruto.replace(/\./g, "").replace(",", ".")
    : /^\d+\.\d{1,2}$/.test(bruto) ? bruto : bruto.replace(/\./g, "");
  const valor = parseFloat(normal);
  if (!isFinite(valor) || valor <= 0) return null;

  // (cópias sem a flag "g": .test() num regex global guarda estado entre chamadas)
  const ehReceita = new RegExp(VERBOS_RECEITA.source, "iu").test(texto) && !new RegExp(VERBOS_DESPESA.source, "iu").test(texto);
  const tipo: "entradas" | "saidas" = ehReceita ? "entradas" : "saidas";
  const resto = (corpo.slice(0, m.index) + " " + corpo.slice((m.index ?? 0) + bruto.length))
    .replace(/(?<![\p{L}])(?:r\$|reais?|conto|pila)(?![\p{L}])/giu, " ")
    .replace(VERBOS_RECEITA, " ")
    .replace(VERBOS_DESPESA, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { valor, tipo, resto, parcelas, data: dt.data };
}

/** SMS de "compra aprovada" no cartão (Bradesco e bancos com o mesmo
 *  formato) encaminhado pro bot — ex.: "BRADESCO CARTOES: COMPRA APROVADA
 *  NO CARTAO FINAL 1525 EM 26/09/2026 15:30. VALOR DE R$ 175,05 ASSAI
 *  ATACADISTA         RIO DE JANEI." ou, em compras de app/online, com um
 *  código de canal antes do nome real (marcado com "*"): "DL          *UBER
 *  RIDES   SAO PAULO." Formato fixo o bastante pra extrair valor/data/
 *  estabelecimento direto, sem a heurística de linguagem natural do
 *  interpretarValorETipo (que é quem trata o texto se isto não bater). */
export function interpretarSmsCartao(texto: string): LancamentoDetectado | null {
  const m = texto.match(
    /CART[AÃ]O\s+FINAL\s*\d{3,4}[\s\S]*?EM\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+\d{1,2}:\d{2}[\s\S]*?VALOR\s+DE\s+R\$\s*([\d.,]+)\s+([\s\S]+?)\.?\s*$/i,
  );
  if (!m) return null;
  const [, diaS, mesS, anoS, valorS, estabRaw] = m;
  const dia = Number(diaS), mes = Number(mesS), ano = Number(anoS);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const valor = parseFloat(valorS.includes(",") ? valorS.replace(/\./g, "").replace(",", ".") : valorS);
  if (!isFinite(valor) || valor <= 0) return null;
  // Campos (código de canal / nome / cidade) vêm separados por 2+ espaços.
  // Compra online costuma prefixar o nome real com "*" (ex.: "DL *UBER RIDES
  // SAO PAULO") — nesse caso o nome é esse segmento (sem o "*"), não o
  // código antes dele; sem "*" (loja física), o primeiro segmento já é o
  // nome ("ASSAI ATACADISTA RIO DE JANEI").
  const segmentos = estabRaw.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
  const comAsterisco = segmentos.find((s) => s.startsWith("*"));
  const estabelecimento = (comAsterisco ? comAsterisco.slice(1) : segmentos[0])?.replace(/\s+/g, " ").trim();
  if (!estabelecimento) return null;
  return {
    valor, tipo: "saidas", parcelas: null,
    data: `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`,
    resto: estabelecimento, estabelecimento,
  };
}

/** Mesma regra do app (js/recorrencia.js:competenciaDe). */
export function competenciaDe(dataISO: string, diaFechamento: number | null): string {
  const [ano0, mes0, dia0] = dataISO.split("-").map(Number);
  let ano = ano0, mes = mes0 - 1; // 0-11
  if (diaFechamento && dia0 >= diaFechamento) {
    mes += 1;
    if (mes > 11) { mes = 0; ano += 1; }
  }
  return `${ano}-${String(mes + 1).padStart(2, "0")}-01`;
}

/** Soma `n` meses a uma data ISO (dia limitado ao último do mês) — igual ao
 *  addMeses do app (js/recorrencia.js). */
export function addMeses(dataISO: string, n: number): string {
  const [ano0, mes0, dia0] = dataISO.split("-").map(Number);
  const total = mes0 - 1 + n;
  const ano = ano0 + Math.floor(total / 12);
  const mes = ((total % 12) + 12) % 12;
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(Math.min(dia0, ultimo)).padStart(2, "0")}`;
}

/** Mesmo rótulo de forma de pagamento do app (js/menus-api.js:rotuloMetodo). */
function rotuloMetodoParser(m: MetodoMenu): string {
  if (!m.metodo_kind || m.metodo_kind === "Dinheiro") return m.nome;
  return m.banco ? `${m.metodo_kind} ${m.banco}` : m.metodo_kind;
}

/** Resposta (reply) a um rascunho. O texto pode trazer, em qualquer combinação: o tipo ("receita"/"despesa"),
 *  uma data ("ontem", "semana passada", "25/09"...), parcelas ("parcelado em 5", "5x", "à vista"), uma categoria
 *  cadastrada, uma forma de pagamento e um novo valor — cada um troca o campo correspondente. O que sobrar vira
 *  a descrição; sem nada reconhecido, o texto inteiro é a descrição. Citou só campos e nada mais: a descrição
 *  atual fica. */
export function aplicarRespostaAoRascunho(
  r: RascunhoLancamento,
  texto: string,
  categorias: { nome: string; categoria_tipo: string | null }[],
  metodos: MetodoMenu[],
  hoje = hojeBrasiliaISO(),
): RascunhoLancamento {
  const limpo = texto.replace(/\s+/g, " ").trim().slice(0, 200);
  const novo: RascunhoLancamento = { ...r };
  let t = limpo;
  let achouAlgo = false;

  // data
  const dt = extrairData(t, hoje);
  if (dt.data) { novo.data = dt.data; novo.competencia = null; t = dt.resto; achouAlgo = true; }

  // parcelas ("parcelado em 5", "5x", "em 5 vezes", "5 parcelas"; "à vista"/"1x" limpa)
  let parcelas: number | null | undefined;
  const mp = t.match(/(?:parcelad[oa]s?\s+)?(?:em\s+)?(\d{1,2})\s*(?:x|vezes|parcelas?)(?![\p{L}])/iu) || t.match(/parcelad[oa]s?\s+(?:em\s+)?(\d{1,2})(?![\d\p{L}])/iu);
  if (mp) {
    const n = parseInt(mp[1], 10);
    if (n >= 1 && n <= 48) { parcelas = n >= 2 ? n : null; t = t.replace(mp[0], " "); achouAlgo = true; }
  }
  const av = t.match(/(?<![\p{L}])[àa]\s+vista(?![\p{L}])/iu);
  if (av) { parcelas = null; t = t.replace(av[0], " "); achouAlgo = true; }
  t = t.replace(/(?<![\p{L}])parcelad[oa]s?(?![\p{L}])/giu, " ");

  // tipo
  let tipo = r.tipo;
  const tr = t.match(/(?<![\p{L}])(receita|entrada)(?![\p{L}])/iu);
  const td = t.match(/(?<![\p{L}])(despesa|sa[ií]da|gasto)(?![\p{L}])/iu);
  if (tr && !td && !categorias.some((c) => normalizarTexto(c.nome) === normalizarTexto(tr[1]))) { tipo = "entradas"; t = t.replace(tr[0], " "); achouAlgo = true; }
  else if (td && !tr && !categorias.some((c) => normalizarTexto(c.nome) === normalizarTexto(td[1]))) { tipo = "saidas"; t = t.replace(td[0], " "); achouAlgo = true; }
  novo.tipo = tipo;

  // categoria / forma de pagamento
  const cat = categoriaCadastradaNoTexto(t, categorias.filter((c) => c.categoria_tipo === tipo));
  const met = tipo === "saidas" ? detectarMetodoNoTexto(t, metodos) : null;
  if (cat) { novo.categoria = cat.nome; achouAlgo = true; }
  else if (tipo !== r.tipo) novo.categoria = sugerirCategoriaTexto(t, tipo, categorias).nome; // a antiga não existe no outro tipo
  if (tipo === "entradas") {
    novo.metodo = null; novo.metodoKind = null; novo.diaFechamento = null; novo.metodoOrigem = null; novo.parcelas = null; novo.competencia = null;
  } else {
    let escolhida: MetodoMenu | null = met;
    if (!escolhida && !novo.metodo) escolhida = metodos.find((m) => m.metodo_kind === "PIX") ?? metodos[0] ?? null; // veio de receita
    if (escolhida) {
      novo.metodo = rotuloMetodoParser(escolhida); novo.metodoKind = escolhida.metodo_kind; novo.diaFechamento = escolhida.dia_fechamento;
      novo.metodoOrigem = met ? "texto" : novo.metodoOrigem; novo.competencia = null;
      if (met) achouAlgo = true;
    }
    if (parcelas !== undefined) novo.parcelas = parcelas;
    if (novo.metodoKind !== "Crédito") novo.parcelas = null; // parcelado só existe no crédito
  }
  if (novo.tipo !== r.tipo) achouAlgo = true;

  // valor: número solto no que sobrou (com R$/vírgula, ou sozinho na resposta)
  let desc = montarDescricao(t, { palavrasCategoria: cat?.palavras, metodo: met });
  const mv = desc.match(/(?:r\$\s*)?\d+(?:\.\d{3})*(?:[.,]\d{1,2})?(?:\s*(?:reais|conto|pila)(?![\p{L}]))?/iu);
  if (mv) {
    const bruto = (mv[0].match(/\d+(?:\.\d{3})*(?:[.,]\d{1,2})?/) as RegExpMatchArray)[0];
    const sobra = (desc.slice(0, mv.index) + " " + desc.slice((mv.index ?? 0) + mv[0].length)).replace(/\s+/g, " ").trim();
    const claro = /r\$|reais|conto|pila/i.test(mv[0]) || /[.,]\d{1,2}$/.test(bruto) || !sobra;
    const normal = bruto.includes(",") ? bruto.replace(/\./g, "").replace(",", ".")
      : /^\d+\.\d{1,2}$/.test(bruto) ? bruto : bruto.replace(/\./g, "");
    const valor = parseFloat(normal);
    if (claro && isFinite(valor) && valor > 0) { novo.valor = valor; desc = montarDescricao(sobra); achouAlgo = true; }
  }

  if (!achouAlgo) return { ...r, descricao: limpo.charAt(0).toUpperCase() + limpo.slice(1) };
  if (desc) novo.descricao = desc;
  return novo;
}
