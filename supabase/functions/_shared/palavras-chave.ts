// Palavras-chave por categoria (coluna menu_itens.palavras_chave, editável em Configurações > Categorias).
// Uma palavra casa quando aparece no INÍCIO de uma palavra do texto, sem diferenciar maiúsculas/acentos
// ("drogaria" casa com "Drogarias Imperial"; "posto" não casa com "imposto"). Palavras de até 3 letras
// ("luz", "gás", "hbo") só casam inteiras (o plural simples com "s" vale), pra "gás" não pegar "gastei".
// Várias categorias casando: vale a palavra mais longa (empate: a categoria que vem primeiro na lista).

export interface CategoriaComPalavras {
  nome: string;
  categoria_tipo?: string | null;
  palavras_chave?: string[] | null;
}

/** Minúsculas, sem acento, só letras/números separados por um espaço. */
export function normalizarPalavra(s: string): string {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** A palavra-chave aparece no texto (já normalizado, com um espaço antes e depois)? */
function casa(textoNorm: string, palavra: string): boolean {
  if (!palavra) return false;
  if (palavra.length <= 3) return textoNorm.includes(` ${palavra} `) || textoNorm.includes(` ${palavra}s `);
  return textoNorm.includes(` ${palavra}`);
}

/** Categoria cujas palavras-chave aparecem no texto (a palavra mais longa ganha), ou null. */
export function categoriaPorPalavraChave(
  texto: string | null | undefined,
  categorias: CategoriaComPalavras[],
): { nome: string; termo: string } | null {
  const alvo = ` ${normalizarPalavra(texto ?? "")} `;
  if (alvo.trim() === "") return null;
  let melhor: { nome: string; termo: string } | null = null;
  for (const c of categorias) {
    for (const p of c.palavras_chave ?? []) {
      const palavra = normalizarPalavra(p);
      if (casa(alvo, palavra) && (!melhor || palavra.length > melhor.termo.length)) melhor = { nome: c.nome, termo: palavra };
    }
  }
  return melhor;
}
