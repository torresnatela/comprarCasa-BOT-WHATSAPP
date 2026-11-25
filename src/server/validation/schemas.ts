import { z } from "zod";
import { DEAL_TYPES, LOST_REASONS, MESSAGE_ACCESS_LEVELS, USER_ROLES } from "../db/schema";

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

/** Acesso às mensagens; sem ele, o cadastro usa o padrão do banco. */
const messageAccess = z.enum(MESSAGE_ACCESS_LEVELS, "Selecione o acesso às mensagens.");

export const createCollaboratorSchema = z.object({
  name,
  email,
  phone,
  role,
  messageAccess: messageAccess.optional(),
});

export const updateCollaboratorSchema = z
  .object({
    name,
    email,
    phone,
    role,
    messageAccess,
    active: z.boolean("Valor inválido."),
  })
  .partial();

export const acceptInviteSchema = z.object({ password: passwordSchema });

export const idSchema = z.uuid();

export type LoginInput = z.output<typeof loginSchema>;
export type CreateCollaboratorInput = z.output<typeof createCollaboratorSchema>;
export type UpdateCollaboratorInput = z.output<typeof updateCollaboratorSchema>;

export const replySchema = z.object({
  text: z
    .string("Escreva a mensagem.")
    .trim()
    .min(1, "Escreva a mensagem.")
    .max(4000, "A mensagem deve ter no máximo 4000 caracteres."),
});

export const rotationUpdateSchema = z.object({
  inRotation: z.boolean("Valor inválido."),
});
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} deve ter no máximo ${max} caracteres.`)
    .optional()
    .transform((value) => value || null);

/** Troca de etapa. Ganho e Perdido pedem os dados do desfecho. */
export const changeStageSchema = z.discriminatedUnion(
  "stage",
  [
    z.object({ stage: z.enum(["QUALIFICANDO", "HUMANO", "PARADO"]) }),
    z.object({
      stage: z.literal("GANHO"),
      wonType: z.enum(DEAL_TYPES, "Informe se foi compra ou aluguel."),
      wonValue: z
        .number("Informe o valor.")
        .positive("Informe um valor maior que zero.")
        .max(999_999_999_999, "Valor alto demais."),
      wonConditions: optionalText(2000, "As condições"),
    }),
    z
      .object({
        stage: z.literal("PERDIDO"),
        lostReason: z.enum(LOST_REASONS, "Selecione o motivo."),
        lostNote: optionalText(2000, "A observação"),
      })
      .refine((data) => data.lostReason !== "OUTRO" || data.lostNote, {
        path: ["lostNote"],
        message: "Descreva o motivo.",
      }),
  ],
  "Etapa inválida.",
);

export const automationSchema = z.object({
  paused: z.boolean("Valor inválido."),
});

export const createTaskSchema = z.object({
  title: z
    .string("Descreva a tarefa.")
    .trim()
    .min(1, "Descreva a tarefa.")
    .max(200, "A tarefa deve ter no máximo 200 caracteres."),
  dueDate: z.iso.date("Informe a data."),
});

export const updateTaskSchema = z.object({ done: z.boolean("Valor inválido.") });

export type ChangeStageInput = z.output<typeof changeStageSchema>;
export type CreateTaskInput = z.output<typeof createTaskSchema>;
