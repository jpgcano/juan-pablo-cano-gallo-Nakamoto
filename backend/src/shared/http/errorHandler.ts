import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../errors/AppError.js';
import { mapPgError } from '../errors/mapPgError.js';

interface PgLikeError {
  code?: string;
}

function hasPgCode(error: unknown): error is PgLikeError & { code: string } {
  return typeof error === 'object' && error !== null && typeof (error as PgLikeError).code === 'string';
}

function toAppError(error: unknown): AppError | undefined {
  if (error instanceof AppError) return error;
  if (hasPgCode(error)) {
    try {
      return mapPgError(error);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Un solo formato de error para toda la API, con el correlationId del
 * request incluido: es lo que conecta un error que ve el usuario con la
 * linea exacta de log que lo explica.
 */
export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply): void {
  const appError = toAppError(error);

  if (appError) {
    reply.status(appError.httpStatus).send({
      error: {
        code: appError.code,
        message: appError.message,
        details: appError.details,
        correlationId: request.correlationId,
      },
    });
    return;
  }

  // Errores de validacion propios de Fastify (schema de ruta)
  if (error.validation) {
    reply.status(400).send({
      error: {
        code: 'validation_error',
        message: 'La peticion no cumple el formato esperado',
        details: error.validation,
        correlationId: request.correlationId,
      },
    });
    return;
  }

  request.log.error({ err: error, correlationId: request.correlationId }, 'Error no controlado');
  reply.status(500).send({
    error: {
      code: 'internal_error',
      message: 'Ocurrio un error inesperado',
      correlationId: request.correlationId,
    },
  });
}
