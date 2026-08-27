import 'fastify';
import '@fastify/cookie';

export interface Actor {
  userId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Se fija exclusivamente en requireAuth a partir del JWT verificado. */
    actor?: Actor;
    correlationId: string;
  }
}
