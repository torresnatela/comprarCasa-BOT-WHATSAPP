/**
 * Papéis e status de usuário. Ficam fora de `server/` porque as telas
 * também usam; o schema do banco importa daqui.
 */
export const USER_ROLES = ["GESTOR", "VENDEDOR"] as const;
export const USER_STATUSES = ["PENDENTE", "ATIVO", "INATIVO"] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type UserStatus = (typeof USER_STATUSES)[number];
