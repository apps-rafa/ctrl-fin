// Dia útil no servidor (a geração das ocorrências de recorrência roda aqui, não no navegador).
// Mesma regra do app (js/feriados.js + js/recorrencia.js:proximoDiaUtil):
//  - feriados nacionais calculados (fixos + móveis pela Páscoa), a menos que o usuário os tenha DESATIVADO
//    (linha em `feriados` com origem 'nacional' e ativo=false);
//  - feriados cadastrados/sincronizados na tabela `feriados` (qualquer origem) com ativo=true.
// Os estaduais "calculados" do app dependem da UF, que só existe no navegador: aqui só entram se estiverem
// gravados na tabela (Configurações > Feriados > Sincronizar).

export interface LinhaFeriado { data: string; origem: string; ativo: boolean }

const FIXOS: [number, number][] = [[1, 1], [4, 21], [5, 1], [9, 7], [10, 12], [11, 2], [11, 15], [11, 20], [12, 25]];
const MOVEIS = [-47, -2, 60]; // Carnaval, Sexta-feira Santa, Corpus Christi (dias em relação à Páscoa)

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dataUTC = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);

/** Domingo de Páscoa (Meeus/Butcher), em UTC. */
export function domingoDePascoa(ano: number): Date {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

export function feriadosNacionaisDoAno(ano: number): string[] {
  const p = domingoDePascoa(ano);
  return [
    ...FIXOS.map(([m, d]) => `${ano}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`),
    ...MOVEIS.map((o) => iso(new Date(p.getTime() + o * 86400000))),
  ];
}

/** Monta `ehFeriado(iso)` com os nacionais calculados + as linhas da tabela do usuário. */
export function criarEhFeriado(linhas: LinhaFeriado[]): (dia: string) => boolean {
  const ativos = new Set<string>(), desligados = new Set<string>();
  for (const l of linhas) {
    const d = String(l.data).slice(0, 10);
    if (l.ativo) ativos.add(d);
    else if (l.origem === "nacional") desligados.add(d);
  }
  const cache = new Map<number, Set<string>>();
  const nacionais = (ano: number) => cache.get(ano) ?? (cache.set(ano, new Set(feriadosNacionaisDoAno(ano))), cache.get(ano)!);
  return (dia: string) => {
    const s = dia.slice(0, 10);
    return ativos.has(s) || (nacionais(Number(s.slice(0, 4))).has(s) && !desligados.has(s));
  };
}

/** Primeiro dia útil >= a data (fim de semana/feriado avança; nunca volta). */
export function proximoDiaUtil(dia: string, ehFeriado: (d: string) => boolean): string {
  let d = dataUTC(dia);
  for (let i = 0; i < 20; i++) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6 && !ehFeriado(iso(d))) break;
    d = new Date(d.getTime() + 86400000);
  }
  return iso(d);
}
