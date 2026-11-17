import { createPasswordHasher } from "@/server/services/password";

/** Hasher de custo baixo: mesma implementação, só mais rápido para os testes. */
export const fastHasher = createPasswordHasher({ N: 1024, r: 8, p: 1 });
