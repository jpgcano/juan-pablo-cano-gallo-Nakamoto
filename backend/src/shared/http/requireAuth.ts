import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';

export type TokenVerifier = (token: string) => { userId: string };

/**
 * El userId del actor sale EXCLUSIVAMENTE de aqui: del token verificado.
 * Ninguna ruta lee un userId del body, del query string o de un header
 * distinto de Authorization. request.actor es lo unico que los casos de
 * uso pueden confiar.
 */
export function createRequireAuth(verify: TokenVerifier) {
  return async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Falta el token de acceso');
    }

    try {
      const { userId } = verify(header.slice('Bearer '.length));
      request.actor = { userId };
    } catch {
      throw new UnauthorizedError('Token de acceso invalido o expirado');
    }
  };
}
