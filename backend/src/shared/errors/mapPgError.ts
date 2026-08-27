import { AppError, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from './AppError.js';

interface PgErrorLike {
  code?: string;
  message?: string;
}

/**
 * Traduce los SQLSTATE que nuestras propias funciones y triggers usan
 * deliberadamente (ver database/migrations) a errores de dominio. Es el
 * unico lugar del backend que conoce estos codigos: los casos de uso solo
 * ven AppError.
 */
export function mapPgError(error: unknown): AppError {
  const pgError = error as PgErrorLike;
  const message = pgError.message ?? 'Error de base de datos';

  switch (pgError.code) {
    case '28000': // invalid_authorization_specification: rw_current_user_id() sin actor fijado
      return new UnauthorizedError('No se pudo establecer la identidad del actor');
    case '42501': // insufficient_privilege: nuestras funciones lo usan para "no es miembro" / "no es el autor"
      return new ForbiddenError(message);
    case 'P0002': // no_data_found: rw_sp_update_user / rw_sp_deactivate_user
      return new NotFoundError(message);
    case '23505': // unique_violation
      return new ConflictError(message);
    case '23503': // foreign_key_violation
    case '23514': // check_violation
      return new ValidationError(message);
    default:
      throw error;
  }
}
