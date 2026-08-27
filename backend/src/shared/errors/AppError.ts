/**
 * Jerarquia de errores de dominio. Cada caso de uso lanza uno de estos, y
 * el manejador de errores de Fastify (shared/http) los traduce al codigo
 * de estado correcto sin que cada ruta tenga que decidirlo por su cuenta.
 */
export abstract class AppError extends Error {
  abstract readonly httpStatus: number;
  abstract readonly code: string;

  constructor(message: string, readonly details?: unknown) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ValidationError extends AppError {
  readonly httpStatus = 400;
  readonly code = 'validation_error';
}

export class UnauthorizedError extends AppError {
  readonly httpStatus = 401;
  readonly code = 'unauthorized';
}

export class ForbiddenError extends AppError {
  readonly httpStatus = 403;
  readonly code = 'forbidden';
}

export class NotFoundError extends AppError {
  readonly httpStatus = 404;
  readonly code = 'not_found';
}

export class ConflictError extends AppError {
  readonly httpStatus = 409;
  readonly code = 'conflict';
}
