import { z } from "zod";
import { USER_ROLES } from "../db/schema";

const email = z
  .string("Informe o e-mail.")
  .trim()
  .toLowerCase()
  .pipe(z.email("E-mail inválido."));

export const passwordSchema = z
  .string("Informe a senha.")
  .min(8, "A senha deve ter pelo menos 8 caracteres.")
  .max(200, "A senha deve ter no máximo 200 caracteres.");

export const loginSchema = z.object({
  email,
  password: z.string("Informe a senha.").min(1, "Informe a senha."),
});

/**
 * Telefone/WhatsApp: guarda só dígitos, com DDI. Números brasileiros
 * digitados sem DDI (10 ou 11 dígitos) recebem o 55 na frente.
 */
const phone = z
  .string("Informe o telefone.")
  .transform((value) => value.replace(/\D/g, ""))
  .pipe(
    z
      .string()
      .regex(/^\d{10,13}$/, "Telefone inválido. Informe DDD e número.")
      .transform((digits) => (digits.length <= 11 ? `55${digits}` : digits)),
  );

const name = z
  .string("Informe o nome.")
  .trim()
  .min(2, "Informe o nome completo.")
  .max(120, "O nome deve ter no máximo 120 caracteres.");

const role = z.enum(USER_ROLES, "Selecione o papel.");

export const createCollaboratorSchema = z.object({ name, email, phone, role });

export const updateCollaboratorSchema = z
  .object({
    name,
    email,
    phone,
    role,
    active: z.boolean("Valor inválido."),
  })
  .partial();

export const acceptInviteSchema = z.object({ password: passwordSchema });

export const idSchema = z.uuid();

export type LoginInput = z.output<typeof loginSchema>;
export type CreateCollaboratorInput = z.output<typeof createCollaboratorSchema>;
export type UpdateCollaboratorInput = z.output<typeof updateCollaboratorSchema>;
