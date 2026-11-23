import {
  type LeadQualifier,
  type QualifierInput,
  QualifierError,
  type QualifierTurn,
} from "@/server/integrations/anthropic/qualifier";

/** IA de mentira: devolve os turnos roteirizados, em ordem, e guarda o que recebeu. */
export function createFakeQualifier(script: Partial<QualifierTurn>[] = []) {
  const state = {
    script: [...script],
    calls: [] as QualifierInput[],
    failWith: null as Error | null,
  };

  const qualifier: LeadQualifier = {
    async nextTurn(input) {
      state.calls.push(input);
      if (state.failWith) throw state.failWith;
      const next = state.script.shift();
      if (!next) throw new QualifierError("Roteiro do teste acabou.");
      return {
        reply: "",
        collected: input.collected,
        done: false,
        summary: null,
        ...next,
      };
    },
  };

  return { qualifier, state };
}
