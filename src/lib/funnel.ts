/**
 * Funil do contato: etapas, desfechos e rótulos. Fica fora de `server/`
 * porque as telas também usam; o schema do banco importa daqui.
 */
export const LEAD_STAGES = [
  "QUALIFICACAO",
  "EM_ANDAMENTO",
  "PARADO",
  "GANHO",
  "PERDIDO",
] as const;
export const DEAL_TYPES = ["COMPRA", "ALUGUEL"] as const;
export const LOST_REASONS = [
  "PRECO",
  "COMPROU_OUTRO",
  "DESISTIU",
  "SEM_RESPOSTA",
  "SEM_CREDITO",
  "OUTRO",
] as const;

export type LeadStage = (typeof LEAD_STAGES)[number];
export type DealType = (typeof DEAL_TYPES)[number];
export type LostReason = (typeof LOST_REASONS)[number];

export const STAGE_LABELS: Record<LeadStage, string> = {
  QUALIFICACAO: "Qualificação",
  EM_ANDAMENTO: "Em andamento",
  PARADO: "Parado",
  GANHO: "Ganho",
  PERDIDO: "Perdido",
};

export const DEAL_TYPE_LABELS: Record<DealType, string> = {
  COMPRA: "Compra",
  ALUGUEL: "Aluguel",
};

export const LOST_REASON_LABELS: Record<LostReason, string> = {
  PRECO: "Preço",
  COMPROU_OUTRO: "Comprou com outro",
  DESISTIU: "Desistiu",
  SEM_RESPOSTA: "Sem resposta",
  SEM_CREDITO: "Sem crédito",
  OUTRO: "Outro",
};

export const CLOSED_STAGES: readonly LeadStage[] = ["GANHO", "PERDIDO"];

export const isClosedStage = (stage: LeadStage) => CLOSED_STAGES.includes(stage);

/**
 * A IA só conversa com o contato na etapa de qualificação e quando ninguém a
 * pausou. É isso que a qualificação por IA deve consultar antes de responder.
 */
export function isAutomationActive(lead: {
  stage: LeadStage;
  automationPaused: boolean;
}): boolean {
  return lead.stage === "QUALIFICACAO" && !lead.automationPaused;
}
