export type FieldErrors = Record<string, string>;

/** Erro de negócio com tradução direta para uma resposta HTTP. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: FieldErrors,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(fields: FieldErrors, message = "Dados inválidos.") {
    super(400, "VALIDATION", message, fields);
  }
}

export class UnauthorizedError extends AppError {
  constructor(code = "UNAUTHENTICATED", message = "Faça login para continuar.") {
    super(401, code, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(
    code = "FORBIDDEN",
    message = "Você não tem permissão para esta ação.",
  ) {
    super(403, code, message);
  }
}

export class NotFoundError extends AppError {
  constructor(code = "NOT_FOUND", message = "Registro não encontrado.") {
    super(404, code, message);
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(409, code, message);
  }
}

/** Convite inexistente, expirado ou já utilizado. */
export class GoneError extends AppError {
  constructor(code: string, message: string) {
    super(410, code, message);
  }
}
