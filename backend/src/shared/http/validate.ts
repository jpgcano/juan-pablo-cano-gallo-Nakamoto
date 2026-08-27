import type { z, ZodType } from 'zod';
import { ValidationError } from '../errors/AppError.js';

/**
 * Cada ruta valida su entrada con un esquema Zod propio (nunca compartido
 * con el frontend, ver DECISIONS.md D2) antes de invocar el caso de uso.
 *
 * Tipado via z.infer<S> (no ZodSchema<T>): con campos .default(...), el
 * tipo de SALIDA vuelve el campo obligatorio aunque la ENTRADA lo tenga
 * opcional. Anclar T solo por el generico externo perdia esa distincion.
 */
export function parseOrThrow<S extends ZodType>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError('Entrada invalida', result.error.flatten());
  }
  return result.data;
}
