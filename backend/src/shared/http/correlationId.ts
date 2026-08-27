import { randomUUID } from 'node:crypto';
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';

/**
 * Cada request recibe un identificador de correlacion (propio o heredado
 * del header entrante), que viaja en la respuesta y en cada linea de log
 * de ese request. Es lo primero que se pide en el registro de un incidente.
 */
export const correlationIdPlugin = fp(async (app: FastifyInstance) => {
  app.addHook('onRequest', async (request, reply) => {
    const incoming = request.headers['x-correlation-id'];
    request.correlationId = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
    reply.header('x-correlation-id', request.correlationId);
  });
});
