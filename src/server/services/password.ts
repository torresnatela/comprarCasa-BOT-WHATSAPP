import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export type ScryptCost = { N: number; r: number; p: number };

/** Parâmetros recomendados pela OWASP para scrypt (N=2^15, r=8, p=3). */
export const DEFAULT_COST: ScryptCost = { N: 2 ** 15, r: 8, p: 3 };

const SCHEME = "scrypt";
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const MAX_N = 2 ** 20;

function derive(password: string, salt: Buffer, cost: ScryptCost) {
  return new Promise<Buffer>((resolve, reject) => {
    // O scrypt usa ~128 * N * r bytes; o limite padrão do Node é justo demais.
    const maxmem = 256 * cost.N * cost.r;
    scrypt(password, salt, KEY_BYTES, { ...cost, maxmem }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

function parse(stored: string) {
  const [scheme, n, r, p, salt, key] = stored.split("$");
  const cost = { N: Number(n), r: Number(r), p: Number(p) };
  const valid =
    scheme === SCHEME &&
    Number.isInteger(cost.N) &&
    cost.N > 1 &&
    cost.N <= MAX_N &&
    (cost.N & (cost.N - 1)) === 0 &&
    Number.isInteger(cost.r) &&
    cost.r > 0 &&
    cost.r <= 32 &&
    Number.isInteger(cost.p) &&
    cost.p > 0 &&
    cost.p <= 16 &&
    Boolean(salt) &&
    Boolean(key);
  if (!valid) return null;
  return {
    cost,
    salt: Buffer.from(salt, "base64url"),
    key: Buffer.from(key, "base64url"),
  };
}

export function createPasswordHasher(cost: ScryptCost = DEFAULT_COST) {
  return {
    /** Formato: `scrypt$N$r$p$salt$hash` — os parâmetros viajam junto com o hash. */
    async hash(password: string): Promise<string> {
      const salt = randomBytes(SALT_BYTES);
      const key = await derive(password, salt, cost);
      return [
        SCHEME,
        cost.N,
        cost.r,
        cost.p,
        salt.toString("base64url"),
        key.toString("base64url"),
      ].join("$");
    },

    async verify(password: string, stored: string): Promise<boolean> {
      const parsed = parse(stored);
      if (!parsed) return false;
      const key = await derive(password, parsed.salt, parsed.cost);
      return (
        key.length === parsed.key.length && timingSafeEqual(key, parsed.key)
      );
    },
  };
}

export type PasswordHasher = ReturnType<typeof createPasswordHasher>;
