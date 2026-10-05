// Resposta ÚNICA aos botões do aviso "já existe algo parecido" (ver _shared/parecidos.ts): igual para mensagem/SMS, e-mail e Pluggy.
// Cada origem só diz como carregar o que chegou e o que significa ignorar / atualizar / seguir como outro lançamento;
// os textos de resposta e a edição da mensagem são os mesmos.

import { tg } from "./util.ts";

export type AcaoParecido = "ig" | "at" | "ou";

export interface FonteParecido {
  /** Carrega o lançamento recebido; false = já foi resolvido (não faz nada). */
  carregar(): Promise<boolean>;
  /** É o mesmo: descarta/concilia o que chegou. */
  ignorar(): Promise<void>;
  /** É o mesmo e os dados novos valem: atualiza o existente; false = não conseguiu. */
  atualizar(): Promise<boolean>;
  /** É outro lançamento: segue o fluxo normal (rascunho / aviso com Confirmar). */
  outro(): Promise<void>;
}

/** "smig" / "emat" / "pgou" -> "ig" | "at" | "ou". */
export const acaoDe = (callback: string): AcaoParecido => callback.slice(-2) as AcaoParecido;

export async function responderDecisaoParecido(
  token: string, cq: { id: string; message: { message_id: number; text?: string } }, chatId: number,
  acao: AcaoParecido, fonte: FonteParecido,
): Promise<void> {
  const responder = (text: string) => tg(token, "answerCallbackQuery", { callback_query_id: cq.id, text });
  const editar = (texto: string) => tg(token, "editMessageText", { chat_id: chatId, message_id: cq.message.message_id, text: `${cq.message.text ?? ""}\n\n${texto}` });
  if (!(await fonte.carregar())) { await responder("Esse aviso já foi resolvido"); return; }
  if (acao === "ig") {
    await fonte.ignorar();
    await responder("Ignorado");
    await editar("✅ Ignorado — é o mesmo lançamento");
    return;
  }
  if (acao === "at") {
    const ok = await fonte.atualizar();
    await responder(ok ? "Atualizado" : "Não consegui atualizar");
    await editar(ok ? "🔄 Lançamento atualizado com o valor/data novos" : "⚠️ Não consegui atualizar — edite pelo app");
    return;
  }
  await responder("Ok, outro lançamento");
  await editar("➕ Ok, tratando como outro lançamento");
  await fonte.outro();
}
