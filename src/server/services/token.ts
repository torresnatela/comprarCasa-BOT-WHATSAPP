import { createHash, randomBytes } from "node:crypto";

/** Token opaco de 256 bits, seguro para usar em URL e em cookie. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * O banco guarda só o hash: quem ler a tabela não consegue usar o token.
 * SHA-256 simples basta porque o token já tem 256 bits de entropia.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
