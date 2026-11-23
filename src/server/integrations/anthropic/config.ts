import Anthropic from "@anthropic-ai/sdk";
import {
  createLeadQualifier,
  DEFAULT_QUALIFIER_MODEL,
  type LeadQualifier,
} from "./qualifier";

type Env = Record<string, string | undefined>;

export type AnthropicConfig = {
  /** Nulo sem ANTHROPIC_API_KEY: os leads vão direto para o rodízio, sem IA. */
  qualifier: LeadQualifier | null;
  model: string;
  missing: string[];
};

/** Lê a configuração da IA sem derrubar o app quando ela não existe. */
export function readAnthropicConfig(env: Env): AnthropicConfig {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  const model = env.ANTHROPIC_MODEL?.trim() || DEFAULT_QUALIFIER_MODEL;
  return {
    qualifier: apiKey
      ? createLeadQualifier({ client: new Anthropic({ apiKey, timeout: 30_000 }), model })
      : null,
    model,
    missing: apiKey ? [] : ["ANTHROPIC_API_KEY"],
  };
}
