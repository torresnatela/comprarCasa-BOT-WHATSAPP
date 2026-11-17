import type { z } from "zod";
import { AppError, type FieldErrors, ForbiddenError, ValidationError } from "./errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

/**
 * O Next sinaliza redirecionamentos e interrupções de pré-renderização com
 * erros que carregam `digest`. Eles não são falhas e precisam seguir adiante.
 */
function isFrameworkSignal(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { digest?: unknown }).digest === "string"
  );
}

function errorResponse(error: unknown): Response {
  if (isFrameworkSignal(error)) throw error;
  if (error instanceof AppError) {
    return json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.fields && { fields: error.fields }),
        },
      },
      { status: error.status },
    );
  }
  console.error(error);
  return json(
    { error: { code: "INTERNAL", message: "Erro interno. Tente novamente." } },
    { status: 500 },
  );
}

/**
 * Bloqueia requisições de escrita disparadas por outro site (CSRF).
 * Navegadores sempre enviam Origin nesses casos; clientes sem Origin
 * (curl, servidor a servidor) não carregam o cookie da vítima.
 */
function assertSameOrigin(request: Request): void {
  if (SAFE_METHODS.has(request.method)) return;
  const origin = request.headers.get("origin");
  if (!origin) return;
  const expectedHost = request.headers.get("host") ?? new URL(request.url).host;
  if (URL.parse(origin)?.host !== expectedHost) {
    throw new ForbiddenError("CROSS_ORIGIN", "Origem da requisição não permitida.");
  }
}

/** Envolve uma ação de controller: checa a origem e converte erros em JSON. */
export function handle<Args extends unknown[]>(
  action: (request: Request, ...args: Args) => Promise<Response>,
) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    try {
      assertSameOrigin(request);
      return await action(request, ...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

function fieldErrors(error: z.ZodError): FieldErrors {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "_");
    fields[field] ??= issue.message;
  }
  return fields;
}

export function validate<Schema extends z.ZodType>(
  schema: Schema,
  data: unknown,
): z.output<Schema> {
  const result = schema.safeParse(data);
  if (!result.success) throw new ValidationError(fieldErrors(result.error));
  return result.data;
}

/** Lê e valida o corpo JSON da requisição. */
export async function parseBody<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
): Promise<z.output<Schema>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new AppError(400, "INVALID_JSON", "Corpo da requisição inválido.");
  }
  return validate(schema, raw);
}
