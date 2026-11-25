/*
 * Funil do contato: etapas, desfechos e rótulos. Fica fora de `server/`
 * porque as telas também usam; o schema do banco importa daqui.
 */

/**
 * Etapas do contato, na ordem do funil:
 * - QUALIFICANDO: a IA está conversando para entender o que ele procura;
 * - AGUARDANDO_VENDEDOR: qualificado, mas não havia vendedor na fila;
 * - DISTRIBUIDO: entregue a um vendedor pelo rodízio;
 * - HUMANO: um colaborador assumiu a conversa;
 * - PARADO: esfriou (marcado à mão);
 * - GANHO / PERDIDO: fechado, com os dados do desfecho.
 */
export const LEAD_STAGES = [
  "QUALIFICANDO",
  "AGUARDANDO_VENDEDOR",
  "DISTRIBUIDO",
  "HUMANO",
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
  QUALIFICANDO: "Com a assistente",
  AGUARDANDO_VENDEDOR: "Aguardando vendedor",
  DISTRIBUIDO: "Com vendedor",
  HUMANO: "Com a equipe",
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

/**
 * Etapas que o gestor escolhe à mão. Aguardando vendedor e Com vendedor
 * dependem do rodízio e só aparecem no seletor quando já são a etapa atual.
 */
export const MANUAL_STAGES: readonly LeadStage[] = [
  "QUALIFICANDO",
  "HUMANO",
  "PARADO",
  "GANHO",
  "PERDIDO",
];

export const isClosedStage = (stage: LeadStage) => CLOSED_STAGES.includes(stage);

/**
 * A IA só conversa com o contato enquanto ele está com a assistente e
 * ninguém a pausou. A qualificação por IA consulta isto antes de responder.
 */
export function isAutomationActive(lead: {
  stage: LeadStage;
  automationPaused: boolean;
}): boolean {
  return lead.stage === "QUALIFICANDO" && !lead.automationPaused;
}
