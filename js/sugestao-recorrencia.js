/**
 * SUGESTÃO DE RECORRÊNCIA — lançamento solto (do app, do bot ou do Open Finance) que parece uma sessão de uma recorrência
 * SEMANAL (ex.: a Terapia de sexta, confirmada sem o vínculo). Todas as origens caem na mesma tabela, então a regra é uma só;
 * quem decide é o usuário (Pendências: "Vincular" / "Não é"). Vincular grava recorrencia_semanal_id, o que agrupa o lançamento.
 */

const _semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const _palavras4 = s => new Set(_semAcento(s).split(/[^a-z0-9]+/).filter(p => p.length >= 4));

/** A recorrência semanal com que o lançamento parece (ou null). Exige o mesmo tipo e o nome da recorrência (alguma palavra de 4+
 *  letras em comum), valor próximo (R$ 0,50), mesma forma de pagamento nas despesas, mesmo dia da semana (quando a recorrência tem
 *  um fixo) e data dentro do período dela. Já vinculado, ocorrência a confirmar e "não é desta recorrência" ficam de fora. */
function sugerirRecorrenciaSemanal(t, recorrencias) {
    if (!t || t.recorrenciaSemanalId || t.recorrenciaId || t.aConfirmar || t.sugestaoRecOk) return null;
    const dia = String(t.data || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
    const [a, m, d] = dia.split('-').map(Number);
    const dow = new Date(a, m - 1, d).getDay();
    const palavrasT = _palavras4(t.descricao);
    if (!palavrasT.size) return null;
    const achadas = (recorrencias || []).filter(r => {
        if (r.frequencia !== 'semanal' || r.tipo !== t.tipo) return false;
        if (dia < r.inicio || (r.encerradaEm && dia > String(r.encerradaEm).slice(0, 10))) return false;
        if (r.diaSemana !== null && r.diaSemana !== undefined && r.diaSemana !== '' && Number(r.diaSemana) !== dow) return false;
        if (Math.abs(Math.abs(Number(t.valor)) - Math.abs(Number(r.valor))) >= 0.5) return false;
        if (t.tipo === 'saidas' && r.metodo && t.metodo && r.metodo !== t.metodo) return false;
        return [..._palavras4(r.descricao)].some(p => palavrasT.has(p));
    });
    return achadas.length === 1 ? achadas[0] : null; // em dúvida (2 recorrências servem), não sugere
}
